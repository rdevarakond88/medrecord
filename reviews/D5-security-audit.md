# Security Audit — D5: New Patient Form

**Auditor:** Security Agent
**Date:** 2026-04-11
**Files reviewed:**
- `src/screens/doctor/NewPatientFormScreen.tsx`
- `src/api/patients.ts`
- `src/db/patients.ts`
- `src/sync/syncQueue.ts`
- `src/api/apiClient.ts`
- `src/db/schema.ts` (patients, sync_queue tables)

---

## CRITICAL (must fix before merge)

None.

---

## HIGH (fix before v1 launch)

### H-1 — Mobile number not validated before save
**File:** `NewPatientFormScreen.tsx:189` (mobile from route.params), `handleSave:251`
**Risk:** `mobile` is set to `route.params?.prefillMobile ?? ''`. If it arrives as an
empty string or malformed number — possible through future nav path changes, deep links,
or test harnesses — an invalid mobile is written to SQLite, enqueued in the sync queue,
and POSTed to `/patients`. If the backend validates strictly the call fails; if not,
corrupt data persists.
**Fix:** Add a guard at the top of `handleSave`, before `insertLocalPatient`:
```ts
if (!/^[6-9]\d{9}$/.test(mobile)) {
  setSaveError('Invalid mobile number — cannot create patient.');
  isSavingRef.current = false;
  setIsSaving(false);
  return;
}
```

### H-2 — Patient name has no maxLength enforced
**File:** `NewPatientFormScreen.tsx:406`
**Risk:** No character limit on the name TextInput. Arbitrarily long strings are stored in
SQLite and sent to the API. The API may reject with an unhandled error; SQLite stores
without limit.
**Fix:** Add `maxLength={100}` to the name `TextInput`.

### H-3 — No audit event logged for patient creation (DPDP §8 gap)
**File:** `NewPatientFormScreen.tsx:267–276` (`insertLocalPatient` call)
**Risk:** Creating a new patient record is a sensitive PII operation under DPDP Act 2023 §8.
No row is written to `audit_events` for this action. The audit trail will show patient
searches and views but not creation — leaving a gap that patients can identify if they
request access logs.
**Fix:** Add an audit event call immediately after `insertLocalPatient` succeeds and before
`enqueueOperation`. Use an existing or new event type (`patient_created`). Do NOT include
the patient's name or mobile in the metadata — log only `doctor_id`, `entity_local_id`,
and timestamp:
```ts
await logLocalPatientAccess(db, user.id, 'patient_created', {
  entity_local_id: localId,
});
```
Note: `logLocalPatientAccess` must be extended to accept `'patient_created'` as an event type, or a new `logPatientCreated` helper added.

### H-4 — `upsertPatientFromServer` overwrites `doctor_id` on 409 conflict
**File:** `db/patients.ts:105`
**Risk:** On a shared clinic device, when Doctor B triggers a 409 conflict and calls
`upsertPatientFromServer`, the `ON CONFLICT DO UPDATE SET doctor_id = excluded.doctor_id`
overwrites the existing row's `doctor_id` with Doctor B's ID. If Doctor A originally owned
this patient, Doctor A's subsequent searches (`WHERE doctor_id = ?`) will no longer find them.
**Fix:** Do not overwrite `doctor_id` on conflict. Change line 105:
```sql
-- Before
doctor_id = excluded.doctor_id,

-- After
doctor_id = COALESCE(doctor_id, excluded.doctor_id),
```
This preserves the original owner. All other fields still merge correctly.

---

## MEDIUM (fix in next sprint)

### M-1 — UNIQUE(mobile_number) not doctor-scoped; silent INSERT OR IGNORE leaves phantom localId
**File:** `db/schema.ts:29` (UNIQUE constraint), `db/patients.ts:199`
**Risk:** The patients table has `mobile_number TEXT NOT NULL UNIQUE` — a single device-global
uniqueness constraint. On a shared device, if Doctor A registers patient with mobile X and
then logs out, Doctor B cannot see this patient (query is `doctor_id`-scoped). If Doctor B
searches on D2 and gets no result, then opens D5 to create the same patient, the
`INSERT OR IGNORE` silently does nothing. The `localId` generated in `handleSave` is never
written to `patients`. D6 receives this phantom `patientId`; `setPatientServerId` updates 0
rows; the sync queue entry's `entity_local_id` points to a non-existent row.
**Preferred fix:** Change the UNIQUE constraint from `mobile_number` to
`(doctor_id, mobile_number)` — requires a schema migration. After `insertLocalPatient`,
verify the row was actually written (check affected rows or query by `local_id`). If 0 rows
affected, look up the existing row by mobile and reuse its `local_id` for subsequent steps.

### M-2 — `getPatientByLocalId` not doctor-scoped
**File:** `db/patients.ts:141–144`
**Risk:** `SELECT * FROM patients WHERE local_id = ?` has no `doctor_id` filter. On a shared
device, any doctor who obtains another doctor's patient UUID (through navigation params, logs,
or a future bug) could read the full patient row including name, DOB, and mobile number.
UUIDs are practically unguessable in normal operation, but this violates least-privilege.
**Fix:** Add `AND doctor_id = ?` to the query. Update all callers (D3, D6) to pass
`user.id` as the second argument.

---

## LOW (track in backlog)

### L-1 — 409 conflict lookupPatient response not audited
**File:** `NewPatientFormScreen.tsx:315`
**Risk:** When a 409 occurs, `lookupPatient` returns a full `ApiPatient` record (name,
mobile, DOB, gender, consent). This cross-patient data access is not logged anywhere.
Minor DPDP audit trail gap.
**Fix:** Log a `patient_accessed` audit event after the lookup succeeds, passing only
`entity_id: existing.id` in metadata — no PII.

---

## Checklist Status

| Category | Result | Notes |
|---|---|---|
| Authentication & Sessions | ✅ | JWT enforced via `apiFetch`; cert pinning via `pinnedFetch`; auth guard in render and inside `handleSave`. |
| Authorisation | ✅ | Token required for all API calls; `doctor_id` scopes all SQLite writes; `doctor_id` intentionally excluded from POST /patients body (server derives from JWT — correct). |
| Data Handling | ⚠️ | No Aadhaar field (correct — omitted by design). **H-3:** No audit event for creation. No PII in console.log ✅. S3 not touched ✅. |
| Mobile Security | ✅ | No `console.log` with PII ✅. Auth token from auth store (backed by SecureStore) ✅. Tap guard (synchronous ref) ✅. Back nav guard ✅. |
| Input Validation | ⚠️ | **H-1:** Mobile not validated. **H-2:** Name has no maxLength. DOB bounded by DateTimePicker maximumDate ✅. |
| Database | ⚠️ | Parameterised queries throughout ✅. **H-3:** Audit event missing for creation. `clearDoctorPatients` on logout ✅. |
| DPDP Compliance | ⚠️ | No Aadhaar in form ✅. **H-3:** Audit trail gap for patient creation. Consent correctly set to `false` for new patients (D9 will wire) ✅. |

---

## Overall Verdict

**BLOCKED — 4 HIGH findings.**

H-1 (mobile validation) and H-2 (maxLength) are one-liner fixes.
H-3 (audit event) and H-4 (`doctor_id` overwrite) each require ~5–10 lines.
All four must be resolved before QA.

M-1 (phantom localId on shared device) is the highest-priority medium item — it will
surface in device testing on any scenario where a patient was previously created by a
different doctor on the same device.
