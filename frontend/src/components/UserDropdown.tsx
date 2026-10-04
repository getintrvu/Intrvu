import React, { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { deleteMyData, userMessage } from '../api/client';
import { useUsage } from '../hooks/useUsage';
import { STORAGE_KEYS } from '../extension/constants';
import { removeItems } from '../lib/storage';

interface UserDropdownProps {
  onClose: () => void;
}

const itemClass =
  'w-full rounded px-3 py-2 text-left text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50';

const UserDropdown: React.FC<UserDropdownProps> = ({ onClose }) => {
  const { email, signOut, getToken } = useAuth();
  const { usage } = useUsage();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteMyData(await getToken());
      await removeItems(STORAGE_KEYS.resume, STORAGE_KEYS.jobData, STORAGE_KEYS.jobExtractedAt);
      await signOut();
    } catch (err) {
      setError(userMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute left-2 top-16 z-20 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
        <div className="border-b border-gray-100 p-4">
          <div className="break-all text-sm font-medium text-gray-700">{email}</div>
          {usage && (
            <div className="mt-1 text-xs text-gray-500">
              {usage.remaining} of {usage.limit} analyses left today
            </div>
          )}
        </div>

        <div className="p-2">
          <button onClick={() => void signOut()} className={`${itemClass} text-gray-700 hover:bg-gray-50 active:bg-gray-100`}>
            Sign out
          </button>

          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className={`${itemClass} text-red-600 hover:bg-red-50 active:bg-red-100`}
            >
              Delete my IntrvuFit data
            </button>
          ) : (
            <div className="rounded border border-red-200 bg-red-50 p-3">
              <p className="mb-2 text-xs text-red-700">
                This deletes your IntrvuFit usage data and the resume saved in this browser, then signs you out. Your account stays active for your other products.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex-1 rounded bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
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
