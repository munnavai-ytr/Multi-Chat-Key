/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './db';
import { AMsg } from './stream';
import { ToolDef } from './tools';

export interface RateLimit {
  tpm?: number;
  rpm?: number;
  manualTpm?: number;
  manualRpm?: number;
}

interface WindowEntry {
  t: number;
  tokens: number;
}

const slidingWindows = new Map<string, WindowEntry[]>();

export function estimateTokens(messages: AMsg[], tools?: ToolDef[]): number {
  let len = 0;
  for (const m of messages) {
    len += (m.content || '').length;
    if (m.parts) {
      for (const p of m.parts) {
        if (p.kind === 'text') len += (p.text || '').length;
      }
    }
  }
  if (tools && tools.length > 0) {
    len += JSON.stringify(tools).length;
  }
  return Math.ceil(len / 3.2);
}

export function getSlidingWindowStats(keyId: string, model: string): { tokensInWindow: number; requestsInWindow: number } {
  const windowKey = `${keyId}:${model}`;
  const now = Date.now();
  let entries = slidingWindows.get(windowKey) || [];
  entries = entries.filter((e) => now - e.t < 60000);
  slidingWindows.set(windowKey, entries);

  const tokensInWindow = entries.reduce((sum, e) => sum + e.tokens, 0);
  const requestsInWindow = entries.length;
  return { tokensInWindow, requestsInWindow };
}

export async function* throttle(
  keyId: string,
  model: string,
  messages: AMsg[],
  tools?: ToolDef[],
  signal?: AbortSignal
): AsyncGenerator<{ type: 'wait'; seconds: number; reason: string; attempt: number }> {
  try {
    const govEnabled = (await db.meta.get('governorEnabled'))?.value;
    if (govEnabled === false) return;

    const limitRow = await db.meta.get(`limits:${keyId}:${model}`);
    const limit = (limitRow?.value || {}) as RateLimit;

    const effectiveTpm = limit.manualTpm || limit.tpm;
    const effectiveRpm = limit.manualRpm || limit.rpm;

    if (!effectiveTpm && !effectiveRpm) return;

    const estTokens = estimateTokens(messages, tools);
    const windowKey = `${keyId}:${model}`;

    while (true) {
      if (signal?.aborted) throw new Error('Aborted');

      const now = Date.now();
      let entries = slidingWindows.get(windowKey) || [];
      entries = entries.filter((e) => now - e.t < 60000);
      slidingWindows.set(windowKey, entries);

      const currentTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
      const currentReqs = entries.length;

      const tpmExceeded = effectiveTpm ? currentTokens + estTokens > effectiveTpm : false;
      const rpmExceeded = effectiveRpm ? currentReqs + 1 > effectiveRpm : false;

      if (!tpmExceeded && !rpmExceeded) {
        entries.push({ t: now, tokens: estTokens });
        slidingWindows.set(windowKey, entries);
        return;
      }

      const oldest = entries[0];
      const waitMs = oldest ? Math.max(500, oldest.t + 60000 - now + 100) : 1000;
      const waitSec = Math.ceil(waitMs / 1000);

      yield {
        type: 'wait',
        seconds: waitSec,
        reason: 'Pacing to stay under the rate limit',
        attempt: 1,
      };

      await new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error('Aborted'));
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve(null);
        }, Math.min(waitMs, 500));
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error('Aborted'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  } catch {
    // Pass through if governor check encounters an issue
  }
}

export async function onRateLimited(keyId: string, model: string) {
  try {
    const { tokensInWindow, requestsInWindow } = getSlidingWindowStats(keyId, model);

    const learnedTpm = Math.max(15000, Math.floor(0.8 * tokensInWindow));
    const learnedRpm = Math.max(2, Math.floor(0.8 * requestsInWindow));

    const metaKey = `limits:${keyId}:${model}`;
    const row = await db.meta.get(metaKey);
    const existing = (row?.value || {}) as RateLimit;

    const newTpm = existing.tpm ? Math.floor(0.7 * existing.tpm + 0.3 * learnedTpm) : learnedTpm;
    const newRpm = existing.rpm ? Math.floor(0.7 * existing.rpm + 0.3 * learnedRpm) : learnedRpm;

    await db.meta.put({
      key: metaKey,
      value: {
        ...existing,
        tpm: newTpm,
        rpm: newRpm,
      },
    });
  } catch {}
}

export async function resetLimits(keyId?: string, model?: string) {
  if (keyId && model) {
    slidingWindows.delete(`${keyId}:${model}`);
    await db.meta.delete(`limits:${keyId}:${model}`);
  } else {
    slidingWindows.clear();
  }
}
