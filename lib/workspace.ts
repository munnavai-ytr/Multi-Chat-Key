import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { db } from './db';
import { saveFile } from './save-file';

const IGNORE = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|\.turbo|\.cache|android\/build)(\/|$)/;
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|mov|wasm|keystore|jar|apk|aab|so|bin|lock)$/i;

export async function importZip(file: File, name?: string): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(data, {
    filter: (f) =>
      !f.name.endsWith('/') &&
      !IGNORE.test(f.name) &&
      !BINARY.test(f.name) &&
      f.originalSize <= 1_000_000,
  });
  const paths = Object.keys(entries);
  if (paths.length > 3000) {
    throw new Error('Too many files (max 3000). Remove build output and dependencies from the zip.');
  }
  const top =
    paths.every((p) => p.includes('/')) &&
    new Set(paths.map((p) => p.split('/')[0])).size === 1
      ? paths[0].split('/')[0] + '/'
      : '';
  const wsId = crypto.randomUUID();
  const now = Date.now();
  const rows = paths.map((p) => {
    const content = strFromU8(entries[p]);
    return {
      wsId,
      path: p.slice(top.length),
      content,
      size: content.length,
      updatedAt: now,
    };
  });

  await db.workspaces.put({
    id: wsId,
    name: name || file.name.replace(/\.zip$/i, ''),
    createdAt: now,
    updatedAt: now,
  });

  const CHUNK_SIZE = 200;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await db.wsfiles.bulkPut(rows.slice(i, i + CHUNK_SIZE));
    await new Promise((r) => setTimeout(r, 0));
  }

  return wsId;
}

export async function exportZip(wsId: string) {
  const files = await db.wsfiles.where('wsId').equals(wsId).toArray();
  const zipped = zipSync(Object.fromEntries(files.map((f) => [f.path, strToU8(f.content)])));
  const ws = await db.workspaces.get(wsId);
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
  const filename = (ws?.name || 'workspace') + '-fixed.zip';
  await saveFile(blob, filename);
}

export async function createEmptyWorkspace(name?: string): Promise<string> {
  const wsId = crypto.randomUUID();
  const now = Date.now();
  await db.workspaces.put({
    id: wsId,
    name: name?.trim() || 'New Workspace',
    createdAt: now,
    updatedAt: now,
  });
  return wsId;
}

export async function renameWorkspace(wsId: string, name: string): Promise<void> {
  await db.workspaces.update(wsId, {
    name: name.trim() || 'Workspace',
    updatedAt: Date.now(),
  });
}

export async function deleteWorkspace(wsId: string): Promise<void> {
  await db.workspaces.delete(wsId);
  await db.wsfiles.where('wsId').equals(wsId).delete();
  await db.wscheckpoints.where('wsId').equals(wsId).delete();
  const chats = await db.chats.filter((c) => c.workspaceId === wsId).toArray();
  for (const c of chats) {
    await db.chats.update(c.id, { workspaceId: undefined });
  }
}

export async function addFilesToWorkspace(wsId: string, files: FileList | File[]): Promise<number> {
  const now = Date.now();
  const rows: { wsId: string; path: string; content: string; size: number; updatedAt: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (BINARY.test(file.name) || file.size > 1_000_000) continue;
    const text = await file.text();
    rows.push({
      wsId,
      path: file.name,
      content: text,
      size: text.length,
      updatedAt: now,
    });
  }
  if (rows.length > 0) {
    await db.wsfiles.bulkPut(rows);
    await db.workspaces.update(wsId, { updatedAt: now });
  }
  return rows.length;
}

export async function startCheckpoint(wsId: string, label: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.wscheckpoints.put({
    id,
    wsId,
    label: (label || 'Task').slice(0, 60),
    createdAt: Date.now(),
    changes: [],
  });
  return id;
}

export async function recordChange(
  cpId: string,
  path: string,
  before: string | null,
  after: string | null
) {
  const cp = await db.wscheckpoints.get(cpId);
  if (!cp) return;
  const existing = cp.changes.find((c) => c.path === path);
  if (existing) {
    existing.after = after;
  } else {
    cp.changes.push({ path, before, after });
  }
  await db.wscheckpoints.put(cp);
}

export async function undoCheckpoint(cpId: string) {
  const cp = await db.wscheckpoints.get(cpId);
  if (!cp) return;
  for (const c of [...cp.changes].reverse()) {
    if (c.before === null) {
      await db.wsfiles.delete([cp.wsId, c.path]);
    } else {
      await db.wsfiles.put({
        wsId: cp.wsId,
        path: c.path,
        content: c.before,
        size: c.before.length,
        updatedAt: Date.now(),
      });
    }
  }
  await db.wscheckpoints.update(cpId, {
    label: cp.label.replace(' (undone)', '') + ' (undone)',
    changes: [],
  });
}

export async function cleanupEmptyCheckpoint(cpId: string): Promise<void> {
  const cp = await db.wscheckpoints.get(cpId);
  if (cp && (!cp.changes || cp.changes.length === 0)) {
    await db.wscheckpoints.delete(cpId);
  }
}
