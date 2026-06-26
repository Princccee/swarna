import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import {
  getAll,
  remove,
  incrementAttempts,
  count as queueCount,
  type QueuedInvoice,
} from '../../lib/offline-queue';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncingCount, setSyncingCount] = useState<number | null>(null);
  const isSyncing = useRef(false);

  const drainQueue = useCallback(async () => {
    if (isSyncing.current) return;

    const pending = await getAll();
    if (pending.length === 0) return;

    isSyncing.current = true;
    setSyncingCount(pending.length);

    let remaining = pending.length;

    for (const item of pending) {
      try {
        await api.post('/billing/invoices', item.payload);
        await remove(item.id);
        remaining -= 1;
        setSyncingCount(remaining > 0 ? remaining : null);
        toast.success('Offline bill synced successfully.');
      } catch (err: any) {
        await incrementAttempts(item.id);
        const msg =
          err?.response?.data?.message ??
          'Failed to sync an offline bill — will retry next time.';
        toast.error(msg);
      }
    }

    isSyncing.current = false;
    setSyncingCount(null);
  }, []);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      drainQueue();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Attempt a drain on mount in case the app came back online while unmounted
    if (navigator.onLine) {
      queueCount().then((n) => {
        if (n > 0) drainQueue();
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [drainQueue]);

  if (isOnline && syncingCount === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed bottom-0 inset-x-0 z-50 flex items-center justify-center gap-2',
        'px-4 py-2.5 text-sm font-medium text-white',
        isOnline ? 'bg-amber-600' : 'bg-zinc-700',
      ].join(' ')}
    >
      {!isOnline ? (
        <>
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 shrink-0" />
          You are offline — bills will sync automatically when reconnected.
        </>
      ) : (
        <>
          <SyncSpinner />
          Syncing {syncingCount} {syncingCount === 1 ? 'bill' : 'bills'}&hellip;
        </>
      )}
    </div>
  );
}

function SyncSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
