/** Typed access to chrome.storage.local, with a localStorage fallback so the UI also runs in a
 * normal browser tab during `vite dev`. */
const hasChromeStorage = () => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function getItem<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export async function removeItems(...keys: string[]): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(keys);
    return;
  }
  keys.forEach((key) => localStorage.removeItem(key));
}

/** Subscribe to changes of one key. Returns an unsubscribe function. */
export function onItemChanged<T>(key: string, callback: (value: T | undefined) => void): () => void {
  if (!hasChromeStorage()) return () => undefined;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && key in changes) callback(changes[key].newValue as T | undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
