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
}

export interface MsgRow {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  error?: string;
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

class AppDB extends Dexie {
  keys!: Table<KeyRow, string>;
  chats!: Table<ChatRow, string>;
  messages!: Table<MsgRow, string>;
  meta!: Table<{ key: string; value: any }, string>;
  files!: Table<FileRow, string>;

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
  }
}

export const db = new AppDB();

