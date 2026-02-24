/**
 * SQLite queries for the visits cache — D3 Patient Detail offline support.
 * Spec: docs/data-models.md — Visit entity
 * Spec: docs/offline-sync-spec.md — SQLite as primary read path
 *
 * All rows in this cache originate from GET /patients/:serverId/visits server responses.
 * Locally-created draft visits (D6) will use a separate visits_draft table when D6 is built.
 *
 * Also contains logConsentAccess() — writes a DPDP audit event to the audit_events table
 * when D3 opens with consent granted. Will be refactored to src/db/auditLog.ts when D2's
 * audit trail (H-3 pre-merge blocker) is implemented, so the pattern is consistent.
 */

import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export interface LocalVisit {
  server_id:         string;
  patient_server_id: string;
  visit_date:        string;         // server-assigned UTC ISO
  chief_complaint:   string | null;  // null for other-doctor visits without consent
  clinic_name:       string;
  record_count:      number;
  is_own_visit:      boolean;        // true = current doctor created this visit
  synced_at:         string;         // when this row was last written from a server response
}

export interface CachedVisitsResult {
  myVisits:    LocalVisit[];
  otherVisits: LocalVisit[];
  lastSyncAt:  string | null;  // latest synced_at across all cached visits — surfaced in offline banner
}

/**
 * Read all cached visits for a patient from SQLite, split by ownership.
 * Called when the device is offline and the server cannot be reached.
 *
 * Returns visits ordered newest-first within each list.
 * The caller (D3 screen) applies consent-based display gating — otherVisits are
 * grayed when the locally-cached consentGranted flag is false.
 */
export async function getCachedVisits(
  db: SQLite.SQLiteDatabase,
  patientServerId: string,
): Promise<CachedVisitsResult> {
  const rows = await db.getAllAsync<
    Omit<LocalVisit, 'is_own_visit' | 'record_count'> & {
      is_own_visit: number;
      record_count: number;
    }
  >(
    `SELECT * FROM visits
     WHERE patient_server_id = ?
     ORDER BY visit_date DESC`,
    [patientServerId],
  );

  // SQLite stores booleans as integers — normalise to JS
  const visits: LocalVisit[] = rows.map((r) => ({
    ...r,
    is_own_visit: r.is_own_visit === 1,
    record_count: Number(r.record_count),
  }));

  const myVisits    = visits.filter((v) => v.is_own_visit);
  const otherVisits = visits.filter((v) => !v.is_own_visit);

  // Latest synced_at — shown in offline banner so the doctor knows how fresh the data is
  const lastSyncAt =
    visits
      .map((v) => v.synced_at)
      .sort()
      .reverse()[0] ?? null;

  return { myVisits, otherVisits, lastSyncAt };
}

/**
 * Upsert visits from a server API response into the local cache.
 * Called after a successful getPatientVisits() response for both visit lists.
 *
 * Uses ON CONFLICT so repeated calls (e.g., on every D3 focus) are idempotent.
 * chief_complaint arriving as null for other-doctor visits is correct — the server
 * excludes it at the query layer when consent was not granted.
 *
 * @param isOwnVisit  true for my_visits list, false for other_doctor_visits list
 */
export async function upsertVisitsFromServer(
  db: SQLite.SQLiteDatabase,
  visits: Array<{
    id:              string;   // server visit ID — used as server_id (primary key)
    visit_date:      string;
    chief_complaint: string | null;
    clinic_name:     string;
    record_count:    number;
  }>,
  isOwnVisit: boolean,
  patientServerId: string,
): Promise<void> {
  const now = new Date().toISOString();
  for (const v of visits) {
    await db.runAsync(
      `INSERT INTO visits
         (server_id, patient_server_id, visit_date, chief_complaint,
          clinic_name, record_count, is_own_visit, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(server_id) DO UPDATE SET
         chief_complaint = excluded.chief_complaint,
         clinic_name     = excluded.clinic_name,
         record_count    = excluded.record_count,
         is_own_visit    = excluded.is_own_visit,
         synced_at       = excluded.synced_at`,
      [
        v.id,
        patientServerId,
        v.visit_date,
        v.chief_complaint,
        v.clinic_name,
        v.record_count,
        isOwnVisit ? 1 : 0,
        now,
      ],
    );
  }
}

/**
 * Write a consent_accessed audit event to the local audit_events table.
 * Called by D3 on mount when visit history is displayed with consent granted.
 *
 * DPDP Act 2023 §8 — patients can request a log of who accessed their data.
 * Events are flushed to the server audit log via POST /sync on reconnect
 * (tracked as H-3 pre-merge blocker, same pattern as D2 offline access audit).
 */
export async function logConsentAccess(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
  patientId: string,
): Promise<void> {
  const id  = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO audit_events
       (id, event_type, doctor_id, patient_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, 'consent_accessed', doctorId, patientId, now],
  );
}
