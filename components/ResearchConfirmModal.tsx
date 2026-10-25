'use client';

import React, { useState, useEffect } from 'react';
import { Search, AlertCircle, X, Compass, Zap, Flame } from 'lucide-react';
import { useUIStore } from '@/store/ui';

export function ResearchConfirmModal() {
  const { researchConfirmModal, setResearchConfirmModal } = useUIStore();
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('standard');

  useEffect(() => {
    if (researchConfirmModal) {
      setDepth(researchConfirmModal.defaultDepth || 'standard');
    }
  }, [researchConfirmModal]);

  if (!researchConfirmModal) return null;

  const handleCancel = () => {
    researchConfirmModal.resolve({ confirmed: false, depth });
    setResearchConfirmModal(null);
  };

  const handleStart = () => {
    researchConfirmModal.resolve({ confirmed: true, depth });
    setResearchConfirmModal(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-surface2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-text">Deep Web Research</h3>
              <p className="text-xs text-muted">Multi-step autonomous investigation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* Question preview */}
          <div className="p-3 rounded-xl bg-surface2/40 border border-border text-xs sm:text-sm text-text leading-relaxed">
            <span className="font-semibold text-muted text-[11px] uppercase tracking-wider block mb-1">
              Topic
            </span>
            <p className="font-medium">{researchConfirmModal.question}</p>
          </div>

          {/* Depth Selector */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              Investigation Depth
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDepth('quick')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  depth === 'quick'
                    ? 'border-accent bg-accent/10 shadow-xs ring-1 ring-accent'
                    : 'border-border bg-surface hover:bg-surface2/50'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-text">Quick</span>
                </div>
                <p className="text-[11px] text-muted">~3 searches</p>
                <p className="text-[10px] text-muted/80 mt-0.5">1 round</p>
              </button>

              <button
                type="button"
                onClick={() => setDepth('standard')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  depth === 'standard'
                    ? 'border-accent bg-accent/10 shadow-xs ring-1 ring-accent'
                    : 'border-border bg-surface hover:bg-surface2/50'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Compass className="w-3.5 h-3.5 text-accent" />
                  <span className="text-xs font-semibold text-text">Standard</span>
                </div>
                <p className="text-[11px] text-muted">~5-10 searches</p>
                <p className="text-[10px] text-muted/80 mt-0.5">2 rounds</p>
              </button>

              <button
                type="button"
                onClick={() => setDepth('deep')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  depth === 'deep'
                    ? 'border-accent bg-accent/10 shadow-xs ring-1 ring-accent'
                    : 'border-border bg-surface hover:bg-surface2/50'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Flame className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-xs font-semibold text-text">Deep</span>
                </div>
                <p className="text-[11px] text-muted">~15-20 searches</p>
                <p className="text-[10px] text-muted/80 mt-0.5">3 rounds</p>
              </button>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              This uses many calls on YOUR AI key and Tavily credits and can take 1-3 minutes. Keep
              the app open.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-surface2/30">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="px-4 py-1.5 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            Start Research
          </button>
        </div>
      </div>
    </div>
  );
}
