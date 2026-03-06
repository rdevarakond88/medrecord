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

import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

export function getScanDirectory(doctorId: string): string {
  return `${FileSystem.documentDirectory}${doctorId}/scans/`;
}

export async function ensureScanDirectory(doctorId: string): Promise<void> {
  const dir  = getScanDirectory(doctorId);
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
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
