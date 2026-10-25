import { webSearch, SearchHit } from './search';
import { runInSandbox } from './sandbox-runner';
import { db, DocRow } from './db';
import { saveMemoryFact, tok } from './memory';
import { decryptKey } from './crypto';
import { executeWsTool } from './ws-tools';
import { recordChange } from './workspace';
import { useUIStore } from '@/store/ui';
import { buildDocument } from './docgen';
import { runResearch } from './research';

export interface ToolCtx {
  chatId: string;
  msgId: string;
  signal?: AbortSignal;
  confirmRun: (lang: string, code: string) => Promise<boolean>;
  openArtifact: (a: { id: string; title: string; type: string; code: string }) => void;
  wsId?: string;
  checkpointId?: string;
  setPlan?: (tasks: { title: string; status: 'todo' | 'doing' | 'done' }[]) => void;
  onProgress?: (detail: string) => void;
  llm?: { provider: any; baseUrl?: string; apiKey: string; model: string };
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
): Promise<{
  text: string;
  sources?: { id?: number; title: string; url: string }[];
  artifact?: any;
  document?: { id: string; name: string; format: string; size: number };
  ok: boolean;
  ends_tools?: boolean;
}> {
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

    if (call.name === 'deep_research') {
      const row = (await db.meta.get('searchKey'))?.value;
      if (!row) {
        return {
          ok: false,
          text: 'Tavily API key is not configured for Deep Research. Please add a Tavily key in Settings.',
        };
      }
      const tavilyKey = await decryptKey(row);

      const question = String(call.args.question || '').trim();
      if (!question) {
        return { ok: false, text: 'No research question provided.' };
      }

      const autoResearch = (await db.meta.get('researchAuto'))?.value === true;
      const defaultDepth =
        ((await db.meta.get('researchDepth'))?.value as 'quick' | 'standard' | 'deep') || 'standard';
      let chosenDepth: 'quick' | 'standard' | 'deep' = (call.args.depth as any) || defaultDepth;

      if (!autoResearch) {
        const confirmRes = await new Promise<{
          confirmed: boolean;
          depth: 'quick' | 'standard' | 'deep';
        }>((resolve) => {
          useUIStore.getState().setResearchConfirmModal({
            question,
            defaultDepth: chosenDepth,
            resolve,
          });
        });

        if (!confirmRes.confirmed) {
          return { ok: false, text: 'The user cancelled the research.' };
        }
        chosenDepth = confirmRes.depth;
      }

      if (!ctx.llm) {
        return { ok: false, text: 'No active LLM session found for research.' };
      }

      const res = await runResearch({
        question,
        depth: chosenDepth,
        llm: ctx.llm,
        searchKey: tavilyKey,
        onProgress: (p) => {
          if (ctx.onProgress) {
            ctx.onProgress(p.text);
          }
        },
        signal: ctx.signal || new AbortController().signal,
      });

      return {
        ok: true,
        ends_tools: true,
        sources: res.sources,
        text:
          res.dossier +
          '\n\nINSTRUCTIONS: Write the final report now using ONLY these notes. Structure: title, 3-5 line summary, sections with headings, a short "Uncertainty and gaps" part. Every factual sentence must end with citations like [S2] or [S2][S5]. Never cite an id that does not exist and never add facts that are not in the notes.',
      };
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
      const chat = await db.chats.get(ctx.chatId);
      const category = call.args.category || 'other';
      const saved = await saveMemoryFact(
        String(call.args.fact || ''),
        category,
        chat?.projectId
      );
      return { ok: true, text: saved ? 'Saved to memory.' : 'Not saved (duplicate or sensitive).' };
    }

    if (call.name === 'search_chats') {
      const q = String(call.args.query || '').trim();
      const limit = Math.min(10, Math.max(1, Number(call.args.limit) || 5));
      const qTokens = tok(q);
      if (qTokens.size === 0) return { ok: true, text: 'No matching chats.' };

      const allChats = await db.chats.toArray();
      const validChats = new Map<string, (typeof allChats)[0]>();
      for (const c of allChats) {
        if (!c.incognito && c.id !== ctx.chatId) {
          validChats.set(c.id, c);
        }
      }

      const stats = new Map<
        string,
        {
          chat: (typeof allChats)[0];
          sum: number;
          msgCount: number;
          bestMsgs: { overlap: number; line: string }[];
        }
      >();

      let scannedCount = 0;
      await db.messages.each((msg) => {
        if (scannedCount >= 20000) return;
        scannedCount++;

        const chat = validChats.get(msg.chatId);
        if (!chat) return;

        let entry = stats.get(msg.chatId);
        if (!entry) {
          entry = { chat, sum: 0, msgCount: 0, bestMsgs: [] };
          stats.set(msg.chatId, entry);
        }
        entry.msgCount++;

        const mTokens = tok(msg.content);
        let overlap = 0;
        qTokens.forEach((t) => {
          if (mTokens.has(t)) overlap++;
        });

        if (overlap > 0) {
          entry.sum += overlap;
          const snippet = `${msg.role}: ${msg.content.slice(0, 300)}`;
          entry.bestMsgs.push({ overlap, line: snippet });
          entry.bestMsgs.sort((a, b) => b.overlap - a.overlap);
          if (entry.bestMsgs.length > 2) {
            entry.bestMsgs.length = 2;
          }
        }
      });

      const scoredChats: { chat: (typeof allChats)[0]; score: number; bestMsgs: string[] }[] = [];
      for (const entry of stats.values()) {
        if (entry.sum > 0 && entry.msgCount > 0) {
          const score = entry.sum / Math.sqrt(entry.msgCount);
          scoredChats.push({
            chat: entry.chat,
            score,
            bestMsgs: entry.bestMsgs.map((b) => b.line),
          });
        }
      }

      scoredChats.sort((a, b) => b.score - a.score);
      const top = scoredChats.slice(0, limit);
      if (top.length === 0) return { ok: true, text: 'No matching chats.' };

      const lines = top.map((t) => {
        const d = new Date(t.chat.updatedAt).toISOString().slice(0, 10);
        return `[${t.chat.title}, ${d}]\n` + t.bestMsgs.join('\n');
      });

      const res = lines.join('\n\n').slice(0, 6000);
      return { ok: true, text: res };
    }

    if (call.name === 'forget') {
      const q = String(call.args.query || '').trim();
      const qTokens = tok(q);
      if (qTokens.size === 0) return { ok: true, text: 'No matching memory.' };

      const allMemories = await db.memories.toArray();
      const toDelete = allMemories
        .filter((m) => {
          const mTokens = tok(m.text);
          return [...qTokens].every((t) => mTokens.has(t));
        })
        .slice(0, 5);

      if (!toDelete.length) return { ok: true, text: 'No matching memory.' };
      await db.memories.bulkDelete(toDelete.map((m) => m.id));
      return {
        ok: true,
        text: `Deleted: ` + toDelete.map((m) => m.text).join('; '),
      };
    }

    if (call.name === 'create_document') {
      try {
        const { blob, name, mime } = await buildDocument(call.args);
        const data = await blob.arrayBuffer();
        const docId = crypto.randomUUID();
        const format = (call.args?.format || 'file').toLowerCase();
        const sizeKb = Math.max(1, Math.round(data.byteLength / 1024));

        const docRow: DocRow = {
          id: docId,
          chatId: ctx.chatId,
          msgId: ctx.msgId,
          name,
          format,
          mime,
          size: data.byteLength,
          data,
          createdAt: Date.now(),
        };
        await db.docs.put(docRow);

        const docItem = {
          id: docId,
          name,
          format,
          size: data.byteLength,
        };

        const existingMsg = await db.messages.get(ctx.msgId);
        if (existingMsg) {
          const nextDocs = [...(existingMsg.documents || []), docItem];
          await db.messages.update(ctx.msgId, { documents: nextDocs });
        }

        return {
          ok: true,
          text: `Created ${name} (${sizeKb} KB). It is shown to the user as a download card.`,
          document: docItem,
        };
      } catch (err: any) {
        return {
          ok: false,
          text: `Document creation failed: ${String(err?.message || err)}. Please retry with simpler content or fewer blocks.`,
        };
      }
    }

    return { ok: false, text: 'Unknown tool.' };
  } catch (e: any) {
    return { ok: false, text: 'Tool failed: ' + String(e?.message || e).slice(0, 200) };
  }
}
