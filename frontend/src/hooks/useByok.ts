import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../extension/constants';
import { getByok, type ByokSettings } from '../lib/byok';
import { onItemChanged } from '../lib/storage';

/** The user's own-key settings, or null when they use IntrvuFit's built-in AI. Stays in sync across the panel. */
export function useByok(): { byok: ByokSettings | null; loaded: boolean } {
  const [byok, setByok] = useState<ByokSettings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const read = () =>
      getByok().then((value) => {
        if (active) {
          setByok(value);
          setLoaded(true);
        }
      });
    void read();
    const unsubscribe = onItemChanged(STORAGE_KEYS.byok, () => void read());
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { byok, loaded };
}
