/**
 * Scan file-system helpers — D7 Document Scanner.
 *
 * Doctor-scoped image directory: <documentDirectory>/<doctorId>/scans/
 * PM REQ 1: images are isolated per doctor; cleared on logout.
 * DPDP Act 2023 §5 — personal health images stored only for the treating doctor.
 */

import * as FileSystem from 'expo-file-system';

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
 * Delete all scan images for the given doctor from the device filesystem.
 * Called during logout to prevent cross-doctor image access on shared clinic devices.
 * PM REQ 1 — logout cleanup counterpart to the doctor-scoped write path.
 */
export async function clearDoctorScans(doctorId: string): Promise<void> {
  const dir = getScanDirectory(doctorId);
  await FileSystem.deleteAsync(dir, { idempotent: true });
}
