/**
 * Hook that subscribes to the sync status from dataService.
 *
 * Returns the current SyncStatus ('synced' | 'syncing' | 'offline' | 'error')
 * and the last successful sync timestamp (epoch ms or null).
 * Updates reactively whenever the status changes.
 */
import { useEffect, useState } from "react";
import {
  getSyncStatus,
  getLastSyncedAt,
  onSyncStatusChange,
  SyncStatus,
} from "@/lib/dataService";

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());

  useEffect(() => {
    const unsubscribe = onSyncStatusChange((state) => {
      setStatus(state.status);
    });
    return unsubscribe;
  }, []);

  return status;
}

export function useSyncInfo(): {
  status: SyncStatus;
  lastSyncedAt: number | null;
} {
  const [info, setInfo] = useState<{
    status: SyncStatus;
    lastSyncedAt: number | null;
  }>(() => ({
    status: getSyncStatus(),
    lastSyncedAt: getLastSyncedAt(),
  }));

  useEffect(() => {
    const unsubscribe = onSyncStatusChange((state) => {
      setInfo(state);
    });
    return unsubscribe;
  }, []);

  return info;
}
