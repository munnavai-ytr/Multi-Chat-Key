import { BASES } from '@/lib/providers';

export const runtime = 'edge';

const BLOCKED =
  /^(localhost|0\.0\.0\.0|\[.*\]|.*\.(local|internal)|127\.|10\.|192\.168\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export async function POST(req: Request) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const { provider, baseUrl, apiKey, path, method = 'POST', body } = payload;

  if (!(provider in BASES) && provider !== 'custom') {
    return new Response('Unknown provider', { status: 400 });
  }

  if (typeof apiKey !== 'string' || !apiKey) {
    return new Response('Missing key', { status: 400 });
  }

  let base = BASES[provider];
  if (!base) {
    try {
      const u = new URL(baseUrl);
      if (u.protocol !== 'https:' || BLOCKED.test(u.hostname)) {
        return new Response('Blocked base URL', { status: 400 });
      }
      base = baseUrl.replace(/\/$/, '');
    } catch {
      return new Response('Bad base URL', { status: 400 });
    }
  }

  if (typeof path !== 'string' || !path.startsWith('/')) {
    return new Response('Bad path', { status: 400 });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider === 'gemini') {
    headers['x-goog-api-key'] = apiKey;
  } else {
    headers['Authorization'] = 'Bearer ' + apiKey;
  }

  const up = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: req.signal,
    redirect: 'error',
  });

  return new Response(up.body, {
    status: up.status,
    headers: {
      'Content-Type': up.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
