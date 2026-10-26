import { proxyFetch, ProviderId } from './providers';
import { ToolDef, toOpenAITools, toAnthropicTools, toGeminiTools } from './tools';
import { db } from './db';
import { ProviderError, EmptyResponseError, friendlyError } from './errors';

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
  | {
      role: 'system' | 'user' | 'assistant';
      content: string;
      parts?: Part[];
      toolCalls?: ToolCall[];
      thinkingBlocks?: any[];
    }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'usage'; in: number; out: number }
  | { type: 'assistant_meta'; thinkingBlocks?: any[] };

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
    if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: [
          ...(m.thinkingBlocks || []),
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args })),
        ],
      });
    } else {
      out.push(toAnthropic(m as Msg));
    }
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
  thinkingLevel?: 'off' | 'auto' | 'high';
}): AsyncGenerator<AgentEvent> {
  const { provider, baseUrl, apiKey, model, messages, tools = [], signal, thinkingLevel = 'auto' } = o;
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const chat = messages.filter((m) => m.role !== 'system');
  let path = '';
  let body: any;
  let res: Response;

  if (provider === 'anthropic') {
    path = '/messages';
    const isKnownRejector = /haiku/i.test(model) && !/3-5|3\.5/i.test(model);
    const thinkingOff = isKnownRejector || (await db.meta.get(`thinkingOff:anthropic:${model}`))?.value === true;
    const baseAnthropicBody = {
      model,
      max_tokens: 8192,
      stream: true,
      system: sys || undefined,
      messages: toAnthropicAll(chat),
      ...(tools.length > 0 ? { tools: toAnthropicTools(tools) } : {}),
    };

    if (thinkingLevel !== 'off' && !thinkingOff) {
      const adaptiveBody = {
        ...baseAnthropicBody,
        thinking: { type: 'adaptive' },
      };
      res = await proxyFetch({ provider, baseUrl, apiKey, path, body: adaptiveBody, signal, stream: true });
      if (!res.ok) {
        let errText = '';
        try {
          errText = await res.clone().text();
        } catch {}
        if (res.status === 400 && /thinking/i.test(errText)) {
          // Retry ONCE with manual form
          const budget = thinkingLevel === 'high' ? 8000 : 3000;
          const manualBody = {
            ...baseAnthropicBody,
            max_tokens: Math.max(baseAnthropicBody.max_tokens, budget + 4000, 16000),
            thinking: { type: 'enabled', budget_tokens: budget },
          };
          res = await proxyFetch({ provider, baseUrl, apiKey, path, body: manualBody, signal, stream: true });
          if (!res.ok) {
            let manualErrText = '';
            try {
              manualErrText = await res.clone().text();
            } catch {}
            if (res.status === 400 && /thinking/i.test(manualErrText)) {
              await db.meta.put({ key: `thinkingOff:anthropic:${model}`, value: true });
              res = await proxyFetch({ provider, baseUrl, apiKey, path, body: baseAnthropicBody, signal, stream: true });
            }
          }
        }
      }
    } else {
      res = await proxyFetch({ provider, baseUrl, apiKey, path, body: baseAnthropicBody, signal, stream: true });
    }
  } else if (provider === 'gemini') {
    path = `/models/${model}:streamGenerateContent?alt=sse`;
    const wantsThinking = thinkingLevel !== 'off';
    const thinkingConfig = wantsThinking
      ? {
          includeThoughts: true,
          ...(/gemini-3/i.test(model)
            ? { thinkingLevel: thinkingLevel === 'high' ? 'high' : 'low' }
            : { thinkingBudget: thinkingLevel === 'high' ? 8192 : -1 }),
        }
      : undefined;

    body = {
      systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
      contents: toGeminiAll(chat),
      ...(thinkingConfig ? { generationConfig: { thinkingConfig } } : {}),
      ...(tools.length > 0 ? { tools: toGeminiTools(tools) } : {}),
    };
    res = await proxyFetch({ provider, baseUrl, apiKey, path, body, signal, stream: true });
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
    res = await proxyFetch({ provider, baseUrl, apiKey, path, body, signal, stream: true });
  }

  if (!res.ok) {
    let t = '';
    try {
      t = await res.text();
    } catch {}
    const pErr = new ProviderError(res.status, t, res.headers);
    pErr.provider = provider;
    pErr.model = model;
    throw pErr;
  }

  let anthropicInputTokens = 0;

  if (provider === 'anthropic') {
    let curTool: { id: string; name: string; args: string } | null = null;
    let currentThinkingBlock: { type: 'thinking'; thinking: string; signature: string } | null = null;
    const thinkBlocks: any[] = [];
    let stopReason: string | null = null;
    let emittedContent = false;

    for await (const d of sse(res)) {
      let j: any;
      try {
        j = JSON.parse(d);
      } catch {
        continue;
      }
      if (j.error || j.type === 'error') {
        const msg = j.error?.message ?? j.message ?? 'Provider error';
        const pErr = new ProviderError(500, String(msg));
        pErr.provider = provider;
        pErr.model = model;
        throw pErr;
      }
      if (j.type === 'message_start') {
        anthropicInputTokens = j.message?.usage?.input_tokens ?? 0;
      } else if (j.type === 'message_delta') {
        if (j.delta?.stop_reason) stopReason = j.delta.stop_reason;
        yield { type: 'usage', in: anthropicInputTokens, out: j.usage?.output_tokens ?? 0 };
      } else if (j.type === 'content_block_start') {
        if (j.content_block?.type === 'thinking') {
          currentThinkingBlock = { type: 'thinking', thinking: '', signature: '' };
        } else if (j.content_block?.type === 'redacted_thinking') {
          thinkBlocks.push(j.content_block);
        } else if (j.content_block?.type === 'tool_use') {
          curTool = { id: j.content_block.id, name: j.content_block.name, args: '' };
        }
      } else if (j.type === 'content_block_delta') {
        if (j.delta?.type === 'thinking_delta' && j.delta.thinking) {
          if (currentThinkingBlock) {
            currentThinkingBlock.thinking += j.delta.thinking;
          }
          yield { type: 'thinking', text: j.delta.thinking };
        } else if (j.delta?.type === 'signature_delta' && j.delta.signature) {
          if (currentThinkingBlock) {
            currentThinkingBlock.signature = j.delta.signature;
          }
        } else if (j.delta?.type === 'text_delta' && j.delta.text) {
          emittedContent = true;
          yield { type: 'text', text: j.delta.text };
        } else if (j.delta?.type === 'input_json_delta' && curTool) {
          curTool.args += j.delta.partial_json;
        }
      } else if (j.type === 'content_block_stop') {
        if (currentThinkingBlock) {
          thinkBlocks.push(currentThinkingBlock);
          currentThinkingBlock = null;
        }
        if (curTool) {
          emittedContent = true;
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

    if (thinkBlocks.length > 0) {
      yield { type: 'assistant_meta', thinkingBlocks: thinkBlocks };
    }

    if (!emittedContent) {
      throw new EmptyResponseError(stopReason || 'NO_OUTPUT');
    }
  } else if (provider === 'gemini') {
    let finishReason: string | null = null;
    let blockReason: string | null = null;
    let emittedContent = false;

    for await (const d of sse(res)) {
      let j: any;
      try {
        j = JSON.parse(d);
      } catch {
        continue;
      }
      if (j.error || j.type === 'error') {
        const msg = j.error?.message ?? j.message ?? 'Provider error';
        const pErr = new ProviderError(500, String(msg));
        pErr.provider = provider;
        pErr.model = model;
        throw pErr;
      }
      if (j.promptFeedback?.blockReason) {
        blockReason = j.promptFeedback.blockReason;
      }
      if (j.candidates?.[0]?.finishReason) {
        finishReason = j.candidates[0].finishReason;
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
          emittedContent = true;
          yield {
            type: 'tool_call',
            call: {
              id: crypto.randomUUID(),
              name: p.functionCall.name,
              args: p.functionCall.args ?? {},
              raw: p,
            },
          };
        } else if (p.thought && p.text) {
          yield { type: 'thinking', text: p.text };
        } else if (p.text) {
          emittedContent = true;
          yield { type: 'text', text: p.text };
        }
      }
    }

    if (!emittedContent) {
      throw new EmptyResponseError(finishReason || blockReason || 'NO_OUTPUT');
    }
  } else {
    const acc: Record<number, { id: string; name: string; args: string }> = {};
    let finishReason: string | null = null;
    let emittedContent = false;

    for await (const d of sse(res)) {
      let j: any;
      try {
        j = JSON.parse(d);
      } catch {
        continue;
      }
      if (j.error || j.type === 'error') {
        const msg = j.error?.message ?? j.message ?? 'Provider error';
        const pErr = new ProviderError(500, String(msg));
        pErr.provider = provider;
        pErr.model = model;
        throw pErr;
      }
      if (j.choices?.[0]?.finish_reason) {
        finishReason = j.choices[0].finish_reason;
      }
      if (j.usage) {
        yield {
          type: 'usage',
          in: j.usage.prompt_tokens ?? 0,
          out: j.usage.completion_tokens ?? 0,
        };
      }
      const delta = j.choices?.[0]?.delta;
      if (delta) {
        const reasoning = delta.reasoning_content || delta.reasoning;
        if (reasoning) {
          yield { type: 'thinking', text: reasoning };
        }
        for (const tc of delta.tool_calls ?? []) {
          const a = (acc[tc.index ?? 0] ??= { id: '', name: '', args: '' });
          if (tc.id) a.id = tc.id;
          if (tc.function?.name) a.name += tc.function.name;
          if (tc.function?.arguments) a.args += tc.function.arguments;
        }
        const t = delta.content;
        if (t) {
          emittedContent = true;
          yield { type: 'text', text: t };
        }
      }
    }
    for (const idxStr of Object.keys(acc)) {
      const a = acc[Number(idxStr)];
      if (a.name) {
        emittedContent = true;
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

    if (!emittedContent) {
      throw new EmptyResponseError(finishReason || 'NO_OUTPUT');
    }
  }
}

export function friendlyError(status: number, raw: string) {
  if (status === 401 || status === 403) return 'Your API key was rejected. Check it in Settings.';
  if (status === 429) {
    let extra = '';
    if (raw) {
      try {
        const j = JSON.parse(raw);
        const msg = j.error?.message || j.message;
        if (msg) extra = String(msg).trim().slice(0, 120);
      } catch {
        extra = raw.trim().slice(0, 120);
      }
    }
    return extra
      ? `Rate limit or quota reached for this key. Try again later or switch key/model. (${extra})`
      : 'Rate limit or quota reached for this key. Try again later or switch key/model.';
  }
  if (status === 404) return 'This model is not available for your key.';
  if (status >= 500) return `The provider or proxy returned an error (${status}). ${raw.slice(0, 160)}`;
  return 'Request failed (' + status + '). ' + raw.slice(0, 200);
}
