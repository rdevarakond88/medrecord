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
| T1 | Login → D2: patient search loads | ⬜ | |
| T2 | Search for Test Patient One (8888888888) → navigate to D3 | ⬜ | |
| T3 | Create new visit in D6 ("session 7 test") → returns to D3 → card visible with Draft + cloud | ⬜ | |
| T4 | Background app (Home button) → foreground → sync completes (Draft + cloud disappear) | ⬜ | |
| T5 | Navigate away (D2) → return to D3 → sync complete state still reflected | ⬜ | |

### Phase 2 — Cross-session persistence (BUG-D3-DT1-2)

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | Logout from app | ⬜ | |
| R2 | Re-login with same credentials | ⬜ | |
| R3 | Navigate to D3 for Test Patient One | ⬜ | |
| R4 | Visit created this session visible (synced, no Draft label) | ⬜ | |

---

## Bugs Found

_(none yet)_

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

_(in progress)_
