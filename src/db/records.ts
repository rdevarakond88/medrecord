/**
 * SQLite queries for the visit_records cache — D4 Visit Detail offline support.
 * Spec: docs/data-models.md — Record entity
 * Spec: docs/offline-sync-spec.md — SQLite as primary read path
 *
 * visit_records table:
 *   Stores both server-fetched records ('synced') and locally-created notes
 *   that have not yet reached the server ('pending').
 *   sync_status='deleted' marks locally soft-deleted records (server is append-only).
 *
 * Offline-first: getCachedRecords() is the fallback when offline.
 *   On reconnect, D4 calls getVisitRecords() and upsertRecordsFromServer() to refresh.
 *
 * clearDoctorRecords() is called at logout alongside clearDoctorVisits() and
 * clearDoctorDraftVisits() to prevent cross-doctor data leakage on shared devices.
 */

import * as SQLite from 'expo-sqlite';

export interface LocalRecord {
  id:              string;         // server ID (for synced), local UUID (for pending)
  local_id:        string | null;  // non-null only for locally-created pending records
  visit_id:        string;
  type:            'note' | 'scan';
  content_text:    string | null;  // note text or OCR text; null if not available
  ocr_status:      string | null;  // null for notes
  created_by_name: string | null;  // display name; null for records predating this field
  created_at:      string;         // ISO 8601 timestamp
  sync_status:     'synced' | 'pending' | 'failed' | 'deleted';
}

/**
 * Read all visible records for a visit from the local cache.
 * Excludes soft-deleted records (sync_status='deleted').
 * Returns records ordered oldest-first (chronological read order).
 *
 * @param visitId  Server visit ID — used as the foreign key in visit_records.
 * @param doctorId Current doctor — scopes reads to prevent cross-doctor leakage.
 */
export async function getCachedRecords(
  db: SQLite.SQLiteDatabase,
  visitId: string,
  doctorId: string,
): Promise<LocalRecord[]> {
  return db.getAllAsync<LocalRecord>(
    `SELECT id, local_id, visit_id, type, content_text, ocr_status,
            created_by_name, created_at, sync_status
     FROM visit_records
     WHERE visit_id = ? AND doctor_id = ? AND sync_status != 'deleted'
     ORDER BY created_at ASC`,
    [visitId, doctorId],
  );
}

/**
 * Cache records from a GET /visits/:id/records server response.
 *
 * Existing 'synced' rows are updated; rows with sync_status='pending' are
 * left untouched so locally-added notes are not overwritten by a stale fetch.
 *
 * ON CONFLICT DO UPDATE WHERE sync_status != 'pending' ensures this invariant
 * without a separate read-then-write — one atomic upsert per record.
 */
export async function upsertRecordsFromServer(
  db: SQLite.SQLiteDatabase,
  visitId: string,
  doctorId: string,
  records: Array<{
    id:              string;
    type:            'note' | 'scan';
    content_text:    string | null;
    ocr_status:      string | null;
    created_by_name: string | null;
    created_at:      string;
  }>,
): Promise<void> {
  const now = new Date().toISOString();
  for (const r of records) {
    await db.runAsync(
      `INSERT INTO visit_records
         (id, local_id, visit_id, doctor_id, type, content_text, ocr_status,
          created_by_name, created_at, sync_status, cached_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
       ON CONFLICT(id) DO UPDATE SET
         content_text    = excluded.content_text,
         ocr_status      = excluded.ocr_status,
         created_by_name = excluded.created_by_name,
         sync_status     = 'synced',
         cached_at       = excluded.cached_at
       WHERE sync_status != 'pending'`,
      [r.id, visitId, doctorId, r.type, r.content_text,
       r.ocr_status, r.created_by_name, r.created_at, now],
    );
  }
}

/**
 * Insert a locally-created note into the visit_records cache.
 * sync_status='pending' — the sync worker will upload it to the server via POST /sync.
 * Called by D4 BEFORE any server call (offline-first write).
 *
 * The note appears immediately in getCachedRecords() so the doctor sees it
 * without waiting for a server round-trip.
 */
export async function insertLocalNote(
  db: SQLite.SQLiteDatabase,
  visitId: string,
  doctorId: string,
  text: string,
  localId: string,
  doctorName: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO visit_records
       (id, local_id, visit_id, doctor_id, type, content_text, ocr_status,
        created_by_name, created_at, sync_status, cached_at)
     VALUES (?, ?, ?, ?, 'note', ?, NULL, ?, ?, 'pending', ?)`,
    [localId, localId, visitId, doctorId, text, doctorName, now, now],
  );
}

/**
 * Mark a locally-created note as synced after a successful POST /records response.
 * Updates the id to the server-assigned UUID (replacing the local UUID).
 * Called by D4 after createNote() succeeds, and by the sync worker after
 * POST /sync returns a success result for this record.
 */
export async function markRecordSynced(
  db: SQLite.SQLiteDatabase,
  localId: string,
  serverId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE visit_records
     SET id          = ?,
         sync_status = 'synced',
         cached_at   = ?
     WHERE local_id = ? AND sync_status = 'pending'`,
    [serverId, now, localId],
  );
}

/**
 * Update the text of a locally-visible note (inline note edit).
 *
 * Local-only for v1 — PATCH /records/:id is not yet implemented server-side.
 * The updated text is visible in D4 immediately but will not propagate to
 * other devices until the backend endpoint exists (tracked as D4 MEDIUM debt).
 *
 * Uses the record's current `id` (which may be the local UUID for a pending
 * note, or the server UUID for a synced note).
 */
export async function updateLocalNoteText(
  db: SQLite.SQLiteDatabase,
  recordId: string,
  newText: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE visit_records
     SET content_text = ?,
         cached_at    = ?
     WHERE id = ?`,
    [newText, now, recordId],
  );
}

/**
 * Soft-delete a record locally (sync_status='deleted').
 * Server is append-only — the record is not deleted server-side.
 * Excluded from getCachedRecords() and all future sync operations.
 *
 * Note: a 'pending' note soft-deleted before the sync worker processes it
 * will remain in sync_queue until it reaches max_attempts ('failed'). This
 * is acceptable — the server will create the note, but D4 will hide it
 * locally. On the next GET /visits/:id/records, the server record will be
 * upserted with sync_status='synced'; the WHERE sync_status != 'pending'
 * guard in upsertRecordsFromServer prevents overwriting it. The doctor
 * may see the "deleted" note reappear after a refresh — MEDIUM debt.
 */
export async function deleteLocalRecord(
  db: SQLite.SQLiteDatabase,
  recordId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE visit_records
     SET sync_status = 'deleted',
         cached_at   = ?
     WHERE id = ?`,
    [now, recordId],
  );
}

/**
 * Delete all cached records for the given doctor from SQLite.
 * Called during logout to prevent cross-doctor data leakage on shared devices.
 */
export async function clearDoctorRecords(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM visit_records WHERE doctor_id = ?`,
    [doctorId],
  );
}
