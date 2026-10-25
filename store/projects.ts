import { create } from 'zustand';
import { db, ProjectRow, ProjectFileRow } from '@/lib/db';
import { useChatStore } from '@/store/chat';

interface ProjectsState {
  projects: ProjectRow[];
  activeProjectId: string | null;
  projectFiles: ProjectFileRow[];
  isProjectsOpen: boolean;
  toggleProjectsOpen: () => void;
  loadProjects: () => Promise<void>;
  selectProject: (id: string | null) => Promise<void>;
  createProject: (name?: string, instructions?: string) => Promise<string>;
  updateProject: (id: string, updates: Partial<ProjectRow>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  loadProjectFiles: (projectId: string) => Promise<void>;
  addKnowledgeFile: (projectId: string, file: { name: string; text: string }) => Promise<void>;
  deleteKnowledgeFile: (fileId: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  projectFiles: [],
  isProjectsOpen: true,

  toggleProjectsOpen: () => {
    set((s) => ({ isProjectsOpen: !s.isProjectsOpen }));
  },

  loadProjects: async () => {
    try {
      const allProjects = await db.projects.orderBy('updatedAt').reverse().toArray();
      set({ projects: allProjects });
    } catch {
      // ignore errors
    }
  },

  selectProject: async (id: string | null) => {
    set({ activeProjectId: id });
    if (id) {
      await get().loadProjectFiles(id);
    } else {
      set({ projectFiles: [] });
    }
  },

  createProject: async (name = 'New Project', instructions = '') => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const newProj: ProjectRow = {
      id,
      name: name.trim() || 'New Project',
      instructions,
      createdAt: now,
      updatedAt: now,
    };
    await db.projects.put(newProj);
    set((s) => ({
      projects: [newProj, ...s.projects],
      activeProjectId: id,
      projectFiles: [],
    }));
    return id;
  },

  updateProject: async (id: string, updates: Partial<ProjectRow>) => {
    const now = Date.now();
    await db.projects.update(id, { ...updates, updatedAt: now });
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: now } : p)),
    }));
  },

  deleteProject: async (id: string) => {
    // 1. Remove its pfiles
    await db.pfiles.where('projectId').equals(id).delete();

    // 2. Its chats remain but become normal chats (unset projectId)
    await db.chats.where('projectId').equals(id).modify({ projectId: undefined });

    // 3. Update chats in useChatStore
    useChatStore.setState((state) => ({
      chats: state.chats.map((c) => (c.projectId === id ? { ...c, projectId: undefined } : c)),
    }));

    // 4. Delete the project itself
    await db.projects.delete(id);

    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      projectFiles: s.activeProjectId === id ? [] : s.projectFiles,
    }));
  },

  loadProjectFiles: async (projectId: string) => {
    try {
      const files = await db.pfiles.where('projectId').equals(projectId).toArray();
      set({ projectFiles: files });
    } catch {
      set({ projectFiles: [] });
    }
  },

  addKnowledgeFile: async (projectId: string, file: { name: string; text: string }) => {
    const id = crypto.randomUUID();
    const row: ProjectFileRow = {
      id,
      projectId,
      name: file.name,
      text: file.text,
    };
    await db.pfiles.put(row);
    await db.projects.update(projectId, { updatedAt: Date.now() });

    set((s) => ({
      projectFiles: [...s.projectFiles, row],
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, updatedAt: Date.now() } : p
      ),
    }));
  },

  deleteKnowledgeFile: async (fileId: string) => {
    const activeId = get().activeProjectId;
    await db.pfiles.delete(fileId);
    if (activeId) {
      await db.projects.update(activeId, { updatedAt: Date.now() });
    }
    set((s) => ({
      projectFiles: s.projectFiles.filter((f) => f.id !== fileId),
      projects: activeId
        ? s.projects.map((p) =>
            p.id === activeId ? { ...p, updatedAt: Date.now() } : p
          )
        : s.projects,
    }));
  },
}));
