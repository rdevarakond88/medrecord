# D4 — Visit Detail — Device Test Session 2

**Agent:** Device Tester
**Date:** 2026-05-02
**Device:** iPhone (Expo Go)
**Tester:** rdevarakond88@gmail.com
**Backend:** https://medrecord-api.onrender.com/v1 — HTTP 200 ✅ (confirmed 2026-05-02)

---

## Pre-flight Checklist

| Check | Result |
|---|---|
| `curl .../v1/health` → 200 | ✅ PASS — HTTP 200 |
| Test credentials (9999999999 / 000000) | Pending confirmation on device |
| BUG-D4-DT1-1 (sync cascade fix) | ✅ Fixed by Builder 2026-05-02 |
| BUG-D4-DT1-2 (M-6 logout warning fix) | ✅ Fixed by Builder 2026-05-02 |
| D4 QA pre-req fixes (C1, H1–H4, M1) | ✅ All closed 2026-04-19 |

---

## Data Setup (required before test cases)

Because the database was freshly seeded in session 1, test data from session 1 may be in a failed sync state (visits dead-lettered at max_attempts before BUG-D4-DT1-1 fix). Start fresh:

1. Log in with `9999999999` / OTP `000000`
2. Create a new patient via D5 (New Patient Form)
3. Create a new visit for that patient via D6 (New Visit) — add at least one note
4. Watch for sync completion: pending badge disappears from D3 visit row
5. Navigate D3 → "View Full Visit" → D4 ← this is the entry point for HP-1

For submitted visit (HP-10): after HP-9 (Finish Visit), the just-finished visit serves as the submitted visit.
For HP-11 / HP-12 / CE-1: SKIP — only one doctor account in database.

---

## Test Results

### Happy Path — Own open visit with records

| ID | Description | Result | Notes |
|---|---|---|---|
| HP-1 | D3 → "View Full Visit" → D4 loads; meta card shows date, Open badge, patient/doctor/clinic names | | |
| HP-2 | Tap `+ Note` → inline input appears, keyboard raises, `+ Note` button disabled | | |
| HP-3 | Type text → tap Save Note → note appears with pending badge; input dismissed; `+ Note` re-enabled | | |
| HP-4 | Save note online → sync worker fires → navigate away and back → only ONE note visible (C1 fix) | | |
| HP-5 | Long-press a note → Edit / Delete actions visible | | |
| HP-6 | Tap Edit → inline input with existing text; Save disabled on empty; Save updates text | | |
| HP-7 | Tap Cancel on edit → text reverts to original | | |
| HP-8 | Long-press → Delete → confirmation alert; Cancel dismisses; Delete removes note | | |
| HP-9 | Tap Finish Visit (records exist) → confirmation alert; Cancel ok; Finish → Submitted badge, bottom bar disappears | | |

### Happy Path — Other visit types

| ID | Description | Result | Notes |
|---|---|---|---|
| HP-10 | Open D4 for the just-submitted visit → no bottom bar; notes and chief complaint visible | | |
| HP-11 | Other doctor's visit WITHOUT consent — all content hidden; consent banner visible | SKIP | One doctor account |
| HP-12 | Other doctor's visit WITH consent — content visible; no edit affordance | SKIP | One doctor account |

### Offline Scenarios

| ID | Description | Result | Notes |
|---|---|---|---|
| OF-1 | Go offline, open D4 with cached records → cached records shown | | |
| OF-2 | Go offline, open D4 with NO cached records → "No records yet" + connect subtitle | | |
| OF-3 | Go offline → add note → saves with pending badge; go online → syncs; badge disappears | | |
| OF-4 | Save note, lose connectivity mid-save → note in SQLite with pending badge; no error | | |
| OF-5 | Go offline → tap Finish Visit → "No internet connection" alert | | |

### Error Scenarios

| ID | Description | Result | Notes |
|---|---|---|---|
| ER-1 | Server returns 401 on loadRecords → session expired banner → redirect Login in 2s | SKIP | Cannot force 401 without tooling |
| ER-2 | Server returns 401 on handleFinishVisit → session expired banner | SKIP | Cannot force 401 without tooling |
| ER-3 | Server returns 500 on getVisitRecords → falls back to SQLite; no crash | SKIP | Cannot force 500 without tooling |
| ER-4 | Server returns 500 on createNote → note stays pending; no error shown | SKIP | Cannot force 500 without tooling |
| ER-5 | Server returns 500 on finishVisit → "Could not finish visit" alert | SKIP | Cannot force 500 without tooling |

### Edge Cases

| ID | Description | Result | Notes |
|---|---|---|---|
| EC-1 | Rapid double-tap Save Note → only one note created | | |
| EC-2 | Rapid double-tap Finish Visit → only one confirmation dialog (H4 fix) | | |
| EC-3 | Tap `+ Note`, type, tap Cancel → note NOT saved | | |
| EC-4 | App backgrounded with note input open → foregrounded → text not lost | | |
| EC-5 | Atomic transaction: kill mid-save → no orphaned note | SKIP | Cannot force-kill at exact moment |
| EC-6 | Note text exactly 5000 characters → accepted; maxLength enforced | | |
| EC-7 | SQL injection note text → stored as literal; no crash | | |
| EC-8 | Unicode/emoji note (e.g., `🤒 सिरदर्द`) → stored and displayed correctly | | |
| EC-9 | "View Full Visit" disabled in D3 for draft visits | PASS (session 1) | Verified in session 1 |
| EC-10 | Edit synced note → navigate away and back → edited text visible | | |
| EC-11 | Visit with no chief_complaint → Chief Complaint section not shown | | |
| EC-12 | Long patient name (50+ chars) → truncated with ellipsis; no overflow | | |
| EC-13 | Soft-delete pending note → sync fires → note reappears (documented M3 debt) | | |

### Consent Edge Cases

| ID | Description | Result | Notes |
|---|---|---|---|
| CE-1 | External consent grant while D4 open → not updated until remount | SKIP | One doctor account |
| CE-2 | Own visit → no consent banner shown | | |

---

## Bugs Found

### BUG-D4-DT2-1 — HIGH — BUG-D4-DT1-1 NOT VERIFIED: visit still draft after re-login; sync_queue shows 0 pending rows

**Observed:** New patient (James Bond) + new visit created via D5→D6. Visit appears in D3 under "My Visits" as "Draft + cloud". After logout and re-login, visit still shows "Draft + cloud". No "View Full Visit" button present. Tapping the visit card shows "No records attached, visit is a draft."

**SyncDebugPanel output:**
- "run sync worker called: token true, user true, running user sync"
- "drain 0 pending rows for doctor ID [id]"
- "drain loop complete"

**Diagnosis:** Sync worker fires correctly but finds zero pending rows in sync_queue. The Builder's BUG-D4-DT1-1 fix (fixOrphanVisitPayloads pre-drain step + cascade in applyResult) cannot recover entries that don't exist in sync_queue. The visit persists in visits_draft as Draft but has no corresponding sync_queue entry to drain. Root cause unknown — Builder must determine why sync_queue is empty for a visit that exists in visits_draft.

**Impact:** Blocks all D4 test cases. "View Full Visit" requires a synced visit. Cannot enter D4.

---

### BUG-D4-DT2-2 — MEDIUM — BUG-D4-DT1-2 NOT VERIFIED: M-6 logout warning still not shown with unsynced draft visit

**Observed:** User logged out with the James Bond visit in visits_draft (Draft + cloud state, not synced). No M-6 warning appeared. App logged out immediately. Visit persisted after re-login (still as Draft + cloud — see BUG-D4-DT2-1).

**Note:** The fact that the visit persists through logout suggests clearDoctorDraftVisits may not have been called, or the visit is surviving via another mechanism. Builder must verify the full logout path.

---

## Session Summary

**Date:** 2026-05-02
**Result:** BLOCKED — zero D4 test cases run (second consecutive blocked session).

**Bug count:** 2
- BUG-D4-DT2-1 (HIGH) — BUG-D4-DT1-1 NOT VERIFIED: sync_queue shows 0 pending rows; visit remains Draft after re-login; "View Full Visit" absent; cannot enter D4
- BUG-D4-DT2-2 (MEDIUM) — BUG-D4-DT1-2 NOT VERIFIED: M-6 logout warning still not appearing with unsynced draft visits

**Builder Agent session required before merge — items:**
1. BUG-D4-DT2-1 — Why is sync_queue empty for a visit that exists in visits_draft as Draft? fixOrphanVisitPayloads can't recover what isn't queued. Builder must trace the D5→D6 create path under the new fix and find where the sync_queue entry disappears or is never created.
2. BUG-D4-DT2-2 — Why does the M-6 logout warning not fire? The BUG-D4-DT1-2 fix (cross-referencing sync_queue) won't catch anything if sync_queue is empty (per BUG-D4-DT2-1). The visits_draft row exists but the guard misses it.

**EC-9 PASS (carried from session 1):** "View Full Visit" correctly absent for draft visits.

SESSION COMPLETE — Next: Builder Agent — fix BUG-D4-DT2-1 + BUG-D4-DT2-2 — D4 (Visit Detail)
Type 'exit' then 'claude' to start the next step.
