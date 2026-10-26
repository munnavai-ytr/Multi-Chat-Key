import { db } from './db';

let mkPromise: Promise<CryptoKey> | null = null;
function master(): Promise<CryptoKey> {
  return (mkPromise ??= (async () => {
    const row = await db.meta.get('mk');
    if (row) return row.value as CryptoKey;
    const k = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    await db.meta.put({ key: 'mk', value: k });
    return k;
  })());
}

export async function encryptKey(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    await master(),
    new TextEncoder().encode(plain)
  );
  return { iv, ct };
}

export async function decryptKey(p: { iv: Uint8Array; ct: ArrayBuffer }) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: p.iv as unknown as BufferSource },
    await master(),
    p.ct
  );
  return new TextDecoder().decode(pt);
}
