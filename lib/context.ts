/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './db';
import { AMsg } from './stream';

export type ContextMode = 'economy' | 'balanced' | 'max';

export interface ContextPreset {
  toolCap: number;
  compactAt: number;
  keepRaw: number;
  readLines: number;
  searchHits: number;
  treePaths: number;
}

export const CONTEXT_PRESETS: Record<ContextMode, ContextPreset> = {
  economy: {
    toolCap: 6000,
    compactAt: 60000,
    keepRaw: 4,
    readLines: 250,
    searchHits: 30,
    treePaths: 150,
  },
  balanced: {
    toolCap: 9000,
    compactAt: 100000,
    keepRaw: 6,
    readLines: 400,
    searchHits: 50,
    treePaths: 300,
  },
  max: {
    toolCap: 12000,
    compactAt: 150000,
    keepRaw: 8,
    readLines: 400,
    searchHits: 50,
    treePaths: 300,
  },
};

export async function getContextPreset(): Promise<{ mode: ContextMode; preset: ContextPreset }> {
  try {
    const row = await db.meta.get('contextMode');
    const mode = (row?.value as ContextMode) || 'economy';
    return { mode, preset: CONTEXT_PRESETS[mode] || CONTEXT_PRESETS.economy };
  } catch {
    return { mode: 'economy', preset: CONTEXT_PRESETS.economy };
  }
}

export function compactConvo(convo: AMsg[], compactAt: number, keepRaw: number): AMsg[] {
  const totalChars = convo.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  if (totalChars <= compactAt) return convo;

  const toolIndices: number[] = [];
  convo.forEach((m, idx) => {
    if (m.role === 'tool') toolIndices.push(idx);
  });

  if (toolIndices.length <= keepRaw) return convo;

  const toCompact = new Set(toolIndices.slice(0, toolIndices.length - keepRaw));

  return convo.map((m, idx) => {
    if (!toCompact.has(idx) || m.role !== 'tool') return m;
    const content = m.content || '';
    if (content.length <= 400) return m;

    const firstLine = content.trim().split('\n')[0].slice(0, 300).replace(/\r/g, '');
    const toolName = (m as any).name || 'tool';
    const digest = `[compacted: ${toolName}, ${content.length} chars] ${firstLine} ... (re-run the tool if you need the full output)`;
    return { ...m, content: digest };
  });
}
