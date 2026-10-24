import { isDirect, directSearch, directExtract } from './transport';

export interface SearchHit {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export async function webSearch(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
  maxResults: number = 5
): Promise<SearchHit[]> {
  if (isDirect()) {
    const j = await directSearch(apiKey, query, signal, maxResults);
    return (j.results ?? []).map((r: any) => ({
      title: r.title,
      url: r.url,
      content: String(r.content ?? '').slice(0, 800),
      score: typeof r.score === 'number' ? r.score : undefined,
    }));
  }

  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, query, max_results: maxResults }),
    signal,
  });

  if (!res.ok) {
    throw new Error('Search failed (' + res.status + ')');
  }

  const j = await res.json();
  return (j.results ?? []).map((r: any) => ({
    title: r.title,
    url: r.url,
    content: String(r.content ?? '').slice(0, 800),
    score: typeof r.score === 'number' ? r.score : undefined,
  }));
}

export async function extractPages(
  apiKey: string,
  urls: string[],
  signal?: AbortSignal
): Promise<{ url: string; raw_content: string }[]> {
  if (!urls.length) return [];
  if (isDirect()) {
    const j = await directExtract(apiKey, urls, signal);
    return (j.results ?? []).map((r: any) => ({
      url: r.url,
      raw_content: String(r.raw_content ?? ''),
    }));
  }

  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, urls }),
    signal,
  });

  if (!res.ok) {
    throw new Error('Extraction failed (' + res.status + ')');
  }

  const j = await res.json();
  return (j.results ?? []).map((r: any) => ({
    url: r.url,
    raw_content: String(r.raw_content ?? ''),
  }));
}

export function searchContext(hits: SearchHit[]) {
  return (
    'Web search results (today: ' +
    new Date().toISOString().slice(0, 10) +
    '). Use them when relevant and cite sources inline like [1], [2]. If they do not answer the question, say so.\n\n' +
    hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`).join('\n\n')
  );
}
