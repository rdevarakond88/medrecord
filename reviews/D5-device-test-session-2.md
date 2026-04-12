# D5 — New Patient Form
## Device Test Session 2

**Date:** 2026-04-12
**Agent:** Device Tester
**Source:** Builder session (2026-04-12) — BUG-D5-DT1-1 + HP-6 fixed (commit 3f15635). Re-verification session.
**Device:** iPhone (Expo Go via ngrok tunnel)
**Backend:** https://medrecord-api.onrender.com/v1 — LIVE (200 OK pre-flight confirmed)
**Test credentials:** Dr. Test Doctor | mobile: 9999999999 | OTP: 000000
**Fresh mobiles used:** 7777700013–7777700014

---

## Pre-flight Status
- [x] Backend health check: 200 OK
- [x] App open on device — user logged in at Patient Search screen

---

## Fix Verification Tests

### BUG-D5-DT1-1 — Duplicate mobile silent Save failure

| # | Test | Status | Notes |
|---|---|---|---|
| FV-1a | First save of 7777700013: fill name "Test Repeat Save" → Save → navigates to D6 | ✅ PASS | D6 showed patient name + last 5 digits correctly |
| FV-1b | Back to D5 (same mobile 7777700013): Save again → navigates to D6 (not silent stall) | ✅ PASS | isSavingRef reset on success path confirmed working |
| FV-1c | Back to D5 a third time, same mobile: Save again → navigates to D6 | ✅ PASS | Fix holds across multiple re-entries |

### HP-6 — D5-created patients appear in D2 recent list

| # | Test | Status | Notes |
|---|---|---|---|
| FV-2a | Create patient 7777700013 via D5 → navigate back to D2 → recent list shows 7777700013 | ✅ PASS | useFocusEffect refresh working — patient appears in recent list |
| FV-2b | Create patient 7777700014 ("Test Recent Two") via D5 → back to D2 → both patients appear in recent list | ✅ PASS | Confirmed for subsequent patients too |

---

## Bugs Found

**No bugs found.**

---

## Session Summary

**Session 2 complete — 2026-04-12**

**Bug count:** 0 bugs found.

**Passed:** FV-1a, FV-1b, FV-1c, FV-2a, FV-2b (5 items)
**Failed:** 0
**Skipped:** 0

**Builder handoff decision:** No Builder session needed — both fixes verified. BUG-D5-DT1-1 (HIGH) and HP-6 (MEDIUM) are CLOSED.

---

SESSION COMPLETE — Next: Merge PR #1 (dev → main) — D1, D2, D3, D5, D6, D7 all clear to merge.
Type 'exit' then 'claude' to start the next step.
