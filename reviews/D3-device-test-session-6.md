# D3 — Patient Detail / History
## Device Test Session 6

**Date:** 2026-03-29
**Agent:** Device Tester
**Source:** D3-device-test-session-5.md — verify BUG-D3-DT5-1 fix + BUG-D3-DT1-2 re-verification
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Test patient:** Test Patient One | mobile: 8888888888 | server ID: 9368bfcc-c2e3-479f-9d26-87dba9502fe7

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] Test credentials confirmed
- [x] ngrok tunnel: confirmed (user reached Login screen)

---

## Session 6 Focus
1. **Verify BUG-D3-DT5-1 fix** — visits should sync after fresh-login; Draft + cloud icon should clear
2. **Re-verify BUG-D3-DT1-2** — visit survives logout → re-login (cross-session persistence, synced path)

---

## Test Results

### BUG-D3-DT5-1 Regression (Primary Focus)

| # | Item | Status | Notes |
|---|---|---|---|
| T1 | Fresh login → D2 → D3: existing visit ("fever and headache") visible | ✅ | Visit card visible with Draft label |
| T2 | Create new visit in D6 ("session 6 test") → returns to D3 → card visible with Draft + cloud | ✅ | Expected state immediately post-save |
| T3 | Background app (Home button) → foreground → sync completes (cloud + Draft disappear) | ❌ | FAIL — Draft + cloud still present after background/foreground cycle. Red "could not verify consent" banner and amber "request access" banner appeared (expected — test patient has no consent; confirms D3 is online and API-reachable) |
| T4 | Navigate away (D2) → return to D3 → sync complete state reflected | ❌ | FAIL — Draft + cloud still present after full navigation cycle (useFocusEffect re-read). Sync has not completed. |

### BUG-D3-DT1-2 Regression (Cross-Session Persistence)

| # | Item | Status | Notes |
|---|---|---|---|
| R4 | Visit survives logout/re-login (cross-session, synced path) | ⬜ | BLOCKED — requires sync to complete first |

---

## Bugs Found

### BUG-D3-DT6-1 — Sync still not completing after BUG-D3-DT5-1 fix

- **Severity:** HIGH
- **Status:** NEW — found session 6
- **Summary:** The BUG-D3-DT5-1 fix was applied (verified in code — `runSyncWorker` now reads `doctorId` from `useAuthStore.getState()` at call time). Despite this, visits still do not sync after a fresh-login session. Draft + cloud icon persist indefinitely.

**Evidence that the network and triggers ARE working:**
1. D3 shows a red "could not verify consent" banner after backgrounding → foregrounding: this means D3's AppState listener fired, `isOnline = true` (D3's `useNetworkStatus` returned true), and an API call reached the server. Network is unambiguously reachable.
2. Multiple background/foreground cycles performed — AppState triggers fire.
3. Navigation cycle (D3 → D2 → D3) forces fresh `useFocusEffect` + `fetchData` — SQLite re-read still shows Draft + cloud. Not a UI refresh race.

**Code investigation (read-only):**
- `useSyncWorker.ts`: fix looks correct. `doctorId` is intentionally not captured at mount; `runSyncWorker` receives only `db`.
- `syncWorker.ts` line 278–280: reads `{ token, user }` from `useAuthStore.getState()` at call time → `doctorId = user.id`. Fix is present.
- `NewVisitScreen.tsx` line 329: `enqueueOperation` called with `doctor_id: user.id`. Same `user.id` at enqueue and drain time — should match.
- `pinnedFetch.ts` line 72–83: Expo Go fallback to standard `fetch` is present and correct. Not a blocker.
- No obvious `doctor_id` mismatch found.

**No failed draft state observed:** Visit still shows Draft (not failed-draft UI) → `sync_queue` entry still `pending`, attempts < max_attempts. Sync worker either not running or running but not yet exhausting attempts.

**Hypotheses for Builder (in priority order):**
1. The sync worker IS being triggered but `POST /sync` returns a non-401 error (e.g. 4xx for unrecognized patient, missing field, or server-side validation failure). Error is caught silently, attempts increment slowly. Need console logging at the `postSyncBatch` call to confirm.
2. The sync worker IS being triggered and `isOnline(state)` passes, but `runSyncWorker` exits before the drain loop for an unlogged reason (e.g. `!token || !user` guard fires unexpectedly).
3. The sync worker is NOT being triggered — `NetInfo.fetch()` in the AppState handler resolves with `isInternetReachable: null` (possible on some iOS setups even when API calls work, since D3's `isOnline` state could have been set earlier and persisted in React state while NetInfo's point-in-time fetch returns null).
4. `doctor_id` in `sync_queue` stored during enqueue differs from what `useAuthStore.getState().user.id` returns at drain time (e.g. if a re-login changed the user object).

**Files to investigate:**
- `src/sync/syncWorker.ts` — add logging at: guard check, drain query result count, `postSyncBatch` call/response, error catch blocks
- `src/sync/useSyncWorker.ts` — add logging at: AppState handler, `isOnline(state)` result, `runSyncWorker` call
- `src/db/schema.ts` — verify `sync_queue` table has entries with correct `doctor_id` and `status = 'pending'` after a visit save

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
- BUG-D3-DT6-1 (HIGH) — Sync still not completing after BUG-D3-DT5-1 fix. Visit remains Draft + cloud after multiple AppState triggers and a full navigation cycle. Network confirmed reachable (D3 consent check reaches server). Root cause unknown — needs Builder investigation with added logging.

**BUG-D3-DT5-1 fix status:** NOT VERIFIED ❌ — code fix is present but sync still does not complete on device.

**BUG-D3-DT1-2 re-verification:** BLOCKED ⬜ — requires sync to complete first.

**Items confirmed this session:** T1 ✅, T2 ✅
**Items failed:** T3 ❌, T4 ❌
**Items blocked:** R4 ⬜ (requires BUG-D3-DT6-1 fix)

**Bug count:** 1 bug found: BUG-D3-DT6-1 (HIGH)
**Builder handoff decision:** Builder Agent session required before merge — items: BUG-D3-DT6-1

**SESSION COMPLETE — Next: Builder Agent — investigate + fix BUG-D3-DT6-1 (sync still not completing after DT5-1 fix) — D3 Patient Detail**
