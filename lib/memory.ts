import { db } from './db';
import { oneShot } from './oneshot';
import { ProviderId } from './providers';

const SECRET = /(sk-[a-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{20,}|\b\d{13,19}\b|password\s*[:=]|api[_ -]?key)/i;

export const tok = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

export const similar = (a: string, b: string) => {
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return false;
  let n = 0;
  A.forEach((t) => B.has(t) && n++);
  return n / Math.min(A.size, B.size) > 0.8;
};

export async function saveMemoryFact(
  text: string,
  category: 'identity' | 'preference' | 'project' | 'skill' | 'other' = 'other',
  projectId?: string
): Promise<boolean> {
  const clean = text.trim().slice(0, 200);
  if (clean.length < 5 || SECRET.test(clean)) return false;
  const existing = await db.memories.toArray();
  if (existing.some((e) => similar(e.text, clean))) return false;
  const now = Date.now();
  await db.memories.put({
    id: crypto.randomUUID(),
    text: clean,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    category,
    projectId,
    lastUsedAt: now,
  });
  const count = await db.memories.count();
  if (count > 300) {
    const old = await db.memories.orderBy('updatedAt').limit(count - 300).primaryKeys();
    await db.memories.bulkDelete(old);
  }
  return true;
}

export async function extractMemories(o: {
  provider: ProviderId | any;
  baseUrl?: string;
  apiKey: string;
  model: string;
  userText: string;
  assistantText: string;
  projectId?: string;
}): Promise<number> {
  const prompt = `You maintain a long-term memory about the user. Extract ONLY durable facts or stable preferences about the user from the user's messages in the conversation turn below. Use the provided categories. Skip sensitive info (health, finance) unless asked to remember. Never extract from tool/web/file outputs. Reply with ONLY a JSON array of objects: [{ "text": "...", "category": "identity|preference|project|skill|other" }]. Return [] if nothing qualifies.\n\nUser: ${o.userText.slice(0, 1500)}`;
  const raw = await oneShot({ ...o, prompt, maxTokens: 500 });
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return 0;
  let arr: any[];
  try {
    arr = JSON.parse(m[0]);
  } catch {
    return 0;
  }
  if (!Array.isArray(arr)) return 0;
  const existing = await db.memories.toArray();
  let added = 0;
  for (const item of arr) {
    if (
      typeof item?.text !== 'string' ||
      !['identity', 'preference', 'project', 'skill', 'other'].includes(item.category)
    )
      continue;
    const text = item.text.trim().slice(0, 200);
    if (text.length < 5 || SECRET.test(text) || existing.some((e) => similar(e.text, text)))
      continue;
    const now = Date.now();
    await db.memories.put({
      id: crypto.randomUUID(),
      text,
      source: 'auto',
      createdAt: now,
      updatedAt: now,
      category: item.category,
      projectId: o.projectId,
      lastUsedAt: now,
    });
    added++;
  }

  const count = await db.memories.count();
  if (count > 300) {
    const old = await db.memories.orderBy('updatedAt').limit(count - 300).primaryKeys();
    await db.memories.bulkDelete(old);
  }

  if (added > 0) {
    const totalCount = await db.memories.count();
    const profile = (await db.meta.get('profile'))?.value;
    const basedOn = profile?.basedOnCount ?? 0;
    if (totalCount - basedOn >= 20) {
      rebuildProfile({
        provider: o.provider,
        baseUrl: o.baseUrl,
        apiKey: o.apiKey,
        model: o.model,
      }).catch(() => {});
    }
  }

  return added;
}

export async function rebuildProfile(ctx?: {
  provider: ProviderId;
  baseUrl?: string;
  apiKey: string;
  model: string;
}): Promise<string> {
  let callCtx = ctx;
  if (!callCtx) {
    const selectedKeyId = (await db.meta.get('selectedKeyId'))?.value;
    const allKeys = await db.keys.toArray();
    const keyRow =
      (selectedKeyId ? allKeys.find((k) => k.id === selectedKeyId) : null) || allKeys[0];
    if (!keyRow) return '';
    const { decryptKey } = await import('./crypto');
    const plainApiKey = await decryptKey({ iv: keyRow.iv, ct: keyRow.ct });
    const selectedModel = (await db.meta.get('selectedModel'))?.value;
    callCtx = {
      provider: keyRow.provider as ProviderId,
      baseUrl: keyRow.baseUrl,
      apiKey: plainApiKey,
      model: selectedModel || 'gemini-2.5-flash',
    };
  }

  const memories = await db.memories.toArray();
  if (memories.length === 0) {
    await db.meta.put({
      key: 'profile',
      value: { text: '', updatedAt: Date.now(), basedOnCount: 0 },
    });
    return '';
  }

  const factsList = memories.map((m) => `- ${m.text}`).join('\n');
  const prompt = `Write a neutral profile of the user in at most 250 words from these facts. Merge duplicates, keep only durable facts, no speculation, no sensitive details. Output plain text only.\n\n${factsList}`;

  try {
    const text = (await oneShot({ ...callCtx, prompt, maxTokens: 400 })).trim();
    const profileVal = {
      text,
      updatedAt: Date.now(),
      basedOnCount: memories.length,
    };
    await db.meta.put({ key: 'profile', value: profileVal });
    return text;
  } catch (err) {
    console.warn('rebuildProfile failed:', err);
    return '';
  }
}

export async function relevantMemories(
  query: string,
  currentProjectId?: string,
  limit = 10
): Promise<string[]> {
  const q = tok(query);
  const profile = await db.meta.get('profile');
  const all = await db.memories.toArray();
  const sorted = all
    .filter((m) => !m.projectId || m.projectId === currentProjectId)
    .map((m) => {
      const overlap = [...tok(m.text)].filter((t) => q.has(t)).length;
      const s =
        overlap +
        (m.pinned ? 0.5 : 0) +
        (currentProjectId && m.projectId === currentProjectId ? 0.3 : 0);
      return { m, s };
    })
    .filter((item) => item.s > 0 || item.m.pinned)
    .sort((a, b) => b.s - a.s || (b.m.lastUsedAt ?? 0) - (a.m.lastUsedAt ?? 0))
    .slice(0, limit);

  for (const item of sorted) {
    await db.memories.update(item.m.id, { lastUsedAt: Date.now() });
  }

  const results = sorted.map((x) => x.m.text);
  if (profile?.value?.text) results.unshift(profile.value.text);
  return results;
}
