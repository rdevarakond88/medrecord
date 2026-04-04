/**
 * Offline sync queue operations.
 * Spec: docs/offline-sync-spec.md — Sync Queue Behaviour
 *
 * Every write operation (create patient, create visit, create record) must:
 *   1. Write to local SQLite first
 *   2. Call enqueueOperation() immediately after
 *   3. Return success to the UI — sync is invisible to the user
 *
 * The background sync worker (to be implemented) drains this queue in
 * queued_at order and calls POST /sync with batched operations.
 */

import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export type SyncEntityType = 'patient' | 'visit' | 'record' | 'consent';
export type SyncOperation  = 'create' | 'update';

export interface SyncQueueEntry {
  doctor_id:       string;  // auth-scoped: written to sync_queue.doctor_id for per-doctor cleanup
  entity_type:     SyncEntityType;
  entity_local_id: string;
  operation:       SyncOperation;
  payload:         object;  // full entity snapshot at time of queue
}

/**
 * Add an operation to the sync queue.
 *
 * Must be called inside the same logical write transaction as the SQLite
 * entity write so that a queue entry always accompanies a local write.
 *
 * Operations are processed strictly in queued_at order — critical for
 * dependency ordering (e.g. patient must sync before their first visit).
 */
export async function enqueueOperation(
  db: SQLite.SQLiteDatabase,
  entry: SyncQueueEntry,
): Promise<void> {
  // Null-guard: required fields must be non-empty strings. Silent null/undefined
  // values in SQLite bindings can produce rows the sync worker cannot match.
  // BUG-D3-DT11-1: made explicit so a missing field throws rather than inserts silently.
  if (!entry.doctor_id) {
    throw new Error(`enqueueOperation: doctor_id is missing (got ${JSON.stringify(entry.doctor_id)})`);
  }
  if (!entry.entity_local_id) {
    throw new Error(`enqueueOperation: entity_local_id is missing (got ${JSON.stringify(entry.entity_local_id)})`);
  }
  if (!entry.entity_type) {
    throw new Error(`enqueueOperation: entity_type is missing (got ${JSON.stringify(entry.entity_type)})`);
  }

  const id        = Crypto.randomUUID();
  const queuedAt  = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO sync_queue
       (id, entity_type, entity_local_id, doctor_id, operation, payload, queued_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      id,
      entry.entity_type,
      entry.entity_local_id,
      entry.doctor_id,
      entry.operation,
      JSON.stringify(entry.payload),
      queuedAt,
    ],
  );
}

/**
 * Delete all sync queue entries for the given doctor from SQLite.
 * Called during logout to prevent cross-doctor data leakage on shared devices.
 * Requires the doctor_id column added by the CRITICAL-2 security fix.
 */
export async function clearDoctorSyncQueue(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM sync_queue WHERE doctor_id = ?`,
    [doctorId],
  );
}
