import { db } from './db';
import { checkSyntax } from './syntax-check';

export async function executeWsTool(
  name: string,
  args: any,
  ctx: {
    wsId: string;
    requestApproval: (change: { path: string; before: string | null; after: string | null }) => Promise<boolean>;
    recordChange: (path: string, before: string | null, after: string | null) => Promise<void>;
    setPlan: (tasks: { title: string; status: 'todo' | 'doing' | 'done' }[]) => void;
  }
): Promise<{ ok: boolean; text: string }> {
  try {
    switch (name) {
      case 'list_files': {
        const pathPrefix = args.path || '';
        const files = await db.wsfiles.where('wsId').equals(ctx.wsId).toArray();
        const paths = files
          .map((f) => f.path)
          .filter((p) => p.startsWith(pathPrefix))
          .sort();
        return { ok: true, text: paths.length > 0 ? paths.join('\n') : 'No files found.' };
      }

      case 'read_file': {
        const file = await db.wsfiles.get({ wsId: ctx.wsId, path: args.path });
        if (!file) {
          const similar = await db.wsfiles.where('wsId').equals(ctx.wsId).limit(1000).toArray();
          const matches = similar.filter((f) => f.path.endsWith('/' + args.path) || f.path === args.path).slice(0, 5);
          return {
            ok: false,
            text: `File not found. Similar files:${matches.length ? '\n' + matches.map((f) => f.path).join('\n') : ' None found.'}`,
          };
        }
        const lines = file.content.split('\n');
        const start = Math.max(0, (args.start_line || 1) - 1);
        const end = args.end_line ? Math.min(lines.length, args.end_line) : Math.min(lines.length, start + 400);
        const sliced = lines.slice(start, end);
        const result = sliced.map((line, i) => `${start + i + 1}\t${line}`).join('\n');
        return {
          ok: true,
          text: result.length > 12000 ? result.slice(0, 12000) + '\n[truncated, use start_line/end_line]' : result,
        };
      }

      case 'search_code': {
        const files = await db.wsfiles.where('wsId').equals(ctx.wsId).toArray();
        const regex = args.regex ? new RegExp(args.query, 'i') : null;
        const hits: string[] = [];
        for (const f of files) {
          const lines = f.content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex ? regex.test(lines[i]) : lines[i].toLowerCase().includes(args.query.toLowerCase())) {
              hits.push(`${f.path}:${i + 1}: ${lines[i].trim()}`);
              if (hits.length >= 50) break;
            }
          }
          if (hits.length >= 50) break;
        }
        return { ok: true, text: hits.length > 0 ? hits.join('\n') : 'No matches found.' };
      }

      case 'edit_file': {
        if (!args.old_str) return { ok: false, text: 'old_str cannot be empty.' };
        const file = await db.wsfiles.get({ wsId: ctx.wsId, path: args.path });
        if (!file) return { ok: false, text: 'File not found.' };
        const occurrences = file.content.split(args.old_str).length - 1;
        if (occurrences === 0) return { ok: false, text: 'old_str not found. Re-read the file with read_file and copy the exact text including whitespace.' };
        if (occurrences > 1 && !args.replace_all) return { ok: false, text: `old_str found ${occurrences} times; add surrounding lines to make it unique.` };
        
        const after = args.replace_all 
          ? file.content.split(args.old_str).join(args.new_str)
          : file.content.replace(args.old_str, () => args.new_str);
          
        const approved = await ctx.requestApproval({ path: args.path, before: file.content, after });
        if (!approved) return { ok: false, text: 'The user rejected this edit.' };
        
        await db.wsfiles.update([ctx.wsId, args.path], { content: after, updatedAt: Date.now() });
        await ctx.recordChange(args.path, file.content, after);
        const check = await checkSyntax(args.path, after);
        return { ok: true, text: `Edited ${args.path}. ${check.text}` };
      }

      case 'create_file': {
        const exists = await db.wsfiles.get({ wsId: ctx.wsId, path: args.path });
        if (exists) return { ok: false, text: 'File already exists, use edit_file.' };
        
        const approved = await ctx.requestApproval({ path: args.path, before: null, after: args.content });
        if (!approved) return { ok: false, text: 'The user rejected this creation.' };
        
        await db.wsfiles.put({ wsId: ctx.wsId, path: args.path, content: args.content, size: args.content.length, updatedAt: Date.now() });
        await ctx.recordChange(args.path, null, args.content);
        const check = await checkSyntax(args.path, args.content);
        return { ok: true, text: `Created ${args.path}. ${check.text}` };
      }

      case 'delete_file': {
        const file = await db.wsfiles.get({ wsId: ctx.wsId, path: args.path });
        if (!file) return { ok: false, text: 'File not found.' };
        
        const approved = await ctx.requestApproval({ path: args.path, before: file.content, after: null });
        if (!approved) return { ok: false, text: 'The user rejected this deletion.' };
        
        await db.wsfiles.delete([ctx.wsId, args.path]);
        await ctx.recordChange(args.path, file.content, null);
        return { ok: true, text: `Deleted ${args.path}.` };
      }

      case 'check_syntax': {
        const file = await db.wsfiles.get({ wsId: ctx.wsId, path: args.path });
        if (!file) return { ok: false, text: 'File not found.' };
        return await checkSyntax(args.path, file.content);
      }

      case 'update_plan': {
        ctx.setPlan(args.tasks);
        return { ok: true, text: 'Plan updated.' };
      }

      default:
        return { ok: false, text: `Unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { ok: false, text: e.message };
  }
}
