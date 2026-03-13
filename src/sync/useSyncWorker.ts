/**
 * useSyncWorker — React hook that mounts the sync worker triggers.
 * Spec: reviews/sync-worker-pm-preflow.md — Trigger conditions
 *
 * Three triggers, all gated on isConnected + isInternetReachable:
 *   1. App foreground (AppState → 'active')
 *   2. Network connectivity restored (offline → online transition)
 *   3. Every 5 minutes while online and app is open (setInterval)
 *
 * Mount this hook in one place only — inside the SQLiteProvider + provider
 * tree so useSQLiteContext() resolves. App.tsx mounts it via SyncWorkerMount.
 *
 * Does not render any UI. Never navigates.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';

import { runSyncWorker } from './syncWorker';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes

function isOnline(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable === true;
}

export function useSyncWorker(): void {
  const db = useSQLiteContext();

  // Stable ref so event listener callbacks always see the current db handle.
  const dbRef = useRef(db);
  dbRef.current = db;

  // Track previous online state to detect the offline → online transition.
  const wasOnlineRef = useRef(false);

  useEffect(() => {
    // ── Trigger 2: NetInfo subscription — detect connectivity restoration ──
    const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      const nowOnline = isOnline(state);
      if (nowOnline && !wasOnlineRef.current) {
        // Transitioned from offline to online — drain the queue immediately.
        runSyncWorker(dbRef.current);
      }
      wasOnlineRef.current = nowOnline;
    });

    // ── Trigger 1: AppState — run when app comes to foreground ────────────
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState !== 'active') return;
      // Check current connectivity before triggering.
      NetInfo.fetch().then((state) => {
        if (isOnline(state)) {
          runSyncWorker(dbRef.current);
        }
      });
    }
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    // ── Trigger 3: 5-minute interval while online ─────────────────────────
    const intervalId = setInterval(() => {
      NetInfo.fetch().then((state) => {
        if (isOnline(state)) {
          runSyncWorker(dbRef.current);
        }
      });
    }, SYNC_INTERVAL_MS);

    // ── Initial run on mount — catches any pending entries from before the
    //    hook was mounted (e.g., a visit saved in a previous app session). ──
    NetInfo.fetch().then((state) => {
      if (isOnline(state)) {
        wasOnlineRef.current = true;
        runSyncWorker(dbRef.current);
      }
    });

    return () => {
      netInfoUnsubscribe();
      appStateSubscription.remove();
      clearInterval(intervalId);
    };
  }, []);  // mount once — db ref updated via dbRef.current
}
