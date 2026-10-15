import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  modelPickerOpen: boolean;
  setModelPickerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeView: 'chat' | 'project';
  setActiveView: (view: 'chat' | 'project') => void;
  toastMessage: string | null;
  showToast: (msg: string, duration?: number) => void;
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
  modelPickerOpen: false,
  setModelPickerOpen: (open) =>
    set((state) => ({
      modelPickerOpen: typeof open === 'function' ? open(state.modelPickerOpen) : open,
    })),
  activeView: 'chat',
  setActiveView: (view) => set({ activeView: view }),
  toastMessage: null,
  showToast: (msg, duration = 2000) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toastMessage: msg });
    toastTimer = setTimeout(() => {
      set((state) => (state.toastMessage === msg ? { toastMessage: null } : state));
    }, duration);
  },
}));
