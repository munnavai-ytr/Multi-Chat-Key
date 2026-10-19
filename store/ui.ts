import { create } from 'zustand';
import { db } from '@/lib/db';

export type SettingsTabId = 'keys' | 'search' | 'memory' | 'usage' | 'data' | 'tools' | 'advanced';

interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface DiffApproval {
  path: string;
  before: string | null;
  after: string | null;
  resolve: (ok: boolean) => void;
}

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  settingsTab: SettingsTabId;
  setSettingsTab: (tab: SettingsTabId) => void;
  modelPickerOpen: boolean;
  setModelPickerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeView: 'chat' | 'project';
  setActiveView: (view: 'chat' | 'project') => void;
  artifact: { lang: string; code: string; title?: string } | null;
  setArtifact: (artifact: { lang: string; code: string; title?: string } | null) => void;
  workspacePanelOpen: boolean;
  setWorkspacePanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
  toastMessage: string | null;
  toastAction: ToastAction | null;
  showToast: (msg: string, duration?: number, action?: ToastAction) => void;
  codeConfirmModal: { lang: string; code: string; resolve: (ok: boolean) => void } | null;
  setCodeConfirmModal: (modal: { lang: string; code: string; resolve: (ok: boolean) => void } | null) => void;
  approval: DiffApproval | null;
  autoApplyTask: boolean;
  setAutoApplyTask: (auto: boolean) => void;
  requestApproval: (change: { path: string; before: string | null; after: string | null }) => Promise<boolean>;
  resolveApproval: (ok: boolean, autoApplyRest?: boolean) => void;
}

let toastTimer: any = null;

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) =>
    set((state) => ({
      sidebarOpen: typeof open === 'function' ? open(state.sidebarOpen) : open,
    })),
  settingsOpen: false,
  setSettingsOpen: (open) =>
    set((state) => ({
      settingsOpen: typeof open === 'function' ? open(state.settingsOpen) : open,
    })),
  settingsTab: 'keys',
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  modelPickerOpen: false,
  setModelPickerOpen: (open) =>
    set((state) => ({
      modelPickerOpen: typeof open === 'function' ? open(state.modelPickerOpen) : open,
    })),
  activeView: 'chat',
  setActiveView: (view) => set({ activeView: view }),
  artifact: null,
  setArtifact: (artifact) => set({ artifact }),
  workspacePanelOpen: false,
  setWorkspacePanelOpen: (open) =>
    set((state) => ({
      workspacePanelOpen: typeof open === 'function' ? open(state.workspacePanelOpen) : open,
    })),
  activeWorkspaceId: null,
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
  toastMessage: null,
  toastAction: null,
  showToast: (msg, duration = 2000, action) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toastMessage: msg, toastAction: action ?? null });
    toastTimer = setTimeout(() => {
      set((state) =>
        state.toastMessage === msg ? { toastMessage: null, toastAction: null } : state
      );
    }, duration);
  },
  codeConfirmModal: null,
  setCodeConfirmModal: (modal) => set({ codeConfirmModal: modal }),
  approval: null,
  autoApplyTask: false,
  setAutoApplyTask: (auto) => set({ autoApplyTask: auto }),
  requestApproval: async (change) => {
    const wsApproval = (await db.meta.get('wsApproval'))?.value;
    if (wsApproval === 'auto' || get().autoApplyTask) {
      return true;
    }
    return new Promise<boolean>((resolve) => {
      set({ approval: { ...change, resolve } });
    });
  },
  resolveApproval: (ok: boolean, autoApplyRest = false) => {
    const current = get().approval;
    if (autoApplyRest) {
      set({ autoApplyTask: true });
    }
    if (current) {
      current.resolve(ok);
      set({ approval: null });
    }
  },
}));
