import { db } from '@/lib/db';

export async function exportAll(includeFiles: boolean) {
  const meta = (await db.meta.toArray()).filter(r => r.key !== 'mk' && r.key !== 'searchKey' && !r.key.startsWith('models:') && !r.key.startsWith('toolsOff:'));
  const data = { app: 'chatly', version: 1, exportedAt: Date.now(),
    chats: await db.chats.toArray(), messages: await db.messages.toArray(), projects: await db.projects.toArray(),
    pfiles: await db.pfiles.toArray(), memories: await db.memories.toArray(), meta,
    files: includeFiles ? await db.files.toArray() : [] };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `chatly-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function importAll(file: File) {
  const data = JSON.parse(await file.text());
  if (data?.app !== 'chatly' || !Array.isArray(data.chats) || !Array.isArray(data.messages)) throw new Error('Not a Chatly backup');
  const mergeNewer = async (table: any, rows: any[]) => { let n = 0; for (const r of rows ?? []) { const cur = await table.get(r.id); if (!cur || (r.updatedAt ?? 0) > (cur.updatedAt ?? 0)) { await table.put(r); n++; } } return n; };
  const c = await mergeNewer(db.chats, data.chats); await db.messages.bulkPut(data.messages);
  await mergeNewer(db.projects, data.projects); await db.pfiles.bulkPut(data.pfiles ?? []); await mergeNewer(db.memories, data.memories);
  if (data.files?.length) await db.files.bulkPut(data.files);
  
  const filteredMeta = (data.meta || []).filter((r: any) => 
    r.key !== 'mk' && r.key !== 'searchKey' && !r.key.startsWith('models:')
  );
  await db.meta.bulkPut(filteredMeta);
  
  return { chats: c, messages: data.messages.length };
}
