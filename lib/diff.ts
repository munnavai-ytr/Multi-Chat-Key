export type DiffOp = { t: ' ' | '+' | '-'; s: string };

export function lineDiff(a: string, b: string): DiffOp[] {
  const A = a.split('\n'), B = b.split('\n');
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length - 1, eb = B.length - 1;
  while (ea >= s && eb >= s && A[ea] === B[eb]) { ea--; eb--; }
  const mA = A.slice(s, ea + 1), mB = B.slice(s, eb + 1);
  const ops: DiffOp[] = A.slice(0, s).map(x => ({ t: ' ', s: x }));
  if (mA.length * mB.length > 4_000_000) { mA.forEach(x => ops.push({ t: '-', s: x })); mB.forEach(x => ops.push({ t: '+', s: x })); }
  else {
    const n = mA.length, m = mB.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = mA[i] === mB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) { if (mA[i] === mB[j]) { ops.push({ t: ' ', s: mA[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: '-', s: mA[i++] }); else ops.push({ t: '+', s: mB[j++] }); }
    while (i < n) ops.push({ t: '-', s: mA[i++] }); while (j < m) ops.push({ t: '+', s: mB[j++] });
  }
  for (let k = ea + 1; k < A.length; k++) ops.push({ t: ' ', s: A[k] });
  return ops;
}
