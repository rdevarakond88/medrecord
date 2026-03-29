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
  // On iOS (including Expo Go), NetInfo.fetch() point-in-time calls frequently
  // return isInternetReachable: null even when the device has real connectivity,
  // because the OS reachability probe hasn't completed at that instant.
  // Using !== false (rather than === true) allows sync to proceed when reachability
  // is unknown-but-connected. If the device is actually offline the API calls will
  // fail and retry via the normal attempt-increment path.
  // Note: useNetworkStatus (D3 consent check) intentionally stays conservative
  // (=== true) for UI display purposes — this is sync-only permissiveness.
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function useSyncWorker(): void {
  const db = useSQLiteContext();

  // Stable ref so event listener callbacks always see the current db handle.
  const dbRef = useRef(db);
  dbRef.current = db;

  // Track previous online state to detect the offline → online transition.
  const wasOnlineRef = useRef(false);

  // doctorId is intentionally NOT captured here — runSyncWorker reads it from
  // useAuthStore at each call site. Capturing it once at mount would snapshot
  // '' for fresh-login sessions (SyncWorkerMount renders before login completes).

  useEffect(() => {
    // ── Trigger 2: NetInfo subscription — detect connectivity restoration ──
    const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      const nowOnline = isOnline(state);
      console.log(
        '[useSyncWorker] NetInfo subscription — isConnected:', state.isConnected,
        'isInternetReachable:', state.isInternetReachable,
        'nowOnline:', nowOnline,
        'wasOnline:', wasOnlineRef.current,
      );
      if (nowOnline && !wasOnlineRef.current) {
        // Transitioned from offline to online — drain the queue immediately.
        console.log('[useSyncWorker] Trigger 2 (NetInfo): offline→online — running sync');
        runSyncWorker(dbRef.current);
      }
      wasOnlineRef.current = nowOnline;
    });

    // ── Trigger 1: AppState — run when app comes to foreground ────────────
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState !== 'active') return;
      // Check current connectivity before triggering.
      NetInfo.fetch().then((state) => {
        console.log(
          '[useSyncWorker] Trigger 1 (AppState active) — isConnected:', state.isConnected,
          'isInternetReachable:', state.isInternetReachable,
          'willSync:', isOnline(state),
        );
        if (isOnline(state)) {
          console.log('[useSyncWorker] Trigger 1: running sync');
          runSyncWorker(dbRef.current);
        }
      });
    }
    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    // ── Trigger 3: 5-minute interval while online ─────────────────────────
    const intervalId = setInterval(() => {
      NetInfo.fetch().then((state) => {
        console.log(
          '[useSyncWorker] Trigger 3 (5-min interval) — isConnected:', state.isConnected,
          'isInternetReachable:', state.isInternetReachable,
          'willSync:', isOnline(state),
        );
        if (isOnline(state)) {
          console.log('[useSyncWorker] Trigger 3: running sync');
          runSyncWorker(dbRef.current);
        }
      });
    }, SYNC_INTERVAL_MS);

    // ── Initial run on mount — catches any pending entries from before the
    //    hook was mounted (e.g., a visit saved in a previous app session). ──
    NetInfo.fetch().then((state) => {
      console.log(
        '[useSyncWorker] Initial mount check — isConnected:', state.isConnected,
        'isInternetReachable:', state.isInternetReachable,
        'willSync:', isOnline(state),
      );
      if (isOnline(state)) {
        wasOnlineRef.current = true;
        console.log('[useSyncWorker] Initial mount: running sync');
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
