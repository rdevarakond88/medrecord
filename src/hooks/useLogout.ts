/**
 * useLogout — orchestrates the full logout sequence.
 *
 * This is the single correct way to log a user out. Any component that
 * needs a logout button imports this hook, not clearAuth() directly.
 *
 * Execution order is strictly enforced to prevent cross-doctor data leakage
 * on shared clinic devices (fixes C-1, C-3, D3-H-3):
 *
 *   1. Read user.id from store BEFORE any state change
 *   2. await clearDoctorPatients(db, doctorId)       — patients table cleared first
 *      await clearDoctorVisits(db, doctorId)         — visits cache cleared (D3-H-3)
 *      await clearDoctorScanRecords(db, doctorId)    — scans table cleared (D7 CRITICAL-1 fix)
 *      await clearDoctorScans(doctorId)              — scan image files deleted (D7 PM REQ 1)
 *      await clearDoctorRecords(db, doctorId)        — visit_records cache cleared (D4)
 *   3. queryClient.clear()                            — React Query cache cleared
 *   4. clearAuth()                                    — in-memory state cleared last
 *
 * Resetting state before clearing SQLite would create a race window where
 * the next doctor's mount effects could fire while the old data is still
 * on disk. This ordering closes that window.
 */

import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/useAuthStore';
import { REFRESH_TOKEN_KEY, USER_PROFILE_KEY } from '../auth/constants';
import { clearDoctorPatients } from '../db/patients';
import {
  clearDoctorVisits,
  clearDoctorDraftVisits,
  countUnsyncedDraftVisits,
} from '../db/visits';
import { clearDoctorScans, clearDoctorScanRecords } from '../db/scans';
import { clearDoctorRecords } from '../db/records';
import { clearDoctorSyncQueue } from '../sync/syncQueue';

export function useLogout(): () => Promise<void> {
  const db          = useSQLiteContext();
  const queryClient = useQueryClient();
  const user        = useAuthStore((s) => s.user);
  const clearAuth   = useAuthStore((s) => s.clearAuth);

  return useCallback(async () => {
    // Step 1: capture doctor ID before any state is cleared
    const doctorId = user?.id ?? '';

    // M-6: warn if unsynced draft visits would be permanently deleted.
    // clearDoctorDraftVisits() below deletes pending/failed drafts — irreversible
    // data loss on a shared clinic device where the sync worker has not yet
    // uploaded the visit. sync_status='synced' rows are preserved (BUG-D3-DT1-2 fix).
    // Require explicit confirmation before deleting pending or failed rows.
    //
    // BUG-D3-DT4-1 fix: count both 'pending' AND 'failed' rows. Previously only
    // 'pending' was counted — if the sync worker exhausted max_attempts and moved the
    // row to 'failed', the M-6 dialog was skipped and the visit was silently deleted.
    //
    // BUG-D4-DT1-2 fix: belt-and-suspenders — also check sync_queue directly.
    // If the visits_draft ↔ sync_queue mirror diverged (e.g. sync worker crashed
    // mid-update), visits_draft count alone could miss unsynced entries.
    if (doctorId) {
      const pendingCount = await countUnsyncedDraftVisits(db, doctorId);

      // Sync_queue cross-check: pending/failed visit entries not yet uploaded.
      const sqResult = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM sync_queue
         WHERE entity_type = 'visit' AND status IN ('pending', 'failed') AND doctor_id = ?`,
        [doctorId],
      );
      const sqCount = sqResult?.count ?? 0;

      const totalUnsynced = Math.max(pendingCount, sqCount);

      if (totalUnsynced > 0) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Unsynced visits',
            `${totalUnsynced} visit${totalUnsynced > 1 ? 's have' : ' has'} not been ` +
            `uploaded to the server and will be lost if you log out now. ` +
            `Connect to the internet to sync before logging out.`,
            [
              {
                text: 'Stay logged in',
                style: 'cancel',
                onPress: () => resolve(false),
              },
              {
                text: 'Log out',
                style: 'destructive',
                onPress: () => resolve(true),
              },
            ],
          );
        });
        // Doctor chose to stay — abort logout silently, no state change
        if (!confirmed) return;
      }
    }

    // Step 2: wipe this doctor's SQLite caches (patients + visits + sync queue)
    if (doctorId) {
      await clearDoctorPatients(db, doctorId);
      await clearDoctorVisits(db, doctorId);          // D3-H-3: server-cached visits cleared
      await clearDoctorDraftVisits(db, doctorId);     // D6: locally-created draft visits cleared
      await clearDoctorScanRecords(db, doctorId);     // D7 CRITICAL-1 fix: scans table rows cleared
      await clearDoctorScans(doctorId);               // D7 PM REQ 1: doctor-scoped scan images deleted
      await clearDoctorRecords(db, doctorId);         // D4: visit_records cache cleared
      await clearDoctorSyncQueue(db, doctorId);       // sync queue cleared on logout
    }

    // Step 3: delete persisted credentials from iOS Keychain / Android Keystore.
    // Without this, expo-secure-store persists across Expo Go reinstalls (iOS
    // Keychain behaviour), making it impossible to reach the Login screen.
    // Runs unconditionally so a partial-logout state cannot leave stale keys.
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_PROFILE_KEY);

    // Step 4: clear the React Query in-memory cache (prevents session bleed
    // where a second doctor within the staleTime window sees cached results)
    queryClient.clear();

    // Step 5: clear Zustand auth state last
    clearAuth();
  }, [db, queryClient, user, clearAuth]);
}
