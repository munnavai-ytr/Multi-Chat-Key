import { oneShot } from './oneshot';
import { webSearch, extractPages, SearchHit } from './search';

export type Progress = {
  phase: 'plan' | 'search' | 'read' | 'note' | 'gaps' | 'done';
  text: string;
  searches: number;
  sources: number;
};

const LIMITS = {
  quick: { q: 3, perQ: 3, reads: 6, rounds: 1 },
  standard: { q: 5, perQ: 4, reads: 12, rounds: 2 },
  deep: { q: 7, perQ: 5, reads: 20, rounds: 3 },
};

function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    // Strip common tracking params
    const keysToDelete: string[] = [];
    u.searchParams.forEach((_, key) => {
      if (key.startsWith('utm_') || key === 'ref' || key === 'source' || key === 'fbclid') {
        keysToDelete.push(key);
      }
    });
    for (const k of keysToDelete) {
      u.searchParams.delete(k);
    }
    let res = u.toString();
    if (res.endsWith('/') && u.pathname !== '/') {
      res = res.slice(0, -1);
    }
    return res;
  } catch {
    return rawUrl.trim().replace(/\/+$/, '');
  }
}

function getDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

// Helper to run tasks with concurrency limit
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function runResearch(o: {
  question: string;
  depth: 'quick' | 'standard' | 'deep';
  llm: { provider: any; baseUrl?: string; apiKey: string; model: string };
  searchKey: string;
  onProgress: (p: Progress) => void;
  signal: AbortSignal;
}): Promise<{ dossier: string; sources: { id: number; title: string; url: string }[] }> {
  const limits = LIMITS[o.depth] || LIMITS.standard;
  let searchesCount = 0;
  const keptSources: {
    id: number;
    title: string;
    url: string;
    note: string;
    score: number;
  }[] = [];

  const seenUrls = new Set<string>();
  const allHits: (SearchHit & { normUrl: string; domain: string })[] = [];
  const readUrlSet = new Set<string>();

let lock: any = null;
async function keepAwake() {
  try {
    lock = await (navigator as any).wakeLock?.request('screen');
  } catch {
    /* not supported */
  }
}
function releaseAwake() {
  try {
    lock?.release();
  } catch {}
  lock = null;
}

export async function runResearch(o: {
  question: string;
  depth: 'quick' | 'standard' | 'deep';
  llm: { provider: any; baseUrl?: string; apiKey: string; model: string };
  searchKey: string;
  onProgress: (p: Progress) => void;
  signal: AbortSignal;
}): Promise<{ dossier: string; sources: { id: number; title: string; url: string }[] }> {
  const limits = LIMITS[o.depth] || LIMITS.standard;
  let searchesCount = 0;
  const keptSources: {
    id: number;
    title: string;
    url: string;
    note: string;
    score: number;
  }[] = [];

  const seenUrls = new Set<string>();
  const allHits: (SearchHit & { normUrl: string; domain: string })[] = [];
  const readUrlSet = new Set<string>();

  // Acquire Screen Wake Lock
  await keepAwake();

  const checkAbort = () => {
    if (o.signal.aborted) {
      throw new Error('Cancelled');
    }
  };

  try {
    checkAbort();
    const today = new Date().toISOString().slice(0, 10);

    // Step a) PLAN
    o.onProgress({
      phase: 'plan',
      text: 'Planning research strategy...',
      searches: searchesCount,
      sources: keptSources.length,
    });

    let currentQueries: string[] = [];
    try {
      const planPrompt = `Break this question into up to ${limits.q} specific web search queries that together cover it. Today is ${today}. Reply with ONLY a JSON array of strings.\n\nQuestion: "${o.question}"`;
      const rawPlan = await oneShot({
        provider: o.llm.provider,
        baseUrl: o.llm.baseUrl,
        apiKey: o.llm.apiKey,
        model: o.llm.model,
        prompt: planPrompt,
        maxTokens: 400,
      });

      const matched = rawPlan.match(/\[[\s\S]*?\]/);
      if (matched) {
        const parsed = JSON.parse(matched[0]);
        if (Array.isArray(parsed)) {
          currentQueries = parsed
            .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
            .slice(0, limits.q);
        }
      }
    } catch (e) {
      console.warn('Research plan fallback to original question', e);
    }

    if (!currentQueries.length) {
      currentQueries = [o.question];
    }

    // Outer rounds loop
    for (let round = 1; round <= limits.rounds; round++) {
      checkAbort();

      // Step b) SEARCH for current queries (max 3 concurrent)
      o.onProgress({
        phase: 'search',
        text: `Searching ${searchesCount + 1}/${searchesCount + currentQueries.length} queries (Round ${round})...`,
        searches: searchesCount,
        sources: keptSources.length,
      });

      let completedInRound = 0;
      await runWithConcurrency(currentQueries, 3, async (query) => {
        checkAbort();
        searchesCount++;
        completedInRound++;
        o.onProgress({
          phase: 'search',
          text: `Searching: "${query.slice(0, 35)}..." (${searchesCount} total)`,
          searches: searchesCount,
          sources: keptSources.length,
        });

        try {
          const hits = await webSearch(o.searchKey, query, o.signal, limits.perQ);
          for (const h of hits) {
            const norm = normalizeUrl(h.url);
            if (!seenUrls.has(norm)) {
              seenUrls.add(norm);
              allHits.push({
                ...h,
                normUrl: norm,
                domain: getDomain(norm),
                score: typeof h.score === 'number' ? h.score : 0.5,
              });
            }
          }
        } catch (err: any) {
          if (o.signal.aborted) throw err;
          console.error(`Search failed for "${query}":`, err);
        }
      });

      checkAbort();

      // Step c) READ
      // Filter hits not yet read, prioritize higher score, max 2 per domain
      const domainCount: Record<string, number> = {};
      const candidateHits = allHits
        .filter((h) => !readUrlSet.has(h.normUrl))
        .sort((a, b) => (b.score ?? 0.5) - (a.score ?? 0.5))
        .filter((h) => {
          const count = domainCount[h.domain] || 0;
          if (count >= 2) return false;
          domainCount[h.domain] = count + 1;
          return true;
        })
        .slice(0, Math.max(1, limits.reads - readUrlSet.size));

      if (candidateHits.length > 0) {
        o.onProgress({
          phase: 'read',
          text: `Reading ${candidateHits.length} sources across web pages...`,
          searches: searchesCount,
          sources: keptSources.length,
        });

        // Batch extract up to 5 URLs at a time
        const extractedPagesMap = new Map<string, string>();
        const chunks: string[][] = [];
        for (let i = 0; i < candidateHits.length; i += 5) {
          chunks.push(candidateHits.slice(i, i + 5).map((c) => c.url));
        }

        for (const chunk of chunks) {
          checkAbort();
          try {
            const extracted = await extractPages(o.searchKey, chunk, o.signal);
            for (const item of extracted) {
              if (item.raw_content && item.raw_content.trim().length > 100) {
                extractedPagesMap.set(normalizeUrl(item.url), item.raw_content);
              }
            }
          } catch (err: any) {
            if (o.signal.aborted) throw err;
            console.warn('Tavily extract failed, falling back to snippets', err);
          }
        }

        // Prepare page data for note-taking
        const pagesToNote = candidateHits.map((h) => {
          readUrlSet.add(h.normUrl);
          const raw = extractedPagesMap.get(h.normUrl) || h.content || '';
          return {
            title: h.title,
            url: h.url,
            score: h.score ?? 0.5,
            text: raw.slice(0, 12000),
          };
        });

        // Step d) NOTE (max 4 in parallel)
        o.onProgress({
          phase: 'note',
          text: `Analyzing ${pagesToNote.length} sources and extracting evidence...`,
          searches: searchesCount,
          sources: keptSources.length,
        });

        let notesProcessed = 0;
        await runWithConcurrency(pagesToNote, 4, async (page) => {
          checkAbort();
          notesProcessed++;
          try {
            const notePrompt = `Question: "${o.question}"
Extract only facts from this page that help answer the question. Keep specific numbers, dates, names and claims. Max 150 words. If nothing relevant reply exactly NONE.

PAGE (${page.title}, ${page.url}):
${page.text}`;

            const noteRaw = await oneShot({
              provider: o.llm.provider,
              baseUrl: o.llm.baseUrl,
              apiKey: o.llm.apiKey,
              model: o.llm.model,
              prompt: notePrompt,
              maxTokens: 350,
            });

            const cleanNote = noteRaw.trim();
            if (cleanNote && !/^none\.?$/i.test(cleanNote) && cleanNote.length > 20) {
              const nextId = keptSources.length + 1;
              keptSources.push({
                id: nextId,
                title: page.title,
                url: page.url,
                note: cleanNote,
                score: page.score,
              });

              o.onProgress({
                phase: 'note',
                text: `Extracted ${keptSources.length} verified evidence notes...`,
                searches: searchesCount,
                sources: keptSources.length,
              });
            }
          } catch (err: any) {
            if (o.signal.aborted) throw err;
            console.error('Note extraction error:', err);
          }
        });
      }

      checkAbort();

      // Step e) GAPS (if rounds remain)
      if (round < limits.rounds && keptSources.length > 0) {
        o.onProgress({
          phase: 'gaps',
          text: 'Evaluating coverage and identifying information gaps...',
          searches: searchesCount,
          sources: keptSources.length,
        });

        try {
          const notesSummary = keptSources
            .slice(-6)
            .map((s) => `[S${s.id}] ${s.note.slice(0, 160)}`)
            .join('\n');

          const gapsPrompt = `Question: "${o.question}"
Notes so far:
${notesSummary}

List up to 3 important missing aspects as new search queries. Reply with ONLY a JSON array of strings, or [].`;

          const gapsRaw = await oneShot({
            provider: o.llm.provider,
            baseUrl: o.llm.baseUrl,
            apiKey: o.llm.apiKey,
            model: o.llm.model,
            prompt: gapsPrompt,
            maxTokens: 250,
          });

          const matched = gapsRaw.match(/\[[\s\S]*?\]/);
          if (matched) {
            const parsed = JSON.parse(matched[0]);
            if (Array.isArray(parsed) && parsed.length > 0) {
              currentQueries = parsed
                .filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
                .slice(0, 3);
            } else {
              // No further gaps, finish rounds
              break;
            }
          } else {
            break;
          }
        } catch {
          break;
        }
      } else {
        break;
      }
    }

    checkAbort();

    // Step f) Build dossier
    // Hard cap 24,000 chars (drop lowest-scored notes first if needed)
    let sortedNotes = [...keptSources];
    let totalChars = sortedNotes.reduce((acc, s) => acc + s.note.length + s.title.length + 50, 0);

    if (totalChars > 24000) {
      // Sort by score ascending so we drop lowest score
      sortedNotes.sort((a, b) => a.score - b.score);
      while (totalChars > 24000 && sortedNotes.length > 3) {
        const removed = sortedNotes.shift();
        if (removed) {
          totalChars -= removed.note.length + removed.title.length + 50;
        }
      }
      // Re-sort back by id
      sortedNotes.sort((a, b) => a.id - b.id);
    }

    // Build the final dossier string
    const dossier = sortedNotes
      .map((s) => `[S${s.id}] ${s.title} - ${s.url}\n${s.note}`)
      .join('\n\n');

    o.onProgress({
      phase: 'done',
      text: `Research completed with ${sortedNotes.length} verified sources.`,
      searches: searchesCount,
      sources: sortedNotes.length,
    });

    return {
      dossier,
      sources: sortedNotes.map((s) => ({
        id: s.id,
        title: s.title,
        url: s.url,
      })),
    };
  } finally {
    releaseAwake();
  }
}
