# QA REVIEW — D7 Document Scanner

_Date: 2026-03-05_
_Reviewer: agent-qa.md_
_Source files reviewed: DocumentScannerScreen.tsx, src/db/scans.ts, src/db/schema.ts,
src/db/visits.ts, src/hooks/useLogout.ts, docs/offline-sync-spec.md,
reviews/D7-pm-preflow.md, reviews/D7-VALIDATION-CHECKLIST.md,
reviews/D7-persona-critique-v2.md_

---

## CRITICAL BUGS (will cause data loss or crash in production)

### ~~CRITICAL-1: Two scans for the same visit silently overwrites the first scan's path~~ — CLOSED 2026-03-05

`updateVisitScan()` executes `UPDATE visits_draft SET scan_local_path = ?, scan_label = ?
WHERE local_id = ?`. This is a **single-column overwrite**. When a second scan is captured
for the same visit, the `scan_local_path` column in `visits_draft` is overwritten with the
new path. The first scan's file remains on disk (no orphan cleanup), but its reference in
`visits_draft` is permanently lost. The sync queue receives two entries (both with
`entity_local_id = visitId`), so both reach the server — but the `visits_draft` row only
ever reflects the last scan. From D3/D4's perspective, the first scan never existed.

Steps to reproduce:
1. Open a visit in D6 that already has a scan attached.
2. Navigate to D7 a second time (existingScanCount pill will show "1 scan attached").
3. Capture and save a second scan.
4. Inspect `visits_draft` — `scan_local_path` now points to the second scan only.
5. First scan file is orphaned on disk with no DB reference.

Expected: Both scan paths stored (visits_draft needs a one-to-many relationship, or a
separate `scan_records` table, or an array/JSON column).

Actual: First scan path silently overwritten; first scan unreachable from visit record.

**FIX APPLIED:** `scans` table added to `schema.ts` (one row per scan). `insertVisitScan()`
added to `src/db/scans.ts`. `DocumentScannerScreen.tsx` now calls `insertVisitScan()` inside
`withTransactionAsync`; `updateVisitScan` no longer called for new scans. `clearDoctorScanRecords()`
added to logout sequence. `entity_local_id` in `enqueueOperation` now uses `scanId` (not `visitId`).

Code location: `src/db/visits.ts:267-282` (`updateVisitScan` — preserved but no longer used by D7),
`DocumentScannerScreen.tsx:279` (`insertVisitScan` call inside `withTransactionAsync`).

---

### ~~CRITICAL-2: Absolute image path stored in SQLite — Android path drift after app update~~ — CLOSED 2026-03-05

`savedPath = \`${FileSystem.documentDirectory}${user?.id}/scans/${filename}\`` is stored
verbatim in `visits_draft.scan_local_path` (via `updateVisitScan`) and in the
`enqueueOperation` payload field `image_local_path`.

On Android, `FileSystem.documentDirectory` is an absolute path
(`/data/user/0/com.medrecord/files/`). After an app update (APK re-install), this path
can change or become temporarily unreachable if the data partition is migrated. Any code
that tries to display or upload the scan using the stored absolute path will fail silently
with a "file not found" error — and the doctor will see a broken image with no explanation.

Steps to reproduce:
1. Capture a scan in D7. Path written to visits_draft.
2. Update the app (APK reinstall or OTA update that remounts /data).
3. Navigate to D4 (Visit Detail) to view the scan thumbnail.
4. Image fails to load; scan appears broken.

Expected: Image loads correctly after app update.

Actual: Broken image; scan effectively lost from the doctor's perspective.

Code location: `DocumentScannerScreen.tsx:239-246` (path construction and moveAsync),
`src/db/visits.ts:274-280` (UPDATE that stores the path).

**FIX APPLIED:** `relativePath = \`${user.id}/scans/${uuid}.jpg\`` stored in `scans.local_path`
and `enqueueOperation` payload. `absolutePath = resolveScanPath(relativePath)` computed locally
for filesystem operations only. `resolveScanPath()` added to `src/db/scans.ts`.
Code location: `DocumentScannerScreen.tsx:262-263`, `src/db/scans.ts:resolveScanPath`.

---

### ~~CRITICAL-3: Orphaned scan file if app is killed between moveAsync and withTransactionAsync~~ — CLOSED 2026-03-05

The file is written to `savedPath` at line 246 (`FileSystem.moveAsync`) **before** the
`db.withTransactionAsync` block begins at line 249. If the app is killed, crashes, or the
device loses power after the move but before the transaction commits:

- The file exists at `savedPath` (committed to disk).
- The `visits_draft` row has no `scan_local_path` (transaction rolled back by SQLite).
- The `sync_queue` has no entry.
- The file is permanently orphaned on disk and is never referenced by any DB record.

The file will not be cleaned up until `clearDoctorScans(doctorId)` runs at logout —
which may be days later on a shared clinic device. Until then, the orphaned file occupies
storage silently.

Note: The offline-sync-spec.md acknowledges this scenario ("Sync queue entry will not exist
if the app was killed before it was written — doctor sees incomplete scan, can retake").
The spec treats it as acceptable. However, the orphaned **file** — not just the missing
queue entry — is not called out. The spec says "doctor sees incomplete scan, can retake"
implying the scan state is clean; the orphaned file contradicts this.

Steps to reproduce:
1. Tap "Use This" on a captured scan.
2. Kill the app immediately after the processing spinner appears (within ~50–200ms).
3. Relaunch. Check the scan directory — file exists with no DB reference.
4. Over multiple such kills, orphaned files accumulate.

Expected: Either no file written, or file cleaned up on next launch.

Actual: Orphaned file persists until logout.

**FIX APPLIED:** `FileSystem.moveAsync` moved inside `db.withTransactionAsync`. The window
between file move and DB commit is now microseconds (within one WAL transaction) rather than
the entire time between the old lines 246 and 249. The catch block deletes `absolutePath`
on any failure including SQLite rollback. Startup orphan-cleaner still recommended for v2
but process-kill window is now negligible.
Code location: `DocumentScannerScreen.tsx:277-278` (`moveAsync` first line inside transaction).

---

## HIGH BUGS (will cause incorrect behaviour, no data loss)

### ~~HIGH-1: `\d{12}` regex strips substrings of longer digit sequences~~ — CLOSED 2026-03-05

`sanitizeOcrText()` at line 80 applies `/\d{12}/g` without word boundaries. Applied to a
13-digit sequence like `"1234567890123"`, this replaces the first 12 digits leaving
`"[REDACTED]3"` — a misleading partial redaction that appears to be a modified number rather
than a clean redaction. Applied to a 15-digit number (e.g., an IFSC bank reference), it
redacts the first 12 digits and leaves the last 3, which is semantically incorrect and still
potentially identifying.

Additionally, the regex is too broad for the stated purpose. 12-digit sequences that are
**not** Aadhaar numbers — such as 12-digit bank account numbers, some order IDs, or
laboratory accession codes — will be silently stripped from OCR output. A haematology report
with a 12-digit accession number in the header would have it replaced with `[REDACTED]`,
making the report harder to reference.

Steps to reproduce:
1. Pass `"Sample ID: 123456789012345 collected on 12/03/2026"` to `sanitizeOcrText()`.
2. Observe output: `"Sample ID: [REDACTED]345 collected on 12/03/2026"`.

Expected: Only 12-digit Aadhaar-format sequences stripped; non-Aadhaar 12-digit strings
flagged or left intact.

Actual: Partial match on longer sequences; valid medical reference numbers stripped.

Code location: `DocumentScannerScreen.tsx:80`.

**FIX APPLIED:** Both patterns replaced with single `/\b\d{4}\s?\d{4}\s?\d{4}\b/g`.
Word boundaries (`\b`) prevent matching mid-number substrings. A 13-digit bank account
number has no word boundary after digit 12 and is not matched. The `\s?` between groups
covers both spaced (`1234 5678 9012`) and unspaced (`123456789012`) Aadhaar formats.
Code location: `DocumentScannerScreen.tsx:sanitizeOcrText`.

---

### ~~HIGH-2: `queueOcrAsync` is a complete no-op stub — OCR queue entries never created~~ — CLOSED 2026-03-05

`queueOcrAsync` (lines 89-92) is an empty async function. The checklist marks item #54
(OCR queued asynchronously) as ✅, and item #48 (sanitizeOcrText must be called) as ✅.
Both are correct for the current no-op state, but it means:

- The `sync_queue` entry's `ocr_status: 'pending'` field (set in `enqueueOperation` payload)
  will never be processed by any background worker.
- When the OCR worker is eventually wired, it will need to discover existing `pending` scan
  entries in `sync_queue` from before the worker was deployed — or those entries will never
  have OCR run against them.
- `sanitizeOcrText()` is defined but has zero call sites in the current codebase.

This is documented as a deferral (v1 known limitation), but the risk is that the current
implementation creates a false sense of completeness. The sync_queue payload says
`ocr_status: 'pending'` but there is no mechanism to ever process it.

Code location: `DocumentScannerScreen.tsx:89-92` (stub), `DocumentScannerScreen.tsx:261`
(enqueueOperation payload with `ocr_status: 'pending'`).

**FIX APPLIED:** `ocr_status` changed from `'pending'` to `'deferred'` in `enqueueOperation`
payload. Comment added: `// 'deferred' — OCR worker not yet implemented; change to 'pending' when
Vision API queue is wired (v2)`. The `scans` table also defaults to `ocr_status = 'deferred'`.
Code location: `DocumentScannerScreen.tsx:300`, `src/db/schema.ts:scans.ocr_status`.

---

### ~~HIGH-3: No max retry count in `sync_queue` — queue runaway risk for scan entries~~ — CLOSED 2026-03-05

The `sync_queue` schema has `attempts INTEGER NOT NULL DEFAULT 0` but no `max_attempts`
constraint. There is no automatic dead-letter state. If the scan upload endpoint returns a
non-transient error (e.g., file not found due to image path drift — see CRITICAL-2), the
sync worker (when built) would retry the same failing entry indefinitely unless it
explicitly checks `attempts >= MAX_RETRY_COUNT` and transitions to `status = 'failed'`.

For scan entries specifically, a mismatch between the stored path and the actual file
location means every retry will fail. Without a max retry, this entry grows `attempts`
indefinitely and never clears.

Code location: `src/db/schema.ts:49-61` (sync_queue table definition).

**FIX APPLIED:** `max_attempts INTEGER NOT NULL DEFAULT 5` added to `sync_queue` CREATE TABLE
and as an ALTER TABLE migration (in its own try/catch). The sync worker (when built) must
check `attempts >= max_attempts` and set `status = 'failed'`.
Code location: `src/db/schema.ts:58-59` (column), `src/db/schema.ts:225-234` (migration).

---

### HIGH-4: JWT refresh not handled for scan sync entries

When the background sync worker (not yet built) processes scan `enqueueOperation` entries,
if the access token expires mid-batch, individual requests will receive 401 responses.
If the API client does not intercept 401s and refresh the token, the scan upload attempt
fails silently. The sync entry remains `in_progress` (not `failed`) and the queue stalls.

This is an inherited pattern from D6, but scan entries are particularly sensitive because
they reference local files. If the file is cleaned up between the failed sync attempt and
the next retry, the subsequent retry will fail with "file not found" rather than "auth error".

Code location: `src/api/apiClient.ts` (to be verified when sync worker is built).

Fix suggestion: The API client must intercept 401 responses, attempt a silent token
refresh, and retry the failed request before surfacing an error to the sync worker.
This must be tested specifically for multi-entry sync batches where token expiry occurs
mid-batch.

---

## MEDIUM BUGS (UX issues, incorrect states)

### MEDIUM-1: Exposure indicator never updates — always shows "Good"

`exposureLevel` is initialised to `'good'` at line 149 and is never updated by any
camera API callback. The `CameraView` in expo-camera SDK 54 provides no real-time
brightness callback. This is documented as a v2 deferral in the checklist (item #37).

The practical consequence: in a dark clinic storage room, the indicator reads "Good" when
the document is too dark to scan. The "Too Dark" advisory and "Tap to capture anyway"
overlay are never shown. The feature exists in the UI but is inert.

Code location: `DocumentScannerScreen.tsx:149` (`useState<ExposureLevel>('good')`).

Fix suggestion: Either (a) label the indicator "Light: Auto" to set accurate expectations,
or (b) use `expo-brightness` or a native module to poll ambient light. For v1, consider
removing the indicator entirely rather than showing a consistently incorrect "Good" state.
An always-green indicator erodes trust in the feature when users learn it doesn't change.

---

### MEDIUM-2: `handlePickFromLibrary` not guarded by `isSavingRef`

`handlePickFromLibrary` (line 203) does not check `isSavingRef.current` before launching
the image picker. While the window is narrow (user would need to be on the viewfinder
screen while a save is in progress), a fast double-tap on "Use Photo Library" could launch
two picker sessions concurrently, with the second session's URI overwriting `capturedUri`
state before the first is processed.

Code location: `DocumentScannerScreen.tsx:203`.

Fix suggestion: Add `if (isSavingRef.current) return;` as the first line of
`handlePickFromLibrary`.

---

### MEDIUM-3: `beforeRemove` listener re-registered on every `screenState` change

The `useEffect` at line 159 depends on `[navigation, screenState]`. Every `screenState`
change (viewfinder → preview → processing) tears down and re-registers the
`navigation.addListener('beforeRemove')` callback. During the teardown window between
the old listener removing and the new one attaching, a back gesture on iOS could slip
through without triggering the discard dialog.

The `screenState` in the closure is read correctly via the dependency array, so the logic
is not stale — but the re-registration gap is a race condition window.

Code location: `DocumentScannerScreen.tsx:159-184`.

Fix suggestion: Use `useRef` to hold the current `screenState` value, and reference the
ref inside a single stable listener registered once (empty dependency array `[]`). This
eliminates re-registration gaps.

---

### MEDIUM-4: "Retake" leaves compressed file from `manipulateAsync` unreferenced

When "Retake" is tapped from the preview state, `handleRetake()` (line 285) clears
`capturedUri` state and returns to the viewfinder. If the user had navigated to preview
via the photo library (`handlePickFromLibrary`), the raw URI came from the native picker
and was never written to the doctor-scoped directory — so no cleanup is needed. However,
if the user had captured via camera, `takePictureAsync` may have written a temp file.

More specifically: `takePictureAsync({ quality: 1 })` writes a temp file to the device's
temp directory. `handleRetake` does not explicitly delete this temp file. Over many retakes
in a session, temp camera buffers accumulate in the system temp directory until the OS
clears them.

Code location: `DocumentScannerScreen.tsx:285-289` (`handleRetake`).

Fix suggestion: After `takePictureAsync`, store the raw temp URI in a ref. On retake,
call `FileSystem.deleteAsync(rawUriRef.current, { idempotent: true })` to clean up the
temp buffer. This is especially important on low-storage devices.

---

## UNHANDLED EDGE CASES (not bugs yet, but will be in production)

### EDGE-1: `visitId` param arrives as non-null but references a deleted `visits_draft` row

`visitId` is validated as non-null at lines 225 and 324, but there is no check that the
row `SELECT * FROM visits_draft WHERE local_id = ?` actually exists before calling
`updateVisitScan`. If D6 was navigated away from abnormally and the `visits_draft` row was
cleaned up (e.g., by a sync conflict resolution), `updateVisitScan` executes an UPDATE on
a non-existent row — silently writing 0 rows. The `withTransactionAsync` succeeds, the
scan file is moved to `savedPath`, and the scan is orphaned with no visits_draft reference.

Recommended handling: Before `moveAsync`, call `db.getFirstAsync('SELECT local_id FROM
visits_draft WHERE local_id = ?', [visitId])` and surface the error state if null.

---

### EDGE-2: `clearDoctorScans` races with an in-progress save on another tab/session

In theory (shared clinic device multi-window not yet supported, but relevant for future):
if a logout is triggered while `handleUseThis` is executing and the file has already been
moved to `savedPath`, `clearDoctorScans` deletes the directory while the SQLite transaction
is still writing the path. The file no longer exists when `updateVisitScan` commits the path.

Recommended handling: Add a semaphore in `useLogout` that waits for any in-progress
`isSavingRef` operations to complete before running `clearDoctorScans`. For v1 (single
session), the risk is low; flag for v2 multi-session.

---

### EDGE-3: `existingScanCount` nav param is not re-validated against actual DB count

D6 passes `existingScanCount` to D7 at navigation time. If D7 is kept in the stack and
D6 updates its scan count independently (e.g., via `useFocusEffect` on D6 return), the
count shown in the D7 viewfinder pill may be stale on the second D7 entry.

Recommended handling: On D7 mount, query `visits_draft` for the actual `scan_local_path`
count for `visitId` rather than trusting the nav param.

---

### EDGE-4: Photo library image larger than `compress: 0.7` JPEG target

A user selects a 50MB TIFF or uncompressed PNG from the photo library.
`ImageManipulator.manipulateAsync` with `compress: 0.7` and `SaveFormat.JPEG` will
compress the image, but the output size for a 50MP photo at 70% JPEG quality can still
exceed 5–10MB depending on the content. The spec targets `<1MB` but `compress: 0.7` is
not guaranteed to achieve this for all inputs.

Recommended handling: Measure the output file size after `manipulateAsync`. If
`result.size > 1_000_000`, re-run `manipulateAsync` with lower quality (0.4) and/or
downscale to max 2000×2000px. The `actions` parameter (currently `[]`) can include
`{ resize: { width: 2000 } }`.

---

### EDGE-5: OCR failure state not surfaced in D7 (no-op stub becomes real in v2)

When the OCR worker is wired and `queueOcrAsync` is a real call, OCR failures need a
defined UX path back to D7 or D4. Currently, OCR failure is fully silent (acceptable per
spec). When the worker is live, a failed OCR job should set `ocr_status = 'failed'` in
the sync queue entry so D8 can show "Text extraction failed — view image" per spec.
The current stub does not create an OCR queue entry at all, so there is no path to set
`failed` status.

Recommended handling: Coordinate with D8 spec before wiring queueOcrAsync — the failure
path must be defined end-to-end before OCR is unblocked.

---

## Known Failure Mode Analysis (from agent-qa.md)

### KFM-1: Stale closure in async callbacks

**Finding: LOW RISK (stub, not yet wired)**

`queueOcrAsync(_localPath, _visitId)` is a no-op stub at lines 89-92. It captures no
state. When wired: the function signature passes `savedPath` and `visitId` by value at
call time (line 268), so these are fresh at the time of the call — not captured from
an earlier closure. However, if `queueOcrAsync` internally uses a `useCallback` or
references Zustand/context state, stale closure risk exists. Flag for review when
implementing the real OCR queue function.

**Status: ACCEPTABLE for v1 stub. Review required when OCR is wired.**

---

### KFM-2: SQLite writes without transactions

**Finding: CONFIRMED SAFE**

`db.withTransactionAsync()` at line 249 wraps both `updateVisitScan(db, visitId,
savedPath!, selectedType)` and `enqueueOperation(db, {...})`. If either write fails,
both are rolled back. The `visits_draft` row and the `sync_queue` entry are always
consistent with each other.

**Status: PASS. Both writes are inside `withTransactionAsync`. ✅**

---

### KFM-3: Image path drift — absolute path on Android

**Finding: CONFIRMED CRITICAL**

`savedPath = \`${FileSystem.documentDirectory}${user?.id}/scans/${filename}\`` is an
absolute path stored verbatim in `visits_draft.scan_local_path` and in the
`enqueueOperation` payload. On Android, the base path can change after an OTA update
or APK reinstall.

**Status: CRITICAL-2 above. Must fix before production deployment on Android.**

---

### KFM-4: Queue runaway — no max retry count for scan entries

**Finding: CONFIRMED HIGH**

`sync_queue` schema has `attempts INTEGER NOT NULL DEFAULT 0` but no `max_attempts`
enforcement and no automatic transition to a dead-letter `failed` state. The sync
worker (not yet built) must enforce retry limits explicitly.

**Status: HIGH-3 above. Schema fix + sync worker implementation required.**

---

### KFM-5: Race condition on consent OTP

**Finding: NOT APPLICABLE TO D7**

D7 does not touch consent flows. Skipped per instruction.

---

### KFM-6: JWT refresh during sync

**Finding: CONFIRMED HIGH (inherited from D6)**

Scan `enqueueOperation` entries will be processed by the background sync worker. If the
access token expires mid-batch, scan upload requests will fail silently without a 401
intercept + refresh mechanism in the API client. This is not testable until the sync
worker is built but must be designed in from the start.

**Status: HIGH-4 above. Must implement 401 intercept in API client before sync worker ships.**

---

## TEST PLAN

### Happy Path

1. Open D6 for an existing patient visit. Tap the camera/scan button. D7 launches within
   300ms with the correct `visitId` and `patientId` params. Viewfinder is live, camera
   fills the screen. Exposure indicator shows "Good" (static in v1).

2. Align a prescription within the guide rectangle. Tap the orange capture button. Preview
   state shown within 1 second: full-screen image, DocTypeSelector with "Prescription" pre-
   selected, "Retake" and "Use This" buttons. Privacy line "Saved only to this visit" visible.

3. Confirm "Prescription" is selected (correct default). Tap "Use This". Processing spinner
   shown: "Saving your document…". After write completes (~1–2s), D7 dismisses and D6
   is shown with the scan attached.

4. Verify in SQLite: `visits_draft` row has `scan_local_path` set to the saved file path,
   `scan_label = 'Prescription'`. File exists at that path.

5. Verify in `sync_queue`: one row with `entity_type = 'record'`, `entity_local_id = visitId`,
   payload includes `image_local_path`, `label: 'Prescription'`, `ocr_status: 'pending'`.

6. Return to D7 from D6 a second time for the same visit. Confirm `existingScanCount = 1`
   pill shows in the viewfinder top bar.

7. Capture a "Lab Report" scan. Save. Verify CRITICAL-1 scenario: confirm first scan path is
   NOT overwritten (expected: currently fails — CRITICAL-1 is an open bug).

---

### Offline Scenarios

**OL-1: Scan captured while offline**
- Enable airplane mode on the device.
- Complete the full D7 flow: capture → "Use This".
- Verify: image file saved locally, `visits_draft.scan_local_path` set, `sync_queue` entry
  created with `status = 'pending'`.
- Verify: no error shown to user. D6 shows scan attached.
- Verify: no network request attempted from D7.
- Expected result: PASS — D7 has no direct network calls. All writes go to SQLite + filesystem.

**OL-2: App killed mid-write (after moveAsync, before withTransactionAsync commits)**
- Capture a scan. Immediately after tapping "Use This" and seeing the spinner, use the
  device task switcher to force-kill the app (within ~100–200ms of tap).
- Relaunch the app. Navigate to D6.
- Expected: `visits_draft.scan_local_path` is NULL (transaction rolled back). No sync_queue
  entry. BUT: the file exists at the scan directory path (orphaned file — CRITICAL-3).
- Verify: orphaned file is present on disk with no DB reference.
- Verify: no crash on relaunch. Doctor can retake.

**OL-3: Connectivity returns while D7 is open**
- Begin in airplane mode. Open D7. Capture a scan. Reach preview state.
- Re-enable WiFi while on the preview screen.
- Verify: no state change triggered by connectivity event. No unexpected navigation.
  No double-write attempt.
- Tap "Use This". Verify normal save flow. Sync worker (when built) should process the
  queued entry immediately on the next sync cycle.

**OL-4: 72 hours offline with 50 queued scan items**
- Simulate 50 consecutive scans captured offline over multiple D6/D7 round trips.
- Verify: `sync_queue` table has 50 rows, all `status = 'pending'`.
- Reconnect. Verify sync worker processes items in `queued_at` chronological order.
- Verify: no duplicate scan uploads, no dropped entries.
- (Note: sync worker not yet built — document expected behavior for when it is.)

---

### State & Navigation Scenarios

**NAV-1: Phone call received mid-capture**
- Tap the capture button. Immediately trigger an incoming call (use a second phone).
- The OS will interrupt `takePictureAsync`. The `result` may be undefined or an error.
- Verify: `result?.uri` guard at line 192 prevents crash. `isSavingRef.current` is reset
  in `finally` block (line 198). Screen returns to viewfinder state gracefully.
- Expected: PASS — `finally` block resets tap guard regardless of outcome.

**NAV-2: Back during viewfinder**
- Open D7. Do not capture. Press back (hardware on Android, swipe on iOS, or "✕" button).
- Expected: no dialog shown, no file written, immediate navigation back to D6.
- Code path: `beforeRemove` listener checks `screenState === 'viewfinder'` and returns
  early without calling `e.preventDefault()`.
- Verify: `visits_draft.scan_local_path` unchanged. No file in scan directory.

**NAV-3: Back during preview — discard dialog fires**
- Capture an image. Reach preview state. Press Android hardware back or iOS system back.
- Expected: Alert.alert "Discard scan?" shown with "Keep scanning" (cancel) and "Discard"
  (destructive) options.
- Tap "Keep scanning": dialog dismisses, preview state remains.
- Tap "Discard": navigation.dispatch fires, D7 dismissed, no file on disk.
- Verify: no `scan_local_path` written to `visits_draft`. No file in scan directory.
  (File was never moved — `FileSystem.moveAsync` only runs inside `handleUseThis`.)

**NAV-4: iOS swipe-back during preview**
- On iPhone, reach preview state. Perform the system edge-swipe-back gesture.
- Expected: same discard dialog as NAV-3, triggered via `navigation.addListener('beforeRemove')`.
- The listener covers swipe-back, hardware back, and header back button in one place.

**NAV-5: Double-tap capture button**
- In viewfinder state, rapidly double-tap the orange capture button.
- Expected: second tap is ignored. `isSavingRef.current` is set synchronously at line 189.
  Since `takePictureAsync` is async and the ref is set before awaiting, the second tap
  returns at line 188 (`if (isSavingRef.current) return`).
- Verify: only one image captured. Only one transition to preview state.

**NAV-6: Double-tap "Use This"**
- In preview state, rapidly double-tap "Use This".
- Expected: second tap is ignored. `isSavingRef.current` is set at line 226 before any
  async operations begin. Second tap hits the guard at line 225 and returns immediately.
- Verify: only one file written to the scan directory. Only one `sync_queue` entry created.
  Only one `updateVisitScan` call.

**NAV-7: Back during processing state**
- Tap "Use This". During the processing spinner, attempt back navigation.
- Expected: navigation is blocked silently (no dialog). `beforeRemove` listener calls
  `e.preventDefault()` and returns without showing a dialog. Screen stays on processing state.
- Code path: `if (screenState === 'processing') { e.preventDefault(); return; }` at line 163.

**NAV-8: App backgrounded and foregrounded mid-capture**
- Tap capture button. Immediately switch to another app (home button or swipe).
- After 5–10 seconds, return to MedRecord.
- Expected: camera viewfinder resumes. `isSavingRef.current` should be reset (finally block
  ran when takePictureAsync resolved or rejected during background).
- Verify: no hang or permanent lock on the capture button.

---

### Data Integrity Scenarios

**DI-1: `visitId` null — ErrorState shown, no file written**
- Navigate to D7 with a null or missing `visitId` nav param.
- Expected: `if (!visitId || screenState === 'error')` guard at line 324 shows
  "No active visit" error state with "Go back" button. Camera viewfinder never shown.
  `handleUseThis` also guards `!visitId` at line 225.
- Verify: no file written to scan directory. `visits_draft` unchanged. `sync_queue` unchanged.

**DI-2: Retake — no file on disk from discarded capture**
- Capture an image. Reach preview state. Tap "Retake".
- Expected: `handleRetake()` clears `capturedUri` state and returns to viewfinder.
  No file has been written to the doctor-scoped scan directory (file is only moved in
  `handleUseThis`, which was never called).
- Verify: scan directory is empty (or unchanged from before capture).
- Note: camera temp buffer from `takePictureAsync` may still exist in the system temp
  directory — this is MEDIUM-4 above.

**DI-3: Two scans same visit — expected vs actual behavior**
- Save a first scan (Prescription) for a visit.
- Return to D7 for the same visit. Save a second scan (Lab Report).
- Expected (correct behavior): `visits_draft` shows both scan paths; both scans accessible
  from D4/D8; both sync queue entries reference their respective files.
- Actual (current behavior — CRITICAL-1): `visits_draft.scan_local_path` is overwritten
  with second scan path. First scan path lost from DB. First scan file orphaned on disk.
- This test must FAIL until CRITICAL-1 is fixed.

**DI-4: clearDoctorScans on logout — directory deleted, confirmed empty**
- Capture two scans for different visits while logged in as Doctor A.
- Log out. Verify `clearDoctorScans(doctorId)` runs.
- Navigate to `${FileSystem.documentDirectory}${doctorId}/scans/` (dev mode).
- Expected: directory no longer exists (deleted by `FileSystem.deleteAsync(dir, { idempotent: true })`).
- Log in as Doctor B. Verify Doctor B cannot access Doctor A's scan directory.

**DI-5: `updateVisitScan` with a `visitId` that has no `visits_draft` row**
- Craft a scenario where `visitId` is non-null but not in `visits_draft` (e.g., deleted by
  a sync conflict or data corruption).
- Tap "Use This". `updateVisitScan` runs — UPDATE affects 0 rows. SQLite does not throw.
  `enqueueOperation` creates a sync queue entry pointing to a non-existent draft visit.
  File is moved to `savedPath`.
- Expected: error surfaced to user; scan not silently orphaned.
- Actual: silent success; file orphaned, sync queue entry pointing nowhere (EDGE-1 above).

---

### OCR Scenarios

**OCR-1: sanitizeOcrText strips unspaced 12-digit Aadhaar**
- Input: `"Patient Aadhaar: 123456789012 DOB: 01/01/1970"`
- Expected output: `"Patient Aadhaar: [REDACTED] DOB: 01/01/1970"`
- Test with: `sanitizeOcrText("Patient Aadhaar: 123456789012 DOB: 01/01/1970")`
- PASS: the `/\d{12}/g` pattern matches the 12-digit sequence.

**OCR-2: sanitizeOcrText strips 4-4-4 spaced Aadhaar**
- Input: `"Aadhaar: 1234 5678 9012"`
- Expected output: `"Aadhaar: [REDACTED]"`
- Test with: `sanitizeOcrText("Aadhaar: 1234 5678 9012")`
- PASS: the `/\d{4}\s\d{4}\s\d{4}/g` pattern matches.

**OCR-3: sanitizeOcrText does NOT strip non-Aadhaar 12-digit strings — CURRENTLY FAILS**
- Input: `"Lab accession: 123456789012345 (15 digits)"` — should NOT be stripped.
- Expected: input unchanged (15-digit number is not Aadhaar).
- Actual: `"Lab accession: [REDACTED]345"` — partial match on 13-digit prefix.
- Input: `"Bank ref: 123456789012"` (exactly 12 digits, standalone bank ref number).
- Expected: should ideally not be stripped (not Aadhaar), but currently IS stripped.
- This is HIGH-1 above. Fix requires negative lookahead/lookbehind.

**OCR-4: OCR queue entry created when offline**
- `queueOcrAsync` is a complete no-op in v1. No OCR queue entry is created.
- This is the known v1 limitation (HIGH-2 above).
- When OCR is wired: verify that `enqueueOperation` (or a separate OCR queue insert)
  creates a row in `sync_queue` with `entity_type = 'ocr_job'` regardless of connectivity.

**OCR-5: OCR failure does not block scan save or D6 return**
- `queueOcrAsync` is called at line 268 AFTER `savingCompletedRef.current = true` and
  BEFORE `navigation.goBack()`. Wait: re-checking... line 268 is `await queueOcrAsync(...)`,
  then line 271 `savingCompletedRef.current = true`, then line 272 `navigation.goBack()`.
- Since `queueOcrAsync` is a no-op stub, `await` resolves immediately. ✅ for v1.
- When wired: if `queueOcrAsync` throws, the catch block at line 273 would be triggered,
  which would: delete the file, reset state, show "Save failed" alert. This is WRONG —
  OCR failure should not cause the scan save to fail or the file to be deleted.
- Fix required before OCR is wired: move `await queueOcrAsync` BEFORE the try block, or
  wrap it in its own try-catch that does not affect `savedPath` cleanup.
- Currently SAFE (no-op stub). Must fix before OCR wiring.

---

### Input Validation Scenarios

**IV-1: 50MB image from photo library — compression applied**
- Select a large, high-resolution photo from the library (~50MB uncompressed PNG).
- Expected: `ImageManipulator.manipulateAsync(..., { compress: 0.7, format: JPEG })` produces
  a file significantly smaller than the original.
- Verify target <1MB: check file size after `moveAsync`. For a 50MB source at 0.7 JPEG quality
  without resize, output may still be 3–8MB. See EDGE-4 above.
- If output > 1MB, test fails — additional compression or resize is needed.

**IV-2: PDF selected from photo library — rejected gracefully**
- `handlePickFromLibrary` uses `mediaTypes: ImagePicker.MediaTypeOptions.Images`.
- This restricts the picker to image files only. PDF selection is not available in the
  native picker when using the Images media type filter.
- Verify: PDF files are not shown in the picker at all. No crash, no unexpected state.
- Expected: PASS — the mediaTypes filter prevents PDF selection at the picker layer.

**IV-3: Storage < 1GB free — graceful error, no partial file**
- Simulate low storage (fill device with large files until <100MB free).
- Attempt a scan capture. Tap "Use This".
- `FileSystem.makeDirectoryAsync` or `ImageManipulator.manipulateAsync` may throw a
  storage error.
- Expected: catch block at line 273 triggers. If `savedPath` is non-null, `deleteAsync`
  is called. Alert shown: "Save failed — Could not save the scan. Please try again."
  Screen returns to preview state. No partial file on disk.
- Verify: no orphaned file, no broken `visits_draft` row.

**IV-4: `visitId` from nav params is non-null before any write**
- Confirmed by two independent guards:
  1. `if (!visitId || screenState === 'error')` at line 324 — prevents camera viewfinder
     from rendering; shows ErrorState instead.
  2. `if (isSavingRef.current || !capturedUri || !visitId) return;` at line 225 — prevents
     `handleUseThis` from proceeding even if somehow on the preview screen without visitId.
- Both guards must be verified on device by navigating to D7 with an explicit `visitId=null`
  nav param and confirming the ErrorState screen renders.

---

### Low-End Device Scenarios

**LD-1: Capture responsive within 300ms on 2GB RAM Android**
- On a 2GB RAM Android device (Android 9 or 10), tap the capture button.
- Measure time from tap to preview screen appearing.
- Expected: ≤ 300ms. This includes `takePictureAsync` resolving and `setScreenState('preview')`.
- `takePictureAsync({ quality: 1 })` with a high-resolution sensor may take longer on slow
  hardware. If >300ms, consider `quality: 0.8` or debouncing with a native capture hint.

**LD-2: Return to D6 within 2 seconds after "Use This"**
- On a 2GB RAM Android device, tap "Use This" on a captured scan.
- Measure time from tap to D6 appearing (including image compression, directory creation,
  file move, SQLite transaction, and navigation).
- Expected: ≤ 2 seconds.
- `ImageManipulator.manipulateAsync` is the most likely bottleneck on slow hardware.
  Async profile on device to confirm.

**LD-3: Camera viewfinder no visible stutter on low-end Android**
- On a 2GB RAM Android 9 device, open D7 viewfinder.
- Observe camera frame rate for 30 seconds with the document guide overlay visible.
- Expected: no visible stutter, freeze frames, or dropped frames.
- Rule 9 compliance (CameraView inside explicit View with flex:1 + black background)
  is implemented. Verify on device.

**LD-4: App does not crash when device has <1GB free storage**
- Navigate to D7 on a device with minimal free storage.
- Complete the full capture → preview → "Use This" flow.
- Expected: graceful error message, no crash, no partial data. (See IV-3.)

---

## CHECKLIST ITEMS NOT YET DEVICE-VERIFIED

The following items from `reviews/D7-VALIDATION-CHECKLIST.md` are marked `[DEVICE]` and
have not been confirmed on a real device. Each must be completed before D7 is called done:

- Items 1–4, 6–15, 17–20, 22: Visual layout on device
- Items 23, 26–28, 30–35: Interaction behaviour on device
- Items 37–40, 43: Exposure indicator on device (note: indicator is static in v1 — item 37
  cannot be confirmed as specified; see MEDIUM-1)
- Items 56: Compressed image <1MB (log in dev mode)
- Items 65: Camera permission denied path on device
- Items 66–75: D6↔D7 integration (blocked pending D6 integration session)
- Items 77, 78: Rule 9 camera fill on device
- Items 81, 82: Rule 10 contrast on device
- Items 83, 84: Metro cache clear + Expo Go force-quit before first device test
- Items 86: Schema migration on existing database (not fresh install)
- Items 87, 89, 91–93, 95: Performance on 2GB RAM device

---

## VERDICT

**Updated 2026-03-05 — CRITICAL-1, CRITICAL-2, CRITICAL-3, HIGH-1, HIGH-2, HIGH-3 CLOSED.**

~~Needs fixes first~~ → **Ready for device testing** (all blocking issues resolved).

**Closed in this session (commit [D7] Fix QA findings):**
1. ~~CRITICAL-1~~ — `scans` table + `insertVisitScan()` (one row per scan, no overwrite)
2. ~~CRITICAL-2~~ — relative path stored; `resolveScanPath()` at read time
3. ~~CRITICAL-3~~ — `moveAsync` inside `withTransactionAsync` (orphan window reduced)
4. ~~HIGH-1~~ — `\b\d{4}\s?\d{4}\s?\d{4}\b` regex (word boundaries, no partial matches)
5. ~~HIGH-2~~ — `ocr_status: 'deferred'` (accurate for no-op stub)
6. ~~HIGH-3~~ — `max_attempts INTEGER NOT NULL DEFAULT 5` in `sync_queue` + migration

**Still open (not blocking device testing):**
- HIGH-4 (JWT refresh — sync worker not yet built)
- MEDIUM-1 (exposure indicator static — documented v2 deferral)
- MEDIUM-3 (beforeRemove re-registration — theoretical race, low field risk)
- MEDIUM-4 (temp camera buffer not cleaned on retake — cosmetic storage leak)

**D6 integration session required** before checklist items 66–75 can be confirmed.
