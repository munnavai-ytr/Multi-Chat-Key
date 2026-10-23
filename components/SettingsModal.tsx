'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { exportAll, importAll } from '@/lib/backup';
import { saveFile } from '@/lib/save-file';
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
  Sliders,
  Pin,
  PinOff,
  Download,
  Upload,
  Sparkles,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Copy,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useKeysStore } from '@/store/keys';
import { useChatStore } from '@/store/chat';
import { ProviderId, detectProvider, listModels } from '@/lib/providers';
import { encryptKey, decryptKey } from '@/lib/crypto';
import { db, KeyRow, MemoryRow, DocRow } from '@/lib/db';
import { webSearch } from '@/lib/search';
import { storageInfo, requestPersistence } from '@/lib/storage';
import { similar, rebuildProfile } from '@/lib/memory';

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
  const [canSaveAnyway, setCanSaveAnyway] = useState(false);
  const [recheckErrors, setRecheckErrors] = useState<Record<string, string>>({});
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

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

  const [generatedDocs, setGeneratedDocs] = useState<DocRow[]>([]);
  const [includeAttachments, setIncludeAttachments] = useState(true);

  const loadGeneratedDocs = async () => {
    try {
      const docs = await db.docs.toArray();
      docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setGeneratedDocs(docs);
    } catch (err) {
      console.error('Failed to load generated docs', err);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await db.docs.delete(id);
      setGeneratedDocs((prev) => prev.filter((d) => d.id !== id));
      useUIStore.getState().showToast('Document deleted', 2000);
    } catch (err) {
      console.error('Failed to delete doc', err);
    }
  };

  const handleClearAllDocs = async () => {
    if (!confirm('Delete all generated documents?')) return;
    try {
      await db.docs.clear();
      setGeneratedDocs([]);
      useUIStore.getState().showToast('All generated documents deleted', 2000);
    } catch (err) {
      console.error('Failed to clear docs', err);
    }
  };

  const handleDownloadDoc = async (doc: DocRow) => {
    try {
      const blob = new Blob([doc.data], { type: doc.mime || 'application/octet-stream' });
      await saveFile(blob, doc.name);
      useUIStore.getState().showToast(`Saved ${doc.name}`, 2000);
    } catch (err) {
      console.error('Failed to save doc', err);
    }
  };

  // AI Tools state
  const [smartMode, setSmartMode] = useState(true);
  const [toolWebSearch, setToolWebSearch] = useState(true);
  const [toolArtifact, setToolArtifact] = useState(true);
  const [toolRunCode, setToolRunCode] = useState(true);
  const [toolRemember, setToolRemember] = useState(true);
  const [toolSearchChats, setToolSearchChats] = useState(true);
  const [toolForget, setToolForget] = useState(true);
  const [toolCreateDocument, setToolCreateDocument] = useState(true);
  const [toolRunAsk, setToolRunAsk] = useState(true);
  const [wsApproval, setWsApproval] = useState<'ask' | 'auto'>('ask');

  const [profileText, setProfileText] = useState('');
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<number | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedProfileText, setEditedProfileText] = useState('');
  const [isRebuildingProfile, setIsRebuildingProfile] = useState(false);
  const [memorySearch, setMemorySearch] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<
    'identity' | 'preference' | 'project' | 'skill' | 'other'
  >('identity');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    identity: true,
    preference: true,
    project: true,
    skill: true,
    other: true,
  });
  const [showDuplicates, setShowDuplicates] = useState(false);

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
      const sc = await db.meta.get('tool:search_chats');
      if (sc !== undefined) setToolSearchChats(Boolean(sc.value));
      const fg = await db.meta.get('tool:forget');
      if (fg !== undefined) setToolForget(Boolean(fg.value));
      const cd = await db.meta.get('tool:create_document');
      if (cd !== undefined) setToolCreateDocument(Boolean(cd.value));
      const ask = await db.meta.get('toolRunAsk');
      if (ask !== undefined) setToolRunAsk(Boolean(ask.value));
      const wsa = await db.meta.get('wsApproval');
      if (wsa !== undefined) setWsApproval(wsa.value === 'auto' ? 'auto' : 'ask');
    } catch {}
  };

  const loadMemories = async () => {
    try {
      const memMeta = await db.meta.get('memoryEnabled');
      setMemoryEnabled(memMeta ? Boolean(memMeta.value) : true);
      const all = await db.memories.orderBy('updatedAt').reverse().toArray();
      setMemories(all);
      const p = await db.meta.get('profile');
      if (p?.value) {
        setProfileText(p.value.text || '');
        setProfileUpdatedAt(p.value.updatedAt || null);
        setEditedProfileText(p.value.text || '');
      } else {
        setProfileText('');
        setProfileUpdatedAt(null);
        setEditedProfileText('');
      }
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

  const [proxyUrlInput, setProxyUrlInput] = useState('');
  const [proxySaved, setProxySaved] = useState(false);

  const loadProxyUrl = async () => {
    try {
      const row = await db.meta.get('proxyUrl');
      if (row && typeof row.value === 'string') {
        setProxyUrlInput(row.value);
      }
    } catch {}
  };

  const handleSaveProxyUrl = async () => {
    try {
      const trimmed = proxyUrlInput.trim();
      if (!trimmed) {
        await db.meta.delete('proxyUrl');
      } else {
        await db.meta.put({ key: 'proxyUrl', value: trimmed });
      }
      setProxySaved(true);
      setTimeout(() => setProxySaved(false), 2000);
    } catch {}
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
      loadProxyUrl();
    }, 0);
    return () => clearTimeout(timer);
  }, [settingsOpen]);

  useEffect(() => {
    if (settingsOpen && settingsTab === 'data') {
      const timer = setTimeout(() => {
        refreshStorage();
        loadGeneratedDocs();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [settingsOpen, settingsTab]);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

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
      category: newMemoryCategory,
      lastUsedAt: now,
    });
    setNewMemoryText('');
    const count = await db.memories.count();
    if (count > 300) {
      const old = await db.memories.orderBy('updatedAt').limit(count - 300).primaryKeys();
      await db.memories.bulkDelete(old);
    }
    await loadMemories();
  };

  const handleTogglePin = async (m: MemoryRow) => {
    const nextPinned = !m.pinned;
    await db.memories.update(m.id, { pinned: nextPinned, updatedAt: getNow() });
    await loadMemories();
  };

  const handleRebuildProfile = async () => {
    setIsRebuildingProfile(true);
    try {
      const text = await rebuildProfile();
      if (text) {
        setProfileText(text);
        setEditedProfileText(text);
        setProfileUpdatedAt(Date.now());
        useUIStore.getState().showToast('Profile summary updated', 2000);
      } else {
        useUIStore.getState().showToast('Could not rebuild profile. Add API key or memories first.', 3000);
      }
    } catch (err: any) {
      useUIStore.getState().showToast('Rebuild failed: ' + (err.message || 'Error'), 3000);
    } finally {
      setIsRebuildingProfile(false);
    }
  };

  const handleSaveProfile = async () => {
    const text = editedProfileText.trim();
    const profileVal = {
      text,
      updatedAt: Date.now(),
      basedOnCount: memories.length,
    };
    await db.meta.put({ key: 'profile', value: profileVal });
    setProfileText(text);
    setProfileUpdatedAt(profileVal.updatedAt);
    setIsEditingProfile(false);
    useUIStore.getState().showToast('Profile saved', 2000);
  };

  const handleExportMemories = () => {
    const data = JSON.stringify(memories, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const filename = `chatly-memories-${new Date().toISOString().slice(0, 10)}.json`;
    saveFile(blob, filename).catch((err) => console.error('Failed to export memories', err));
  };

  const handleImportMemories = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of memories.');
      let imported = 0;
      let skipped = 0;
      const now = getNow();
      const existing = await db.memories.toArray();

      for (const item of parsed) {
        if (typeof item?.text !== 'string' || !item.text.trim()) {
          skipped++;
          continue;
        }
        const text = item.text.trim().slice(0, 200);
        if (text.length < 5 || existing.some((ex) => similar(ex.text, text))) {
          skipped++;
          continue;
        }
        const cat = ['identity', 'preference', 'project', 'skill', 'other'].includes(item.category)
          ? item.category
          : 'other';
        const row: MemoryRow = {
          id: crypto.randomUUID(),
          text,
          source: 'manual',
          createdAt: item.createdAt || now,
          updatedAt: now,
          category: cat,
          projectId: item.projectId,
          lastUsedAt: item.lastUsedAt || now,
          pinned: Boolean(item.pinned),
        };
        await db.memories.put(row);
        existing.push(row);
        imported++;
      }

      await loadMemories();
      useUIStore.getState().showToast(`Imported ${imported} memories (${skipped} skipped)`, 3000);
    } catch (err: any) {
      useUIStore.getState().showToast('Import failed: ' + (err.message || 'Invalid format'), 4000);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleMergeDuplicate = async (keepId: string, deleteId: string) => {
    await db.memories.delete(deleteId);
    await loadMemories();
    useUIStore.getState().showToast('Merged duplicate memory', 2000);
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
    setCanSaveAnyway(false);
    const detected = detectProvider(val);
    if (detected) {
      setProvider(detected);
    }
  };

  const handleSaveAnyway = async () => {
    const cleanKey = rawKey.trim();
    if (!cleanKey) return;

    if (provider === 'custom' && !baseUrl.trim()) {
      setErrorMsg('Please enter a Base URL for custom provider');
      return;
    }

    setIsValidating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
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
        status: 'unknown',
        checkedAt: Date.now(),
        last4,
      };

      await addKey(newKeyRow, []);

      setSuccessMsg('Key saved anyway (status: unknown, 0 models cached).');
      setRawKey('');
      setLabel('');
      setBaseUrl('');
      setCanSaveAnyway(false);
      setIsAddFormOpen(false);
    } catch {
      setErrorMsg('Failed to save key.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleRecheckKey = async (keyId: string) => {
    setRecheckErrors((prev) => {
      const copy = { ...prev };
      delete copy[keyId];
      return copy;
    });

    const result = await recheckKey(keyId);
    if (result.status === 'invalid') {
      setRecheckErrors((prev) => ({
        ...prev,
        [keyId]: 'Invalid API key' + (result.detail ? ` (${result.detail})` : ''),
      }));
    } else if (result.status === 'unknown') {
      setRecheckErrors((prev) => ({
        ...prev,
        [keyId]: `Could not verify this key (${result.detail || 'Network error'}).`,
      }));
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
    setCanSaveAnyway(false);

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
        setErrorMsg('Invalid API key');
        setCanSaveAnyway(false);
        setIsValidating(false);
        return;
      }

      if (result.status === 'unknown') {
        setErrorMsg(`Could not verify this key (${result.detail || 'Network error'}).`);
        setCanSaveAnyway(true);
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
      setCanSaveAnyway(false);
      setIsAddFormOpen(false);
    } catch (e: any) {
      setErrorMsg(`Could not verify this key (${e?.message || 'Network error'}).`);
      setCanSaveAnyway(true);
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
              {memories.length}/300
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
          <button
            type="button"
            onClick={() => setSettingsTab('advanced')}
            className={`py-2.5 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              settingsTab === 'advanced'
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Advanced</span>
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
                  The AI decides when to use these. You can also just ask: &apos;search the web for &quot;...&quot;&apos;, &apos;make a landing page&apos;, &apos;calculate &quot;...&quot;&apos;.
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

                  {/* Search Chats Tool */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/40 border border-border">
                    <div>
                      <span className="text-xs font-semibold text-text">Search Chats</span>
                      <p className="text-[11px] text-muted">Search your past conversations for relevant excerpts when referred to</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toolSearchChats}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setToolSearchChats(val);
                          await db.meta.put({ key: 'tool:search_chats', value: val });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
                    </label>
                  </div>

                  {/* Forget Memory Tool */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/40 border border-border">
                    <div>
                      <span className="text-xs font-semibold text-text">Forget Memory</span>
                      <p className="text-[11px] text-muted">Allow the AI to delete specific memories when you ask it to forget</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toolForget}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setToolForget(val);
                          await db.meta.put({ key: 'tool:forget', value: val });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
                    </label>
                  </div>

                  {/* Create Document Tool */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/40 border border-border">
                    <div>
                      <span className="text-xs font-semibold text-text">Create Documents</span>
                      <p className="text-[11px] text-muted">Generate downloadable files: Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF, Markdown, CSV</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={toolCreateDocument}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setToolCreateDocument(val);
                          await db.meta.put({ key: 'tool:create_document', value: val });
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

                  {/* Workspace Diff Approval Setting */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface2/40 border border-border mt-3">
                    <div>
                      <span className="text-xs font-semibold text-text">Workspace File Edits Approval</span>
                      <p className="text-[11px] text-muted">Review code diffs before applying AI changes to workspace files</p>
                    </div>
                    <select
                      value={wsApproval}
                      onChange={async (e) => {
                        const val = e.target.value as 'ask' | 'auto';
                        setWsApproval(val);
                        await db.meta.put({ key: 'wsApproval', value: val });
                      }}
                      className="bg-surface border border-border text-xs rounded-lg px-2.5 py-1 text-text focus:outline-none focus:border-accent cursor-pointer"
                    >
                      <option value="ask">Always ask</option>
                      <option value="auto">Auto-apply</option>
                    </select>
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
                    className={`p-3.5 rounded-[14px] border transition-colors flex flex-col justify-between gap-2.5 ${
                      isSelected
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-surface hover:bg-surface2/50'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                          onClick={() => handleRecheckKey(key.id)}
                          disabled={isCheckingThis}
                          title="Re-check key health and refresh models"
                          aria-label="Re-check key"
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted hover:text-text hover:bg-surface2 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <RotateCw
                            className={`w-3.5 h-3.5 ${isCheckingThis ? 'animate-spin text-accent' : ''}`}
                          />
                          <span>Re-check</span>
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

                    {recheckErrors[key.id] && (
                      <div className="w-full p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="break-words">{recheckErrors[key.id]}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setRecheckErrors((prev) => {
                              const next = { ...prev };
                              delete next[key.id];
                              return next;
                            })
                          }
                          className="text-muted hover:text-text p-1 shrink-0"
                          aria-label="Dismiss error"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
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
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start sm:items-center gap-2 min-w-0">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                      <span className="break-words">{errorMsg}</span>
                    </div>
                    {canSaveAnyway && (
                      <button
                        type="button"
                        onClick={handleSaveAnyway}
                        disabled={isValidating}
                        className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface2 text-text font-medium border border-border transition-colors text-xs shrink-0 self-end sm:self-center cursor-pointer"
                      >
                        Save anyway
                      </button>
                    )}
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
                      ? 'Paste new Tavily key to replace (tvly- "")'
                      : 'Paste your Tavily API key (tvly- "")'
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

          {/* Generated files list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wider">
                Generated files ({generatedDocs.length})
              </h4>
              {generatedDocs.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllDocs}
                  className="text-[11px] text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {generatedDocs.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-surface2/40 border border-border text-center text-xs text-muted">
                No generated documents stored yet.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {generatedDocs.map((doc) => {
                  const fmt = (doc.format || 'file').toUpperCase();
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-surface2/60 border border-border text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-accent/15 text-accent border border-accent/30 shrink-0">
                          {fmt}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-text truncate max-w-[180px] sm:max-w-[240px]" title={doc.name}>
                            {doc.name}
                          </p>
                          <p className="text-[10px] text-muted">
                            {formatBytes(doc.size)} • {new Date(doc.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadDoc(doc)}
                          title="Download / Save"
                          className="p-1.5 rounded-lg bg-surface hover:bg-surface2 text-muted hover:text-text border border-border transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDoc(doc.id)}
                          title="Delete document"
                          className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-text uppercase tracking-wider">Backup & Reset</h4>
            
            <label className="flex items-center gap-2 text-xs text-text cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span>Include attachments (files and generated documents)</span>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => exportAll(includeAttachments)}
                className="flex-1 px-3 py-2 rounded-lg bg-surface2 hover:bg-border text-xs font-medium text-text transition-colors cursor-pointer"
              >
                Export Data {includeAttachments ? '(w/ attachments)' : ''}
              </button>
              <input
                type="file"
                ref={importRef}
                className="hidden"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const result = await importAll(file);
                    await loadGeneratedDocs();
                    alert(`Imported ${result.chats} chats, ${result.messages} messages.`);
                  } catch (e: any) {
                    alert(`Import failed: ${e.message}`);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="flex-1 px-3 py-2 rounded-lg bg-surface2 hover:bg-border text-xs font-medium text-text transition-colors cursor-pointer"
              >
                Import Backup
              </button>
            </div>
            
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 space-y-2">
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400">Danger Zone</p>
              <input
                type="text"
                placeholder="Type DELETE to confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="w-full bg-surface border border-rose-500/20 rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-rose-500"
              />
              <button
                type="button"
                disabled={deleteConfirm !== 'DELETE'}
                onClick={async () => {
                  await db.delete();
                  window.location.reload();
                }}
                className="w-full px-3 py-2 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
              >
                Delete All Data
              </button>
            </div>
          </div>

          {isInstallable && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wider">App</h4>
              <button
                type="button"
                onClick={async () => {
                  deferredPrompt?.prompt();
                  const { outcome } = await deferredPrompt.userChoice;
                  if (outcome === 'accepted') setIsInstallable(false);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Install App
              </button>
            </div>
          )}
        </div>
      ) : settingsTab === 'memory' ? (
        <div className="space-y-6">
          {/* Master toggle & Explainer */}
          <div className="p-4 rounded-xl bg-surface2/60 border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text">Long-term Memory ({memories.length}/300)</h3>
                <p className="text-xs text-muted mt-0.5">Durable facts, preferences & projects</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={memoryEnabled} onChange={handleToggleMemoryEnabled} className="sr-only peer" />
                <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:bg-accent" />
              </label>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Stored only on this device. Relevant memories are sent to your AI provider together with your messages. Incognito chats never read or write memory and are excluded from chat search.
            </p>
          </div>

          {/* Profile Card */}
          <div className="p-4 rounded-xl bg-surface2/40 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Profile Summary</h3>
              <div className="flex items-center gap-1">
                <button onClick={handleRebuildProfile} disabled={isRebuildingProfile} className="p-1.5 rounded-lg hover:bg-surface2 text-muted hover:text-accent cursor-pointer">
                  <RefreshCw className={`w-3.5 h-3.5 ${isRebuildingProfile ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setIsEditingProfile(!isEditingProfile)} className="p-1.5 rounded-lg hover:bg-surface2 text-muted hover:text-text cursor-pointer">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {isEditingProfile ? (
              <div className="space-y-2">
                <textarea value={editedProfileText} onChange={(e) => setEditedProfileText(e.target.value)} className="w-full bg-surface border border-accent rounded-lg p-2 text-xs text-text h-32" />
                <button onClick={handleSaveProfile} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold cursor-pointer">Save</button>
              </div>
            ) : (
              <p className="text-xs text-text/80 leading-relaxed whitespace-pre-line">{profileText || 'No profile generated yet.'}</p>
            )}
            {profileUpdatedAt && <p className="text-[10px] text-muted">Last updated: {new Date(profileUpdatedAt).toLocaleString()}</p>}
          </div>

          {/* Import/Export */}
          <div className="flex gap-2 text-xs">
            <button onClick={handleExportMemories} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface2 hover:bg-border text-text transition-colors cursor-pointer">
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
            <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface2 hover:bg-border text-text transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Import JSON
              <input type="file" accept=".json" onChange={handleImportMemories} className="hidden" />
            </label>
          </div>

          {/* Search & Duplicates */}
          <div className="space-y-2">
            <input type="text" placeholder="Search memories..." value={memorySearch} onChange={(e) => setMemorySearch(e.target.value)} className="w-full bg-surface2/60 border border-border rounded-xl px-3 py-2 text-xs" />
            <button onClick={() => setShowDuplicates(!showDuplicates)} className="text-[11px] text-accent hover:underline cursor-pointer">
              {showDuplicates ? 'Hide' : 'Check for'} potential duplicates
            </button>
          </div>

          {/* Grouped Memories */}
          {['identity', 'preference', 'project', 'skill', 'other'].map((cat) => {
            const catMemories = memories.filter((m) => m.category === cat && m.text.toLowerCase().includes(memorySearch.toLowerCase()));
            if (catMemories.length === 0) return null;
            return (
              <div key={cat} className="space-y-2">
                <button onClick={() => setExpandedCategories(prev => ({...prev, [cat]: !prev[cat]}))} className="flex items-center gap-2 text-xs font-semibold uppercase text-muted tracking-wider cursor-pointer">
                  {expandedCategories[cat] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {cat} ({catMemories.length})
                </button>
                {expandedCategories[cat] && (
                  <div className="space-y-1.5 pl-4">
                    {catMemories.map((m) => (
                      <div key={m.id} className="p-2.5 rounded-lg bg-surface2/30 border border-border text-xs flex items-center justify-between gap-2">
                        <span className="truncate flex-1">{m.text}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => handleTogglePin(m)} className={`p-1 rounded ${m.pinned ? 'text-accent' : 'text-muted'}`}><Pin className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteMemory(m.id)} className="p-1 rounded text-muted hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : settingsTab === 'advanced' ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-surface2/60 border border-border space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-text">Fallback Proxy URL</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Only needed if a provider blocks direct calls from the app. Use your deployed web app URL.
              </p>
            </div>
            <div className="space-y-2">
              <input
                type="url"
                value={proxyUrlInput}
                onChange={(e) => setProxyUrlInput(e.target.value)}
                placeholder="https://your-chatly-app.vercel.app"
                className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent font-mono transition-colors"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted">
                  {proxySaved ? 'Saved!' : 'Leave blank for direct device-to-provider calls.'}
                </span>
                <button
                  type="button"
                  onClick={handleSaveProxyUrl}
                  className="px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-95 transition-opacity cursor-pointer"
                >
                  Save Proxy URL
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}
