let esb: any = null;
async function getEsbuild() {
  if (!esb) {
    const m: any = await import('esbuild-wasm');
    await m.initialize({ wasmURL: '/esbuild.wasm' });
    esb = m;
  }
  return esb;
}

let parserReady: Promise<{ Parser: any; Language: any }> | null = null;
const langs = new Map<string, any>();

async function getParser(grammar: string) {
  parserReady ??= (async () => {
    const m: any = await import('web-tree-sitter');
    const Parser = m.Parser ?? m.default ?? m;
    await Parser.init({
      locateFile: (f: string) => '/ts/' + f,
    });
    return { Parser, Language: m.Language ?? Parser.Language };
  })();

  const { Parser, Language } = await parserReady;
  if (!langs.has(grammar)) {
    try {
      const loaded = await Language.load(`/ts/tree-sitter-${grammar}.wasm`);
      langs.set(grammar, loaded);
    } catch (err: any) {
      throw new Error(`Failed to load grammar ${grammar} (/ts/tree-sitter-${grammar}.wasm): ${err?.message || 'version mismatch'}`);
    }
  }
  const p = new Parser();
  p.setLanguage(langs.get(grammar));
  return p;
}

function collectErrors(node: any, path: string, out: string[], max = 5) {
  if (out.length >= max) return;
  const missing = typeof node.isMissing === 'function' ? node.isMissing() : Boolean(node.isMissing);
  if (node.type === 'ERROR' || missing) {
    const raw = typeof node.text === 'string' ? node.text : '';
    const preview = raw.slice(0, 40).replace(/\s+/g, ' ');
    const row = (node.startPosition?.row ?? 0) + 1;
    const col = (node.startPosition?.column ?? 0) + 1;
    out.push(`${path}:${row}:${col} ${missing ? 'missing ' + node.type : 'syntax error near "' + preview + '"'}`);
    return;
  }
  const hasErr = typeof node.hasError === 'function' ? node.hasError() : Boolean(node.hasError);
  if (hasErr && Array.isArray(node.children)) {
    for (const c of node.children) {
      collectErrors(c, path, out, max);
      if (out.length >= max) break;
    }
  }
}

async function checkTreeSitter(grammar: string, path: string, code: string): Promise<{ ok: boolean; text: string }> {
  try {
    const parser = await getParser(grammar);
    const tree = parser.parse(code);
    const errors: string[] = [];
    collectErrors(tree.rootNode, path, errors, 5);
    return {
      ok: errors.length === 0,
      text: errors.length > 0 ? errors.join('\n') : `Syntax OK (${path})`,
    };
  } catch (err: any) {
    return {
      ok: false,
      text: `${path}: tree-sitter parser failed (${err?.message || 'version mismatch or missing grammar wasm'})`,
    };
  }
}

export const EXT_TO_GRAMMAR: Record<string, string> = {
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cxx: 'cpp',
  cs: 'c_sharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  dart: 'dart',
  py: 'python',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  bash: 'bash',
  sql: 'sql',
};

export function isSyntaxCheckSupported(path: string): boolean {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return Boolean(
    ext === 'json' ||
    ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext) ||
    EXT_TO_GRAMMAR[ext]
  );
}

export async function checkSyntax(path: string, code: string): Promise<{ ok: boolean; text: string }> {
  if (code.length > 500_000) {
    return { ok: true, text: `Skipped (${path}): file too large to check (> 500,000 characters)` };
  }

  const ext = (path.split('.').pop() || '').toLowerCase();

  // JSON fast path
  if (ext === 'json') {
    try {
      JSON.parse(code);
      return { ok: true, text: `JSON OK (${path})` };
    } catch (e: any) {
      return { ok: false, text: `${path}: ${e.message}` };
    }
  }

  // Python: tree-sitter first, fallback to pyodide
  if (ext === 'py') {
    try {
      const res = await checkTreeSitter('python', path, code);
      if (res.ok || !res.text.includes('tree-sitter parser failed')) {
        return res;
      }
    } catch {
      // fallback
    }
    try {
      const { runInSandbox } = await import('./sandbox-runner');
      const r = await runInSandbox('python', `compile(${JSON.stringify(code)}, ${JSON.stringify(path)}, 'exec')\nprint('Syntax OK')`);
      return { ok: r.ok, text: r.out || (r.ok ? `Syntax OK (${path})` : 'Failed') };
    } catch (e: any) {
      return { ok: false, text: `${path}: Python syntax check failed (${e?.message || 'error'})` };
    }
  }

  // JS/TS family: esbuild
  const loader = ({ ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js' } as any)[ext];
  if (loader) {
    try {
      const e = await getEsbuild();
      await e.transform(code, { loader, sourcefile: path, logLevel: 'silent' });
      return { ok: true, text: `Syntax OK (${path})` };
    } catch (err: any) {
      const msgs = (err.errors || []).slice(0, 5).map((m: any) => `${path}:${m.location?.line}:${m.location?.column} ${m.text}`);
      return { ok: false, text: msgs.join('\n') || String(err.message) };
    }
  }

  // Multi-language: tree-sitter
  const grammar = EXT_TO_GRAMMAR[ext];
  if (grammar) {
    return await checkTreeSitter(grammar, path, code);
  }

  return { ok: true, text: `No checker for .${ext}` };
}
