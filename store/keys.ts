import { create } from 'zustand';
import { db, KeyRow } from '@/lib/db';
import { ModelInfo, KeyStatus, listModels, ProviderId, tierFor } from '@/lib/providers';
import { decryptKey } from '@/lib/crypto';

interface KeysState {
  keys: KeyRow[];
  selectedKeyId: string | null;
  selectedModel: string | null;
  cachedModels: Record<string, ModelInfo[]>;
  isLoadingKeys: boolean;
  recheckingKeyId: string | null;
  loadKeys: () => Promise<void>;
  selectKey: (keyId: string) => Promise<void>;
  selectModel: (modelId: string) => Promise<void>;
  addKey: (keyData: KeyRow, models: ModelInfo[]) => Promise<void>;
  deleteKey: (keyId: string) => Promise<void>;
  recheckKey: (keyId: string) => Promise<{ status: KeyStatus; models: ModelInfo[]; detail?: string }>;
  refreshModelsForSelectedKey: () => Promise<void>;
  checkKeysHealth: () => Promise<void>;
}

export const useKeysStore = create<KeysState>((set, get) => ({
  keys: [],
  selectedKeyId: null,
  selectedModel: null,
  cachedModels: {},
  isLoadingKeys: true,
  recheckingKeyId: null,

  loadKeys: async () => {
    try {
      const allKeys = await db.keys.toArray();

      // Load cached models for each key
      const modelsMap: Record<string, ModelInfo[]> = {};
      for (const k of allKeys) {
        const cached = await db.meta.get(`models:${k.id}`);
        if (cached && Array.isArray(cached.value)) {
          modelsMap[k.id] = cached.value.map((m: ModelInfo) => ({
            ...m,
            tier: m.tier || tierFor(k.provider as ProviderId, m.id),
          }));
        }
      }

      // Load saved selectedKeyId & selectedModel
      const selKeyRow = await db.meta.get('selectedKeyId');
      const selModelRow = await db.meta.get('selectedModel');

      let selectedKeyId = selKeyRow ? (selKeyRow.value as string) : null;
      let selectedModel = selModelRow ? (selModelRow.value as string) : null;

      // Validate selected key exists
      if (!selectedKeyId || !allKeys.some((k) => k.id === selectedKeyId)) {
        selectedKeyId = allKeys.length > 0 ? allKeys[0].id : null;
        if (selectedKeyId) {
          await db.meta.put({ key: 'selectedKeyId', value: selectedKeyId });
        }
      }

      // Validate selected model exists for this key
      if (selectedKeyId && modelsMap[selectedKeyId]) {
        const keyModels = modelsMap[selectedKeyId];
        if (!selectedModel || !keyModels.some((m) => m.id === selectedModel)) {
          selectedModel = keyModels.length > 0 ? keyModels[0].id : null;
          if (selectedModel) {
            await db.meta.put({ key: 'selectedModel', value: selectedModel });
          }
        }
      }

      set({
        keys: allKeys,
        selectedKeyId,
        selectedModel,
        cachedModels: modelsMap,
        isLoadingKeys: false,
      });
    } catch {
      set({ isLoadingKeys: false });
    }
  },

  selectKey: async (keyId: string) => {
    const { cachedModels } = get();
    await db.meta.put({ key: 'selectedKeyId', value: keyId });
    const models = cachedModels[keyId] || [];
    let nextModel = get().selectedModel;
    if (!nextModel || !models.some((m) => m.id === nextModel)) {
      nextModel = models.length > 0 ? models[0].id : null;
      if (nextModel) {
        await db.meta.put({ key: 'selectedModel', value: nextModel });
      }
    }
    set({ selectedKeyId: keyId, selectedModel: nextModel });
  },

  selectModel: async (modelId: string) => {
    await db.meta.put({ key: 'selectedModel', value: modelId });
    set({ selectedModel: modelId });
  },

  addKey: async (keyData: KeyRow, models: ModelInfo[]) => {
    await db.keys.put(keyData);
    await db.meta.put({ key: `models:${keyData.id}`, value: models });

    const currentKeys = get().keys;
    const updatedKeys = [...currentKeys.filter((k) => k.id !== keyData.id), keyData];
    const updatedCachedModels = {
      ...get().cachedModels,
      [keyData.id]: models,
    };

    let nextSelectedKeyId = get().selectedKeyId;
    let nextSelectedModel = get().selectedModel;

    if (!nextSelectedKeyId || updatedKeys.length === 1) {
      nextSelectedKeyId = keyData.id;
      nextSelectedModel = models.length > 0 ? models[0].id : null;
      await db.meta.put({ key: 'selectedKeyId', value: nextSelectedKeyId });
      if (nextSelectedModel) {
        await db.meta.put({ key: 'selectedModel', value: nextSelectedModel });
      }
    }

    set({
      keys: updatedKeys,
      cachedModels: updatedCachedModels,
      selectedKeyId: nextSelectedKeyId,
      selectedModel: nextSelectedModel,
    });
  },

  deleteKey: async (keyId: string) => {
    await db.keys.delete(keyId);
    await db.meta.delete(`models:${keyId}`);

    const remainingKeys = get().keys.filter((k) => k.id !== keyId);
    const updatedCached = { ...get().cachedModels };
    delete updatedCached[keyId];

    let nextSelectedKeyId = get().selectedKeyId;
    let nextSelectedModel = get().selectedModel;

    if (nextSelectedKeyId === keyId) {
      nextSelectedKeyId = remainingKeys.length > 0 ? remainingKeys[0].id : null;
      if (nextSelectedKeyId && updatedCached[nextSelectedKeyId]) {
        nextSelectedModel =
          updatedCached[nextSelectedKeyId].length > 0
            ? updatedCached[nextSelectedKeyId][0].id
            : null;
      } else {
        nextSelectedModel = null;
      }
      if (nextSelectedKeyId) {
        await db.meta.put({ key: 'selectedKeyId', value: nextSelectedKeyId });
      } else {
        await db.meta.delete('selectedKeyId');
      }
      if (nextSelectedModel) {
        await db.meta.put({ key: 'selectedModel', value: nextSelectedModel });
      } else {
        await db.meta.delete('selectedModel');
      }
    }

    set({
      keys: remainingKeys,
      cachedModels: updatedCached,
      selectedKeyId: nextSelectedKeyId,
      selectedModel: nextSelectedModel,
    });
  },

  recheckKey: async (keyId: string) => {
    const key = get().keys.find((k) => k.id === keyId);
    if (!key) return { status: 'unknown' as KeyStatus, models: [], detail: 'Key not found' };

    set({ recheckingKeyId: keyId });
    try {
      const plainKey = await decryptKey({ iv: key.iv, ct: key.ct });
      const result = await listModels(
        key.provider as ProviderId,
        plainKey,
        key.baseUrl
      );

      const now = Date.now();
      const updatedKey: KeyRow = {
        ...key,
        status: result.status,
        checkedAt: now,
      };

      await db.keys.put(updatedKey);

      let cachedModels = get().cachedModels;
      if (result.models.length > 0) {
        await db.meta.put({ key: `models:${keyId}`, value: result.models });
        cachedModels = {
          ...cachedModels,
          [keyId]: result.models,
        };
      }

      const updatedKeys = get().keys.map((k) => (k.id === keyId ? updatedKey : k));

      set({
        keys: updatedKeys,
        cachedModels,
        recheckingKeyId: null,
      });

      return result;
    } catch (e: any) {
      set({ recheckingKeyId: null });
      return { status: 'unknown' as KeyStatus, models: [], detail: 'Validation failed: ' + (e?.message || String(e)) };
    }
  },

  refreshModelsForSelectedKey: async () => {
    const { selectedKeyId } = get();
    if (!selectedKeyId) return;
    await get().recheckKey(selectedKeyId);
  },

  checkKeysHealth: async () => {
    const { keys, recheckKey } = get();
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const now = Date.now();

    for (const key of keys) {
      if (now - key.checkedAt > SIX_HOURS_MS) {
        try {
          await recheckKey(key.id);
        } catch {
          // silently continue sequential check
        }
      }
    }
  },
}));
