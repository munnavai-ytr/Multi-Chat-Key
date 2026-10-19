import { webSearch, SearchHit } from './search';
import { runInSandbox } from './sandbox-runner';
import { db } from './db';
import { decryptKey } from './crypto';
import { saveMemoryFact } from './memory';
import { executeWsTool } from './ws-tools';
import { recordChange } from './workspace';
import { useUIStore } from '@/store/ui';

export interface ToolCtx {
  chatId: string;
  msgId: string;
  signal?: AbortSignal;
  confirmRun: (lang: string, code: string) => Promise<boolean>;
  openArtifact: (a: { id: string; title: string; type: string; code: string }) => void;
  wsId?: string;
  checkpointId?: string;
  setPlan?: (tasks: { title: string; status: 'todo' | 'doing' | 'done' }[]) => void;
}

const WS_TOOL_NAMES = new Set([
  'list_files',
  'read_file',
  'search_code',
  'edit_file',
  'create_file',
  'delete_file',
  'check_syntax',
  'update_plan',
]);

export async function executeTool(
  call: { name: string; args: any },
  ctx: ToolCtx
): Promise<{ text: string; sources?: { title: string; url: string }[]; artifact?: any; ok: boolean }> {
  try {
    if (WS_TOOL_NAMES.has(call.name)) {
      if (!ctx.wsId) {
        return { ok: false, text: 'No workspace is attached to this chat.' };
      }
      const r = await executeWsTool(call.name, call.args, {
        wsId: ctx.wsId,
        requestApproval: (c) => useUIStore.getState().requestApproval(c),
        recordChange: (p, b, a) =>
          ctx.checkpointId ? recordChange(ctx.checkpointId, p, b, a) : Promise.resolve(),
        setPlan: ctx.setPlan || (() => {}),
      });
      return { ok: r.ok, text: r.text };
    }

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
      const saved = await saveMemoryFact(
        String(call.args.fact || ''),
        call.args.category || 'other'
      );
      return { ok: true, text: saved ? 'Saved to memory.' : 'Not saved (duplicate or sensitive).' };
    }

    if (call.name === 'search_chats') {
      const q = String(call.args.query || '').trim().toLowerCase();
      const limit = Number(call.args.limit) || 5;
      const tok = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
      const qTokens = tok(q);
      const allChats = await db.chats.toArray();
      const validChats = allChats.filter((c) => !c.incognito && c.id !== ctx.chatId);
      const chatScores: { chat: any; score: number; hits: string[] }[] = [];
      for (const chat of validChats) {
        const msgs = await db.messages.where('chatId').equals(chat.id).toArray();
        let matchCount = 0;
        const matchingSnippets: string[] = [];
        for (const m of msgs) {
          const mTokens = tok(m.content);
          let overlap = 0;
          qTokens.forEach((t) => {
            if (mTokens.has(t)) overlap++;
          });
          if (overlap > 0) {
            matchCount += overlap;
            matchingSnippets.push(`${m.role}: ${m.content.slice(0, 300)}`);
          }
        }
        if (matchCount > 0) {
          const score = matchCount / Math.sqrt(Math.max(1, msgs.length));
          chatScores.push({ chat, score, hits: matchingSnippets.slice(0, 2) });
        }
      }
      chatScores.sort((a, b) => b.score - a.score);
      const top = chatScores.slice(0, limit);
      if (!top.length) return { ok: true, text: 'No matching chats found.' };
      const res = top
        .map(
          (t) =>
            `[${t.chat.title}, ${new Date(t.chat.updatedAt).toLocaleDateString()}]\n` +
            t.hits.join('\n')
        )
        .join('\n\n');
      return { ok: true, text: res.slice(0, 6000) };
    }

    if (call.name === 'forget') {
      const q = String(call.args.query || '').trim();
      const tok = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
      const qTokens = tok(q);
      const allMemories = await db.memories.toArray();
      const toDelete = allMemories
        .filter((m) => {
          const mTokens = tok(m.text);
          return [...qTokens].every((t) => mTokens.has(t));
        })
        .slice(0, 5);
      if (!toDelete.length) return { ok: true, text: 'No matching memories found to forget.' };
      await db.memories.bulkDelete(toDelete.map((m) => m.id));
      return {
        ok: true,
        text: `Deleted memories:\n` + toDelete.map((m) => `- ${m.text}`).join('\n'),
      };
    }

    return { ok: false, text: 'Unknown tool.' };
  } catch (e: any) {
    return { ok: false, text: 'Tool failed: ' + String(e?.message || e).slice(0, 200) };
  }
}
