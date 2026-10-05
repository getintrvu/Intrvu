/**
 * Saves finished analyses on this device so the same resume against the same job always shows
 * the same result, instantly and without using the daily quota. Nothing is stored server-side.
 */
import { STORAGE_KEYS } from '../extension/constants';
import type { AnalysisData } from '../types/AnalysisData';
import { getItem, removeItems, setItem } from './storage';

const MAX_ENTRIES = 20;

/** Must match `SCORING_VERSION` in Backend/app/analysis.py. Bump both when prompts or scoring
 * change, so old saved results are not shown for the new rules. */
export const SCORING_VERSION = 'v5.1';

export interface CachedAnalysis {
  key: string;
  savedAt: number;
  data: AnalysisData;
}

async function sha256(input: ArrayBuffer | string): Promise<string> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Case and whitespace differences in the job text must not create a different key. */
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Key for one resume file against one job description, analyzed by one engine (the built-in AI or a
 * user's own provider and model), so switching engines never shows another engine's result. */
export async function analysisKey(file: File, jobDescription: string, engine = 'server'): Promise<string> {
  const [fileHash, jobHash] = await Promise.all([sha256(await file.arrayBuffer()), sha256(normalize(jobDescription))]);
  return `${SCORING_VERSION}:${engine}:${fileHash.slice(0, 32)}:${jobHash.slice(0, 32)}`;
}

async function readAll(): Promise<CachedAnalysis[]> {
  const stored = await getItem<CachedAnalysis[]>(STORAGE_KEYS.analysisCache);
  return Array.isArray(stored) ? stored : [];
}

export async function getCachedAnalysis(key: string): Promise<CachedAnalysis | null> {
  return (await readAll()).find((entry) => entry.key === key) ?? null;
}

export async function saveAnalysis(key: string, data: AnalysisData): Promise<void> {
  const others = (await readAll()).filter((entry) => entry.key !== key);
  const next = [{ key, savedAt: Date.now(), data }, ...others].slice(0, MAX_ENTRIES);
  try {
    await setItem(STORAGE_KEYS.analysisCache, next);
  } catch {
    /* storage full or unavailable: the cache is an optimization, never an error */
  }
}

export function clearAnalysisCache(): Promise<void> {
  return removeItems(STORAGE_KEYS.analysisCache);
}
