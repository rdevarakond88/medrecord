# D3 — Patient Detail / History
## Device Test Session 11

**Date:** 2026-03-31
**Agent:** Device Tester
**Source:** BUG-D3-DT10-1 fix by Builder (2026-03-31) — verify visit syncs end-to-end (POST /sync → success result → markVisitSynced); verify BUG-D3-DT1-2 cross-session persistence
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Test patient:** Test Patient One | mobile: 8888888888

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] Test credentials confirmed
- [x] ngrok tunnel confirmed: exp://ilswcbg-anonymous-8082.exp.direct
- [x] App open on device (user confirmed logged in, at patient search screen)

---

## Session 11 Focus
1. **Verify BUG-D3-DT10-1 fix** — POST /sync should now return success result (not operation-level error); visit should sync end-to-end; markVisitSynced called; Draft+cloud badge disappears
2. **Verify BUG-D3-DT1-2** — visit survives logout → re-login (cross-session persistence); synced visit visible after re-login

---

## Test Results

### Phase 1 — SyncDebugPanel baseline

| # | Item | Status | Notes |
|---|---|---|---|
| P1 | Navigate to D3 for Test Patient One | ✅ PASS | Existing visit cards visible (dated ~2-8 March 2026) |
| P2 | SyncDebugPanel visible | ✅ PASS | Panel visible at top of screen |
| P3 | Panel shows drain: 0 pending rows, drain loop complete | ✅ PASS | doctorId: 5d4cee3d-0b3f-4d3b-9407-68936f339214 confirmed correct |

### Phase 2 — Create visit and observe sync cycle (BUG-D3-DT10-1 verification)

| # | Item | Status | Notes |
|---|---|---|---|
| T1 | Tap "+ New Visit", enter "session 11 test 2", save | ✅ PASS | Visit card visible with Draft+cloud labels |
| T2 | Panel shows AppState trigger fired, runSyncWorker called, doctorId correct | ✅ PASS | Metro: "run sync worker called, has_token true, has_user true"; t1 AppState trigger; doctorId correct |
| T3 | Panel shows drain: 1 pending rows | ❌ FAIL | drain: 0 pending rows — visit NOT in sync_queue |
| T4 | Panel shows POST /sync — 1 ops: visit | ❌ FAIL | No POST /sync line — nothing to send |
| T5 | Panel shows POST /sync OK — 1 results: success | ❌ FAIL | Never reached |
| T6 | Panel shows markVisitSynced called | ❌ FAIL | Never reached |
| T7 | Panel shows drain: 0 pending rows after success | ❌ FAIL | Shows 0 rows but due to empty queue, not successful sync |
| T8 | "session 11 test 2" visit card: Draft+cloud badge gone | ❌ FAIL | Still shows Draft+cloud — visit not synced |

### Phase 3 — BUG-D3-DT1-2 cross-session persistence

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | Logout (no M-6 warning expected — visit should be synced) | ⏭ SKIP | Skipped — visit never synced; BUG-D3-DT1-2 still blocked |
| R2 | Re-login 9999999999 / 000000 | ⏭ SKIP | Skipped |
| R3 | Navigate to D3 for Test Patient One | ⏭ SKIP | Skipped |
| R4 | "session 11 test 2" visit visible in history | ⏭ SKIP | Skipped — blocked on BUG-D3-DT11-1 |

---

## Bugs Found

### BUG-D3-DT11-1 (HIGH) — Visit saved to visits_draft but never enqueued into sync_queue; silent failure; data loss at logout
**Summary:** After the BUG-D3-DT10-1 Builder fix (camelCase → snake_case payload, patientId → patientServerId), the enqueue step silently fails. Visit is written to `visits_draft` and shows Draft+cloud on D3, but `sync_queue` remains empty. Sync worker drains 0 rows. No [ERR] or error lines appear in Metro at save time. Visit never reaches the server and will be deleted at logout.
**Repro:** Login → D3 → tap "+ New Visit" → enter chief complaint → save → return to D3 → observe Draft+cloud → observe Metro logs: runSyncWorker called, drain: 0 pending rows → no POST /sync line.
**Evidence:** Metro logs show trigger fires correctly (has_token true, has_user true, doctorId correct), drain: 0 pending rows immediately after visit creation. No error logged at save time. Visit card still shows Draft+cloud after multiple sync trigger cycles (t1 AppState, t3 5-min timer).
**Likely root cause:** Builder fix changed `patientId` (local SQLite UUID) to `patientServerId` (server UUID) in the enqueueOperation payload. The test patient (seeded locally) may have no `patientServerId` stored in SQLite — undefined/null value may be causing a silent validation failure or SQLite insert error inside enqueueOperation that swallows the exception.
**Impact:** Data loss. Every visit created is silently not enqueued — worse regression than Session 10, where visits were at least reaching the server.
**Status:** OPEN — Builder session required.

---

## BUG-D3-DT10-1 Status
**NOT VERIFIED** — cannot confirm fix because enqueue step now fails before POST /sync is attempted. Root cause shifted upstream.

## BUG-D3-DT1-2 Status
**STILL BLOCKED** — visit never enqueues; cross-session persistence cannot be verified.

---

## Session Summary

**Session 11 complete — 2026-04-01**

**Bug count:** 1 bug found: BUG-D3-DT11-1 (HIGH — visit saved to visits_draft but silently not enqueued into sync_queue; drain: 0 rows; no POST /sync; data loss at logout)

**Results:**
- P1, P2, P3: PASS — D3 loads, SyncDebugPanel visible, clean baseline
- T1: PASS — visit card visible with Draft+cloud
- T2: PASS — sync worker triggered correctly, doctorId correct
- T3–T8: FAIL — sync_queue empty; no POST /sync; visit never synced; Draft+cloud persists
- R1–R4: SKIP — blocked on BUG-D3-DT11-1

**Key finding:** Builder's BUG-D3-DT10-1 fix introduced a regression. Changing `patientId` → `patientServerId` in the enqueueOperation payload likely causes a silent failure when `patientServerId` is null/undefined for locally-seeded test patients. The failure is silent — no [ERR] line, no crash — making it harder to diagnose than Session 10's failure.

**Builder handoff decision:** Builder Agent session required before merge — items: BUG-D3-DT11-1 (HIGH, data loss — visit not enqueued into sync_queue after BUG-D3-DT10-1 fix; likely patientServerId null causing silent enqueue failure; Builder must add null-guard logging in enqueueOperation and verify patientServerId is populated for test patient).

---

SESSION COMPLETE — Next: Builder Agent — fix BUG-D3-DT11-1 (visit not enqueued into sync_queue; investigate patientServerId null/undefined in D6 handleSave; add defensive logging in enqueueOperation so null payload fields surface as [ERR] rather than silent failure)
Type 'exit' then 'claude' to start the next step.
