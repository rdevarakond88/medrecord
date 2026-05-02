/**
 * syncWorker.ts — Background sync drain loop.
 * Spec: docs/offline-sync-spec.md — Sync Queue Behaviour
 * Spec: reviews/sync-worker-pm-preflow.md — BUILDER AGENT SPEC
 *
 * Drains sync_queue in queued_at ASC order, up to BATCH_SIZE entries per
 * POST /sync call. Repeats until no pending entries remain.
 * After all batches succeed, flushes unsynced audit_events.
 *
 * Concurrency:     module-level isSyncing flag — one drain run at a time.
 * Startup cleanup: in_progress entries reset to pending once per app session.
 * JWT 401:         reads refresh token from expo-secure-store, retries once.
 *                  If refresh fails: abort run, leave entries as pending.
 *                  Never navigates — navigation belongs to the UI layer.
 * Record entries:  set to status='deferred' (S3 image upload is v2 — locked).
 *
 * Called by: useSyncWorker (AppState, NetInfo, 5-min interval triggers).
 * Updates:   useSyncStore (isSyncing, lastSyncAt, failedCount).
 */

import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';

import { useAuthStore } from '../store/useAuthStore';
import { useSyncStore } from '../store/useSyncStore';
import { markVisitSynced } from '../db/visits';
import { markRecordSynced } from '../db/records';
import { apiFetch, ApiError, API_BASE_URL } from '../api/apiClient';
import { pinnedFetch } from '../api/pinnedFetch';
import { REFRESH_TOKEN_KEY } from '../auth/constants';
import { syncLog } from './syncLogger';

// ─── Constants ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 20;  // max operations per POST /sync call (PM spec)

// ─── Module-level state ────────────────────────────────────────────────────

/** Concurrency guard — prevents overlapping drain runs. */
let isSyncing = false;

/**
 * One-shot per app session: reset any 'in_progress' entries left from a process
 * that was killed mid-sync. The flag is false on module load (app start), so
 * the first call to runSyncWorker performs the reset, subsequent calls skip it.
 */
let hasResetInProgress = false;

// ─── Types ─────────────────────────────────────────────────────────────────

interface SyncQueueRow {
  id:              string;
  entity_type:     string;
  entity_local_id: string;
  doctor_id:       string;
  operation:       string;
  payload:         string;   // JSON string
  queued_at:       string;
  attempts:        number;
  max_attempts:    number;
}

interface SyncBatchOperation {
  operation:   string;
  entity_type: string;
  local_id:    string;
  payload:     object;
  queued_at:   string;
}

interface SyncResult {
  local_id:   string;
  status:     'success' | 'conflict' | 'error';  // 'error' = server rejected this operation
  server_id?: string;
  message?:   string;
}

interface SyncBatchResponse {
  results: SyncResult[];
}

interface RefreshResponse {
  access_token:  string;
  refresh_token?: string;  // SW-H-2: server rotates refresh token — store it back
  expires_in:    number;
}

interface AuditEventRow {
  id:         string;
  event_type: string;
  doctor_id:  string;
  patient_id: string;
  metadata:   string | null;
  created_at: string;
}

// ─── Token refresh ─────────────────────────────────────────────────────────

/**
 * Attempt to refresh the JWT access token using the stored refresh token.
 * Returns the new access token on success, null on failure.
 * Never throws — failure is treated as "abort run, leave pending".
 */
async function tryRefreshToken(): Promise<string | null> {
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    const response = await pinnedFetch(`${API_BASE_URL}/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return null;

    const body = await response.json() as RefreshResponse;
    const newToken = body.access_token;
    if (!newToken) return null;

    // Update the in-memory auth store so all subsequent API calls use the
    // new token. setAuth requires a user object — read the existing one.
    const { user } = useAuthStore.getState();
    if (user) {
      useAuthStore.getState().setAuth(newToken, user);
    }

    // SW-H-2: Write the new refresh token back to SecureStore if the server
    // rotated it. Without this the next refresh attempt reads an invalidated
    // token and gets 401, silently stalling all future sync runs.
    if (body.refresh_token) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, body.refresh_token);
    }

    return newToken;
  } catch {
    return null;
  }
}

// ─── Per-batch POST /sync ──────────────────────────────────────────────────

/**
 * Send one batch to POST /sync with the provided token.
 * Returns the results array on success.
 * Throws ApiError on HTTP errors.
 */
async function postSyncBatch(
  token: string,
  operations: SyncBatchOperation[],
): Promise<SyncResult[]> {
  const response = await apiFetch<SyncBatchResponse>('/sync', token, {
    method: 'POST',
    body:   JSON.stringify({ operations }),
  });
  return response.results;
}

// ─── Per-result processing ─────────────────────────────────────────────────

/**
 * Apply a single sync result to local SQLite.
 * Both 'success' and 'conflict' are treated as successful — the server has
 * the data; update the local ID mapping and entity-specific state.
 */
async function applyResult(
  db: SQLite.SQLiteDatabase,
  result: SyncResult,
  entityType: string,
  queueRowId: string,
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Write local_id → server_id mapping (idempotent via OR REPLACE)
  await db.runAsync(
    `INSERT OR REPLACE INTO id_mapping (local_id, server_id, entity_type, mapped_at)
     VALUES (?, ?, ?, ?)`,
    [result.local_id, result.server_id, entityType, now],
  );

  // 2. Entity-specific post-sync updates
  if (entityType === 'visit') {
    // Update visits_draft: set sync_status='synced' and record server_id.
    // markVisitSynced is idempotent — safe to call even if previously synced.
    await markVisitSynced(db, result.local_id, result.server_id);
  } else if (entityType === 'patient') {
    // Update patients cache: record server-assigned ID and sync timestamp.
    await db.runAsync(
      `UPDATE patients SET server_id = ?, synced_at = ? WHERE local_id = ?`,
      [result.server_id, now, result.local_id],
    );
    // Cascade: update visits_draft for visits created before this patient had a
    // server ID. fixOrphanVisitPayloads() will pick these up on the next sync
    // trigger and fix their sync_queue payloads (BUG-D4-DT1-1).
    if (result.server_id) {
      await db.runAsync(
        `UPDATE visits_draft SET patient_server_id = ?, updated_at = ?
         WHERE patient_id = ? AND patient_server_id IS NULL`,
        [result.server_id, now, result.local_id],
      );
    }
  } else if (entityType === 'record' && result.server_id) {
    // Update visit_records: replace local UUID with server-assigned ID.
    // markRecordSynced is idempotent — safe to call multiple times.
    await markRecordSynced(db, result.local_id, result.server_id);
  }
  // consent: no additional local state to update beyond id_mapping + queue status.

  // 3. Mark sync_queue entry as done
  await db.runAsync(
    `UPDATE sync_queue SET status = 'success' WHERE id = ?`,
    [queueRowId],
  );
}

// ─── Audit events flush ────────────────────────────────────────────────────

/**
 * Flush all unsynced audit events to the server via POST /sync.
 * Called once per drain run, after all sync_queue batches have succeeded.
 *
 * DPDP Act 2023 — audit trail must reach the server for compliance.
 * On failure the rows remain with synced_at IS NULL and will be retried
 * on the next run. Audit flush failures never abort or retry the main run.
 */
async function flushAuditEvents(
  db: SQLite.SQLiteDatabase,
  token: string,
  doctorId: string,  // SW-H-3: scope to the authenticated doctor only
): Promise<void> {
  const rows = await db.getAllAsync<AuditEventRow>(
    `SELECT id, event_type, doctor_id, patient_id, metadata, created_at
     FROM audit_events
     WHERE synced_at IS NULL AND doctor_id = ?
     ORDER BY created_at ASC
     LIMIT 100`,
    [doctorId],
  );

  if (rows.length === 0) return;

  const operations: SyncBatchOperation[] = rows.map((row) => ({
    operation:   'create',
    entity_type: 'audit_event',
    local_id:    row.id,
    payload: {
      event_type: row.event_type,
      doctor_id:  row.doctor_id,
      patient_id: row.patient_id,
      metadata:   row.metadata ? JSON.parse(row.metadata) : null,
      created_at: row.created_at,
    },
    queued_at: row.created_at,
  }));

  try {
    await apiFetch('/sync', token, {
      method: 'POST',
      body:   JSON.stringify({ operations }),
    });
    // Mark all flushed rows as synced
    const now = new Date().toISOString();
    const ids  = rows.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE audit_events SET synced_at = ? WHERE id IN (${ids})`,
      [now, ...rows.map((r) => r.id)],
    );
  } catch {
    // Audit flush failure is non-fatal — rows remain unsynced and retry next run.
  }
}

// ─── Orphan visit payload fix ──────────────────────────────────────────────

/**
 * Recover visit sync_queue entries that were enqueued with patient_id: null.
 *
 * When createPatient() in D5 fails at form submission (timeout, 5xx, offline),
 * D6 enqueues the new visit with patient_id: null because the patient's server
 * ID is not yet known. The server rejects such entries — after max_attempts the
 * entry is dead-lettered. This function runs once per sync invocation and looks
 * for any such entries whose patient has since synced to the server.
 *
 * When a patient syncs, applyResult() cascades visits_draft.patient_server_id.
 * This function uses that cascade (with a patients table fallback) to resolve
 * the correct patient_id, patches the payload, and resets the entry to pending
 * with attempts=0 so the drain loop can retry it (BUG-D4-DT1-1 fix).
 */
async function fixOrphanVisitPayloads(
  db: SQLite.SQLiteDatabase,
  doctorId: string,
): Promise<void> {
  const entries = await db.getAllAsync<{
    id:              string;
    entity_local_id: string;
    payload:         string;
  }>(
    `SELECT id, entity_local_id, payload FROM sync_queue
     WHERE entity_type = 'visit'
       AND status IN ('pending', 'failed')
       AND doctor_id = ?`,
    [doctorId],
  );

  for (const entry of entries) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(entry.payload) as Record<string, unknown>;
    } catch {
      continue; // malformed payload — leave as-is
    }

    if (payload.patient_id !== null && payload.patient_id !== undefined) continue;

    // Look up the patient's server ID via visits_draft → patients.
    const draftVisit = await db.getFirstAsync<{
      patient_id:        string;
      patient_server_id: string | null;
    }>(
      `SELECT patient_id, patient_server_id FROM visits_draft WHERE local_id = ?`,
      [entry.entity_local_id],
    );

    if (!draftVisit) continue;

    // Prefer the cascade-updated visits_draft column; fall back to patients table.
    let serverPatientId: string | null = draftVisit.patient_server_id;
    if (!serverPatientId) {
      const patient = await db.getFirstAsync<{ server_id: string | null }>(
        `SELECT server_id FROM patients WHERE local_id = ?`,
        [draftVisit.patient_id],
      );
      serverPatientId = patient?.server_id ?? null;
    }

    if (!serverPatientId) continue; // patient still not synced — nothing to fix yet

    const now = new Date().toISOString();
    payload.patient_id = serverPatientId;

    // Reset the entry: correct patient_id, fresh attempt budget.
    await db.runAsync(
      `UPDATE sync_queue
       SET payload         = ?,
           status          = 'pending',
           attempts        = 0,
           error_message   = NULL,
           last_attempt_at = ?
       WHERE id = ?`,
      [JSON.stringify(payload), now, entry.id],
    );

    // Keep visits_draft consistent — update patient_server_id and sync_status.
    await db.runAsync(
      `UPDATE visits_draft
       SET patient_server_id = ?,
           sync_status       = CASE WHEN sync_status = 'failed' THEN 'pending' ELSE sync_status END,
           updated_at        = ?
       WHERE local_id = ? AND patient_server_id IS NULL`,
      [serverPatientId, now, entry.entity_local_id],
    );

    syncLog(`pre-drain fix: visit ${entry.entity_local_id} — patient_id resolved to ${serverPatientId}, reset to pending`);
  }
}

// ─── Main drain loop ───────────────────────────────────────────────────────

/**
 * Drain the sync_queue for the current doctor.
 *
 * Safe to call concurrently — the module-level isSyncing guard ensures only
 * one run executes at a time. Extra calls return immediately.
 *
 * @param db  SQLiteDatabase from useSQLiteContext() — passed by the hook so
 *            this function can be called outside a React component.
 *
 * doctorId is read directly from useAuthStore at call time (not passed as a
 * parameter) to avoid the stale-ref bug where useSyncWorker captures the
 * doctor ID once at mount — before the user logs in on a fresh session.
 */
export async function runSyncWorker(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  // ── Token + doctor guard ───────────────────────────────────────────────
  // Read both from auth store at call time so fresh-login sessions get the
  // correct doctor ID even though useSyncWorker mounted before login completed.
  const { token, user } = useAuthStore.getState();
  syncLog(`runSyncWorker called — hasToken:${!!token} hasUser:${!!user}`);
  if (!token || !user) {
    syncLog('ABORT — no token or user in auth store');
    return;
  }
  const doctorId = user.id;
  syncLog(`doctorId:${doctorId}`);

  // ── Concurrency guard ──────────────────────────────────────────────────
  if (isSyncing) {
    syncLog('SKIP — already syncing');
    return;
  }
  isSyncing = true;
  useSyncStore.getState().setSyncing(true);

  let currentToken = token;

  try {
    // ── Startup cleanup (once per session) ──────────────────────────────
    // If the app was killed while a batch was in flight, entries may be
    // stuck as 'in_progress'. Reset them so this run can pick them up.
    if (!hasResetInProgress) {
      hasResetInProgress = true;
      // SW-H-1: scope the in_progress reset to this doctor only — avoids
      // touching crash-interrupted entries that belong to another doctor.
      await db.runAsync(
        `UPDATE sync_queue SET status = 'pending'
         WHERE status = 'in_progress' AND doctor_id = ?`,
        [doctorId],
      );
    }

    // ── Pre-drain: recover visits with null patient_id ───────────────────
    // Fixes visit entries dead-lettered because createPatient() failed in D5.
    // Safe to call every run — no-op when there are no orphan entries.
    await fixOrphanVisitPayloads(db, doctorId);

    // ── Batch drain loop ─────────────────────────────────────────────────
    while (true) {
      // Fetch the next batch of pending entries in strict queued_at order.
      // Re-read token in case it was refreshed during a previous batch.
      currentToken = useAuthStore.getState().token ?? currentToken;

      // SW-H-1: scope drain reads to the authenticated doctor — defense-in-depth
      // against stale entries from a previous session surviving logout.
      const rows = await db.getAllAsync<SyncQueueRow>(
        `SELECT id, entity_type, entity_local_id, doctor_id, operation,
                payload, queued_at, attempts, max_attempts
         FROM sync_queue
         WHERE status = 'pending' AND doctor_id = ?
         ORDER BY queued_at ASC
         LIMIT ?`,
        [doctorId, BATCH_SIZE],
      );

      syncLog(`drain: ${rows.length} pending rows for doctorId:${doctorId}`);
      if (rows.length === 0) break;

      // ── Defer scan record entries — S3 upload is v2 (locked) ─────────
      // Note records (payload.type === 'note') are synced via POST /sync.
      // Scan records require S3 image upload and remain deferred until v2.
      function isScanRecord(r: SyncQueueRow): boolean {
        try {
          const payload = JSON.parse(r.payload) as { type?: string };
          return r.entity_type === 'record' && payload.type !== 'note';
        } catch {
          return r.entity_type === 'record';  // malformed payload — defer to be safe
        }
      }

      const scanRows = rows.filter(isScanRecord);
      const syncRows = rows.filter((r) => !isScanRecord(r));

      if (scanRows.length > 0) {
        const deferredIds = scanRows.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE sync_queue
           SET status        = 'deferred',
               error_message = 'S3 image upload deferred to v2'
           WHERE id IN (${deferredIds})`,
          scanRows.map((r) => r.id),
        );
      }

      // Nothing left to sync in this batch after deferring scan entries.
      if (syncRows.length === 0) continue;

      // Mark batch as in_progress so a crash mid-batch is detectable.
      const batchIds = syncRows.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE sync_queue SET status = 'in_progress'
         WHERE id IN (${batchIds})`,
        syncRows.map((r) => r.id),
      );

      // Build the POST /sync operations array.
      const operations: SyncBatchOperation[] = syncRows.map((row) => ({
        operation:   row.operation,
        entity_type: row.entity_type,
        local_id:    row.entity_local_id,
        payload:     JSON.parse(row.payload) as object,
        queued_at:   row.queued_at,
      }));

      // ── POST /sync — with one JWT refresh retry on 401 ────────────────
      let results: SyncResult[];

      syncLog(`POST /sync — ${operations.length} ops: ${operations.map(o => o.entity_type).join(',')}`);
      try {
        results = await postSyncBatch(currentToken, operations);
        syncLog(`POST /sync OK — ${results.length} results: ${results.map(r => r.status).join(',')}`);
      } catch (err) {
        const isApiErr  = err instanceof ApiError;
        const apiStatus = isApiErr ? (err as ApiError).status : 0;

        // [ERR] prefix makes error lines visually distinct in the SyncDebugPanel.
        if (isApiErr) {
          syncLog(`[ERR] POST /sync HTTP ${apiStatus}: ${(err as ApiError).message} (${(err as ApiError).code})`);
        } else {
          syncLog(`[ERR] POST /sync network: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
        }

        if (isApiErr && apiStatus === 401) {
          // Session expired: attempt token refresh (D7-QA-H4 requirement).
          const newToken = await tryRefreshToken();
          if (!newToken) {
            // Refresh failed — reset in_progress entries and abort this run.
            await db.runAsync(
              `UPDATE sync_queue SET status = 'pending'
               WHERE id IN (${batchIds})`,
              syncRows.map((r) => r.id),
            );
            return;
          }
          currentToken = newToken;
          // Retry once with the refreshed token.
          try {
            results = await postSyncBatch(currentToken, operations);
          } catch {
            // Retry also failed — reset in_progress and abort.
            await db.runAsync(
              `UPDATE sync_queue SET status = 'pending'
               WHERE id IN (${batchIds})`,
              syncRows.map((r) => r.id),
            );
            return;
          }
        } else if (isApiErr && apiStatus >= 400 && apiStatus < 500) {
          // Permanent 4xx (non-401): the server rejected the payload (bad request,
          // forbidden, validation failure). Increment attempts and dead-letter after
          // max_attempts — these will not succeed on retry without code changes.
          const now        = new Date().toISOString();
          const errMessage = `HTTP ${apiStatus}: ${(err as ApiError).message}`;
          for (const row of syncRows) {
            const newAttempts = row.attempts + 1;
            if (newAttempts >= row.max_attempts) {
              await db.runAsync(
                `UPDATE sync_queue
                 SET status          = 'failed',
                     attempts        = ?,
                     last_attempt_at = ?,
                     error_message   = ?
                 WHERE id = ?`,
                [newAttempts, now, errMessage, row.id],
              );
              // Mirror 'failed' to visits_draft so D3's getFailedDraftVisits() surfaces
              // it and countUnsyncedDraftVisits() warns the doctor at logout (M-6).
              if (row.entity_type === 'visit') {
                await db.runAsync(
                  `UPDATE visits_draft SET sync_status = 'failed', updated_at = ? WHERE local_id = ?`,
                  [now, row.entity_local_id],
                );
              }
            } else {
              await db.runAsync(
                `UPDATE sync_queue
                 SET status          = 'pending',
                     attempts        = ?,
                     last_attempt_at = ?
                 WHERE id = ?`,
                [newAttempts, now, row.id],
              );
            }
          }
          // Continue drain loop — permanent failures dealt with; check for more.
          continue;
        } else {
          // Transient error: network failure (fetch throws / AbortError timeout) OR
          // 5xx server error (e.g. Render.com free-tier cold-start, backend crash).
          //
          // Do NOT increment attempts. Transient failures must not consume the
          // max_attempts budget — doing so dead-letters visits that would have
          // synced successfully once the network or server recovered.
          //
          // Reset in_progress entries to 'pending'. The next sync trigger
          // (AppState foreground, NetInfo restore, or 5-min interval) will retry.
          const now = new Date().toISOString();
          await db.runAsync(
            `UPDATE sync_queue SET status = 'pending', last_attempt_at = ?
             WHERE id IN (${batchIds})`,
            [now, ...syncRows.map((r) => r.id)],
          );
          syncLog('[ERR] transient — reset to pending, aborting run');
          return;
        }
      }

      // ── Apply per-result outcomes ──────────────────────────────────────
      // Build a map from local_id → queue row for O(1) lookup.
      const rowByLocalId = new Map<string, SyncQueueRow>(
        syncRows.map((r) => [r.entity_local_id, r]),
      );

      for (const result of results) {
        const row = rowByLocalId.get(result.local_id);
        if (!row) continue;  // unexpected result — server returned an unknown local_id

        // Both 'success' and 'conflict' are valid non-error outcomes.
        // 'conflict' means the entity already exists on the server — use its server_id.
        if (result.status === 'success' || result.status === 'conflict') {
          await applyResult(db, result, row.entity_type, row.id);
        } else if (result.status === 'error') {
          // Server rejected this operation (schema validation failure, IDOR check,
          // or server-side exception). Log visibly so SyncDebugPanel surfaces it.
          syncLog(`[ERR] operation-level error — ${row.entity_type} ${result.local_id}: ${result.message ?? 'unknown'}`);

          // Increment attempts and retry up to max_attempts. After max_attempts,
          // dead-letter so the entry does not loop forever.
          const now = new Date().toISOString();
          const newAttempts = row.attempts + 1;
          if (newAttempts >= row.max_attempts) {
            const errMsg = result.message ?? 'Operation-level error';
            await db.runAsync(
              `UPDATE sync_queue
               SET status = 'failed', attempts = ?, last_attempt_at = ?, error_message = ?
               WHERE id = ?`,
              [newAttempts, now, errMsg, row.id],
            );
            // Mirror to visits_draft so M-6 warning fires at logout.
            if (row.entity_type === 'visit') {
              await db.runAsync(
                `UPDATE visits_draft SET sync_status = 'failed', updated_at = ? WHERE local_id = ?`,
                [now, row.entity_local_id],
              );
            }
          } else {
            // Reset to pending — will be retried on next sync trigger.
            const errMsg = result.message ?? 'Operation-level error';
            await db.runAsync(
              `UPDATE sync_queue
               SET status = 'pending', attempts = ?, last_attempt_at = ?, error_message = ?
               WHERE id = ?`,
              [newAttempts, now, errMsg, row.id],
            );
          }
        }
      }

      // Any in_progress entry not covered by a result (server omitted it):
      // reset to pending so it retries next run.
      const coveredLocalIds = new Set(results.map((r) => r.local_id));
      const uncoveredRows   = syncRows.filter((r) => !coveredLocalIds.has(r.entity_local_id));
      if (uncoveredRows.length > 0) {
        const now           = new Date().toISOString();
        const uncoveredIds  = uncoveredRows.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE sync_queue
           SET status          = 'pending',
               attempts        = attempts + 1,
               last_attempt_at = ?
           WHERE id IN (${uncoveredIds})`,
          [now, ...uncoveredRows.map((r) => r.id)],
        );
      }

    }  // end while (drain loop)

    syncLog('drain loop complete');

    // ── Audit events flush (after all batches) ─────────────────────────
    // SW-M-1: always flush — flushAuditEvents returns immediately if there
    // is nothing to flush. The old batchSucceeded gate silently skipped
    // read-only sessions (D3 consent_accessed events) for days at a time.
    await flushAuditEvents(db, currentToken, doctorId);

    // ── Update sync store ──────────────────────────────────────────────
    useSyncStore.getState().setLastSyncAt(new Date().toISOString());

    // Count remaining failed entries so UI can surface them if needed.
    const failedResult = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'failed'`,
    );
    useSyncStore.getState().setFailedCount(failedResult?.count ?? 0);

  } finally {
    // Always release the concurrency guard, even on unexpected throw.
    isSyncing = false;
    useSyncStore.getState().setSyncing(false);
  }
}
