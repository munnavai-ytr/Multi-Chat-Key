/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StreamWithFailoverOptions, SwitchEvent, getPoolConfig, findNextCandidate, isSimulated429, setCooldown, recordFailoverEvent } from './failover';
import { streamChat, AgentEvent } from './stream';
import { ProviderError, EmptyResponseError, classifyError, parseRetryDelay } from './errors';
import { useKeysStore } from '@/store/keys';
import { throttle, onRateLimited } from './governor';

export type ResilientEvent =
  | SwitchEvent
  | { type: 'wait'; seconds: number; reason: string; attempt: number }
  | { type: 'notice'; text: string };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForOnline(maxMs = 300000, signal?: AbortSignal): Promise<void> {
  if (typeof window === 'undefined' || navigator.onLine) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, maxMs);

    const onOnline = () => {
      cleanup();
      resolve();
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('Aborted'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      signal?.removeEventListener('abort', onAbort);
    };

    window.addEventListener('online', onOnline, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function* streamResilient(
  opts: StreamWithFailoverOptions,
  cfg?: { maxAttempts?: number; maxTotalWaitMs?: number }
): AsyncGenerator<ResilientEvent> {
  const maxAttempts = cfg?.maxAttempts ?? 10;
  const maxTotalWaitMs = cfg?.maxTotalWaitMs ?? 15 * 60 * 1000;
  const startTime = Date.now();

  const poolConfig = await getPoolConfig();
  const keysStore = useKeysStore.getState();

  let currentKeyId = opts.keyId || keysStore.selectedKeyId;
  let currentKey = keysStore.keys.find((k) => k.id === currentKeyId) || keysStore.keys[0];
  let currentProvider = currentKey?.provider || opts.provider;
  let currentModel = opts.model;
  let currentApiKey = opts.apiKey;
  let currentBaseUrl = opts.baseUrl;

  let currentThinkingLevel = opts.thinkingLevel ?? 'auto';
  let currentTools = opts.tools;

  let attempt = 0;
  let emptyAttempts = 0;

  const backoffCounts: Record<string, number> = {
    rate: 0,
    overloaded: 0,
    timeout: 0,
    network: 0,
  };

  while (attempt < maxAttempts) {
    if (Date.now() - startTime > maxTotalWaitMs) {
      throw new Error('Maximum total wait time exceeded (15 minutes).');
    }

    attempt++;
    let tokensProduced = false;

    // Throttle pacing check
    if (currentKeyId) {
      for await (const waitEv of throttle(
        currentKeyId,
        currentModel,
        opts.messages,
        currentTools,
        opts.signal
      )) {
        yield waitEv;
      }
    }

    try {
      const stream = streamChat({
        provider: currentProvider,
        baseUrl: currentBaseUrl,
        apiKey: currentApiKey,
        model: currentModel,
        messages: opts.messages,
        tools: currentTools,
        signal: opts.signal,
        thinkingLevel: currentThinkingLevel,
      });

      for await (const event of stream) {
        if (event.type === 'text' || event.type === 'thinking') {
          tokensProduced = true;
        }
        yield event;
      }

      // Generation finished successfully
      return;
    } catch (err: any) {
      if (opts.signal?.aborted) {
        throw err;
      }

      // If tokens were produced before error, rethrow immediately
      if (tokensProduced) {
        throw err;
      }

      // Handle EmptyResponseError
      if (err instanceof EmptyResponseError || err?.name === 'EmptyResponseError') {
        emptyAttempts++;
        const reason = err.reason || 'NO_OUTPUT';

        if (emptyAttempts === 1) {
          continue;
        } else if (emptyAttempts === 2 && currentThinkingLevel !== 'off') {
          currentThinkingLevel = 'off';
          yield { type: 'notice', text: 'Retrying without thinking' };
          continue;
        } else if (
          emptyAttempts === 3 &&
          currentTools &&
          currentTools.length > 0 &&
          /MALFORMED_FUNCTION_CALL|UNEXPECTED_TOOL_CALL|tool/i.test(reason)
        ) {
          currentTools = undefined;
          yield { type: 'notice', text: 'Retrying without tools' };
          continue;
        } else {
          if (/SAFETY|PROHIBITED_CONTENT|BLOCKLIST|RECITATION/i.test(reason)) {
            throw new Error(
              `The provider blocked the reply (${reason}). Please rephrase your request or try another model.`
            );
          }
          throw new Error(`The model stopped with reason: ${reason}.`);
        }
      }

      const kind = classifyError(err);

      if (kind === 'auth' || kind === 'fatal') {
        throw err;
      }

      if (kind === 'daily-quota') {
        const next = findNextCandidate(currentKeyId || '', currentProvider, currentModel, poolConfig);
        if (next) {
          const fromLabel = currentKey ? `${currentKey.label} (${currentModel})` : currentModel;
          const toLabel = `${next.key.label} (${next.model})`;
          yield {
            type: 'switch',
            from: fromLabel,
            to: toLabel,
            reason: 'Daily quota exhausted',
            keyId: next.key.id,
          };
          recordFailoverEvent();
          currentKey = next.key;
          currentKeyId = currentKey.id;
          currentProvider = currentKey.provider;
          currentModel = next.model;
          currentApiKey = await keysStore.getDecryptedKey(currentKey.id);
          currentBaseUrl = currentKey.baseUrl;
          continue;
        }
        throw err;
      }

      // Rate / Overloaded / Timeout / Network errors
      if (poolConfig.enabled && poolConfig.fallbacks.length > 0) {
        const next = findNextCandidate(currentKeyId || '', currentProvider, currentModel, poolConfig);
        if (next) {
          const fromLabel = currentKey ? `${currentKey.label} (${currentModel})` : currentModel;
          const toLabel = `${next.key.label} (${next.model})`;
          yield {
            type: 'switch',
            from: fromLabel,
            to: toLabel,
            reason: `Failover after ${kind} error`,
            keyId: next.key.id,
          };
          recordFailoverEvent();
          currentKey = next.key;
          currentKeyId = currentKey.id;
          currentProvider = currentKey.provider;
          currentModel = next.model;
          currentApiKey = await keysStore.getDecryptedKey(currentKey.id);
          currentBaseUrl = currentKey.baseUrl;
          continue;
        }
      }

      // Calculate delay and wait
      let seconds = parseRetryDelay(err);
      if (!seconds) {
        backoffCounts[kind] = (backoffCounts[kind] || 0) + 1;
        const bIndex = backoffCounts[kind] - 1;
        const schedules: Record<string, number[]> = {
          rate: [20, 40, 60, 60, 60],
          overloaded: [5, 10, 20, 40, 60],
          timeout: [3, 6, 12, 12, 12],
          network: [2, 4, 8, 8, 8],
        };
        const base = (schedules[kind] || [5, 10, 20])[Math.min(bIndex, (schedules[kind] || [5]).length - 1)];
        seconds = base + Math.random() * 3;
      }
      seconds = Math.max(2, Math.min(120, Math.ceil(seconds)));

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        yield { type: 'wait', seconds: 300, reason: 'Waiting for network connection', attempt };
        await waitForOnline(300000, opts.signal);
      } else {
        const reasonText =
          kind === 'rate'
            ? 'Rate limit reached'
            : kind === 'overloaded'
            ? 'High demand'
            : kind === 'timeout'
            ? 'Proxy timeout'
            : 'Network error';

        yield { type: 'wait', seconds, reason: reasonText, attempt };
        if (currentKeyId) {
          await onRateLimited(currentKeyId, currentModel);
        }
        await sleep(seconds * 1000, opts.signal);
      }
    }
  }

  throw new Error(`Exceeded maximum retry attempts (${maxAttempts}).`);
}
