# D3 — Patient Detail / History
## Device Test Session 4

**Date:** 2026-03-28
**Agent:** Device Tester
**Source:** D3-device-test-session-3.md (verify BUG-D3-DT1-2 + BUG-D6-DT-1 fixes from Builder 2026-03-28)
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Test patient:** Test Patient One | mobile: 8888888888 | server ID: 9368bfcc-c2e3-479f-9d26-87dba9502fe7

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] Test credentials confirmed
- [x] ngrok tunnel: confirmed reachable (session-start)

---

## Session 4 Focus
1. **Verify BUG-D3-DT1-2 fix** — cross-session visit persistence after Builder's 2026-03-28 fix
2. **Verify BUG-D6-DT-1 fix** — Save button enables with chief complaint alone
3. **Deferred items from sessions 1–3:** #8, #29, #34, #43, #53

---

## Test Results

### BUG-D6-DT-1 Regression

| # | Item | Status | Notes |
|---|---|---|---|
| B6-R1 | Save button enabled after entering chief complaint only (no note, no scan) | ✅ | Confirmed. Fix working. |

### BUG-D3-DT1-2 Regression

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | New visit visible immediately in D3 after D6 save | ✅ | Two cards shown: "Cross session test" + "Fever and headache" |
| R2 | Visit shows Draft tag and date | ✅ | Draft label + today's date shown correctly |
| R3 | Visits persist across D3 navigation away/back | ✅ | Two cards still visible after nav away and back |
| R4 | Visit survives logout/re-login (cross-session) | ❌ | Only "Fever and headache" after re-login. See BUG-D3-DT4-1. |

### Deferred Items (from sessions 1–3)

| # | Item | Status | Notes |
|---|---|---|---|
| 8 | Visit card with no chief complaint renders cleanly | ✅ | Card with no chief complaint shown: clean render, today's date, Draft + cloud icon |
| 29 | Error state shown if fetch fails (not blank screen) | ⬜ | Not testable via verbal report — requires network manipulation |
| 34 | Visit cards with 1 record and 5+ records display count correctly | ⬜ | "Fever and headache" shows no record count (likely record_count=0). Needs visits with actual records. |
| 43 | Auth guard: navigate to D3 with no token → nothing rendered, no crash | ⬜ | Not testable via verbal report |
| 53 | Missing/malformed patient ID → error state, no crash | ⬜ | Not testable via verbal report |

---

## Bugs Found

### BUG-D3-DT4-1 — Visit disappears after logout/re-login (BUG-D3-DT1-2 fix unverified)

- **Severity:** HIGH
- **Status:** NEW — found session 4
- **Steps to reproduce:**
  1. Open D6 (New Visit) for Test Patient One
  2. Enter "Cross session test" in Chief Complaint
  3. Tap Save → navigate back to D3
  4. Confirm: D3 shows two visits ("Cross session test" + "Fever and headache") ✅
  5. Tap Log out
  6. Log back in → open D3 for Test Patient One
  7. Observe: only "Fever and headache" visible — "Cross session test" gone ❌
- **No M-6 warning dialog appeared** during step 5.
- **Diagnosis — two possible root causes (Builder to confirm):**
  - **Root cause A:** `createVisit` API call succeeded, `markVisitSynced` was called → `sync_status='synced'`. No M-6 dialog correct. `clearDoctorDraftVisits` should have preserved the row. But `getSyncedDraftVisitsNotInServer` is not surfacing it on re-login — possible query or parameter bug.
  - **Root cause B:** `createVisit` API call failed silently → `sync_status='pending'`. `countPendingDraftVisits` should return 1 and M-6 dialog should appear — but it didn't. M-6 warning has a bug. `clearDoctorDraftVisits` then deleted the pending row.
- **Code pointers:**
  - `src/db/visits.ts:294` — `clearDoctorDraftVisits` (SQL correct: `sync_status != 'synced'`)
  - `src/db/visits.ts:419` — `getSyncedDraftVisitsNotInServer` (query logic looks correct in isolation)
  - `src/screens/doctor/NewVisitScreen.tsx:361` — `markVisitSynced` call (inside try/catch — silent failure possible)
  - `src/hooks/useLogout.ts:54` — `countPendingDraftVisits` → M-6 warning (not triggered this session)
- **Builder recommendation:** Add logging at save time to confirm which branch was taken (API success vs silent failure). Verify `sync_status` value at logout time.

---

## Deferred Items Carried Forward

| Checklist # | Item | Reason | Fix By |
|---|---|---|---|
| 29 | Error state on fetch failure | Requires network manipulation | Before merge |
| 34 | Record count with 1 / 5+ records | Insufficient test data (need visits with attached records) | Before merge |
| 43 | Auth guard — no token | Requires token removal | Before merge |
| 53 | Malformed patient ID → error state | Requires nav param manipulation | Before merge |
| 11, 12, 38, 41 | Consent-false grayed state with other-doctor visits | Requires second test doctor account | Before merge |
| 14, 15, 16, 17 | Visual spec compliance (touch targets, contrast, palette, font) | Not testable via verbal device report | Before merge |
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
- BUG-D3-DT4-1 (HIGH) — visit disappears after logout/re-login; no M-6 warning appeared; BUG-D3-DT1-2 fix unverified

**Items confirmed this session:** B6-R1 ✅, R1 ✅, R2 ✅, R3 ✅, #8 ✅
**Items failed:** R4 ❌ (BUG-D3-DT4-1)
**Items deferred:** #29, #34, #43, #53 and carry-forward list above

**Builder handoff decision:** Builder Agent session required before merge — items: BUG-D3-DT4-1

**SESSION COMPLETE — Next: Builder Agent — fix BUG-D3-DT4-1 — D3 Patient Detail cross-session visit persistence**
