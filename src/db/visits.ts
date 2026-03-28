/**
 * SQLite queries for the visits cache — D3 Patient Detail offline support.
 * Spec: docs/data-models.md — Visit entity
 * Spec: docs/offline-sync-spec.md — SQLite as primary read path
 *
 * getCachedVisits reads from two tables:
 *   visits       — server-synced rows (written by upsertVisitsFromServer)
 *   visits_draft — locally-created rows (written by insertLocalVisit in D6)
 * Both are UNIONed so D3 shows a complete picture offline, including visits
 * saved in D6 that have not yet reached the server.  sync_status distinguishes
 * the two sources: 'synced' (server cache) | 'draft' (local only).
 *
 * Also contains logConsentAccess() — writes a DPDP audit event to the audit_events table
 * when D3 opens with consent granted. Will be refactored to src/db/auditLog.ts when D2's
 * audit trail (H-3 pre-merge blocker) is implemented, so the pattern is consistent.
 */

import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

export interface LocalVisit {
  server_id:           string;
  patient_server_id:   string;
  visit_date:          string;         // server-assigned UTC ISO
  chief_complaint:     string | null;  // null for other-doctor visits without consent
  clinic_name:         string;
  record_count:        number;
  is_own_visit:        boolean;        // true = current doctor created this visit
  cached_by_doctor_id: string;         // H-2: doctor who fetched and cached this row (security audit)
  synced_at:           string;         // when this row was last written from a server response
  sync_status:         'synced' | 'draft';  // 'synced' = server cache; 'draft' = D6 local-only
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
 *
 * M-5 fix: the visits_draft leg now includes an OR branch for offline-only patients
 * whose patient_server_id is NULL (they have not yet synced to the server).
 * Previously these patients returned zero draft rows in D3 after a D6 save.
 *
 * @param patientServerId  Server-assigned patient UUID, or null for offline-only patients.
 * @param patientLocalId   Device-local patient UUID — always available; used as fallback.
 * @param doctorId         Current doctor — scopes all reads to prevent cross-doctor leakage.
 */
export async function getCachedVisits(
  db: SQLite.SQLiteDatabase,
  patientServerId: string | null,
  patientLocalId: string,
  doctorId: string,
): Promise<CachedVisitsResult> {
  const rows = await db.getAllAsync<
    Omit<LocalVisit, 'is_own_visit' | 'record_count'> & {
      is_own_visit: number;
      record_count: number;
    }
  >(
    `SELECT
       server_id,
       patient_server_id,
       visit_date,
       chief_complaint,
       clinic_name,
       record_count,
       is_own_visit,
       cached_by_doctor_id,
       synced_at,
       'synced'             AS sync_status
     FROM visits
     WHERE patient_server_id = ? AND cached_by_doctor_id = ?
     UNION ALL
     SELECT
       local_id                        AS server_id,
       COALESCE(patient_server_id, '') AS patient_server_id,
       visit_date,
       chief_complaint,
       ''                              AS clinic_name,
       0                               AS record_count,
       1                               AS is_own_visit,
       doctor_id                       AS cached_by_doctor_id,
       created_at                      AS synced_at,
       'draft'                         AS sync_status
     FROM visits_draft
     WHERE doctor_id = ?
       AND (
         patient_server_id = ?
         OR (patient_server_id IS NULL AND patient_id = ?)
       )
     ORDER BY visit_date DESC`,
    [patientServerId, doctorId, doctorId, patientServerId, patientLocalId],
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
  doctorId: string,
): Promise<void> {
  const now = new Date().toISOString();
  for (const v of visits) {
    await db.runAsync(
      `INSERT INTO visits
         (server_id, patient_server_id, visit_date, chief_complaint,
          clinic_name, record_count, is_own_visit, cached_by_doctor_id, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(server_id) DO UPDATE SET
         chief_complaint     = excluded.chief_complaint,
         clinic_name         = excluded.clinic_name,
         record_count        = excluded.record_count,
         is_own_visit        = excluded.is_own_visit,
         cached_by_doctor_id = excluded.cached_by_doctor_id,
         synced_at           = excluded.synced_at`,
      [
        v.id,
        patientServerId,
        v.visit_date,
        v.chief_complaint,
        v.clinic_name,
        v.record_count,
        isOwnVisit ? 1 : 0,
        doctorId,
        now,
      ],
    );
  }
}

/**
 * Delete all cached visits for the given doctor from SQLite.
 * Called during logout to prevent cross-doctor data leakage on shared devices.
 * Requires the cached_by_doctor_id column added by the H-2 security fix.
 */
export async function clearDoctorVisits(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM visits WHERE cached_by_doctor_id = ?`,
    [doctorId],
  );
}

// ─────────────────────────────────────────────────────────────
// D6 — locally-created visits (visits_draft table)
// ─────────────────────────────────────────────────────────────

export interface NewLocalVisitParams {
  localId:         string;
  doctorId:        string;
  patientId:       string;  // local SQLite patient ID (patients.local_id)
  patientServerId: string | null;
  visitDate:       string;  // YYYY-MM-DD
  chiefComplaint:  string | null;
  noteText:        string | null;
  consentGranted:  boolean;
}

/**
 * Insert a locally-created visit into the visits_draft table.
 * Called by D6 BEFORE any server API call — SQLite is always the safety net.
 *
 * Every row is scoped to doctor_id + patient_id so it cannot be mis-attributed
 * across a logout/login cycle on a shared clinic device.
 */
export async function insertLocalVisit(
  db: SQLite.SQLiteDatabase,
  visit: NewLocalVisitParams,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO visits_draft
       (local_id, doctor_id, patient_id, patient_server_id, visit_date,
        chief_complaint, note_text, consent_granted, server_id, sync_status,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?)`,
    [
      visit.localId,
      visit.doctorId,
      visit.patientId,
      visit.patientServerId,
      visit.visitDate,
      visit.chiefComplaint,
      visit.noteText,
      visit.consentGranted ? 1 : 0,
      now,
      now,
    ],
  );
}

/**
 * Mark a locally-created draft visit as synced after a successful createVisit() response.
 * Sets sync_status = 'synced', records the server-assigned ID, and stamps updated_at.
 * Must be called immediately after createVisit() returns so the sync worker does not
 * find a 'pending' entry and re-POST the visit, creating a duplicate on the server.
 */
export async function markVisitSynced(
  db: SQLite.SQLiteDatabase,
  localId: string,
  serverId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE visits_draft
     SET sync_status = 'synced',
         server_id   = ?,
         updated_at  = ?
     WHERE local_id = ?`,
    [serverId, now, localId],
  );
}

/**
 * Count locally-created draft visits that have not yet synced to the server.
 * Called by useLogout before proceeding, so the doctor can be warned before
 * unsynced visits are permanently deleted from the device (M-6 pre-merge fix).
 *
 * Only counts sync_status = 'pending' rows — 'synced' and 'failed' rows are
 * either already on the server or have exceeded max_attempts and are dead-lettered.
 */
export async function countPendingDraftVisits(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM visits_draft
     WHERE doctor_id = ? AND sync_status = 'pending'`,
    [doctorId],
  );
  return result?.count ?? 0;
}

/**
 * Delete all draft visits for the given doctor from SQLite.
 * Called during logout to prevent cross-doctor data leakage on shared devices.
 * Must be added to the useLogout sequence alongside clearDoctorVisits().
 */
export async function clearDoctorDraftVisits(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM visits_draft WHERE doctor_id = ?`,
    [doctorId],
  );
}

/**
 * Attach a scan to an existing draft visit after "Use This" completes in D7.
 * Updates scan_local_path and scan_label on the visits_draft row.
 * Called inside db.withTransactionAsync() alongside enqueueOperation (PM REQ 3).
 */
export async function updateVisitScan(
  db: SQLite.SQLiteDatabase,
  visitLocalId: string,
  scanLocalPath: string,
  scanLabel: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE visits_draft
     SET scan_local_path = ?,
         scan_label      = ?,
         updated_at      = ?
     WHERE local_id = ?`,
    [scanLocalPath, scanLabel, now, visitLocalId],
  );
}

/**
 * Write a visit_created audit event to the local audit_events table.
 * Called by D6 immediately after insertLocalVisit() succeeds.
 *
 * DPDP Act 2023 §§ 5, 8 — clinical notes are personal health data; write
 * operations must be audited alongside read operations.
 * visitLocalId is stored in metadata so the event can be correlated to the
 * visits_draft row before a server ID is assigned.
 * Events are flushed to the server audit log via POST /sync on reconnect.
 */
export async function logVisitCreated(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
  patientId: string,
  visitLocalId: string,
): Promise<void> {
  const id  = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO audit_events
       (id, event_type, doctor_id, patient_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, 'visit_created', doctorId, patientId, JSON.stringify({ visitLocalId }), now],
  );
}

/**
 * Return locally-created visits that have not yet reached the server.
 *
 * Used by D3's online path to merge pending drafts with the server response.
 * createVisit() in D6 swallows server errors silently — the visit lives in
 * visits_draft (sync_status='pending') until the sync worker pushes it.
 * Without this merge, D3 shows an empty list when the online createVisit call
 * failed even though the visit is safely in SQLite. (BUG-D3-DT1-1 fix)
 *
 * Only 'pending' rows are returned — 'synced' rows are already in the server
 * response and 'failed' rows have exceeded max_attempts and are dead-lettered.
 */
export async function getPendingDraftVisits(
  db: SQLite.SQLiteDatabase,
  patientServerId: string | null,
  patientLocalId: string,
  doctorId: string,
): Promise<LocalVisit[]> {
  const rows = await db.getAllAsync<{
    local_id:          string;
    patient_server_id: string | null;
    visit_date:        string;
    chief_complaint:   string | null;
    created_at:        string;
  }>(
    `SELECT local_id, patient_server_id, visit_date, chief_complaint, created_at
     FROM visits_draft
     WHERE doctor_id = ?
       AND sync_status = 'pending'
       AND (
         patient_server_id = ?
         OR (patient_server_id IS NULL AND patient_id = ?)
       )
     ORDER BY visit_date DESC`,
    [doctorId, patientServerId, patientLocalId],
  );

  return rows.map((r) => ({
    server_id:           r.local_id,
    patient_server_id:   r.patient_server_id ?? '',
    visit_date:          r.visit_date,
    chief_complaint:     r.chief_complaint,
    clinic_name:         '',
    record_count:        0,
    is_own_visit:        true,
    cached_by_doctor_id: doctorId,
    synced_at:           r.created_at,
    sync_status:         'draft' as const,
  }));
}

/**
 * Return locally-created visits that were successfully synced to the server
 * (sync_status='synced') but whose server_id is NOT present in the current
 * server response.
 *
 * Used by D3's online path to cover the failure mode where POST /visits succeeded
 * and markVisitSynced() was called, but GET /patients/:id/visits does not yet
 * return the new visit — a server-side propagation delay. (BUG-D3-DT1-2 fix)
 *
 * Together with getPendingDraftVisits, this makes D3's online view complete:
 *   getPendingDraftVisits             → sync_status='pending'  (server call failed)
 *   getSyncedDraftVisitsNotInServer   → sync_status='synced', server_id absent from response
 *
 * @param serverIds  IDs from the current GET /patients/:id/visits my_visits response.
 *                   Rows already in this set are excluded to prevent duplicates.
 */
export async function getSyncedDraftVisitsNotInServer(
  db: SQLite.SQLiteDatabase,
  patientServerId: string | null,
  patientLocalId: string,
  doctorId: string,
  serverIds: string[],
): Promise<LocalVisit[]> {
  // Build NOT IN clause — if serverIds is empty, include all synced rows (no exclusion needed)
  const notInClause = serverIds.length > 0
    ? `AND (server_id IS NULL OR server_id NOT IN (${serverIds.map(() => '?').join(',')}))`
    : '';

  const rows = await db.getAllAsync<{
    local_id:          string;
    patient_server_id: string | null;
    visit_date:        string;
    chief_complaint:   string | null;
    created_at:        string;
    server_id:         string | null;
  }>(
    `SELECT local_id, patient_server_id, visit_date, chief_complaint, created_at, server_id
     FROM visits_draft
     WHERE doctor_id = ?
       AND sync_status = 'synced'
       AND (
         patient_server_id = ?
         OR (patient_server_id IS NULL AND patient_id = ?)
       )
       ${notInClause}
     ORDER BY visit_date DESC`,
    [doctorId, patientServerId, patientLocalId, ...serverIds],
  );

  return rows.map((r) => ({
    server_id:           r.server_id ?? r.local_id,
    patient_server_id:   r.patient_server_id ?? '',
    visit_date:          r.visit_date,
    chief_complaint:     r.chief_complaint,
    clinic_name:         '',
    record_count:        0,
    is_own_visit:        true,
    cached_by_doctor_id: doctorId,
    synced_at:           r.created_at,
    sync_status:         'draft' as const,
  }));
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
