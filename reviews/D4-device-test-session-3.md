# D4 — Visit Detail — Device Test Session 3

**Agent:** Device Tester
**Date:** 2026-05-03
**Device:** iPhone (Expo Go)
**Tester:** rdevarakond88@gmail.com
**Backend:** https://medrecord-api.onrender.com/v1 — HTTP 200 ✅ (confirmed 2026-05-03)

---

## Pre-flight Checklist

| Check | Result |
|---|---|
| `curl .../v1/health` → 200 | ✅ PASS — HTTP 200 |
| Test credentials (9999999999 / 000000) | Pending confirmation on device |
| BUG-D4-DT2-1 (fixOrphanVisitPayloads in drain loop + D3 effectiveServerId) | ✅ Fixed by Builder 2026-05-03 |
| BUG-D4-DT2-2 (M-6 logout warning fix) | ✅ Fixed by Builder 2026-05-03 |
| D4 QA pre-req fixes (C1, H1–H4, M1) | ✅ All closed 2026-04-19 |

---

## Data Setup (required before test cases)

Start fresh — previous sessions had dead-lettered sync_queue entries:

1. Log in with `9999999999` / OTP `000000`
2. Create a new patient via D5 (New Patient Form)
3. Create a new visit for that patient via D6 (New Visit) — add at least one note in D6 before saving
4. Watch for sync completion: pending badge disappears from D3 visit row
5. Navigate D3 → "View Full Visit" → D4 ← entry point for HP-1

For submitted visit (HP-10): after HP-9 (Finish Visit), the just-finished visit serves as the submitted visit.
For HP-11 / HP-12 / CE-1: SKIP — only one doctor account in database.

---

## Test Results

### Happy Path — Own open visit with records

| ID | Description | Result | Notes |
|---|---|---|---|
| HP-1 | D3 → "View Full Visit" → D4 loads; meta card shows date, Open badge, patient/doctor/clinic names | PASS | |
| HP-2 | Tap `+ Note` → inline input appears, keyboard raises, `+ Note` button disabled | PASS | |
| HP-3 | Type text → tap Save Note → note appears with pending badge; input dismissed; `+ Note` re-enabled | PASS | |
| HP-4 | Save note online → sync worker fires → navigate away and back → only ONE note visible (C1 fix) | PASS | |
| HP-5 | Long-press a note → Edit / Delete actions visible | PASS | |
| HP-6 | Tap Edit → inline input with existing text; Save disabled on empty; Save updates text | FAIL | BUG-D4-DT3-1 — edit save reverts to original text |
| HP-7 | Tap Cancel on edit → text reverts to original | PASS | |
| HP-8 | Long-press → Delete → confirmation alert; Cancel dismisses; Delete removes note | PASS | Note reappears on re-entry — EC-13 M3 debt |
| HP-9 | Tap Finish Visit (records exist) → confirmation alert; Cancel ok; Finish → Submitted badge, bottom bar disappears | PASS | |

### Happy Path — Other visit types

| ID | Description | Result | Notes |
|---|---|---|---|
| HP-10 | Open D4 for the just-submitted visit → no bottom bar; notes and chief complaint visible | PASS | |
| HP-11 | Other doctor's visit WITHOUT consent — all content hidden; consent banner visible | SKIP | One doctor account |
| HP-12 | Other doctor's visit WITH consent — content visible; no edit affordance | SKIP | One doctor account |

### Offline Scenarios

| ID | Description | Result | Notes |
|---|---|---|---|
| OF-1 | Go offline, open D4 with cached records → cached records shown | PASS | |
| OF-2 | Go offline, open D4 with NO cached records → "No records yet" + connect subtitle | PASS | Chief complaint shown; "No records yet" shown |
| OF-3 | Go offline → add note → saves with pending badge; go online → syncs; badge disappears | FAIL | BUG-D4-DT3-3 — sync_queue empty after offline save; badge never clears |
| OF-4 | Save note, lose connectivity mid-save → note in SQLite with pending badge; no error | SKIP | Same root cause as BUG-D4-DT3-3 |
| OF-5 | Go offline → tap Finish Visit → "No internet connection" alert | PASS | |

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
| EC-1 | Rapid double-tap Save Note → only one note created | PASS | |
| EC-2 | Rapid double-tap Finish Visit → only one confirmation dialog (H4 fix) | PASS | |
| EC-3 | Tap `+ Note`, type, tap Cancel → note NOT saved | SKIP | Inconclusive — test setup confusion; needs re-run |
| EC-4 | App backgrounded with note input open → foregrounded → text not lost | PASS | |
| EC-5 | Atomic transaction: kill mid-save → no orphaned note | SKIP | Cannot force-kill at exact moment |
| EC-6 | Note text exactly 5000 characters → accepted; maxLength enforced | PASS | |
| EC-7 | SQL injection note text → stored as literal; no crash | PASS | |
| EC-8 | Unicode/emoji note (e.g., `🤒 सिरदर्द`) → stored and displayed correctly | PASS | Emoji only — Hindi keyboard not available |
| EC-9 | "View Full Visit" disabled in D3 for draft visits | PASS | Verified this session — ghost draft cards also correctly disabled |
| EC-10 | Edit synced note → navigate away and back → edited text visible | FAIL | Same root cause as BUG-D4-DT3-1 |
| EC-11 | Visit with no chief_complaint → Chief Complaint section not shown | SKIP | All test visits had chief complaint |
| EC-12 | Long patient name (50+ chars) → truncated with ellipsis; no overflow | SKIP | Test patient name too short |
| EC-13 | Soft-delete pending note → sync fires → note reappears (documented M3 debt) | PASS | Confirmed expected behavior |

### Consent Edge Cases

| ID | Description | Result | Notes |
|---|---|---|---|
| CE-1 | External consent grant while D4 open → not updated until remount | SKIP | One doctor account |
| CE-2 | Own visit → no consent banner shown | FAIL | BUG-D4-DT3-5 — amber consent badge shown on own visit |

---

## Bugs Found

### BUG-D4-DT3-1 — HIGH — Edit note: save reverts to original text
**Observed:** Edited note text (e.g. "test to see" → "test") reverts to original after tapping Save. Confirmed in HP-6 and EC-10.
**Expected:** Note text updates to the edited value after Save.

### BUG-D4-DT3-2 — MEDIUM — Ghost draft card appears in D3 after visit syncs or finishes
**Observed:** After a visit syncs or is finished, D3 shows a duplicate "Draft + cloud" card alongside the correct Submitted card. Appears every time the device goes offline. visits_draft entry not cleaned up.
**Expected:** visits_draft entry removed (or hidden) once visit has a server ID and is finished.

### BUG-D4-DT3-3 — HIGH — Offline note save: sync_queue entry missing; pending badge never clears
**Observed:** Note saved while offline shows pending badge. After going online and triggering sync, SyncDebugPanel shows "drain 0 pending rows" — no sync_queue entry exists. Badge never clears.
**Expected:** Offline note save enqueues an operation; syncs on reconnect; badge clears.

### BUG-D4-DT3-4 — HIGH — Cancel on note input saves the note instead of discarding
**Observed:** Tapped `+ Note`, typed text, tapped Cancel — note(s) appeared in the list. Cancel should discard.
**Note:** Test setup was ambiguous — needs clean re-run to fully confirm. Logged as HIGH pending Builder investigation.

### BUG-D4-DT3-5 — MEDIUM — Consent banner shown on doctor's own visit
**Observed:** Amber pending consent badge visible in D4 on the doctor's own visit. Own visits should never show a consent banner.

---

## Session Summary

**Date:** 2026-05-03
**Result:** COMPLETED — 4 bugs found (3 HIGH, 2 MEDIUM).

**Bug count:** 5
- BUG-D4-DT3-1 (HIGH) — Edit note reverts to original text on save
- BUG-D4-DT3-2 (MEDIUM) — Ghost draft card in D3 after visit syncs/finishes
- BUG-D4-DT3-3 (HIGH) — Offline note save missing sync_queue entry; badge never clears
- BUG-D4-DT3-4 (HIGH) — Cancel on note input saves instead of discards (needs clean re-run)
- BUG-D4-DT3-5 (MEDIUM) — Consent banner shown on own visit

**Builder Agent session required before merge — items:**
1. BUG-D4-DT3-1 — Edit note save reverts to original text
2. BUG-D4-DT3-3 — Offline note save not enqueued in sync_queue
3. BUG-D4-DT3-4 — Cancel on note input saves instead of discards (verify + fix)
4. BUG-D4-DT3-2 — Ghost draft card in D3 (visits_draft not cleaned up after sync/finish)
5. BUG-D4-DT3-5 — Consent banner shown on own visit in D4

SESSION COMPLETE — Next: Builder Agent — fix BUG-D4-DT3-1 through BUG-D4-DT3-5 — D4 (Visit Detail)
Type 'exit' then 'claude' to start the next step.
