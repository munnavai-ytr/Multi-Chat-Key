import { proxyFetch, ProviderId } from './providers';
import { ToolDef, toOpenAITools, toAnthropicTools, toGeminiTools } from './tools';

export type Part =
  | { kind: 'image'; mime: string; b64: string }
  | { kind: 'pdf'; name: string; b64: string }
  | { kind: 'text'; name: string; text: string };

export type Msg = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: Part[];
};

export type ToolCall = { id: string; name: string; args: any; raw?: any };
export type AMsg =
  | { role: 'system' | 'user' | 'assistant'; content: string; parts?: Part[]; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'usage'; in: number; out: number };

const fileText = (p: Extract<Part, { kind: 'text' }>) => `<file name="${p.name}">\n${p.text}\n</file>`;

function toOpenAI(m: Msg, provider: ProviderId) {
  if (!m.parts || m.parts.length === 0) {
    return { role: m.role, content: m.content };
  }
  const textParts = m.parts
    .filter((p): p is Extract<Part, { kind: 'text' }> => p.kind === 'text')
    .map(fileText);

  const imageParts = m.parts.filter(
    (p): p is Extract<Part, { kind: 'image' }> => p.kind === 'image'
  );
  const pdfParts = m.parts.filter(
    (p): p is Extract<Part, { kind: 'pdf' }> => p.kind === 'pdf'
  );

  const validPdfs: Extract<Part, { kind: 'pdf' }>[] = [];
  const omittedPdfNotes: string[] = [];

  for (const pdf of pdfParts) {
    if (provider === 'openai' || provider === 'openrouter') {
      validPdfs.push(pdf);
    } else {
      omittedPdfNotes.push(`[PDF "${pdf.name}" omitted: this provider does not support PDF input]`);
    }
  }

  const allText = [m.content, ...textParts, ...omittedPdfNotes].filter(Boolean).join('\n\n');

  if (imageParts.length === 0 && validPdfs.length === 0) {
    return { role: m.role, content: allText };
  }

  const content: any[] = [];
  if (allText) {
    content.push({ type: 'text', text: allText });
  }
  for (const img of imageParts) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mime};base64,${img.b64}` },
    });
  }
  for (const pdf of validPdfs) {
    content.push({
      type: 'file',
      file: {
        filename: pdf.name,
        file_data: `data:application/pdf;base64,${pdf.b64}`,
      },
    });
  }
  return { role: m.role, content };
}

function toOpenAIA(m: AMsg, provider: ProviderId) {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  if (m.role === 'assistant' && m.toolCalls?.length)
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    };
  return toOpenAI(m as Msg, provider);
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

function toAnthropicAll(msgs: AMsg[]) {
  const out: any[] = [];
  let pending: any[] = [];
  const flush = () => {
    if (pending.length) {
      out.push({ role: 'user', content: pending });
      pending = [];
    }
  };
  for (const m of msgs) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      pending.push({ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content });
      continue;
    }
    flush();
    if (m.role === 'assistant' && m.toolCalls?.length)
      out.push({
        role: 'assistant',
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args })),
        ],
      });
    else out.push(toAnthropic(m as Msg));
  }
  flush();
  return out;
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

function toGeminiAll(msgs: AMsg[]) {
  const out: any[] = [];
  let pending: any[] = [];
  const flush = () => {
    if (pending.length) {
      out.push({ role: 'user', parts: pending });
      pending = [];
    }
  };
  for (const m of msgs) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      pending.push({ functionResponse: { name: m.name, response: { result: m.content } } });
      continue;
    }
    flush();
    if (m.role === 'assistant' && m.toolCalls?.length)
      out.push({
        role: 'model',
        parts: [
          ...(m.content ? [{ text: m.content }] : []),
          ...m.toolCalls.map((c) => c.raw ?? { functionCall: { name: c.name, args: c.args } }),
        ],
      });
    else out.push(toGemini(m as Msg));
  }
  flush();
  return out;
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

const safeJson = (s: string) => {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
};

export async function* streamChat(o: {
  provider: ProviderId;
  baseUrl?: string;
  apiKey: string;
  model: string;
  messages: AMsg[];
  tools?: ToolDef[];
  signal?: AbortSignal;
}): AsyncGenerator<AgentEvent> {
  const { provider, baseUrl, apiKey, model, messages, tools = [], signal } = o;
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
      messages: toAnthropicAll(chat),
      ...(tools.length > 0 ? { tools: toAnthropicTools(tools) } : {}),
    };
  } else if (provider === 'gemini') {
    path = `/models/${model}:streamGenerateContent?alt=sse`;
    body = {
      systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
      contents: toGeminiAll(chat),
      ...(tools.length > 0 ? { tools: toGeminiTools(tools) } : {}),
    };
  } else {
    path = '/chat/completions';
    body = {
      model,
      stream: true,
      messages: [
        ...(sys ? [{ role: 'system', content: sys }] : []),
        ...chat.map((m) => toOpenAIA(m, provider)),
      ],
      ...(provider === 'openai' || provider === 'openrouter' ? { stream_options: { include_usage: true } } : {}),
      ...(tools.length > 0 ? { tools: toOpenAITools(tools) } : {}),
    };
  }

  const res = await proxyFetch({ provider, baseUrl, apiKey, path, body, signal });
  if (!res.ok) {
    let t = '';
    try {
      t = await res.text();
    } catch {}
    throw new Error(friendlyError(res.status, t));
  }

  let anthropicInputTokens = 0;

  if (provider === 'anthropic') {
    let curTool: { id: string; name: string; args: string } | null = null;
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
      if (j.type === 'message_start') {
        anthropicInputTokens = j.message?.usage?.input_tokens ?? 0;
      } else if (j.type === 'message_delta') {
        yield { type: 'usage', in: anthropicInputTokens, out: j.usage?.output_tokens ?? 0 };
      } else if (j.type === 'content_block_start') {
        if (j.content_block?.type === 'tool_use') {
          curTool = { id: j.content_block.id, name: j.content_block.name, args: '' };
        }
      } else if (j.type === 'content_block_delta') {
        if (j.delta?.type === 'text_delta' && j.delta.text) {
          yield { type: 'text', text: j.delta.text };
        } else if (j.delta?.type === 'input_json_delta' && curTool) {
          curTool.args += j.delta.partial_json;
        }
      } else if (j.type === 'content_block_stop') {
        if (curTool) {
          yield {
            type: 'tool_call',
            call: {
              id: curTool.id,
              name: curTool.name,
              args: safeJson(curTool.args),
            },
          };
          curTool = null;
        }
      }
    }
  } else if (provider === 'gemini') {
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
      if (j.usageMetadata) {
        yield {
          type: 'usage',
          in: j.usageMetadata.promptTokenCount ?? 0,
          out: j.usageMetadata.candidatesTokenCount ?? 0,
        };
      }
      const parts = j.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        if (p.functionCall) {
          yield {
            type: 'tool_call',
            call: {
              id: crypto.randomUUID(),
              name: p.functionCall.name,
              args: p.functionCall.args ?? {},
              raw: p,
            },
          };
        } else if (p.text && !p.thought) {
          yield { type: 'text', text: p.text };
        }
      }
    }
  } else {
    const acc: Record<number, { id: string; name: string; args: string }> = {};
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
      if (j.usage) {
        yield {
          type: 'usage',
          in: j.usage.prompt_tokens ?? 0,
          out: j.usage.completion_tokens ?? 0,
        };
      }
      for (const tc of j.choices?.[0]?.delta?.tool_calls ?? []) {
        const a = (acc[tc.index ?? 0] ??= { id: '', name: '', args: '' });
        if (tc.id) a.id = tc.id;
        if (tc.function?.name) a.name += tc.function.name;
        if (tc.function?.arguments) a.args += tc.function.arguments;
      }
      const t = j.choices?.[0]?.delta?.content;
      if (t) yield { type: 'text', text: t };
    }
    for (const idxStr of Object.keys(acc)) {
      const a = acc[Number(idxStr)];
      if (a.name) {
        yield {
          type: 'tool_call',
          call: {
            id: a.id || crypto.randomUUID(),
            name: a.name,
            args: safeJson(a.args),
          },
        };
      }
    }
  }
}

export function friendlyError(status: number, raw: string) {
  if (status === 401 || status === 403) return 'Your API key was rejected. Check it in Settings.';
  if (status === 429) return 'Rate limit or quota reached for this key. Try again later or switch key/model.';
  if (status === 404) return 'This model is not available for your key.';
  if (status >= 500) return `The provider or proxy returned an error (${status}). ${raw.slice(0, 160)}`;
  return 'Request failed (' + status + '). ' + raw.slice(0, 200);
}
