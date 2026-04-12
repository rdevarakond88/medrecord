# D5 — New Patient Form
## Device Test Session 1

**Date:** 2026-04-11
**Agent:** Device Tester
**Source:** Builder Step 9 complete (2026-04-11) — all QA findings C1+C2+E1+H1+H2+H3+H4 fixed. Device test against `reviews/D5-qa-test-plan.md`.
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Fresh mobiles used:** 7777700001–7777700012

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] Test credentials confirmed
- [x] ngrok tunnel confirmed: exp://ilswcbg-anonymous-8082.exp.direct
- [x] App open on device — user logged in at Patient Search screen

---

## Test Results

### Happy Path

| # | Test | Status | Notes |
|---|---|---|---|
| HP-1 | D5 opens from D2 FAB; mobile prefilled + non-editable, name/DOB/gender blank, Save enabled, no offline banner | ✅ PASS | |
| HP-2 | Fill name + DOB + gender → Save → navigates to D6 | ✅ PASS | No spinner visible — likely too brief to observe on fast device/network |
| HP-3 | D6 header shows patient name + last 5 digits, amber consent alert, Save Visit disabled until complaint entered | ✅ PASS | |
| HP-4 | Save with name only (no DOB, no gender) → D6 | ✅ PASS | |
| HP-5 | Save with all fields blank → D6 (mobile-only patient) | ✅ PASS | |
| HP-6 | D5-created patient appears in D2 recent list after back-nav | ❌ FAIL | "No patients yet" shown — patients created via D5 never appear in recent list without typing; only surface when actively searched. Likely `getRecentPatients()` only includes patients accessed via D2 search, not D5 creation. |

### Fix Verifications

| # | Test | Status | Notes |
|---|---|---|---|
| H1 | Back from D6 → D5 Save button not stuck in spinner | ✅ PASS | H1 fix confirmed — `setIsSaving(false)` before navigate working |
| H2 | DOB Clear button visible after date selected; clears to blank | ✅ PASS | H2 fix confirmed |

### Offline Scenarios

| # | Test | Status | Notes |
|---|---|---|---|
| OFF-1 | Airplane mode → D5 shows offline banner; Save button shows "(Offline)"; navigates to D6 | ✅ PASS | Clean test with 7777700009. Offline path works correctly on fresh mobile. |
| OFF-3 | Sync worker picks up patient after connectivity restored | ⏭ SKIP | SyncDebugPanel only on D3 — cannot verify from D6 without SQLite inspection |

### Edge Cases

| # | Test | Status | Notes |
|---|---|---|---|
| EC-3 | SQL injection string in name field — saved safely, navigates to D6 | ✅ PASS | Parameterized query confirmed safe |
| EC-6 | DOB = today → "0 years" shown, no error | ✅ PASS | |
| EC-9 | Gender select → deselect → save with null gender | ✅ PASS | |
| EC-10 | Double-tap Save — fires only once, no crash | ✅ PASS | |
| EC-11 | Back with name filled → discard dialog (Keep editing / Discard both work) | ✅ PASS | |
| EC-12 | Back with no fields touched → no discard dialog | ✅ PASS | |
| EC-13 | Back with DOB only set → discard dialog | ✅ PASS | |
| EC-14 | Back with gender only set → discard dialog | ✅ PASS | |
| EC-15 | iOS picker: open → Done without scrolling → DOB stays blank | ✅ PASS | |
| ERR-4 | Missing prefillMobile guard | ⏭ SKIP | Cannot trigger via normal UI in Expo Go |

---

## Bugs Found

### BUG-D5-DT1-1 (HIGH) — Duplicate mobile: D5 Save silently fails with no spinner, no error, no navigation

**Summary:** When "Save & Begin Visit" is tapped on D5 with a mobile number that already has a patient row in SQLite (created earlier in the same session), the button produces no response — no spinner, no error message, no navigation to D6. The button remains visually unchanged. The C1 fix (`insertLocalPatient` returning `{ localId, wasInserted }`) is supposed to reuse the existing patient's `localId` and proceed normally. Instead, the save silently stalls.

**Repro:**
1. Search `7777700008` on D2 → D5 → fill name "Test Double Tap" → save → D6 (patient row created)
2. Navigate back to D5 (same mobile `7777700008` prefilled)
3. Tap "Save & Begin Visit" (online or offline)
4. Button does not respond — no spinner, no error, no navigation

**Evidence:** Tested both online and offline. No visual change on button after tap. No discard dialog when pressing back (suggesting `hasUnsavedChanges` may also be in a bad state). Fresh-mobile offline test (7777700009) worked correctly — confirming the issue is specific to the duplicate-mobile path.

**Likely root cause:** The C1 fix path (when `wasInserted = false`) may have a logic error — either returning an incorrect `localId`, hitting a guard condition that bails silently, or `isSavingRef` becoming stuck from the first EC-10 save.

**Impact:** HIGH — In any real clinic scenario, a doctor may attempt to register a patient who was already added earlier in the session. Silent failure with no feedback blocks the workflow and provides no recovery path.

**Status:** OPEN — Builder session required.

---

### HP-6 finding (MEDIUM) — D5-created patients do not appear in D2 recent patients list

**Summary:** After creating a patient via D5 and navigating back to D2, the patient does not appear in the recent patients list (shown when search bar is empty). "No patients yet" is displayed. Patient only surfaces when actively searching digits.

**Impact:** MEDIUM — Doctor cannot see newly created patient at a glance after returning to D2; must re-search.

**Likely root cause:** `getRecentPatients()` may only include patients accessed via D2 search/view interactions, not patients created via D5 (which log `patient_created` not `patient_accessed`).

**Status:** OPEN — Builder to investigate `getRecentPatients()` query filter.

---

## Session Summary

**Session 1 complete — 2026-04-11**

**Bug count:** 2 bugs found:
- BUG-D5-DT1-1 (HIGH — duplicate mobile causes silent Save failure; C1 fix `wasInserted=false` path not navigating)
- HP-6 finding (MEDIUM — D5-created patients absent from D2 recent list)

**Passed:** HP-1–HP-5, H1, H2, OFF-1, EC-3, EC-6, EC-9, EC-10, EC-11, EC-12, EC-13, EC-14, EC-15 (15 items)
**Failed:** HP-6, BUG-D5-DT1-1 repro scenario (2 items)
**Skipped:** OFF-3, ERR-4 (2 items — untestable via verbal Expo Go session)

**Builder handoff decision:** Builder Agent session required before merge — items:
1. BUG-D5-DT1-1 (HIGH) — duplicate mobile silent failure; investigate C1 fix path (`wasInserted = false` branch) and `isSavingRef` state carry-over after prior save
2. HP-6 (MEDIUM) — `getRecentPatients()` not surfacing D5-created patients; investigate query filter

---

SESSION COMPLETE — Next: Builder Agent — Fix BUG-D5-DT1-1 (duplicate mobile causes silent D5 Save failure; C1 fix `wasInserted=false` path not navigating; investigate `insertLocalPatient` return value handling and `isSavingRef` state) + HP-6 (`getRecentPatients()` not including D5-created patients)
Type 'exit' then 'claude' to start the next step.
