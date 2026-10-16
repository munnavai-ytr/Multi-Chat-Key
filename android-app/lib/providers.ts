export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'openrouter' | 'custom';

export interface ModelInfo {
  id: string;
  name: string;
  tier?: 'free' | 'paid' | 'unknown';
}

export const BASES: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export function detectProvider(key: string): ProviderId | null {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}

export type KeyStatus = 'valid' | 'invalid' | 'limited' | 'unknown';

export async function proxyFetch(p: {
  provider: ProviderId;
  baseUrl?: string;
  apiKey: string;
  path: string;
  method?: string;
  body?: any;
  signal?: AbortSignal;
}) {
  return fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
    signal: p.signal,
  });
}

export function tierFor(
  provider: ProviderId,
  id: string,
  pricing?: { prompt?: string; completion?: string }
): 'free' | 'paid' | 'unknown' {
  if (provider === 'openrouter') {
    if (id.endsWith(':free')) return 'free';
    if (pricing && Number(pricing.prompt) === 0 && Number(pricing.completion) === 0) return 'free';
    return 'paid';
  }
  if (provider === 'groq') return 'free';
  if (provider === 'gemini') {
    return /(flash|flash-lite|gemma)/i.test(id) && !/(pro|image|veo|imagen)/i.test(id) ? 'free' : 'paid';
  }
  if (provider === 'openai' || provider === 'anthropic') return 'paid';
  return 'unknown';
}

export async function listModels(
  provider: ProviderId,
  apiKey: string,
  baseUrl?: string
): Promise<{ status: KeyStatus; models: ModelInfo[] }> {
  const path = provider === 'gemini' ? '/models?pageSize=1000' : provider === 'anthropic' ? '/models?limit=1000' : '/models';

  const res = await proxyFetch({ provider, baseUrl, apiKey, path, method: 'GET' });
  if (res.status === 401 || res.status === 403 || res.status === 400) return { status: 'invalid', models: [] };
  if (res.status === 429) return { status: 'limited', models: [] };
  if (!res.ok) return { status: 'unknown', models: [] };
  const j = await res.json();
  let models: ModelInfo[] = [];

  const NON_CHAT = /(embed|whisper|tts|dall-e|moderation|transcribe|realtime|audio|image|guard|davinci|babbage)/i;

  if (provider === 'gemini') {
    models = (j.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => {
        const id = m.name.replace('models/', '');
        return {
          id,
          name: m.displayName || m.name,
          tier: tierFor(provider, id),
        };
      });
  } else if (provider === 'anthropic') {
    models = (j.data || []).map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
      tier: tierFor(provider, m.id),
    }));
  } else if (provider === 'openrouter') {
    models = (j.data || []).map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      tier: tierFor(provider, m.id, m.pricing),
    }));
  } else {
    models = (j.data || [])
      .filter((m: any) => !NON_CHAT.test(m.id))
      .map((m: any) => ({
        id: m.id,
        name: m.id,
        tier: tierFor(provider, m.id),
      }));
  }
  models.sort((a, b) => a.name.localeCompare(b.name));
  return { status: 'valid', models };
}
