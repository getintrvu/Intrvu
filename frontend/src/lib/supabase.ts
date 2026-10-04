import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { getItem, removeItems, setItem } from './storage';

// Supabase keeps its session (and the PKCE verifier) in chrome.storage.local, not localStorage,
// so it survives the panel iframe being recreated on every page.
const storage = {
  getItem: async (key: string) => (await getItem<string>(key)) ?? null,
  setItem: (key: string, value: string) => setItem(key, value),
  removeItem: (key: string) => removeItems(key),
};

export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'missing', {
  auth: {
    flowType: 'pkce',
    storage,
    storageKey: 'intrvufit_auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Google sign-in through Supabase using the browser's own OAuth window. */
export async function signInWithGoogle(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.identity) {
    throw new Error('Sign-in is only available inside the extension.');
  }
  const redirectTo = chrome.identity.getRedirectURL();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw error ?? new Error('Could not start Google sign-in.');

  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  const code = responseUrl ? new URL(responseUrl).searchParams.get('code') : null;
  if (!code) throw new Error('Sign-in was cancelled.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}
