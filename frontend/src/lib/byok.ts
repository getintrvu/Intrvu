/**
 * Bring your own key. The user's AI provider key lives only in this browser (chrome.storage.local).
 * It is sent to our server with each analysis, which uses it for that request alone; it is never
 * stored server-side and is removed on sign-out.
 */
import { STORAGE_KEYS } from '../extension/constants';
import { getItem, removeItems, setItem } from './storage';

export type Provider = 'gemini' | 'openai';

export interface ByokSettings {
  provider: Provider;
  apiKey: string;
  /** Empty means "use the default model for this provider". */
  model?: string;
}

export const PROVIDERS: Record<Provider, { label: string; defaultModel: string; keyUrl: string; keyExample: string }> = {
  gemini: {
    label: 'Gemini',
    defaultModel: 'gemini-3.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyExample: 'AIza…',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyExample: 'sk-…',
  },
};

const isProvider = (value: unknown): value is Provider => value === 'gemini' || value === 'openai';

export async function getByok(): Promise<ByokSettings | null> {
  const stored = await getItem<ByokSettings>(STORAGE_KEYS.byok);
  return stored && isProvider(stored.provider) && typeof stored.apiKey === 'string' && stored.apiKey ? stored : null;
}

export function saveByok(settings: ByokSettings): Promise<void> {
  const model = settings.model?.trim();
  return setItem(STORAGE_KEYS.byok, { provider: settings.provider, apiKey: settings.apiKey.trim(), ...(model ? { model } : {}) });
}

export function clearByok(): Promise<void> {
  return removeItems(STORAGE_KEYS.byok);
}

/** "AIza…cdef": enough to recognise a key, never enough to use it. */
export function maskKey(key: string): string {
  return key.length <= 10 ? '••••' : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Identifies which AI produced a result, so saved results are not reused across providers/models. */
export function engineId(byok: ByokSettings | null): string {
  return byok ? `${byok.provider}:${byok.model?.trim() || 'default'}` : 'server';
}

/** The request headers the API reads the user's key from. */
export function byokHeaders(byok: ByokSettings | null | undefined): Record<string, string> {
  if (!byok) return {};
  const headers: Record<string, string> = { 'X-LLM-Provider': byok.provider, 'X-LLM-Key': byok.apiKey };
  if (byok.model?.trim()) headers['X-LLM-Model'] = byok.model.trim();
  return headers;
}
