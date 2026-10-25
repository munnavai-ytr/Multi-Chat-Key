self.onmessage = (e) => {
  const logs = [];
  const fmt = (a) => a.map(x => typeof x === 'string' ? x : (() => { try { return JSON.stringify(x, null, 2); } catch { return String(x); } })()).join(' ');
  const console_ = { log: (...a) => logs.push(fmt(a)), error: (...a) => logs.push('ERROR: ' + fmt(a)), warn: (...a) => logs.push('WARN: ' + fmt(a)) };
  try {
    const result = new Function('console', e.data.code)(console_);
    if (result !== undefined) logs.push('=> ' + fmt([result]));
    self.postMessage({ ok: true, out: logs.join('\n') });
  } catch (err) { self.postMessage({ ok: false, out: logs.join('\n') + (logs.length ? '\n' : '') + String(err) }); }
};
