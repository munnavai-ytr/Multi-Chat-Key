import { create } from 'zustand';
import { db, ChatRow, MsgRow, FileRow } from '@/lib/db';
import { useKeysStore } from '@/store/keys';
import { decryptKey } from '@/lib/crypto';
import { streamChat, Msg, Part } from '@/lib/stream';
import { ProviderId, proxyFetch } from '@/lib/providers';
import { ProcessedFile } from '@/lib/files';

interface ChatState {
  chats: ChatRow[];
  activeChatId: string | null;
  messages: MsgRow[];
  filesByMsgId: Record<string, FileRow[]>;
  streaming: boolean;
  streamingMsgId: string | null;
  abortController: AbortController | null;
  loadChats: () => Promise<void>;
  selectChat: (chatId: string) => Promise<void>;
  newChat: () => void;
  deleteChat: (chatId: string) => Promise<void>;
  sendMessage: (text: string, attachedFiles?: ProcessedFile[]) => Promise<void>;
  retryMessage: (assistantMsgId: string) => Promise<void>;
  stop: () => void;
  renameChat: (id: string, title: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  editAndResend: (userMsgId: string, newText: string) => Promise<void>;
  regenerate: () => Promise<void>;
  branchFrom: (msgId: string) => Promise<void>;
}

let activeAbortController: AbortController | null = null;
let accumulatedTextBuffer = '';
let rafPending = false;
let currentAssistantId = '';

async function maybeAutoTitle(chatId: string, userText: string, assistantText: string) {
  try {
    const chat = await db.chats.get(chatId);
    if (!chat) return;

    // Check if only 1 user message & 1 assistant reply exists
    const msgCount = await db.messages.where('chatId').equals(chatId).count();
    if (msgCount !== 2) return;

    const initialExpectedTitle =
      userText.length > 40 ? userText.slice(0, 40).trim() + '...' : userText.trim();
    if (chat.title !== initialExpectedTitle && chat.title !== userText.trim()) {
      return;
    }

    const { keys } = useKeysStore.getState();
    const keyRow =
      keys.find((k) => k.id === chat.keyId) || (await db.keys.get(chat.keyId));
    if (!keyRow) return;

    const plainApiKey = await decryptKey({ iv: keyRow.iv, ct: keyRow.ct });

    const promptText = `User: "${(userText || 'File attachments').slice(0, 300)}"\nAssistant: "${assistantText.slice(0, 300)}"\n\nGive a 3-6 word title for this chat. Reply with only the title.`;

    const provider = keyRow.provider as ProviderId;
    let path = '';
    let body: any;

    if (provider === 'gemini') {
      path = `/models/${chat.model}:generateContent`;
      body = {
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
      };
    } else if (provider === 'anthropic') {
      path = '/messages';
      body = {
        model: chat.model,
        max_tokens: 30,
        messages: [{ role: 'user', content: promptText }],
      };
    } else {
      path = '/chat/completions';
      body = {
        model: chat.model,
        messages: [{ role: 'user', content: promptText }],
      };
    }

    const res = await proxyFetch({
      provider,
      baseUrl: keyRow.baseUrl,
      apiKey: plainApiKey,
      path,
      body,
    });

    if (!res.ok) return;
    const j = await res.json();
    let generatedTitle = '';
    if (provider === 'gemini') {
      generatedTitle =
        j.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    } else if (provider === 'anthropic') {
      generatedTitle =
        j.content?.map((c: any) => c.text || '').join('') || '';
    } else {
      generatedTitle = j.choices?.[0]?.message?.content || '';
    }

    const cleanTitle = generatedTitle
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/[\r\n]+/g, ' ')
      .trim();

    if (cleanTitle && cleanTitle.length >= 2 && cleanTitle.length <= 80) {
      await db.chats.update(chatId, { title: cleanTitle });
      useChatStore.setState((state) => ({
        chats: state.chats.map((c) => (c.id === chatId ? { ...c, title: cleanTitle } : c)),
      }));
    }
  } catch {
    // If the call fails keep the old title. Never block the UI.
  }
}

async function runGeneration(chatId: string) {
  const { selectedKeyId, selectedModel, keys } = useKeysStore.getState();
  if (!selectedKeyId || !selectedModel) {
    return;
  }

  const keyRow =
    keys.find((k) => k.id === selectedKeyId) || (await db.keys.get(selectedKeyId));
  if (!keyRow) return;

  await db.chats.update(chatId, { keyId: selectedKeyId, model: selectedModel });

  const now = Date.now();

  // Create an empty assistant message row
  const assistantMsgId = crypto.randomUUID();
  const assistantMsgRow: MsgRow = {
    id: assistantMsgId,
    chatId,
    role: 'assistant',
    content: '',
    createdAt: now + 1,
  };
  await db.messages.put(assistantMsgRow);

  useChatStore.setState((state) => ({
    messages: [...state.messages, assistantMsgRow],
    streaming: true,
    streamingMsgId: assistantMsgId,
  }));

  const controller = new AbortController();
  activeAbortController = controller;
  useChatStore.setState({ abortController: controller });

  accumulatedTextBuffer = '';
  currentAssistantId = assistantMsgId;
  rafPending = false;
  let lastCheckpoint = Date.now();

  try {
    const plainApiKey = await decryptKey({ iv: keyRow.iv, ct: keyRow.ct });

    const state = useChatStore.getState();
    const history = state.messages.filter(
      (m) => m.id !== assistantMsgId && (m.role === 'user' || (m.content.trim() && !m.error))
    );

    const streamMessages: Msg[] = history.map((m) => {
      const files = state.filesByMsgId[m.id] || [];
      const parts: Part[] = files.map((f) => {
        if (f.kind === 'image') {
          return { kind: 'image', mime: f.mime, b64: f.b64 || '' };
        }
        if (f.kind === 'pdf') {
          return { kind: 'pdf', name: f.name, b64: f.b64 || '' };
        }
        return { kind: 'text', name: f.name, text: f.text || '' };
      });

      return {
        role: m.role,
        content: m.content,
        parts: parts.length > 0 ? parts : undefined,
      };
    });

    const stream = streamChat({
      provider: keyRow.provider as ProviderId,
      baseUrl: keyRow.baseUrl,
      apiKey: plainApiKey,
      model: selectedModel,
      messages: streamMessages,
      signal: controller.signal,
    });

    for await (const chunk of stream) {
      if (controller.signal.aborted) break;

      accumulatedTextBuffer += chunk;

      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          const textToFlush = accumulatedTextBuffer;
          useChatStore.setState((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, content: textToFlush } : m
            ),
          }));
        });
      }

      const currentTimestamp = Date.now();
      if (currentTimestamp - lastCheckpoint > 2000) {
        lastCheckpoint = currentTimestamp;
        db.messages.update(assistantMsgId, { content: accumulatedTextBuffer }).catch(() => {});
      }
    }

    // Empty reply check
    if (!controller.signal.aborted && accumulatedTextBuffer.trim() === '') {
      throw new Error('The model returned an empty response. Try another model.');
    }

    // Write final content to Dexie and state when streaming ends
    const finalText = accumulatedTextBuffer;
    await db.messages.update(assistantMsgId, { content: finalText });
    await db.chats.update(chatId, { updatedAt: Date.now() });

    useChatStore.setState((state) => ({
      streaming: false,
      streamingMsgId: null,
      abortController: null,
      messages: state.messages.map((m) =>
        m.id === assistantMsgId ? { ...m, content: finalText } : m
      ),
    }));

    // Non-blocking auto-title after first assistant reply finishes
    const userMsg = useChatStore
      .getState()
      .messages.find((m) => m.role === 'user');
    if (userMsg && finalText.trim()) {
      maybeAutoTitle(chatId, userMsg.content, finalText).catch(() => {});
    }
  } catch (err: any) {
    if (controller.signal.aborted) {
      const stoppedText = accumulatedTextBuffer;
      await db.messages.update(assistantMsgId, { content: stoppedText });
      useChatStore.setState((state) => ({
        streaming: false,
        streamingMsgId: null,
        abortController: null,
        messages: state.messages.map((m) =>
          m.id === assistantMsgId ? { ...m, content: stoppedText } : m
        ),
      }));
      return;
    }

    const errorMessage =
      err instanceof Error ? err.message : 'An unexpected error occurred while generating response.';
    const partialText = accumulatedTextBuffer;

    await db.messages.update(assistantMsgId, {
      content: partialText,
      error: errorMessage,
    });

    useChatStore.setState((state) => ({
      streaming: false,
      streamingMsgId: null,
      abortController: null,
      messages: state.messages.map((m) =>
        m.id === assistantMsgId ? { ...m, content: partialText, error: errorMessage } : m
      ),
    }));
  } finally {
    activeAbortController = null;
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  messages: [],
  filesByMsgId: {},
  streaming: false,
  streamingMsgId: null,
  abortController: null,

  loadChats: async () => {
    try {
      const allChats = await db.chats.orderBy('updatedAt').reverse().toArray();
      const savedActiveChat = await db.meta.get('activeChatId');
      let activeId = savedActiveChat ? (savedActiveChat.value as string) : null;

      if (activeId && !allChats.some((c) => c.id === activeId)) {
        activeId = allChats.length > 0 ? allChats[0].id : null;
      }

      let msgs: MsgRow[] = [];
      const fileMap: Record<string, FileRow[]> = {};
      if (activeId) {
        msgs = await db.messages.where('chatId').equals(activeId).sortBy('createdAt');
        const files = await db.files.where('chatId').equals(activeId).toArray();
        for (const f of files) {
          if (!fileMap[f.msgId]) fileMap[f.msgId] = [];
          fileMap[f.msgId].push(f);
        }
      }

      set({
        chats: allChats,
        activeChatId: activeId,
        messages: msgs,
        filesByMsgId: fileMap,
      });
    } catch {
      // fallback
    }
  },

  selectChat: async (chatId: string) => {
    if (get().streaming) {
      get().stop();
    }
    await db.meta.put({ key: 'activeChatId', value: chatId });
    const msgs = await db.messages.where('chatId').equals(chatId).sortBy('createdAt');
    const files = await db.files.where('chatId').equals(chatId).toArray();
    const fileMap: Record<string, FileRow[]> = {};
    for (const f of files) {
      if (!fileMap[f.msgId]) fileMap[f.msgId] = [];
      fileMap[f.msgId].push(f);
    }

    set({
      activeChatId: chatId,
      messages: msgs,
      filesByMsgId: fileMap,
      streaming: false,
      streamingMsgId: null,
    });
  },

  newChat: () => {
    if (get().streaming) {
      get().stop();
    }
    db.meta.delete('activeChatId').catch(() => {});
    set({
      activeChatId: null,
      messages: [],
      filesByMsgId: {},
      streaming: false,
      streamingMsgId: null,
    });
  },

  deleteChat: async (chatId: string) => {
    if (get().activeChatId === chatId && get().streaming) {
      get().stop();
    }
    await db.chats.delete(chatId);
    await db.messages.where('chatId').equals(chatId).delete();
    await db.files.where('chatId').equals(chatId).delete();

    const remainingChats = get().chats.filter((c) => c.id !== chatId);
    let nextActiveId = get().activeChatId;
    let nextMessages = get().messages;
    let nextFilesByMsgId: Record<string, FileRow[]> = {};

    if (nextActiveId === chatId) {
      nextActiveId = remainingChats.length > 0 ? remainingChats[0].id : null;
      if (nextActiveId) {
        await db.meta.put({ key: 'activeChatId', value: nextActiveId });
        nextMessages = await db.messages.where('chatId').equals(nextActiveId).sortBy('createdAt');
        const files = await db.files.where('chatId').equals(nextActiveId).toArray();
        for (const f of files) {
          if (!nextFilesByMsgId[f.msgId]) nextFilesByMsgId[f.msgId] = [];
          nextFilesByMsgId[f.msgId].push(f);
        }
      } else {
        await db.meta.delete('activeChatId');
        nextMessages = [];
        nextFilesByMsgId = {};
      }
    } else {
      nextFilesByMsgId = { ...get().filesByMsgId };
    }

    set({
      chats: remainingChats,
      activeChatId: nextActiveId,
      messages: nextMessages,
      filesByMsgId: nextFilesByMsgId,
    });
  },

  renameChat: async (id: string, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    await db.chats.update(id, { title: cleanTitle });
    set((state) => ({
      chats: state.chats.map((c) => (c.id === id ? { ...c, title: cleanTitle } : c)),
    }));
  },

  togglePin: async (id: string) => {
    const chat = get().chats.find((c) => c.id === id);
    if (!chat) return;
    const nextPinned = !chat.pinned;
    await db.chats.update(id, { pinned: nextPinned });
    set((state) => ({
      chats: state.chats.map((c) => (c.id === id ? { ...c, pinned: nextPinned } : c)),
    }));
  },

  editAndResend: async (userMsgId, newText) => {
    const { streaming, activeChatId, messages, filesByMsgId } = get();
    if (streaming || !activeChatId || !newText.trim()) return;
    const idx = messages.findIndex((m) => m.id === userMsgId);
    if (idx < 0) return;

    const toDeleteIds = messages.slice(idx + 1).map((m) => m.id);
    await db.messages.bulkDelete(toDeleteIds);
    if (toDeleteIds.length > 0) {
      await db.files.where('msgId').anyOf(toDeleteIds).delete();
    }
    await db.messages.update(userMsgId, { content: newText.trim() });

    const updatedFilesMap = { ...filesByMsgId };
    for (const dId of toDeleteIds) {
      delete updatedFilesMap[dId];
    }

    set((s) => ({
      messages: [
        ...s.messages.slice(0, idx),
        { ...s.messages[idx], content: newText.trim() },
      ],
      filesByMsgId: updatedFilesMap,
    }));
    await runGeneration(activeChatId);
  },

  regenerate: async () => {
    const { streaming, activeChatId, messages, filesByMsgId } = get();
    const last = messages[messages.length - 1];
    if (streaming || !activeChatId || last?.role !== 'assistant') return;
    await db.messages.delete(last.id);
    await db.files.where('msgId').equals(last.id).delete();
    const updatedFilesMap = { ...filesByMsgId };
    delete updatedFilesMap[last.id];

    set((s) => ({
      messages: s.messages.slice(0, -1),
      filesByMsgId: updatedFilesMap,
    }));
    await runGeneration(activeChatId);
  },

  branchFrom: async (msgId) => {
    const { activeChatId, messages, chats, filesByMsgId } = get();
    const idx = messages.findIndex((m) => m.id === msgId);
    const src = chats.find((c) => c.id === activeChatId);
    if (idx < 0 || !src) return;
    const newId = crypto.randomUUID();
    const now = Date.now();

    const copy = messages.slice(0, idx + 1).map((m, i) => ({
      ...m,
      id: crypto.randomUUID(),
      oldId: m.id,
      chatId: newId,
      createdAt: now + i,
    }));

    const newFiles: FileRow[] = [];
    for (const m of copy) {
      const oldFiles = filesByMsgId[m.oldId] || [];
      for (const f of oldFiles) {
        newFiles.push({
          ...f,
          id: crypto.randomUUID(),
          chatId: newId,
          msgId: m.id,
        });
      }
    }

    const row: ChatRow = {
      ...src,
      id: newId,
      title: 'Branch: ' + src.title,
      createdAt: now,
      updatedAt: now,
      pinned: false,
    };

    await db.chats.put(row);
    await db.messages.bulkPut(copy.map(({ oldId, ...rest }) => rest));
    if (newFiles.length > 0) {
      await db.files.bulkPut(newFiles);
    }

    set((s) => ({ chats: [row, ...s.chats] }));
    await get().selectChat(newId);
  },

  sendMessage: async (text: string, attachedFiles: ProcessedFile[] = []) => {
    const trimmed = text.trim();
    if ((!trimmed && attachedFiles.length === 0) || get().streaming) return;

    const { selectedKeyId, selectedModel } = useKeysStore.getState();
    if (!selectedKeyId || !selectedModel) {
      return;
    }

    let chatId = get().activeChatId;
    const now = Date.now();

    // Determine title
    let initialTitle = trimmed;
    if (!initialTitle && attachedFiles.length > 0) {
      initialTitle = `Attachment: ${attachedFiles[0].name}`;
    }
    const title =
      initialTitle.length > 40 ? initialTitle.slice(0, 40).trim() + '...' : initialTitle;

    if (!chatId) {
      chatId = crypto.randomUUID();
      const newChatRow: ChatRow = {
        id: chatId,
        title,
        createdAt: now,
        updatedAt: now,
        keyId: selectedKeyId,
        model: selectedModel,
      };
      await db.chats.put(newChatRow);
      await db.meta.put({ key: 'activeChatId', value: chatId });

      set((state) => ({
        chats: [newChatRow, ...state.chats],
        activeChatId: chatId,
      }));
    } else {
      await db.chats.update(chatId, { updatedAt: now });
      set((state) => ({
        chats: state.chats.map((c) => (c.id === chatId ? { ...c, updatedAt: now } : c)),
      }));
    }

    // Save user message to db.messages
    const userMsgId = crypto.randomUUID();
    const userMsgRow: MsgRow = {
      id: userMsgId,
      chatId,
      role: 'user',
      content: trimmed,
      createdAt: now,
    };
    await db.messages.put(userMsgRow);

    // Save attached files
    const fileRows: FileRow[] = attachedFiles.map((f) => ({
      id: crypto.randomUUID(),
      chatId: chatId!,
      msgId: userMsgId,
      name: f.name,
      mime: f.mime,
      size: f.size,
      kind: f.kind,
      b64: f.b64,
      text: f.text,
    }));

    if (fileRows.length > 0) {
      await db.files.bulkPut(fileRows);
    }

    set((state) => ({
      messages: [...state.messages, userMsgRow],
      filesByMsgId: {
        ...state.filesByMsgId,
        [userMsgId]: fileRows,
      },
    }));

    await runGeneration(chatId);
  },

  retryMessage: async (assistantMsgId: string) => {
    const { streaming, activeChatId } = get();
    if (streaming || !activeChatId) return;
    await db.messages.delete(assistantMsgId);
    await db.files.where('msgId').equals(assistantMsgId).delete();
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== assistantMsgId),
    }));
    await runGeneration(activeChatId);
  },

  stop: () => {
    if (activeAbortController) {
      activeAbortController.abort();
    }
    if (currentAssistantId && accumulatedTextBuffer !== undefined) {
      const textToFlush = accumulatedTextBuffer;
      db.messages.update(currentAssistantId, { content: textToFlush }).catch(() => {});
      set((state) => ({
        streaming: false,
        streamingMsgId: null,
        abortController: null,
        messages: state.messages.map((m) =>
          m.id === currentAssistantId ? { ...m, content: textToFlush } : m
        ),
      }));
    } else {
      set({ streaming: false, streamingMsgId: null, abortController: null });
    }
  },
}));
