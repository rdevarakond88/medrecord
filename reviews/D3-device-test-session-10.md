# D3 — Patient Detail / History
## Device Test Session 10

**Date:** 2026-03-31
**Agent:** Device Tester
**Source:** BUG-D3-DT9-1 fix by Builder (2026-03-31) — verify transient sync errors no longer dead-letter visits; verify BUG-D3-DT1-2
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

## Session 10 Focus
1. **Verify BUG-D3-DT9-1** — pinnedFetch fix confirmed; POST /sync reaches server; visits no longer dead-lettered by transient network failures
2. **Verify BUG-D3-DT1-2** — visit survives logout → re-login (cross-session persistence)

---

## Test Results

### Phase 1 — SyncDebugPanel baseline

| # | Item | Status | Notes |
|---|---|---|---|
| P1 | Navigate to D3 for Test Patient One | ✅ PASS | |
| P2 | SyncDebugPanel visible | ✅ PASS | Panel at top of screen (above patient details heading), not bottom — layout difference only |
| P3 | Panel shows drain: 0 pending rows, drain loop complete | ✅ PASS | Clean baseline — no leftover failed visits from prior sessions |

### Phase 2 — Create visit and observe sync cycle

| # | Item | Status | Notes |
|---|---|---|---|
| T1 | Tap "+ New Visit", enter "session 10 test", save | ✅ PASS | Returned to D3; new card visible with Draft + cloud |
| T2 | Panel shows AppState trigger fired, runSyncWorker called, doctorId correct | ✅ PASS | Trigger chain working; doctorId: 5d4cee3d-0b3f-4d3b-9407-68936f339214 |
| T3 | Panel shows drain: 1 pending rows | ✅ PASS | Visit IS in sync_queue as 'pending' — new behaviour vs Session 9 |
| T4 | Panel shows POST /sync — 1 ops: visit | ✅ PASS | pinnedFetch connects to server — network transport fix CONFIRMED |
| T5 | Panel shows POST /sync OK — 1 results: error | ❌ FAIL | Server returned 200 but operation-level error for visit. No [ERR] red lines logged. |
| T6 | Panel shows drain: 0 pending rows after error result | ❌ FAIL | Sync_queue entry consumed; not retried |
| T7 | Navigate D3 → D2 → D3; panel shows drain: 0 pending rows | ❌ FAIL | No retry on re-focus; entry permanently gone from pending |
| T8 | Visit still shows Draft + cloud after navigation cycle | ❌ FAIL | Visit not synced |

### Phase 3 — BUG-D3-DT1-2 cross-session persistence

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | Logout | ✅ PASS (with M-6 warning) | M-6 warning appeared — visit in 'failed' state at logout |
| R2 | Re-login 9999999999 / 000000 | ✅ PASS | |
| R3 | Navigate to D3 for Test Patient One | ✅ PASS | |
| R4 | "session 10 test" visit visible | ❌ FAIL | Visit absent — deleted at logout, never reached server |

---

## Key Diagnostic Findings

1. **pinnedFetch transport layer: FIXED** — POST /sync now reaches the server on iOS Expo Go and returns 200 OK. This is the first time POST /sync has returned 200 in any device test session. The BUG-D3-DT9-1 Builder fix resolved the transport-layer failure.

2. **New failure layer: server operation-level error** — The server returns `POST /sync OK — 1 results: error` (HTTP 200, but individual visit operation has status `error`). The sync worker does not retry or log a red [ERR] line — it silently consumes the entry.

3. **Sync_queue entry gone after one operation-level error** — After `POST /sync OK — 1 results: error`, `drain: 0 pending rows` appears. The entry is not visible to subsequent drain runs. The visit is not retried.

4. **Data loss pattern unchanged** — M-6 warning at logout confirms visit is in 'failed' state. Visit deleted at logout. Absent after re-login.

5. **Root cause shift** — Previous sessions: pinnedFetch not connecting at all (5 network failures → dead-letter). Session 10: pinnedFetch connects (200 OK), but server rejects the operation. Unknown what the server error is — no detail surfaced in SyncDebugPanel.

---

## Bugs Found

### BUG-D3-DT10-1 (HIGH) — POST /sync returns operation-level error for visit; sync worker does not retry; data loss at logout
**Summary:** After the BUG-D3-DT9-1 transport fix, POST /sync now reaches the server (200 OK). However, the server returns an operation-level error (`1 results: error`) for the visit. The sync worker consumes the sync_queue entry without retrying and without logging a visible [ERR] line. The visit hits 'failed' state, M-6 warning appears at logout, visit is deleted, absent after re-login.
**Repro:** Login → D3 → create visit in D6 → return to D3 → observe Draft + cloud → observe SyncDebugPanel: `POST /sync OK — 1 results: error`, `drain: 0 pending rows` → logout (M-6 warning) → re-login → visit absent.
**Evidence:** SyncDebugPanel: `POST /sync — 1 ops: visit` then `POST /sync OK — 1 results: error` then `drain: 0 pending rows`. M-6 warning at logout. Visit absent after re-login.
**Root cause:** Unknown — server is rejecting the visit operation inside the sync batch. Could be data format mismatch, missing field, auth issue at operation level, or server-side validation error. Builder must inspect server logs and POST /sync request/response body.
**Secondary gap:** Sync worker does not surface operation-level errors as [ERR] lines — silent failure makes diagnosis harder. Builder should add [ERR] logging for `results: error` entries.
**Impact:** Data loss. Every visit created on iOS Expo Go is still silently lost at logout.
**Status:** OPEN — Builder session required.

---

## BUG-D3-DT9-1 Status
**PARTIALLY FIXED — NOT VERIFIED CLOSED**
- Transport layer fix confirmed: pinnedFetch connects on iOS Expo Go (200 OK received)
- Data loss still occurring due to operation-level server error (new failure layer)
- Cannot close BUG-D3-DT9-1 until POST /sync succeeds end-to-end

## BUG-D3-DT1-2 Status
**STILL BLOCKED** — visit never syncs; cross-session persistence cannot be verified until BUG-D3-DT10-1 is fixed.

---

## Deferred Items Carried Forward

| Checklist # | Item | Reason | Fix By |
|---|---|---|---|
| 29 | Error state on fetch failure | Requires network manipulation | Before merge |
| 34 | Record count with 1 / 5+ records | Insufficient test data | Before merge |
| 43 | Auth guard — no token | Requires token removal | Before merge |
| 53 | Malformed patient ID → error state | Requires nav param manipulation | Before merge |
| 11, 12, 38, 41 | Consent-false grayed state with other-doctor visits | Requires second test doctor account | Before merge |
| 14, 15, 16, 17 | Visual spec compliance | Not testable via verbal device report | Before merge |
| 19, 51 | View Full Visit → D4 | D4 not built | When D4 built |
| 25, 55 | Scroll with 10+ / 20+ visits | Insufficient test data | Before merge |
| 39, 40, 52 | Request Access → D9 | D9 not built | When D9 built |
| 44, 48 | Cross-doctor isolation | Requires second test doctor | Before merge |
| 47 | No PII in console logs | Not testable via verbal report | Before merge |
| 57 | No unnecessary re-renders | Not testable via verbal report | Before merge |

---

## Session Summary

**Session 10 complete — 2026-03-31**

**Bug count:** 1 bug found: BUG-D3-DT10-1 (HIGH — data loss, server operation-level error causes visit to be silently discarded)

**Results:**
- P1, P2, P3: PASS — SyncDebugPanel visible, clean baseline
- T1, T2, T3, T4: PASS — trigger chain working, doctorId correct, visit in sync_queue, pinnedFetch connects (200 OK) ← transport fix confirmed
- T5, T6, T7, T8: FAIL — server returns operation-level error, entry not retried, visit remains Draft
- R1: PASS with M-6 warning (visit in 'failed' state)
- R2, R3: PASS
- R4: FAIL — visit absent after re-login (data loss)

**Key progress:** pinnedFetch transport fix is confirmed working — POST /sync now reaches the server for the first time. The failure has shifted from transport layer (network) to application layer (server rejects the operation). This narrows the scope for Builder significantly.

**Builder handoff decision:** Builder Agent session required before merge — items: BUG-D3-DT10-1 (HIGH, data loss — server returns operation-level error for visit in POST /sync; sync worker does not retry; visit deleted at logout).

---

SESSION COMPLETE — Next: Builder Agent — investigate BUG-D3-DT10-1 (POST /sync returns 200 OK but operation-level error for visit; Builder must inspect server logs + POST /sync request/response body; add [ERR] logging for operation-level errors in sync worker)
Type 'exit' then 'claude' to start the next step.
