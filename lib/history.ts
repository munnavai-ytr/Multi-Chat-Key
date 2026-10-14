import { db, ChatRow } from './db';

export function groupChats(chats: ChatRow[]) {
  const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const today = startOfDay(Date.now()), day = 86400000;
  const g: { label: string; items: ChatRow[] }[] = [
    { label: 'Pinned', items: [] }, { label: 'Today', items: [] }, { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] }, { label: 'Older', items: [] },
  ];
  for (const c of chats) {
    if (c.pinned) { g[0].items.push(c); continue; }
    const t = c.updatedAt;
    (t >= today ? g[1] : t >= today - day ? g[2] : t >= today - 7 * day ? g[3] : g[4]).items.push(c);
  }
  return g.filter(x => x.items.length);
}

export async function searchChats(q: string): Promise<ChatRow[]> {
  const s = q.toLowerCase().trim();
  const all = await db.chats.orderBy('updatedAt').reverse().toArray();
  if (!s) return all;
  const hit = new Set<string>();
  await db.messages.each(m => { if (m.content.toLowerCase().includes(s)) hit.add(m.chatId); });
  return all.filter(c => c.title.toLowerCase().includes(s) || hit.has(c.id));
}
