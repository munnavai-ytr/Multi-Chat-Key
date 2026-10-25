import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { buildUpstream } from './provider-http';
import { db } from './db';

export const isNative = () => typeof window !== 'undefined' && Capacitor.isNativePlatform();
export const isDirect = () => process.env.NEXT_PUBLIC_DIRECT === '1' || isNative();

export async function directFetch(p: {
  provider: string;
  baseUrl?: string;
  apiKey: string;
  path: string;
  method?: string;
  body?: any;
  signal?: AbortSignal;
  stream?: boolean;
}): Promise<Response> {
  const { url, headers } = buildUpstream(p.provider, p.baseUrl, p.apiKey, p.path);
  if (p.provider === 'anthropic') headers['anthropic-dangerous-direct-browser-access'] = 'true';
  const method = p.method ?? 'POST';
  if (method === 'GET') delete headers['Content-Type'];
  const body = p.body ? JSON.stringify(p.body) : undefined;
  try {
    return await fetch(url, { method, headers, body, signal: p.signal });
  } catch (e) {
    if (p.signal?.aborted) throw e;
    if (isNative() && !p.stream) {
      // native HTTP bypasses CORS (non-streaming only)
      const r = await CapacitorHttp.request({ url, method, headers, data: p.body, readTimeout: 60000 });
      return new Response(typeof r.data === 'string' ? r.data : JSON.stringify(r.data), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const proxy = (await db.meta.get('proxyUrl'))?.value as string | undefined; // optional fallback: the deployed web app
    if (proxy) {
      return fetch(proxy.replace(/\/$/, '') + '/api/proxy', {
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
    }
    throw e;
  }
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
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error('Search failed (' + res.status + ')');
  return res.json();
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
  const res = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error('Extract failed (' + res.status + ')');
  return res.json();
}
