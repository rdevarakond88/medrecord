# D3 — Patient Detail / History
## Device Test Session 5

**Date:** 2026-03-29
**Agent:** Device Tester
**Source:** D3-device-test-session-4.md — verify BUG-D3-DT4-1 fix + BUG-D3-DT1-2 re-verification
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Test patient:** Test Patient One | mobile: 8888888888 | server ID: 9368bfcc-c2e3-479f-9d26-87dba9502fe7

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] Test credentials confirmed
- [ ] ngrok tunnel: pending confirmation at session start

---

## Session 5 Focus
1. **Verify BUG-D3-DT4-1 fix** — M-6 dialog must appear (or visit must survive) when unsynced visits exist at logout; specifically tests the 'pending' row path (most reproducible without network manipulation)
2. **Re-verify BUG-D3-DT1-2 fix** — cross-session visit persistence (the same R4 test that failed in session 4)

---

## Test Results

### BUG-D3-DT4-1 Regression (Primary Focus)

| # | Item | Status | Notes |
|---|---|---|---|
| T1 | New visit saves correctly and appears in D3 immediately | ✅ | "Session 5 test" card appeared under visit history with cloud + Draft tag |
| T2 | Logging out with a pending/unsynced visit: M-6 "Unsynced visits" dialog appears | ✅ | Dialog appeared correctly; fix confirmed working |
| T3 | Tapping "Stay logged in" in M-6 dialog: logout cancelled, visit still visible | ✅ | Logout aborted; user remained in app; visit still visible on D3 |
| T4 | Logging out (confirmed via "Log out") and re-login: if visit was synced before logout, it is visible in D3 | ⬜ | BLOCKED — cannot verify synced-visit path because sync worker is not completing (see BUG-D3-DT5-1) |

### BUG-D3-DT1-2 Regression (Cross-Session Persistence)

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | New visit visible immediately in D3 after D6 save | ✅ | Visit card shown immediately after D6 save |
| R2 | Visit shows Draft tag and cloud icon | ✅ | Cloud icon + Draft tag visible as expected |
| R3 | Visits persist across D3 navigation away/back | ✅ | Visit still visible after "Stay logged in" + navigate back |
| R4 | Visit survives logout/re-login (cross-session) | ⬜ | BLOCKED — requires sync to complete first; sync worker not running (BUG-D3-DT5-1) |

---

## Bugs Found

### BUG-D3-DT5-1 — Sync worker not uploading visits; visit stuck in 'pending' indefinitely

- **Severity:** HIGH
- **Status:** NEW — found session 5
- **Steps to reproduce:**
  1. Log in with active internet connection (backend 200 OK confirmed)
  2. Open D6 → create a new visit → tap Save
  3. Observe: visit card shows cloud icon + "Draft" tag (pending sync) ✅ expected
  4. Background the app for 3+ seconds (AppState active trigger) and return
  5. Wait 30+ seconds (sync worker 5-min interval not yet elapsed but AppState trigger should have fired)
  6. Tap Log out → M-6 dialog still appears ("Unsynced visits")
  7. Navigate back to D3 → cloud icon still visible on visit card
- **Expected:** Sync worker uploads visit within seconds of AppState active with internet connected; cloud icon disappears; M-6 dialog does not appear on logout
- **Actual:** Visit remains 'pending' after 30+ seconds with internet connected. M-6 dialog always appears.
- **Impact:** Every visit created will always trigger M-6 at logout. Doctors who confirm logout lose every locally-created visit. Cross-session persistence (BUG-D3-DT1-2 synced path) cannot be verified until this is fixed.
- **Code pointers to investigate:**
  - `src/sync/syncWorker.ts` — drain loop logic, AppState / NetInfo triggers
  - `src/sync/useSyncWorker.ts` — hook mounting, trigger subscriptions
  - `src/screens/doctor/NewVisitScreen.tsx` — does enqueueOperation put entry in sync_queue?
  - Check if sync_queue has any entries after save (SQLite query)
  - Check if sync worker is mounted in App.tsx (`SyncWorkerMount`)

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

**Status:** COMPLETE
**Bugs found:** 1
- BUG-D3-DT5-1 (HIGH) — Sync worker not uploading visits; every visit stays 'pending' indefinitely even with active internet. M-6 always appears at logout. Blocks BUG-D3-DT1-2 re-verification.

**BUG-D3-DT4-1 fix status:** VERIFIED ✅ — M-6 dialog now correctly fires when unsynced visits exist; "Stay logged in" correctly aborts logout.

**BUG-D3-DT1-2 re-verification:** BLOCKED ⬜ — cannot test the synced-visit cross-session path until BUG-D3-DT5-1 is fixed.

**Items confirmed this session:** T1 ✅, T2 ✅, T3 ✅, R1 ✅, R2 ✅, R3 ✅
**Items blocked:** T4 ⬜, R4 ⬜ (both require BUG-D3-DT5-1 fix)

**Builder handoff decision:** Builder Agent session required before merge — items: BUG-D3-DT5-1

**SESSION COMPLETE — Next: Builder Agent — fix BUG-D3-DT5-1 (sync worker not uploading visits) — D3 Patient Detail**
