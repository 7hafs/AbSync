/**
 * Hook that subscribes to the sync status from dataService.
 *
 * Returns the current SyncStatus ('synced' | 'syncing' | 'offline' | 'error')
 * and updates reactively whenever the status changes.
 */
import { useEffect, useState } from "react";
import { getSyncStatus, onSyncStatusChange, SyncStatus } from "@/lib/dataService";

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());

  useEffect(() => {
    const unsubscribe = onSyncStatusChange(setStatus);
    return unsubscribe;
  }, []);

  return status;
}
