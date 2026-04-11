/**
 * syncLogger.ts — Shared debug logging helper for the sync subsystem.
 *
 * Writes each event to both console.log (Metro dev tools) AND useSyncStore
 * so it can be rendered in the on-device SyncDebugPanel without requiring
 * access to Metro console output.
 *
 * DEBUG — this file and all its call sites should be removed before merge
 * once the iOS sync trigger issue (BUG-D3-DT8-1) is diagnosed and fixed.
 */

import { useSyncStore } from '../store/useSyncStore';

export function syncLog(msg: string): void {
  const ts   = new Date().toTimeString().slice(0, 8);  // HH:MM:SS
  const line = `${ts} ${msg}`;
  console.log('[SyncDebug]', line);
  useSyncStore.getState().addDebugLog(line);
}
