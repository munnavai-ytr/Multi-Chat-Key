let pyodide = null;
self.onmessage = async (e) => {
  try {
    if (!pyodide) {
      self.postMessage({ status: 'loading' });
      importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
      pyodide = await loadPyodide();
    }
    let out = '';
    pyodide.setStdout({ batched: (s) => { out += s + '\n'; } });
    pyodide.setStderr({ batched: (s) => { out += s + '\n'; } });
    const r = await pyodide.runPythonAsync(e.data.code);
    if (r !== undefined && r !== null) out += '=> ' + String(r) + '\n';
    self.postMessage({ ok: true, out });
  } catch (err) { self.postMessage({ ok: false, out: String(err) }); }
};
