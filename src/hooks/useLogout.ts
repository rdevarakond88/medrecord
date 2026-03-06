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
 *   3. queryClient.clear()                            — React Query cache cleared
 *   4. clearAuth()                                    — in-memory state cleared last
 *
 * Resetting state before clearing SQLite would create a race window where
 * the next doctor's mount effects could fire while the old data is still
 * on disk. This ordering closes that window.
 */

import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/useAuthStore';
import { clearDoctorPatients } from '../db/patients';
import { clearDoctorVisits, clearDoctorDraftVisits } from '../db/visits';
import { clearDoctorScans, clearDoctorScanRecords } from '../db/scans';
import { clearDoctorSyncQueue } from '../sync/syncQueue';

export function useLogout(): () => Promise<void> {
  const db          = useSQLiteContext();
  const queryClient = useQueryClient();
  const user        = useAuthStore((s) => s.user);
  const clearAuth   = useAuthStore((s) => s.clearAuth);

  return useCallback(async () => {
    // Step 1: capture doctor ID before any state is cleared
    const doctorId = user?.id ?? '';

    // Step 2: wipe this doctor's SQLite caches (patients + visits + sync queue)
    if (doctorId) {
      await clearDoctorPatients(db, doctorId);
      await clearDoctorVisits(db, doctorId);          // D3-H-3: server-cached visits cleared
      await clearDoctorDraftVisits(db, doctorId);     // D6: locally-created draft visits cleared
      await clearDoctorScanRecords(db, doctorId);     // D7 CRITICAL-1 fix: scans table rows cleared
      await clearDoctorScans(doctorId);               // D7 PM REQ 1: doctor-scoped scan images deleted
      await clearDoctorSyncQueue(db, doctorId);       // sync queue cleared on logout
    }

    // Step 3: clear the React Query in-memory cache (prevents session bleed
    // where a second doctor within the staleTime window sees cached results)
    queryClient.clear();

    // Step 4: clear Zustand auth state last
    clearAuth();
  }, [db, queryClient, user, clearAuth]);
}
