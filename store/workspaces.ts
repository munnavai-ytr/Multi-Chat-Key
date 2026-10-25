import { create } from 'zustand';
import { db, WorkspaceRow } from '@/lib/db';
import {
  importZip,
  exportZip,
  createEmptyWorkspace,
  renameWorkspace,
  deleteWorkspace,
  addFilesToWorkspace,
} from '@/lib/workspace';
import { useChatStore } from '@/store/chat';

interface WorkspacesState {
  workspaces: WorkspaceRow[];
  activeWorkspaceId: string | null;
  filePaths: string[];
  isWorkspacesOpen: boolean;
  toggleWorkspacesOpen: () => void;
  loadWorkspaces: () => Promise<void>;
  selectWorkspace: (id: string | null) => Promise<void>;
  loadFilePaths: (id: string) => Promise<void>;
  createEmpty: (name?: string) => Promise<string>;
  importZipFile: (file: File, name?: string) => Promise<string>;
  exportZipFile: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addFiles: (id: string, files: FileList | File[]) => Promise<number>;
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  filePaths: [],
  isWorkspacesOpen: true,

  toggleWorkspacesOpen: () => {
    set((s) => ({ isWorkspacesOpen: !s.isWorkspacesOpen }));
  },

  loadWorkspaces: async () => {
    try {
      const allWorkspaces = await db.workspaces.orderBy('updatedAt').reverse().toArray();
      set({ workspaces: allWorkspaces });
    } catch {
      // ignore
    }
  },

  selectWorkspace: async (id: string | null) => {
    set({ activeWorkspaceId: id });
    if (id) {
      await get().loadFilePaths(id);
    } else {
      set({ filePaths: [] });
    }
  },

  loadFilePaths: async (id: string) => {
    try {
      const files = await db.wsfiles.where('wsId').equals(id).toArray();
      const paths = files.map((f) => f.path).sort();
      set({ filePaths: paths });
    } catch {
      set({ filePaths: [] });
    }
  },

  createEmpty: async (name?: string) => {
    const id = await createEmptyWorkspace(name);
    await get().loadWorkspaces();
    await get().selectWorkspace(id);
    return id;
  },

  importZipFile: async (file: File, name?: string) => {
    const id = await importZip(file, name);
    await get().loadWorkspaces();
    await get().selectWorkspace(id);
    return id;
  },

  exportZipFile: async (id: string) => {
    await exportZip(id);
  },

  rename: async (id: string, name: string) => {
    await renameWorkspace(id, name);
    await get().loadWorkspaces();
  },

  remove: async (id: string) => {
    await deleteWorkspace(id);
    useChatStore.setState((state) => ({
      chats: state.chats.map((c) =>
        c.workspaceId === id ? { ...c, workspaceId: undefined } : c
      ),
    }));
    const remaining = get().workspaces.filter((w) => w.id !== id);
    set({
      workspaces: remaining,
      activeWorkspaceId: get().activeWorkspaceId === id ? null : get().activeWorkspaceId,
      filePaths: get().activeWorkspaceId === id ? [] : get().filePaths,
    });
  },

  addFiles: async (id: string, files: FileList | File[]) => {
    const count = await addFilesToWorkspace(id, files);
    await get().loadFilePaths(id);
    await get().loadWorkspaces();
    return count;
  },
}));
