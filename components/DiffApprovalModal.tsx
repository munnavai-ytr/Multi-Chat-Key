'use client';

import { useState, useMemo } from 'react';
import { useUIStore } from '@/store/ui';
import { lineDiff, DiffOp } from '@/lib/diff';
import { FileCode, Check, X, Plus, Trash2, Edit3, ShieldAlert } from 'lucide-react';

export function DiffApprovalModal() {
  const approval = useUIStore((s) => s.approval);
  const resolveApproval = useUIStore((s) => s.resolveApproval);
  const [autoApplyRest, setAutoApplyRest] = useState(false);

  const isNewFile = approval?.before === null;
  const isDeletedFile = approval?.after === null;

  const diffOps = useMemo<DiffOp[]>(() => {
    if (!approval) return [];
    if (isNewFile) {
      return (approval.after || '').split('\n').map((s) => ({ t: '+' as const, s }));
    }
    if (isDeletedFile) {
      return (approval.before || '').split('\n').map((s) => ({ t: '-' as const, s }));
    }
    return lineDiff(approval.before || '', approval.after || '');
  }, [approval, isNewFile, isDeletedFile]);

  // Extract hunks with 3 lines of context around changes
  const hunks = useMemo(() => {
    if (isNewFile || isDeletedFile) {
      return [{ startLine: 1, ops: diffOps }];
    }
    const result: { startLine: number; ops: DiffOp[] }[] = [];
    const n = diffOps.length;
    let i = 0;
    while (i < n) {
      if (diffOps[i].t !== ' ') {
        const start = Math.max(0, i - 3);
        let end = i;
        while (end < n && (diffOps[end].t !== ' ' || (end + 1 < n && diffOps[end + 1].t !== ' ') || (end + 2 < n && diffOps[end + 2].t !== ' ') || (end + 3 < n && diffOps[end + 3].t !== ' '))) {
          end++;
        }
        end = Math.min(n, end + 3);
        result.push({
          startLine: start + 1,
          ops: diffOps.slice(start, end),
        });
        i = end;
      } else {
        i++;
      }
    }
    return result.length > 0 ? result : [{ startLine: 1, ops: diffOps.slice(0, 10) }];
  }, [diffOps, isNewFile, isDeletedFile]);

  if (!approval) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0 bg-surface2/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-accent/15 text-accent shrink-0">
              <FileCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text truncate font-mono">
                  {approval.path}
                </span>
                {isNewFile && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                    New file
                  </span>
                )}
                {isDeletedFile && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                    Delete file
                  </span>
                )}
                {!isNewFile && !isDeletedFile && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                    Edit
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">Review proposed workspace change</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => resolveApproval(false, false)}
            aria-label="Reject"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diff Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs select-text bg-bg/50">
          {hunks.map((hunk, hIdx) => (
            <div key={hIdx} className="rounded-xl border border-border overflow-hidden bg-surface">
              {!isNewFile && !isDeletedFile && (
                <div className="bg-surface2 px-3 py-1 text-[11px] text-muted border-b border-border font-medium">
                  @@ Line {hunk.startLine} @@
                </div>
              )}
              <div className="divide-y divide-border/20 overflow-x-auto">
                {hunk.ops.map((op, opIdx) => {
                  const isAdd = op.t === '+';
                  const isDel = op.t === '-';
                  return (
                    <div
                      key={opIdx}
                      className={`flex items-start px-3 py-0.5 leading-5 whitespace-pre font-mono ${
                        isAdd
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : isDel
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : 'text-muted'
                      }`}
                    >
                      <span className="w-4 shrink-0 select-none font-bold">
                        {op.t === '+' ? '+' : op.t === '-' ? '-' : ' '}
                      </span>
                      <span className="flex-1">{op.s || ' '}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface2/30">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted hover:text-text">
            <input
              type="checkbox"
              checked={autoApplyRest}
              onChange={(e) => setAutoApplyRest(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent/30 w-4 h-4 cursor-pointer"
            />
            <span>Auto-apply the rest of this task</span>
          </label>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => resolveApproval(false, false)}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-border text-text hover:bg-surface2 transition-all cursor-pointer"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => resolveApproval(true, autoApplyRest)}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
