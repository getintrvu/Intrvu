import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { fetchUsage, type Usage } from '../api/client';

/** Today's analysis quota for the signed-in user. `refresh` re-reads it (e.g. after an analysis). */
export function useUsage() {
  const { status, getToken } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUsage(await fetchUsage(await getToken()));
    } catch {
      setUsage(null); // the quota display is optional; never block the UI on it
    }
  }, [getToken]);

  useEffect(() => {
    if (status === 'signedIn') void refresh();
    else setUsage(null);
  }, [status, refresh]);

  return { usage, refresh };
}
