export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let p: any;
  try {
    p = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  if (!p.apiKey || !p.urls || !Array.isArray(p.urls)) {
    return new Response('Missing fields', { status: 400 });
  }

  const r = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + p.apiKey,
    },
    body: JSON.stringify({
      urls: p.urls.slice(0, 5),
    }),
    signal: req.signal,
  });

  return new Response(r.body, {
    status: r.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
