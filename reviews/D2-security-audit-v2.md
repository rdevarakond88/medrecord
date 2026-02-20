# Security Audit — D2: Patient Search Screen (v2)

**Files reviewed:**
- `src/screens/doctor/PatientSearchScreen.tsx`
- `src/api/patients.ts`
- `src/api/apiClient.ts`
- `src/db/patients.ts`
- `src/db/schema.ts`
- `src/store/useAuthStore.ts`
- `src/hooks/useLogout.ts` *(new)*
- `src/sync/syncQueue.ts`
- `src/utils/formatters.ts`

**Auditor:** agent-security
**Date:** 2026-02-20
**Spec references:** `docs/security-spec.md`, `docs/consent-layer-spec.md`
**Based on:** D2-security-audit.md (v1, 2026-02-19) + commit `[D2] Fix critical consent and auth bugs C-1 C-2 C-3`

---

## CRITICAL (must fix before merge)

*No open critical issues.*

---

### CLOSED — C-1: Doctor-scoped patient table + SQLite clear on logout

**Original finding:** `clearAuth()` sets `{ token: null, user: null }` in Zustand but leaves `medrecord.db` untouched, enabling cross-doctor data leakage on shared clinic devices.

**Status: CLOSED**

**Fix applied:**

1. `src/db/schema.ts` — Added `doctor_id TEXT NOT NULL DEFAULT ''` and `consent_granted INTEGER NOT NULL DEFAULT 0` to the `patients` CREATE TABLE statement. Added `CREATE INDEX IF NOT EXISTS idx_patient_doctor ON patients (doctor_id)`. Added two `ALTER TABLE` migration blocks (each wrapped in `try/catch`) so existing dev databases gain the new columns without crashing.

2. `src/db/patients.ts` — `getRecentPatients(db, doctorId)` now filters `WHERE doctor_id = ?`. `searchPatientsByMobile(db, partialMobile, doctorId)` now filters `AND doctor_id = ?`. `upsertPatientFromServer` accepts and writes `doctor_id` on every insert/update. New export `clearDoctorPatients(db, doctorId)` runs `DELETE FROM patients WHERE doctor_id = ?`.

3. `src/hooks/useLogout.ts` *(new)* — Single authoritative logout path. Enforces order: (1) read `user.id` before state change, (2) `await clearDoctorPatients(db, doctorId)`, (3) `queryClient.clear()`, (4) `clearAuth()`. Any component that needs a logout button imports this hook.

4. `src/screens/doctor/PatientSearchScreen.tsx` — `getRecentPatients(db, user!.id)` and `searchPatientsByMobile(db, query, user!.id)` now pass the current doctor's ID at both call sites.

---

### CLOSED — C-2: `consent_granted` stored and forwarded to D3

**Original finding (H-1 in v1 audit, reclassified Critical):** `ApiPatient.consent_granted` was returned by `GET /patients/lookup` but never written to `LocalPatient`, never cached in SQLite, and never passed in `navigation.navigate('PatientDetail', ...)`. This broke Consent Flow 2 at the source and created a realistic risk that D3 would be built without a consent-request gate.

**Status: CLOSED**

**Fix applied:**

1. `src/db/patients.ts` — `LocalPatient` now includes `consent_granted: boolean`. `upsertPatientFromServer` accepts `consent_granted`, stores it as `INTEGER` (0/1), and updates it on conflict. `getRecentPatients` and `searchPatientsByMobile` return it in every row.

2. `src/screens/doctor/PatientSearchScreen.tsx` — `upsertPatientFromServer` call now includes `consent_granted: serverPatient.consent_granted`. `navigation.navigate('PatientDetail', ...)` now passes `consentGranted: patient.consent_granted`, establishing the D3 data contract. When D3 is built, it reads `consentGranted` from route params and shows the consent-request flow if `false`.

---

### CLOSED — C-3: React Query cache cleared on logout

**Original finding (H-4 in v1 audit, reclassified Critical):** `staleTime: 30_000` meant a successful `['patient-lookup', query]` entry lived for 30 seconds in the in-memory QueryClient. `clearAuth()` never called `queryClient.clear()`. Doctor B logging in within 30 seconds of Doctor A and typing the same number received Doctor A's cached result — including `consent_granted` — without a server round-trip.

**Status: CLOSED**

**Fix applied:** `src/hooks/useLogout.ts` calls `queryClient.clear()` as step 3 of the logout sequence (after SQLite is cleared, before `clearAuth()`). Uses `useQueryClient()` from `@tanstack/react-query`, which gives access to the same `QueryClient` instance that `App.tsx` provides via `QueryClientProvider`. No changes to `App.tsx` or `useAuthStore.ts` were required.

---

## HIGH (fix before v1 launch)

**H-2 — Certificate pinning absent from API client**

```
File: src/api/apiClient.ts:30
```

Status: **OPEN — unchanged from v1 audit**

Risk: `apiFetch` uses the bare React Native `fetch()` with no certificate pinning. The threat model explicitly calls out "Man-in-the-middle — intercept data on shared/public WiFi (common in clinics)." At this screen, intercepted payloads include patient mobile numbers and basic profiles from `GET /patients/lookup` responses. Security spec mandates certificate pinning.

Fix: Implement native-level certificate pinning. For Expo-managed workflow, use `expo-build-properties` with a custom OkHttp interceptor (Android) and NSURLSession delegate (iOS), or integrate `react-native-ssl-pinning` and route `apiClient.ts` through it. Pin the SHA-256 SPKI fingerprint of the API's leaf certificate and one intermediate, with a backup pin for rotation.

---

**H-3 — Offline patient access generates no audit log entries**

```
File: src/db/patients.ts (getRecentPatients, searchPatientsByMobile)
```

Status: **OPEN — unchanged from v1 audit**

Risk: The security spec requires "Patient record accessed" to be logged for every sensitive operation. When offline, these functions return patient PII (name, mobile, DOB, last-visit date) with zero audit trail. The entire offline-access window is forensically invisible.

Fix: Create an `audit_events` local table in the SQLite schema. Write a `logLocalAccess(db, { event, patientIds, doctorId })` helper. Call it from `getRecentPatients` and `searchPatientsByMobile` after each read. Flush these events to the server's audit log via `POST /sync` when back online.

---

## MEDIUM (fix in next sprint)

**M-1 — Auth errors from `lookupPatient` are silently swallowed by `useQuery`**

```
File: src/screens/doctor/PatientSearchScreen.tsx:110-116
```

Status: **OPEN — unchanged from v1 audit**

Risk: `useQuery` has no `onError` handler. A 401 causes React Query to set `isError` without surfacing the error, and `showNoMatch` becomes `true`. The doctor sees "No patient found" for an existing patient and may create a duplicate record.

Fix: Read `error` from `useQuery`, detect `ApiError` with `status === 401`, call `clearAuth()`, and navigate to the Login screen.

---

**M-2 — Indian mobile format not validated on first digit**

```
File: src/screens/doctor/PatientSearchScreen.tsx:148-157
```

Status: **OPEN — unchanged from v1 audit**

Risk: The keypad allows any digit as the first character. Numbers starting with 0–5 are not valid Indian mobile numbers, but the client does not reject them. This wastes rate-limited API quota and risks invalid data entering the SQLite cache.

Fix: In `handleKeyPress`, reject digits 0–5 when `query.length === 0`.

---

## LOW (track in backlog)

**L-1 — Full patient name + mobile in accessibility label**

```
File: src/screens/doctor/PatientSearchScreen.tsx:519-522
```

Status: **OPEN — unchanged from v1 audit**

Risk: `accessibilityLabel` includes the unmasked full mobile number. Any app with `BIND_ACCESSIBILITY_SERVICE` on Android can read this. The visual display masks mobile numbers in "Recent Patients" but the accessibility label does not.

Fix: Use `formatMobile(patient.mobile_number, true)` (masked form) in the accessibility label.

---

**L-2 — `staleTime: 30_000` can show stale consent status within a session**

```
File: src/screens/doctor/PatientSearchScreen.tsx:114
```

Status: **OPEN — unchanged from v1 audit** *(cross-session leakage resolved by C-3 fix; within-session staleness remains)*

Risk: If a patient revokes consent within 30 seconds of a lookup, the cached `consent_granted: true` result would still be shown in D3 navigation params. Server-side record access is still blocked, but the UI would skip the consent-request gate briefly.

Fix: Lower `staleTime` to `5_000` or `0`.

---

**L-3 — D2 renders local patient data with no local auth guard**

```
File: src/screens/doctor/PatientSearchScreen.tsx:93-95
```

Status: **OPEN — unchanged from v1 audit**

Risk: `getRecentPatients` fires on mount without checking `!!token`. A navigation bug routing an unauthenticated session to D2 would display cached patient data.

Fix: Add `if (!token) return;` inside the mount effect, or enforce the auth guard at the navigator level (preferred).

---

## CHECKLIST STATUS

| Category | Result | Notes |
|---|---|---|
| Authentication & Sessions | ✅ 1/1 | JWT passed as Bearer; refresh token storage delegated to D1 per spec |
| Authorisation | ✅ 5/5 | `consent_granted` now stored and forwarded (C-2 closed); server-side RLS intact |
| Data Handling | ✅ 6/6 | No Aadhaar in scope; no `console.log` of PII found; S3 not in D2 scope |
| Mobile Security | ✅ 4/5 | SQLite cache cleared on logout (C-1 closed); React Query cache cleared (C-3 closed); certificate pinning still absent (H-2 open) |
| Input Validation | ❌ 1/2 | FAILED: first-digit (6–9) validation missing (M-2); 10-digit max ✅ |
| Database | ❌ 2/3 | FAILED: offline audit log absent (H-3); parameterised queries ✅; RLS on server ✅ |
| DPDP Compliance | ✅ 1/1 | `consent_granted` now stored in SQLite and forwarded to D3 nav params (C-2 closed) |

---

## OVERALL VERDICT

**Clear to merge to `dev`**

All three critical blockers from v1 are closed:
- **C-1** — SQLite patient cache is now doctor-scoped and wiped on logout via `useLogout()`
- **C-2** — `consent_granted` is stored in SQLite and forwarded in `PatientDetail` navigation params
- **C-3** — React Query cache is cleared as part of the `useLogout()` sequence

**Do not merge to `main`** until H-2 (certificate pinning) is resolved. H-3 (offline audit logging) must also be addressed before v1 launch.

Pre-v1 blockers remaining: **H-2, H-3** (2 open HIGH issues).
