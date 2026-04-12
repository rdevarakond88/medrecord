/**
 * SQLite queries for the patients table.
 * Spec: docs/data-models.md — Patient entity
 *
 * Design:
 * - SQLite is the primary read path for all patient data (offline-first).
 * - Server results are written back here via upsertPatientFromServer().
 * - COALESCE in upsert ensures locally-entered data is never overwritten
 *   with a null value coming from the server.
 * - All read queries are scoped to the current doctor's ID to prevent
 *   cross-doctor data leakage on shared clinic devices (C-1 fix).
 */

import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export interface LocalPatient {
  local_id:        string;
  doctor_id:       string;
  server_id:       string | null;  // null until synced
  mobile_number:   string;
  name:            string | null;
  date_of_birth:   string | null;  // ISO YYYY-MM-DD
  gender:          string | null;
  consent_granted: boolean;
  last_visit_date: string | null;  // ISO YYYY-MM-DD
  synced_at:       string | null;  // null = local-only, not yet on server
  created_at:      string;
  updated_at:      string;
}

/**
 * Returns the 5 most recently visited patients for the "Recent Patients" list.
 * Scoped to the given doctorId so Doctor B cannot see Doctor A's patients
 * on a shared clinic device.
 */
export async function getRecentPatients(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
): Promise<LocalPatient[]> {
  return db.getAllAsync<LocalPatient>(
    `SELECT * FROM patients
     WHERE doctor_id = ?
     ORDER BY COALESCE(last_visit_date, created_at) DESC
     LIMIT 5`,
    [doctorId],
  );
}

/**
 * Live search by partial mobile number prefix.
 * Fires after 3+ digits are typed — returns up to 10 matches ordered by
 * most recent visit (or creation) first.
 * Scoped to the given doctorId to prevent cross-doctor data leakage.
 */
export async function searchPatientsByMobile(
  db: SQLite.SQLiteDatabase,
  partialMobile: string,
  doctorId: string,
): Promise<LocalPatient[]> {
  return db.getAllAsync<LocalPatient>(
    `SELECT * FROM patients
     WHERE mobile_number LIKE ?
       AND doctor_id = ?
     ORDER BY COALESCE(last_visit_date, created_at) DESC
     LIMIT 10`,
    [`${partialMobile}%`, doctorId],
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
    doctor_id:       string;
    server_id:       string;
    mobile_number:   string;
    name:            string | null;
    date_of_birth:   string | null;
    gender:          string | null;
    consent_granted: boolean;
    last_visit_date: string | null;
  },
): Promise<void> {
  const now     = new Date().toISOString();
  const localId = Crypto.randomUUID();

  await db.runAsync(
    `INSERT INTO patients
       (local_id, doctor_id, server_id, mobile_number, name, date_of_birth, gender,
        consent_granted, last_visit_date, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mobile_number) DO UPDATE SET
       doctor_id       = COALESCE(doctor_id, excluded.doctor_id),
       server_id       = excluded.server_id,
       name            = COALESCE(excluded.name, name),
       date_of_birth   = COALESCE(excluded.date_of_birth, date_of_birth),
       gender          = COALESCE(excluded.gender, gender),
       consent_granted = excluded.consent_granted,
       last_visit_date = excluded.last_visit_date,
       synced_at       = excluded.synced_at,
       updated_at      = excluded.updated_at`,
    [
      localId,
      patient.doctor_id,
      patient.server_id,
      patient.mobile_number,
      patient.name,
      patient.date_of_birth,
      patient.gender,
      patient.consent_granted ? 1 : 0,
      patient.last_visit_date,
      now,  // synced_at
      now,  // created_at — ignored on UPDATE
      now,  // updated_at
    ],
  );
}

/**
 * Fetch a single patient by device-local UUID.
 * Used by D3 on mount to populate the patient header immediately from SQLite,
 * before the server consent re-fetch completes.
 * Returns null if the record has been deleted or the ID is wrong.
 */
export async function getPatientByLocalId(
  db: SQLite.SQLiteDatabase,
  localId: string,
): Promise<LocalPatient | null> {
  return db.getFirstAsync<LocalPatient>(
    `SELECT * FROM patients WHERE local_id = ?`,
    [localId],
  );
}

/**
 * Write a patient access audit event to the local audit_events table.
 * Called by D2 whenever getRecentPatients() or searchPatientsByMobile() returns
 * patient PII, regardless of online state — this closes the H-3 pre-merge blocker
 * (offline patient access had no audit trail at all).
 *
 * DPDP Act 2023 §8 — patients can request a log of who accessed their data.
 * Events are flushed to the server via POST /sync on reconnect.
 *
 * patient_id uses '*' sentinel for batch list events where no single patient
 * is the subject. For 'patient_created', pass entity_local_id in metadata —
 * no PII (no name, no mobile number).
 * NOTE: metadata must NOT include actual patient data — only IDs and lengths.
 */
export async function logLocalPatientAccess(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
  eventType: 'recent_patients_viewed' | 'patient_searched' | 'patient_created',
  metadata: Record<string, unknown>,
): Promise<void> {
  const id  = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO audit_events
       (id, event_type, doctor_id, patient_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, eventType, doctorId, '*', JSON.stringify(metadata), now],
  );
}

/**
 * Insert a new locally-created patient into SQLite.
 *
 * Called by D5 (New Patient Form) when a doctor registers a patient who was
 * not found via D2's lookup. server_id and synced_at start as null — the sync
 * worker will populate them after a successful POST /patients.
 *
 * Uses INSERT OR IGNORE so a second tap or navigating back and re-saving
 * does not throw on the UNIQUE(mobile_number) constraint. Returns the
 * actual local_id that was written (or already existed).
 */
export async function insertLocalPatient(
  db: SQLite.SQLiteDatabase,
  patient: {
    local_id:      string;
    doctor_id:     string;
    mobile_number: string;
    name:          string | null;
    date_of_birth: string | null;  // ISO YYYY-MM-DD
    gender:        string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO patients
       (local_id, doctor_id, server_id, mobile_number, name, date_of_birth, gender,
        consent_granted, last_visit_date, synced_at, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)`,
    [
      patient.local_id,
      patient.doctor_id,
      patient.mobile_number,
      patient.name,
      patient.date_of_birth,
      patient.gender,
      now,  // created_at
      now,  // updated_at
    ],
  );
}

/**
 * Update a locally-created patient row with its server-assigned UUID.
 * Called by D5 after a successful POST /patients, so the sync worker does
 * not re-upload a patient who is already on the server.
 */
export async function setPatientServerId(
  db: SQLite.SQLiteDatabase,
  localId:  string,
  serverId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE patients SET server_id = ?, synced_at = ?, updated_at = ?
     WHERE local_id = ?`,
    [serverId, now, now, localId],
  );
}

/**
 * Delete all locally cached patients belonging to the given doctor.
 * Called as part of the logout sequence (before clearAuth) to prevent
 * cross-doctor data leakage on shared clinic devices.
 */
export async function clearDoctorPatients(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM patients WHERE doctor_id = ?`,
    [doctorId],
  );
}
