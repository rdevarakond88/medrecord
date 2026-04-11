# PM REVIEW — Pre-Flight: Sync Worker

**Date:** 2026-03-13
**Agent:** PM Agent — Moment 1
**Reviewer:** Claude Code (PM Agent persona)

---

## PROCEED: Yes

---

## SCOPE: WHAT IT MUST DO

### Trigger conditions
1. App foreground (`AppState` change to `'active'`)
2. Network connectivity restored (NetInfo transition: offline → `isConnected === true && isInternetReachable === true`)
3. Every 5 minutes while online and app is open (`setInterval`)

All three triggers gate on `isConnected === true && isInternetReachable === true` before running.

### Entity types to process in v1

| Entity type | Source | Action |
|---|---|---|
| `visit` | `sync_queue` written by D6 `handleSave` | POST /sync batch |
| `patient` | `sync_queue` written by D5 (when built) | POST /sync batch |
| `record` (scan) | `sync_queue` written by D7 `handleUseThis` | **Skip in v1** — S3 deferred (locked). Set `status='deferred'`, `error_message='S3 upload deferred to v2'` |
| `consent` | `sync_queue` written by D9 (when built) | POST /sync batch when present |
| Audit events | `audit_events` table (`synced_at IS NULL`) | Flush after sync_queue batch succeeds |

### Processing order
Strictly `queued_at ASC`. Patient create must reach server before its visit create.

### After a successful POST /sync batch
For each result:
1. Write `(local_id, server_id)` to `id_mapping` table
2. For `entity_type='visit'`: call `markVisitSynced(db, localId, serverId)`
3. For `entity_type='patient'`: `UPDATE patients SET server_id=?, synced_at=?`
4. Set `sync_queue.status='success'`

### Audit events flush
After sync_queue batch succeeds, query `audit_events WHERE synced_at IS NULL`, POST as a second batch to POST /sync with `entity_type='audit_event'`. On success, `UPDATE audit_events SET synced_at=now()`.

Payload shape per entry:
```
{ operation: 'create', entity_type: 'audit_event', local_id: id,
  payload: { event_type, doctor_id, patient_id, metadata, created_at },
  queued_at: created_at }
```

### JWT 401 refresh (D7-QA-H4 — must implement)
On 401 from POST /sync:
1. Read refresh token from `expo-secure-store` using `REFRESH_TOKEN_KEY`
2. POST /auth/refresh
3. If success: update auth store, retry sync batch once
4. If refresh fails: abort run, leave entries as `pending`, surface via `useSyncStore`. Do NOT navigate — navigation belongs to UI layer.

### Retry / dead-letter logic
- Non-401 error: increment `attempts`, set `last_attempt_at`, leave `status='pending'`
- `attempts >= max_attempts` (5): set `status='failed'`, record `error_message`

### Concurrency guard
Module-level `let isSyncing = false` flag. Skip if already running.

---

## WHAT IT IS NOT

- No image upload (deferred to v2 — locked decision)
- No OCR (deferred to v2 — locked decision)
- No UI — sync worker never navigates, never shows modals
- No retry-with-backoff timer loop — organic retry via next foreground/connectivity trigger

---

## EDGE CASES

| Edge case | Required behaviour |
|---|---|
| App killed mid-sync | On startup, reset `in_progress` entries to `pending` |
| Partial batch failure | Process each result independently — one failure ≠ whole batch failure |
| D6 direct upload succeeded before worker runs | **Critical:** D6 must set `sync_queue.status='success'` and call `markVisitSynced()` immediately after successful `createVisit()`. This is the open TODO in project-state.md and must be closed in this session. Without it, the sync worker re-POSTs already-uploaded visits, creating server duplicates. |
| Offline-only patient visit in queue | If patient create entry is missing, mark visit as `status='failed'` with `error_message='missing patient dependency'` |
| Doctor logs out with pending entries | `clearDoctorSyncQueue()` already called in `useLogout` — correct |
| Token is null when worker triggers | Guard at top: `if (!useAuthStore.getState().token) return` |

---

## OPEN QUESTIONS — RESOLVE BEFORE BUILDER STARTS

| Question | Decision |
|---|---|
| Refresh token key name | Use `'medrecord_refresh_token'` — declare in `src/auth/constants.ts` so D1 adopts it |
| Audit event entity_type on server | Assume POST /sync accepts `entity_type: 'audit_event'` per offline-sync-spec. Confirm with server contract. |
| Sync status store location | `src/store/useSyncStore.ts` — minimal: `{ isSyncing, lastSyncAt, failedCount }` |
| Max batch size | Cap at 20 operations per POST /sync call. Multiple calls if queue > 20. |

---

## REGULATORY FLAGS

- **DPDP Act 2023** — Audit event flush to server is mandatory for any live clinic usage. Include in v1 scope.
- **Data residency** — POST /sync → `api.medrecord.in` → ap-south-1. Existing cert pinning covers this.

---

## MARKET REALITY NOTES

- Partial batch on 2G is the highest-risk edge case. Per-entry result tracking is non-negotiable.
- JWT 401 refresh is table stakes. Clinic WiFi sessions terminate after 30–60 min on shared routers.
- No user-visible sync failure feedback is correct for v1. Sync status UI is v1.1.

---

## BUILDER AGENT SPEC

### Files to create
- `src/sync/syncWorker.ts` — core drain loop
- `src/sync/useSyncWorker.ts` — hook: AppState + NetInfo + interval triggers
- `src/store/useSyncStore.ts` — `{ isSyncing, lastSyncAt, failedCount }`
- `src/auth/constants.ts` — `REFRESH_TOKEN_KEY`, `ACCESS_TOKEN_KEY`

### Files to modify
- `src/screens/doctor/NewVisitScreen.tsx` — close open TODO: after successful `createVisit()`, set `sync_queue.status='success'` and call `markVisitSynced()`
- `App.tsx` — mount `useSyncWorker()` inside provider tree
- `docs/project-state.md` — update after session

### Files to read before writing any code
`src/sync/syncQueue.ts`, `src/db/schema.ts`, `src/db/visits.ts`, `src/db/scans.ts`,
`src/api/apiClient.ts`, `docs/api-contracts.md`, `docs/offline-sync-spec.md`, `docs/security-spec.md`
