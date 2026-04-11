# Security Audit v3 — D2 Patient Search Screen (post-fix re-audit)

**Scope:** Full re-audit of `src/screens/doctor/PatientSearchScreen.tsx` + `src/db/patients.ts` + `src/hooks/useLogout.ts`
**Date:** 2026-04-11
**Auditor:** Security Agent
**Purpose:** Post-fix re-audit. v2 verdict was "Clear to merge to dev — do NOT merge to main until H-2 + H-3 resolved." This audit confirms whether H-2 and H-3 have been properly addressed.

---

## Prior Findings Status

| Finding | v2 Status | v3 Verified |
|---|---|---|
| C-1: SQLite patients not doctor-scoped | CLOSED | ✅ `clearDoctorPatients(db, doctorId)` in useLogout step 2; `doctor_id` column present |
| C-2: consent_granted not stored in SQLite | CLOSED | ✅ `consent_granted` column in patients table; forwarded in nav params |
| C-3: React Query not cleared on logout | CLOSED | ✅ `queryClient.clear()` in useLogout step 4 |
| H-2: No certificate pinning | CLOSED | ✅ `pinnedFetch.ts` wraps `react-native-ssl-pinning`; called from `apiFetch`. **Note: only active in EAS custom builds — does not run in Expo Go. Documented known debt.** |
| H-3: No offline audit log | CLOSED | ✅ `logLocalPatientAccess()` fires after `getRecentPatients` and `searchPatientsByMobile`; mobile digits NOT embedded in log |
| M-2: First-digit (6–9) validation missing | CLOSED | ✅ Lines 213–216: `query.length === 0 && key < '6'` correctly rejects 0–5 on first digit using ASCII comparison |

---

## New Findings

None identified.

---

## Full Checklist

### Authentication & Sessions
- ✅ JWT enforced server-side (API contract confirmed)
- ✅ 401 handling redirects to Login with session-expired banner (lines 161–166)
- ✅ Auth guard: synchronous `if (!token || !user) return null` at line 269 (after all hooks)

### Authorisation
- ✅ All SQLite reads scoped to `doctor_id` — `getRecentPatients`, `searchPatientsByMobile` both take `doctorId`
- ✅ Server lookup passes JWT token: `lookupPatient(query, token!)` (line 151)
- ✅ No patient data accessible without token — auth guard fires before any JSX

### Data Handling
- ✅ No Aadhaar handling in D2 scope
- ✅ No patient names or mobile numbers in `console.log` calls — audit confirmed zero `console.log` in PatientSearchScreen.tsx
- ✅ `logLocalPatientAccess` logs `queryLength` (digit count), NOT the digits themselves (line 139)
- ✅ Audit events written to `audit_events` table; flush to server via sync queue (pre-existing deferral, documented)

### Mobile Security
- ✅ Logout: patients cache cleared (`clearDoctorPatients`), React Query cleared (`queryClient.clear()`), auth state cleared
- ✅ SecureStore keys deleted on logout (useLogout lines 100–101)
- ⚠️ Certificate pinning: implemented in `pinnedFetch.ts` but **only active in EAS custom builds**. Expo Go bypasses it. This is documented, accepted v1 debt. Not a new finding.

### Input Validation
- ✅ First digit 6–9 enforcement: line 213–216
- ✅ 10-digit maximum enforced: line 215 `query.length < 10`
- ✅ Backspace handled correctly: line 207
- ✅ Empty keypad key (blank button) produces no input: handled by `key < '6'` path or `query.length < 10`

### Database
- ✅ All queries use parameterised statements (no string concatenation in patients.ts)
- ✅ `getRecentPatients` and `searchPatientsByMobile` scoped to `doctor_id`
- ✅ `upsertPatientFromServer` includes `doctor_id` on every write
- ✅ Audit log written on every patient data access

### DPDP Compliance
- ✅ Consent signal (`consent_granted`) read from SQLite and forwarded to D3 nav params
- ✅ Audit event emitted on patient data access (local reads logged offline; sync pending)
- ⚠️ Audit event flush to server is deferred (pre-existing H-3 decision, documented in project-state.md). Not a new finding.

---

## CHECKLIST STATUS

| Category | Result |
|---|---|
| Authentication & Sessions | ✅ PASS |
| Authorisation | ✅ PASS |
| Data Handling | ✅ PASS |
| Mobile Security | ✅ PASS (cert pinning EAS-only — documented debt) |
| Input Validation | ✅ PASS |
| Database | ✅ PASS |
| DPDP Compliance | ✅ PASS (audit flush deferred — documented) |

---

## OVERALL VERDICT

**CLEAR TO MERGE TO MAIN**

All CRITICAL and HIGH findings from v1 and v2 audits are verified fixed. M-2 (first-digit validation) is confirmed implemented. No new findings identified. The two remaining documented items (cert pinning EAS-only, audit flush deferral) are pre-existing, accepted, and logged in project-state.md — they do not block merge.
