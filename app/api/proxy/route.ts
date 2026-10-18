import { buildUpstream } from '@/lib/provider-http';

export const runtime = 'edge';

export async function GET() {
  return Response.json({
    ok: true,
    runtime: 'edge',
    region: process.env.VERCEL_REGION ?? null,
    time: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const { provider, baseUrl, apiKey, path, method = 'POST', body } = payload;

  if (typeof apiKey !== 'string' || !apiKey) {
    return new Response('Missing key', { status: 400 });
  }

  let url: string;
  let headers: Record<string, string>;
  try {
    const upstream = buildUpstream(provider, baseUrl, apiKey, path);
    url = upstream.url;
    headers = upstream.headers;
    if (method === 'GET') {
      delete headers['Content-Type'];
    }
  } catch (err: any) {
    return new Response(err?.message || 'Bad request', { status: 400 });
  }

  let up: Response;
  try {
    up = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: req.signal,
      redirect: 'manual',
    });
  } catch (e: any) {
    return Response.json(
      { error: 'upstream_fetch_failed', message: String(e?.message || e).slice(0, 200) },
      { status: 502 }
    );
  }

  if (up.status >= 300 && up.status < 400) {
    return Response.json({ error: 'upstream_redirect', status: up.status }, { status: 502 });
  }

  return new Response(up.body, {
    status: up.status,
    headers: {
      'Content-Type': up.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
