export function buildSrcDoc(lang: string, code: string): string {
  const base = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif}</style>';
  if (lang === 'svg') return `<!doctype html><html><head>${base}</head><body style="display:grid;place-items:center;min-height:100vh;background:#fff">${code}</body></html>`;
  if (lang === 'jsx' || lang === 'tsx') {
    const safe = code.replace(/<\/script>/gi, '<\\/script>');
    return `<!doctype html><html><head>${base}
<script src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.4/babel.min.js"></script></head>
<body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
const { useState, useEffect, useRef, useMemo, useCallback } = React;
${safe.replace(/^\s*import .*$/gm, '').replace(/export default /g, 'const __App = ')}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(typeof __App !== 'undefined' ? __App : (typeof App !== 'undefined' ? App : () => null)));
</script></body></html>`;
  }
  return /<html/i.test(code) ? code : `<!doctype html><html><head>${base}</head><body>${code}</body></html>`;
}
