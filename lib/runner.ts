let pyWorker: Worker | null = null;

export async function runCode(lang: 'python' | 'py' | 'javascript' | 'js', code: string): Promise<{ ok: boolean; out: string }> {
  const isPython = lang === 'python' || lang === 'py';
  const workerScript = isPython ? '/py-worker.js' : '/js-worker.js';
  
  if (isPython && !pyWorker) {
    pyWorker = new Worker(workerScript);
  }
  
  const worker = isPython ? pyWorker! : new Worker(workerScript);
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      worker.terminate();
      if (isPython) pyWorker = null;
      resolve({ ok: false, out: 'Timed out after 10s' });
    }, 10000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      if (!isPython) worker.terminate();
      const out = String(e.data.out || '').slice(0, 20000);
      resolve({ ok: e.data.ok, out });
    };

    worker.postMessage({ code });
  });
}
