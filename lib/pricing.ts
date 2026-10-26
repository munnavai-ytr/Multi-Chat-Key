/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './db';

export interface ModelPrice {
  inputPerM: number;  // Price in USD per 1M tokens
  outputPerM: number; // Price in USD per 1M tokens
}

export type PriceTable = Record<string, ModelPrice>; // modelId or "provider:model" -> price

export async function getCustomPrices(): Promise<PriceTable> {
  try {
    const row = await db.meta.get('prices');
    if (row && row.value) {
      return row.value as PriceTable;
    }
  } catch {}
  return {};
}

export async function saveCustomPrices(prices: PriceTable): Promise<void> {
  try {
    await db.meta.put({ key: 'prices', value: prices });
  } catch {}
}

export async function getModelPrice(model: string, provider?: string): Promise<ModelPrice | null> {
  const prices = await getCustomPrices();

  if (prices[model]) return prices[model];
  if (provider && prices[`${provider}:${model}`]) return prices[`${provider}:${model}`];

  return null;
}

export function calculateCost(tokens: { in: number; out: number }, price: ModelPrice | null): number | null {
  if (!price) return null;
  const inCost = (tokens.in * price.inputPerM) / 1_000_000;
  const outCost = (tokens.out * price.outputPerM) / 1_000_000;
  return inCost + outCost;
}

export function formatCostUSD(cost: number | null): string | null {
  if (cost === null || isNaN(cost)) return null;
  if (cost < 0.0001) return '< $0.0001';
  return `$${cost.toFixed(4)}`;
}

export async function getKeyDailySpend(keyId: string): Promise<number> {
  try {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const startTs = todayMidnight.getTime();

    // Get all chats linked to this key or messages from today
    const msgs = await db.messages.where('createdAt').above(startTs).toArray();
    let totalCost = 0;

    for (const msg of msgs) {
      if (msg.role === 'assistant' && msg.usage && msg.model) {
        const price = await getModelPrice(msg.model, msg.provider);
        const cost = calculateCost(msg.usage, price);
        if (cost !== null) {
          totalCost += cost;
        }
      }
    }
    return totalCost;
  } catch {
    return 0;
  }
}

export async function getKeyDailyBudget(keyId: string): Promise<number | null> {
  try {
    const row = await db.meta.get('keyBudgets');
    if (row && row.value && row.value[keyId]) {
      return Number(row.value[keyId]);
    }
  } catch {}
  return null;
}

export async function setKeyDailyBudget(keyId: string, budgetUSD: number | null): Promise<void> {
  try {
    const row = await db.meta.get('keyBudgets');
    const map = (row?.value || {}) as Record<string, number>;
    if (budgetUSD === null || budgetUSD <= 0) {
      delete map[keyId];
    } else {
      map[keyId] = budgetUSD;
    }
    await db.meta.put({ key: 'keyBudgets', value: map });
  } catch {}
}
