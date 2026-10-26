export type FileKind = 'image' | 'pdf' | 'text' | 'zip' | 'unsupported';

export interface ProcessedFile {
  name: string;
  mime: string;
  size: number;
  kind: FileKind;
  b64?: string;
  text?: string;
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES_PER_MSG = 5;
export const ACCEPTED_EXTENSIONS = 'image/*,application/pdf,.zip,application/zip,application/x-zip-compressed,.txt,.md,.json,.csv,.js,.ts,.tsx,.py,.html,.css';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const TEXT_EXT = /\.(txt|md|mdx|json|jsonc|csv|tsv|xml|yaml|yml|toml|ini|env|log|js|jsx|mjs|cjs|ts|tsx|py|java|kt|kts|c|h|cpp|hpp|cc|cs|go|rs|php|rb|swift|dart|sql|sh|bash|bat|ps1|html|htm|css|scss|less|vue|svelte|gradle|properties|gitignore|dockerfile)$/i;

export function detectKind(file: File): FileKind {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.zip') || mime === 'application/zip' || mime === 'application/x-zip-compressed') return 'zip';
  if (mime.startsWith('text/') || TEXT_EXT.test(name) || (!name.includes('.') && !mime)) return 'text';
  return 'unsupported';
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" exceeds the 10 MB limit (${formatFileSize(file.size)}).`;
  }
  return null;
}

// Convert ArrayBuffer to raw base64 (no data: prefix)
function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

// Downscale image on canvas to max 1568px on the longest side, export JPEG 0.85
async function processImage(file: File): Promise<{ b64: string; mime: string; size: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1568;
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to create canvas context'));
        return;
      }

      // Fill white background in case of transparent PNG/SVG converted to JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const commaIdx = dataUrl.indexOf(',');
      const rawB64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

      // Estimate compressed size from base64 length
      const compressedSize = Math.round((rawB64.length * 3) / 4);

      resolve({
        b64: rawB64,
        mime: 'image/jpeg',
        size: compressedSize,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image "${file.name}"`));
    };

    img.src = objectUrl;
  });
}

// Process PDF file: store base64 as-is (no data: prefix)
async function processPdf(file: File): Promise<{ b64: string; mime: string; size: number }> {
  const buffer = await file.arrayBuffer();
  const b64 = bufferToBase64(buffer);
  return {
    b64,
    mime: 'application/pdf',
    size: file.size,
  };
}

// Process text/code file: read as UTF-8 text, truncate at 200,000 chars
async function processText(file: File): Promise<{ text: string; mime: string; size: number }> {
  let content = await file.text();
  const MAX_CHARS = 200000;
  if (content.length > MAX_CHARS) {
    content = content.slice(0, MAX_CHARS) + '\n\n[truncated: first 200,000 characters]';
  }
  return {
    text: content,
    mime: file.type || 'text/plain',
    size: file.size,
  };
}

export async function processFile(file: File): Promise<ProcessedFile> {
  const kind = detectKind(file);

  if (kind === 'image') {
    const res = await processImage(file);
    return {
      name: file.name,
      mime: res.mime,
      size: res.size,
      kind: 'image',
      b64: res.b64,
    };
  }

  if (kind === 'pdf') {
    const res = await processPdf(file);
    return {
      name: file.name,
      mime: res.mime,
      size: res.size,
      kind: 'pdf',
      b64: res.b64,
    };
  }

  if (kind === 'text') {
    // Check first 4 KB for NUL byte (\0) to reject binary masquerading as text
    try {
      const slice = await file.slice(0, 4096).arrayBuffer();
      const bytes = new Uint8Array(slice);
      if (bytes.some((b) => b === 0)) {
        return {
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          kind: 'unsupported',
        };
      }
    } catch {}

    const res = await processText(file);
    return {
      name: file.name,
      mime: res.mime,
      size: res.size,
      kind: 'text',
      text: res.text,
    };
  }

  if (kind === 'zip') {
    return {
      name: file.name,
      mime: file.type || 'application/zip',
      size: file.size,
      kind: 'zip',
    };
  }

  return {
    name: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    kind: 'unsupported',
  };
}
