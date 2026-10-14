import { proxyFetch, ProviderId } from './providers';

export type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

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
    body = { model, max_tokens: 8192, stream: true, system: sys || undefined, messages: chat };
  } else if (provider === 'gemini') {
    path = `/models/${model}:streamGenerateContent?alt=sse`;
    body = {
      systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
      contents: chat.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    };
  } else {
    path = '/chat/completions';
    body = { model, stream: true, messages };
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
