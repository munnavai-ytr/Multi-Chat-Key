/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class ProviderError extends Error {
  status: number;
  rawText: string;
  headers?: Headers;
  provider?: string;
  model?: string;

  constructor(status: number, rawText: string, headers?: Headers, message?: string) {
    super(message ?? friendlyError(status, rawText));
    this.name = 'ProviderError';
    this.status = status;
    this.rawText = rawText;
    this.headers = headers;
  }
}

export class EmptyResponseError extends Error {
  reason: string;

  constructor(reason: string) {
    super('empty:' + reason);
    this.name = 'EmptyResponseError';
    this.reason = reason;
  }
}

export type ErrKind = 'rate' | 'daily-quota' | 'overloaded' | 'timeout' | 'network' | 'auth' | 'fatal';

export function classifyError(err: any): ErrKind {
  const s = err?.status ?? 0;
  const t = String(err?.rawText ?? err?.message ?? '').toLowerCase();

  if (s === 401 || s === 403) return 'auth';
  if ((s === 429 || /quota|exhausted/.test(t)) && /perday|per day|daily|requests per day/.test(t)) {
    return 'daily-quota';
  }
  if (s === 429 || /rate.?limit|resource_exhausted|too many requests|quota/.test(t)) {
    return 'rate';
  }
  if (s === 503 || s === 529 || /overloaded|high demand|temporarily unavailable/.test(t)) {
    return 'overloaded';
  }
  if (s === 504 || s === 408 || /timeout|timed out|function_invocation_timeout/.test(t)) {
    return 'timeout';
  }
  if (s >= 500) {
    return 'overloaded';
  }
  if (s === 0 && (err?.name === 'TypeError' || /failed to fetch|network|load failed/.test(t))) {
    return 'network';
  }
  return 'fatal';
}

export function parseRetryDelay(err: any): number | null {
  const ra = err?.headers?.get?.('retry-after');
  if (ra && !isNaN(Number(ra))) return Number(ra);

  const raw = String(err?.rawText ?? '');
  try {
    const j = JSON.parse(raw);
    const det = j?.error?.details;
    if (Array.isArray(det)) {
      for (const d of det) {
        const rd = d?.retryDelay;
        if (typeof rd === 'string') {
          const m = rd.match(/([\d.]+)s/);
          if (m) return Number(m[1]);
        }
      }
    }
  } catch {}

  const m1 = raw.match(/retry in ([\d.]+)\s*s/i);
  if (m1) return Number(m1[1]);

  const m2 = raw.match(/try again in ([\d.]+)\s*(ms|s|m)\b/i);
  if (m2) {
    const v = Number(m2[1]);
    const u = m2[2].toLowerCase();
    return u === 'ms' ? v / 1000 : u === 'm' ? v * 60 : v;
  }
  return null;
}

export function friendlyError(status: number, raw: string): string {
  const t = (raw || '').toLowerCase();
  if (status === 401 || status === 403) {
    return 'Your API key was rejected or unauthorized (401/403). Check API key credentials in Settings.';
  }
  if ((status === 429 || /quota|exhausted/.test(t)) && /perday|per day|daily|requests per day/.test(t)) {
    return 'The free daily quota for this model is used up. It resets later (Google: midnight Pacific). Switch model or key to continue now.';
  }
  if (status === 429 || /rate.?limit|resource_exhausted|too many requests|quota/.test(t)) {
    return 'Rate limit reached for this model. The app will wait and retry automatically.';
  }
  if (status === 503 || status === 529 || /overloaded|high demand|temporarily unavailable/.test(t)) {
    return 'The model is busy (high demand). Retrying automatically.';
  }
  if (status === 504 || status === 408 || /function_invocation_timeout|timeout/.test(t)) {
    return 'The server proxy timed out on a long request. Open Settings > Advanced > Connection and choose Direct.';
  }
  if (status === 404) {
    return 'Model or endpoint not found (404). Switch model or check configuration.';
  }
  if (status >= 500) {
    return 'The model is busy or server error. Retrying automatically.';
  }
  return `Provider returned HTTP status ${status}.`;
}
