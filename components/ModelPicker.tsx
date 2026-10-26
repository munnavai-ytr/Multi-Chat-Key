'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  RotateCw,
  Check,
  ChevronDown,
  Sparkles,
  X,
  KeyRound,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useKeysStore } from '@/store/keys';
import { ModelInfo, ModelKind } from '@/lib/providers';

export function ModelPickerTrigger() {
  const { setModelPickerOpen, setSettingsOpen } = useUIStore();
  const { keys, selectedKeyId, selectedModel, cachedModels } = useKeysStore();

  const activeKey = keys.find((k) => k.id === selectedKeyId);
  const models = activeKey ? cachedModels[activeKey.id] || [] : [];
  const currentModelInfo = models.find((m) => m.id === selectedModel);

  const displayName = currentModelInfo
    ? currentModelInfo.name
    : selectedModel || (keys.length > 0 ? 'Select model' : 'Add API key');

  const handleClick = () => {
    if (keys.length === 0) {
      setSettingsOpen(true);
    } else {
      setModelPickerOpen(true);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Select model"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface2/80 hover:bg-surface2 border border-border/80 text-text text-xs sm:text-sm font-medium transition-colors max-w-[200px] sm:max-w-[280px] truncate"
    >
      <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" />
      <span className="truncate">{displayName}</span>
      {currentModelInfo?.tier === 'free' && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
          Free
        </span>
      )}
      {currentModelInfo?.tier === 'paid' && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
          Paid
        </span>
      )}
      <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
    </button>
  );
}

export function ModelPicker() {
  const { modelPickerOpen, setModelPickerOpen, setSettingsOpen, showToast } = useUIStore();
  const {
    keys,
    selectedKeyId,
    selectedModel,
    cachedModels,
    selectKey,
    selectModel,
    recheckKey,
    recheckingKeyId,
    addManualModel,
  } = useKeysStore();

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'chat' | 'image' | 'audio' | 'embedding'>('chat');
  const [tierFilter, setTierFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [manualInput, setManualInput] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  // Group models by key with search, kind filter, and tier filter
  const groupedKeysWithModels = useMemo(() => {
    const q = search.toLowerCase().trim();
    return keys.map((key) => {
      const allKeyModels = cachedModels[key.id] || [];
      const filtered = allKeyModels.filter((m) => {
        const matchesSearch =
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q);
        const matchesTier = tierFilter === 'all' || m.tier === tierFilter;
        const modelKind = m.kind || 'chat';
        const matchesKind =
          kindFilter === 'all'
            ? true
            : kindFilter === 'chat'
              ? modelKind === 'chat'
              : modelKind === kindFilter;
        return matchesSearch && matchesTier && matchesKind;
      });
      return {
        key,
        models: filtered,
        totalCount: allKeyModels.length,
      };
    });
  }, [keys, cachedModels, search, tierFilter, kindFilter]);

  if (!modelPickerOpen) return null;

  const handleSelect = async (keyId: string, model: ModelInfo) => {
    if (model.kind && model.kind !== 'chat') {
      showToast("This model type can't be used for chat yet");
      return;
    }
    if (keyId !== selectedKeyId) {
      await selectKey(keyId);
    }
    await selectModel(model.id);
    setModelPickerOpen(false);
  };

  const handleRefreshCurrent = async () => {
    if (selectedKeyId) {
      await recheckKey(selectedKeyId);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualInput.trim();
    if (!clean || !selectedKeyId) return;
    setIsSubmittingManual(true);
    try {
      await addManualModel(selectedKeyId, clean);
      setManualInput('');
      setModelPickerOpen(false);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const isRefreshing = !!(selectedKeyId && recheckingKeyId === selectedKeyId);
  const activeKey = keys.find((k) => k.id === selectedKeyId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        onClick={() => setModelPickerOpen(false)}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-[180ms] ease-out"
        aria-hidden="true"
      />

      {/* Sheet / Modal */}
      <div className="relative w-full sm:max-w-md max-h-[85vh] bg-surface border border-border rounded-t-[20px] sm:rounded-[20px] shadow-2xl flex flex-col z-10 overflow-hidden transform transition-all duration-[180ms] ease-out">
        {/* Mobile Drag Indicator */}
        <div className="sm:hidden w-full flex items-center justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h2 className="text-sm sm:text-base font-semibold text-text">Select Model</h2>
          </div>
          <button
            type="button"
            onClick={() => setModelPickerOpen(false)}
            aria-label="Close model picker"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar & Refresh */}
        <div className="p-3 pb-2.5 border-b border-border space-y-2 shrink-0 bg-surface">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full bg-surface2 border border-border rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={handleRefreshCurrent}
              disabled={isRefreshing || !selectedKeyId}
              title="Refresh models for active key"
              aria-label="Refresh models"
              className="w-9 h-9 rounded-xl border border-border bg-surface2 hover:bg-border flex items-center justify-center text-muted hover:text-text transition-colors disabled:opacity-40 shrink-0 cursor-pointer"
            >
              <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-accent' : ''}`} />
            </button>
          </div>

          {/* Chip row 1: All kinds / Chat / Image / Audio / Embedding */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {[
              { id: 'all', label: 'All kinds' },
              { id: 'chat', label: 'Chat' },
              { id: 'image', label: 'Image' },
              { id: 'audio', label: 'Audio' },
              { id: 'embedding', label: 'Embedding' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setKindFilter(id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  kindFilter === id
                    ? 'bg-accent text-accent-fg'
                    : 'bg-surface2 hover:bg-border text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Chip row 2: All / Free / Paid */}
          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'free', label: 'Free' },
              { id: 'paid', label: 'Paid' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTierFilter(id as any)}
                className={`px-3 py-0.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  tierFilter === id
                    ? 'bg-accent text-accent-fg'
                    : 'bg-surface2 hover:bg-border text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Model Lists */}
        <div className="overflow-y-auto flex-1 p-2 sm:p-3 space-y-4">
          {keys.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <KeyRound className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium text-text">No API keys found</p>
              <p className="text-xs text-muted mt-1 mb-4">
                Add an API key to view and use AI models.
              </p>
              <button
                type="button"
                onClick={() => {
                  setModelPickerOpen(false);
                  setSettingsOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold cursor-pointer"
              >
                Open Settings
              </button>
            </div>
          ) : (
            groupedKeysWithModels.map(({ key, models, totalCount }) => (
              <div key={key.id} className="space-y-1">
                {/* Group Header by Provider / Key with total count */}
                <div className="flex items-center justify-between px-2 py-1 text-xs text-muted font-semibold uppercase tracking-wider">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="capitalize">{key.provider}</span>
                    <span className="text-[11px] font-normal lowercase text-muted/80">
                      ({key.label})
                    </span>
                  </div>
                  <span className="text-[10px] font-normal">{totalCount} models</span>
                </div>

                {models.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted bg-surface2/30 rounded-xl">
                    {totalCount === 0
                      ? 'No models cached yet. Try refreshing or use a model ID manually below.'
                      : 'No models match the selected filter.'}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {models.map((model) => {
                      const isSelected =
                        selectedKeyId === key.id && selectedModel === model.id;
                      const isNonChat = model.kind && model.kind !== 'chat';

                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => handleSelect(key.id, model)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-accent/10 border border-accent/30 text-accent font-medium'
                              : 'hover:bg-surface2 text-text border border-transparent'
                          } ${isNonChat ? 'opacity-55 hover:opacity-80' : ''}`}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs sm:text-sm font-medium truncate">
                                {model.name}
                              </span>
                              {isNonChat && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-surface2 text-muted border border-border shrink-0">
                                  {model.kind}
                                </span>
                              )}
                              {model.tier === 'free' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                                  Free
                                </span>
                              )}
                              {model.tier === 'paid' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                  Paid
                                </span>
                              )}
                            </div>
                            {model.name !== model.id && (
                              <div className="text-[11px] text-muted font-mono truncate mt-0.5">
                                {model.id}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-accent shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Use a model ID manually input */}
        <div className="p-3 border-t border-border bg-surface2/30 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text">Use a model ID manually</span>
            {activeKey && (
              <span className="text-[10px] text-muted truncate max-w-[150px]">
                for {activeKey.label}
              </span>
            )}
          </div>
          <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="e.g. gpt-4o, claude-3-7-sonnet..."
              disabled={!selectedKeyId || isSubmittingManual}
              className="flex-1 bg-surface border border-border rounded-xl px-3 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent font-mono transition-colors"
            />
            <button
              type="submit"
              disabled={!manualInput.trim() || !selectedKeyId || isSubmittingManual}
              className="px-3.5 py-1.5 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shrink-0"
            >
              Use
            </button>
          </form>
        </div>

        {/* Footnote */}
        <div className="p-2.5 px-3 border-t border-border bg-surface shrink-0 text-center">
          <p className="text-[11px] text-muted leading-tight">
            Free/Paid is an estimate. OpenAI and Anthropic APIs are billed per use (prepaid credits); free API credits for new accounts are not reliable, check your billing page.
          </p>
        </div>
      </div>
    </div>
  );
}
