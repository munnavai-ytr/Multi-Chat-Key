import Dexie, { Table } from 'dexie';

export interface KeyRow {
  id: string;
  provider: string;
  label: string;
  baseUrl?: string;
  iv: Uint8Array;
  ct: ArrayBuffer;
  status: 'valid' | 'invalid' | 'limited' | 'unknown';
  checkedAt: number;
  last4?: string;
}

export interface ChatRow {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  keyId: string;
  model: string;
  pinned?: boolean;
  projectId?: string;
  incognito?: boolean;
  artifactsEnabled?: boolean;
  workspaceId?: string;
}

export interface MemoryRow {
  id: string;
  text: string;
  source: 'auto' | 'manual';
  createdAt: number;
  updatedAt: number;
  category?: 'identity' | 'preference' | 'project' | 'skill' | 'other';
  projectId?: string;
  lastUsedAt?: number;
  pinned?: boolean;
}

export interface MsgRow {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  error?: string;
  sources?: { title: string; url: string }[];
  searchNotice?: string;
  usage?: { in: number; out: number };
  model?: string;
  provider?: string;
  tools?: { id: string; name: string; label: string; status: 'running' | 'done' | 'error'; detail?: string }[];
  artifacts?: { id: string; title: string; type: string; code: string }[];
  plan?: { title: string; status: 'todo' | 'doing' | 'done' }[];
}

export interface FileRow {
  id: string;
  chatId: string;
  msgId: string;
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'pdf' | 'text';
  b64?: string;
  text?: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  instructions: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFileRow {
  id: string;
  projectId: string;
  name: string;
  text: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface WSFileRow {
  wsId: string;
  path: string;
  content: string;
  size: number;
  updatedAt: number;
}

export interface WSCheckpointRow {
  id: string;
  wsId: string;
  label: string;
  createdAt: number;
  changes: { path: string; before: string | null; after: string | null }[];
}

class AppDB extends Dexie {
  keys!: Table<KeyRow, string>;
  chats!: Table<ChatRow, string>;
  messages!: Table<MsgRow, string>;
  meta!: Table<{ key: string; value: any }, string>;
  files!: Table<FileRow, string>;
  projects!: Table<ProjectRow, string>;
  pfiles!: Table<ProjectFileRow, string>;
  memories!: Table<MemoryRow, string>;
  workspaces!: Table<WorkspaceRow, string>;
  wsfiles!: Table<WSFileRow, [string, string]>;
  wscheckpoints!: Table<WSCheckpointRow, string>;

  constructor() {
    super('chatly');
    this.version(1).stores({
      keys: 'id,provider',
      chats: 'id,updatedAt',
      messages: 'id,chatId,createdAt',
      meta: 'key',
    });
    this.version(2).stores({
      files: 'id,chatId,msgId',
    });
    this.version(3).stores({
      chats: 'id,updatedAt,projectId',
      projects: 'id,updatedAt',
      pfiles: 'id,projectId',
    });
    this.version(4).stores({
      memories: 'id,updatedAt',
    });
    this.version(5).stores({
      workspaces: 'id,updatedAt',
      wsfiles: '[wsId+path],wsId',
      wscheckpoints: 'id,wsId,createdAt',
    });
    this.version(6).stores({
      memories: 'id,updatedAt,projectId',
    });
  }
}

export const db = new AppDB();

