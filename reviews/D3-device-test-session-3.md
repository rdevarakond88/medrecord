# D3 — Patient Detail / History
## Device Test Session 3

**Date:** 2026-03-28
**Agent:** Device Tester
**Source:** D3-device-test-session-2.md (verify BUG-D3-DT1-2 fix + remaining deferred items)
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

## Session 3 Focus
1. **Verify BUG-D3-DT1-2 fix** — D3 must show new visit after save when server GET does not immediately return it (synced-but-absent mode)
2. **Deferred items now testable:** #8, #29, #34, #43, #53

---

## Test Results

### BUG-D3-DT1-2 Regression Test

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | Save a new visit in D6 → D3 shows it immediately | ❌ | Visits from prior sessions still absent at D3 on session 3 open. Fix not resolving symptom. |
| R2 | D3 shows the visit card (Draft or live label) | ❌ | Not rendered — blocked by R1 |
| R3 | Visit persists across D3 navigation away and back | 🔶 | Deferred — R1 failed |

### Deferred Items (from sessions 1 & 2)

| # | Item | Status | Notes |
|---|---|---|---|
| 8 | Visit card with no chief complaint renders cleanly | ⬜ | |
| 29 | Error state shown if fetch fails (not a blank screen) | ⬜ | |
| 34 | Visit cards with 1 record and 5+ records display record count correctly | ⬜ | |
| 43 | Auth guard: navigate to D3 with no token → nothing rendered, no crash | ⬜ | |
| 53 | Missing/malformed patient ID → error state, no crash | ⬜ | |

---

## Bugs Found

### BUG-D3-DT1-2 (STILL OPEN) — Fix from commit d94dc63 does not resolve symptom

- **Severity:** HIGH
- **Status:** Persists into session 3. Prior sessions' visits still absent from D3 online view.
- **Code confirmed present:** `getSyncedDraftVisitsNotInServer` is imported and called in `PatientDetailScreen.tsx:178`. Logic is correct in isolation.
- **Probable root causes (Builder to confirm):**
  - **Root cause A (most likely):** `clearDoctorDraftVisits()` is called in `useLogout` — if the user logged out between session 2 and session 3, the `visits_draft` rows (sync_status='synced') were deleted. The fix has no data to merge. The server also does not return those visits. Net result: visits invisible on both paths.
  - **Root cause B:** Expo Go serving a stale cached bundle — old code is running, not the fix. Force-quit and reload required.
  - **Root cause C:** Server never durably stored the session 2 visits (POST accepted but DB write failed silently on Render free tier). No path to recovery on client.
- **Why the fix is incomplete in any case:** `getSyncedDraftVisitsNotInServer` only works within the same login session. Once `clearDoctorDraftVisits()` runs on logout, synced draft rows are permanently gone. Any server-side propagation delay that spans a logout/login cycle makes those visits permanently invisible. The fix does not cover cross-session survival.

### BUG-D6-DT-1 — D6 Save button requires note or scan; chief complaint alone is insufficient

- **Severity:** MEDIUM
- **Steps to reproduce:**
  1. Navigate to D6 (New Visit) for any patient
  2. Enter text in the Chief Complaint field only (e.g. "Cough and cold")
  3. Leave the Note field empty and attach no scan
  4. Observe Save button
- **Expected:** Save button is enabled — chief complaint is meaningful clinical data; a visit should be saveable with chief complaint alone.
- **Actual:** Save button remains disabled/greyed. `hasRecord = noteText.trim().length > 0 || scan !== null` — chief complaint is not included in this gate. Note or scan is required.
- **Code location:** `src/screens/doctor/NewVisitScreen.tsx` — `const hasRecord = noteText.trim().length > 0 || scan !== null` (line ~168). `handleSave` returns early if `!hasRecord` (line ~273).
- **UX conflict:** Chief complaint field is labelled "(optional)" and the note placeholder reads "Add a note (optional when scan is present)…" — the label says optional but the save gate says required.
- **Impact:** Violates the product-vision "under 60 seconds" design goal. A doctor recording only a chief complaint cannot save without adding a note — adds friction to the fastest-path use case.

---

## Deferred Items Carried Forward

_(to be updated at session end)_

| Checklist # | Item | Reason | Fix By |
|---|---|---|---|
| 11, 12, 38, 41 | Consent-false grayed state with other-doctor visits | Requires second test doctor account | Before merge |
| 14, 15, 16, 17 | Visual spec compliance (touch targets, contrast, palette, font) | Not testable via verbal device report | Before merge |
| 19, 51 | View Full Visit → D4 | D4 not built | When D4 built |
| 25, 55 | Scroll with 10+/20+ visits | Limited test data | Before merge |
| 39, 40, 52 | Request Access → D9 | D9 not built | When D9 built |
| 44, 48 | Cross-doctor isolation | Requires second test doctor | Before merge |
| 47 | No PII in console logs | Not testable via verbal report | Before merge |
| 57 | No unnecessary re-renders | Not testable via verbal report | Before merge |

---

## Session Summary

**Status:** COMPLETE
**Bugs found:** 2
- BUG-D3-DT1-2 (HIGH) — still open; fix from commit d94dc63 does not resolve symptom; D3 shows only "Fever and headache", all newer visits absent
- BUG-D6-DT-1 (MEDIUM) — D6 Save disabled with chief complaint only; note or scan required

**Items confirmed this session:** R1 ❌, R2 ❌ (fix not working)
**Items deferred:** R3, #8, #29, #34, #43, #53 — all blocked by or dependent on working visit list

**Builder handoff decision:** Builder Agent session required before merge — items: BUG-D3-DT1-2, BUG-D6-DT-1

**SESSION COMPLETE — Next: Builder Agent — fix BUG-D3-DT1-2 + BUG-D6-DT-1 — D3 Patient Detail / D6 New Visit**
