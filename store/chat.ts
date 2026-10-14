import { create } from 'zustand';
import { db, ChatRow, MsgRow } from '@/lib/db';
import { useKeysStore } from '@/store/keys';
import { decryptKey } from '@/lib/crypto';
import { streamChat, Msg } from '@/lib/stream';
import { ProviderId, proxyFetch } from '@/lib/providers';

interface ChatState {
  chats: ChatRow[];
  activeChatId: string | null;
  messages: MsgRow[];
  streaming: boolean;
  streamingMsgId: string | null;
  abortController: AbortController | null;
  loadChats: () => Promise<void>;
  selectChat: (chatId: string) => Promise<void>;
  newChat: () => void;
  deleteChat: (chatId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
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

    // Check if only 1 user message & 1 assistant reply exists (new chat first reply)
    const msgCount = await db.messages.where('chatId').equals(chatId).count();
    if (msgCount !== 2) return;

    // Check if the title is still the truncated first message
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

    const promptText = `User: "${userText.slice(0, 300)}"\nAssistant: "${assistantText.slice(0, 300)}"\n\nGive a 3-6 word title for this chat. Reply with only the title.`;

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

    // Skip broken messages when building history
    const history = useChatStore
      .getState()
      .messages.filter(
        (m) => m.id !== assistantMsgId && (m.role === 'user' || (m.content.trim() && !m.error))
      );
    const streamMessages: Msg[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

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
      if (activeId) {
        msgs = await db.messages.where('chatId').equals(activeId).sortBy('createdAt');
      }

      set({
        chats: allChats,
        activeChatId: activeId,
        messages: msgs,
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
    set({
      activeChatId: chatId,
      messages: msgs,
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

    const remainingChats = get().chats.filter((c) => c.id !== chatId);
    let nextActiveId = get().activeChatId;
    let nextMessages = get().messages;

    if (nextActiveId === chatId) {
      nextActiveId = remainingChats.length > 0 ? remainingChats[0].id : null;
      if (nextActiveId) {
        await db.meta.put({ key: 'activeChatId', value: nextActiveId });
        nextMessages = await db.messages.where('chatId').equals(nextActiveId).sortBy('createdAt');
      } else {
        await db.meta.delete('activeChatId');
        nextMessages = [];
      }
    }

    set({
      chats: remainingChats,
      activeChatId: nextActiveId,
      messages: nextMessages,
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
    const { streaming, activeChatId, messages } = get();
    if (streaming || !activeChatId || !newText.trim()) return;
    const idx = messages.findIndex((m) => m.id === userMsgId);
    if (idx < 0) return;
    await db.messages.bulkDelete(messages.slice(idx + 1).map((m) => m.id));
    await db.messages.update(userMsgId, { content: newText.trim() });
    set((s) => ({
      messages: [
        ...s.messages.slice(0, idx),
        { ...s.messages[idx], content: newText.trim() },
      ],
    }));
    await runGeneration(activeChatId);
  },

  regenerate: async () => {
    const { streaming, activeChatId, messages } = get();
    const last = messages[messages.length - 1];
    if (streaming || !activeChatId || last?.role !== 'assistant') return;
    await db.messages.delete(last.id);
    set((s) => ({ messages: s.messages.slice(0, -1) }));
    await runGeneration(activeChatId);
  },

  branchFrom: async (msgId) => {
    const { activeChatId, messages, chats } = get();
    const idx = messages.findIndex((m) => m.id === msgId);
    const src = chats.find((c) => c.id === activeChatId);
    if (idx < 0 || !src) return;
    const newId = crypto.randomUUID();
    const now = Date.now();
    const copy = messages.slice(0, idx + 1).map((m, i) => ({
      ...m,
      id: crypto.randomUUID(),
      chatId: newId,
      createdAt: now + i,
    }));
    const row = {
      ...src,
      id: newId,
      title: 'Branch: ' + src.title,
      createdAt: now,
      updatedAt: now,
      pinned: false,
    };
    await db.chats.put(row);
    await db.messages.bulkPut(copy);
    set((s) => ({ chats: [row, ...s.chats] }));
    await get().selectChat(newId);
  },

  sendMessage: async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || get().streaming) return;

    const { selectedKeyId, selectedModel } = useKeysStore.getState();
    if (!selectedKeyId || !selectedModel) {
      return;
    }

    let chatId = get().activeChatId;
    const now = Date.now();

    // a) If no active chat, create one in db.chats (title = first 40 chars of text)
    if (!chatId) {
      chatId = crypto.randomUUID();
      const title = trimmed.length > 40 ? trimmed.slice(0, 40).trim() + '...' : trimmed;
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

    // b) Save user message to db.messages
    const userMsgId = crypto.randomUUID();
    const userMsgRow: MsgRow = {
      id: userMsgId,
      chatId,
      role: 'user',
      content: trimmed,
      createdAt: now,
    };
    await db.messages.put(userMsgRow);

    set((state) => ({
      messages: [...state.messages, userMsgRow],
    }));

    await runGeneration(chatId);
  },

  retryMessage: async (assistantMsgId: string) => {
    const { streaming, activeChatId } = get();
    if (streaming || !activeChatId) return;
    await db.messages.delete(assistantMsgId);
    set((s) => ({ messages: s.messages.filter((m) => m.id !== assistantMsgId) }));
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
