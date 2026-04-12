# QA REVIEW — D5: New Patient Form

**Screen:** D5 — New Patient Form  
**File:** `src/screens/doctor/NewPatientFormScreen.tsx`  
**QA date:** 2026-04-11  
**Agent:** QA Engineer  
**Based on:** Builder Step 7 output (commit 1109cab — 4 HIGH security findings fixed)

---

## TESTING PREREQUISITES

| Field | Value |
|---|---|
| Backend URL | `https://medrecord-api.onrender.com/v1` |
| Backend status | DEPLOYED — Render.com. Confirm with `curl https://medrecord-api.onrender.com/v1/health` before each device test session |
| Test credentials | Dr. Test Doctor, mobile `9999999999`, OTP bypass `000000` (`TEST_OTP_BYPASS=true` set) |
| Cert pinning | EAS custom build required for `pinnedFetch` — does NOT work in Expo Go |
| Navigation | D5 reached from D2 via "Add New Patient" FAB — prefills `prefillMobile` from the search query |
| Status | **READY TO TEST** (conditional on backend health check passing at session start) |

---

## CRITICAL BUGS

### D5-QA-C1 — `INSERT OR IGNORE` silent failure cascades into phantom `localId` in sync queue and D6 navigation

**Impact:** Silent data corruption — patient never synced; D6 receives a phantom patientId

**Steps to reproduce:**
1. Ensure a patient with mobile `9876543210` already exists in the SQLite `patients` table under any `doctor_id` (can happen if a prior session created this patient and logout did not complete, or via the D5-M-1 shared-device scenario)
2. Navigate to D5 with `prefillMobile = '9876543210'`
3. Fill name + DOB + gender and tap "Save & Begin Visit"

**Expected:** Save is blocked with a clear error ("Patient already exists — please search for them instead") or the existing patient's `local_id` is reused

**Actual:** `insertLocalPatient` at line 278 uses `INSERT OR IGNORE` — the INSERT is silently skipped. All downstream operations use the phantom `localId` that was never written to the DB:
- `logLocalPatientAccess` at line 289 logs `patient_created` with a phantom `entity_local_id` — audit event is false
- `enqueueOperation` at line 294 enqueues a 'create' operation for an `entity_local_id` that doesn't exist in `patients` — sync worker cannot find the row; operation eventually dead-letters at max_attempts (5)
- `navigation.navigate('NewVisit', { patientId: localId })` at line 357 — D6 calls `getPatientByLocalId(db, localId)` which returns null; D6 has no patient data for the visit
- `setPatientServerId(db, localId, ...)` — updates 0 rows if online 201 response is received

**Code location:** `NewPatientFormScreen.tsx:278` (`insertLocalPatient`) — no success check before lines 289-306

**Fix:** `insertLocalPatient` should return the actual `local_id` written. If the insert was a no-op (IGNORE), return the existing row's `local_id`. Downstream steps then use the correct ID. Alternatively, change the schema to use `UNIQUE(doctor_id, mobile_number)` as specified in D5-M-1 — which would mean the conflict only fires for the same doctor trying to create the same mobile twice, a much rarer scenario.

---

### D5-QA-C2 — `patient_created` audit event fires unconditionally, even if the INSERT was a no-op

**Impact:** False audit trail — `patient_created` logged for a phantom patient that was never actually inserted

**Steps to reproduce:** Same as C1 — trigger the `INSERT OR IGNORE` no-op path

**Expected:** Audit event fires only if a patient row was actually created

**Actual:** `logLocalPatientAccess(db, user.id, 'patient_created', { entity_local_id: localId })` at line 289 is called unconditionally after `insertLocalPatient`, with no check of whether the INSERT succeeded. DPDP audit log contains a false `patient_created` event pointing to a non-existent entity.

**Code location:** `NewPatientFormScreen.tsx:289`

**Fix:** Verify the patient row was actually written before logging the audit event. E.g., call `getPatientByLocalId(db, localId)` after `insertLocalPatient` — if null, the INSERT was ignored.

---

## HIGH BUGS

### D5-QA-H1 — Save button stuck in loading state (ActivityIndicator) if doctor navigates back from D6

**Impact:** Broken UX — D5 appears broken after a successful save; requires app restart

**Steps to reproduce:**
1. Open D5 with a valid prefilled mobile, fill in the name field
2. Tap "Save & Begin Visit" — D6 opens successfully
3. Press the back button from D6 (Android hw back or iOS swipe-to-go-back)
4. D5 is restored from the stack

**Expected:** D5 shows the form fields as they were, with the Save button in its normal (pressable) state

**Actual:** `handleSave` at line 252 calls `setIsSaving(true)` when the save begins. On the success path, `setIsSaving(false)` is never called before `navigation.navigate('NewVisit', ...)` at line 357. When D5 is restored from the navigation stack, `isSaving` is still `true`. The Save button renders with `ActivityIndicator` and is `disabled`. There is no recovery path for the doctor.

**Code location:** `NewPatientFormScreen.tsx:252` (setIsSaving=true), line 357 (navigate without resetting isSaving)

**Fix:** Add `setIsSaving(false)` immediately before `savingCompletedRef.current = true` on the success path (line 356).

---

### D5-QA-H2 — No DOB "Clear" option — doctor cannot reset an accidentally selected date

**Impact:** Data quality — incorrect DOB locked in with no way to remove it without restarting

**Steps to reproduce:**
1. Open D5. Tap the "Date of Birth" field to open the picker.
2. Accidentally scroll the picker wheel to any date and dismiss (iOS: tap Done; Android: tap OK)
3. DOB is now set to the wrong date

**Expected:** A "Clear" or "Remove" affordance next to the DOB field to reset it to blank

**Actual:** Once any date is selected, there is no way to clear the DOB field. The `handleDateChange` at line 240 only calls `setDob(dateToISO(selectedDate))` — there is no setDob('') path reachable from the picker. The doctor must close the form entirely (triggering the discard dialog) and re-enter.

**Code location:** `NewPatientFormScreen.tsx:436-476` (date picker block)

**Fix:** When `dob !== ''`, render a "Clear" button (or × icon) next to the date display that calls `setDob('')`.

---

### D5-QA-H3 — Optimistic server call (`createPatient`) has no timeout — hangs indefinitely on poor connectivity

**Impact:** UX degradation on 2G/EDGE (very common in rural Indian clinics) — doctor sees a spinner for 30–60+ seconds with no feedback

**Steps to reproduce:**
1. Enable poor network simulation (or test on 2G connection)
2. Open D5, fill in the form, tap "Save & Begin Visit"
3. The patient is saved locally immediately (Steps 1+2 complete)

**Expected:** Timeout after ~10 seconds — proceed with `serverPatientId = null`, navigate to D6. The patient will sync when the sync worker runs.

**Actual:** `createPatient()` at line 313 has no timeout. The call uses `apiFetch` with no race condition or abort controller. The spinner on the Save button remains active until the call resolves or the OS kills the network socket (often 60–120 seconds on Android). The patient data is safe (SQLite + queue), but the doctor cannot proceed to the visit for over a minute.

**Code location:** `NewPatientFormScreen.tsx:313` — `createPatient(...)` with no timeout

**Fix:** Wrap in `Promise.race([createPatient(...), timeoutAfter(10_000)])`. On timeout, log a debug message and fall through to the success path with `serverPatientId = null`.

---

### D5-QA-H4 — Sync queue 'create' entry not cleared after 409 resolution — sync worker will re-attempt and may dead-letter

**Impact:** Sync worker makes a redundant POST /patients on the 409 path; if server doesn't handle the second 409 gracefully, the queue entry may reach max_attempts (5) and die

**Steps to reproduce:**
1. Open D5 on Device A and Device B simultaneously with the same patient mobile number
2. Device A saves first — patient is created on the server
3. Device B saves — `insertLocalPatient` succeeds locally (patient not in Device B's SQLite yet), POST /patients returns 409
4. Device B's 409 handler: `upsertPatientFromServer` runs, `server_id` is written to the `patients` row — patient is correctly linked to the server entity
5. The sync_queue entry added at step 3 (before the online call) still has `status = 'pending'`
6. Sync worker runs and picks up the 'create' entry, POSTs /patients again

**Expected:** Sync worker skips the 'create' entry because `server_id` is already set on the patient row (indicating the patient is already on the server)

**Actual:** Unknown — depends on whether the sync worker checks `server_id` before making the API call. If the sync worker sends the 'create' operation, the server returns 409 again. If the sync worker does not handle 409 as success, it retries up to max_attempts (5), then sets `status = 'failed'`. The entry is eventually deleted by `clearDoctorSyncQueue` on logout. No data is lost, but the audit trail is polluted and the sync worker wastes retry attempts.

**Code location:** `NewPatientFormScreen.tsx:293-306` — `enqueueOperation` called before the online path; no dequeue step after the 409 resolution at line 327-348

**Fix:** After a successful 409 resolution (where `server_id` is obtained), mark the pending sync_queue entry for this patient as `status = 'success'` so the worker skips it. Or: teach the sync worker to treat 409 on a 'create' operation as a success (idempotent).

---

## MEDIUM BUGS

### D5-QA-M1 — No way to distinguish between "patient saved but server call timed out" and "patient not saved" from the doctor's perspective

When the server call times out or fails silently (all non-409 errors are swallowed at line 347), the doctor is navigated to D6 with `patientServerId: null`. There is no indicator that the patient will be synced later. A doctor who only uses the app during connectivity windows may wonder why the patient doesn't appear in other devices' recent patient lists.

**Recommended handling:** Show a non-blocking inline note on D6 (or on the new patient banner) when `patientServerId === null`: "Patient will sync when connected." The sync worker handles this automatically, but surface it to the doctor.

---

### D5-QA-M2 — Unicode control characters and zero-width spaces accepted in the name field

`maxLength={100}` enforced. However, Unicode directional control characters (U+202E right-to-left override, U+200B zero-width space, U+FEFF BOM) can be pasted into the name field. These are stored in SQLite and sent to the server. The name may render incorrectly on other devices or in web dashboards.

**Code location:** `NewPatientFormScreen.tsx:422-432` (TextInput, no sanitization on `onChangeText`)

**Recommended handling:** Strip non-printable Unicode chars at save time: `name.trim().replace(/[\u0000-\u001F\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')`.

---

### D5-QA-M3 — Prefill hint text is always shown even when the mobile matches a previously deleted patient

`<Text style={styles.fieldHint}>This number was not found — you are registering a new patient.</Text>` at line 413–415 is a static string — it's always shown, regardless of whether the patient was truly "not found" or was found but deleted. Minor UX inaccuracy.

---

### D5-QA-M4 — Error message when mobile is empty/malformed is confusing — doctor didn't enter the number

The guard at line 265–270 shows: "Invalid mobile number — cannot create patient." If `prefillMobile` arrives as `''` or malformed (e.g., from a test harness or future nav change), this message is technically correct but confusing to the doctor who didn't type the number. Should indicate a navigation error.

**Recommended handling:** "Navigation error: missing mobile number. Please go back and search again."

---

## UNHANDLED EDGE CASES

### D5-QA-E1 — App killed between Steps 1 (SQLite write) and 2 (enqueueOperation)
`insertLocalPatient` and `enqueueOperation` are NOT wrapped in a `db.withTransactionAsync()` call (unlike D6's `handleSave` which explicitly wraps them). If the app is killed after `insertLocalPatient` succeeds but before `enqueueOperation` runs, there is a patient row in SQLite with no sync queue entry. The patient will never be uploaded to the server unless the sync worker also scans for unsynced patients independently of the queue.

**Code location:** `NewPatientFormScreen.tsx:277-306` — three sequential awaits without a transaction wrapper

**Recommended handling:** Wrap `insertLocalPatient`, `logLocalPatientAccess`, and `enqueueOperation` in a single `db.withTransactionAsync()`. They succeed or fail atomically. This is the established pattern from D6 (see D6-MEDIUM-4 fix).

### D5-QA-E2 — 409 response received but `lookupPatient` also fails (network drops between the two calls)
If the server returns 409 and then connectivity is lost before `lookupPatient` completes, the catch at line 344 swallows the error and the doctor navigates to D6 with `patientServerId: null`. The local patient row has `server_id = null`. The sync worker will retry the 'create' operation, get another 409, and — if it doesn't handle 409 gracefully — dead-letter the entry.

**Recommended handling:** After 409 + lookup failure, the local patient row is safe. No action needed for v1 — sync worker handles on reconnect. Document this as accepted behavior.

### D5-QA-E3 — Doctor double-taps Save quickly (slower devices where `isSavingRef` state may not have propagated)
`isSavingRef.current` is a synchronous ref — the double-tap is blocked. Verified safe.

### D5-QA-E4 — Gender toggle: tapping selected gender deselects it (toggles to null)
`onSelect={active ? null : opt.key}` at `GenderToggle` line 167. This is intentional (optional field). But a doctor who accidentally taps their selection may not realize they've deselected gender. No confirmation step.

**Recommended handling:** Acceptable for v1 — document it. Long-tap to deselect would be more explicit but adds complexity.

### D5-QA-E5 — Patient name with 100 characters exactly at `maxLength` — truncation behavior
If the doctor pastes a name that exceeds 100 characters, `TextInput` silently truncates at 100. The doctor sees the name truncated in the field with no warning. The full name may be expected by the clinic system.

**Recommended handling:** Show a character counter (e.g., "42/100") when the name field is active and length > 80.

### D5-QA-E6 — iOS compact date picker renders inline — bottom of date picker may be hidden by keyboard if a text field is focused simultaneously
If the name `TextInput` has focus (keyboard showing) and the doctor taps the DOB field, the keyboard dismisses and the inline date picker appears. `KeyboardAvoidingView` with `behavior="padding"` should handle this, but on small-screen devices (iPhone SE 2nd gen), the bottom of the inline picker may overlap the Save button.

**Recommended handling:** Dismiss the keyboard when the DOB field is tapped: call `Keyboard.dismiss()` in the DOB `TouchableOpacity.onPress`.

---

## TEST PLAN

### Prerequisites for each device test session
1. Run `curl https://medrecord-api.onrender.com/v1/health` → confirm 200
2. Verify test credentials: mobile `9999999999`, OTP `000000`
3. Log in as Dr. Test Doctor via D1
4. Navigate to D2, search a mobile number that does NOT exist in the system (use a fresh number each session, e.g. `8888800001`)
5. Confirm D2 shows "Add New Patient" FAB / CTA

---

### Happy Path

**HP-1:** Open D5 (prefill mobile from D2) — mobile field is read-only (lock icon shown), name/DOB/gender fields are blank, Save button is enabled, offline banner is absent (online)

**HP-2:** Fill name ("Priya Venkataraman"), select DOB (e.g. 15/08/1985, age = 40 years shown), select Gender: F → tap "Save & Begin Visit"
- Expected: brief ActivityIndicator, navigates to D6 with patient name + mobile pre-populated, `consentGranted: false` (new patient has no consent)

**HP-3:** On D6, verify the patient name and (masked) mobile shown in the header match what was entered in D5

**HP-4:** Save D5 with name only (no DOB, no gender) — navigates to D6 successfully

**HP-5:** Save D5 with no optional fields at all (name blank, no DOB, no gender) — navigates to D6 successfully; patient listed with mobile only

**HP-6:** Verify patient appears in D2 recent patients list after navigating back (requires re-focus on D2 via `useFocusEffect`)

---

### Offline Scenarios

**OFF-1:** Enable airplane mode before opening D5 → orange offline banner appears → fill form → tap Save
- Expected: ActivityIndicator appears briefly (no server call made), navigates to D6, patient is in SQLite, sync queue has a 'create' entry for this patient

**OFF-2:** SQLite verification after OFF-1: using SQLite browser or console, confirm `patients` row exists with `server_id = NULL`, `synced_at = NULL`, and `sync_queue` has a 'pending' entry

**OFF-3:** Re-enable connectivity while in D6 → sync worker should pick up and POST the patient to the server within 5 minutes
- Expected: `patients.server_id` is updated; sync_queue entry marked 'success'

**OFF-4:** Start D5 offline, fill form, kill app before tapping Save (force-quit)
- Expected: no partial data in SQLite — patient not created (never reached `insertLocalPatient`)

**OFF-5:** Start D5 online, tap Save, kill app immediately after the ActivityIndicator appears (between SQLite write and navigation)
- Expected: patient row in SQLite (created), sync_queue entry present (may or may not be — see E1 above). On relaunch, patient should appear in D2 recent patients.
- Known gap: if app is killed between `insertLocalPatient` and `enqueueOperation` (E1), patient exists locally but sync queue has no entry — patient never uploaded. **Flag as FAIL if reproduced.**

---

### Error Scenarios

**ERR-1:** Server returns 500 on POST /patients (simulate by temporarily setting wrong API URL or asking backend to inject a 500)
- Expected: patient saved locally, navigates to D6 with `patientServerId: null`. No error shown to doctor (correct per spec — sync handles it). Sync worker retries later.

**ERR-2:** Server returns 409 on POST /patients (simulate by creating the patient on the server first via API call, then registering them in D5)
- Expected: 409 handler fires → `lookupPatient` called → patient's server_id written to local row → `serverPatientId` set → navigate to D6 with correct server_id

**ERR-3:** Network drops to zero immediately after SQLite write (mid-server-call)
- Expected: `createPatient` throws a network error → caught at line 326 → falls through to navigate with `serverPatientId: null` — no crash, no error shown to doctor

**ERR-4:** Route params arrive with no `prefillMobile` (e.g. called without params)
- Expected: `mobile = ''` → H-1 guard fires: "Invalid mobile number — cannot create patient." error shown, save blocked

**ERR-5:** `insertLocalPatient` throws (SQLite disk full or corruption)
- Expected: outer catch at line 364 fires → "Could not save patient. Please try again." shown; `isSavingRef` and `isSaving` are reset; button is enabled again

---

### Edge Cases (Input Validation)

**EC-1:** Name field — 100 characters exactly: `'A'.repeat(100)` — accepted (maxLength enforced)

**EC-2:** Name field — 101 characters (paste): truncated silently to 100. Verify no crash.

**EC-3:** Name field — SQL injection string: `"'; DROP TABLE patients; --"` — stored as plain text (parameterized query). Verify patient saved safely.

**EC-4:** Name field — emojis: `"🩺 Dr. 🌟"` — stored and displayed correctly. No crash.

**EC-5:** Name field — only spaces: `"     "` — `trimmedName = null`; patient saved with `name = null`. Verify name does not display as "     " in D2/D3.

**EC-6:** DOB — select today's date: should be allowed (newborns). Age displayed as "0 years". Verify no crash.

**EC-7:** DOB — future date: `maximumDate={new Date()}` set on picker. Verify future date cannot be selected. (Cannot be injected via normal UI.)

**EC-8:** DOB — date 150 years ago: `minimumDate={minDob()}`. Boundary test — select the minimum date. Verify `calcAge` returns a value < 150 (not null).

**EC-9:** Gender toggle — tap M to select, tap M again to deselect → gender returns to null. Verify save succeeds with null gender.

**EC-10:** Double-tap Save (fast): only one save operation executes (`isSavingRef` blocks the second). Verify exactly one patient row in SQLite.

**EC-11:** Press back with name filled → discard dialog shown → "Keep editing" cancels, "Discard" goes back to D2

**EC-12:** Press back with no fields filled → no discard dialog (hasUnsavedChanges = false)

**EC-13:** Press back with only DOB selected → discard dialog shown (dob != '')

**EC-14:** Press back with only gender selected → discard dialog shown (gender != null)

**EC-15:** iOS date picker — open, do NOT scroll, tap Done → DOB remains blank (no date selected)

**EC-16:** Android date picker — open, press system back button → picker dismisses, DOB unchanged

---

### Low-End Device Tests

**LD-1:** Open D5 on a 2GB RAM device with <500MB free storage — form renders within 2 seconds

**LD-2:** Type a 100-character name on a slow (Cortex-A53) device — TextInput does not lag or stutter

**LD-3:** SQLite write completes within 500ms on a device with no free WAL space (cold start)

---

## OPEN DEBT (pre-merge)

These items from the security audit are known to be open and should be verified as not-yet-fixed:

| Item | Status |
|---|---|
| D5-M-1: `UNIQUE(mobile_number)` not doctor-scoped | OPEN — fix before v1 launch |
| D5-M-2: `getPatientByLocalId` not doctor-scoped | OPEN — fix before v1 launch |

Both MEDIUM items do not block device testing for the normal single-doctor single-device flow but must be fixed before shared-device deployments (common in Indian clinics).

---

## VERDICT

**Needs fixes first (C1, C2, E1) before device testing.**

- **C1 and C2** are dormant in the single-doctor, fresh-device, clean-SQLite scenario — they will not trigger in a standard device test session. However, they represent silent data corruption paths that are guaranteed to surface in production (shared devices, repeated D5 visits with the same mobile). Must be fixed before merge.
- **E1** (missing transaction wrapper) is an app-kill window that can corrupt the sync queue. Low probability but real. Must be fixed before merge.
- **H1** (stuck spinner after back-nav), **H2** (no DOB clear), **H3** (no server call timeout) are device-testable UX issues. Fix before device testing for full signal.
- **H4** (sync queue 'create' after 409) needs sync worker coordination — verify in test ERR-2 whether the sync worker handles 409 gracefully.

**ESTIMATED FIX EFFORT:** 3–4 hours (C1+C2+E1 together, H1 is one line, H2 is a Clear button, H3 is a Promise.race wrapper)

After fixes are applied, proceed to Builder Step 9 for fix implementation, then return to this test plan for device testing.
