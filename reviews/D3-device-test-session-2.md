# D3 — Patient Detail / History
## Device Test Session 2

**Date:** 2026-03-28
**Agent:** Device Tester
**Source:** D3-device-test-session-1.md (session 2 — verify BUG-D3-DT1-1 fix + work through deferred items)
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**ngrok tunnel:** exp://8w4qx5q-anonymous-8082.exp.direct
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Test patient:** Test Patient One | mobile: 8888888888 | server ID: 9368bfcc-c2e3-479f-9d26-87dba9502fe7

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] Test credentials confirmed
- [x] ngrok tunnel: confirmed reachable (session-start)

---

## Session 2 Focus
1. **Verify BUG-D3-DT1-1 fix** — D6 draft visits must appear in D3 after save when createVisit() fails silently
2. **Work through deferred items** testable in single-doctor setup

---

## Test Results

### BUG-D3-DT1-1 Regression Test

| # | Item | Status | Notes |
|---|---|---|---|
| R1 | Save a new visit in D6 and return to D3 — visit appears in list | ❌ | "Cough and cold" visit absent; only old "Fever and headache" visible |
| R2 | D3 shows the draft visit card with "Draft" label | ❌ | Visit not rendered at all |
| R3 | Visit persists across D3 navigation away and back | 🔶 | Deferred — R1 failed |

### Section 1 — Visual Layout (deferred items from session 1)

| # | Item | Status | Notes |
|---|---|---|---|
| 8 | Visit card with no chief complaint renders cleanly | ⬜ | |

### Section 3 — Data Loading & States (deferred items)

| # | Item | Status | Notes |
|---|---|---|---|
| 29 | Error state shown if fetch fails | ⬜ | |
| 34 | Visit card with 1+ scan records displays correctly | ⬜ | |

### Section 5 — Security (deferred items)

| # | Item | Status | Notes |
|---|---|---|---|
| 43 | Auth guard: navigate to D3 with no token → nothing rendered (no crash) | ⬜ | |

### Section 6 — Navigation (deferred items)

| # | Item | Status | Notes |
|---|---|---|---|
| 53 | Missing/malformed patient ID → error state, no crash | ⬜ | |

---

## Bugs Found

### BUG-D3-DT1-2 — BUG-D3-DT1-1 fix does not resolve symptom: new visit still absent from D3

- **Severity:** HIGH
- **Relates to:** BUG-D3-DT1-1 (fix in commit fb6fe40 did not resolve the symptom)
- **Steps to reproduce:**
  1. Backend live (200 OK confirmed). Log in as Dr. Test Doctor.
  2. Open D3 for Test Patient One.
  3. Tap "+ New Visit". Enter chief complaint "Cough and cold". Tap Save.
  4. D6 navigates back to D3 without error (SQLite write confirmed successful).
  5. Observe D3 visit list.
- **Expected:** "Cough and cold" visit appears in D3 visit list (either merged from visits_draft or from server response).
- **Actual:** Only prior "Fever and headache" visit visible. New visit absent.
- **Root cause — CONFIRMED (Mode A):**
  - `createVisit()` **succeeded** on the server. `markVisitSynced()` was called → `sync_status = 'synced'` in `visits_draft`.
  - `getPendingDraftVisits` correctly returns `[]` (only queries `sync_status='pending'`). This is expected behaviour — not a bug in the fix.
  - `GET /patients/:id/visits` (Render.com live server) does **not** return the newly created visit in `my_visits`. The online path has no source for the visit.
  - Offline `getCachedVisits` has **no** `sync_status` filter — returns ALL `visits_draft` rows including `'synced'` ones → visit visible offline.
  - **Confirmed by:** Two independent saves in this session ("Cough and cold", then a second visit). Both absent from online D3. Both visible on offline D3. Only "Fever and headache" (created in a prior session, genuinely server-persisted) shows online. This rules out a one-off network race and confirms a systematic server-side failure to return current-session visits via GET.
- **Gap in BUG-D3-DT1-1 fix:** The fix only covers "server call failed, `sync_status='pending'`". It has no coverage for "server call succeeded but `GET /patients/:id/visits` does not return the new visit" (`sync_status='synced'`). This is a separate, uncovered failure mode.
- **Builder fix options:**
  - **Option A (recommended):** In D3's online `fetchData`, after merging `pendingDrafts` + `serverMapped`, also include `visits_draft` rows where `sync_status='synced'` AND `server_id` is NOT present in the server response IDs. This covers both failure modes without duplicates.
  - **Option B:** Investigate and fix the server-side issue where `GET /patients/:id/visits` does not immediately return a visit created via `POST /visits` in the same session. If fixed, Mode A disappears and BUG-D3-DT1-1 fix handles Mode B correctly.
  - Option A is a more resilient client-side fix that tolerates future server inconsistencies.

---

## Deferred Items Carried Forward

_(items still deferred from session 1 that require second test doctor or unbuilt screens)_

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
**Bugs found:** 1 new — BUG-D3-DT1-2 (HIGH). BUG-D3-DT1-1 from session 1 remains unresolved (fix does not cover the confirmed failure mode).
**Items confirmed this session:** R1 ❌, R2 ❌ (fix not resolving symptom)
**Items deferred:** R3 + all remaining deferred items (online visit list unreliable until BUG-D3-DT1-2 fixed)

**Builder handoff decision:** Builder Agent session required before merge — items: BUG-D3-DT1-2
- Investigate why GET /patients/:id/visits does not return visits created in the current session (server-side)
- Implement Option A client-side fix: in online fetchData, also include visits_draft rows where sync_status='synced' AND server_id not already in server response — closes the coverage gap for both failure modes
- After fix: resume D3 device test session 3 to verify and complete remaining checklist items

**SESSION COMPLETE — Next: Builder Agent — fix BUG-D3-DT1-2 — D3 Patient Detail Screen**
