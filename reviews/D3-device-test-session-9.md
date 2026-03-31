# D3 — Patient Detail / History
## Device Test Session 9

**Date:** 2026-03-30
**Agent:** Device Tester
**Source:** D3-device-test-session-8.md — verify BUG-D3-DT8-1 fix via SyncDebugPanel; re-verify BUG-D3-DT5-1; verify BUG-D3-DT1-2
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Test patient:** Test Patient One | mobile: 8888888888 | server ID: 9368bfcc-c2e3-479f-9d26-87dba9502fe7

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] Test credentials confirmed
- [x] ngrok tunnel confirmed
- [x] App open on device (user confirmed logged in, dev server running)

---

## Session 9 Focus
1. **Observe SyncDebugPanel** — new pale yellow overlay added by Builder (BUG-D3-DT8-1). Identify exactly where the sync trigger chain breaks on iOS.
2. **Verify BUG-D3-DT7-1** — sync worker completes after foreground trigger.
3. **Verify BUG-D3-DT5-1** — doctorId read at call time (not stale ref).
4. **Verify BUG-D3-DT1-2** — visit survives logout → re-login.

---

## Test Results

### Phase 1 — SyncDebugPanel baseline

| # | Item | Status | Notes |
|---|---|---|---|
| P1 | Navigate to D3 for Test Patient One | ✅ PASS | |
| P2 | SyncDebugPanel visible (pale yellow strip, `[DEBUG] SYNC` in orange) | ✅ PASS | Visible after reloading bundle in Expo Go (shake → Reload) |
| P3 | Panel header shows `idle`, log shows timestamps at 23:39:47 | ✅ PASS | Multiple events visible at baseline — sync fired on navigation |

### Phase 2 — Create visit and observe sync cycle

| # | Item | Status | Notes |
|---|---|---|---|
| T1 | Tap "+ New Visit", enter "session 9 test", save | ✅ PASS | Returned to D3; new card visible with Draft + cloud |
| T2 | Panel shows AppState trigger fired: `T1 AppState -> active - con:true, reach:true, will sync:true` @ 23:42:24 | ✅ PASS | Trigger chain IS working — online check passes |
| T3 | Panel shows `T1 running sync` @ 23:42:24 | ✅ PASS | runSyncWorker IS being called |
| T4 | Wait 10s → Panel shows `drain: 0 pending rows` @ 23:44:59 | ⚠️ UNEXPECTED | Drain ran but found 0 pending rows — visit NOT in sync_queue as 'pending' |
| T5 | Draft + cloud still visible after navigating D3 → D2 → D3 | ❌ FAIL | useFocusEffect re-fetch did not clear Draft + cloud |

### Phase 3 — BUG-D3-DT1-2 cross-session persistence

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | Logout | ✅ PASS | M-6 warning appeared ("unsaved visits" warning) — confirms visit was in 'failed' state at logout |
| R2 | Re-login 9999999999 / 000000 | ✅ PASS | |
| R3 | Navigate to D3 for Test Patient One | ✅ PASS | |
| R4 | "session 9 test" visit visible (no Draft label) | ❌ FAIL | Visit completely absent — never reached server; deleted at logout |

---

## Key Diagnostic Findings (from SyncDebugPanel)

The debug panel provided the first definitive diagnosis of the iOS sync failure after 5 failed builder sessions. Findings:

1. **Sync trigger chain: WORKING** — AppState foreground trigger fires correctly on iOS (`isConnected !== false` fix from DT7 is not the issue; triggers do fire).
2. **runSyncWorker: CALLED** — `T1 running sync` confirms the worker function executes.
3. **doctorId: CORRECT** — Panel shows `doctorId: 5D4CEE3D-0B3F-4D3B-9407-68936F339214` — same ID used throughout, no mismatch.
4. **Drain finds 0 pending rows** — the visit's sync_queue entry was NOT in 'pending' status when drain ran at 23:44:59.
5. **M-6 warning at logout** — confirms visit was in `sync_status = 'failed'` at logout (hit max_attempts, dead-lettered).
6. **Visit absent after re-login** — server never received the visit; permanent data loss on logout.

**Root cause interpretation:** POST /sync (the sync worker's upload call) is failing consistently on iOS Expo Go — not the trigger chain. The visit goes through 5 failed POST /sync attempts, reaches max_attempts, is dead-lettered as 'failed', and is deleted at logout. The direct `createVisit` call in D6 is also failing (otherwise the visit would reach the server before the sync worker runs at all).

**Most likely causes for Builder to investigate:**
- `pinnedFetch` behaviour on iOS Expo Go (SSL pinning module may reject connections or fail silently in Expo Go environment — noted in MEMORY.md as "does NOT work in Expo Go")
- POST /sync endpoint returning an error not caught/logged by the sync worker
- Auth token invalid or not passed correctly by the sync worker's POST /sync call
- The sync worker's POST /sync call may be timing out or being blocked by iOS on Expo Go

---

## Bugs Found

### BUG-D3-DT9-1 (HIGH) — POST /sync and createVisit both fail on iOS Expo Go; visits deleted at logout
**Summary:** Visits created in D6 never reach the server on iOS Expo Go. Both the direct `createVisit` call (D6 step 3) and the sync worker's POST /sync fail silently. After 5 sync attempts, the visit is dead-lettered ('failed') and deleted from `visits_draft` at logout. The server never has the visit.
**Repro:** Login → D3 → create visit in D6 → return to D3 → observe Draft + cloud persists indefinitely → logout (M-6 warning appears) → re-login → visit absent.
**Evidence:** SyncDebugPanel shows `drain: 0 pending rows` (visit hit max_attempts → 'failed') + M-6 logout warning + visit absent after re-login.
**Root cause:** Unknown — POST /sync and createVisit API calls failing on iOS Expo Go. pinnedFetch behaviour in Expo Go is the primary suspect (noted in MEMORY.md as incompatible with Expo Go — requires EAS custom build).
**Impact:** Data loss. Every visit created on iOS Expo Go is silently lost at logout.
**Status:** OPEN — Builder session required.

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

**Session 9 complete — 2026-03-30**

**Bug count:** 1 bug found: BUG-D3-DT9-1 (HIGH — data loss, visits never reach server on iOS Expo Go)

**Results:**
- P1, P2, P3: PASS — SyncDebugPanel visible and logging events after bundle reload
- T1, T2, T3: PASS — trigger chain and runSyncWorker call confirmed working
- T4: UNEXPECTED — drain found 0 pending rows (visit already dead-lettered by max_attempts failures)
- T5: FAIL — Draft + cloud persists after navigation
- R1: PASS (with M-6 warning — confirms 'failed' state at logout)
- R2, R3: PASS
- R4: FAIL — visit absent after re-login (data loss)

**Key breakthrough:** SyncDebugPanel confirmed the iOS sync trigger chain IS working. The failure is in the network calls (POST /sync and createVisit), not the trigger mechanism. Five previous Builder sessions targeted the trigger chain — all the wrong layer. The correct target is `pinnedFetch` behaviour on iOS Expo Go.

**Builder handoff decision:** Builder Agent session required before merge — items: BUG-D3-DT9-1 (HIGH, data loss).

**BUG-D3-DT1-2 status:** Still blocked — visit never syncs, so cross-session persistence cannot be verified until BUG-D3-DT9-1 is fixed.

---

SESSION COMPLETE — Next: Builder Agent — investigate BUG-D3-DT9-1 (pinnedFetch on iOS Expo Go causing POST /sync and createVisit to fail silently — data loss)
Type 'exit' then 'claude' to start the next step.
