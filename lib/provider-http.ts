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

export const BLOCKED =
  /^(localhost|0\.0\.0\.0|\[.*\]|.*\.(local|internal)|127\.|10\.|192\.168\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/i;

export function buildUpstream(
  provider: string,
  baseUrl: string | undefined,
  apiKey: string,
  path: string
) {
  let base = BASES[provider];
  if (!base) {
    const u = new URL(baseUrl ?? '');
    if (u.protocol !== 'https:' || BLOCKED.test(u.hostname)) throw new Error('Blocked base URL');
    base = (baseUrl as string).replace(/\/$/, '');
  }
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('Bad path');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider === 'gemini') {
    headers['x-goog-api-key'] = apiKey;
  } else {
    headers['Authorization'] = 'Bearer ' + apiKey;
  }
  return { url: base + path, headers };
}
