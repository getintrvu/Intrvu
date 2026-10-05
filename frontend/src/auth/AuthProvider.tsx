import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearAnalysisCache } from '../lib/analysisCache';
import { clearByok } from '../lib/byok';
import { signInWithGoogle, supabase } from '../lib/supabase';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  email: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** A fresh access token (refreshed automatically when it is about to expire). */
  getToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setStatus(data.session ? 'signedIn' : 'signedOut');
      })
      .catch(() => active && setStatus('signedOut'));

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Please sign in to continue.');
    return data.session.access_token;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      email: session?.user.email ?? null,
      signIn: signInWithGoogle,
      signOut: async () => {
        await clearAnalysisCache(); // saved results contain resume details: never leave them for the next user
        await clearByok(); // and a personal API key must not carry over to whoever signs in next
        await supabase.auth.signOut();
      },
      getToken,
    }),
    [status, session, getToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
