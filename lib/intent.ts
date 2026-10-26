import { oneShot } from './oneshot';

export async function routeIntent(
  text: string,
  ctx: { provider: any; baseUrl?: string; apiKey: string; model: string }
) {
  try {
    const raw = await oneShot({
      ...ctx,
      maxTokens: 80,
      prompt: `Classify the user message. Reply with ONLY JSON: {"search":"<short web query or empty string>","artifact":true|false}. "search" = a short query ONLY if the message needs current or unknown facts. "artifact" = true only if the user wants a web page, UI, game or chart built.\n\nMessage: ${text.slice(
        0,
        800
      )}`,
    });
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return { search: typeof j.search === 'string' ? j.search : '', artifact: !!j.artifact };
  } catch {
    return { search: '', artifact: false };
  }
}
