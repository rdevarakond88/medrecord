# D3 — Patient Detail / History
## Device Test Session 7

**Date:** 2026-03-29
**Agent:** Device Tester
**Source:** D3-device-test-session-6.md — verify BUG-D3-DT6-1 fix + BUG-D3-DT5-1 re-verify + BUG-D3-DT1-2 cross-session persistence
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Test patient:** Test Patient One | mobile: 8888888888 | server ID: 9368bfcc-c2e3-479f-9d26-87dba9502fe7

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] Test credentials confirmed
- [ ] ngrok tunnel: pending user confirmation

---

## Session 7 Focus
1. **Verify BUG-D3-DT6-1 fix** — `isOnline()` in `useSyncWorker.ts` changed from `=== true` to `!== false`; console logging added throughout sync worker chain
2. **Verify BUG-D3-DT5-1 fix** — `runSyncWorker` reads `doctorId` from `useAuthStore.getState()` at call time (was unverified in session 6 due to BUG-D3-DT6-1 blocking)
3. **BUG-D3-DT1-2 re-verification** — visit survives logout → re-login (cross-session persistence, synced path)

---

## Test Results

### Phase 1 — Sync verification (BUG-D3-DT6-1 + BUG-D3-DT5-1)

| # | Item | Status | Notes |
|---|---|---|---|
| T1 | Login → D2: patient search loads | ✅ PASS | |
| T2 | Search for Test Patient One (8888888888) → navigate to D3 | ✅ PASS | Visit history card visible on D3 |
| T3 | Create new visit in D6 ("session 7 test") → returns to D3 → card visible with Draft + cloud | ✅ PASS | Card visible with Draft label + cloud icon |
| T4 | Background app (Home button) → foreground → sync completes (Draft + cloud disappear) | ❌ FAIL | Draft + cloud still visible after foreground — BUG-D3-DT6-1 NOT fixed |
| T5 | Navigate away (D2) → return to D3 → sync complete state still reflected | ❌ FAIL | Draft + cloud still visible after nav away and return |

### Phase 2 — Cross-session persistence (BUG-D3-DT1-2)

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | Logout from app | ✅ PASS | |
| R2 | Re-login with same credentials | ✅ PASS | |
| R3 | Navigate to D3 for Test Patient One | ✅ PASS | |
| R4 | Visit created this session visible (synced, no Draft label) | ❌ FAIL | Session 7 visit not visible — sync never completed so visit never uploaded; BUG-D3-DT1-2 re-verification blocked by sync failure |

---

## Bugs Found

### BUG-D3-DT7-1 (carried from DT6-1) — HIGH
**Summary:** Sync worker still not completing on iOS. Draft + cloud icon persist after AppState foreground trigger and navigation cycle. BUG-D3-DT6-1 fix (`isOnline() !== false`) did not resolve the issue.
**Repro:** Login → D3 → create visit in D6 → return to D3 → background → foreground → Draft + cloud remain. Navigate away and back → still Draft + cloud.
**Impact:** Visits never upload. Cross-session persistence (BUG-D3-DT1-2) cannot be verified because visits never reach the server.
**Status:** OPEN — requires deeper Builder investigation (console logs added in DT6 builder session; need Expo Go console output or alternative debug strategy)

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

**Session 7 complete — 2026-03-29**

**Results:**
- T1, T2, T3: PASS — login, search, D3 navigation, visit creation all work
- T4, T5: FAIL — BUG-D3-DT6-1 fix not effective; sync worker still not triggering on iOS
- R1, R2, R3: PASS — logout and re-login flow works
- R4: FAIL — BUG-D3-DT1-2 re-verification blocked (visit never synced, so not visible after re-login)

**Root issue:** Sync worker is not running on device despite all three triggers (AppState, NetInfo, 5-min interval). The `isOnline() !== false` fix was insufficient. Deeper investigation needed — the console logs added by the Builder in DT6 session are not visible via verbal device testing; a different debug approach is required.

**BUG-D3-DT1-2 status:** Cannot verify until sync works. Blocked.
