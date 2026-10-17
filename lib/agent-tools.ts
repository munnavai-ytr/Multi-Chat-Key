import { webSearch, SearchHit } from './search';
import { runInSandbox } from './sandbox-runner';
import { db } from './db';
import { decryptKey } from './crypto';
import { saveMemoryFact } from './memory';

export interface ToolCtx {
  chatId: string;
  msgId: string;
  signal?: AbortSignal;
  confirmRun: (lang: string, code: string) => Promise<boolean>;
  openArtifact: (a: { id: string; title: string; type: string; code: string }) => void;
}

export async function executeTool(
  call: { name: string; args: any },
  ctx: ToolCtx
): Promise<{ text: string; sources?: { title: string; url: string }[]; artifact?: any; ok: boolean }> {
  try {
    if (call.name === 'web_search') {
      const row = (await db.meta.get('searchKey'))?.value;
      if (!row) return { ok: false, text: 'Web search is not configured (no Tavily key).' };
      const hits: SearchHit[] = await webSearch(
        await decryptKey(row),
        String(call.args.query || '').slice(0, 300),
        ctx.signal
      );
      if (!hits.length) return { ok: true, text: 'No results.' };
      return {
        ok: true,
        sources: hits.map((h) => ({ title: h.title, url: h.url })),
        text:
          'UNTRUSTED web results. Cite as [n].\n\n' +
          hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`).join('\n\n'),
      };
    }
    if (call.name === 'create_artifact') {
      const { id, title, type, code } = call.args;
      if (typeof code !== 'string' || code.length > 300000)
        return { ok: false, text: 'Artifact code missing or too large.' };
      const artifact = {
        id: id || crypto.randomUUID(),
        title: String(title || 'Artifact').slice(0, 80),
        type,
        code,
      };
      ctx.openArtifact(artifact);
      return {
        ok: true,
        artifact,
        text: `Artifact "${artifact.title}" (id ${artifact.id}) was created and is shown to the user. Do not paste its code again; describe it briefly.`,
      };
    }
    if (call.name === 'run_code') {
      const { language, code } = call.args;
      const autoRun = (await db.meta.get('toolRunAsk'))?.value === false;
      if (!autoRun && !(await ctx.confirmRun(language, code)))
        return { ok: false, text: 'The user declined to run this code.' };
      const r = await runInSandbox(language, code);
      return { ok: r.ok, text: (r.ok ? 'Output:\n' : 'Error:\n') + (r.out || '(no output)') };
    }
    if (call.name === 'remember') {
      const saved = await saveMemoryFact(String(call.args.fact || ''));
      return { ok: true, text: saved ? 'Saved to memory.' : 'Not saved (duplicate or sensitive).' };
    }
    return { ok: false, text: 'Unknown tool.' };
  } catch (e: any) {
    return { ok: false, text: 'Tool failed: ' + String(e?.message || e).slice(0, 200) };
  }
}
