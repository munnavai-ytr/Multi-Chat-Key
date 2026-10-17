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
  Brain,
  Pencil,
  Check,
  Globe,
  Search,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useKeysStore } from '@/store/keys';
import { useChatStore } from '@/store/chat';
import { ProviderId, detectProvider, listModels } from '@/lib/providers';
import { encryptKey, decryptKey } from '@/lib/crypto';
import { db, KeyRow, MemoryRow } from '@/lib/db';
import { webSearch } from '@/lib/search';
import { storageInfo, requestPersistence } from '@/lib/storage';

const PROVIDER_OPTIONS: { id: ProviderId; name: string; prefixHint: string }[] = [
  { id: 'openai', name: 'OpenAI', prefixHint: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', prefixHint: 'sk-ant-...' },
  { id: 'gemini', name: 'Google Gemini', prefixHint: 'AIza...' },
  { id: 'groq', name: 'Groq', prefixHint: 'gsk_...' },
  { id: 'openrouter', name: 'OpenRouter', prefixHint: 'sk-or-...' },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', prefixHint: 'https://...' },
];

const getNow = () => Date.now();

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
  const { settingsOpen, setSettingsOpen, settingsTab, setSettingsTab } = useUIStore();
  const {
    keys,
    selectedKeyId,
    selectKey,
    addKey,
    deleteKey,
    recheckKey,
    recheckingKeyId,
  } = useKeysStore();
  const { checkSearchKey } = useChatStore();

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

  // Web Search (Tavily) state
  const [searchKeyInput, setSearchKeyInput] = useState('');
  const [showSearchKey, setShowSearchKey] = useState(false);
  const [hasSavedSearchKey, setHasSavedSearchKey] = useState(false);
  const [savedSearchKeyLast4, setSavedSearchKeyLast4] = useState('');
  const [isTestingSearch, setIsTestingSearch] = useState(false);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [searchStatus, setSearchStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Memory state
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // Storage state
  const [persisted, setPersisted] = useState(false);
  const [storageUsage, setStorageUsage] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const refreshStorage = async () => {
    setIsCheckingStorage(true);
    await requestPersistence();
    const info = await storageInfo();
    setPersisted(info.persisted);
    setStorageUsage(info.usage);
    setStorageQuota(info.quota);
    setIsCheckingStorage(false);
  };

  // AI Tools state
  const [smartMode, setSmartMode] = useState(true);
  const [toolWebSearch, setToolWebSearch] = useState(true);
  const [toolArtifact, setToolArtifact] = useState(true);
  const [toolRunCode, setToolRunCode] = useState(true);
  const [toolRemember, setToolRemember] = useState(true);
  const [toolRunAsk, setToolRunAsk] = useState(true);

  const loadToolSettings = async () => {
    try {
      const sm = await db.meta.get('smartMode');
      if (sm !== undefined) setSmartMode(Boolean(sm.value));
      const ws = await db.meta.get('tool:web_search');
      if (ws !== undefined) setToolWebSearch(Boolean(ws.value));
      const ca = await db.meta.get('tool:create_artifact');
      if (ca !== undefined) setToolArtifact(Boolean(ca.value));
      const rc = await db.meta.get('tool:run_code');
      if (rc !== undefined) setToolRunCode(Boolean(rc.value));
      const rem = await db.meta.get('tool:remember');
      if (rem !== undefined) setToolRemember(Boolean(rem.value));
      const ask = await db.meta.get('toolRunAsk');
      if (ask !== undefined) setToolRunAsk(Boolean(ask.value));
    } catch {}
  };

  const loadMemories = async () => {
    try {
      const memMeta = await db.meta.get('memoryEnabled');
      setMemoryEnabled(memMeta ? Boolean(memMeta.value) : true);
      const all = await db.memories.orderBy('updatedAt').reverse().toArray();
      setMemories(all);
    } catch {
      // ignore
    }
  };

  const loadSearchKeyInfo = async () => {
    try {
      const row = await db.meta.get('searchKey');
      if (row && row.value && row.value.ct) {
        setHasSavedSearchKey(true);
        try {
          const decrypted = await decryptKey(row.value);
          setSavedSearchKeyLast4(decrypted.length >= 4 ? decrypted.slice(-4) : decrypted);
        } catch {
          setSavedSearchKeyLast4('••••');
        }
      } else {
        setHasSavedSearchKey(false);
        setSavedSearchKeyLast4('');
      }
    } catch {
      setHasSavedSearchKey(false);
      setSavedSearchKeyLast4('');
    }
  };

  useEffect(() => {
    if (!settingsOpen) return;
    const timer = setTimeout(() => {
      db.meta.get('customInstructions').then((row) => {
        if (row && typeof row.value === 'string') {
          setCustomInstructions(row.value);
        }
      });
      loadMemories();
      loadSearchKeyInfo();
      loadToolSettings();
    }, 0);
    return () => clearTimeout(timer);
  }, [settingsOpen]);

  useEffect(() => {
    if (settingsOpen && settingsTab === 'data') {
      refreshStorage();
    }
  }, [settingsOpen, settingsTab]);

  const handleTestSearch = async () => {
    setIsTestingSearch(true);
    setSearchStatus(null);
    try {
      let keyToTest = searchKeyInput.trim();
      if (!keyToTest && hasSavedSearchKey) {
        const row = await db.meta.get('searchKey');
        if (row?.value) {
          keyToTest = await decryptKey(row.value);
        }
      }

      if (!keyToTest) {
        setSearchStatus({
          type: 'error',
          message: 'Please enter a Tavily API key first.',
        });
        setIsTestingSearch(false);
        return;
      }

      const results = await webSearch(keyToTest, 'latest technology news');
      setSearchStatus({
        type: 'success',
        message: `Success! Web search returned ${results.length} results. Tavily integration is active and verified.`,
      });
    } catch (err: any) {
      setSearchStatus({
        type: 'error',
        message: err?.message || 'Search test failed. Please verify your Tavily API key.',
      });
    } finally {
      setIsTestingSearch(false);
    }
  };

  const handleSaveSearchKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = searchKeyInput.trim();
    if (!cleanKey) {
      setSearchStatus({
        type: 'error',
        message: 'Please enter a valid Tavily API key.',
      });
      return;
    }

    setIsSavingSearch(true);
    setSearchStatus(null);

    try {
      const { iv, ct } = await encryptKey(cleanKey);
      await db.meta.put({ key: 'searchKey', value: { iv, ct } });
      await checkSearchKey();
      setHasSavedSearchKey(true);
      setSavedSearchKeyLast4(cleanKey.length >= 4 ? cleanKey.slice(-4) : cleanKey);
      setSearchKeyInput('');
      setSearchStatus({
        type: 'success',
        message: 'Tavily API key encrypted and saved securely! Web search is now ready to use.',
      });
    } catch {
      setSearchStatus({
        type: 'error',
        message: 'Failed to encrypt and save search key.',
      });
    } finally {
      setIsSavingSearch(false);
    }
  };

  const handleRemoveSearchKey = async () => {
    try {
      await db.meta.delete('searchKey');
      await checkSearchKey();
      setHasSavedSearchKey(false);
      setSavedSearchKeyLast4('');
      setSearchKeyInput('');
      setSearchStatus({
        type: 'info',
        message: 'Tavily API key removed. Web search is now disabled.',
      });
    } catch {
      setSearchStatus({
        type: 'error',
        message: 'Failed to remove search key.',
      });
    }
  };

  const handleCustomInstructionsChange = (val: string) => {
    if (val.length <= 3000) {
      setCustomInstructions(val);
      db.meta.put({ key: 'customInstructions', value: val }).catch(() => {});
    }
  };

  const handleToggleMemoryEnabled = async () => {
    const nextVal = !memoryEnabled;
    setMemoryEnabled(nextVal);
    await db.meta.put({ key: 'memoryEnabled', value: nextVal });
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newMemoryText.trim();
    if (!text) return;
    const now = getNow();
    await db.memories.put({
      id: crypto.randomUUID(),
      text,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    });
    setNewMemoryText('');
    const count = await db.memories.count();
    if (count > 100) {
      const old = await db.memories.orderBy('updatedAt').limit(count - 100).primaryKeys();
      await db.memories.bulkDelete(old);
    }
    await loadMemories();
  };

  const handleSaveEdit = async (id: string) => {
    const text = editingText.trim();
    if (!text) return;
    const now = getNow();
    await db.memories.update(id, { text, updatedAt: now });
    setEditingId(null);
    setEditingText('');
    await loadMemories();
  };

  const handleDeleteMemory = async (id: string) => {
    await db.memories.delete(id);
    await loadMemories();
  };

  const handleClearAllMemories = async () => {
    await db.memories.clear();
    setConfirmClear(false);
    await loadMemories();
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

        {/* Navigation Tabs */}
        <div className="flex border-b border-border px-4 sm:px-6 shrink-0 bg-surface2/30 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setSettingsTab('tools')}
            className={`py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              settingsTab === 'tools'
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-accent" />
            <span>AI Tools</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('keys')}
            className={`py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              settingsTab === 'keys'
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>API Keys & Prompt</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('search')}
            className={`py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              settingsTab === 'search'
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web Search</span>
            {hasSavedSearchKey && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('memory')}
            className={`py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              settingsTab === 'memory'
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Memory</span>
            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-surface2 text-muted">
              {memories.length}/100
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('usage')}
            className={`py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              settingsTab === 'usage'
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Usage</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('data')}
            className={`py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              settingsTab === 'data'
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Data</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {settingsTab === 'tools' ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-surface2/60 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-text">Smart Mode</h3>
                    <p className="text-xs text-muted">AI decides when to use tools automatically</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smartMode}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        setSmartMode(val);
                        await db.meta.put({ key: 'smartMode', value: val });
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
                  </label>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  The AI decides when to use these. You can also just ask: &apos;search the web for...&apos;, &apos;make a landing page&apos;, &apos;calculate...&apos;.
                </p>
              </div>

              {smartMode && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted px-1">Enabled Tools</h4>

                  {/* Web Search Tool */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/40 border border-border">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-text">Web Search</span>
                      <p className="text-[11px] text-muted">Search live web for current facts & news</p>
                      {!hasSavedSearchKey && (
                        <button
                          type="button"
                          onClick={() => setSettingsTab('search')}
                          className="text-xs text-accent hover:underline font-medium inline-block mt-1 cursor-pointer"
                        >
                          + Add Tavily API key required for web search
                        </button>
                      )}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toolWebSearch}
                        disabled={!hasSavedSearchKey}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setToolWebSearch(val);
                          await db.meta.put({ key: 'tool:web_search', value: val });
                        }}
                        className="sr-only peer disabled:opacity-40"
                      />
                      <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-40" />
                    </label>
                  </div>

                  {/* Create Artifact Tool */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/40 border border-border">
                    <div>
                      <span className="text-xs font-semibold text-text">Create Artifact</span>
                      <p className="text-[11px] text-muted">Generate interactive apps, HTML, SVG & React previews</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toolArtifact}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setToolArtifact(val);
                          await db.meta.put({ key: 'tool:create_artifact', value: val });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
                    </label>
                  </div>

                  {/* Run Code Tool */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/40 border border-border">
                    <div>
                      <span className="text-xs font-semibold text-text">Run Code</span>
                      <p className="text-[11px] text-muted">Execute Python & JavaScript in secure sandbox</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toolRunCode}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setToolRunCode(val);
                          await db.meta.put({ key: 'tool:run_code', value: val });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
                    </label>
                  </div>

                  {/* Remember Tool */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/40 border border-border">
                    <div>
                      <span className="text-xs font-semibold text-text">Remember</span>
                      <p className="text-[11px] text-muted">Save durable user facts & preferences across chats</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toolRemember}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setToolRemember(val);
                          await db.meta.put({ key: 'tool:remember', value: val });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
                    </label>
                  </div>

                  {/* Ask before running code switch */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/40 border border-border mt-4">
                    <div>
                      <span className="text-xs font-semibold text-text">Ask before running code</span>
                      <p className="text-[11px] text-muted">Require confirmation modal before executing sandbox code</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toolRunAsk}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setToolRunAsk(val);
                          await db.meta.put({ key: 'toolRunAsk', value: val });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
                    </label>
                  </div>
                </div>
              )}
            </div>
          ) : settingsTab === 'keys' ? (
            <>
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
        </>
      ) : settingsTab === 'search' ? (
        <div className="space-y-5">
          {/* Header card with Tavily branding and free tier limit info */}
          <div className="p-4 rounded-xl bg-surface2/60 border border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-semibold text-text">Web Search (Tavily)</h3>
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                Free Tier: 1,000 searches/mo
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Search the live web before generating an answer. Works automatically with every model provider (Gemini, Groq, OpenAI, Anthropic, DeepSeek, etc.) without requiring native model tool calling.
            </p>
            <div className="pt-1 flex items-center gap-2">
              <a
                href="https://tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline font-medium"
              >
                <span>Get a free Tavily API key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Current Status banner if key saved */}
          {hasSavedSearchKey && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Web search is configured
                  </p>
                  <p className="text-muted text-[11px]">
                    Saved key: <span className="font-mono">••••••••{savedSearchKeyLast4 || '••••'}</span> (AES-GCM encrypted on device)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleTestSearch}
                  disabled={isTestingSearch}
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface2 text-text font-medium border border-border text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isTestingSearch ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5 text-accent" />
                      <span>Test Search</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleRemoveSearchKey}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          )}

          {/* Key Input Form */}
          <form onSubmit={handleSaveSearchKey} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-text mb-1.5">
                {hasSavedSearchKey ? 'Replace Tavily API Key' : 'Tavily API Key'}
              </label>
              <div className="relative">
                <input
                  type={showSearchKey ? 'text' : 'password'}
                  value={searchKeyInput}
                  onChange={(e) => {
                    setSearchKeyInput(e.target.value);
                    setSearchStatus(null);
                  }}
                  placeholder={
                    hasSavedSearchKey
                      ? 'Paste new Tavily key to replace (tvly-...)'
                      : 'Paste your Tavily API key (tvly-...)'
                  }
                  className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 pr-10 text-xs sm:text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent font-mono transition-colors"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowSearchKey(!showSearchKey)}
                  aria-label={showSearchKey ? 'Hide key' : 'Show key'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1 rounded"
                >
                  {showSearchKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Privacy Badge */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface border border-border text-muted">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-xs">
                Your search key is encrypted locally and only sent to /api/search.
              </p>
            </div>

            {/* Status Feedback Text */}
            {searchStatus && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  searchStatus.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : searchStatus.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                }`}
              >
                {searchStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{searchStatus.message}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              {!hasSavedSearchKey && (
                <button
                  type="button"
                  onClick={handleTestSearch}
                  disabled={isTestingSearch || !searchKeyInput.trim()}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium bg-surface2 hover:bg-border text-text disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isTestingSearch ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Testing...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5 text-accent" />
                      <span>Test</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={isSavingSearch || !searchKeyInput.trim()}
                className="px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-95 disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingSearch ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Search Key</span>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : settingsTab === 'usage' ? (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-text">Usage Tracking</p>
          <p className="text-xs text-muted">Usage tracking is currently being implemented. Check back shortly.</p>
        </div>
      ) : settingsTab === 'data' ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-surface2/60 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${persisted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <h3 className="text-sm font-semibold text-text">
                  Storage: {persisted ? 'Protected' : 'Not protected'}
                </h3>
              </div>
              <button
                type="button"
                onClick={refreshStorage}
                disabled={isCheckingStorage}
                className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface2 text-xs font-medium text-text border border-border transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3 h-3 ${isCheckingStorage ? 'animate-spin' : ''}`} />
                <span>Re-check</span>
              </button>
            </div>
            
            <p className="text-xs text-muted leading-relaxed">
              {persisted
                ? 'Your storage is protected from automatic browser cleanups.'
                : 'Your browser may clear chats if the device runs low on space. Export a backup regularly.'}
            </p>

            <div className="text-xs font-mono text-muted pt-1 border-t border-border/60">
              {formatBytes(storageUsage)} used of {formatBytes(storageQuota)}
            </div>
          </div>

          <p className="text-xs text-muted">Data export/import and backup management.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Master toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/60 border border-border">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text">Long-term Memory</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                  {memories.length} / 100
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Automatically remember durable facts and preferences across chats
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={memoryEnabled}
                onChange={handleToggleMemoryEnabled}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
            </label>
          </div>

          {/* Small muted explainer */}
          <p className="text-xs text-muted leading-relaxed">
            Memory is stored only on this device. Your chats are sent to your chosen AI provider as usual.
          </p>

          {/* Add memory form */}
          <form onSubmit={handleAddMemory} className="flex gap-2">
            <input
              type="text"
              value={newMemoryText}
              onChange={(e) => setNewMemoryText(e.target.value)}
              placeholder="Add a fact or preference (e.g. I prefer short answers)..."
              maxLength={200}
              className="flex-1 bg-surface2/60 focus:bg-surface border border-border focus:border-accent rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-text placeholder:text-muted focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!newMemoryText.trim() || memories.length >= 100}
              className="px-4 py-2.5 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add memory</span>
            </button>
          </form>

          {/* List of memories */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted px-1">
              <span>Saved Memories</span>
              <span>{memories.length} / 100</span>
            </div>

            {memories.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted rounded-xl border border-dashed border-border bg-surface2/30">
                No memories saved yet. As you chat, durable facts about you will be extracted automatically, or you can add them manually above.
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {memories.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-xl bg-surface2/50 border border-border flex items-start justify-between gap-3 text-xs group hover:border-accent/30 transition-colors"
                  >
                    {editingId === m.id ? (
                      <div className="flex-1 flex gap-2 items-center">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          maxLength={200}
                          className="flex-1 bg-surface border border-accent rounded-lg px-2.5 py-1 text-xs text-text focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(m.id)}
                          className="p-1 text-emerald-500 hover:opacity-75 cursor-pointer"
                          title="Save"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="p-1 text-muted hover:text-text cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                m.source === 'manual'
                                  ? 'bg-indigo-500/10 text-indigo-500'
                                  : 'bg-emerald-500/10 text-emerald-500'
                              }`}
                            >
                              {m.source}
                            </span>
                          </div>
                          <p className="text-text break-words leading-relaxed">{m.text}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(m.id);
                              setEditingText(m.text);
                            }}
                            className="p-1 text-muted hover:text-text rounded hover:bg-surface2 cursor-pointer"
                            title="Edit memory"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMemory(m.id)}
                            className="p-1 text-muted hover:text-rose-500 rounded hover:bg-rose-500/10 cursor-pointer"
                            title="Delete memory"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clear all with confirm */}
          {memories.length > 0 && (
            <div className="pt-2 border-t border-border flex justify-end">
              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-500 font-medium">Clear all memories?</span>
                  <button
                    type="button"
                    onClick={handleClearAllMemories}
                    className="px-3 py-1 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:opacity-90 cursor-pointer"
                  >
                    Yes, clear all
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1 rounded-lg bg-surface2 text-muted hover:text-text text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="text-xs text-muted hover:text-rose-500 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
