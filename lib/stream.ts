import { proxyFetch, ProviderId } from './providers';

export type Part =
  | { kind: 'image'; mime: string; b64: string }
  | { kind: 'pdf'; name: string; b64: string }
  | { kind: 'text'; name: string; text: string };

export type Msg = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: Part[];
};

const fileText = (p: Extract<Part, { kind: 'text' }>) => `<file name="${p.name}">\n${p.text}\n</file>`;

function toOpenAI(m: Msg) {
  if (!m.parts || m.parts.length === 0) {
    return { role: m.role, content: m.content };
  }
  const textParts = m.parts
    .filter((p): p is Extract<Part, { kind: 'text' }> => p.kind === 'text')
    .map(fileText);
  const fullText = [m.content, ...textParts].filter(Boolean).join('\n\n');
  const imageParts = m.parts.filter(
    (p): p is Extract<Part, { kind: 'image' }> => p.kind === 'image'
  );
  const pdfParts = m.parts.filter(
    (p): p is Extract<Part, { kind: 'pdf' }> => p.kind === 'pdf'
  );

  if (imageParts.length === 0 && pdfParts.length === 0) {
    return { role: m.role, content: fullText };
  }

  const content: any[] = [];
  if (fullText) {
    content.push({ type: 'text', text: fullText });
  }
  for (const img of imageParts) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mime};base64,${img.b64}` },
    });
  }
  for (const pdf of pdfParts) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:application/pdf;base64,${pdf.b64}` },
    });
  }
  return { role: m.role, content };
}

function toAnthropic(m: Msg) {
  if (!m.parts || m.parts.length === 0) {
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
  }
  const content: any[] = [];
  for (const p of m.parts) {
    if (p.kind === 'text') {
      content.push({ type: 'text', text: fileText(p) });
    } else if (p.kind === 'image') {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: p.mime,
          data: p.b64,
        },
      });
    } else if (p.kind === 'pdf') {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: p.b64,
        },
      });
    }
  }
  if (m.content) {
    content.push({ type: 'text', text: m.content });
  }
  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }
  return { role: m.role === 'assistant' ? 'assistant' : 'user', content };
}

function toGemini(m: Msg) {
  const parts: any[] = [];
  if (m.parts) {
    for (const p of m.parts) {
      if (p.kind === 'text') {
        parts.push({ text: fileText(p) });
      } else if (p.kind === 'image') {
        parts.push({
          inlineData: {
            mimeType: p.mime,
            data: p.b64,
          },
        });
      } else if (p.kind === 'pdf') {
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: p.b64,
          },
        });
      }
    }
  }
  if (m.content) {
    parts.push({ text: m.content });
  }
  if (parts.length === 0) {
    parts.push({ text: '' });
  }
  return {
    role: m.role === 'assistant' ? 'model' : 'user',
    parts,
  };
}

async function* sse(res: Response) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  function* emit(block: string) {
    for (const line of block.split('\n')) {
      if (line.startsWith('data:')) {
        const d = line.slice(5).trim();
        if (d && d !== '[DONE]') yield d;
      }
    }
  }
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n/g, '\n');
    const parts = buf.split('\n\n');
    buf = parts.pop()!;
    for (const p of parts) yield* emit(p);
  }
  buf = (buf + dec.decode()).replace(/\r\n/g, '\n');
  if (buf.trim()) yield* emit(buf);
}

export async function* streamChat(o: {
  provider: ProviderId;
  baseUrl?: string;
  apiKey: string;
  model: string;
  messages: Msg[];
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const { provider, baseUrl, apiKey, model, messages, signal } = o;
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const chat = messages.filter((m) => m.role !== 'system');
  let path = '';
  let body: any;

  if (provider === 'anthropic') {
    path = '/messages';
    body = {
      model,
      max_tokens: 8192,
      stream: true,
      system: sys || undefined,
      messages: chat.map(toAnthropic),
    };
  } else if (provider === 'gemini') {
    path = `/models/${model}:streamGenerateContent?alt=sse`;
    body = {
      systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
      contents: chat.map(toGemini),
    };
  } else {
    path = '/chat/completions';
    body = { model, stream: true, messages: messages.map(toOpenAI) };
  }

  const res = await proxyFetch({ provider, baseUrl, apiKey, path, body, signal });
  if (!res.ok) {
    let t = '';
    try {
      t = await res.text();
    } catch {}
    throw new Error(friendlyError(res.status, t));
  }

  for await (const d of sse(res)) {
    let j: any;
    try {
      j = JSON.parse(d);
    } catch {
      continue;
    }
    if (j.error || j.type === 'error') {
      const msg = j.error?.message ?? j.message ?? 'Provider error';
      throw new Error('Provider error: ' + String(msg).slice(0, 200));
    }
    if (provider === 'anthropic') {
      if (j.type === 'content_block_delta' && j.delta?.text) yield j.delta.text;
    } else if (provider === 'gemini') {
      const t = (j.candidates?.[0]?.content?.parts ?? [])
        .filter((p: any) => !p.thought)
        .map((p: any) => p.text || '')
        .join('');
      if (t) yield t;
    } else {
      const t = j.choices?.[0]?.delta?.content;
      if (t) yield t;
    }
  }
}

export function friendlyError(status: number, raw: string) {
  if (status === 401 || status === 403) return 'Your API key was rejected. Check it in Settings.';
  if (status === 429) return 'Rate limit or quota reached for this key. Try again later or switch key/model.';
  if (status === 404) return 'This model is not available for your key.';
  if (status >= 500) return 'The provider is having problems. Try again shortly.';
  return 'Request failed (' + status + '). ' + raw.slice(0, 200);
}
