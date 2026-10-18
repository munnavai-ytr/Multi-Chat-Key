export function buildSrcDoc(lang: string, code: string): string {
  const norm = (lang || '').toLowerCase();
  const base =
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif}</style>';

  if (norm === 'svg') {
    return `<!doctype html><html><head>${base}</head><body style="display:grid;place-items:center;min-height:100vh;background:#fff">${code}</body></html>`;
  }

  if (norm === 'jsx' || norm === 'tsx' || norm === 'react') {
    const safe = code.replace(/<\/script>/gi, '<\\/script>');
    const cleanedCode = safe
      .replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
    return `<!doctype html><html><head>${base}
<script src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script>window.addEventListener('error',function(e){document.body.innerHTML='<pre style="color:#b00020;padding:16px;white-space:pre-wrap;font:13px monospace">'+String(e.message).replace(/</g,'&lt;')+'</pre>'});</script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.4/babel.min.js"></script></head>
<body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
const { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext, createContext, Fragment } = React;
const __run = () => {
${cleanedCode.replace(/export default /g, 'const __App = ')}
  return typeof __App !== 'undefined' ? __App : (typeof App !== 'undefined' ? App : null);
};
const __C = __run();
ReactDOM.createRoot(document.getElementById('root')).render(__C ? React.createElement(__C) : React.createElement('pre', null, 'No component found. Export a default component or name it App.'));
</script></body></html>`;
  }

  return /<html/i.test(code)
    ? code
    : `<!doctype html><html><head>${base}</head><body>${code}</body></html>`;
}
