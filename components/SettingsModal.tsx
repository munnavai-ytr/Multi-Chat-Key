'use client';

import { useState, useEffect } from 'react';
import {
  X,
  KeyRound,
  Eye,
  EyeOff,
  RotateCw,
  Trash2,
  ShieldCheck,
  Plus,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useKeysStore } from '@/store/keys';
import { ProviderId, detectProvider, listModels } from '@/lib/providers';
import { encryptKey, decryptKey } from '@/lib/crypto';
import { db, KeyRow } from '@/lib/db';

const PROVIDER_OPTIONS: { id: ProviderId; name: string; prefixHint: string }[] = [
  { id: 'openai', name: 'OpenAI', prefixHint: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', prefixHint: 'sk-ant-...' },
  { id: 'gemini', name: 'Google Gemini', prefixHint: 'AIza...' },
  { id: 'groq', name: 'Groq', prefixHint: 'gsk_...' },
  { id: 'openrouter', name: 'OpenRouter', prefixHint: 'sk-or-...' },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', prefixHint: 'https://...' },
];

function formatLastChecked(timestamp: number) {
  if (!timestamp) return 'Never';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useUIStore();
  const {
    keys,
    selectedKeyId,
    selectKey,
    addKey,
    deleteKey,
    recheckKey,
    recheckingKeyId,
  } = useKeysStore();

  const [rawKey, setRawKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [baseUrl, setBaseUrl] = useState('');
  const [label, setLabel] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');

  useEffect(() => {
    if (settingsOpen) {
      db.meta.get('customInstructions').then((row) => {
        if (row && typeof row.value === 'string') {
          setCustomInstructions(row.value);
        }
      });
    }
  }, [settingsOpen]);

  const handleCustomInstructionsChange = (val: string) => {
    if (val.length <= 3000) {
      setCustomInstructions(val);
      db.meta.put({ key: 'customInstructions', value: val }).catch(() => {});
    }
  };

  if (!settingsOpen) return null;

  const handleKeyChange = (val: string) => {
    setRawKey(val);
    setErrorMsg(null);
    setSuccessMsg(null);
    const detected = detectProvider(val);
    if (detected) {
      setProvider(detected);
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = rawKey.trim();
    if (!cleanKey) {
      setErrorMsg('Please enter an API key');
      return;
    }

    if (provider === 'custom' && !baseUrl.trim()) {
      setErrorMsg('Please enter a Base URL for custom provider');
      return;
    }

    setIsValidating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Block saving the same key twice: decrypt existing keys of the same provider and compare
      const sameProviderKeys = keys.filter((k) => k.provider === provider);
      for (const existingKey of sameProviderKeys) {
        try {
          const decrypted = await decryptKey({ iv: existingKey.iv, ct: existingKey.ct });
          if (decrypted.trim() === cleanKey) {
            setErrorMsg('This key is already added.');
            setIsValidating(false);
            return;
          }
        } catch {
          // ignore decryption failure
        }
      }

      const result = await listModels(
        provider,
        cleanKey,
        provider === 'custom' ? baseUrl.trim() : undefined
      );

      if (result.status === 'invalid') {
        setErrorMsg('Invalid API key. Please check your credentials and try again.');
        setIsValidating(false);
        return;
      }

      if (result.status === 'unknown') {
        setErrorMsg('Could not verify this key. Check your connection and try again.');
        setIsValidating(false);
        return;
      }

      // Valid or limited - encrypt and store
      const { iv, ct } = await encryptKey(cleanKey);
      const keyId = crypto.randomUUID();
      const last4 = cleanKey.length >= 4 ? cleanKey.slice(-4) : cleanKey;
      const keyLabel =
        label.trim() ||
        `${PROVIDER_OPTIONS.find((p) => p.id === provider)?.name || provider} Key`;

      const newKeyRow: KeyRow = {
        id: keyId,
        provider,
        label: keyLabel,
        baseUrl: provider === 'custom' ? baseUrl.trim() : undefined,
        iv,
        ct,
        status: result.status,
        checkedAt: Date.now(),
        last4,
      };

      await addKey(newKeyRow, result.models);

      setSuccessMsg(
        result.status === 'limited'
          ? `Key saved! (Currently rate limited, ${result.models.length} models cached)`
          : `Key validated and saved with ${result.models.length} models available!`
      );
      setRawKey('');
      setLabel('');
      setBaseUrl('');
      setIsAddFormOpen(false);
    } catch {
      setErrorMsg('Failed to validate key. Check your connection or proxy.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        onClick={() => setSettingsOpen(false)}
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-[180ms] ease-out"
        aria-hidden="true"
      />

      {/* Modal / Sheet Container */}
      <div className="relative w-full sm:max-w-xl max-h-[90vh] bg-surface border border-border rounded-t-[20px] sm:rounded-[20px] shadow-2xl flex flex-col z-10 overflow-hidden transform transition-all duration-[180ms] ease-out">
        {/* Mobile Drag Indicator */}
        <div className="sm:hidden w-full flex items-center justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface2 flex items-center justify-center text-text">
              <KeyRound className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-text tracking-tight">
                Settings
              </h2>
              <p className="text-xs text-muted">Manage your API keys & providers</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Key Management Header & Add Key button */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text uppercase tracking-wider">
              API Keys ({keys.length})
            </h3>
            {!isAddFormOpen && (
              <button
                type="button"
                onClick={() => {
                  setIsAddFormOpen(true);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface2 hover:bg-border text-xs font-medium text-text transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Key</span>
              </button>
            )}
          </div>

          {/* Success Banner */}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* List of Saved Keys */}
          {keys.length === 0 && !isAddFormOpen ? (
            <div className="p-6 text-center rounded-[14px] border border-dashed border-border bg-surface2/40">
              <KeyRound className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium text-text">No API keys saved yet</p>
              <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
                Add an API key from Google Gemini, OpenAI, Groq, or Anthropic to start chatting.
              </p>
              <button
                type="button"
                onClick={() => setIsAddFormOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                <span>Add your first key</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {keys.map((key) => {
                const isSelected = selectedKeyId === key.id;
                const isCheckingThis = recheckingKeyId === key.id;

                let statusDotColor = 'bg-zinc-400';
                let statusTitle = 'Unknown status';
                if (key.status === 'valid') {
                  statusDotColor = 'bg-emerald-500';
                  statusTitle = 'Valid';
                } else if (key.status === 'invalid') {
                  statusDotColor = 'bg-rose-500';
                  statusTitle = 'Invalid';
                } else if (key.status === 'limited') {
                  statusDotColor = 'bg-amber-500';
                  statusTitle = 'Rate Limited';
                }

                return (
                  <div
                    key={key.id}
                    className={`p-3.5 rounded-[14px] border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-surface hover:bg-surface2/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-text truncate">
                          {key.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-surface2 border border-border text-muted">
                          {key.provider}
                        </span>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent text-accent-fg">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 mt-1 text-xs text-muted flex-wrap">
                        <span className="font-mono text-muted tracking-widest text-[11px]">
                          ••••••••{key.last4 || '••••'}
                        </span>
                        <span>•</span>
                        <div className="flex items-center gap-1.5" title={statusTitle}>
                          <span className={`w-2 h-2 rounded-full ${statusDotColor} shrink-0`} />
                          <span className="capitalize">{key.status}</span>
                        </div>
                        <span>•</span>
                        <span>Checked {formatLastChecked(key.checkedAt)}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {!isSelected && (
                        <button
                          type="button"
                          onClick={() => selectKey(key.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-text bg-surface2 hover:bg-border transition-colors"
                        >
                          Use
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => recheckKey(key.id)}
                        disabled={isCheckingThis}
                        title="Re-check key health and refresh models"
                        aria-label="Re-check key"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors disabled:opacity-50"
                      >
                        <RotateCw
                          className={`w-3.5 h-3.5 ${isCheckingThis ? 'animate-spin text-accent' : ''}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteKey(key.id)}
                        title="Delete key"
                        aria-label="Delete key"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Key Form */}
          {isAddFormOpen && (
            <div className="p-4 sm:p-5 rounded-[16px] border border-border bg-surface2/30 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-accent" />
                  <span className="font-semibold text-sm text-text">Add New API Key</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleSaveKey} className="space-y-3.5">
                {/* API Key Input */}
                <div>
                  <label className="block text-xs font-medium text-text mb-1.5">
                    API Key <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={rawKey}
                      onChange={(e) => handleKeyChange(e.target.value)}
                      placeholder="Paste your API key here (sk-..., AIza...)"
                      required
                      autoComplete="off"
                      className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 pr-10 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent transition-colors font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      aria-label={showKey ? 'Hide key' : 'Show key'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1 rounded"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Provider Selection */}
                <div>
                  <label className="block text-xs font-medium text-text mb-1.5">
                    Provider
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as ProviderId)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent transition-colors"
                  >
                    {PROVIDER_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Base URL (if custom) */}
                {provider === 'custom' && (
                  <div>
                    <label className="block text-xs font-medium text-text mb-1.5">
                      Base URL <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.together.xyz/v1"
                      required
                      className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent transition-colors font-mono"
                    />
                  </div>
                )}

                {/* Label Input (Optional) */}
                <div>
                  <label className="block text-xs font-medium text-text mb-1.5">
                    Label <span className="text-muted">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. My Personal Gemini Key"
                    className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
                  />
                </div>

                {/* Privacy note */}
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface border border-border text-muted">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-xs">
                    Your key is encrypted and stored only on this device.
                  </p>
                </div>

                {/* Error message */}
                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddFormOpen(false);
                      setRawKey('');
                      setErrorMsg(null);
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-muted hover:text-text hover:bg-surface2 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isValidating || !rawKey.trim()}
                    className="px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-95 disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    {isValidating ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Validating Key...</span>
                      </>
                    ) : (
                      <span>Save Key</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Custom Instructions Section */}
          <div className="pt-3 border-t border-border space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text">
                  Custom instructions
                </h3>
                <p className="text-xs text-muted">Applies to every chat</p>
              </div>
              <span
                className={`text-xs ${
                  customInstructions.length >= 3000
                    ? 'text-rose-500 font-semibold'
                    : 'text-muted'
                }`}
              >
                {customInstructions.length} / 3000
              </span>
            </div>
            <textarea
              value={customInstructions}
              onChange={(e) => handleCustomInstructionsChange(e.target.value)}
              maxLength={3000}
              placeholder="What would you like the assistant to know about you, your preferences, or how you want it to respond?"
              rows={4}
              className="w-full bg-surface2/60 focus:bg-surface border border-border focus:border-accent rounded-xl p-3 text-xs sm:text-sm text-text placeholder:text-muted focus:outline-none transition-colors resize-y min-h-[90px]"
            />
          </div>

          {/* Helpful Provider Links */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted mb-2">Need an API key?</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-lg bg-surface2/60 hover:bg-surface2 text-xs text-text transition-colors"
              >
                <span>Gemini API</span>
                <ExternalLink className="w-3 h-3 text-muted" />
              </a>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-lg bg-surface2/60 hover:bg-surface2 text-xs text-text transition-colors"
              >
                <span>OpenAI</span>
                <ExternalLink className="w-3 h-3 text-muted" />
              </a>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-lg bg-surface2/60 hover:bg-surface2 text-xs text-text transition-colors"
              >
                <span>Groq</span>
                <ExternalLink className="w-3 h-3 text-muted" />
              </a>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-lg bg-surface2/60 hover:bg-surface2 text-xs text-text transition-colors"
              >
                <span>Anthropic</span>
                <ExternalLink className="w-3 h-3 text-muted" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
