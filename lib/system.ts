import { db, ChatRow } from './db';

export async function buildSystemPrompt(chat: ChatRow | undefined): Promise<string> {
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
        const text = f.text.slice(0, budget);
        budget -= text.length;
        parts.push(`Knowledge file "${f.name}":\n` + text);
      }
    }
  }
  return parts.join('\n\n');
}
