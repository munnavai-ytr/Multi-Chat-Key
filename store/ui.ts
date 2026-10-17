import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  settingsTab: 'keys' | 'search' | 'memory' | 'usage' | 'data' | 'tools';
  setSettingsTab: (tab: 'keys' | 'search' | 'memory' | 'usage' | 'data' | 'tools') => void;
  modelPickerOpen: boolean;
  setModelPickerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeView: 'chat' | 'project';
  setActiveView: (view: 'chat' | 'project') => void;
  artifact: { lang: string; code: string; title?: string } | null;
  setArtifact: (artifact: { lang: string; code: string; title?: string } | null) => void;
  toastMessage: string | null;
  showToast: (msg: string, duration?: number) => void;
  codeConfirmModal: { lang: string; code: string; resolve: (ok: boolean) => void } | null;
  setCodeConfirmModal: (modal: { lang: string; code: string; resolve: (ok: boolean) => void } | null) => void;
}

let toastTimer: any = null;

export const useUIStore = create<UIState>((set) => ({
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
  toastMessage: null,
  showToast: (msg, duration = 2000) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toastMessage: msg });
    toastTimer = setTimeout(() => {
      set((state) => (state.toastMessage === msg ? { toastMessage: null } : state));
    }, duration);
  },
  codeConfirmModal: null,
  setCodeConfirmModal: (modal) => set({ codeConfirmModal: modal }),
}));
