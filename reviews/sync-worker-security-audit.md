# Security Audit — Sync Worker (commit 6ecf8e1)

**Date:** 2026-03-13
**Agent:** Security Agent
**Files audited:**
- `src/sync/syncWorker.ts`
- `src/sync/useSyncWorker.ts`
- `src/store/useSyncStore.ts`
- `src/auth/constants.ts`
- `App.tsx` (SyncWorkerMount addition)

**Supporting files read:** `src/api/apiClient.ts`, `src/api/pinnedFetch.ts`,
`src/store/useAuthStore.ts`, `src/db/visits.ts`, `src/db/schema.ts`,
`docs/security-spec.md`, `docs/consent-layer-spec.md`,
`reviews/sync-worker-pm-preflow.md`

---

## CRITICAL (must fix before merge): 0

None.

---

## HIGH (fix before v1 launch): 3

### H-1: sync_queue drain loop reads ALL doctors' entries — not scoped to the authenticated doctor
**File:** `syncWorker.ts:290–298`

Query:
```sql
SELECT ... FROM sync_queue WHERE status = 'pending'
ORDER BY queued_at ASC LIMIT ?
```
Missing: `AND doctor_id = ?`

**Risk:** If `clearDoctorSyncQueue()` fails silently during logout (any SQLite error), leftover entries from Doctor A are sent to the server under Doctor B's JWT. The server authorises requests by the JWT `sub` (Doctor B), so Doctor A's visit creates would be attributed to Doctor B or rejected — either outcome corrupts clinical records or triggers a server auth error that the sync worker mishandles. Defense-in-depth requires the client to scope its own reads.

**Fix:** Pass the authenticated `doctor_id` into `runSyncWorker()` and add `AND doctor_id = ?` to both the drain SELECT and the startup in_progress reset UPDATE. Same fix applies to `flushAuditEvents` (see H-3).

---

### H-2: tryRefreshToken drops the new refresh token — rotation not completed on the client side
**File:** `syncWorker.ts:102–130`

`RefreshResponse` interface has only `{ access_token, expires_in }` — no `refresh_token` field.

**Risk:** Security spec and agent-security checklist both require refresh token rotation (old token invalidated on use). If the server rotates the token (which it must per spec), the new token is never written back to `expo-secure-store`. The next token refresh attempt reads the now-invalidated old token, gets a 401 from `/auth/refresh`, and all subsequent sync runs silently abort. Doctor's unsynced visits accumulate on-device and never reach the server. DPDP audit events stop flushing. This failure is silent — there is no UI feedback.

**Fix:**
```typescript
interface RefreshResponse {
  access_token:  string;
  refresh_token?: string;   // add
  expires_in:    number;
}
// After updating auth store, write new refresh token if returned:
if (body.refresh_token) {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, body.refresh_token);
}
```
Note: even if the server does not yet return a new refresh token, the client code must be ready. Add the field now so D1 and the server contract stay aligned.

---

### H-3: flushAuditEvents reads ALL unsynced audit events — not scoped to the authenticated doctor
**File:** `syncWorker.ts:207–213`

Query:
```sql
SELECT ... FROM audit_events WHERE synced_at IS NULL
```
Missing: `AND doctor_id = ?`

**Risk:** Same class as H-1. Audit events for Doctor A (created during their session and not yet flushed) would be transmitted under Doctor B's JWT. The server receiving a `POST /sync` with `entity_type='audit_event'` where the JWT sub does not match the payload `doctor_id` has two bad outcomes: reject (audit trail is lost) or accept (misattributes access to the wrong doctor). DPDP compliance requires accurate attribution.

**Fix:** Pass `doctor_id` into `flushAuditEvents` and add `AND doctor_id = ?` to the SELECT. Same `doctor_id` parameter proposed in H-1 fix should be threaded through.

---

## MEDIUM (fix before pilot): 2

### M-1: Audit events never flush when the sync_queue is empty
**File:** `syncWorker.ts:439`

```typescript
if (batchSucceeded) {
  await flushAuditEvents(db, currentToken);
}
```
`batchSucceeded` starts `false` and is only set to `true` when at least one sync_queue batch is POSTed and returns results. If the queue has 0 pending entries (queue is clean), the while loop breaks immediately and `batchSucceeded` stays `false`.

**Risk:** In any session where the doctor only reads records (D3 — creates `consent_accessed` audit events) but does not create a new visit, the `audit_events` table is never flushed. DPDP §8 requires the server-side audit trail to capture access events. A doctor seeing patient records every day could accumulate weeks of unsynced audit events on-device.

**Fix:** Remove the `batchSucceeded` gate. `flushAuditEvents` checks `rows.length === 0` internally and returns immediately if nothing to flush. The extra SELECT is cheap.

---

### M-2: hasResetInProgress flag is not cleared on doctor change
**File:** `syncWorker.ts:46`

`hasResetInProgress` is a module-level boolean. It is set to `true` on the first `runSyncWorker()` call and never reset.

**Risk:** If Doctor A's session ends and Doctor B logs in within the same app process lifetime, the in_progress reset (startup cleanup) does not run for Doctor B's first sync. Any in_progress entries from Doctor A's crash-interrupted run (which weren't cleaned up by logout) are invisible to the reset. They stay stuck as `in_progress` and are never retried.

**Fix:** Reset `hasResetInProgress` in the `useLogout` sequence, or replace the module-level flag with a check tied to the auth store's session that resets when `clearAuth()` is called (e.g., a session-id counter).

---

## LOW (track in backlog): 2

### L-1: ACCESS_TOKEN_KEY exported but unused — creates ambiguity about access token storage strategy
**File:** `constants.ts:14`

The access token is held in Zustand (in-memory). The exported constant suggests D1 may store it in SecureStore as well. Storing a short-lived access token in SecureStore is acceptable but redundant with the in-memory store, and creates a stale-token risk if the two diverge after a refresh.

**Fix:** Either remove `ACCESS_TOKEN_KEY` now and add it back when D1 has a concrete use for it, or add a comment clarifying the intent (e.g., "Used by D1 for cold-start token recovery — app restart reads this to avoid a full re-login").

---

### L-2: Token race — mid-sync logout does not abort the in-flight run
**File:** `syncWorker.ts:261–269`

The token guard fires only at the top of `runSyncWorker`. If `clearAuth()` is called during a sync run (logout while batches are in flight), the current batch continues with the old token via the `currentToken` local variable. The `isSyncing` guard also blocks the next trigger until the old run finishes.

**Risk:** Low — the old JWT is valid for up to 15 minutes; operations are Doctor A's own data; the server enforces auth. Not exploitable in normal clinic usage.

**Fix:** Remove the `?? currentToken` fallback on line 288 and treat a null token mid-run as an abort signal.

---

## CHECKLIST STATUS

| Domain | Result | Notes |
|---|---|---|
| Authentication & Sessions | ⚠️ 4/6 | H-2 (refresh token not stored back); L-2 (mid-run logout race) |
| Authorisation | ⚠️ 1/3 | H-1 (sync_queue not scoped); H-3 (audit_events not scoped) |
| Data Handling | ✅ 5/5 | No Aadhaar, no PII in logs, no console.log in audited files |
| Mobile Security | ✅ 4/4 | SecureStore, cert pinning on all outbound calls, cache cleared on logout |
| Database | ✅ 3/3 | All queries parameterised; audit log is insert-only by the app |
| DPDP Compliance | ⚠️ 2/3 | M-1 — audit events never flush in read-only sessions |

---

## Positive Observations

- Certificate pinning correctly applied on **both** server code paths: `apiFetch` (via `pinnedFetch`) for sync batches, and the direct `pinnedFetch` call inside `tryRefreshToken`. No bypass.
- 401 retry logic is bounded to exactly one retry. No infinite loop risk. On second failure: in_progress entries reset to pending, run aborts.
- Dead-letter protection (`max_attempts → status='failed'`) correctly implemented per PM spec. No queue runaway.
- `hasResetInProgress` is single-shot per app session — correctly avoids the race where a concurrent reset could catch entries just marked `in_progress` by the current run.
- `SyncWorkerMount` placement in `App.tsx` is correct: inside `SQLiteProvider`, inside `QueryClientProvider`, outside `NavigationContainer` — the worker can never navigate.
- Scan records correctly deferred (`status='deferred'`, not `'failed'`) — does not consume `max_attempts` budget. Locked v2 scope enforced.
- `'conflict'` treated identically to `'success'` in `applyResult` — server deduplication handled correctly. Idempotent local updates via `OR REPLACE` on `id_mapping` and conditional `markVisitSynced`.

---

## OVERALL VERDICT: Blocked — 3 HIGH issues (H-1, H-2, H-3)

All three are straightforward fixes. No architectural rework required.

**Fix priority:**
1. H-1 + H-3 together (same change — pass `doctor_id` as a parameter through `runSyncWorker` → `flushAuditEvents`)
2. H-2 (add `refresh_token` to `RefreshResponse` interface + write to `SecureStore`)
3. M-1 in the same pass (remove the `batchSucceeded` gate on `flushAuditEvents`)
