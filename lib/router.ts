/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './db';
import { useKeysStore } from '@/store/keys';

export type RouterMode = 'manual' | 'smart';
export type SlotKind = 'fast' | 'balanced' | 'best';

export interface ModelSlots {
  fast: { keyId: string; model: string };
  balanced: { keyId: string; model: string };
  best: { keyId: string; model: string };
}

export const DEFAULT_MODEL_SLOTS: ModelSlots = {
  fast: { keyId: '', model: 'gemini-2.5-flash' },
  balanced: { keyId: '', model: 'gemini-2.5-flash' },
  best: { keyId: '', model: 'gemini-2.5-pro' },
};

export async function getRouterMode(): Promise<RouterMode> {
  try {
    const row = await db.meta.get('routerMode');
    if (row && (row.value === 'smart' || row.value === 'manual')) {
      return row.value;
    }
  } catch {}
  return 'manual';
}

export async function setRouterMode(mode: RouterMode): Promise<void> {
  try {
    await db.meta.put({ key: 'routerMode', value: mode });
  } catch {}
}

export async function getModelSlots(): Promise<ModelSlots> {
  try {
    const row = await db.meta.get('modelSlots');
    if (row && row.value) {
      return { ...DEFAULT_MODEL_SLOTS, ...row.value };
    }
  } catch {}
  return DEFAULT_MODEL_SLOTS;
}

export async function saveModelSlots(slots: ModelSlots): Promise<ModelSlots> {
  try {
    await db.meta.put({ key: 'modelSlots', value: slots });
  } catch {}
  return slots;
}

export interface RouteDecision {
  slot: SlotKind;
  keyId: string;
  model: string;
  reason: string;
}

export function routeMessageHeuristic(opts: {
  text: string;
  attachmentsCount: number;
  hasCode: boolean;
  hasImages: boolean;
  hasPdf: boolean;
  hasWorkspace: boolean;
  slots: ModelSlots;
}): RouteDecision {
  const { text, attachmentsCount, hasCode, hasImages, hasPdf, hasWorkspace, slots } = opts;
  const lower = text.toLowerCase();

  // Count lines in code blocks if present
  let maxCodeLines = 0;
  const codeBlockRegex = /```[\s\S]*?```/g;
  const matches = text.match(codeBlockRegex);
  if (matches) {
    for (const m of matches) {
      const lineCount = m.split('\n').length;
      if (lineCount > maxCodeLines) maxCodeLines = lineCount;
    }
  }

  const bestKeywords = ['audit', 'architecture', 'refactor', 'step by step', 'debug', 'deep analysis', 'review'];
  const hasBestKeyword = bestKeywords.some((kw) => lower.includes(kw));

  // 1. Check BEST criteria
  if (
    hasWorkspace ||
    maxCodeLines > 40 ||
    hasPdf ||
    hasImages ||
    attachmentsCount > 0 ||
    hasBestKeyword
  ) {
    let reason = 'Complex request';
    if (hasWorkspace) reason = 'Workspace project context';
    else if (maxCodeLines > 40) reason = 'Large code snippet (>40 lines)';
    else if (hasPdf || hasImages) reason = 'File / Image analysis';
    else if (hasBestKeyword) reason = 'Architectural / Reasoning prompt';

    const slotChoice = slots.best.model ? slots.best : slots.balanced;
    return {
      slot: 'best',
      keyId: slotChoice.keyId,
      model: slotChoice.model,
      reason,
    };
  }

  // 2. Check FAST criteria
  const isCodeQuestion = hasCode || /\b(code|function|class|bug|const|let|var|import)\b/i.test(text);
  if (text.length < 120 && attachmentsCount === 0 && !isCodeQuestion) {
    const slotChoice = slots.fast.model ? slots.fast : slots.balanced;
    return {
      slot: 'fast',
      keyId: slotChoice.keyId,
      model: slotChoice.model,
      reason: 'Short query (<120 chars)',
    };
  }

  // 3. Otherwise BALANCED
  return {
    slot: 'balanced',
    keyId: slots.balanced.keyId,
    model: slots.balanced.model,
    reason: 'Standard conversational query',
  };
}
