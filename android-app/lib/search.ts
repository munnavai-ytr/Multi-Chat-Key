export interface SearchHit { title: string; url: string; content: string }
export async function webSearch(apiKey: string, query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey, query }), signal });
  if (!res.ok) throw new Error('Search failed (' + res.status + ')');
  const j = await res.json();
  return (j.results ?? []).map((r: any) => ({ title: r.title, url: r.url, content: String(r.content ?? '').slice(0, 800) }));
}
export function searchContext(hits: SearchHit[]) {
  return 'Web search results (today: ' + new Date().toISOString().slice(0, 10) + '). Use them when relevant and cite sources inline like [1], [2]. If they do not answer the question, say so.\n\n' + hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`).join('\n\n');
}
