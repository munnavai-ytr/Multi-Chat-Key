import { db, ChatRow } from './db';
import { relevantMemories } from './memory';

export async function buildSystemPrompt(
  chat: ChatRow | undefined,
  userText?: string,
  useMemory?: boolean
): Promise<string> {
  const parts: string[] = [];
  const ci = (await db.meta.get('customInstructions'))?.value as string | undefined;
  if (ci?.trim()) parts.push('User instructions (always follow):\n' + ci.trim());
  if (chat?.projectId) {
    const p = await db.projects.get(chat.projectId);
    if (p) {
      if (p.instructions.trim()) parts.push(`Project "${p.name}" instructions:\n` + p.instructions.trim());
      const files = await db.pfiles.where('projectId').equals(p.id).toArray();
      let budget = 60000;
      for (const f of files) {
        if (budget <= 0) break;
        const t = f.text.slice(0, budget);
        budget -= t.length;
        parts.push(`<project_file name="${f.name}">\n${t}\n</project_file>`);
      }
    }
  }

  if (chat?.artifactsEnabled) {
    parts.push(
      'When the user asks for a web page, UI, game, chart or diagram, output ONE self-contained html code block (inline CSS and JS, no external files except pinned cdn.jsdelivr.net scripts) or one jsx code block exporting a default React component.'
    );
  }

  const isIncognito = Boolean(chat?.incognito);
  const memoryEnabledMeta = (await db.meta.get('memoryEnabled'))?.value;
  const isMemoryEnabled = (useMemory !== undefined ? useMemory : (memoryEnabledMeta !== false)) && !isIncognito;

  if (isMemoryEnabled) {
    const memories = await relevantMemories(userText || '');
    if (memories.length > 0) {
      parts.push(
        'Things you know about the user (use naturally, never mention that you have a memory feature unless asked):\n' +
          memories.map((m) => `- ${m}`).join('\n')
      );
    }
  }

  return parts.join('\n\n');
}

export function trimHistory<T extends { content: string }>(msgs: T[], maxChars = 120000): T[] {
  let total = 0;
  const keep: T[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    total += msgs[i].content.length;
    if (total > maxChars && keep.length > 0) break;
    keep.unshift(msgs[i]);
  }
  return keep;
}
