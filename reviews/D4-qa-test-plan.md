# QA REVIEW — D4 Visit Detail Screen

**Reviewer:** QA Agent (Step 7)
**Date:** 2026-04-19
**Screen:** `src/screens/doctor/VisitDetailScreen.tsx`
**Supporting modules:** `src/api/records.ts`, `src/db/records.ts`

---

## TESTING PREREQUISITES

| Field | Value |
|---|---|
| Backend URL | `https://medrecord-api.onrender.com/v1` |
| Backend status | DEPLOYED — confirm via `curl https://medrecord-api.onrender.com/v1/health` |
| Test doctor | Dr. Test Doctor — mobile `9999999999`, OTP bypass `000000` |
| Test patient | Any patient in DB with at least one synced visit |
| Cert pinning | Deferred — `pinnedFetch` requires EAS custom dev client; not testable in Expo Go |
| Visit requirements | Need: (a) own open visit with ≥1 record, (b) own open visit with 0 records, (c) submitted visit, (d) another doctor's visit without consent, (e) another doctor's visit with consent |
| **Status** | **BLOCKED — see CRITICAL C1 below; fix before device testing** |

---

## CRITICAL BUGS

### D4-QA-C1: `handleSaveNote` direct-API path never marks `sync_queue` entry as `status='success'` — sync worker re-POSTs the note, creating server duplicates

**Severity:** CRITICAL — data duplication; same pattern as D6-CRITICAL (sync worker session)

After a note is saved online, D4's `handleSaveNote` calls:
1. `db.withTransactionAsync` → `insertLocalNote` + `enqueueOperation` (sync_queue entry created, `status='pending'`)
2. `createNote(...)` → success → `markRecordSynced(db, localId, serverId)` ← updates `visit_records`

The `sync_queue` entry remains `status='pending'`. The sync worker will pick it up on the next trigger and POST the same note to the server again via POST /sync.

If the server deduplicates on `local_id` → returns `conflict` → sync worker marks queue entry `success` → no visible duplicate (but unnecessary network round-trip). If the server does not deduplicate on `local_id` → creates a second note → on next `getVisitRecords` fetch, both server records are returned → `upsertRecordsFromServer` inserts both → doctor sees the note twice.

**Steps to reproduce:**
1. Open D4 for an open own visit (online)
2. Tap `+ Note`, type text, tap `Save Note`
3. Wait for sync worker to trigger (foreground, NetInfo restore, or 5-min interval)
4. Navigate away and back to D4
5. Observe whether the note appears twice

**Expected:** One note. Sync_queue entry for the note marked `success` after direct `createNote` call.
**Actual:** Sync_queue entry stays `pending`; sync worker re-POSTs the note.

**Code location:** `VisitDetailScreen.tsx:206-212` — `createNote` + `markRecordSynced` block. No `UPDATE sync_queue SET status='success'` follows.

**Fix:** After `markRecordSynced(db, localId, result.record.id)` succeeds, also run:
```typescript
await db.runAsync(
  `UPDATE sync_queue SET status = 'success'
   WHERE entity_local_id = ? AND entity_type = 'record' AND status != 'success'`,
  [localId],
);
```
Same pattern as D6 `handleSave()` (established fix per project-state.md D6-CRITICAL closure).

---

## HIGH BUGS

### D4-QA-H1: `isOnline` is always `false` on mount — server fetch skipped on every initial D4 open

`useNetworkStatus` initializes `isOnline` to `false` (by design — H-5 fix in D2). The `useEffect([], [])` fires immediately after the first render, calling `loadRecords` while `isOnline` is still the initial `false` value. The NetInfo network probe completes asynchronously, but the effect never re-runs.

**Consequence:** Every initial D4 open on a connected device skips `getVisitRecords` and falls back to SQLite cache. If the cache is empty (first time viewing this visit), the doctor sees "No records yet" even when records exist on the server. If the cache is stale (records were added by another device), the doctor sees old data.

**Steps to reproduce:**
1. Open D4 for a visit that has server-side records but an empty or stale local cache
2. Observe: loading spinner appears briefly, then "No records yet" or stale records — even on full connectivity

**Expected:** Server fetch fires on first open when device is online.
**Actual:** Server fetch is skipped; SQLite cache used.

**Code location:** `VisitDetailScreen.tsx:169-172` — `useEffect(() => { void loadRecords(); }, [])` captures initial `isOnline=false`.

**Fix:** Change `useEffect(() => { void loadRecords(); }, [])` to `useEffect(() => { void loadRecords(); }, [loadRecords])`. `loadRecords`'s `useCallback` deps include `isOnline`; when isOnline changes from false to true, `loadRecords` is recreated and the effect re-fires, triggering the server fetch. This also naturally handles the "navigate away and reconnect" case.

---

### D4-QA-H2: `loadRecords` doesn't call `setIsLoading(false)` if `getCachedRecords` throws — infinite loading spinner

`loadRecords` has a single `setIsLoading(false)` call at line ~160, after `getCachedRecords`. If `getCachedRecords` throws (e.g., SQLite I/O error on low-storage Android), `setIsLoading(false)` is never called. The screen shows the loading spinner forever with no recovery other than force-quitting the app.

**Steps to reproduce:**
1. Corrupt/fill device storage to trigger SQLite I/O error
2. Open D4 → `getCachedRecords` throws → spinner persists indefinitely

**Expected:** Error state shown; loading spinner dismissed.
**Actual:** Permanent spinner.

**Code location:** `VisitDetailScreen.tsx:116-167` — `loadRecords`. No try/finally around the `getCachedRecords` read.

**Fix:** Wrap the SQLite read block in its own try/finally:
```typescript
try {
  const cached = await getCachedRecords(db, visitServerId, user.id);
  setRecords(cached);
  // ... consent re-read and audit log
} catch {
  // SQLite error — show empty state but don't hang
} finally {
  setIsLoading(false);
}
```

---

### D4-QA-H3: `handleSaveNote` finally block can throw before resetting tap guard — `+ Note` button permanently disabled

`handleSaveNote`'s `finally` block calls `getCachedRecords` then resets `isSavingRef.current = false` and `setIsSaving(false)`. If `getCachedRecords` throws, the two reset lines are never reached. The `isSavingRef.current` stays `true` and `isSaving` stays `true` — the `+ Note` button is permanently disabled (`disabled={showNoteInput || isSaving}`). No recovery without navigating away.

**Steps to reproduce:**
1. Open D4 (low-storage device)
2. Tap `+ Note`, type text, tap `Save Note`
3. Note write succeeds, but `getCachedRecords` in `finally` throws (storage contention)
4. `+ Note` button is permanently greyed out; tapping does nothing

**Expected:** Note input re-enabled after save attempt (success or failure).
**Actual:** `isSavingRef` + `isSaving` permanently stuck.

**Code location:** `VisitDetailScreen.tsx:214-220` — `finally` block.

**Fix:** Wrap the reset lines in another try/finally, or restructure to ensure they always run:
```typescript
} finally {
  isSavingRef.current = false;
  setIsSaving(false);
  try {
    const updated = await getCachedRecords(db, visitServerId, user.id);
    setRecords(updated);
  } catch {
    // Refresh failed — records list may be stale but input is re-enabled
  }
}
```

---

### D4-QA-H4: No synchronous tap guard on `handleFinishVisit` — double-tap can fire two PATCH calls

`handleFinishVisit` checks `!isFinishing` (React state, async) to prevent double-tap. Unlike `handleSaveNote` which uses `isSavingRef.current` (synchronous `useRef`), `handleFinishVisit` has no ref guard. A rapid double-tap before `setIsFinishing(true)` re-renders can open two Alert dialogs. If both are confirmed, two `finishVisit()` PATCH calls and two `updateVisitStatus()` writes fire concurrently.

**Steps to reproduce:**
1. Open D4 for an open visit with records
2. Double-tap "Finish Visit" button very quickly (within ~16ms, one render frame)
3. Two confirmation dialogs may appear
4. Confirm both → two PATCH /visits/:id calls

**Expected:** Only one confirmation dialog; second tap ignored.
**Actual:** Race window for two Alert openings + two PATCH calls.

**Code location:** `VisitDetailScreen.tsx:252-295` — `handleFinishVisit`.

**Fix:** Add `isFinishingRef = useRef(false)` at the top of the component (alongside `isSavingRef`), and check/set it synchronously at the start of `handleFinishVisit`:
```typescript
const isFinishingRef = useRef(false);
const handleFinishVisit = useCallback(() => {
  if (isFinishingRef.current) return;
  isFinishingRef.current = true;
  // ... existing logic
  // Reset in finally block (inside Alert onPress)
}, [...]);
```

---

## MEDIUM BUGS

### D4-QA-M1: Consent banner reads stale `consentGranted` nav param, not `consentGrantedLive`

Line 361: `{!isOwnVisit && !consentGranted && ...}` uses the original nav param. `showClinicalContent` correctly uses `consentGrantedLive` (line 309), but the banner doesn't. Result: if consent state changes and the screen reloads, clinical content visibility and the banner message can be out of sync (one says "hidden", the other shows content, or vice versa).

**Code location:** `VisitDetailScreen.tsx:361` — `!consentGranted` should be `!consentGrantedLive`.

---

### D4-QA-M2: `upsertRecordsFromServer` not wrapped in `db.withTransactionAsync()` — partial upsert risk

`upsertRecordsFromServer` (`records.ts:64-95`) iterates records with `for...of` and runs one `db.runAsync` per row — no transaction. If the app is killed mid-loop (e.g., with 30 records, killed after row 15), visit_records is partially updated. Self-healing on next server fetch. Not data loss but violates the established transaction pattern.

**Code location:** `src/db/records.ts:78-94`

**Fix:** Wrap the `for...of` loop in `db.withTransactionAsync()`.

---

### D4-QA-M3 (existing debt): Soft-deleted pending note reappears after next server refresh

If a `sync_status='pending'` note is soft-deleted locally before the sync worker uploads it:
1. Note is marked `sync_status='deleted'` locally
2. Sync worker uploads it to server (sync_queue entry still pending)
3. On next `getVisitRecords`, server returns the note
4. `upsertRecordsFromServer` conflict: `id` matches, `sync_status='deleted' != 'pending'` → WHERE condition allows update → row reset to `sync_status='synced'`
5. Note reappears in D4

Documented in `records.ts:183`. Fix deferred post-v1 pending DELETE /records/:id backend implementation.

---

### D4-QA-M4: `handleFinishVisit` does not update `record_count` in `visits` table

After PATCH /visits/:id succeeds, `updateVisitStatus` sets `status='submitted'` but does not update `visits.record_count`. D3 renders the visit list from the `visits` table and will continue showing the pre-finish record count until the next full `getPatientVisits` fetch.

**Code location:** `VisitDetailScreen.tsx:274-276` — `finishVisit + updateVisitStatus`.

---

## LOW BUGS

### D4-QA-L1: `handleSaveNote` has no text validation at function boundary

The `InlineNoteInput` component disables Save when `!text.trim()`. If `handleSaveNote` is ever called programmatically (future refactor, test harness) with empty string, a blank note is inserted. Low risk given current UI enforcement.

### D4-QA-L2: `handleEditNote` / `handleDeleteNote` use `user?.id ?? ''` after auth guard guarantees non-null

The auth guard `if (!token || !user) return null` (line 299) ensures `user` is non-null before any UI renders. The `?? ''` fallback in callbacks at lines 225, 226, 242, 243 is dead code — misleading as it implies a null case that cannot occur.

### D4-QA-L3: Comment at line 171 is incorrect

`// loadRecords is stable for the lifetime of this screen` — `loadRecords` is recreated whenever `isOnline` changes (it's in the `useCallback` deps). The comment contradicts the implementation.

---

## UNHANDLED EDGE CASES

### E1: Consent revoked while D4 is open — content visibility not updated until screen remounts

D4 reads consent once on mount via `loadRecords` (no `useFocusEffect`). If a consent revocation is processed by the sync worker while D4 is open, `consentGrantedLive` stays `true` until the doctor navigates away and back. Clinical content remains visible for the duration of the session.

**Recommended handling:** This is accepted v1 behavior given the single-device use case. Add a comment. Consider adding `useFocusEffect` for consent re-read in v2.

### E2: Visit finishes mid-note-add

Doctor opens `+ Note`, starts typing, a collaborating change finishes the visit externally (via another device), doctor saves the note. `handleSaveNote` will successfully write the note to SQLite and enqueue it. The direct `createNote` (POST /records) will succeed or fail at the server depending on whether the server rejects notes on submitted visits. If the server rejects, the note stays `pending` in sync_queue and will dead-letter after max_attempts.

**Recommended handling:** After `finishVisit` success, clear the note input (`setShowNoteInput(false)`) and confirm the server enforces the submitted-visit restriction. Currently `setShowNoteInput(false)` is not called on finish — the note input remains open if it was already showing.

### E3: Very large visit with 500+ note records

`getCachedRecords` returns all non-deleted records ordered by `created_at`. Rendered in a `ScrollView` with `.map()` (not FlatList). 500+ notes could cause render performance issues on a 2GB RAM device. Low probability for v1, but should be noted.

**Recommended handling:** Replace `ScrollView + map` for records with `FlatList` when record count could be large. For v1, note as future optimization.

### E4: `logVisitViewed` fires with `patientServerId = null`

`patientServerId` comes from nav params. D3 navigates to D4 only for synced visits, and synced visits in the `visits` table have `patient_server_id` set. However, if `patientServerId` is empty string (nav param omitted), `logVisitViewed` writes an audit event with `patient_id = ''`, creating an unscoped audit record. Low risk given D3 navigation guards.

### E5: `handleEditNote` called with an empty `editText.trim()`

`handleSaveEdit` guards against `!editText.trim()` (line 631). Safe. But if `editText` is all whitespace, `trim()` produces `''`, and the edit is silently dropped. No feedback to doctor.

---

## TEST PLAN

### Prerequisites
Before each test session:
1. `curl https://medrecord-api.onrender.com/v1/health` → expect `200`
2. Confirm test patient exists with ≥1 synced open visit and ≥1 submitted visit
3. Confirm `9999999999` / OTP `000000` credentials work
4. Log in fresh (clear app state or use the demo bypass) to ensure clean SQLite

---

### Happy Path — Own open visit with records

**HP-1:** Navigate D3 → tap "View Full Visit" on a synced own open visit → D4 loads
- Expected: meta card shows date, "Open" badge, patient name, doctor name, clinic name
- Expected: records loaded (notes + scans displayed)
- Expected: bottom bar visible (+ Scan, + Note, Finish Visit)
- Expected: "Finish Visit" enabled if records exist

**HP-2:** Tap `+ Note` → inline input appears, keyboard raises, note input has focus
- Expected: `+ Note` button becomes disabled while input is open

**HP-3:** Type text → tap `Save Note`
- Expected: note appears in Notes section immediately (pending badge visible)
- Expected: inline input dismissed
- Expected: `+ Note` re-enabled

**HP-4:** (online) Tap `+ Note`, type, `Save Note` → verify sync_queue entry
- Expected: after save, `sync_queue` entry for the note is marked `success` (C1 fix)
- Test via: wait for sync worker trigger, navigate back to D4 → only one note visible

**HP-5:** Long-press a note → Edit / Delete actions visible
- Expected: Edit and Delete appear below the note

**HP-6:** Tap Edit → edit inline input appears with existing text
- Expected: Save button disabled when input is empty/whitespace
- Expected: tap Save → text updated in UI

**HP-7:** Tap Cancel on edit → text reverts to original

**HP-8:** Long-press → tap Delete → confirmation alert appears
- Expected: Cancel dismisses without deleting
- Expected: Delete removes note from list

**HP-9:** Tap `Finish Visit` (records exist) → confirmation alert
- Expected: Cancel dismisses without changing status
- Expected: Finish → status badge changes to "Submitted", bottom bar disappears
- Expected: visiting D3 and back → visit still shows as Submitted

---

### Happy Path — Other visit types

**HP-10:** Open D4 for a submitted own visit
- Expected: bottom bar not visible, no `+ Note`, no `Finish Visit`
- Expected: notes and chief complaint visible (own visit)

**HP-11:** Open D4 for another doctor's visit WITHOUT consent
- Expected: chief complaint redacted ("Hidden — consent required")
- Expected: notes show "Note hidden — consent required"
- Expected: scans show "Content hidden — consent required"
- Expected: consent banner visible in meta card
- Expected: no bottom bar (not own visit)

**HP-12:** Open D4 for another doctor's visit WITH consent
- Expected: chief complaint and notes visible
- Expected: no edit/delete affordance (not own visit — `canEditNotes = false`)
- Expected: no bottom bar

---

### Offline Scenarios

**OF-1:** Go offline, open D4 for a visit with cached records
- Expected: loading spinner, then cached records shown (no server error shown)
- Expected: empty state with "Connect to load records" if no cache

**OF-2:** Go offline, open D4 for a visit with NO cached records
- Expected: "No records yet" + "Connect to load records" subtitle

**OF-3:** Go offline, tap `+ Note`, type, Save Note
- Expected: note saves to SQLite immediately (pending badge)
- Expected: no error shown
- Go online → sync worker fires → note uploads → pending badge disappears on next reload

**OF-4:** Start saving a note, lose connectivity mid-save (after SQLite write, before POST /records)
- Expected: note is in SQLite (visible with pending badge)
- Expected: note is in sync_queue for retry
- Expected: no error shown to doctor

**OF-5:** Open D4 online, records load. Go offline. Tap `Finish Visit`.
- Expected: alert "No internet connection — finishing a visit requires a connection"

---

### Error Scenarios

**ER-1:** Server returns 401 on `loadRecords`
- Expected: session expired banner appears, redirect to Login in 2s

**ER-2:** Server returns 401 on `handleFinishVisit`
- Expected: session expired banner appears, redirect to Login in 2s

**ER-3:** Server returns 500 on `getVisitRecords`
- Expected: falls back silently to SQLite cache; no crash

**ER-4:** Server returns 500 on `createNote` (online save attempt)
- Expected: note stays pending; no error shown; sync worker will retry

**ER-5:** Server returns 500 on `finishVisit`
- Expected: "Could not finish visit" alert; visit status unchanged; can retry

---

### Edge Cases

**EC-1:** Rapid double-tap "Save Note" — only one note created
- Expected: `isSavingRef` guard prevents second tap (synchronous)
- The note input is dismissed on first tap; second tap has no effect

**EC-2:** Rapid double-tap "Finish Visit" — only one confirmation dialog
- Expected (after H4 fix): second tap blocked by `isFinishingRef`
- Before fix: two dialogs may appear; confirming both fires two PATCH calls

**EC-3:** Tap `+ Note`, type text, tap Cancel
- Expected: note is NOT saved; inline input dismissed

**EC-4:** App backgrounded while note input is open → foregrounded
- Expected: note input remains open; text not lost

**EC-5:** App killed after `insertLocalNote` but within transaction (before `enqueueOperation`)
- Expected: both writes fail atomically (transaction); note not orphaned in SQLite without sync_queue entry

**EC-6:** Note text exactly 5000 characters
- Expected: accepted; text saved; maxLength enforced at 5000

**EC-7:** Note text with SQL injection string (`'; DROP TABLE visit_records; --`)
- Expected: stored as literal text; no SQL execution (parameterised queries)

**EC-8:** Note text with Unicode / emoji (e.g., `Patient says: 🤒 सिरदर्द`)
- Expected: stored and displayed correctly

**EC-9:** Open D4 immediately after D6 creates a visit (draft in visits_draft, no server records yet)
- Expected: D3 should prevent navigation to D4 for draft visits (only synced visits navigate to D4)
- Verify: "View Full Visit" is disabled for draft visits in D3

**EC-10:** Edit a synced note → navigate away and back to D4
- Expected: edited text visible (local SQLite)
- After next `getVisitRecords` server fetch: original server text returned → edited text overwritten
- This is the documented MEDIUM debt; just verify the behavior is as expected

**EC-11:** Visit has no chief_complaint (null)
- Expected: Chief Complaint section not shown (both `showClinicalContent && chiefComplaint` conditions in JSX)

**EC-12:** Long patient name (50+ characters)
- Expected: `numberOfLines={1}` + ellipsis truncates; does not overflow card

**EC-13:** Soft-delete a pending note → sync worker fires → note reappears (MEDIUM debt)
- Steps: save note offline → go offline before sync → delete note → go online → wait for sync worker → navigate back to D4
- Expected: note reappears after server refresh (documented behavior — accept for v1)

---

### Consent Edge Cases

**CE-1:** Open D4 for another doctor's visit; patient grants consent while D4 is open (simulated by calling consent endpoint externally)
- Expected: `consentGrantedLive` updated on next D4 mount; NOT updated while screen is open (no useFocusEffect)
- Navigate away and back → content now visible

**CE-2:** Open D4 for own visit; check consent banner not shown
- Expected: consent banner (`!isOwnVisit && !consentGrantedLive`) only shown for other-doctor visits

---

## VERDICT

**BLOCKED — must fix D4-QA-C1, H1, H2, H3, H4 before device testing.**

| Priority | ID | Type | Summary |
|---|---|---|---|
| 1 | D4-QA-C1 | CRITICAL | `handleSaveNote` doesn't clear sync_queue on direct API success → duplicate notes |
| 2 | D4-QA-H1 | HIGH | `isOnline` always false on mount → server fetch never fires on initial open |
| 3 | D4-QA-H2 | HIGH | `loadRecords` infinite spinner if `getCachedRecords` throws |
| 4 | D4-QA-H3 | HIGH | `+ Note` permanently disabled if `finally` block `getCachedRecords` throws |
| 5 | D4-QA-H4 | HIGH | No synchronous tap guard on Finish Visit → double-PATCH race |
| 6 | D4-QA-M1 | MEDIUM | Consent banner reads stale nav param, not `consentGrantedLive` |
| 7 | D4-QA-M2 | MEDIUM | `upsertRecordsFromServer` not transactional |
| 8 | D4-QA-M3 | MEDIUM | Soft-deleted pending note reappears after server refresh (existing debt) |
| 9 | D4-QA-M4 | MEDIUM | `record_count` not updated in `visits` table on finish |

**ESTIMATED FIX EFFORT:** 2–3 hours (C1, H1–H4 are surgical changes; M1–M4 are straightforward)

Next step after Builder fixes: **QA re-review (Step 7b) or direct to device testing if fixes are clean and low-risk.**
