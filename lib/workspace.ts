import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { db } from './db';

const IGNORE = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|\.turbo|\.cache|android\/build)(\/|$)/;
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|mov|wasm|keystore|jar|apk|aab|so|bin|lock)$/i;

export async function importZip(file: File, name?: string): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(data, { filter: f => !f.name.endsWith('/') && !IGNORE.test(f.name) && !BINARY.test(f.name) && f.originalSize <= 1_000_000 });
  let paths = Object.keys(entries);
  if (paths.length > 3000) throw new Error('Too many files (max 3000). Remove build output and dependencies from the zip.');
  const top = paths.every(p => p.includes('/')) && new Set(paths.map(p => p.split('/')[0])).size === 1 ? paths[0].split('/')[0] + '/' : '';
  const wsId = crypto.randomUUID(); const now = Date.now();
  const rows = paths.map(p => { const content = strFromU8(entries[p]); return { wsId, path: p.slice(top.length), content, size: content.length, updatedAt: now }; });
  await db.workspaces.put({ id: wsId, name: name || file.name.replace(/\.zip$/i, ''), createdAt: now, updatedAt: now });
  await db.wsfiles.bulkPut(rows);
  return wsId;
}

export async function exportZip(wsId: string) {
  const files = await db.wsfiles.where('wsId').equals(wsId).toArray();
  const zipped = zipSync(Object.fromEntries(files.map(f => [f.path, strToU8(f.content)])));
  const ws = await db.workspaces.get(wsId);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
  a.download = (ws?.name || 'workspace') + '-fixed.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
