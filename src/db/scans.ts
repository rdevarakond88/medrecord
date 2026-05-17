/**
 * Scan file-system helpers and SQLite queries — D7 Document Scanner.
 *
 * Doctor-scoped image directory: <documentDirectory>/<doctorId>/scans/
 * PM REQ 1: images are isolated per doctor; cleared on logout.
 * DPDP Act 2023 §5 — personal health images stored only for the treating doctor.
 *
 * Path convention (CRITICAL-2 / KFM-3 fix):
 *   Stored in SQLite as a RELATIVE path: `${doctorId}/scans/${uuid}.jpg`
 *   Resolved to absolute at read time via resolveScanPath().
 *   Prevents Android path drift after app updates (FileSystem.documentDirectory
 *   base path can change on APK reinstall or data-partition remount).
 */

// expo-file-system legacy import — SDK 54 moved makeDirectoryAsync, deleteAsync etc.
// to a new File/Directory class API. Import from /legacy to keep the same call sites
// until a full migration to the new API is done.
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export function getScanDirectory(doctorId: string): string {
  return `${FileSystem.documentDirectory}${doctorId}/scans/`;
}

export async function ensureScanDirectory(doctorId: string): Promise<void> {
  // Always call makeDirectoryAsync — intermediates:true is idempotent (mkdir -p semantics)
  // and skipping getInfoAsync avoids iOS path-cache staleness that caused save failures.
  await FileSystem.makeDirectoryAsync(getScanDirectory(doctorId), { intermediates: true });
}

/**
 * Resolve a relative scan path to an absolute filesystem path.
 * Always call this at read time — never store the result in SQLite.
 * path stored relative — reconstruct at read time
 * prevents Android path drift after app updates (Rule KFM-3)
 */
export function resolveScanPath(relativePath: string): string {
  return (FileSystem.documentDirectory ?? '') + relativePath;
}

/**
 * Insert a new scan record into the scans table.
 * One row per scan — no overwrite possible (fixes CRITICAL-1 multi-scan overwrite).
 * Called inside db.withTransactionAsync() alongside enqueueOperation (PM REQ 3).
 *
 * @param params.localPath  Relative path only — use resolveScanPath() at read time.
 *                          Never pass an absolute path here (CRITICAL-2 / KFM-3).
 */
export async function insertVisitScan(
  db: SQLite.SQLiteDatabase,
  params: {
    id:           string;
    visitLocalId: string;
    doctorId:     string;
    localPath:    string;  // relative path — reconstruct at read time via resolveScanPath()
    label:        string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO scans
       (id, visit_local_id, doctor_id, local_path, label, ocr_status, created_at)
     VALUES (?, ?, ?, ?, ?, 'deferred', ?)`,
    [params.id, params.visitLocalId, params.doctorId, params.localPath, params.label, now],
  );
}

/**
 * Return all scans attached to a visit, ordered oldest-first.
 * Called by D6 on focus after returning from D7 so the thumbnail updates.
 */
export async function getScansForVisit(
  db: SQLite.SQLiteDatabase,
  visitLocalId: string,
): Promise<Array<{ id: string; localPath: string; label: string }>> {
  const rows = await db.getAllAsync<{ id: string; local_path: string; label: string }>(
    `SELECT id, local_path, label FROM scans WHERE visit_local_id = ? ORDER BY created_at ASC`,
    [visitLocalId],
  );
  return rows.map((r) => ({ id: r.id, localPath: r.local_path, label: r.label }));
}

/**
 * Delete a single scan record from SQLite.
 * Called by D6 handleRemoveScan so the DB stays in sync with UI state.
 * Note: does NOT delete the image file — orphan-file cleanup is a v2 startup task.
 */
export async function deleteScan(
  db: SQLite.SQLiteDatabase,
  scanId: string,
): Promise<void> {
  await db.runAsync(`DELETE FROM scans WHERE id = ?`, [scanId]);
}

/**
 * Return scans for a server-synced visit, ordered by creation time.
 * Used by D4 to resolve local_path when navigating to D8 (Full Scan View).
 *
 * The join via visits_draft is required because scans.visit_local_id references
 * the local draft visit ID, while D4 operates on server visit IDs. The positional
 * ordering (oldest-first) mirrors the scan record ordering in visit_records so D4
 * can match by index. This works reliably for v1 because scans are captured
 * sequentially (one D7 session at a time) and there is no concurrent multi-device
 * scan creation (S3 deferred to v2).
 *
 * Returns an empty array if no local scans exist (e.g. the visit was created by
 * another doctor on a different device — D8 shows an "image not available" alert).
 */
export async function getScansForServerVisit(
  db: SQLite.SQLiteDatabase,
  serverVisitId: string,
  doctorId: string,
): Promise<Array<{ id: string; localPath: string; label: string; createdAt: string }>> {
  const rows = await db.getAllAsync<{ id: string; local_path: string; label: string; created_at: string }>(
    `SELECT s.id, s.local_path, s.label, s.created_at
     FROM scans s
     INNER JOIN visits_draft vd ON s.visit_local_id = vd.local_id
     WHERE vd.server_id = ? AND s.doctor_id = ?
     ORDER BY s.created_at ASC`,
    [serverVisitId, doctorId],
  );
  return rows.map((r) => ({ id: r.id, localPath: r.local_path, label: r.label, createdAt: r.created_at }));
}

/**
 * Delete all scan records for the given doctor from SQLite.
 * Called during logout alongside clearDoctorScans() (filesystem cleanup) so both
 * the scans table rows and the image files are removed atomically per doctor.
 */
export async function clearDoctorScanRecords(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM scans WHERE doctor_id = ?`,
    [doctorId],
  );
}

/**
 * Delete all scan images for the given doctor from the device filesystem.
 * Called during logout to prevent cross-doctor image access on shared clinic devices.
 * PM REQ 1 — logout cleanup counterpart to the doctor-scoped write path.
 */
export async function clearDoctorScans(doctorId: string): Promise<void> {
  const dir = getScanDirectory(doctorId);
  await FileSystem.deleteAsync(dir, { idempotent: true });
}

/**
 * Write a scan_viewed audit event to the local audit_events table.
 * Called by D4 handleViewScan immediately before navigating to D8.
 *
 * DPDP Act 2023 §8 — security-spec.md lists "Image uploaded/downloaded" as auditable.
 * D8-SA-M1 fix: individual scan image access must be logged so patients can request
 * an access history that distinguishes visit-level views from scan-image opens.
 */
export async function logScanViewed(
  db: SQLite.SQLiteDatabase,
  params: {
    scanId:    string;
    visitId:   string;
    doctorId:  string;
    patientId: string;
    label:     string;
  },
): Promise<void> {
  const id  = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO audit_events
       (id, event_type, doctor_id, patient_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      'scan_viewed',
      params.doctorId,
      params.patientId,
      JSON.stringify({ scanId: params.scanId, visitId: params.visitId, label: params.label }),
      now,
    ],
  );
}

/**
 * Write a scan_created audit event to the local audit_events table.
 * Called by D7 immediately after insertVisitScan() inside withTransactionAsync().
 *
 * DPDP Act 2023 §8 — patients can request a log of who wrote data to their record.
 * scan_id, visit_id, and label are stored in metadata for event correlation.
 * Events are flushed to the server audit log via POST /sync on reconnect
 * (same pattern as logVisitCreated in src/db/visits.ts).
 */
export async function logScanCreated(
  db: SQLite.SQLiteDatabase,
  params: {
    scanId:    string;
    visitId:   string;
    doctorId:  string;
    patientId: string;
    label:     string;
  },
): Promise<void> {
  const id  = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO audit_events
       (id, event_type, doctor_id, patient_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      'scan_created',
      params.doctorId,
      params.patientId,
      JSON.stringify({ scanId: params.scanId, visitId: params.visitId, label: params.label }),
      now,
    ],
  );
}
