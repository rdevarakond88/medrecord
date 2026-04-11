# Security Audit — D2: Patient Search Screen

**Files reviewed:**
- `src/screens/doctor/PatientSearchScreen.tsx`
- `src/api/patients.ts`
- `src/api/apiClient.ts`
- `src/db/patients.ts`
- `src/db/schema.ts`
- `src/store/useAuthStore.ts`
- `src/sync/syncQueue.ts`
- `src/utils/formatters.ts`

**Auditor:** agent-security
**Date:** 2026-02-19
**Spec references:** `docs/security-spec.md`, `docs/consent-layer-spec.md`

---

## CRITICAL (must fix before merge)

**C-1 — `clearAuth()` does not clear the SQLite patient cache**

```
File: src/store/useAuthStore.ts:41
      src/db/patients.ts (getRecentPatients, searchPatientsByMobile)
```

Risk: `clearAuth()` sets `{ token: null, user: null }` in Zustand, but `medrecord.db` on disk is untouched. Two attack vectors:

1. **Device theft** — The SQLite cache (patient names, mobile numbers, DOB, last-visit dates) is readable without any credential after the JWT is cleared. Platform FBE/iOS Data Protection mitigates this only if the device is locked at the OS level. The app-level wipe on logout that the spec requires is absent.
2. **Shared clinic device (primary use case)** — Doctor A logs out; Doctor B logs in. `getRecentPatients()` fires on mount with no doctor filter, returning Doctor A's recently searched patients in full. This is an explicit cross-doctor data-leakage scenario matching Threat 2 in the threat model.

Fix: Add a `clearPatientCache()` function that runs `DELETE FROM patients`, `DELETE FROM sync_queue`, and `DELETE FROM id_mapping` inside a transaction. Call it from `clearAuth()`, or from the logout handler before calling `clearAuth()`. Also call `queryClient.clear()` (see H-4) in the same sequence.

```typescript
// useAuthStore.ts
clearAuth: async (db: SQLiteDatabase, queryClient: QueryClient) => {
  await db.execAsync(
    'DELETE FROM patients; DELETE FROM sync_queue; DELETE FROM id_mapping;'
  );
  queryClient.clear();
  set({ token: null, user: null });
},
```

---

## HIGH (fix before v1 launch)

**H-1 — `consent_granted` field from API response is silently discarded**

```
File: src/api/patients.ts:13 (ApiPatient interface has consent_granted)
      src/screens/doctor/PatientSearchScreen.tsx:121-136
      src/db/patients.ts (LocalPatient missing consent_granted)
```

Risk: `ApiPatient.consent_granted` is returned by `GET /patients/lookup` but is never written to `LocalPatient`, never cached in SQLite, and never passed to `navigation.navigate('PatientDetail', ...)`. This directly breaks Consent Flow 2 (consent-layer-spec.md §"Flow 2: Returning Patient, New Doctor"):

> "App checks consent → 'No active consent' → Doctor B sees: [Patient Name]'s records exist but require their permission."

Without this field, the D3 screen has no signal that a consent-request gate is required. Given D3 is not yet built, there is a realistic risk it gets implemented without a consent check UI, since the upstream signal is missing. The server's RLS policy will still block record access, but the UI consent flow will never be triggered — the user will see a confusing 403 error instead of the intended "Request Access" experience.

Fix:
1. Add `consent_granted: boolean` to `LocalPatient` and to the `patients` SQLite table.
2. Pass it in `upsertPatientFromServer`.
3. Pass it in navigation params:

```typescript
navigation.navigate('PatientDetail', {
  patientLocalId:  patient.local_id,
  patientServerId: patient.server_id,
  consentGranted:  serverPatient.consent_granted,
});
```

---

**H-2 — Certificate pinning absent from API client**

```
File: src/api/apiClient.ts:30
```

Risk: `apiFetch` uses the bare React Native `fetch()` with no certificate pinning. The threat model explicitly calls out "Man-in-the-middle — intercept data on shared/public WiFi (common in clinics)." At this screen, the intercepted payload includes patient mobile numbers and basic profiles from `GET /patients/lookup` responses. Security spec mandates: "Certificate pinning on mobile app (prevents MITM even on compromised networks)."

Fix: Implement native-level certificate pinning. For Expo-managed workflow, use `expo-build-properties` with a custom OkHttp interceptor (Android) and NSURLSession delegate (iOS), or integrate `react-native-ssl-pinning` and route `apiClient.ts` through it. Pin the SHA-256 SPKI fingerprint of `api.medrecord.in`'s leaf certificate and one intermediate, with a backup pin for rotation.

---

**H-3 — Offline patient access (local SQLite reads) generates no audit log entries**

```
File: src/db/patients.ts:33 (getRecentPatients), :48 (searchPatientsByMobile)
```

Risk: The security spec requires "Patient record accessed" to be logged for every sensitive operation. When the doctor is offline, `getRecentPatients` and `searchPatientsByMobile` return patient PII (name, mobile, DOB, last-visit date) with zero audit trail. The entire offline-access window is forensically invisible. In a data-breach investigation, unauthorized offline access would be undetectable.

Fix: Create an `audit_events` local table in the SQLite schema. Write a `logLocalAccess(db, { event, patientIds, doctorId })` helper. Call it from `getRecentPatients` and `searchPatientsByMobile` after each read. Flush these events to the server's audit log via `POST /sync` when back online (add `audit_event` as a `SyncEntityType`).

---

**H-4 — React Query patient-lookup cache persists across logout (session bleed)**

```
File: src/screens/doctor/PatientSearchScreen.tsx:110-116
      src/store/useAuthStore.ts:41
```

Risk: `staleTime: 30_000` means a successful `['patient-lookup', query]` cache entry lives for 30 seconds in the in-memory QueryClient. `clearAuth()` never calls `queryClient.clear()`. On a shared clinic device where Doctor A logs out and Doctor B logs in within 30 seconds and types the same number, Doctor B receives Doctor A's cached lookup result without a server round-trip, including `consent_granted` status from Doctor A's session. This crosses a session boundary with patient data.

Fix: Call `queryClient.clear()` inside `clearAuth()` (see C-1 fix).

---

## MEDIUM (fix in next sprint)

**M-1 — Auth errors from `lookupPatient` are silently swallowed by `useQuery`**

```
File: src/screens/doctor/PatientSearchScreen.tsx:110-116
      src/api/patients.ts:36-42
```

Risk: `useQuery` has no `onError` handler. If the JWT expires mid-session, `lookupPatient` throws an `ApiError` (401 UNAUTHORIZED). React Query catches it internally, `serverPatient` stays `undefined`, and `showNoMatch` becomes `true` — the doctor sees "No patient found" for a patient who exists. The doctor may then tap "+ Create New Patient," creating a duplicate record. The 401 is not surfaced to the user and no re-authentication is triggered.

Fix:

```typescript
const { data: serverPatient, isLoading: serverLoading, error } = useQuery({ ... });

useEffect(() => {
  if (error instanceof ApiError && error.status === 401) {
    clearAuth();
    navigation.replace('Login');
  }
}, [error]);
```

---

**M-2 — Indian mobile format not validated on first digit**

```
File: src/screens/doctor/PatientSearchScreen.tsx:148-157
```

Risk: The keypad allows any digit as the first character. Numbers starting with 0–5 are not valid Indian mobile numbers. Spec rule: "Mobile number validated (10 digits, starts with 6–9)." While the server should reject such lookups, missing client-side validation wastes rate-limited API quota and risks invalid data entering the SQLite cache if server validation is lax.

Fix: In `handleKeyPress`, reject digits 0–5 when `query.length === 0`:

```typescript
if (key === '⌫') {
  setQuery((q) => q.slice(0, -1));
} else if (query.length === 0 && !['6', '7', '8', '9'].includes(key)) {
  // show brief shake animation / hint — not a valid Indian mobile first digit
} else if (query.length < 10) {
  setQuery((q) => q + key);
}
```

---

**M-3 — `getRecentPatients` not scoped to current doctor**

```
File: src/db/patients.ts:33-41
      src/db/schema.ts (patients table has no doctor_id column)
```

Risk: On a shared clinic device, "Recent Patients" lists all locally cached patients, regardless of which doctor added them. Doctor B sees Doctor A's recently accessed patients by simply opening the app. This exposes patient names, mobile numbers, and last-visit dates across doctor sessions. Relevant to Threat 2: "Disgruntled clinic staff exports all patient data."

Fix: Add a `recently_accessed` junction table keyed by `(doctor_id, patient_local_id, accessed_at)`. Populate it when a patient is opened (D3). Filter `getRecentPatients` by `current_doctor_id`. The existing `patients` table structure need not change.

---

## LOW (track in backlog)

**L-1 — Full patient name + mobile in accessibility label**

```
File: src/screens/doctor/PatientSearchScreen.tsx:519-522
```

Risk: `accessibilityLabel` includes the unmasked full mobile number alongside the patient name. On Android, any app granted `BIND_ACCESSIBILITY_SERVICE` can read all accessibility text. The screen already masks mobile numbers in the "Recent Patients" list (`maskMobile` prop) but this protection does not extend to the accessibility label.

Fix: Use `formatMobile(patient.mobile_number, true)` (masked form) in the accessibility label, or omit the mobile number and include only name + last-visit date.

---

**L-2 — `staleTime: 30_000` can show stale consent status**

```
File: src/screens/doctor/PatientSearchScreen.tsx:114
```

Risk: If a patient revokes consent within 30 seconds of a lookup, the cached `consent_granted: true` result (once H-1 is fixed) would still be shown in the D3 navigation params. Server-side record access is still blocked, but the UI would incorrectly skip the consent-request gate for a brief window.

Fix: Lower `staleTime` to `5_000` (5 seconds) or `0`. Given the lookup fires only on exactly 10 digits, the performance cost is negligible.

---

**L-3 — D2 renders local patient data with no local auth guard**

```
File: src/screens/doctor/PatientSearchScreen.tsx:93-95
```

Risk: `getRecentPatients(db).then(setRecentPatients)` fires on mount without checking `!!token`. If a navigation bug routes an unauthenticated session to D2 (e.g., during refresh-token failure), cached patient data is displayed to an unauthenticated user.

Fix: Add `if (!token) return;` inside the mount effect, or enforce the auth guard at the navigator level (preferred).

---

## CHECKLIST STATUS

| Category | Result | Notes |
|---|---|---|
| Authentication & Sessions | ✅ 1/1 | JWT passed as Bearer; refresh token storage delegated to D1 per spec |
| Authorisation | ⚠️ 4/5 | FAILED: `consent_granted` discarded (H-1); server-side RLS intact |
| Data Handling | ✅ 6/6 | No Aadhaar in scope; no `console.log` of PII found; S3 not in D2 scope |
| Mobile Security | ❌ 2/5 | FAILED: certificate pinning absent (H-2); SQLite cache not cleared on logout (C-1); React Query cache not cleared on logout (H-4) |
| Input Validation | ❌ 1/2 | FAILED: first-digit (6–9) validation missing (M-2); 10-digit max ✅ |
| Database | ❌ 2/3 | FAILED: audit log for offline reads absent (H-3); parameterised queries ✅; RLS on server ✅ |
| DPDP Compliance | ⚠️ 0/1 | FAILED: `consent_granted` discarded breaks consent-before-access requirement (H-1) |

---

## OVERALL VERDICT

**BLOCKED — 1 critical issue, 4 high issues**

The screen must not merge until **C-1** (`clearAuth()` does not clear SQLite cache) is resolved. This is a direct cross-doctor data leakage vector on shared clinic devices — the primary hardware scenario for the target market.

**H-1** (`consent_granted` discarded) must also be fixed before merge: D3 is about to be built against this broken signal, and without it the entire consent-request UI flow for returning patients is broken at the source.

**H-2** (certificate pinning), **H-3** (offline audit logging), and **H-4** (React Query session bleed) are pre-v1-launch blockers per spec.

The SQLite database queries are clean throughout — fully parameterised, no SQL injection surface found. No Aadhaar handling or `console.log` PII leakage detected anywhere in D2 code.
