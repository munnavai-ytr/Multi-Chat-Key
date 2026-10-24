export const runtime = 'edge';

export async function POST(req: Request) {
  let p: any;
  try {
    p = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  if (!p.apiKey || !p.query) {
    return new Response('Missing fields', { status: 400 });
  }

  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + p.apiKey,
    },
    body: JSON.stringify({
      query: String(p.query).slice(0, 400),
      max_results: Math.min(Math.max(1, Number(p.max_results) || 5), 10),
      search_depth: 'basic',
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
