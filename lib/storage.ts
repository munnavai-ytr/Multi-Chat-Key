export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageInfo() {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    const est = (await navigator.storage?.estimate?.()) ?? {};
    return { persisted, usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return { persisted: false, usage: 0, quota: 0 };
  }
}
