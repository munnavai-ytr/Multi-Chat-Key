export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'openrouter'
  | 'mistral'
  | 'deepseek'
  | 'xai'
  | 'together'
  | 'cerebras'
  | 'custom';

export type ModelKind = 'chat' | 'image' | 'audio' | 'embedding' | 'moderation' | 'other';

export function kindFor(id: string, methods?: string[]): ModelKind {
  const s = id.toLowerCase();
  if (methods?.length) {
    if (methods.includes('embedContent') || methods.includes('embedText')) return 'embedding';
    if (methods.includes('predict') || methods.includes('predictLongRunning')) return 'image';
    if (methods.includes('generateContent'))
      return /tts|audio|native-audio/.test(s) ? 'audio' : /image|imagen/.test(s) ? 'image' : 'chat';
    return 'other';
  }
  if (/embed/.test(s)) return 'embedding';
  if (/moderation|guard/.test(s)) return 'moderation';
  if (/whisper|transcribe|tts|audio|realtime|speech/.test(s)) return 'audio';
  if (/dall-e|gpt-image|image|imagen|sora|flux|stable-diffusion|sdxl/.test(s)) return 'image';
  return 'chat';
}

export interface ModelInfo {
  id: string;
  name: string;
  tier?: 'free' | 'paid' | 'unknown';
  kind?: ModelKind;
}

export const BASES: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com',
  xai: 'https://api.x.ai/v1',
  together: 'https://api.together.xyz/v1',
  cerebras: 'https://api.cerebras.ai/v1',
};

export function detectProvider(key: string): ProviderId | null {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('xai-')) return 'xai';
  if (k.startsWith('csk-')) return 'cerebras';
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
  if (provider === 'groq' || provider === 'cerebras') return 'free';
  if (provider === 'gemini') {
    return /(flash|flash-lite|gemma)/i.test(id) && !/(pro|image|veo|imagen)/i.test(id) ? 'free' : 'paid';
  }
  if (
    provider === 'openai' ||
    provider === 'anthropic' ||
    provider === 'deepseek' ||
    provider === 'xai'
  ) {
    return 'paid';
  }
  return 'unknown';
}

export async function listModels(
  provider: ProviderId,
  apiKey: string,
  baseUrl?: string
): Promise<{ status: KeyStatus; models: ModelInfo[]; detail?: string }> {
  const path =
    provider === 'gemini'
      ? '/models?pageSize=1000'
      : provider === 'anthropic'
        ? '/models?limit=1000'
        : '/models';

  let res: Response;
  try {
    res = await proxyFetch({ provider, baseUrl, apiKey, path, method: 'GET' });
  } catch (e: any) {
    return {
      status: 'unknown',
      models: [],
      detail: 'Network error: ' + (e?.message || String(e)),
    };
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const detail = `HTTP ${res.status}: ${t.slice(0, 160)}`;

    if (res.status === 401) {
      return { status: 'invalid', models: [], detail };
    }
    if (res.status === 429) {
      return { status: 'limited', models: [], detail };
    }
    if (res.status === 403) {
      if (/region|country|location|territory|not supported/i.test(t)) {
        return { status: 'unknown', models: [], detail };
      }
      return { status: 'invalid', models: [], detail };
    }
    if (res.status === 400) {
      if (/api.?key|API_KEY_INVALID|invalid|unauthorized|incorrect/i.test(t)) {
        return { status: 'invalid', models: [], detail };
      }
      return { status: 'unknown', models: [], detail };
    }
    return { status: 'unknown', models: [], detail };
  }

  let j: any;
  try {
    j = await res.json();
  } catch (e: any) {
    return {
      status: 'unknown',
      models: [],
      detail: 'JSON parse error: ' + (e?.message || String(e)),
    };
  }

  let models: ModelInfo[] = [];

  if (provider === 'gemini') {
    let allGeminiModels: any[] = [];
    if (Array.isArray(j.models)) {
      allGeminiModels.push(...j.models);
    }
    let pageToken: string | undefined = j.nextPageToken;

    while (pageToken) {
      const p = `/models?pageSize=1000&pageToken=${encodeURIComponent(pageToken)}`;
      try {
        const nextRes = await proxyFetch({ provider, baseUrl, apiKey, path: p, method: 'GET' });
        if (!nextRes.ok) break;
        const nextJson = await nextRes.json().catch(() => null);
        if (!nextJson) break;
        if (Array.isArray(nextJson.models)) {
          allGeminiModels.push(...nextJson.models);
        }
        pageToken = nextJson.nextPageToken;
      } catch {
        break;
      }
    }

    models = allGeminiModels.map((m: any) => {
      const id = m.name.replace(/^models\//, '');
      return {
        id,
        name: m.displayName || m.name,
        tier: tierFor(provider, id),
        kind: kindFor(id, m.supportedGenerationMethods),
      };
    });
  } else if (provider === 'anthropic') {
    let allAnthropicModels: any[] = [];
    if (Array.isArray(j.data)) {
      allAnthropicModels.push(...j.data);
    }
    let hasMore = Boolean(j.has_more);
    let afterId = j.last_id ?? allAnthropicModels[allAnthropicModels.length - 1]?.id;

    while (hasMore && afterId) {
      const p = `/models?limit=1000&after_id=${encodeURIComponent(afterId)}`;
      try {
        const nextRes = await proxyFetch({ provider, baseUrl, apiKey, path: p, method: 'GET' });
        if (!nextRes.ok) break;
        const nextJson = await nextRes.json().catch(() => null);
        if (!nextJson || !Array.isArray(nextJson.data)) break;
        allAnthropicModels.push(...nextJson.data);
        hasMore = Boolean(nextJson.has_more);
        afterId = nextJson.last_id ?? nextJson.data[nextJson.data.length - 1]?.id;
      } catch {
        break;
      }
    }

    models = allAnthropicModels.map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
      tier: tierFor(provider, m.id),
      kind: kindFor(m.id),
    }));
  } else if (provider === 'openrouter') {
    const arr = Array.isArray(j) ? j : (j.data ?? j.models ?? []);
    models = arr.map((m: any) => {
      const id = m.id ?? m.name ?? '';
      return {
        id,
        name: m.name || id,
        tier: tierFor(provider, id, m.pricing),
        kind: kindFor(id),
      };
    });
  } else {
    // openai, groq, mistral, deepseek, xai, cerebras, custom, together
    const arr = Array.isArray(j) ? j : (j.data ?? j.models ?? []);
    models = arr.map((m: any) => {
      const id = m.id ?? m.name ?? '';
      return {
        id,
        name: m.name || id,
        tier: tierFor(provider, id),
        kind: kindFor(id),
      };
    });
  }

  // Sort: chat models first, then other kinds, then alphabetically
  models.sort((a, b) => {
    const aChat = (a.kind ?? 'chat') === 'chat';
    const bChat = (b.kind ?? 'chat') === 'chat';
    if (aChat && !bChat) return -1;
    if (!aChat && bChat) return 1;
    const kindComp = (a.kind ?? 'chat').localeCompare(b.kind ?? 'chat');
    if (kindComp !== 0) return kindComp;
    return a.name.localeCompare(b.name);
  });

  return { status: 'valid', models };
}
