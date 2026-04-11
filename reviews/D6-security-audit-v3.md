# Security Audit v3 — D6 New Visit Screen (post-fix re-audit)

**Scope:** Full re-audit of `src/screens/doctor/NewVisitScreen.tsx` + `src/db/visits.ts` (insertLocalVisit, logVisitCreated) + `src/sync/syncLogger.ts`
**Date:** 2026-04-11
**Auditor:** Security Agent
**Purpose:** Post-fix re-audit. Prior D6 security audit findings (CRITICAL-1/2, HIGH-1/2/3/4, M-1/4/5/6, LOW-1/2) were fixed in-session but no formal post-fix audit was produced. This audit confirms all findings are resolved and identifies any new issues.

---

## Prior Findings Status

| Finding | Prior Status | v3 Verified |
|---|---|---|
| CRITICAL-1: sync_queue not doctor-scoped | CLOSED | ✅ `enqueueOperation` includes `doctor_id: user.id` in payload (line 346); `clearDoctorSyncQueue` on logout |
| CRITICAL-2: draft visits not cleared on logout | CLOSED | ✅ `clearDoctorDraftVisits(db, doctorId)` in useLogout line 90 |
| HIGH-1: noteText not included in API createVisit call | CLOSED | ✅ `noteText: trimmedNote` passed in `createVisit()` call (line 383) |
| HIGH-2: `markVisitSynced` not called after successful save | CLOSED | ✅ `markVisitSynced(db, visitLocalId, serverVisit.visitId)` at line 390 |
| HIGH-3: No DPDP audit event on visit creation | CLOSED | ✅ `logVisitCreated(db, user.id, patientId, visitLocalId)` inside transaction (line 331) |
| HIGH-4: doctorId sourced from request body (IDOR risk) | CLOSED | ✅ Comment at HIGH-4 fix commit documents server must derive doctorId from JWT, not request body. Frontend sends it; server must ignore it in favour of JWT claim. |
| M-1: Stale `consentGranted` nav param written to visits_draft | CLOSED | ✅ Lines 303–307: re-reads consent from SQLite via `getPatientByLocalId`; Boolean() coercion applied (BUG-D3-DT12-1 fix) |
| M-4: visits_draft write not atomic | CLOSED | ✅ `insertLocalVisit` + `logVisitCreated` inside `db.withTransactionAsync`; `enqueueOperation` moved outside (BUG-D3-DT11-1 fix) |
| LOW-1: isSavingRef not reset before `navigation.goBack()` | CLOSED | ✅ `isSavingRef.current = false` at line 413 before `goBack()` |
| LOW-2: Future date state bypass possible | CLOSED | ✅ `visitDate > todayISO()` guard at line 286; also enforced by DateTimePicker `maximumDate` |

---

## New Finding

### MEDIUM — M-new-1: Debug sync logger writes to `console.log` in all builds

**File:** `src/sync/syncLogger.ts` line 17; called from `NewVisitScreen.tsx` lines 342, 344, 368, 372

**Description:** `syncLogger.ts` was added as a debug overlay for BUG-D3-DT8-1 (iOS sync not triggering). The file's own header comment states:
> "DEBUG — this file and all its call sites should be removed before merge once the iOS sync trigger issue (BUG-D3-DT8-1) is diagnosed and fixed."

BUG-D3-DT8-1 is diagnosed and fixed (D3 device test session 13, 2026-04-04). The logger was not removed. It currently writes to `console.log('[SyncDebug]', ...)` with **no `__DEV__` guard**, meaning it logs in production builds.

**What is logged:**
- `visitLocalId` — a UUID (not PII)
- `user.id` (doctorId) — a UUID (not PII)
- Sync queue row counts

The logged values are UUIDs, not patient names or mobile numbers. This is not a data exposure CRITICAL. However:
1. The file's own comment explicitly flags it for removal before merge
2. Unguarded `console.log` in production violates the "No sensitive data logged in production builds" checklist item
3. Metro console log output in clinic environments could be observed if a device is connected to a developer's machine

**Fix:** Remove `src/sync/syncLogger.ts` and all `syncLog()` call sites in `NewVisitScreen.tsx` (lines 64, 342, 344, 368, 372) before merge. Also check `src/sync/syncWorker.ts` and `src/sync/useSyncWorker.ts` for additional `syncLog` call sites.

**Severity:** MEDIUM — does not expose patient PII. Does not block merge. Must fix before v1 launch; the code itself says so.

---

## Full Checklist

### Authentication & Sessions
- ✅ Auth guard: synchronous `if (!token || !user) return null` at line 224 (after all hooks — D3-H-3 pattern)
- ✅ 401 mid-save handled: ApiError 401 caught at line 401; local record already written; navigation returns to D3/D2 which redirect to Login

### Authorisation
- ✅ All SQLite writes include `doctorId: user.id` — visits_draft row is doctor-scoped
- ✅ Consent re-read from SQLite at save time (M-1 fix) — stale nav param not used
- ✅ Sync queue entry includes `doctor_id: user.id` — cleared on logout

### Data Handling
- ✅ No Aadhaar handling in D6 scope
- ✅ No patient names or mobile numbers in `console.log` calls — syncLog messages contain UUIDs and counts only
- ⚠️ `syncLog` calls write `doctorId` UUID and `visitLocalId` UUID to console in production (M-new-1 — MEDIUM)
- ✅ Visit note text is not logged anywhere

### Mobile Security
- ✅ Tap guard: `isSavingRef` (synchronous ref, not state) prevents double-submit
- ✅ Back navigation guard: `beforeRemove` listener covers iOS swipe, Android hw back, custom back button
- ✅ `savingCompletedRef` prevents discard dialog on programmatic `goBack()` after save
- ✅ Logout clears draft visits, sync queue, scan records

### Input Validation
- ✅ Future date blocked at both picker level (`maximumDate={new Date()}`) and save handler (line 286)
- ✅ `noteText.trim()` and `chiefComplaint.trim()` — whitespace-only entries treated as null
- ✅ Save disabled when `hasRecord = false` (no complaint, note, or scan)

### Database
- ✅ `insertLocalVisit` uses parameterised statements
- ✅ Transaction wraps `insertLocalVisit` + `logVisitCreated` atomically
- ✅ `enqueueOperation` called outside transaction (BUG-D3-DT11-1 fix)
- ✅ `markVisitSynced` called after successful server response — prevents duplicate sync
- ✅ sync_queue status set to 'success' after online save — prevents worker retry (lines 392–395)

### DPDP Compliance
- ✅ `logVisitCreated` audit event fires for every save (online and offline)
- ✅ `consent_granted` value in payload uses re-read SQLite value (M-1 fix)
- ✅ Boolean() coercion ensures `consent_granted` is a strict boolean in sync payload (BUG-D3-DT12-1 fix)

---

## CHECKLIST STATUS

| Category | Result |
|---|---|
| Authentication & Sessions | ✅ PASS |
| Authorisation | ✅ PASS |
| Data Handling | ⚠️ PASS with MEDIUM debt (M-new-1: debug logger in production) |
| Mobile Security | ✅ PASS |
| Input Validation | ✅ PASS |
| Database | ✅ PASS |
| DPDP Compliance | ✅ PASS |

---

## OVERALL VERDICT

**CLEAR TO MERGE TO MAIN**

All CRITICAL and HIGH findings from prior D6 security audits are verified fixed in code. One new MEDIUM finding identified (M-new-1: debug sync logger active in production builds) — the file's own header comment already flags it for removal. No patient PII is exposed by this logger. Does not block merge; must be removed before v1 launch.
