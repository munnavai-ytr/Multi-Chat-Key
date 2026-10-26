'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Globe,
  Search,
  Sliders,
  Pin,
  Download,
  Upload,
  Sparkles,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Volume2,
  Play,
  HardDrive,
  BarChart3,
  Check,
  Database,
  FileText,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { useUIStore, SettingsTab } from '@/store/ui';
import { useKeysStore } from '@/store/keys';
import { speak } from '@/lib/voice';
import { useChatStore } from '@/store/chat';
import { ProviderId, detectProvider, listModels } from '@/lib/providers';
import { encryptKey, decryptKey } from '@/lib/crypto';
import { db, KeyRow, MemoryRow, DocRow } from '@/lib/db';
import { webSearch } from '@/lib/search';
import { storageInfo, requestPersistence } from '@/lib/storage';
import { similar, rebuildProfile } from '@/lib/memory';
import {
  getPoolConfig,
  savePoolConfig,
  PoolConfig,
  setSimulated429,
  isKeyOnCooldown,
  getCooldown,
  clearCooldown,
  DEFAULT_POOL_CONFIG,
} from '@/lib/failover';
import {
  getRouterMode,
  setRouterMode,
  getModelSlots,
  saveModelSlots,
  RouterMode,
  ModelSlots,
  DEFAULT_MODEL_SLOTS,
} from '@/lib/router';
import {
  getCustomPrices,
  saveCustomPrices,
  PriceTable,
  getKeyDailySpend,
  getKeyDailyBudget,
  setKeyDailyBudget,
} from '@/lib/pricing';
import {
  SettingsPage,
  Section,
  Card,
  Row,
  Switch,
  Segmented,
  TextField,
  TextArea,
  SelectField,
  Button,
  Pill,
  Callout,
  Stat,
  EmptyHint,
  DangerZone,
} from './settings/ui';
import { SecuritySettings } from './settings/SecuritySettings';

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

interface NavItem {
  id: SettingsTab;
  label: string;
  description: string;
  icon: React.ReactNode;
  group: 'capabilities' | 'models' | 'personalization' | 'data' | 'system';
  badge?: React.ReactNode;
  keywords?: string[];
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

  // Search filter inside Settings
  const [navSearch, setNavSearch] = useState('');
  // Mobile drill-down navigation state
  const [mobileSection, setMobileSection] = useState<SettingsTab | null>(null);

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

  // Failover Pool & Router states
  const [poolConfig, setPoolConfigState] = useState<PoolConfig>(DEFAULT_POOL_CONFIG);
  const [routerMode, setRouterModeState] = useState<RouterMode>('manual');
  const [modelSlots, setModelSlotsState] = useState<ModelSlots>(DEFAULT_MODEL_SLOTS);
  const [failoverCount, setFailoverCount] = useState(0);
  const [councilRunCount, setCouncilRunCount] = useState(0);
  const [keyBudgets, setKeyBudgetsState] = useState<Record<string, number>>({});
  const [keySpends, setKeySpendsState] = useState<Record<string, number>>({});

  const loadFailoverAndRouter = async () => {
    const pc = await getPoolConfig();
    setPoolConfigState(pc);
    const rm = await getRouterMode();
    setRouterModeState(rm);
    const ms = await getModelSlots();
    setModelSlotsState(ms);

    const foRow = await db.meta.get('failoverEventsCount');
    setFailoverCount(Number(foRow?.value || 0));

    const crRow = await db.meta.get('councilRunsCount');
    setCouncilRunCount(Number(crRow?.value || 0));

    const kbRow = await db.meta.get('keyBudgets');
    setKeyBudgetsState((kbRow?.value || {}) as Record<string, number>);

    const spends: Record<string, number> = {};
    for (const k of keys) {
      spends[k.id] = await getKeyDailySpend(k.id);
    }
    setKeySpendsState(spends);
  };

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
  const [confirmClearMemories, setConfirmClearMemories] = useState(false);

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
  const [toolDeepResearch, setToolDeepResearch] = useState(true);
  const [researchAuto, setResearchAuto] = useState(false);
  const [researchDepth, setResearchDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [toolRunAsk, setToolRunAsk] = useState(true);
  const [showActivity, setShowActivity] = useState(true);
  const [wsApproval, setWsApproval] = useState<'ask' | 'auto'>('ask');
  const [thinkingLevel, setThinkingLevel] = useState<'off' | 'auto' | 'high'>('auto');
  const [voiceLang, setVoiceLang] = useState('auto');
  const [voiceAutoRead, setVoiceAutoRead] = useState(false);
  const [voiceAutoSend, setVoiceAutoSend] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  const [contextMode, setContextModeState] = useState<'economy' | 'balanced' | 'max'>('economy');
  const [maxAgentSteps, setMaxAgentStepsState] = useState<string>('auto');
  const [governorEnabled, setGovernorEnabledState] = useState<boolean>(true);
  const [governorTPM, setGovernorTPM] = useState<string>('');
  const [governorRPM, setGovernorRPM] = useState<string>('');
  const [connectionMode, setConnectionModeState] = useState<'auto' | 'direct' | 'via-server'>('auto');
  const [learnedLimits, setLearnedLimits] = useState<Record<string, { tpm?: number; rpm?: number }>>({});

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
      const dr = await db.meta.get('tool:deep_research');
      if (dr !== undefined) setToolDeepResearch(Boolean(dr.value));
      const ra = await db.meta.get('researchAuto');
      if (ra !== undefined) setResearchAuto(Boolean(ra.value));
      const rd = await db.meta.get('researchDepth');
      if (rd?.value) setResearchDepth(rd.value as 'quick' | 'standard' | 'deep');
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
      const sa = await db.meta.get('showActivity');
      if (sa !== undefined) setShowActivity(Boolean(sa.value));
      const wsa = await db.meta.get('wsApproval');
      if (wsa !== undefined) setWsApproval(wsa.value === 'auto' ? 'auto' : 'ask');
      const tl = await db.meta.get('thinkingLevel');
      if (tl?.value) setThinkingLevel(tl.value as 'off' | 'auto' | 'high');
      const vl = await db.meta.get('voiceLang');
      if (vl?.value) setVoiceLang(String(vl.value));
      const varRow = await db.meta.get('voiceAutoRead');
      if (varRow !== undefined) setVoiceAutoRead(Boolean(varRow.value));
      const vasRow = await db.meta.get('voiceAutoSend');
      if (vasRow !== undefined) setVoiceAutoSend(Boolean(vasRow.value));

      const cmRow = await db.meta.get('contextMode');
      if (cmRow?.value) setContextModeState(cmRow.value as any);
      const masRow = await db.meta.get('maxAgentSteps');
      if (masRow !== undefined) setMaxAgentStepsState(String(masRow.value));
      const govRow = await db.meta.get('governorEnabled');
      if (govRow !== undefined) setGovernorEnabledState(Boolean(govRow.value));
      const tpmRow = await db.meta.get('governorTPM');
      if (tpmRow?.value !== undefined) setGovernorTPM(String(tpmRow.value));
      const rpmRow = await db.meta.get('governorRPM');
      if (rpmRow?.value !== undefined) setGovernorRPM(String(rpmRow.value));
      const connRow = await db.meta.get('connectionMode');
      if (connRow?.value) setConnectionModeState(connRow.value as any);

      const allMeta = await db.meta.toArray();
      const learned: Record<string, { tpm?: number; rpm?: number }> = {};
      for (const m of allMeta) {
        if (m.key.startsWith('limit:')) {
          const parts = m.key.split(':');
          if (parts.length === 4) {
            const key = `${parts[1]}:${parts[2]}`;
            if (!learned[key]) learned[key] = {};
            if (parts[3] === 'tpm') learned[key].tpm = Number(m.value);
            if (parts[3] === 'rpm') learned[key].rpm = Number(m.value);
          }
        }
      }
      setLearnedLimits(learned);
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

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!settingsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen, setSettingsOpen]);

  useEffect(() => {
    if (!settingsOpen) {
      setMobileSection(null);
      return;
    }
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
      loadFailoverAndRouter();
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
    setConfirmClearMemories(false);
    await loadMemories();
  };

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

  // Nav items definition
  const navItems: NavItem[] = useMemo(
    () => [
      {
        id: 'tools',
        label: 'AI Tools',
        description: 'Smart mode, web search, code execution & reasoning',
        icon: <Brain className="w-4 h-4 text-accent" />,
        group: 'capabilities',
        keywords: ['tools', 'artifacts', 'sandbox', 'python', 'code', 'smart mode', 'deep research', 'reasoning'],
      },
      {
        id: 'voice',
        label: 'Voice',
        description: 'Speech recognition, audio output & auto-read',
        icon: <Volume2 className="w-4 h-4 text-accent" />,
        group: 'capabilities',
        keywords: ['voice', 'speech', 'microphone', 'audio', 'tts', 'transcription', 'bengali', 'hindi'],
      },
      {
        id: 'keys',
        label: 'API Keys & Prompt',
        description: 'Manage provider keys, active model & system prompt',
        icon: <KeyRound className="w-4 h-4 text-accent" />,
        group: 'models',
        badge: keys.length > 0 ? (
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-surface2 text-muted">
            {keys.length}
          </span>
        ) : undefined,
        keywords: ['api key', 'openai', 'gemini', 'anthropic', 'groq', 'openrouter', 'tokens', 'custom instructions'],
      },
      {
        id: 'models',
        label: 'Models & Failover',
        description: 'Key pool resilience, failover & Auto-Router slots',
        icon: <Sliders className="w-4 h-4 text-accent" />,
        group: 'models',
        keywords: ['models', 'failover', 'pool', 'auto-router', 'router', 'cooldown', 'retry', '429'],
      },
      {
        id: 'search',
        label: 'Web Search',
        description: 'Tavily live search integration & status',
        icon: <Globe className="w-4 h-4 text-accent" />,
        group: 'models',
        badge: hasSavedSearchKey ? (
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Web search active" />
        ) : undefined,
        keywords: ['tavily', 'search', 'web search', 'live facts', 'news', 'internet'],
      },
      {
        id: 'memory',
        label: 'Memory',
        description: 'Personal facts, user profile & durable preferences',
        icon: <Sparkles className="w-4 h-4 text-accent" />,
        group: 'personalization',
        badge: (
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-surface2 text-muted">
            {memories.length}/300
          </span>
        ),
        keywords: ['memory', 'profile', 'remember', 'facts', 'bio', 'projects', 'preferences'],
      },
      {
        id: 'usage',
        label: 'Usage',
        description: 'Token tracking & session activity metrics',
        icon: <BarChart3 className="w-4 h-4 text-accent" />,
        group: 'data',
        keywords: ['usage', 'tokens', 'cost', 'metrics', 'activity'],
      },
      {
        id: 'data',
        label: 'Data & Storage',
        description: 'Local storage, generated files & full backup',
        icon: <Database className="w-4 h-4 text-accent" />,
        group: 'data',
        keywords: ['data', 'storage', 'backup', 'export', 'import', 'files', 'clear data', 'pwa'],
      },
      {
        id: 'advanced',
        label: 'Advanced',
        description: 'Proxy routing & network settings',
        icon: <Sliders className="w-4 h-4 text-accent" />,
        group: 'system',
        keywords: ['advanced', 'proxy', 'fallback', 'network', 'cors'],
      },
      {
        id: 'security',
        label: 'Security',
        description: 'Permission center, policy engine, audit log & kill switch',
        icon: <ShieldCheck className="w-4 h-4 text-accent" />,
        group: 'system',
        keywords: [
          'security',
          'policy',
          'permissions',
          'audit log',
          'kill switch',
          'exec',
          'command',
          'risk',
        ],
      },
    ],
    [keys.length, hasSavedSearchKey, memories.length]
  );

  // Group definitions for Claude-style sidebar
  const groups: { id: NavItem['group']; label: string }[] = [
    { id: 'capabilities', label: 'General' },
    { id: 'models', label: 'Models & Access' },
    { id: 'personalization', label: 'Personalization' },
    { id: 'data', label: 'Data & Storage' },
    { id: 'system', label: 'System' },
  ];

  // Filter nav items by search query
  const filteredNavItems = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    if (!q) return navItems;
    return navItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(q)))
    );
  }, [navItems, navSearch]);

  if (!settingsOpen) return null;

  /* -------------------------------------------------------------------------- */
  /*                             RENDER TAB CONTENT                             */
  /* -------------------------------------------------------------------------- */

  const renderToolsContent = () => (
    <SettingsPage
      title="AI Tools"
      description="Configure built-in capabilities and assistant autonomy."
    >
      <Section
        title="Smart Mode"
        description="The AI decides when to call tools automatically based on your instructions."
      >
        <Card>
          <Row
            icon={<Brain className="w-4 h-4 text-accent" />}
            title="Enable Smart Mode"
            description="When enabled, tools run dynamically when relevant (e.g., search the web, write code, create charts)."
            control={
              <Switch
                checked={smartMode}
                onChange={async (val) => {
                  setSmartMode(val);
                  await db.meta.put({ key: 'smartMode', value: val });
                }}
                ariaLabel="Enable smart mode"
              />
            }
          />
        </Card>
      </Section>

      {smartMode && (
        <>
          <Section
            title="Available Tools"
            description="Enable or disable specific capabilities the model may invoke."
          >
            <Card>
              {/* Web Search Tool */}
              <Row
                icon={<Globe className="w-4 h-4 text-accent" />}
                title={
                  <div className="flex items-center gap-2">
                    <span>Web Search</span>
                    {!hasSavedSearchKey && (
                      <Pill tone="warning">Tavily Key Required</Pill>
                    )}
                  </div>
                }
                description={
                  <div>
                    <span>Retrieve current information, citations, and live news from the web.</span>
                    {!hasSavedSearchKey && (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsTab('search');
                            setMobileSection('search');
                          }}
                          className="text-accent hover:underline text-xs font-medium cursor-pointer"
                        >
                          + Configure Tavily API key
                        </button>
                      </div>
                    )}
                  </div>
                }
                control={
                  <Switch
                    checked={toolWebSearch}
                    disabled={!hasSavedSearchKey}
                    onChange={async (val) => {
                      setToolWebSearch(val);
                      await db.meta.put({ key: 'tool:web_search', value: val });
                    }}
                    ariaLabel="Toggle web search tool"
                  />
                }
              />

              {/* Create Artifact Tool */}
              <Row
                icon={<Sparkles className="w-4 h-4 text-accent" />}
                title="Create Artifacts"
                description="Generate interactive UI previews, HTML, SVGs, and live React widgets."
                control={
                  <Switch
                    checked={toolArtifact}
                    onChange={async (val) => {
                      setToolArtifact(val);
                      await db.meta.put({ key: 'tool:create_artifact', value: val });
                    }}
                    ariaLabel="Toggle create artifact tool"
                  />
                }
              />

              {/* Run Code Tool */}
              <Row
                icon={<Sliders className="w-4 h-4 text-accent" />}
                title="Code Sandbox"
                description="Execute Python and JavaScript computations safely in a browser sandbox."
                control={
                  <Switch
                    checked={toolRunCode}
                    onChange={async (val) => {
                      setToolRunCode(val);
                      await db.meta.put({ key: 'tool:run_code', value: val });
                    }}
                    ariaLabel="Toggle run code tool"
                  />
                }
              />

              {/* Remember Tool */}
              <Row
                icon={<Brain className="w-4 h-4 text-accent" />}
                title="Remember Facts"
                description="Allow the model to extract and save persistent memories about you across chats."
                control={
                  <Switch
                    checked={toolRemember}
                    onChange={async (val) => {
                      setToolRemember(val);
                      await db.meta.put({ key: 'tool:remember', value: val });
                    }}
                    ariaLabel="Toggle remember tool"
                  />
                }
              />

              {/* Search Chats Tool */}
              <Row
                icon={<Search className="w-4 h-4 text-accent" />}
                title="Search Chat History"
                description="Search your past discussions when you refer to earlier conversations."
                control={
                  <Switch
                    checked={toolSearchChats}
                    onChange={async (val) => {
                      setToolSearchChats(val);
                      await db.meta.put({ key: 'tool:search_chats', value: val });
                    }}
                    ariaLabel="Toggle search chats tool"
                  />
                }
              />

              {/* Forget Memory Tool */}
              <Row
                icon={<Trash2 className="w-4 h-4 text-accent" />}
                title="Forget Memory"
                description="Allow the AI to prune memories when you explicitly request it to forget."
                control={
                  <Switch
                    checked={toolForget}
                    onChange={async (val) => {
                      setToolForget(val);
                      await db.meta.put({ key: 'tool:forget', value: val });
                    }}
                    ariaLabel="Toggle forget memory tool"
                  />
                }
              />

              {/* Create Documents Tool */}
              <Row
                icon={<FileText className="w-4 h-4 text-accent" />}
                title="Create Documents"
                description="Produce downloadable .docx, .xlsx, .pptx, Markdown, and CSV files."
                control={
                  <Switch
                    checked={toolCreateDocument}
                    onChange={async (val) => {
                      setToolCreateDocument(val);
                      await db.meta.put({ key: 'tool:create_document', value: val });
                    }}
                    ariaLabel="Toggle create document tool"
                  />
                }
              />

              {/* Deep Research Tool */}
              <Row
                icon={<Search className="w-4 h-4 text-accent" />}
                title={
                  <div className="flex items-center gap-2">
                    <span>Deep Research</span>
                    {!hasSavedSearchKey && <Pill tone="warning">Requires Tavily</Pill>}
                  </div>
                }
                description="Autonomous multi-step investigation: planning, recursive searches, notes synthesis and structured reports."
                control={
                  <Switch
                    checked={toolDeepResearch}
                    disabled={!hasSavedSearchKey}
                    onChange={async (val) => {
                      setToolDeepResearch(val);
                      await db.meta.put({ key: 'tool:deep_research', value: val });
                    }}
                    ariaLabel="Toggle deep research tool"
                  />
                }
              />
            </Card>
          </Section>

          <Section
            title="Execution Preferences"
            description="Control confirmation prompts and thinking behavior."
          >
            <Card>
              <Row
                title="Auto-start deep research"
                description="Launch research investigations immediately without asking for confirmation."
                control={
                  <Switch
                    checked={researchAuto}
                    onChange={async (val) => {
                      setResearchAuto(val);
                      await db.meta.put({ key: 'researchAuto', value: val });
                    }}
                    ariaLabel="Toggle auto-start deep research"
                  />
                }
              />

              <Row
                title="Default research depth"
                description="Set the default investigation budget for queries."
                stacked
                control={
                  <Segmented
                    value={researchDepth}
                    onChange={async (val) => {
                      setResearchDepth(val);
                      await db.meta.put({ key: 'researchDepth', value: val });
                    }}
                    options={[
                      { value: 'quick', label: 'Quick (~3)' },
                      { value: 'standard', label: 'Standard (~8)' },
                      { value: 'deep', label: 'Deep (~18)' },
                    ]}
                  />
                }
              />

              <Row
                title="Confirm code execution"
                description="Show an approval dialog before running sandbox Python/JS scripts."
                control={
                  <Switch
                    checked={toolRunAsk}
                    onChange={async (val) => {
                      setToolRunAsk(val);
                      await db.meta.put({ key: 'toolRunAsk', value: val });
                    }}
                    ariaLabel="Ask before running code"
                  />
                }
              />

              <Row
                title="Show activity status"
                description="Display real-time live activity tracking for thinking, tool executions, and answer generation."
                control={
                  <Switch
                    checked={showActivity}
                    onChange={async (val) => {
                      setShowActivity(val);
                      await db.meta.put({ key: 'showActivity', value: val });
                    }}
                    ariaLabel="Toggle show activity status"
                  />
                }
              />

              <Row
                title="Workspace file edits approval"
                description="Review diffs before applying AI changes to project files."
                stacked
                control={
                  <Segmented
                    value={wsApproval}
                    onChange={async (val) => {
                      setWsApproval(val);
                      await db.meta.put({ key: 'wsApproval', value: val });
                    }}
                    options={[
                      { value: 'ask', label: 'Always ask' },
                      { value: 'auto', label: 'Auto-apply' },
                    ]}
                  />
                }
              />

              <Row
                title="Thinking & Reasoning"
                description="Visibility of chain-of-thought tokens for compatible models (Claude 3.7+, Gemini 2.5+, DeepSeek)."
                stacked
                control={
                  <Segmented
                    value={thinkingLevel}
                    onChange={async (val) => {
                      setThinkingLevel(val);
                      await db.meta.put({ key: 'thinkingLevel', value: val });
                    }}
                    options={[
                      { value: 'auto', label: 'Adaptive' },
                      { value: 'high', label: 'Deep' },
                      { value: 'off', label: 'Off' },
                    ]}
                  />
                }
              />

              <Row
                title="Context Economy Mode"
                description="Controls history compaction policy to prevent context overflow and reduce token consumption."
                stacked
                control={
                  <Segmented
                    value={contextMode}
                    onChange={async (val) => {
                      setContextModeState(val as any);
                      await db.meta.put({ key: 'contextMode', value: val });
                    }}
                    options={[
                      { value: 'economy', label: 'Economy' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'max', label: 'Maximum' },
                    ]}
                  />
                }
              />

              <Row
                title="Max Agent Steps"
                description="Maximum tool-calling loop iterations before pausing for user review."
                stacked
                control={
                  <Segmented
                    value={maxAgentSteps}
                    onChange={async (val) => {
                      setMaxAgentStepsState(val);
                      const numVal = val === 'auto' ? 'auto' : Number(val);
                      await db.meta.put({ key: 'maxAgentSteps', value: numVal });
                    }}
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: '10', label: '10' },
                      { value: '20', label: '20' },
                      { value: '40', label: '40' },
                      { value: '100', label: '100' },
                    ]}
                  />
                }
              />
            </Card>
          </Section>

          <Section
            title="Workspace Code Intelligence"
            description="In-browser project validation and multi-language verification."
          >
            <Card>
              <Row
                title="Tree-sitter multi-language syntax"
                description="Validates JS/TS, Python, Go, Rust, Java, C/C++, Kotlin, Swift, PHP, Ruby, Bash, HTML, CSS, JSON, YAML, TOML, and SQL in-browser via WebAssembly."
                control={
                  <span className="text-xs font-mono text-muted px-2.5 py-1 rounded-full bg-surface2 border border-border/50">
                    Active
                  </span>
                }
              />
              <Row
                title="Import resolution & dependency audit"
                description="Audits relative paths, tsconfig aliases (@/*), and verifies package imports against package.json."
                control={
                  <span className="text-xs font-mono text-muted px-2.5 py-1 rounded-full bg-surface2 border border-border/50">
                    Active
                  </span>
                }
              />
            </Card>
            <p className="text-xs text-muted leading-relaxed px-1 mt-1">
              Code checks run strictly client-side inside WebAssembly runtimes without sending workspace source files to remote servers.
            </p>
          </Section>
        </>
      )}
    </SettingsPage>
  );

  const renderKeysContent = () => (
    <SettingsPage
      title="API Keys & Prompt"
      description="Manage provider credentials, encryption keys, and system-wide instructions."
      action={
        !isAddFormOpen ? (
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              setIsAddFormOpen(true);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            Add Key
          </Button>
        ) : null
      }
    >
      {/* Success Banner */}
      {successMsg && (
        <Callout tone="success" icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}>
          {successMsg}
        </Callout>
      )}

      {/* Add Key Form */}
      {isAddFormOpen && (
        <Section title="Add New API Key" description="Your key is encrypted with AES-GCM and stored only in your local browser IndexedDB.">
          <Card className="p-4 sm:p-5 space-y-4">
            <form onSubmit={handleSaveKey} className="space-y-4">
              <TextField
                label="API Key"
                required
                type={showKey ? 'text' : 'password'}
                value={rawKey}
                onChange={handleKeyChange}
                placeholder="Paste key (sk-..., AIza..., gsk_...)"
                fontMono
                autoFocus
                autoComplete="off"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                    className="p-1 text-muted hover:text-text rounded-md focus-visible:outline-none"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SelectField
                  label="Provider"
                  value={provider}
                  onChange={(val) => setProvider(val as ProviderId)}
                  options={PROVIDER_OPTIONS.map((p) => ({ value: p.id, label: p.name }))}
                />

                <TextField
                  label="Key Label"
                  value={label}
                  onChange={setLabel}
                  placeholder={`e.g. Work ${PROVIDER_OPTIONS.find((p) => p.id === provider)?.name || 'Gemini'} Key`}
                  helper="Optional custom nickname"
                />
              </div>

              {provider === 'custom' && (
                <TextField
                  label="Base URL"
                  required
                  value={baseUrl}
                  onChange={setBaseUrl}
                  placeholder="https://api.together.xyz/v1"
                  fontMono
                  helper="Base endpoint for OpenAI-compatible proxies"
                />
              )}

              <Callout tone="neutral" icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}>
                Zero telemetry. Keys never pass through any intermediary server—calls run directly from this device.
              </Callout>

              {errorMsg && (
                <Callout tone="danger" icon={<AlertCircle className="w-4 h-4 text-rose-500" />}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span>{errorMsg}</span>
                    {canSaveAnyway && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSaveAnyway}
                        disabled={isValidating}
                      >
                        Save anyway
                      </Button>
                    )}
                  </div>
                </Callout>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsAddFormOpen(false);
                    setRawKey('');
                    setErrorMsg(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isValidating}
                  disabled={!rawKey.trim()}
                >
                  {isValidating ? 'Validating Key...' : 'Save & Verify'}
                </Button>
              </div>
            </form>
          </Card>
        </Section>
      )}

      {/* Keys List */}
      <Section
        title={`Configured Keys (${keys.length})`}
        description="Select the active provider key used for current sessions."
      >
        {keys.length === 0 && !isAddFormOpen ? (
          <EmptyHint
            icon={<KeyRound className="w-5 h-5" />}
            title="No API keys saved yet"
            description="Add an API key from Google Gemini, OpenAI, Groq, or Anthropic to start chatting."
            action={
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setIsAddFormOpen(true)}
              >
                Add your first key
              </Button>
            }
          />
        ) : (
          <Card>
            {keys.map((k) => {
              const isSelected = selectedKeyId === k.id;
              const isCheckingThis = recheckingKeyId === k.id;

              let tone: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
              let statusLabel = 'Unknown';
              if (k.status === 'valid') {
                tone = 'success';
                statusLabel = 'Valid';
              } else if (k.status === 'limited') {
                tone = 'warning';
                statusLabel = 'Rate Limited';
              } else if (k.status === 'invalid') {
                tone = 'danger';
                statusLabel = 'Invalid';
              }

              return (
                <div key={k.id} className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-text truncate">
                          {k.label}
                        </span>
                        <Pill tone="neutral" className="uppercase text-[10px] tracking-wider">
                          {k.provider}
                        </Pill>
                        <Pill tone={tone}>{statusLabel}</Pill>
                        {isSelected && <Pill tone="accent">Active</Pill>}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                        <span className="font-mono text-[11px] tracking-wider">
                          ••••••••{k.last4 || '••••'}
                        </span>
                        <span>•</span>
                        <span>Checked {formatLastChecked(k.checkedAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {!isSelected && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => selectKey(k.id)}
                        >
                          Use
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RotateCw className={`w-3.5 h-3.5 ${isCheckingThis ? 'animate-spin text-accent' : ''}`} />}
                        disabled={isCheckingThis}
                        onClick={() => handleRecheckKey(k.id)}
                      >
                        Re-check
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={() => deleteKey(k.id)}
                        aria-label="Delete key"
                      />
                    </div>
                  </div>

                  {recheckErrors[k.id] && (
                    <Callout tone="danger" icon={<AlertCircle className="w-4 h-4 text-rose-500" />}>
                      <div className="flex items-center justify-between gap-2">
                        <span>{recheckErrors[k.id]}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setRecheckErrors((prev) => {
                              const next = { ...prev };
                              delete next[k.id];
                              return next;
                            })
                          }
                          className="text-muted hover:text-text p-1 shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Callout>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </Section>

      {/* Custom Instructions */}
      <Section
        title="Custom Instructions"
        description="Persistent guidance injected into every prompt for tailored tone and format."
      >
        <Card className="p-4 sm:p-5">
          <TextArea
            label="Behavior & Persona Instructions"
            value={customInstructions}
            onChange={handleCustomInstructionsChange}
            maxLength={3000}
            counter
            rows={4}
            placeholder="Tell the model how you'd like it to respond (e.g. 'Prefer concise bullet points', 'Act as a principal software engineer', 'Respond in Bengali when queried in Bengali')."
          />
        </Card>
      </Section>

      {/* Quick Provider Links */}
      <Section title="Get API Keys" description="Direct official developer consoles to generate tokens.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { name: 'Google Gemini', url: 'https://aistudio.google.com/app/apikey' },
            { name: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
            { name: 'Groq', url: 'https://console.groq.com/keys' },
            { name: 'Anthropic', url: 'https://console.anthropic.com/settings/keys' },
          ].map((item) => (
            <a
              key={item.name}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="p-3 rounded-xl bg-surface hover:bg-surface2/80 border border-border flex items-center justify-between text-xs font-medium text-text transition-colors group"
            >
              <span>{item.name}</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors" />
            </a>
          ))}
        </div>
      </Section>
    </SettingsPage>
  );

  const renderModelsContent = () => (
    <SettingsPage
      title="Models & Failover"
      description="Key pool resilience, automatic rate-limit failover, and Auto-Router heuristics."
    >
      <Callout tone="accent" icon={<ShieldCheck className="w-4 h-4 text-accent" />} title="Key Pool & Failover Architecture">
        <p>
          Several keys of the same provider act as one pool. When a request hits HTTP 429, rate limits, or quota limits, Chatly automatically switches to another healthy key or fallback chain seamlessly without interrupting your conversation.
        </p>
      </Callout>

      <Section title="Pool & Failover Switch" description="Enable or disable automatic key failover for rate limit resilience.">
        <Card>
          <Row
            icon={<RefreshCw className="w-4 h-4 text-accent" />}
            title="Enable Automatic Failover"
            description="Automatically retry failed requests on alternative keys or fallback models when rate limited."
            control={
              <Switch
                checked={poolConfig.enabled}
                onChange={async (val) => {
                  const updated = { ...poolConfig, enabled: val };
                  setPoolConfigState(updated);
                  await savePoolConfig(updated);
                }}
                ariaLabel="Toggle automatic failover pool"
              />
            }
          />
        </Card>
      </Section>

      <Section title="Rate Governor & Traffic Pacing" description="Smooth request spikes to stay within provider token and request limits.">
        <Card className="p-4 sm:p-5 space-y-4">
          <Row
            icon={<Sliders className="w-4 h-4 text-accent" />}
            title="Smooth requests to avoid rate limits"
            description="Pacing delay between requests based on TPM/RPM limits and adaptive backoff."
            control={
              <Switch
                checked={governorEnabled}
                onChange={async (val) => {
                  setGovernorEnabledState(val);
                  await db.meta.put({ key: 'governorEnabled', value: val });
                }}
                ariaLabel="Toggle rate governor"
              />
            }
          />
          {governorEnabled && (
            <div className="space-y-3 pt-3 border-t border-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  label="Manual Tokens Per Minute (TPM)"
                  value={governorTPM}
                  onChange={async (val) => {
                    setGovernorTPM(val);
                    const num = val ? Number(val) : undefined;
                    await db.meta.put({ key: 'governorTPM', value: num });
                  }}
                  placeholder="e.g. 100000"
                  fontMono
                />
                <TextField
                  label="Manual Requests Per Minute (RPM)"
                  value={governorRPM}
                  onChange={async (val) => {
                    setGovernorRPM(val);
                    const num = val ? Number(val) : undefined;
                    await db.meta.put({ key: 'governorRPM', value: num });
                  }}
                  placeholder="e.g. 15"
                  fontMono
                />
              </div>

              <div className="p-3 bg-surface2/60 rounded-xl space-y-2 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text">Learned Rate Limits (Auto-Learned via 429)</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const { resetLimits } = await import('@/lib/governor');
                      await resetLimits();
                      setLearnedLimits({});
                      useUIStore.getState().showToast('Learned rate limits reset', 2000);
                    }}
                  >
                    Reset Limits
                  </Button>
                </div>
                {Object.keys(learnedLimits).length === 0 ? (
                  <div className="text-xs text-muted">No learned rate limit caps recorded yet.</div>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(learnedLimits).map(([key, limit]) => (
                      <div key={key} className="flex items-center justify-between text-xs font-mono">
                        <span className="text-text">{key}</span>
                        <span className="text-muted">
                          {limit.tpm ? `${Math.round(limit.tpm)} TPM` : ''}{' '}
                          {limit.rpm ? `${Math.round(limit.rpm)} RPM` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Key Pool & Cooldown Status" description="Live status of configured provider keys and cooldown states.">
        <Card>
          {keys.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted">
              No API keys configured yet. Add keys in the API Keys tab first.
            </div>
          ) : (
            keys.map((k) => {
              const cooldown = getCooldown(k.id);
              const isOnCooldown = Boolean(cooldown);
              const remainingSec = cooldown ? Math.max(1, Math.ceil((cooldown.until - Date.now()) / 1000)) : 0;

              return (
                <div key={k.id} className="p-4 border-b border-border last:border-b-0 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-text truncate">{k.label}</span>
                        <Pill tone="neutral" className="uppercase text-[10px]">{k.provider}</Pill>
                        {isOnCooldown ? (
                          <Pill tone="warning">cooling {remainingSec}s ({cooldown?.reason})</Pill>
                        ) : (
                          <Pill tone="success">Ready</Pill>
                        )}
                      </div>
                      <div className="text-[11px] text-muted font-mono mt-0.5">
                        Key: ••••••••{k.last4 || '••••'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        onClick={() => {
                          setSimulated429(k.id, 60);
                          loadFailoverAndRouter();
                          useUIStore.getState().showToast(`Simulated 429 rate limit on ${k.label}`, 3000);
                        }}
                      >
                        Test Failover
                      </Button>
                      {isOnCooldown && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            clearCooldown(k.id);
                            loadFailoverAndRouter();
                          }}
                        >
                          Clear Cooldown
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </Section>

      <Section title="Auto-Router" description="Smart model selection heuristic based on context and task requirements.">
        <Card className="p-4 sm:p-5 space-y-4">
          <Row
            icon={<Sliders className="w-4 h-4 text-accent" />}
            title="Routing Mode"
            description="Choose between Manual (user selected model) and Smart (heuristic routing)."
            stacked
            control={
              <Segmented
                value={routerMode}
                onChange={async (val) => {
                  const mode = val as RouterMode;
                  setRouterModeState(mode);
                  await setRouterMode(mode);
                }}
                options={[
                  { value: 'manual', label: 'Manual (Default)' },
                  { value: 'smart', label: 'Smart Auto-Router' },
                ]}
              />
            }
          />

          {routerMode === 'smart' && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="text-xs font-semibold text-text">Model Slot Configuration</div>

              <div className="p-3 bg-surface2/60 rounded-xl space-y-1.5 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text">Fast Slot</span>
                  <Pill tone="neutral">&lt; 120 chars, quick Q&amp;A</Pill>
                </div>
                <SelectField
                  value={modelSlots.fast.model}
                  onChange={async (val) => {
                    const updated = { ...modelSlots, fast: { ...modelSlots.fast, model: val } };
                    setModelSlotsState(updated);
                    await saveModelSlots(updated);
                  }}
                  options={[
                    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
                    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
                    { value: 'llama-3.3-70b-versatile', label: 'Groq Llama 3.3 70B' },
                  ]}
                />
              </div>

              <div className="p-3 bg-surface2/60 rounded-xl space-y-1.5 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text">Balanced Slot</span>
                  <Pill tone="neutral">Default chat &amp; general tasks</Pill>
                </div>
                <SelectField
                  value={modelSlots.balanced.model}
                  onChange={async (val) => {
                    const updated = { ...modelSlots, balanced: { ...modelSlots.balanced, model: val } };
                    setModelSlotsState(updated);
                    await saveModelSlots(updated);
                  }}
                  options={[
                    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                    { value: 'gpt-4o', label: 'GPT-4o' },
                    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
                    { value: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill' },
                  ]}
                />
              </div>

              <div className="p-3 bg-surface2/60 rounded-xl space-y-1.5 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text">Best Slot</span>
                  <Pill tone="accent">Workspace, code &gt; 40 lines, audits</Pill>
                </div>
                <SelectField
                  value={modelSlots.best.model}
                  onChange={async (val) => {
                    const updated = { ...modelSlots, best: { ...modelSlots.best, model: val } };
                    setModelSlotsState(updated);
                    await saveModelSlots(updated);
                  }}
                  options={[
                    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
                    { value: 'gpt-4o', label: 'GPT-4o' },
                    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
                  ]}
                />
              </div>
            </div>
          )}
        </Card>
      </Section>
    </SettingsPage>
  );

  const renderVoiceContent = () => (
    <SettingsPage
      title="Voice"
      description="Speech recognition, speech synthesis, and voice assistant preferences."
    >
      <Section title="Voice Settings" description="Tune spoken interaction for conversational speed and language.">
        <Card>
          <Row
            icon={<Globe className="w-4 h-4 text-accent" />}
            title="Speech Language"
            description="Recognition language for speech-to-text and accent profile for speech synthesis."
            stacked
            control={
              <SelectField
                value={voiceLang}
                onChange={async (val) => {
                  setVoiceLang(val);
                  await db.meta.put({ key: 'voiceLang', value: val });
                }}
                options={[
                  { value: 'auto', label: 'Auto-detect (Default)' },
                  { value: 'en-US', label: 'English (US)' },
                  { value: 'bn-BD', label: 'Bengali (বাংলা)' },
                  { value: 'hi-IN', label: 'Hindi (हिन्दी)' },
                ]}
                className="w-48"
              />
            }
          />

          <Row
            icon={<Volume2 className="w-4 h-4 text-accent" />}
            title="Auto-read replies"
            description="Read new model replies out loud as soon as generation completes."
            control={
              <Switch
                checked={voiceAutoRead}
                onChange={async (val) => {
                  setVoiceAutoRead(val);
                  await db.meta.put({ key: 'voiceAutoRead', value: val });
                }}
                ariaLabel="Toggle auto-read replies"
              />
            }
          />

          <Row
            icon={<Sliders className="w-4 h-4 text-accent" />}
            title="Auto-send voice input"
            description="Automatically dispatch transcribed message when a brief pause is detected."
            control={
              <Switch
                checked={voiceAutoSend}
                onChange={async (val) => {
                  setVoiceAutoSend(val);
                  await db.meta.put({ key: 'voiceAutoSend', value: val });
                }}
                ariaLabel="Toggle auto-send voice messages"
              />
            }
          />
        </Card>
      </Section>

      <Section title="Voice Verification" description="Test speech synthesis hardware on this device.">
        <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-xs sm:text-sm font-medium text-text">Audio Synthesizer Test</div>
            <div className="text-xs text-muted">Plays a localized greetings sample in your selected language.</div>
          </div>
          <Button
            variant="secondary"
            icon={<Play className="w-3.5 h-3.5 fill-current text-accent" />}
            loading={isTestingVoice}
            onClick={async () => {
              setIsTestingVoice(true);
              try {
                const sampleText =
                  voiceLang === 'bn-BD'
                    ? 'নমস্কার! চ্যাটলি ভয়েস সফলভাবে কাজ করছে।'
                    : voiceLang === 'hi-IN'
                    ? 'नमस्ते! चैटली वॉइस सफलतापूर्वक काम कर रहा है।'
                    : 'Hello! Chatly voice output is functioning smoothly.';
                const lang = voiceLang === 'auto' ? 'en-US' : voiceLang;
                await speak(sampleText, lang);
              } catch (e) {
                console.error(e);
              } finally {
                setIsTestingVoice(false);
              }
            }}
          >
            {isTestingVoice ? 'Speaking...' : 'Test Speech'}
          </Button>
        </Card>
      </Section>
    </SettingsPage>
  );

  const renderSearchContent = () => (
    <SettingsPage
      title="Web Search"
      description="Connect Tavily to enable real-time internet search and citations across all models."
    >
      <Callout
        tone="accent"
        icon={<Globe className="w-4 h-4 text-accent" />}
        title="Universal Web Grounding"
      >
        <p>
          Searches the live web before answering, without needing native tool calling. Works seamlessly with
          Gemini, Groq, OpenAI, Anthropic, and local models.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <Pill tone="success">1,000 Free Searches / Mo</Pill>
          <a
            href="https://tavily.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline text-xs font-medium inline-flex items-center gap-1"
          >
            <span>Get free API key</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </Callout>

      {/* Configured Status */}
      {hasSavedSearchKey && (
        <Section title="Active Configuration">
          <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text flex items-center gap-2">
                  <span>Tavily Connected</span>
                  <Pill tone="success">Ready</Pill>
                </div>
                <div className="text-xs text-muted font-mono mt-0.5">
                  Key: ••••••••{savedSearchKeyLast4 || '••••'} (AES-GCM Encrypted)
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <Button
                variant="secondary"
                size="sm"
                icon={<Search className="w-3.5 h-3.5 text-accent" />}
                loading={isTestingSearch}
                onClick={handleTestSearch}
              >
                Test Search
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={handleRemoveSearchKey}
              >
                Remove
              </Button>
            </div>
          </Card>
        </Section>
      )}

      {/* Input or Replace Form */}
      <Section
        title={hasSavedSearchKey ? 'Replace Tavily Key' : 'Configure Tavily Key'}
        description="Paste your secret Tavily API key below."
      >
        <Card className="p-4 sm:p-5 space-y-4">
          <form onSubmit={handleSaveSearchKey} className="space-y-4">
            <TextField
              label="Tavily API Key"
              required
              type={showSearchKey ? 'text' : 'password'}
              value={searchKeyInput}
              onChange={(val) => {
                setSearchKeyInput(val);
                setSearchStatus(null);
              }}
              placeholder={hasSavedSearchKey ? 'Paste new Tavily key (tvly-...)' : 'Paste your key (tvly-...)'}
              fontMono
              autoComplete="off"
              trailing={
                <button
                  type="button"
                  onClick={() => setShowSearchKey(!showSearchKey)}
                  aria-label={showSearchKey ? 'Hide key' : 'Show key'}
                  className="p-1 text-muted hover:text-text rounded-md focus-visible:outline-none"
                >
                  {showSearchKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            {searchStatus && (
              <Callout
                tone={
                  searchStatus.type === 'success'
                    ? 'success'
                    : searchStatus.type === 'error'
                    ? 'danger'
                    : 'neutral'
                }
                icon={
                  searchStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                  )
                }
              >
                {searchStatus.message}
              </Callout>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              {!hasSavedSearchKey && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={isTestingSearch}
                  disabled={!searchKeyInput.trim()}
                  onClick={handleTestSearch}
                >
                  Test
                </Button>
              )}
              <Button
                type="submit"
                variant="primary"
                loading={isSavingSearch}
                disabled={!searchKeyInput.trim()}
              >
                Save Search Key
              </Button>
            </div>
          </form>
        </Card>
      </Section>
    </SettingsPage>
  );

  const renderMemoryContent = () => (
    <SettingsPage
      title="Memory"
      description="Long-term user knowledge, synthesized profile, and durable context."
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportMemories}
          >
            Export
          </Button>
          <label className="cursor-pointer">
            <span className="inline-flex items-center justify-center font-medium transition-all h-8 px-3 text-xs rounded-lg gap-1.5 bg-surface2 hover:bg-border text-text border border-border shadow-2xs">
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
            </span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportMemories}
              className="hidden"
            />
          </label>
        </div>
      }
    >
      {/* Master Toggle */}
      <Section title="Memory Storage" description="Memories are kept exclusively on this device and sent along with messages.">
        <Card>
          <Row
            icon={<Sparkles className="w-4 h-4 text-accent" />}
            title="Enable Long-term Memory"
            description="Allow the assistant to recall past preferences, work context, and details across separate chats."
            control={
              <Switch
                checked={memoryEnabled}
                onChange={handleToggleMemoryEnabled}
                ariaLabel="Toggle memory enabled"
              />
            }
          />
        </Card>
      </Section>

      {/* Profile Summary Card */}
      <Section
        title="Profile Summary"
        description="Synthesized snapshot of your role, stack, and preferences deduced by the AI."
      >
        <Card className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-text uppercase tracking-wider">
              AI User Profile
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw className={`w-3.5 h-3.5 ${isRebuildingProfile ? 'animate-spin text-accent' : ''}`} />}
                disabled={isRebuildingProfile}
                onClick={handleRebuildProfile}
              >
                Rebuild
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil className="w-3.5 h-3.5" />}
                onClick={() => setIsEditingProfile(!isEditingProfile)}
              >
                {isEditingProfile ? 'Cancel' : 'Edit'}
              </Button>
            </div>
          </div>

          {isEditingProfile ? (
            <div className="space-y-3">
              <TextArea
                value={editedProfileText}
                onChange={setEditedProfileText}
                rows={4}
                placeholder="Write your background, interests, role, or preferred coding stack..."
              />
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={handleSaveProfile}>
                  Save Profile
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-text/85 leading-relaxed whitespace-pre-line bg-surface2/30 p-3 rounded-xl border border-border/50">
              {profileText || 'No profile generated yet. Click Rebuild or chat with memory enabled to generate one.'}
            </p>
          )}

          {profileUpdatedAt && (
            <div className="text-[11px] text-muted font-mono">
              Last updated: {new Date(profileUpdatedAt).toLocaleString()}
            </div>
          )}
        </Card>
      </Section>

      {/* Add Memory Manually */}
      <Section title="Add Memory" description="Explicitly store a fact without waiting for auto-extraction.">
        <Card className="p-4 sm:p-5">
          <form onSubmit={handleAddMemory} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <TextField
                  value={newMemoryText}
                  onChange={setNewMemoryText}
                  placeholder="e.g. I work primarily with Next.js and Tailwind CSS"
                />
              </div>
              <SelectField
                value={newMemoryCategory}
                onChange={(val) => setNewMemoryCategory(val as any)}
                options={[
                  { value: 'identity', label: 'Identity' },
                  { value: 'preference', label: 'Preference' },
                  { value: 'project', label: 'Project' },
                  { value: 'skill', label: 'Skill' },
                  { value: 'other', label: 'Other' },
                ]}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={!newMemoryText.trim()}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Memory
              </Button>
            </div>
          </form>
        </Card>
      </Section>

      {/* Memories Explorer */}
      <Section
        title={`Stored Memories (${memories.length}/300)`}
        description="Browse, pin, or delete individual memories."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <TextField
                value={memorySearch}
                onChange={setMemorySearch}
                placeholder="Search memories..."
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDuplicates(!showDuplicates)}
            >
              {showDuplicates ? 'Hide Duplicates' : 'Find Duplicates'}
            </Button>
          </div>

          {/* Grouped Accordions */}
          {(['identity', 'preference', 'project', 'skill', 'other'] as const).map((cat) => {
            const catMemories = memories.filter(
              (m) =>
                m.category === cat &&
                m.text.toLowerCase().includes(memorySearch.toLowerCase())
            );
            if (catMemories.length === 0) return null;
            const isExpanded = expandedCategories[cat];

            return (
              <div key={cat} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
                  }
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted hover:text-text px-1 py-1 cursor-pointer select-none"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>{cat}</span>
                  <span className="font-mono text-[11px]">({catMemories.length})</span>
                </button>

                {isExpanded && (
                  <Card>
                    {catMemories.map((m) => {
                      const isEditing = editingId === m.id;
                      return (
                        <div
                          key={m.id}
                          className="p-3.5 flex items-center justify-between gap-3 text-xs"
                        >
                          {isEditing ? (
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                type="text"
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="flex-1 bg-surface border border-accent rounded-lg px-2.5 py-1 text-text text-xs"
                              />
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleSaveEdit(m.id)}
                              >
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="text-text break-words leading-relaxed">{m.text}</p>
                                <span className="text-[10px] text-muted">
                                  {m.pinned && 'Pinned • '}
                                  {new Date(m.updatedAt).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePin(m)}
                                  title={m.pinned ? 'Unpin' : 'Pin to top'}
                                  className={`p-1.5 rounded-lg hover:bg-surface2 transition-colors ${
                                    m.pinned ? 'text-accent' : 'text-muted'
                                  }`}
                                >
                                  <Pin className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId(m.id);
                                    setEditingText(m.text);
                                  }}
                                  title="Edit memory"
                                  className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface2 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMemory(m.id)}
                                  title="Delete memory"
                                  className="p-1.5 rounded-lg text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </Card>
                )}
              </div>
            );
          })}

          {memories.length === 0 && (
            <EmptyHint
              icon={<Brain className="w-5 h-5" />}
              title="No memories recorded yet"
              description="As you chat, facts you share will be saved here automatically."
            />
          )}
        </div>
      </Section>

      {/* Danger Zone: Clear all memories */}
      {memories.length > 0 && (
        <DangerZone title="Clear all memories">
          <p className="text-xs text-muted leading-relaxed">
            Permanently delete all stored user memories and reset your profile summary.
          </p>
          {confirmClearMemories ? (
            <div className="flex items-center gap-2 pt-1">
              <Button variant="danger" size="sm" onClick={handleClearAllMemories}>
                Confirm Delete All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClearMemories(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmClearMemories(true)}
            >
              Clear All Memories ({memories.length})
            </Button>
          )}
        </DangerZone>
      )}
    </SettingsPage>
  );

  const renderUsageContent = () => (
    <SettingsPage
      title="Usage & Spend"
      description="Token metrics, failover events, Model Council runs, and daily budgets."
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Failover Events" value={String(failoverCount)} hint="Auto 429 retries" />
        <Stat label="Council Runs" value={String(councilRunCount)} hint="Parallel multi-model" />
        <Stat label="Configured Keys" value={String(keys.length)} hint="Active BYOK pool" />
        <Stat label="Storage Cost" value="$0.00" hint="Free local DB" />
      </div>

      <Section title="Per-Key Daily Spend & Budgets" description="Track daily estimated API spend and set optional spend guardrails.">
        <Card className="divide-y divide-border">
          {keys.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted">
              No API keys configured.
            </div>
          ) : (
            keys.map((k) => {
              const spend = keySpends[k.id] || 0;
              const budget = keyBudgets[k.id] || 0;

              return (
                <div key={k.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs sm:text-sm text-text truncate">{k.label}</span>
                      <Pill tone="neutral" className="uppercase text-[10px]">{k.provider}</Pill>
                    </div>
                    <div className="text-xs text-muted mt-1">
                      Today's Spend: <span className="font-mono font-medium text-text">${spend.toFixed(4)}</span>
                      {budget > 0 && (
                        <span> / <span className="font-mono">${budget.toFixed(2)}</span> limit</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <TextField
                      placeholder="Daily $ Limit (e.g. 2.00)"
                      value={budget ? String(budget) : ''}
                      onChange={async (val) => {
                        const num = parseFloat(val);
                        await setKeyDailyBudget(k.id, isNaN(num) ? null : num);
                        loadFailoverAndRouter();
                      }}
                      className="w-32"
                      fontMono
                    />
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </Section>

      <Section title="Cost & Quota Transparency" description="How billing works in Chatly.">
        <Card className="p-4 sm:p-5 space-y-3">
          <p className="text-xs sm:text-sm text-muted leading-relaxed">
            Chatly is 100% serverless and direct-to-provider. You pay only your AI providers (Google AI Studio,
            OpenAI, Anthropic, Groq) under their standard developer pricing. Google AI Studio and Groq provide
            generous free tiers for personal prototyping.
          </p>
          <div className="pt-2 flex flex-wrap gap-2">
            <Pill tone="success">Zero Markup</Pill>
            <Pill tone="neutral">Device Encrypted</Pill>
            <Pill tone="accent">BYOK</Pill>
          </div>
        </Card>
      </Section>
    </SettingsPage>
  );

  const renderDataContent = () => {
    const usagePct = storageQuota > 0 ? Math.min(100, Math.round((storageUsage / storageQuota) * 100)) : 0;

    return (
      <SettingsPage
        title="Data & Storage"
        description="Local IndexedDB persistence, generated documents, and system backups."
      >
        {/* Storage Health */}
        <Section title="Storage Health" description="Browser quota and eviction protection.">
          <Card className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    persisted ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <div className="text-sm font-semibold text-text">
                  Storage Status: {persisted ? 'Protected' : 'Standard'}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<RotateCw className={`w-3 h-3 ${isCheckingStorage ? 'animate-spin' : ''}`} />}
                loading={isCheckingStorage}
                onClick={refreshStorage}
              >
                Re-check
              </Button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              {persisted
                ? 'Your device has granted persistent storage. Local database entries are protected from automatic browser cleanups.'
                : 'Storage is not persistent. Your browser may delete chat history if disk space runs low. Export backups regularly.'}
            </p>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-mono text-muted">
                <span>{formatBytes(storageUsage)} used</span>
                <span>{formatBytes(storageQuota)} total</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface2 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.max(2, usagePct)}%` }}
                />
              </div>
            </div>
          </Card>
        </Section>

        {/* Generated Files */}
        <Section
          title={`Generated Files (${generatedDocs.length})`}
          description="Documents and spreadsheets authored by the model during conversations."
        >
          {generatedDocs.length === 0 ? (
            <EmptyHint
              icon={<FolderOpen className="w-5 h-5" />}
              title="No generated files"
              description="When the AI creates Word documents, spreadsheets, or slides, they will be archived here."
            />
          ) : (
            <Card>
              <div className="p-3 flex justify-between items-center border-b border-border bg-surface2/30">
                <span className="text-xs font-medium text-muted">Saved in IndexedDB</span>
                <button
                  type="button"
                  onClick={handleClearAllDocs}
                  className="text-xs text-rose-500 hover:underline cursor-pointer"
                >
                  Clear all documents
                </button>
              </div>
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {generatedDocs.map((doc) => {
                  const fmt = (doc.format || 'file').toUpperCase();
                  return (
                    <div
                      key={doc.id}
                      className="p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Pill tone="accent" className="font-mono text-[10px]">
                          {fmt}
                        </Pill>
                        <div className="min-w-0">
                          <p className="font-medium text-text truncate max-w-xs">{doc.name}</p>
                          <p className="text-[11px] text-muted">
                            {formatBytes(doc.size)} • {new Date(doc.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Download className="w-3.5 h-3.5" />}
                          onClick={() => handleDownloadDoc(doc)}
                          aria-label="Download document"
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                          onClick={() => handleDeleteDoc(doc.id)}
                          aria-label="Delete document"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </Section>

        {/* Backup & Restore */}
        <Section title="Backup & Restore" description="Export complete database or restore previous sessions.">
          <Card className="p-4 sm:p-5 space-y-4">
            <label className="flex items-center gap-2.5 text-xs text-text cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent w-4 h-4"
              />
              <span>Include document attachments in backup file</span>
            </label>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="secondary"
                icon={<Download className="w-4 h-4" />}
                onClick={() => exportAll(includeAttachments)}
                className="flex-1"
              >
                Export JSON Backup
              </Button>

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
                  } catch (err: any) {
                    alert(`Import failed: ${err.message}`);
                  }
                }}
              />
              <Button
                variant="secondary"
                icon={<Upload className="w-4 h-4" />}
                onClick={() => importRef.current?.click()}
                className="flex-1"
              >
                Import JSON Backup
              </Button>
            </div>
          </Card>
        </Section>

        {/* PWA Install */}
        {isInstallable && (
          <Section title="Progressive Web App" description="Install Chatly to your home screen or desktop application launcher.">
            <Card className="p-4 sm:p-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-text">Install Chatly App</div>
                <div className="text-xs text-muted">Offline-capable standalone window experience.</div>
              </div>
              <Button
                variant="primary"
                onClick={async () => {
                  deferredPrompt?.prompt();
                  const { outcome } = await deferredPrompt.userChoice;
                  if (outcome === 'accepted') setIsInstallable(false);
                }}
              >
                Install App
              </Button>
            </Card>
          </Section>
        )}

        {/* Danger Zone */}
        <DangerZone title="Delete all application data">
          <p className="text-xs text-muted leading-relaxed">
            This permanently deletes all chats, memories, documents, and API keys stored in IndexedDB.
            This action cannot be undone.
          </p>
          <div className="space-y-3 pt-1">
            <TextField
              value={deleteConfirm}
              onChange={setDeleteConfirm}
              placeholder="Type DELETE to confirm"
            />
            <Button
              variant="danger"
              disabled={deleteConfirm !== 'DELETE'}
              onClick={async () => {
                await db.delete();
                window.location.reload();
              }}
            >
              Delete All Data
            </Button>
          </div>
        </DangerZone>
      </SettingsPage>
    );
  };

  const renderAdvancedContent = () => (
    <SettingsPage
      title="Advanced"
      description="Network proxy configuration and connection settings."
    >
      <Section title="Connection Mode" description="Choose transport network path for AI model API requests.">
        <Card className="p-4 sm:p-5 space-y-4">
          <Row
            icon={<Globe className="w-4 h-4 text-accent" />}
            title="Connection Mode"
            description="Auto uses direct browser fetch when possible, with server proxy fallback on CORS or network error."
            stacked
            control={
              <Segmented
                value={connectionMode}
                onChange={async (val) => {
                  setConnectionModeState(val as any);
                  await db.meta.put({ key: 'connectionMode', value: val });
                }}
                options={[
                  { value: 'auto', label: 'Auto (Direct + Server Fallback)' },
                  { value: 'direct', label: 'Direct (Device)' },
                  { value: 'via-server', label: 'Via Server Proxy' },
                ]}
              />
            }
          />
        </Card>
      </Section>

      <Section
        title="Fallback Proxy URL"
        description="Optional reverse-proxy URL used if direct browser-to-provider requests are blocked by CORS."
      >
        <Card className="p-4 sm:p-5 space-y-4">
          <TextField
            label="Proxy Hostname"
            value={proxyUrlInput}
            onChange={setProxyUrlInput}
            placeholder="https://your-chatly-app.vercel.app"
            fontMono
            helper={
              proxySaved
                ? 'Proxy configuration saved successfully.'
                : 'Leave blank to make direct device-to-provider calls (recommended).'
            }
          />
          <div className="flex justify-end pt-2 border-t border-border">
            <Button variant="primary" onClick={handleSaveProxyUrl}>
              Save Proxy URL
            </Button>
          </div>
        </Card>
      </Section>
    </SettingsPage>
  );

  const renderActiveTabContent = () => {
    switch (settingsTab) {
      case 'tools':
        return renderToolsContent();
      case 'models':
        return renderModelsContent();
      case 'keys':
        return renderKeysContent();
      case 'voice':
        return renderVoiceContent();
      case 'search':
        return renderSearchContent();
      case 'memory':
        return renderMemoryContent();
      case 'usage':
        return renderUsageContent();
      case 'data':
        return renderDataContent();
      case 'advanced':
        return renderAdvancedContent();
      case 'security':
        return <SecuritySettings />;
      default:
        return renderToolsContent();
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                            RENDER MODAL SHELL                              */
  /* -------------------------------------------------------------------------- */

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6"
    >
      {/* Backdrop */}
      <div
        onClick={() => setSettingsOpen(false)}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
        aria-hidden="true"
      />

      {/* ==================================================================== */}
      {/*                       DESKTOP / TABLET (>= 768px)                    */}
      {/* ==================================================================== */}
      <div className="hidden md:flex relative w-full max-w-[940px] h-[720px] max-h-[88vh] bg-surface border border-border rounded-2xl shadow-2xl z-10 overflow-hidden divide-x divide-border">
        {/* Left Navigation Sidebar */}
        <div className="w-64 bg-surface2/30 flex flex-col shrink-0">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-surface flex items-center justify-center border border-border shadow-2xs">
                <Sliders className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-text tracking-tight">Settings</h2>
                <p className="text-[11px] text-muted">Preferences & tools</p>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
                placeholder="Search settings..."
                className="w-full bg-surface border border-border/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 transition-all"
              />
              {navSearch && (
                <button
                  type="button"
                  onClick={() => setNavSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Grouped Navigation Links */}
          <div className="p-3 overflow-y-auto space-y-4 flex-1">
            {groups.map((grp) => {
              const items = filteredNavItems.filter((i) => i.group === grp.id);
              if (items.length === 0) return null;

              return (
                <div key={grp.id} className="space-y-1">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
                    {grp.label}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const isActive = settingsTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSettingsTab(item.id)}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2.5 transition-all text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                            isActive
                              ? 'bg-surface text-text shadow-xs border border-border/60'
                              : 'text-muted hover:text-text hover:bg-surface2/60 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={isActive ? 'text-accent' : 'text-muted'}>
                              {item.icon}
                            </span>
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge && <div className="shrink-0">{item.badge}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {filteredNavItems.length === 0 && (
              <div className="p-4 text-center text-xs text-muted">
                No settings found matching &ldquo;{navSearch}&rdquo;
              </div>
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-border/60 text-[11px] text-muted flex items-center justify-between">
            <span>Chatly Client v2.4</span>
            <span className="text-[10px] bg-surface px-1.5 py-0.5 rounded border border-border">ESC</span>
          </div>
        </div>

        {/* Right Content Pane */}
        <div className="flex-1 flex flex-col min-w-0 bg-surface">
          {/* Top Close Bar */}
          <div className="h-14 px-6 border-b border-border/40 flex items-center justify-between shrink-0">
            <div className="text-xs text-muted">
              Settings &rsaquo;{' '}
              <span className="text-text font-medium">
                {navItems.find((i) => i.id === settingsTab)?.label}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Page Body */}
          <div className="p-6 sm:p-8 overflow-y-auto flex-1">
            <div className="max-w-2xl mx-auto">{renderActiveTabContent()}</div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/*                       MOBILE VIEW (< 768px)                          */}
      {/* ==================================================================== */}
      <div className="md:hidden fixed inset-0 h-dvh bg-surface z-50 flex flex-col overflow-hidden animate-slideUp">
        {mobileSection === null ? (
          // Level 1: Mobile Home List
          <div className="flex flex-col h-full">
            {/* Sticky Mobile Header */}
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0 bg-surface">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-surface2 flex items-center justify-center text-accent">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-text tracking-tight">Settings</h2>
                  <p className="text-xs text-muted">Preferences & tools</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-3 border-b border-border/60 bg-surface2/20">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={navSearch}
                  onChange={(e) => setNavSearch(e.target.value)}
                  placeholder="Search settings..."
                  className="w-full bg-surface border border-border rounded-xl pl-8 pr-3 py-2 text-xs text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                />
              </div>
            </div>

            {/* Grouped Category Cards */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {groups.map((grp) => {
                const items = filteredNavItems.filter((i) => i.group === grp.id);
                if (items.length === 0) return null;

                return (
                  <div key={grp.id} className="space-y-1.5">
                    <div className="px-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
                      {grp.label}
                    </div>
                    <Card>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSettingsTab(item.id);
                            setMobileSection(item.id);
                          }}
                          className="min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 hover:bg-surface2/50 cursor-pointer select-none transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-surface2 flex items-center justify-center shrink-0">
                              {item.icon}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-text">{item.label}</div>
                              <div className="text-xs text-muted truncate">{item.description}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.badge}
                            <ChevronRight className="w-4 h-4 text-muted" />
                          </div>
                        </div>
                      ))}
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Level 2: Mobile Section Drill-in
          <div className="flex flex-col h-full bg-surface">
            {/* Sticky Drill-in Header */}
            <div className="p-3.5 border-b border-border flex items-center justify-between shrink-0 bg-surface">
              <button
                type="button"
                onClick={() => setMobileSection(null)}
                className="flex items-center gap-1 text-xs font-medium text-accent hover:underline py-1 pr-2"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Settings</span>
              </button>

              <h3 className="text-sm font-semibold text-text truncate px-2">
                {navItems.find((i) => i.id === mobileSection)?.label}
              </h3>

              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted hover:text-text hover:bg-surface2 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drill-in Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {renderActiveTabContent()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
