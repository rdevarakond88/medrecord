# Security Audit v2 — D3 Patient Detail Screen (post-fix re-audit)

**Scope:** Full re-audit of `src/screens/doctor/PatientDetailScreen.tsx` + `src/db/visits.ts` + `src/hooks/useLogout.ts`
**Date:** 2026-04-11
**Auditor:** Security Agent
**Purpose:** Post-fix re-audit. The v1 live screen audit verdict was "Blocked — 1 critical finding (C-1) + H-1, H-2, H-3." This audit confirms all findings are resolved.

---

## Prior Findings Status

| Finding | v1 Status | v2 Verified |
|---|---|---|
| C-1: `chief_complaint` exposed in offline grayed cards via stale cache | CLOSED | ✅ Lines 226–229: `offlineConsent=false` → `otherVisits.map(v => ({ ...v, chief_complaint: null }))`. Enforced at data assignment, not display layer. |
| H-1: Stale `navConsentGranted` used for offline consent gate | CLOSED | ✅ Lines 213–214: offline path calls `getPatientByLocalId(db, patientLocalId)` and reads `offlineFreshPatient?.consent_granted`. Nav param no longer referenced for consent decision. |
| H-2: visits table not doctor-scoped — cross-doctor leakage in offline path | CLOSED | ✅ `cached_by_doctor_id` column in visits table; `getCachedVisits(db, patientServerId, patientLocalId, user.id)` scoped by doctorId |
| H-3: `useLogout` did not clear visits table | CLOSED | ✅ `clearDoctorVisits(db, doctorId)` in useLogout step 2 (line 89) |
| M-2: `logConsentAccess` fires multiple times per session | OPEN | ⚠️ Still present — see finding below |

---

## New Findings

None. M-2 is carried forward from v1.

---

## Open Finding (Carried Forward)

### MEDIUM — M-2: Consent audit event over-fires

**Description:** `logConsentAccess()` is triggered by the useEffect at lines 297–302:
```typescript
useEffect(() => {
  if (loadState === 'loaded' && consentGranted && user && patientServerId) {
    void logConsentAccess(db, user.id, patientServerId);
  }
}, [loadState, consentGranted]);
```
`fetchData` is called on every screen focus (`useFocusEffect`) and on every `lastSyncAt` change (background sync completion). Each call transitions `loadState` through `'loading' → 'loaded'`, which re-triggers this effect. A doctor who opens D3, backgrounds the app, and returns will generate multiple `consent_accessed` audit events for one clinical encounter.

**Risk:** Audit log inflation — not a data exposure issue. Over-counting consent events could mislead a DPDP audit report or patient data export.

**Fix:** Add a `consentLoggedRef = useRef(false)` that is set on first fire and reset on `patientLocalId` change. Or add an `is_already_logged` check against the `audit_events` table before writing. Either approach limits logging to one event per patient per D3 open.

**Severity:** MEDIUM — does not block merge. Fix before v1 launch.

---

## Full Checklist

### Authentication & Sessions
- ✅ Synchronous auth guard: `if (!token || !user) return null` at line 308 (after all hooks — D3-H-3)
- ✅ 401 handling: `setSessionExpired(true)` + redirect to Login within 2 seconds (lines 238–240)

### Authorisation
- ✅ Consent gate: server response is the authoritative gate (D3-H-2). Loading skeleton renders while `getPatientVisits()` is in flight. Nav param is initial signal only.
- ✅ Fail-secure: on any fetch error, `consentGranted = false`, `otherVisits = []` (lines 253–255)
- ✅ Offline consent read from SQLite (fresh `getPatientByLocalId`), not stale nav param (H-1 fix)
- ✅ `chief_complaint` stripped from other-doctor visits when `offlineConsent = false` (C-1 fix)
- ✅ AppState foreground re-validation: `fetchData()` on every `active` transition (lines 273–282)
- ✅ `useFocusEffect`: re-fetches on every screen focus including return from D9 consent flow

### Data Handling
- ✅ No Aadhaar handling in D3 scope
- ✅ Zero `console.log` calls in PatientDetailScreen.tsx — confirmed by grep
- ✅ `logConsentAccess` writes patient server ID and doctor ID only — no names or mobile numbers

### Mobile Security
- ✅ Logout clears visits cache: `clearDoctorVisits(db, doctorId)` (useLogout line 89)
- ✅ Logout clears draft visits: `clearDoctorDraftVisits(db, doctorId)` (useLogout line 90)
- ✅ React Query cache cleared on logout (useLogout line 105)
- ✅ SecureStore keys deleted on logout

### Database
- ✅ All SQLite queries in visits.ts use parameterised statements
- ✅ `getCachedVisits` scoped to `cached_by_doctor_id = ?` — confirmed in visits.ts
- ✅ `upsertVisitsFromServer` writes `cached_by_doctor_id` on every row
- ✅ `logConsentAccess` writes DPDP audit event to `audit_events` table

### DPDP Compliance
- ✅ Consent re-verified server-side on every screen open (D3-H-2)
- ✅ Consent revocation takes effect on next focus (server response is gate)
- ✅ Audit event emitted on consent-gated data access
- ⚠️ Audit event may fire multiple times per encounter (M-2 — MEDIUM, not blocking)

---

## CHECKLIST STATUS

| Category | Result |
|---|---|
| Authentication & Sessions | ✅ PASS |
| Authorisation | ✅ PASS |
| Data Handling | ✅ PASS |
| Mobile Security | ✅ PASS |
| Database | ✅ PASS |
| DPDP Compliance | ⚠️ PASS with MEDIUM debt (M-2 audit over-fire) |

---

## OVERALL VERDICT

**CLEAR TO MERGE TO MAIN**

All CRITICAL and HIGH findings from the v1 live screen audit are verified fixed. C-1 (consent enforcement at the data layer), H-1 (stale nav param), H-2 (visit table scoping), and H-3 (logout cleanup) are all confirmed in code. One MEDIUM finding (M-2 audit over-fire) is carried forward — it does not expose patient data or violate consent rules, and does not block merge. Fix before v1 launch.
