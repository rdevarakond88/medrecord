/**
 * Sync status store — useSyncStore.
 * Spec: reviews/sync-worker-pm-preflow.md — Sync status store location
 *
 * Minimal global state for sync worker status. Readable by any screen that wants
 * to surface sync feedback (v1.1 sync UI). The sync worker updates this via
 * useSyncStore.getState() (outside React) so no hooks are needed in the worker.
 *
 * Fields:
 *   isSyncing   — true while a drain run is in flight
 *   lastSyncAt  — ISO timestamp of the last completed successful run
 *   failedCount — number of sync_queue entries currently at status='failed'
 */

import { create } from 'zustand';

interface SyncState {
  isSyncing:   boolean;
  lastSyncAt:  string | null;
  failedCount: number;

  // DEBUG — visible on-device log (last 20 events). Remove before merge.
  debugLog:    string[];

  setSyncing:     (v: boolean) => void;
  setLastSyncAt:  (v: string)  => void;
  setFailedCount: (v: number)  => void;
  addDebugLog:    (line: string) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing:   false,
  lastSyncAt:  null,
  failedCount: 0,
  debugLog:    [],

  setSyncing:     (isSyncing)   => set({ isSyncing }),
  setLastSyncAt:  (lastSyncAt)  => set({ lastSyncAt }),
  setFailedCount: (failedCount) => set({ failedCount }),
  // Keep the last 20 log lines so the panel never grows unbounded.
  addDebugLog: (line) =>
    set((s) => ({ debugLog: [...s.debugLog.slice(-19), line] })),
}));
