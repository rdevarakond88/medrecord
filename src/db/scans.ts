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
