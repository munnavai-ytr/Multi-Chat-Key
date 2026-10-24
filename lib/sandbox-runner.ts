export function runInSandbox(
  lang: 'python' | 'javascript',
  code: string,
  timeoutMs = 20000
): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.display = 'none';

    const done = (r: { ok: boolean; out: string }) => {
      clearTimeout(t);
      window.removeEventListener('message', onMsg);
      iframe.remove();
      resolve(r);
    };

    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || e.data?.type !== 'result') return;
      done({ ok: !!e.data.ok, out: String(e.data.out ?? '').slice(0, 20000) });
    };

    const t = setTimeout(
      () => done({ ok: false, out: `Timed out after ${timeoutMs / 1000}s` }),
      timeoutMs
    );

    window.addEventListener('message', onMsg);

    const C = JSON.stringify(code).replace(/</g, '\\u003c');
    const head = `const logs=[];const fmt=a=>a.map(x=>typeof x==='string'?x:(()=>{try{return JSON.stringify(x,null,2)}catch{return String(x)}})()).join(' ');const con={log:(...a)=>logs.push(fmt(a)),error:(...a)=>logs.push('ERROR: '+fmt(a)),warn:(...a)=>logs.push('WARN: '+fmt(a))};const send=(ok,out)=>parent.postMessage({type:'result',ok,out},'*');const CODE=${C};`;
    const js = `<script>${head}(async()=>{try{const AF=Object.getPrototypeOf(async function(){}).constructor;const r=await new AF('console',CODE)(con);if(r!==undefined)logs.push('=> '+fmt([r]));send(true,logs.join('\\n'))}catch(err){send(false,logs.join('\\n')+'\\n'+String(err))}})();<\/script>`;
    const py = `<script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"><\/script><script>${head}(async()=>{try{const py=await loadPyodide();let out='';py.setStdout({batched:s=>{out+=s+'\\n'}});py.setStderr({batched:s=>{out+=s+'\\n'}});const r=await py.runPythonAsync(CODE);if(r!==undefined&&r!==null)out+='=> '+String(r)+'\\n';send(true,out)}catch(err){send(false,String(err))}})();<\/script>`;

    iframe.srcdoc = `<!doctype html><html><body>${
      lang === 'python' ? py : js
    }</body></html>`;
    document.body.appendChild(iframe);
  });
}
