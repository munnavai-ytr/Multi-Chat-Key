import { db, DocRow } from '@/lib/db';
import { saveFile } from '@/lib/save-file';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function exportAll(includeFiles: boolean): Promise<void> {
  const meta = (await db.meta.toArray()).filter(
    (r) =>
      r.key !== 'mk' &&
      r.key !== 'searchKey' &&
      !r.key.startsWith('models:') &&
      !r.key.startsWith('toolsOff:')
  );

  let exportedDocs: any[] = [];
  if (includeFiles) {
    const rawDocs = await db.docs.toArray();
    exportedDocs = rawDocs.map((d) => ({
      ...d,
      dataB64: arrayBufferToBase64(d.data),
      data: undefined,
    }));
  }

  const data = {
    app: 'chatly',
    version: 2,
    exportedAt: Date.now(),
    chats: await db.chats.toArray(),
    messages: await db.messages.toArray(),
    projects: await db.projects.toArray(),
    pfiles: await db.pfiles.toArray(),
    memories: await db.memories.toArray(),
    meta,
    files: includeFiles ? await db.files.toArray() : [],
    docs: exportedDocs,
  };

  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  await saveFile(blob, `chatly-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function importAll(file: File) {
  const data = JSON.parse(await file.text());
  if (data?.app !== 'chatly' || !Array.isArray(data.chats) || !Array.isArray(data.messages)) {
    throw new Error('Not a Chatly backup');
  }

  const mergeNewer = async (table: any, rows: any[]) => {
    let n = 0;
    for (const r of rows ?? []) {
      const cur = await table.get(r.id);
      if (!cur || (r.updatedAt ?? 0) > (cur.updatedAt ?? 0)) {
        await table.put(r);
        n++;
      }
    }
    return n;
  };

  const c = await mergeNewer(db.chats, data.chats);
  await db.messages.bulkPut(data.messages);
  await mergeNewer(db.projects, data.projects);
  await db.pfiles.bulkPut(data.pfiles ?? []);
  await mergeNewer(db.memories, data.memories);

  if (data.files?.length) {
    await db.files.bulkPut(data.files);
  }

  if (data.docs?.length) {
    const restoredDocs: DocRow[] = data.docs.map((d: any) => ({
      id: d.id,
      chatId: d.chatId,
      msgId: d.msgId,
      name: d.name,
      format: d.format,
      mime: d.mime,
      size: d.size,
      createdAt: d.createdAt,
      data: d.dataB64 ? base64ToArrayBuffer(d.dataB64) : d.data || new ArrayBuffer(0),
    }));
    await db.docs.bulkPut(restoredDocs);
  }

  const filteredMeta = (data.meta || []).filter(
    (r: any) =>
      r.key !== 'mk' &&
      r.key !== 'searchKey' &&
      !r.key.startsWith('models:')
  );
  await db.meta.bulkPut(filteredMeta);

  return { chats: c, messages: data.messages.length };
}
