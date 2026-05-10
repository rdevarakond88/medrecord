# SECURITY AUDIT — D4 Visit Detail (VisitDetailScreen.tsx)

**Auditor:** Security Agent
**Date:** 2026-04-19
**Files reviewed:**
- `src/screens/doctor/VisitDetailScreen.tsx`
- `src/api/records.ts`
- `src/db/records.ts`
- `src/db/schema.ts` (visit_records table)
- `src/db/visits.ts` (logVisitViewed, updateVisitStatus)
- `src/hooks/useLogout.ts` (clearDoctorRecords confirmed)

---

## CRITICAL (must fix before merge)

### D4-SA-C1: `insertLocalNote` + `enqueueOperation` not wrapped in `db.withTransactionAsync()`
**File:** `src/screens/doctor/VisitDetailScreen.tsx` — `handleSaveNote`, lines 159–176
**Risk:** If the app is killed between the two sequential `await` calls — `insertLocalNote` (writes to `visit_records`) and `enqueueOperation` (writes to `sync_queue`) — the note exists in SQLite but has no sync queue entry. The sync worker never picks it up. Note is silently lost from the server; doctor believes it was saved. This is an integrity gap, not just a UX issue — clinical notes can be permanently absent from the patient's server-side record.
**Fix:** Wrap both calls (and optionally `logVisitViewed`) in `db.withTransactionAsync()`. This is the exact pattern fixed in D6 for MEDIUM-4:
```typescript
await db.withTransactionAsync(async () => {
  await insertLocalNote(db, visitServerId, user.id, text, localId, user.name);
  await enqueueOperation(db, { ... });
});
// Online POST attempt outside transaction (network calls can't be in a tx)
if (isOnline) { ... }
```

---

## HIGH (fix before v1 launch)

### D4-SA-H1: Consent gate derived from stale nav params — never re-verified server-side in D4
**File:** `src/screens/doctor/VisitDetailScreen.tsx` — lines 91–92, 275
**Risk:** `showClinicalContent = isOwnVisit || consentGranted` is computed entirely from nav params passed by D3 at navigation time. D4 never re-fetches consent from the server or SQLite. If patient revokes consent while the doctor is on D4 (or navigates back to D4 without D3 re-running its `useFocusEffect`), D4 continues rendering clinical content — chief complaint, note text, OCR text — based on a stale `consentGranted=true`. When `getVisitRecords()` is called on mount, a server-side 403 (if consent was revoked and the server enforces it) falls silently into the generic catch block, drops to SQLite cache, and `showClinicalContent` stays true. The doctor sees clinical content they no longer have authorisation to view.
**Fix:** Re-verify consent from SQLite (via `getPatientByLocalId(db, patientLocalId)`) before rendering, exactly as D3-H-1/D3-H-2 were fixed:
```typescript
// After fetching/caching records, re-read consent from SQLite
const freshPatient = await getPatientByLocalId(db, user.id, patientLocalId);
const freshConsent = freshPatient?.consent_granted ?? false;
setConsentGranted(freshConsent);
```
Add `consentGranted` to component state (not read-only from route.params). Use this for `showClinicalContent` instead of `route.params.consentGranted`. Pass `patientLocalId` in nav params from D3 (it already passes `patientServerId`).

### D4-SA-H2: 401 session expiry silently swallowed — no redirect to login
**Files:**
- `src/screens/doctor/VisitDetailScreen.tsx` — `loadRecords` line 131 (bare `catch {}`)
- `src/screens/doctor/VisitDetailScreen.tsx` — `handleFinishVisit` line 248–251
**Risk:** Both error handlers catch all exceptions including `ApiError` with `status === 401`. D2 and D3 both detect 401 and redirect to login with an "Your session has expired" message. D4 silently falls to cache (on load) or shows "Please check your connection" (on finish). Doctor does not know their session is expired; all data shown may be stale; `handleFinishVisit` silently fails without surfacing the auth failure.
**Fix:** In `loadRecords` catch block, check `if (err instanceof ApiError && err.status === 401)` → set session-expired state + `navigation.replace('Login')`. In `handleFinishVisit` catch, same check — distinct message: "Your session has expired. Please log in again." D2 pattern (`PatientSearchScreen.tsx` effect on `isError`) is the reference implementation.

---

## MEDIUM (fix before production)

### D4-SA-M1: Note `TextInput` has no `maxLength`
**File:** `src/screens/doctor/VisitDetailScreen.tsx` — `InlineNoteInput` (line 698) and `NoteRecordRow` inline edit (line 610)
**Risk:** Doctor can enter arbitrarily long note text. This is stored in SQLite and POSTed via `createNote()` to the server. No server-side size limit is documented as enforced in v1. Risk of SQLite bloat on low-memory devices and server payload abuse.
**Fix:** Add `maxLength={5000}` to both `TextInput` elements (inline note input and inline edit input). This is consistent with D5's `maxLength={100}` pattern for names.

### D4-SA-M2: `logVisitViewed` fires on every mount — audit log inflation
**File:** `src/screens/doctor/VisitDetailScreen.tsx` — `loadRecords` line 142
**Risk:** Each time D4 mounts (doctor navigates away and back, app foregrounds), a new `visit_viewed` event is written to `audit_events`. This is the same over-fire pattern as D3-M-2 (`logConsentAccess`). Audit log inflation, not a data exposure issue, but misleads compliance reviews about actual access frequency.
**Fix:** Add a `viewLoggedRef = useRef(false)` to fire once per D4 mount lifetime. Reset on unmount only (not on every `loadRecords` call):
```typescript
const viewLoggedRef = useRef(false);
// Inside loadRecords, after records load:
if (!viewLoggedRef.current) {
  viewLoggedRef.current = true;
  logVisitViewed(db, user.id, patientServerId, visitServerId).catch(() => {});
}
```

### D4-SA-M3: Patient full name displayed without PII dimming or overflow guard
**File:** `src/screens/doctor/VisitDetailScreen.tsx` — line 318
**Risk:** `patientName` from nav params is rendered at 17pt bold with no `numberOfLines` guard and no PII dimming. In shared clinic spaces, the full name is visible to bystanders from several metres. Same class of concern as D3 MEDIUM debt (patient name at 22pt, tracked in project-state.md).
**Fix:** Add `numberOfLines={1}` + `ellipsizeMode="tail"` to the `patientName` Text element. Track name-dimming for v1 launch (same resolution path as D3 MEDIUM debt).

---

## LOW (track in backlog)

### D4-SA-L1: `updateLocalNoteText` and `deleteLocalRecord` have no `doctor_id` scope
**Files:** `src/db/records.ts` — `updateLocalNoteText` line 156, `deleteLocalRecord` line 183
**Risk:** Both queries use `WHERE id = ?` with no `doctor_id` filter, deviating from the doctor-scoped pattern used by every other query in the records module. Theoretical cross-doctor write on a shared device if UUIDs collide (practically impossible with v4 UUIDs). Risk increases if a future caller passes an incorrect `id`.
**Fix:** Add `AND doctor_id = ?` to both WHERE clauses and thread `doctorId` from callers (`handleEditNote` and `handleDeleteNote`). Consistent with `getCachedRecords`, `insertLocalNote`, `clearDoctorRecords` patterns.

---

## Checklist Status

| Category | Status | Notes |
|---|---|---|
| Authentication & Sessions | ⚠️ 5/6 | 401 handling absent in D4 (H2) |
| Authorisation | ⚠️ 5/6 | Consent gate relies on stale nav param (H1) |
| Data Handling | ✅ 6/6 | No Aadhaar, no PII in logs, no S3 public URLs (S3 deferred v2) |
| Mobile Security | ✅ 5/5 | No console.log in screen, auth guard correct, clearDoctorRecords at logout confirmed |
| Input Validation | ⚠️ 4/5 | Note TextInput missing maxLength (M1) |
| Database | ⚠️ 5/6 | Missing transaction wrapper (C1); `updateLocalNoteText`/`deleteLocalRecord` unscoped (L1) |
| DPDP Compliance | ⚠️ 5/6 | `logVisitViewed` over-fires (M2); consent re-verify gap (H1) |

---

## Overall Verdict

**BLOCKED — 1 CRITICAL finding (D4-SA-C1), 2 HIGH findings (D4-SA-H1, D4-SA-H2)**

Do not merge to main until:
1. `handleSaveNote` wrapped in `db.withTransactionAsync()` (C1)
2. Consent re-verified from SQLite before rendering clinical content (H1)
3. 401 handling added to `loadRecords` and `handleFinishVisit` (H2)

MEDIUM and LOW items tracked in project-state.md; fix before v1 launch.
