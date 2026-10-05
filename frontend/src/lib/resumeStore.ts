/** Keeps the uploaded resume in chrome.storage.local so it survives the panel being reopened.
 * It never leaves the device except when the user clicks Analyze. */
import { STORAGE_KEYS } from '../extension/constants';
import { getItem, removeItems, setItem } from './storage';

interface StoredResume {
  name: string;
  type: string;
  lastModified: number;
  base64: string;
}

function toBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function saveResume(file: File): Promise<void> {
  const stored: StoredResume = {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    base64: toBase64(await file.arrayBuffer()),
  };
  await setItem(STORAGE_KEYS.resume, stored);
}

export async function loadResume(): Promise<File | null> {
  const stored = await getItem<StoredResume>(STORAGE_KEYS.resume);
  if (!stored?.base64) return null;
  try {
    return new File([fromBase64(stored.base64)], stored.name, { type: stored.type, lastModified: stored.lastModified });
  } catch {
    await clearResume(); // corrupted entry
    return null;
  }
}

export function clearResume(): Promise<void> {
  return removeItems(STORAGE_KEYS.resume);
}
