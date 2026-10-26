import { db } from './db';
import { checkSyntax, isSyntaxCheckSupported } from './syntax-check';

function normalizePath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.json'];

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'stream/promises', 'stream/consumers', 'stream/web', 'string_decoder',
  'sys', 'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url',
  'util', 'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
]);

function getPackageName(spec: string): string {
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return parts.slice(0, 2).join('/');
  }
  return spec.split('/')[0];
}

function resolveCandidatePath(target: string, allPaths: Set<string>): boolean {
  const norm = normalizePath(target);
  for (const ext of RESOLVE_EXTS) {
    if (allPaths.has(norm + ext)) return true;
  }
  for (const idx of INDEX_FILES) {
    if (allPaths.has(norm + '/' + idx)) return true;
  }
  return false;
}

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

      case 'check_project': {
        const pathPrefix = args.path_prefix || '';
        const allFiles = await db.wsfiles.where('wsId').equals(ctx.wsId).toArray();
        const files = allFiles
          .filter((f) => f.path.startsWith(pathPrefix))
          .sort((a, b) => a.path.localeCompare(b.path))
          .slice(0, 1500);

        if (files.length === 0) {
          return { ok: true, text: `No files found${pathPrefix ? ' under ' + pathPrefix : ''}.` };
        }

        let checkedCount = 0;
        let skippedCount = 0;
        const countsByLang: Record<string, number> = {};
        const allErrors: string[] = [];

        for (let i = 0; i < files.length; i++) {
          if (i > 0 && i % 20 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }

          const f = files[i];
          if (!isSyntaxCheckSupported(f.path)) {
            skippedCount++;
            continue;
          }

          const ext = (f.path.split('.').pop() || '').toLowerCase();
          countsByLang[ext] = (countsByLang[ext] || 0) + 1;
          checkedCount++;

          const res = await checkSyntax(f.path, f.content);
          if (!res.ok) {
            allErrors.push(res.text);
          }
        }

        const langSummary = Object.entries(countsByLang)
          .sort((a, b) => b[1] - a[1])
          .map(([lang, count]) => `${lang}: ${count}`)
          .join(', ');

        const header = `Syntax check summary: ${checkedCount} checked, ${skippedCount} unsupported/skipped. Languages: [${langSummary || 'none'}].`;

        if (allErrors.length === 0) {
          return {
            ok: true,
            text: `${header}\nResult: All ${checkedCount} checked files passed syntax validation. No errors found.`,
          };
        }

        const displayedErrors = allErrors.slice(0, 50);
        let errorDetails = displayedErrors.join('\n\n');
        if (allErrors.length > 50) {
          errorDetails += `\n\n... and ${allErrors.length - 50} more errors.`;
        }

        let output = `${header}\nResult: Found ${allErrors.length} file(s) with syntax errors:\n\n${errorDetails}`;
        if (output.length > 8000) {
          output = output.slice(0, 8000) + '\n[truncated, output capped at 8,000 characters]';
        }

        return { ok: false, text: output };
      }

      case 'check_imports': {
        const pathPrefix = args.path_prefix || '';
        const allFiles = await db.wsfiles.where('wsId').equals(ctx.wsId).toArray();

        // Build set of normalized file paths for fast lookup
        const allPathsSet = new Set<string>();
        for (const f of allFiles) {
          allPathsSet.add(normalizePath(f.path));
        }

        // Parse package.json if present
        let declaredDeps: Set<string> | null = null;
        const pkgFile = allFiles.find((f) => normalizePath(f.path) === 'package.json' || normalizePath(f.path).endsWith('/package.json'));
        if (pkgFile) {
          try {
            const pkg = JSON.parse(pkgFile.content);
            declaredDeps = new Set([
              ...Object.keys(pkg.dependencies || {}),
              ...Object.keys(pkg.devDependencies || {}),
              ...Object.keys(pkg.peerDependencies || {}),
              ...Object.keys(pkg.optionalDependencies || {}),
            ]);
          } catch {
            // Malformed package.json
          }
        }

        // Parse tsconfig.json for paths/baseUrl aliases if present
        const tsconfigFile = allFiles.find((f) => normalizePath(f.path) === 'tsconfig.json');
        const pathAliases: { prefix: string; targets: string[] }[] = [];
        if (tsconfigFile) {
          try {
            const cleanJson = tsconfigFile.content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
            const tsconfig = JSON.parse(cleanJson);
            const paths = tsconfig?.compilerOptions?.paths || {};
            for (const [key, targets] of Object.entries(paths)) {
              if (Array.isArray(targets)) {
                const prefix = key.replace(/\*$/, '');
                const targetList = targets.map((t: any) => String(t).replace(/\*$/, '').replace(/^\.\/?/, ''));
                pathAliases.push({ prefix, targets: targetList });
              }
            }
          } catch {
            // Ignore tsconfig parse error
          }
        }

        // If no tsconfig aliases, provide common default @/ mapping
        if (pathAliases.length === 0) {
          pathAliases.push({ prefix: '@/', targets: ['', 'src/'] });
        }

        // Filter JS/TS files
        const jsTsFiles = allFiles
          .filter((f) => {
            if (pathPrefix && !f.path.startsWith(pathPrefix)) return false;
            const ext = (f.path.split('.').pop() || '').toLowerCase();
            return ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext);
          })
          .sort((a, b) => a.path.localeCompare(b.path))
          .slice(0, 1500);

        if (jsTsFiles.length === 0) {
          return { ok: true, text: `No JS/TS files found${pathPrefix ? ' under ' + pathPrefix : ''}.` };
        }

        const importRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]|export\s+(?:[\w*\s{},]*\s+from\s+)['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\))/g;

        const findings: string[] = [];
        let checkedFiles = 0;

        for (let i = 0; i < jsTsFiles.length; i++) {
          if (i > 0 && i % 20 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }

          const file = jsTsFiles[i];
          checkedFiles++;

          const fileDir = normalizePath(file.path.split('/').slice(0, -1).join('/'));
          const lines = file.content.split('\n');

          // Strip comments for cleaner regex matching
          const contentWithoutComments = file.content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, (match) => ' '.repeat(match.length));

          let m: RegExpExecArray | null;
          importRegex.lastIndex = 0;

          while ((m = importRegex.exec(contentWithoutComments)) !== null) {
            const spec = m[1] || m[2] || m[3] || m[4];
            if (!spec || spec.startsWith('http:') || spec.startsWith('https:') || spec.startsWith('data:')) {
              continue;
            }

            const lineNum = contentWithoutComments.slice(0, m.index).split('\n').length;

            // 1. Relative imports
            if (spec.startsWith('.')) {
              const target = fileDir ? `${fileDir}/${spec}` : spec;
              const exists = resolveCandidatePath(target, allPathsSet);
              if (!exists) {
                findings.push(`${file.path}:${lineNum}: Unresolved relative import "${spec}" (file not found)`);
                if (findings.length >= 60) break;
              }
              continue;
            }

            // 2. Path aliases
            let matchedAlias = false;
            for (const alias of pathAliases) {
              if (spec.startsWith(alias.prefix)) {
                matchedAlias = true;
                const rest = spec.slice(alias.prefix.length);
                let foundAny = false;
                for (const targetPrefix of alias.targets) {
                  const candidate = targetPrefix ? `${targetPrefix}${rest}` : rest;
                  if (resolveCandidatePath(candidate, allPathsSet)) {
                    foundAny = true;
                    break;
                  }
                }
                if (!foundAny) {
                  findings.push(`${file.path}:${lineNum}: Unresolved path alias "${spec}" (file not found)`);
                  if (findings.length >= 60) break;
                }
                break;
              }
            }
            if (matchedAlias) continue;

            // 3. Bare npm package imports
            if (spec.startsWith('node:')) continue;
            const pkgName = getPackageName(spec);
            if (NODE_BUILTINS.has(spec) || NODE_BUILTINS.has(pkgName)) continue;

            if (declaredDeps !== null && !declaredDeps.has(pkgName)) {
              findings.push(`${file.path}:${lineNum}: Undeclared npm dependency "${spec}" (missing in package.json)`);
              if (findings.length >= 60) break;
            }
          }

          if (findings.length >= 60) break;
        }

        const summary = `Checked imports in ${checkedFiles} JS/TS file(s).`;
        if (findings.length === 0) {
          return {
            ok: true,
            text: `${summary}\nResult: All imports resolved successfully. No missing files or undeclared dependencies detected.`,
          };
        }

        let output = `${summary}\nResult: Found ${findings.length} issue(s):\n\n${findings.slice(0, 60).join('\n')}`;
        if (findings.length >= 60) {
          output += '\n\n... and additional issues (capped at 60).';
        }
        if (output.length > 8000) {
          output = output.slice(0, 8000) + '\n[truncated, output capped at 8,000 characters]';
        }

        return { ok: false, text: output };
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
