import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { buildUpstream } from './provider-http';
import { db } from './db';

export const isNative = () => typeof window !== 'undefined' && Capacitor.isNativePlatform();

export async function isDirect(provider?: string): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DIRECT === '1' || isNative()) return true;
  try {
    const row = await db.meta.get('connectionMode');
    const mode = (row?.value as string) || 'auto';
    if (mode === 'direct') return true;
    if (mode === 'via-server') return false;

    // Auto mode: check if provider was marked bad in last 12 hours
    if (provider) {
      const badRow = await db.meta.get(`directBad:${provider}`);
      if (badRow && typeof badRow.value === 'number') {
        const twelveHours = 12 * 60 * 60 * 1000;
        if (Date.now() - badRow.value < twelveHours) {
          return false;
        }
      }
    }
    return true; // try direct first in auto mode
  } catch {
    return true;
  }
}

export async function directFetch(p: {
  provider: string;
  baseUrl?: string;
  apiKey: string;
  path: string;
  method?: string;
  body?: any;
  signal?: AbortSignal;
  stream?: boolean;
}): Promise<Response & { route?: 'direct' | 'via server' }> {
  const { url, headers } = buildUpstream(p.provider, p.baseUrl, p.apiKey, p.path);
  if (p.provider === 'anthropic') headers['anthropic-dangerous-direct-browser-access'] = 'true';
  const method = p.method ?? 'POST';
  if (method === 'GET') delete headers['Content-Type'];
  const body = p.body ? JSON.stringify(p.body) : undefined;

  const directAllowed = await isDirect(p.provider);

  if (directAllowed) {
    try {
      const res = await fetch(url, { method, headers, body, signal: p.signal });
      (res as any).route = 'direct';
      return res;
    } catch (e: any) {
      if (p.signal?.aborted) throw e;

      // Native fallback non-streaming
      if (isNative() && !p.stream) {
        const r = await CapacitorHttp.request({ url, method, headers, data: p.body, readTimeout: 60000 });
        const res = new Response(typeof r.data === 'string' ? r.data : JSON.stringify(r.data), {
          status: r.status,
          headers: { 'Content-Type': 'application/json' },
        });
        (res as any).route = 'direct';
        return res;
      }

      // Check if offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw e;
      }

      // If TypeError (CORS/network error), mark directBad for 12 hours and fallback to /api/proxy
      if (e?.name === 'TypeError' || /failed to fetch|network/i.test(e?.message || '')) {
        await db.meta.put({ key: `directBad:${p.provider}`, value: Date.now() }).catch(() => {});
      }
    }
  }

  // Server proxy fallback
  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: p.provider,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      path: p.path,
      method,
      body: p.body,
    }),
    signal: p.signal,
  });
  (res as any).route = 'via server';
  return res;
}

export async function directSearch(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
  maxResults: number = 5
): Promise<any> {
  const payload = { query: query.slice(0, 400), max_results: maxResults, search_depth: 'basic' };
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
  if (isNative()) {
    const r = await CapacitorHttp.request({
      url: 'https://api.tavily.com/search',
      method: 'POST',
      headers,
      data: payload,
    });
    if (r.status >= 400) throw new Error('Search failed (' + r.status + ')');
    return r.data;
  }
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) throw new Error('Search failed (' + res.status + ')');
    return res.json();
  } catch (e: any) {
    if (signal?.aborted || (typeof navigator !== 'undefined' && !navigator.onLine)) throw e;
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, query, max_results: maxResults }),
      signal,
    });
    if (!res.ok) throw new Error('Search failed (' + res.status + ')');
    return res.json();
  }
}

export async function directExtract(
  apiKey: string,
  urls: string[],
  signal?: AbortSignal
): Promise<any> {
  const payload = { urls };
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
  if (isNative()) {
    const r = await CapacitorHttp.request({
      url: 'https://api.tavily.com/extract',
      method: 'POST',
      headers,
      data: payload,
    });
    if (r.status >= 400) throw new Error('Extract failed (' + r.status + ')');
    return r.data;
  }
  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) throw new Error('Extract failed (' + res.status + ')');
    return res.json();
  } catch (e: any) {
    if (signal?.aborted || (typeof navigator !== 'undefined' && !navigator.onLine)) throw e;
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, urls }),
      signal,
    });
    if (!res.ok) throw new Error('Extract failed (' + res.status + ')');
    return res.json();
  }
}
