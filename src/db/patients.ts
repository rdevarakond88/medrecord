/**
 * SQLite queries for the patients table.
 * Spec: docs/data-models.md — Patient entity
 *
 * Design:
 * - SQLite is the primary read path for all patient data (offline-first).
 * - Server results are written back here via upsertPatientFromServer().
 * - COALESCE in upsert ensures locally-entered data is never overwritten
 *   with a null value coming from the server.
 */

import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export interface LocalPatient {
  local_id:        string;
  server_id:       string | null;  // null until synced
  mobile_number:   string;
  name:            string | null;
  date_of_birth:   string | null;  // ISO YYYY-MM-DD
  gender:          string | null;
  last_visit_date: string | null;  // ISO YYYY-MM-DD
  synced_at:       string | null;  // null = local-only, not yet on server
  created_at:      string;
  updated_at:      string;
}

/**
 * Returns the 5 most recently visited patients for the "Recent Patients" list.
 * Ordered by last_visit_date DESC; patients with no visit yet fall back to
 * created_at so freshly-added offline patients appear in the list.
 */
export async function getRecentPatients(
  db: SQLite.SQLiteDatabase,
): Promise<LocalPatient[]> {
  return db.getAllAsync<LocalPatient>(
    `SELECT * FROM patients
     ORDER BY COALESCE(last_visit_date, created_at) DESC
     LIMIT 5`,
  );
}

/**
 * Live search by partial mobile number prefix.
 * Fires after 3+ digits are typed — returns up to 10 matches ordered by
 * most recent visit (or creation) first.
 */
export async function searchPatientsByMobile(
  db: SQLite.SQLiteDatabase,
  partialMobile: string,
): Promise<LocalPatient[]> {
  return db.getAllAsync<LocalPatient>(
    `SELECT * FROM patients
     WHERE mobile_number LIKE ?
     ORDER BY COALESCE(last_visit_date, created_at) DESC
     LIMIT 10`,
    [`${partialMobile}%`],
  );
}

/**
 * Insert or update a patient row from a server API response.
 *
 * On INSERT: generates a fresh local_id (server-side patient being seen
 * for the first time on this device).
 *
 * On UPDATE (mobile collision): merges server fields while preserving any
 * non-null local values — e.g. if the doctor entered a name offline that
 * hasn't synced yet, we don't clobber it with a server null.
 *
 * Called after a successful GET /patients/lookup response.
 */
export async function upsertPatientFromServer(
  db: SQLite.SQLiteDatabase,
  patient: {
    server_id:       string;
    mobile_number:   string;
    name:            string | null;
    date_of_birth:   string | null;
    gender:          string | null;
    last_visit_date: string | null;
  },
): Promise<void> {
  const now     = new Date().toISOString();
  const localId = Crypto.randomUUID();

  await db.runAsync(
    `INSERT INTO patients
       (local_id, server_id, mobile_number, name, date_of_birth, gender,
        last_visit_date, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mobile_number) DO UPDATE SET
       server_id       = excluded.server_id,
       name            = COALESCE(excluded.name, name),
       date_of_birth   = COALESCE(excluded.date_of_birth, date_of_birth),
       gender          = COALESCE(excluded.gender, gender),
       last_visit_date = excluded.last_visit_date,
       synced_at       = excluded.synced_at,
       updated_at      = excluded.updated_at`,
    [
      localId,
      patient.server_id,
      patient.mobile_number,
      patient.name,
      patient.date_of_birth,
      patient.gender,
      patient.last_visit_date,
      now,  // synced_at
      now,  // created_at — ignored on UPDATE
      now,  // updated_at
    ],
  );
}
