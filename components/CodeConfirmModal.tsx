'use client';

import React from 'react';
import { useUIStore } from '@/store/ui';
import { Play, X, ShieldAlert } from 'lucide-react';

export function CodeConfirmModal() {
  const { codeConfirmModal, setCodeConfirmModal } = useUIStore();

  if (!codeConfirmModal) return null;

  const { lang, code, resolve } = codeConfirmModal;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-surface border border-border rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-sm font-semibold text-text">
              Run {lang.toUpperCase()} Code?
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              resolve(false);
              setCodeConfirmModal(null);
            }}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 bg-bg font-mono text-xs text-text whitespace-pre-wrap break-words max-h-[300px]">
          {code}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface2">
          <p className="text-[11px] text-muted">Runs in a secure sandbox in your browser.</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resolve(false);
                setCodeConfirmModal(null);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                resolve(true);
                setCodeConfirmModal(null);
              }}
              className="px-4 py-1.5 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-95 transition-opacity flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Code</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
