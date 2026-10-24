import { proxyFetch, ProviderId } from './providers';

export async function oneShot(o: {
  provider: ProviderId;
  baseUrl?: string;
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const { provider, baseUrl, apiKey, model, prompt, maxTokens = 300 } = o;
  let path = '', body: any;
  if (provider === 'gemini') {
    path = `/models/${model}:generateContent`;
    body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  } else if (provider === 'anthropic') {
    path = '/messages';
    body = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
  } else {
    path = '/chat/completions';
    body = { model, messages: [{ role: 'user', content: prompt }] };
  }
  const res = await proxyFetch({ provider, baseUrl, apiKey, path, body });
  if (!res.ok) throw new Error('oneShot failed ' + res.status);
  const j = await res.json();
  if (provider === 'gemini') return (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text || '').join('');
  if (provider === 'anthropic') return (j.content ?? []).map((c: any) => c.text || '').join('');
  return j.choices?.[0]?.message?.content || '';
}
