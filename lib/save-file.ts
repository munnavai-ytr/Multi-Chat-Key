import { Capacitor } from '@capacitor/core';

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}

export async function saveFile(blob: Blob, name: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const res = await Filesystem.writeFile({
        path: name,
        data: await blobToBase64(blob),
        directory: Directory.Cache,
      });
      await Share.share({ title: name, url: res.uri, dialogTitle: 'Save or share' });
      return;
    } catch (err) {
      console.warn('Native save/share failed, falling back to browser download', err);
    }
  }

  const file = new File([blob], name, { type: blob.type });
  if (
    typeof navigator !== 'undefined' &&
    (navigator as any).canShare?.({ files: [file] }) &&
    /Android|iPhone|iPad/i.test(navigator.userAgent)
  ) {
    try {
      await (navigator as any).share({ files: [file], title: name });
      return;
    } catch {
      /* fall through to standard download */
    }
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
