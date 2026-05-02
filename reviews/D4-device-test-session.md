# D4 — Visit Detail — Device Test Session 1

**Agent:** Device Tester
**Date:** 2026-05-02
**Device:** iPhone (Expo Go)
**Tester:** rdevarakond88@gmail.com
**Backend:** https://medrecord-api.onrender.com/v1 — HTTP 200 ✅ (confirmed 2026-05-02)
**Note:** Backend database was recreated 2026-05-02 (Render free-tier PostgreSQL expired). Fresh seed — test doctor and clinic only. No pre-existing patients or visits.

---

## Pre-flight Checklist

| Check | Result |
|---|---|
| `curl .../v1/health` → 200 | ✅ PASS — HTTP 200, 0.41s |
| Test credentials (9999999999 / 000000) | ✅ confirmed in seed logs |
| Backend seed output | ✅ clinic + doctor created |
| D4 QA pre-req fixes (C1, H1–H4, M1) | ✅ all closed 2026-04-19 per project-state.md |

---

## Data Setup (required before any test cases)

Because the database is freshly seeded, test data must be created in-session:

1. Log in with `9999999999` / OTP `000000`
2. Create a new patient via D5 (New Patient Form)
3. Create a new visit for that patient via D6 (New Visit)
4. Allow the visit to sync to the server (watch for sync worker completion — pending badge disappears)
5. Navigate D3 → "View Full Visit" → D4

For HP-11 / HP-12 (other doctor's visits without/with consent) — SKIP. Fresh database has only one doctor account. Cannot simulate cross-doctor consent without a second account.

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
| HP-10 | Open D4 for a submitted own visit → no bottom bar; notes and chief complaint visible | | |
| HP-11 | Other doctor's visit WITHOUT consent — chief complaint, notes, scans hidden; consent banner visible | SKIP | Only one doctor account in fresh DB |
| HP-12 | Other doctor's visit WITH consent — content visible; no edit affordance; no bottom bar | SKIP | Only one doctor account in fresh DB |

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
| EC-5 | Atomic transaction: kill mid-save → no orphaned SQLite note without sync_queue entry | SKIP | Cannot reliably force kill at exact moment |
| EC-6 | Note text exactly 5000 characters → accepted; maxLength enforced | | |
| EC-7 | SQL injection note text → stored as literal; no crash | | |
| EC-8 | Unicode/emoji note (e.g., `🤒 सिरदर्द`) → stored and displayed correctly | | |
| EC-9 | "View Full Visit" disabled in D3 for draft visits → cannot reach D4 for unsynced visit | | |
| EC-10 | Edit synced note → navigate away and back → edited text visible | | |
| EC-11 | Visit with no chief_complaint → Chief Complaint section not shown | SKIP | Depends on visit data |
| EC-12 | Long patient name (50+ chars) → truncated with ellipsis; no overflow | | |
| EC-13 | Soft-delete pending note → sync fires → note reappears (documented M3 debt) | | |

### Consent Edge Cases

| ID | Description | Result | Notes |
|---|---|---|---|
| CE-1 | Other doctor's visit; grant consent externally while D4 open → content not updated until remount | SKIP | One doctor account |
| CE-2 | Own visit → no consent banner shown | | |

---

## Bugs Found

### BUG-D4-DT1-1 — HIGH — Draft visits from D5→D6 flow never sync; "View Full Visit" never appears

**Observed:** Two visits created via D5 (New Patient) → D6 (New Visit) remain as "Draft + cloud" in D3 indefinitely. Sync worker fires (AppState foreground trigger confirmed), reports "drain zero pending rows for doctor ID [id]". No visit ever syncs to server. "View Full Visit" button never appears in D3.

**Diagnosis from code review (read-only):**
- D5 calls `createPatient` to get `serverPatientId`. If this fails for any reason, `serverPatientId = null`.
- D6 receives `patientServerId: null` via nav params → skips direct `createVisit` API call (guarded by `if (isOnline && patientServerId)` at `NewVisitScreen.tsx:378`).
- `enqueueOperation` IS called with `patient_id: null` in the payload.
- Sync worker POSTs to server → server rejects null `patient_id` → operation fails.
- After 5 attempts (`max_attempts`) → sync_queue entry marked `'failed'` → zero `'pending'` rows → visits never sync.
- visits_draft rows remain `sync_status='draft'` or `'pending'`; D3 shows "Draft + cloud" indefinitely.

**Root cause to confirm:** Whether `createPatient` in D5 succeeded (returning a server patient ID) or failed silently. Builder must check SyncDebugPanel log from save time: look for `[WARN] enqueue: patientServerId is null` at `NewVisitScreen.tsx:342`.

**Impact:** Blocks all D4 test cases — "View Full Visit" requires a synced visit. Cannot proceed.

**Screens affected:** D5, D6 (root cause); D3, D4 (visible impact).

---

### BUG-D4-DT1-2 — MEDIUM — No M-6 logout warning shown when unsaved draft visits exist

**Observed:** User logged out with two unsynced draft visits in visits_draft. No warning appeared ("You have unsynced visits — logging out may lose data"). App logged out immediately.

**Expected:** `countUnsyncedDraftVisits` counts `'pending'` + `'failed'` rows (fix applied per project-state.md D3-DT4-1 closure). If count > 0, M-6 alert should appear before logout proceeds.

**Possible causes:**
1. `countUnsyncedDraftVisits` not being called in the logout path for this flow.
2. Visits were in a state not counted (e.g., `sync_status` value not matching the query).
3. Alert was shown but dismissed before user noticed (unlikely — user stated clearly it went straight to logout).

**Impact:** Data loss risk — doctor can silently lose unsynced visits on logout.

---

## Session Summary

**Date:** 2026-05-02
**Result:** BLOCKED — zero D4 test cases run.

**Bugs found:** 2
- BUG-D4-DT1-1 (HIGH) — Draft visits from D5→D6 never sync; sync_queue shows zero pending rows; "View Full Visit" never accessible
- BUG-D4-DT1-2 (MEDIUM) — No M-6 logout warning when unsaved draft visits exist

**Builder handoff required before D4 device testing can proceed.**
Items:
1. BUG-D4-DT1-1 — Investigate why `createPatient` in D5 is not returning a server patient ID (or why patientServerId arrives as null in D6), causing sync_queue entries with `patient_id: null` to dead-letter after max_attempts. Check SyncDebugPanel for `[WARN] enqueue: patientServerId is null` at `NewVisitScreen.tsx:342`.
2. BUG-D4-DT1-2 — Investigate why M-6 logout warning did not fire despite two unsynced draft visits in visits_draft.

**Also noted (not a bug):**
- EC-9 PASS: "View Full Visit" correctly disabled/absent for draft visits in D3.
- BUG-D4-DT1-2 discovery: no M-6 warning shown on logout with unsaved drafts (logged above).
- HP-11 / HP-12 / CE-1 / ER-1–5 SKIPPED: fresh database has one doctor account only; cannot simulate cross-doctor or forced-error scenarios.
