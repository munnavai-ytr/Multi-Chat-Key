import { db } from './db';
import { oneShot } from './oneshot';
import { ProviderId } from './providers';

const SECRET = /(sk-[a-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{20,}|\b\d{13,19}\b|password\s*[:=]|api[_ -]?key)/i;
const tok = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
const similar = (a: string, b: string) => {
  const A = tok(a), B = tok(b);
  if (!A.size || !B.size) return false;
  let n = 0;
  A.forEach((t) => B.has(t) && n++);
  return n / Math.min(A.size, B.size) > 0.8;
};

export async function extractMemories(o: {
  provider: ProviderId | any;
  baseUrl?: string;
  apiKey: string;
  model: string;
  userText: string;
  assistantText: string;
}): Promise<number> {
  const prompt = `You maintain a long-term memory about the user. From the conversation turn below, extract ONLY durable facts or stable preferences about the user (name, job, location, projects, tools they use, languages, communication preferences). Ignore one-off requests and temporary states. Never include passwords, API keys, card or ID numbers, or private data about other people. Reply with ONLY a JSON array of up to 3 short strings, or [] if nothing qualifies.\n\nUser: ${o.userText.slice(0, 1500)}\nAssistant: ${o.assistantText.slice(0, 800)}`;
  const raw = await oneShot({ ...o, prompt, maxTokens: 200 });
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return 0;
  let arr: unknown;
  try {
    arr = JSON.parse(m[0]);
  } catch {
    return 0;
  }
  if (!Array.isArray(arr)) return 0;
  const existing = await db.memories.toArray();
  let added = 0;
  for (const t of arr) {
    if (typeof t !== 'string') continue;
    const text = t.trim().slice(0, 200);
    if (text.length < 5 || SECRET.test(text) || existing.some((e) => similar(e.text, text))) continue;
    const now = Date.now();
    await db.memories.put({ id: crypto.randomUUID(), text, source: 'auto', createdAt: now, updatedAt: now });
    added++;
  }
  const count = await db.memories.count();
  if (count > 100) {
    const old = await db.memories.orderBy('updatedAt').limit(count - 100).primaryKeys();
    await db.memories.bulkDelete(old);
  }
  return added;
}

export async function relevantMemories(query: string, limit = 12): Promise<string[]> {
  const q = tok(query);
  const all = await db.memories.toArray();
  return all
    .map((m) => ({
      m,
      s: [...tok(m.text)].filter((t) => q.has(t)).length + (m.source === 'manual' ? 0.5 : 0),
    }))
    .sort((a, b) => b.s - a.s || b.m.updatedAt - a.m.updatedAt)
    .slice(0, limit)
    .map((x) => x.m.text);
}
