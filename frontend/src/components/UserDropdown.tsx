import React, { useEffect, useState } from 'react';
import { KeyRound, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { deleteMyData, userMessage } from '../api/client';
import { useUsage } from '../hooks/useUsage';
import { useByok } from '../hooks/useByok';
import { PROVIDERS } from '../lib/byok';
import { STORAGE_KEYS } from '../extension/constants';
import { removeItems } from '../lib/storage';

interface UserDropdownProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

const itemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400';

/**
 * Account menu. It sits in the right-hand sidebar, which is narrower than the menu, so it is
 * anchored to the right edge and opens leftwards over the content. Anchoring it to the left edge
 * made it run off the side of the panel.
 */
const UserDropdown: React.FC<UserDropdownProps> = ({ onClose, onOpenSettings }) => {
  const { email, signOut, getToken } = useAuth();
  const { usage } = useUsage();
  const { byok } = useByok();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteMyData(await getToken());
      await removeItems(
        STORAGE_KEYS.resume,
        STORAGE_KEYS.analysisCache,
        STORAGE_KEYS.byok,
        STORAGE_KEYS.jobData,
        STORAGE_KEYS.jobExtractedAt,
      );
      await signOut();
    } catch (err) {
      setError(userMessage(err));
      setBusy(false);
    }
  };

  const at = (email ?? '').indexOf('@');
  const emailName = at > 0 ? email!.slice(0, at) : (email ?? '');
  const emailDomain = at > 0 ? email!.slice(at) : '';

  const usedPct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        role="menu"
        className="absolute right-2 top-16 z-20 w-60 max-w-[calc(100vw-1rem)] rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
      >
        <div className="px-3 pb-3 pt-2">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-sm font-bold uppercase text-[#4f46e5]"
              aria-hidden="true"
            >
              {(email ?? '?').charAt(0)}
            </span>
            <span className="min-w-0 text-[13px] font-semibold leading-tight text-gray-800" title={email ?? undefined}>
              {/* a break opportunity before the @ so a long address wraps there, not mid-word */}
              {emailName}
              <wbr />
              {emailDomain}
            </span>
          </div>

          {byok && (
            <p className="mt-3 text-[11px] text-gray-500">Using your own {PROVIDERS[byok.provider].label} key. No daily limit.</p>
          )}

          {!byok && usage && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] text-gray-500">
                <span>Today</span>
                <span>
                  {usage.remaining} of {usage.limit} analyses left
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-[#4f46e5]" style={{ width: `${usedPct}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-1.5">
          <button
            role="menuitem"
            onClick={onOpenSettings}
            className={`${itemClass} text-gray-700 hover:bg-gray-50`}
          >
            <KeyRound className="h-4 w-4 text-gray-400" />
            AI settings
          </button>

          <button role="menuitem" onClick={() => void signOut()} className={`${itemClass} text-gray-700 hover:bg-gray-50`}>
            <LogOut className="h-4 w-4 text-gray-400" />
            Sign out
          </button>

          {!confirmingDelete ? (
            <button
              role="menuitem"
              onClick={() => setConfirmingDelete(true)}
              className={`${itemClass} text-red-600 hover:bg-red-50`}
            >
              <Trash2 className="h-4 w-4" />
              Delete my IntrvuFit data
            </button>
          ) : (
            <div className="m-1 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="mb-2.5 text-xs leading-relaxed text-red-700">
                This deletes your IntrvuFit usage data and the resume saved in this browser, then signs you out. Your account
                stays active for your other products.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex-1 rounded-md bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default UserDropdown;
