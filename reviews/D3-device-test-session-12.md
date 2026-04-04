# D3 — Patient Detail / History
## Device Test Session 12

**Date:** 2026-04-04
**Agent:** Device Tester
**Source:** BUG-D3-DT11-1 fix by Builder (2026-04-01) — `enqueueOperation` moved outside `withTransactionAsync`; null-guard + post-enqueue verify SELECT added. Verify fix; verify BUG-D3-DT10-1 end-to-end; verify BUG-D3-DT1-2 cross-session persistence.
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Test patient:** Test Patient One | mobile: 8888888888

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] Test credentials confirmed
- [x] ngrok tunnel confirmed: https://ilswcbg-anonymous-8082.exp.direct
- [x] App open on device (user confirmed)

---

## Session 12 Focus
1. **Verify BUG-D3-DT11-1 fix** — SyncDebugPanel must show "enqueue: verify — pending rows: 1" after visit save (not drain: 0)
2. **Verify BUG-D3-DT10-1 fix** — POST /sync returns success result (not operation-level error); markVisitSynced called; Draft+cloud badge disappears
3. **Verify BUG-D3-DT1-2** — visit survives logout → re-login; synced visit visible after re-login

---

## Test Results

### Phase 1 — Baseline (app state + SyncDebugPanel)

| # | Item | Status | Notes |
|---|---|---|---|
| P1 | App is on Patient Search screen (logged in) | ✅ PASS | |
| P2 | Search for Test Patient One (8888888888), navigate to D3 | ✅ PASS | Patient name + last 5 digits visible; 1 visit card in history |
| P3 | SyncDebugPanel visible at top of D3 | ✅ PASS | |
| P4 | Panel shows drain: 0 pending rows, drain loop complete | ⚠️ NOTE | Pre-existing visit 05f1672c in queue (from before BUG-D3-DT10-1 fix — old payload). Server returned "Required" x5. Hit max_attempts → failed → drain: 0. Queue clean after exhaustion. This visit will surface as M-6 warning at logout. |

### Phase 2 — Create visit and verify enqueue (BUG-D3-DT11-1)

| # | Item | Status | Notes |
|---|---|---|---|
| T1 | Tap "+ New Visit", enter chief complaint "session 12 test", tap Save | ✅ PASS | |
| T2 | Return to D3 — visit card visible with Draft+cloud badge | ✅ PASS | |
| T3 | SyncDebugPanel shows "enqueue: verify — pending rows: 1" | ✅ PASS | "enqueue: verify pending rows in sync_queue: 1" + "enqueue: calling enqueueOperation visit local id b07..." |
| T4 | Panel shows AppState trigger fired, runSyncWorker called, doctorId correct | ✅ PASS | BUG-D3-DT11-1 VERIFIED FIXED |

### Phase 3 — Sync end-to-end (BUG-D3-DT10-1)

| # | Item | Status | Notes |
|---|---|---|---|
| T5 | Panel shows drain: 1 pending rows | ✅ PASS | 1 pending row for doctorId 5d4cee... |
| T6 | Panel shows POST /sync — 1 ops: visit | ✅ PASS | |
| T7 | Panel shows POST /sync OK — 1 results: success | ❌ FAIL | "POST /sync OK — 1 results: error" |
| T8 | Panel shows markVisitSynced called | ❌ FAIL | Never reached |
| T9 | Panel shows drain: 0 pending rows after success | ❌ FAIL | Drain: 0 due to max_attempts exhaustion, not success |
| T10 | "session 12 test" visit card: Draft+cloud badge gone | ❌ FAIL | Visit not synced — [ERR]: operation-level error — expected boolean, received number |

### Phase 4 — Cross-session persistence (BUG-D3-DT1-2)

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | Logout — confirm NO M-6 "unsynced visits" warning | ⏭ SKIP | Blocked — visit failed to sync (BUG-D3-DT10-1 not resolved) |
| R2 | Re-login: 9999999999 / 000000 | ⏭ SKIP | Blocked |
| R3 | Navigate to D3 for Test Patient One | ⏭ SKIP | Blocked |
| R4 | "session 12 test" visit visible in history | ⏭ SKIP | Blocked — BUG-D3-DT1-2 still blocked |

---

## Bugs Found

### BUG-D3-DT12-1 (HIGH) — POST /sync rejected by server: "expected boolean, received number"; visit never syncs; data loss at logout
**Summary:** New visit created with current code (post BUG-D3-DT11-1 fix) reaches the server via POST /sync but is rejected with operation-level error: "expected boolean, received number". Visit hits max_attempts → marked failed → deleted at logout → data loss. BUG-D3-DT10-1 is not closed — the camelCase/snake_case fix resolved the field naming issue but exposed a type coercion issue: a boolean field in the visit payload is being sent as a SQLite integer (0 or 1) instead of a JavaScript boolean (true/false).
**Repro:** Login → D3 for Test Patient One → tap "+ New Visit" → enter complaint → save → observe SyncDebugPanel: POST /sync OK — 1 results: error, [ERR] operation-level error — expected boolean, received number.
**Likely root cause:** A boolean column in `visits_draft` (e.g. `consent_granted` or similar) is read from SQLite as 0/1 integer and passed directly into the enqueueOperation payload without explicit `Boolean()` conversion. Server's Zod/schema validation rejects the integer type.
**Impact:** Data loss. Every new visit fails to sync and is deleted at logout.
**Status:** OPEN — Builder session required.

---

## Session Summary

**Session 12 complete — 2026-04-04**

**Bug count:** 1 bug found: BUG-D3-DT12-1 (HIGH — POST /sync rejected with "expected boolean, received number"; visit not synced; data loss at logout)

**Results:**
- P1–P3: PASS — D3 loads, SyncDebugPanel visible
- P4: NOTE — pre-existing visit 05f1672c (old payload, pre-fix) exhausted max_attempts, now failed; queue clean at baseline
- T1–T4: PASS — BUG-D3-DT11-1 VERIFIED FIXED. Visit now enqueued into sync_queue; "enqueue: verify — pending rows: 1" confirmed
- T5–T6: PASS — Sync worker picks up row, POST /sync sent with 1 op
- T7–T10: FAIL — Server rejects with "expected boolean, received number"; markVisitSynced never called; Draft+cloud badge persists
- R1–R4: SKIP — BUG-D3-DT1-2 still blocked; visit never syncs

**BUG-D3-DT11-1 status:** VERIFIED FIXED ✅
**BUG-D3-DT10-1 status:** NOT VERIFIED — new error surface: "expected boolean, received number". Builder must identify which boolean field in the visit payload is sent as integer and add explicit boolean coercion.
**BUG-D3-DT1-2 status:** STILL BLOCKED — depends on BUG-D3-DT10-1 fix.

**Builder handoff decision:** Builder Agent session required before merge — items: BUG-D3-DT12-1 (HIGH, data loss — POST /sync rejected with "expected boolean, received number"; Builder must find boolean field(s) in visit payload sent as SQLite integer 0/1 and add explicit Boolean() coercion before enqueueOperation call)

---

SESSION COMPLETE — Next: Builder Agent — Fix BUG-D3-DT12-1 ("expected boolean, received number" in POST /sync visit payload; find boolean field read as SQLite integer; add explicit coercion)
Type 'exit' then 'claude' to start the next step.
