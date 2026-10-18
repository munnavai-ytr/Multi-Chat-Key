let esb: any = null;
async function getEsbuild() { if (!esb) { const m: any = await import('esbuild-wasm'); await m.initialize({ wasmURL: '/esbuild.wasm' }); esb = m; } return esb; }

export async function checkSyntax(path: string, code: string): Promise<{ ok: boolean; text: string }> {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'json') { try { JSON.parse(code); return { ok: true, text: 'JSON OK' }; } catch (e: any) { return { ok: false, text: path + ': ' + e.message }; } }
  if (ext === 'py') { const { runInSandbox } = await import('./sandbox-runner'); const r = await runInSandbox('python', `compile(${JSON.stringify(code)}, ${JSON.stringify(path)}, 'exec')\nprint('Syntax OK')`); return { ok: r.ok, text: r.out || (r.ok ? 'Syntax OK' : 'Failed') }; }
  const loader = ({ ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js' } as any)[ext];
  if (!loader) return { ok: true, text: 'No checker for .' + ext };
  try { const e = await getEsbuild(); await e.transform(code, { loader, sourcefile: path, logLevel: 'silent' }); return { ok: true, text: 'Syntax OK (' + path + ')' }; }
  catch (err: any) { const msgs = (err.errors || []).slice(0, 5).map((m: any) => `${path}:${m.location?.line}:${m.location?.column} ${m.text}`); return { ok: false, text: msgs.join('\n') || String(err.message) }; }
}
