# Project State — MedRecord
_This file is updated at the end of every Claude Code session. Pass this file as context at the start of every new session._

## Current Status
**Phase:** BUG-D3-DT8-1 OPEN (2026-03-30) — Device Test Session 8 complete. BUG-D3-DT7-1 NOT VERIFIED on device — `isConnected !== false` fix insufficient. Sync worker still not completing on iOS after foreground. Four consecutive Builder sessions have not resolved sync on device. BUG-D3-DT1-2 (cross-session persistence) remains blocked. Next: Builder Agent session with new debug strategy — surface sync state visually on device screen (overlay/toast) rather than console logs, which are inaccessible via verbal device testing.
**Last Updated:** 2026-03-30

---

## Backend Status
| Field | Value |
|---|---|
| API base URL (live) | `https://medrecord-api.onrender.com/v1` |
| API base URL (frontend hardcoded) | `https://medrecord-api.onrender.com/v1` ✅ — updated 2026-03-18 |
| Deployment status | **DEPLOYED** — Render.com free tier, deployed 2026-03-18 |
| Hosting provider | Render.com — service: `medrecord-api`, DB: `medrecord-db` |
| Health check | `curl https://medrecord-api.onrender.com/v1/health` → 200 ✅ |
| Test doctor name | Dr. Test Doctor |
| Test mobile number | `9999999999` |
| OTP bypass | Set `TEST_OTP_BYPASS=true` (already set) — use code `000000` |
| Blocker for device testing | ~~`apiClient.ts` dead domain~~ RESOLVED. ~~BUG-D1-DT-1 `auth.ts:20` dead domain~~ **RESOLVED 2026-03-18** |
| Next action | D1 device testing COMPLETE — clear to merge to main |

_Update this section whenever backend status changes. Every device testing session must check this first._

---
**Last Session:** Device Tester Agent (2026-03-30). D3 Session 8. BUG-D3-DT7-1 NOT VERIFIED — `isConnected !== false` fix insufficient on device. Sync worker still not completing after foreground. BUG-D3-DT1-2 (cross-session persistence) still blocked. BUG-D3-DT8-1 logged (HIGH). Four builder sessions have not resolved iOS sync. Critical gap: console logs not visible via verbal device testing — next Builder session must surface sync state visually on device.

### Recommended Next Session Order
| Priority | Session | Reason |
|---|---|---|
| 1 | **Builder Agent — BUG-D3-DT8-1** | Sync worker never runs on iOS — four fixes have failed. New approach: add visible debug overlay/toast to surface sync state on device; investigate what is actually blocking the trigger chain |
| 2 | **D1 device testing (Step 8)** | OTP auth unverified — pilot requires confirmed real-device auth |
| 3 | **Merge D6 + D7 + D2 to main** | All three clear now — do not wait on D3/D1 |
| 4 | D5 (New Patient Form) — build Steps 2–10 | New patients break the flow without it |
| 5 | D4 (Visit Detail) — build Steps 2–10 | Unlocks D3 history list value |
| 6 | D9 (Consent Request) — build Steps 2–10 | Unlocks multi-doctor use cases |
| 7 | D8 (Full Scan View) — build Steps 2–10 | Additive, not blocking anything |

---

## Decisions Made (Locked — Do Not Revisit Without Good Reason)

| Decision | Rationale |
|---|---|
| Mobile number is primary patient key | Simpler than Aadhaar, lower regulatory risk, higher coverage |
| Aadhaar stored as SHA-256 hash only | UIDAI compliance, data minimisation |
| Visit-triggered, append-only records | No simultaneous writes possible; simplifies sync |
| Last-write-wins sync (no CRDTs) | Sufficient given write model; avoids complexity |
| expo-sqlite directly (not WatermelonDB) | Less abstraction, easier to debug in field for v1 |
| Zustand + React Query for state | Proven pattern for offline-first RN apps |
| AWS ap-south-1 (Mumbai) for all storage | DPDP data localisation expectation |
| OCR is async, never blocks UI | Core UX principle — speed > features |
| Google Vision API (primary), Tesseract (fallback) | Vision API better accuracy on handwriting |
| S3 image storage deferred to v2 — images stored on device local filesystem only for now. Swap requires changing one storage handler function and one config value. | — |
| D7 (Document Scanner) defaults to manual tap-to-capture; auto-capture deferred to v2 | Auto-capture is unreliable on low-end Android under inconsistent clinic lighting |
| D5 (New Patient Form) must hash Aadhaar at the form submission boundary — raw Aadhaar must never travel through the call stack or reach any storage layer | UIDAI compliance; data minimisation; extends existing SHA-256 hash decision |

---

## Build Constraints — Doctor Visit Flow (D2, D3, D5, D6, D7)
_Carry these into every build/mockup session for these screens._

- **D2 (Patient Search):** Offline SQLite search is the primary implementation path, not a fallback. Write the SQLite path first. The network path layers on top. Show offline state variant as a first-class design state.
- **D3 (Patient Detail):** API must return two separate visit lists — `myVisits` (doctor's own records, always returned) and `otherDoctorVisits` (consent-gated, `chiefComplaint` excluded at the query layer). Do not rely on UI graying alone. The fourth mockup variant (`D3PatientDetailHasDataOwnVisitsOnly`) models the correct shape. Tracked as D3-H-1.
- **D3 (Patient Detail):** Do not render visit history until server-side consent re-fetch completes. Use loading skeleton on mount; fall back to SQLite cache only when offline. Nav param is the initial signal only, not the gate. Tracked as D3-H-2.
- **D3 (Patient Detail):** Add synchronous auth guard (`if (!token || !user) return null`) before any JSX in all variants. Same pattern as D2 live screen. Tracked as D3-H-3.
- **D3 (Patient Detail):** Patient header must include an edit affordance (stub navigation to profile-edit screen is acceptable for v1) — staff correct mobile numbers from this screen. Do not omit it from the live build. Flagged by Sunita (persona critique SHOULD FIX, not applied to mockup).
- **D3 (Patient Detail):** Patient full name is displayed at 22pt bold with no PII dimming — visible to bystanders in shared clinic spaces. Address in this live build: implement a name-dimming gesture or abbreviated display after screen idle timeout. Tracked as MEDIUM debt.
- **D6 (New Visit):** Must include an explicit "consent not yet established" state variant in the mockup. Do not build D6 as if patient consent is always pre-granted — D9 (Consent Request Flow) will wire up later, but D6 must acknowledge the state exists.
- **D6 (New Visit):** Validate against the product-vision.md success metric: doctor completes a visit record in under 60 seconds. If the screen requires more than 3 taps to reach a submittable state, redesign before persona review.
- **D7 (Document Scanner):** Include a simple exposure/readability indicator before capture (e.g. too dark / good / overexposed). Do not rely on OCR feedback — this is basic camera exposure feedback only. Required for inconsistent clinic lighting conditions.

---

## Screens Built

### CRITICAL — D7 QA findings (must fix before device testing)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D7-QA-C1:** `updateVisitScan` overwrites `scan_local_path`~~ | D7 | D7 QA test plan CRITICAL-1 | **CLOSED 2026-03-05** — `scans` table (one row per scan) added to schema.ts. `insertVisitScan()` replaces `updateVisitScan()` in D7. `clearDoctorScanRecords()` added to useLogout. |
| ~~**D7-QA-C2:** Absolute file path stored in SQLite — Android path drift~~ | D7 | D7 QA test plan CRITICAL-2 | **CLOSED 2026-03-05** — relative path (`${doctorId}/scans/${uuid}.jpg`) stored in `scans.local_path` and enqueueOperation payload. `resolveScanPath()` resolves to absolute at read time. |
| ~~**D7-QA-C3:** Orphaned file if app killed between moveAsync and withTransactionAsync~~ | D7 | D7 QA test plan CRITICAL-3 | **CLOSED 2026-03-05** — `FileSystem.moveAsync` moved inside `withTransactionAsync`. Orphan-file window reduced to microseconds. Startup orphan-cleaner recommended for v2. |

### HIGH — D7 QA findings

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D7-QA-H1:** `sanitizeOcrText` regex `/\d{12}/g` strips non-Aadhaar 12-digit strings~~ | D7 | D7 QA test plan HIGH-1 | **CLOSED 2026-03-05** — replaced with `/\b\d{4}\s?\d{4}\s?\d{4}\b/g`. Word boundaries prevent partial matches; covers both spaced and unspaced Aadhaar; 13-digit bank refs not matched. |
| ~~**D7-QA-H2:** `ocr_status: 'pending'` in enqueueOperation payload for a no-op stub~~ | D7 | D7 QA test plan HIGH-2 | **CLOSED 2026-03-05** — changed to `'deferred'` with comment. `scans` table also defaults to `'deferred'`. Change to `'pending'` when OCR worker is wired. |
| ~~**D7-QA-H3:** No max retry count in `sync_queue` — queue runaway risk~~ | D7 | D7 QA test plan HIGH-3 | **CLOSED 2026-03-05** — `max_attempts INTEGER NOT NULL DEFAULT 5` added to CREATE TABLE + ALTER TABLE migration. Sync worker must check `attempts >= max_attempts` → `status = 'failed'`. |
| ~~**D7-QA-H4:** JWT refresh not handled for scan sync entries — if access token expires during sync worker batch processing, scan upload fails silently~~ | D7 | D7 QA test plan HIGH-4 | **CLOSED 2026-03-13** — `tryRefreshToken()` in `syncWorker.ts`: reads refresh token from `expo-secure-store (REFRESH_TOKEN_KEY)`, calls POST /auth/refresh via `pinnedFetch`, updates auth store, retries once. If refresh fails, resets in_progress entries to pending and aborts run. Never navigates. Partial gap: new refresh token not stored back to SecureStore — tracked as Sync Worker H-2. |

---

## Screens Built

| Screen | File | Session | Notes |
|---|---|---|---|
| Sync Worker | `src/sync/syncWorker.ts`, `src/sync/useSyncWorker.ts`, `src/store/useSyncStore.ts`, `src/auth/constants.ts` | 2026-03-13 | Builder complete. Drain loop: batches 20 entries, strict queued_at ASC order, record entries deferred (S3 v2), JWT 401 refresh + retry once, per-result id_mapping + entity updates, audit event flush. Three triggers: AppState active, NetInfo restored, 5-min interval. App.tsx mounted via SyncWorkerMount. **Security audit complete (2026-03-13) — BLOCKED: 3 HIGH findings. See Known Technical Debt — Sync Worker.** |
| D2 — Patient Search / Home | `mockups/D2PatientSearchScreen.tsx` (mockup) / `src/screens/doctor/PatientSearchScreen.tsx` (live) | 2026-02-19 | Static mockup approved. Live screen wired: SQLite primary path, GET /patients/lookup on 10 digits, server result cached to SQLite, offline banner + context card, sync badges, navigation stubs to D3/D5. **All agents run:** security audit v1 (BLOCKED), persona critique (3.2/5), QA test plan (`reviews/D2-qa-test-plan.md`). C-1/C-2/C-3 fixed (2026-02-20). Security re-audit v2 passed. All HIGH debt items closed (2026-02-22). **Real device verified (2026-02-22) on iPhone via Expo Go:** search bar focus/unfocus, cursor after digit, FAB position, digit entry — all confirmed. Checklist: `reviews/D2-VALIDATION-CHECKLIST.md`. **On `dev`. Do not merge to `main` until H-2 + H-3 resolved.** |
| D3 — Patient Detail / History | `mockups/D3PatientDetailScreen.tsx` (mockup) / `src/screens/doctor/PatientDetailScreen.tsx` (live) | 2026-02-23 / 2026-02-24 | Static mockup with four variants approved. Live screen wired: `getPatientVisits()` two-list API (`myVisits` + `otherDoctorVisits`), loading skeleton on mount, server consent gate (D3-H-2), offline SQLite fallback (`getCachedVisits()`), synchronous auth guard (D3-H-3), `useFocusEffect` for dynamic consent transition on D9 return, AppState foreground re-verify, offline guard on Request Access, DPDP audit event to `audit_events` table, FlatList with `maxToRenderPerBatch={10}` + client-side pagination, `recordCount=0 → 'Draft'`, `numberOfLines={1}` on patient name, no consent badge on empty state, last-verified timestamp in offline banner, per-variant consent gate box, "View Full Visit" disabled stub until D4. Supporting modules: `src/api/visits.ts`, `src/db/visits.ts`, `getPatientByLocalId()` in db/patients. Schema: visits + audit_events tables. All D3 HIGH pre-merge debt closed. **Device test session 1 complete (2026-03-28) — BUG-D3-DT1-1 FIXED (commit fb6fe40). Device test session 2 complete (2026-03-28) — BUG-D3-DT1-2 FIXED (2026-03-28) — getSyncedDraftVisitsNotInServer() added; online fetchData now covers both Mode 1 (pending) and Mode 2 (synced-but-absent) failure modes. Reports: `reviews/D3-device-test-session-1.md` through `reviews/D3-device-test-session-4.md`. **Session 4 (2026-03-28): BUG-D6-DT-1 VERIFIED fixed. BUG-D3-DT4-1 NEW (same day FIXED by Builder): sync worker hit max_attempts → 'failed' row deleted at logout without M-6. Fix: countUnsyncedDraftVisits counts 'pending'+'failed'; getFailedDraftVisits added; D3 online path surfaces failed drafts. **Session 5 (2026-03-29): BUG-D3-DT4-1 VERIFIED fixed. BUG-D3-DT5-1 NEW then FIXED (same day by Builder): useSyncWorker captured doctorId as '' on fresh-login — sync worker queried with empty doctor_id, found 0 rows, visits never uploaded. Fix: runSyncWorker reads doctorId from useAuthStore at call time. Secondary: dead BASE_URL in tryRefreshToken replaced with API_BASE_URL from apiClient.ts. Device test session 6 needed to verify BUG-D3-DT5-1 fix + BUG-D3-DT1-2 cross-session persistence.** **Session 6 (2026-03-29): BUG-D3-DT5-1 NOT VERIFIED — sync still not completing on device despite code fix. BUG-D3-DT6-1 NEW (HIGH): visits remain Draft + cloud after multiple AppState triggers and navigation cycle. Network reachable confirmed. Builder investigation with sync worker logging required. BUG-D3-DT1-2 re-verification still BLOCKED.** **Session 7 (2026-03-29): BUG-D3-DT6-1 NOT VERIFIED — isInternetReachable fix insufficient. BUG-D3-DT7-1 logged. Root cause found in Builder session: `isConnected === true` strict check blocked sync when iOS NetInfo returns isConnected:null before reachability probe completes. Fixed to `isConnected !== false`. Secondary fix: sync worker now mirrors 'failed' status to visits_draft at max_attempts. D3 subscribes to useSyncStore.lastSyncAt for auto-refresh. Device test session 8 required to verify all three fixes + BUG-D3-DT1-2.** **Session 8 (2026-03-30): BUG-D3-DT7-1 NOT VERIFIED — `isConnected !== false` fix also insufficient on device. Sync worker still not completing on iOS after foreground trigger or navigation cycle. BUG-D3-DT8-1 logged (HIGH). BUG-D3-DT1-2 cross-session persistence still blocked (visit never syncs). Four builder sessions have failed to resolve iOS sync. Critical gap: console logs not accessible via verbal device testing in Expo Go — next Builder session must add visible debug overlay/toast to surface sync state on screen.** |

## Screens Pending

| Screen | Status | Notes |
|---|---|---|
| D6 — New Visit | **DEVICE TESTING COMPLETE (2026-03-28, session 6). BUG-D6-DT5-1 fix verified. Zero bugs. Clear to merge to main.** Items #49, #60 permanently deferred (simulation, v1 acceptable). Sessions: `reviews/D6-device-test-session-2.md` through `reviews/D6-device-test-session-6.md`. | Tier 1 Critical. `src/screens/doctor/NewVisitScreen.tsx`. Checklist: `reviews/D6-VALIDATION-CHECKLIST.md`. |
| D4 — Visit Detail | Not started | Tier 3. Required before "View Full Visit" button in D3 can be wired. |
| D7 — Document Scanner | **COMPLETE — device testing done 2026-03-06.** All 95 checklist items confirmed or deferred with written reason. Security audit v3: Clear to merge. Ready for PR to main. | Tier 1 Critical. Checklist: reviews/D7-VALIDATION-CHECKLIST.md. |
| D5 — New Patient Form | Stub only (`Login` stub in App.tsx) | Tier 3. Must hash Aadhaar at form boundary — locked decision. |
| D1 — Login / OTP | **Static mockup built. Persona Critic R2: 4.0/5 — PASSED (2026-03-16). Security audit v1+v2 complete — all HIGHs closed. QA complete (2026-03-16). QA M-1 + M-2 fixed (2026-03-16) — security re-check CLEAR. 1 MEDIUM bug remaining (M-3 — resend failure drops phase; deferred, confirm before fixing). Ready for device testing.** File: `src/screens/doctor/LoginScreen.tsx`. Reports: `reviews/D1-persona-critique-r2.md`, `reviews/D1-security-audit.md`, `reviews/D1-security-audit-v2.md`, `reviews/D1-qa-test-plan-v2.md`. | Tier 3. Android SMS autofill deferred (no Expo managed-workflow module). SF-3 (individual digit boxes) deferred to future polish. |
| D8 — Full Scan View | Not started | Tier 3. Image viewer + OCR panel. |
| D9 — Consent Request Flow | Not started | Tier 3. D3 `handleRequestAccess` has TODO stub pointing here. |
| P1–P5 — Patient App | Not started | Tier 2 / Tier 4. |

---

## Open Questions

| Question | Screen | Source | Status |
|---|---|---|---|
| Should `consent_granted` be stored in local SQLite and passed to D3 via nav params, or should D3 always re-fetch fresh from server on open? | D2→D3 | QA C-2 / Security H-1 | **Resolved 2026-02-20** — stored in SQLite, passed in PatientDetail nav params as `consentGranted`. D3 re-fetches fresh on open but uses this as the initial gate signal. |
| Should the `patients` table be scoped per `doctor_id` (filtered) or wiped entirely on logout? Wiping loses offline-only patients if doctor logs out mid-session. | D2 | QA C-1 / Security C-1 | **Resolved 2026-02-20** — scoped per `doctor_id`. `clearDoctorPatients(db, doctorId)` deletes only the logged-out doctor's rows. Other doctors' offline-only patients are preserved. |
| Should offline patient access audit logs be written to SQLite and synced in v1, or deferred to v2? | D2 | QA E-9 / Security H-3 | Unresolved — healthcare compliance decision (tracked as H-3 pre-merge blocker above) |

---

## Known Technical Debt

### CRITICAL — Must fix before merging D2 to main

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**C-1:** `clearAuth()` does not clear SQLite `patients` table → cross-doctor data leakage on shared clinic devices~~ | D2 | Security audit C-1 / QA C-1 | **CLOSED 2026-02-20** — `doctor_id` column added; `clearDoctorPatients()` + `useLogout` hook wipe SQLite on logout. |
| ~~**C-2:** `consent_granted` fetched from server but never stored in local schema; D3 receives no consent signal~~ | D2→D3 | Security audit H-1 / QA C-2 | **CLOSED 2026-02-20** — `consent_granted` column added to schema + `LocalPatient`; written in upsert; passed in PatientDetail nav params. |
| ~~**C-3:** React Query `QueryClient` not cleared on logout; stale patient + consent data from Doctor A served to Doctor B's session~~ | D2 | Security audit H-4 / QA C-3 | **CLOSED 2026-02-20** — `queryClient.clear()` is step 3 of the `useLogout` sequence. |

### HIGH — Must fix before merging D2 to main

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**H-2:** Certificate pinning not implemented — `apiFetch` uses bare `fetch()` with no SPKI pin; MITM possible on shared clinic WiFi~~ | D2 | Security audit v2 H-2 | **CLOSED** — `src/api/pinnedFetch.ts` added; wraps `react-native-ssl-pinning` with two cert pins (`api_medrecord_leaf`, `api_medrecord_intermediate`). `apiFetch` now calls `pinnedFetch` instead of bare `fetch`. Requires: (1) `npx expo install react-native-ssl-pinning`, (2) `.cer` cert files bundled in native assets, (3) EAS/custom dev build — does NOT work in Expo Go. Cert hash setup instructions in `src/api/pinnedFetch.ts` file header. |
| ~~**H-3:** Offline patient access generates no audit log — `getRecentPatients` and `searchPatientsByMobile` return PII with zero audit trail when offline~~ | D2 | Security audit v2 H-3 | **CLOSED** — `logLocalPatientAccess()` added to `src/db/patients.ts`; called fire-and-forget after `getRecentPatients` and `searchPatientsByMobile` in `PatientSearchScreen.tsx`. Logs `recent_patients_viewed` (with count) and `patient_searched` (with queryLength, not digits — PII not embedded in audit log) to `audit_events` table. Flush to server via POST /sync deferred to sync worker session (same as D3 audit pattern). |

### CRITICAL — D3 live screen security audit

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**C-1:** `chief_complaint` rendered in grayed visit cards via stale SQLite cache in offline path when `offlineConsent=false` — consent-layer-spec Rule 2 violation~~ | D3 | D3 live security audit C-1 | **CLOSED 2026-02-24** — offline path strips `chief_complaint` from `otherVisits` when `offlineConsent=false`: `cached.otherVisits.map(v => ({ ...v, chief_complaint: null }))`. Enforced at data assignment, not in `VisitCard`. Online path was already safe (server excludes at query layer). |

### HIGH — D3 live screen security audit

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**H-1:** Offline consent gate used stale `navConsentGranted` nav param instead of SQLite — ignored consent revocations written by prior online fetches~~ | D3 | D3 live security audit H-1 | **CLOSED 2026-02-24** — offline path calls `getPatientByLocalId(db, patientLocalId)` to get fresh `consent_granted`; online path refreshes `patient` state after `UPDATE patients SET consent_granted`. `navConsentGranted` no longer referenced. |
| ~~**H-2:** `visits` table not doctor-scoped — `getCachedVisits` returned any doctor's rows for a patient; cross-doctor data leakage in offline path~~ | D3 | D3 live security audit H-2 | **CLOSED 2026-02-24** — `cached_by_doctor_id TEXT NOT NULL DEFAULT ''` column added to `visits` table (schema + migration); `getCachedVisits(db, patientId, doctorId)` and `upsertVisitsFromServer(..., doctorId)` now filter/write by doctor. New index `idx_visits_doctor_patient` added. |
| ~~**H-3:** `useLogout` did not clear `visits` table — clinical visit data persisted across logout/login on shared devices~~ | D3 | D3 live security audit H-3 | **CLOSED 2026-02-24** — `clearDoctorVisits(db, doctorId)` added to `src/db/visits.ts`; called in `useLogout` as step 2b, immediately after `clearDoctorPatients`. |

### CRITICAL — Must fix in D3 mockup before live build begins

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D3-C-1:** Chief complaint text rendered in grayed visit cards in no-consent variant — clinical content visible without consent~~ | D3 | Security audit CRITICAL | **CLOSED 2026-02-23** — `{ ...visit, chiefComplaint: null }` passed to all grayed `VisitCard` components in `D3PatientDetailHasDataNoConsent`. In live build: API must not return `chiefComplaint` on the consent-absent query path (tracked as HIGH live-build debt below). |
| ~~**D3-C-2:** Own-doctor visits not distinguished from other-doctor visits in no-consent variant — all visits grayed indiscriminately~~ | D3 | Security audit HIGH | **CLOSED 2026-02-23** — Fourth variant `D3PatientDetailHasDataOwnVisitsOnly` added with `VISITS_OWN` (expandable, full data) and `VISITS_OTHER` (grayed, `chiefComplaint: null`). Models the `myVisits` + `otherDoctorVisits` two-list API shape. API split tracked as HIGH live-build debt below. |

### HIGH — Must fix before D3 live build

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D3-H-1:** Live build API must return two separate visit lists — `myVisits` (doctor's own, always returned) and `otherDoctorVisits` (consent-gated, `chiefComplaint` omitted)~~ | D3 | Security audit D3-C-2 / mockup `VISITS_OWN` + `VISITS_OTHER` | **CLOSED 2026-02-24** — `getPatientVisits()` in `src/api/visits.ts` calls `GET /patients/:serverId/visits` which returns `{ my_visits, other_doctor_visits, consent_granted, checked_at }`. Server must exclude `chief_complaint` from `other_doctor_visits` at the query layer when `consent_granted=false`. |
| ~~**D3-H-2:** Server-side consent re-verification must complete before visit history renders — nav param must not be used as the sole gate~~ | D3 | Security audit HIGH | **CLOSED 2026-02-24** — Loading skeleton rendered on mount until `getPatientVisits()` resolves. Offline fallback to `getCachedVisits()` only when `isConnected === false`. Nav param `consentGranted` used only in offline fallback; server response is the gate. |
| ~~**D3-H-3:** Auth guard on mount — synchronous null-render if token or user is absent~~ | D3 | Security audit HIGH | **CLOSED 2026-02-24** — `if (!token \|\| !user) return null` added at `PatientDetailScreen.tsx` after all hooks, matching D2 pattern (PatientSearchScreen.tsx line 244). |

### HIGH — Fix before D3 build

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**H-1:** `getRecentPatients` not scoped to `doctor_id`; returns any doctor's patients on a shared device~~ | D2 | Security audit M-3 / QA H-1 | **CLOSED 2026-02-20** — resolved as part of C-1 fix. |
| ~~**H-2 (UX):** Auth errors (401) from `lookupPatient` silently swallowed by React Query; no user feedback on expired session~~ | D2 | Security audit M-1 / QA H-2 | **CLOSED** — `isError`/`error` destructured from `useQuery`; `useEffect` detects `ApiError` with `status === 401`, sets `sessionExpired` state, shows red banner "Your session has expired. Please log in again.", redirects to Login after 2s. |
| ~~**H-3 (UX):** No validation on first digit of Indian mobile number (valid: 6–9); numbers starting 0–5 trigger server lookup and may create invalid patient records~~ | D2 | Security audit M-2 / QA H-3 | **CLOSED** — `handleKeyPress` rejects digits 0–5 on first keystroke; sets `mobileError` state; inline red message "Mobile numbers start with 6–9" shown below search bar; cleared on valid input or clear. |
| ~~**H-4:** No auth guard on D2 mount; `getRecentPatients` runs before `token` is confirmed non-null~~ | D2 | Security audit L-3 / QA H-4 | **CLOSED** — `useEffect` on `[token, user]` calls `navigation.replace('Login')` if either is falsy; both `getRecentPatients` and `searchPatientsByMobile` effects guarded with `if (!token \|\| !user) return`. **Upgraded 2026-02-23:** synchronous `if (!token \|\| !user) return null` added at line 244 before JSX — screen renders nothing on first frame when unauthenticated. End-to-end verification deferred to D1 session (needs NavigationContainer + registered Login route). See checklist item 13. |
| ~~**H-5:** `useNetworkStatus` returns `true` when `isInternetReachable` is `null` (unconfirmed); triggers false server lookups on captive portal / no-internet WiFi~~ | D2 | QA H-5 | **CLOSED** — condition changed to `isConnected === true && isInternetReachable === true`; initial state changed to `false`; null treated as offline. |

### MUST FIX — D6 mockup (all closed)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D6-M-1:** Disabled Save button gives no tap feedback — silent failure~~ | D6 | Persona critique v1 — Dr. Sinha | **CLOSED 2026-02-25** — `handleDisabledPress` + `hintHighlighted` state + persistent `saveHint` text in `D6NewVisitEmpty`. |
| ~~**D6-M-2:** `scanThumbRemove` touch target 36×36px — below 48×48px spec minimum~~ | D6 | Persona critique v1 — Sunita | **CLOSED 2026-02-25** — `scanThumbRemove` set to 48×48px + `hitSlop={{ top:6, bottom:6, left:6, right:6 }}`. |
| ~~**D6-M-3:** `D6NewVisitNoConsent` variant does not show Save becoming active when a record is added — spec ambiguity risking live-build misimplementation~~ | D6 | Persona critique v1 — Dr. Nair | **CLOSED 2026-02-25** — `D6NewVisitNoConsentHasNote` variant added (consent notice + filled note + `SaveButton enabled={true}`). |
| ~~**D6-M-4:** `D6NewVisitNoConsent` disabled Save button has no tap feedback or hint text — M1 pattern not extended to this variant~~ | D6 | Persona critique v2 — Dr. Sinha, Sunita | **CLOSED 2026-02-25** — `handleDisabledPress` + `saveHint` wired into `D6NewVisitNoConsent` bottomBar. |

### SHOULD FIX — D6 mockup (all closed)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D6-S-1:** Chief complaint optional indicator at label level only~~ | D6 | Persona critique v1 — Dr. Sinha | **CLOSED 2026-02-25** — `"Chief Complaint (optional)"` at section label level in all variants. |
| ~~**D6-S-2:** Date pill tappability — chevron alone insufficient affordance~~ | D6 | Persona critique v1 — Dr. Sinha | **CLOSED 2026-02-25** — `"Change"` text label added to `DatePill` alongside chevron. |
| ~~**D6-S-3:** Consent notice language — "implicit consent request" and "next app open" are jargon~~ | D6 | Persona critique v1 — Dr. Sinha, Arjun, Shantabai | **CLOSED 2026-02-25** — Plain-language rewrite in `ConsentNoticeBanner`; patient-without-app sentence added. |
| ~~**D6-S-4:** Header missing clinic attribution — multi-doctor clinics need visit filing context~~ | D6 | Persona critique v1 — Dr. Nair | **CLOSED 2026-02-25** — Third subtitle line added to `ScreenHeader`. |
| ~~**D6-S-5:** `DOCTOR` constant dead code; `ScreenHeader` hardcoded `"City Clinic · Dr. Sharma"` instead of `{DOCTOR.clinic} · {DOCTOR.name}`~~ | D6 | Persona critique v2 — Dr. Nair | **CLOSED 2026-02-25** — Hardcoded string replaced with `{DOCTOR.clinic} · {DOCTOR.name}` in `ScreenHeader`. |

### MEDIUM — Fix before production

| Item | Screen | Source | Notes |
|---|---|---|---|
| Full mobile numbers displayed in `PatientRow` — PII visible to bystanders in shared clinic spaces | D2 | Persona critique MUST FIX / QA M-2 | Use `formatMobile(mobile, true)` (last 5 digits only) in list view. Full number only in D3 post-consent. |
| Clear button touch target is 28×28px; below WCAG AA 44×44px minimum | D2 | Persona critique MUST FIX / QA M-3 | Expand `hitSlop` or increase button size to 44×44. |
| ~~FAB overlaps keypad key 3 in live screen — `position:absolute,bottom:320` fragile across device heights~~ | D2 | Real-device session 2026-02-24 | **CLOSED 2026-02-24** — FAB moved into `fabRow` flex row (flexDirection:row, justifyContent:flex-end) between ScrollView and NumericKeypad; position:absolute removed. Verified on iPhone. |
| `searchPatientsByMobile` LIKE query not prefix-anchored (`%123%`); common digit sequences return noisy results | D2 | QA E-6 | Change to prefix-anchored LIKE pattern (`123%`). |
| Double-tap on `PatientRow` pushes two D3 screens onto navigation stack | D2 | QA E-7 | Add tap-guard ref; disable `onPress` immediately on first tap. |
| "Add New Patient" CTA fires with partial (3–9 digit) query; D5 receives invalid `prefillMobile` | D2 | QA E-8 | Only pass `prefillMobile` if `query.length === 10`. |
| `recentPatients` not refreshed when background sync completes while D2 is active | D2 | QA E-2 | Use `useFocusEffect` to re-run `getRecentPatients` on screen focus. |
| Patient full name displayed at 22pt bold in D3 header — no PII dimming option; visible to bystanders in shared clinic waiting areas | D3 | Persona critique SHOULD FIX | Flagged by Shantabai and Arjun. Address before production: name-dimming gesture or abbreviated display after screen idle timeout. |
| ~~Request Access button has no offline guard — stub fires with no feedback when device is offline~~ | D3 | Security audit MEDIUM | **CLOSED 2026-02-24** — `handleRequestAccess` checks `isOnline` before showing Alert. If offline, shows "Cannot send consent request — no internet connection." `Send Request` option not shown when offline. |
| ~~No consent `accessed` audit event emitted when D3 opens with consent granted — DPDP audit trail incomplete~~ | D3 | Security audit MEDIUM | **CLOSED (SQLite) 2026-02-24** — `logConsentAccess()` in `src/db/visits.ts` writes to `audit_events` table on D3 mount with consent granted. Server flush via `POST /sync` deferred — same as D2 H-3 pre-merge blocker. |
| ~~Full placeholder phone number in code comment — risky pattern for live build~~ | D3 | Security audit MEDIUM | **CLOSED 2026-02-24** — full number not present in live screen. |
| ~~`ScrollView` + `map` for visit list — will OOM on 200+ visits on a 2GB RAM device~~ | D3 | QA H-4 | **CLOSED 2026-02-24** — Live screen uses `FlatList` with `maxToRenderPerBatch={10}`, `windowSize={5}`, `initialNumToRender={10}`, `removeClippedSubviews`. Client-side pagination (20/page). Server-side pagination on `GET /patients/:id/visits` is a remaining TODO (see new MEDIUM item below). |
| ~~No loading or error state for server consent re-fetch — live build will flash wrong variant or crash silently on API failure~~ | D3 | QA H-1 / H-2 | **CLOSED 2026-02-24** — Loading skeleton shown on mount (D3-H-2). Error state: fail secure (no-consent variant) + retry banner. Session expiry (401) redirects to login matching D2 pattern. |
| ~~No dynamic in-screen consent transition — after D9 grants consent, doctor must navigate away and back to see history~~ | D3 | QA H-3 | **CLOSED 2026-02-24** — `useFocusEffect` re-fetches consent + visits on every screen focus. When D9 returns and pushes back to D3, `useFocusEffect` fires, server returns `consent_granted: true`, screen transitions in-place. |
| ~~`recordCount: 0` displays "0 records" pill — confusing; indicates a draft/interrupted visit~~ | D3 | QA M-3 | **CLOSED 2026-02-24** — Live screen: `recordCount === 0 → 'Draft'` with distinct amber pill colour. |
| ~~Patient name has no overflow guard at 22pt — long names wrap and push consent badge off-screen~~ | D3 | QA M-4 | **CLOSED 2026-02-24** — `numberOfLines={1}` + `ellipsizeMode="tail"` on patient name in live screen. |
| ~~Empty state shows "Access Granted" badge — semantically misleading when there are no records to gate~~ | D3 | QA M-5 | **CLOSED 2026-02-24** — No consent badge rendered in empty-state variant. |
| Server-side visit pagination not implemented — `GET /patients/:id/visits` returns all visits; client-side 20-per-page in use | D3 | Live build (QA H-4 follow-on) | Add `?page=&per_page=20` query params server-side. Required before high-volume patient records grow large in production. |
| "View Full Visit" button disabled until D4 (Visit Detail) is built | D3 | Live build (QA M-1) | `onViewFullVisit` prop is a disabled stub with TODO comment. Wire to `navigation.navigate('VisitDetail', ...)` when D4 is built. |
| D9 consent request not yet wired — `handleRequestAccess` sets `consentRequestSent` state but does not navigate to D9 | D3 | Live build | `navigation.navigate('ConsentRequest', ...)` stubbed with TODO comment. Wire when D9 is built. |
| Pull-to-refresh not implemented — reconnecting while D3 is open requires navigate-away-and-back for fresh server data | D3 | Live build | `useFocusEffect` handles focus re-fetches. Add `RefreshControl` on FlatList for in-screen refresh before D4. |
| ~~D3 visit list does not show locally-created visits from visits_draft — new visit from D6 appears in D3 only after server sync~~ | D3/D6 | D6 live build | **CLOSED 0c4d204** — `getCachedVisits` now UNIONs `visits_draft`; `sync_status: 'synced' \| 'draft'` added to `LocalVisit`; cloud icon shown in VisitCard for draft rows. |
| ~~**D6 security audit not yet run — run before device testing begins.**~~ | D6 | D6 live build | **CLOSED 2026-03-02** — All CRITICAL and HIGH findings fixed (commits `04f3e99`, `831f0dc`, `f888874`, `fb9b766`). 6 MEDIUM + 2 LOW open — tracked in D6 security audit sections below. |
| ~~**CRITICAL — Sync worker session:** `createVisit()` server response not used to update `visits_draft.server_id` + `sync_status`, and `sync_queue` entry not marked `status='success'` after a successful direct API call. Without this fix, the sync worker will re-POST visits that D6 already uploaded, creating server duplicates.~~ | D6 | D6 live build / PM sync review | **CLOSED 2026-03-13** — `markVisitSynced()` + `UPDATE sync_queue SET status='success'` were already present in NewVisitScreen.tsx handleSave() lines 347-354, applied in commit `c36f43e`. Confirmed during sync worker Builder session. |
| `@react-native-community/datetimepicker` not in package.json (bundled with Expo SDK 54, not explicit) | D6 | D6 live build | If TypeScript errors: run `npx expo install @react-native-community/datetimepicker`. |
| ~~`KeyboardAvoidingView` not implemented in D6 — two consequences found during device testing: (1) Save Visit button hidden behind keyboard when note field is active; (2) note text field scrolls out of view while typing — doctor cannot see what they are typing.~~ | D6 | Device testing | **CLOSED 2026-03-03** — `KeyboardAvoidingView` wrapping full screen content with `behavior='padding'` on iOS and `behavior='height'` on Android. |

### MEDIUM — D6 live screen security audit

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**MEDIUM-1:** `consentGranted` nav param stored without re-verification at save time — stale consent value may be written to `visits_draft` and sent to server~~ | D6 | D6 security audit | **CLOSED** — `getPatientByLocalId(db, patientId)` called at the start of `handleSave()` before any write; `freshConsentGranted` used for `insertLocalVisit`, `enqueueOperation`, and `createVisit` instead of the nav param. |
| ~~**MEDIUM-2:** Full patient mobile number rendered in D6 header — PII visible to bystanders in shared clinic spaces~~ | D6 | D6 security audit | **CLOSED 2026-03-03** — `maskedMobile = patientMobile.slice(-5)` with `•••••` prefix; header subtitle now shows masked number, matching D2/D3 pattern. |
| ~~**MEDIUM-3:** Attached scan silently dropped on save — `scan.localPath` and `scan.label` never written to any storage layer~~ | D6 | D6 security audit | **CLOSED 2026-03-05** — D7 live build adds `updateVisitScan()` to `src/db/visits.ts`; D7 `handleUseThis` calls `updateVisitScan(db, visitId, savedPath, selectedType)` + `enqueueOperation` inside `db.withTransactionAsync()`. Scan path + label now reach `visits_draft` and sync queue atomically. |
| ~~**MEDIUM-4:** `insertLocalVisit()` and `enqueueOperation()` not wrapped in a transaction — UNIQUE constraint violation on retry leaves sync queue entry without a matching `visits_draft` row~~ | D6 | D6 security audit | **CLOSED** — both calls (plus `logVisitCreated`) wrapped in `db.withTransactionAsync()` in `handleSave()`. They succeed or fail atomically. |
| ~~**MEDIUM-5:** `getCachedVisits` UNION query filters `visits_draft` on `patient_server_id = ?` — offline-only patients with `NULL patient_server_id` return zero draft rows in D3~~ | D6 | D6 security audit | **CLOSED** — `getCachedVisits` signature updated to `(db, patientServerId: string \| null, patientLocalId: string, doctorId)`. `visits_draft` WHERE clause now: `doctor_id = ? AND (patient_server_id = ? OR (patient_server_id IS NULL AND patient_id = ?))`. Both D3 call sites updated. |
| ~~**MEDIUM-6:** Unsynced draft visits deleted on logout without warning — silent, irreversible data loss for visits not yet synced to server~~ | D6 | D6 security audit | **CLOSED** — `countPendingDraftVisits()` added to `src/db/visits.ts`; called in `useLogout` before any data is cleared. If count > 0, `Alert.alert` requires explicit "Log out" confirmation. Doctor can choose "Stay logged in" to abort without state change. |

### LOW — D6 live screen security audit

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**LOW-1:** `isSavingRef.current` never reset on success path — Save button permanently locked if `navigation.goBack()` fails to unmount the screen~~ | D6 | D6 security audit | **CLOSED** — `isSavingRef.current = false` reset immediately before `navigation.goBack()` on success path. |
| ~~**LOW-2:** Visit date validation enforced only at picker layer, not at save time in `handleSave()` — future-dated visits possible via state manipulation~~ | D6 | D6 security audit | **CLOSED** — Guard added at top of `handleSave()`: `if (visitDate > todayISO())` sets `saveError` and returns early with ref/state reset. |

### BLOCKED — D7 device testing

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D7-DEVICE-1:** Camera save fix applied but not yet device-confirmed.~~ | D7 | Device testing 2026-03-06 | **CLOSED 2026-03-06** — All 95 checklist items confirmed or deferred on iPhone. Camera capture, photo library, offline save, discard guard, D6 integration all confirmed working. |

### MEDIUM — D7 live screen security audit v2

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**MEDIUM-1:** No `record_created` audit event written to `audit_events` when a scan is saved~~ | D7 | D7 security audit v2 | **CLOSED 2026-03-05** — `logScanCreated()` added to `src/db/scans.ts`; called inside `withTransactionAsync` in D7 `handleUseThis` after `insertVisitScan()`. Writes `scan_created` event with `scanId`, `visitId`, `label` in metadata. |

### LOW — D7 live screen security audit v2

| Item | Screen | Source | Notes |
|---|---|---|---|
| **LOW-1:** `queueOcrAsync` receives `absolutePath` parameter — when OCR is wired in v2, developer may use the passed absolute path instead of reading `scans.local_path` + `resolveScanPath()`, reintroducing KFM-3 path drift | D7 | D7 security audit v2 | Rename stub parameter to `_scanId`; document that OCR worker must query `scans` table and call `resolveScanPath()`. |
| **LOW-2:** `user?.id ?? ''` fallback at lines 262/266/282/287 is dead code after auth guard — if guard is bypassed by future refactor, scans land in unscoped `{documentDirectory}/scans/` root | D7 | D7 security audit v2 | Extract `const doctorId = user.id` at top of `handleUseThis`; assert non-empty; replace all `user?.id ?? ''` uses. |
| **LOW-3:** `sanitizeOcrText` regex does not cover non-breaking space (`\u00A0`) between Aadhaar digit groups — inherited from mockup audit LOW-2 | D7 | D7 security audit v1 LOW-2 | Change `\s?` to `[\s\u00A0]*`. Fix before OCR is wired. |

### SHOULD FIX — D7 persona critique (before live build)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D7-SF-1:** No document type label at capture time — all scans saved as "Document – [date]"; indistinguishable when multiple scans attached to a visit in D4/D8~~ | D7 | Persona critique v1 2026-03-05 | **CLOSED 2026-03-05** — `DocTypeSelector` added to `D7PreviewState` and `D7PhotoLibraryPreviewState`. `handleUseThis` returns `{ localPath, label: selectedType }`. Commit `f84c947`. |
| ~~**D7-SF-2:** "Use Photo Library" → preview transition not shown as a mockup state~~ | D7 | Persona critique v1 2026-03-05 | **CLOSED 2026-03-05** — `D7PhotoLibraryPreviewState` export added. Commit `f84c947`. |
| ~~**D7-SF-3:** Exposure indicator advisory nature not communicated — "Too Dark" state may cause first-time users to believe capture is blocked~~ | D7 | Persona critique v1 2026-03-05 | **CLOSED 2026-03-05** — "Tap to capture anyway" sub-label added to TooDark and Overexposed viewfinder states. Commit `f84c947`. |
| ~~**D7-SF-4:** `captureAdvisory` violates Rule 10 — text "Tap to capture anyway" uses `Colors.textSecondary` (#64748B) with no dark pill background, directly on live camera feed~~ | D7 | Persona critique v2 2026-03-05 | **CLOSED 2026-03-05** — `captureAdvisoryPill: { backgroundColor:'rgba(0,0,0,0.55)', borderRadius:12 }` + `captureAdvisoryText: { color: Colors.surface }` in live screen. |
| ~~**D7-SF-5:** `privacyLine` uses `Colors.textSecondary` (#64748B) on dark preview background (#000000) — borderline contrast (≈4.59:1), inconsistent with all other preview-screen text~~ | D7 | Persona critique v2 2026-03-05 | **CLOSED 2026-03-05** — `privacyLine: { color:'rgba(255,255,255,0.55)' }` in live screen, matching `cropHint` and preview text conventions. |
| ~~**D7-SF-6:** No scan count indicator on D7 re-entry — Sunita cannot see how many scans are already attached when returning to D7 for a second scan in the same visit~~ | D7 | Persona critique v2 2026-03-05 | **CLOSED 2026-03-05** — `existingScanCount?: number` param added to `RootStackParamList['DocumentScanner']`; pill shown in viewfinder top bar when count > 0. |

### CRITICAL — D7 mockup security audit (all closed)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D7-C-1:** Auth guard placed BEFORE hooks in 4 of 5 variants — React Rules of Hooks violation~~ | D7 | D7 security audit CRITICAL-1 | **CLOSED 2026-03-04** — Guard moved after all hooks in all 5 variants. |
| ~~**D7-C-2:** `visitId` not validated non-null before scan write — orphaned sensitive image risk~~ | D7 | D7 security audit CRITICAL-2 | **CLOSED 2026-03-04** — `visitId` stub + `ErrorState` guard added to `D7PreviewState`. |

### HIGH — D7 mockup security audit (all closed)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D7-H-1:** `sanitizeOcrText()` defined but never called — no demonstrated call site~~ | D7 | D7 security audit HIGH-1 | **CLOSED 2026-03-04** — `queueOcrAsync()` stub added showing `sanitizeOcrText()` at SQLite write boundary. |

### MEDIUM — D7 mockup security audit (all closed)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D7-M-1:** `console.log` at `D7PreviewState` line 569 logs `result.label` — PII risk in live build~~ | D7 | D7 security audit MEDIUM-1 | **CLOSED 2026-03-04** — `console.log` removed; replaced with comment. |
| ~~**D7-M-2:** `mockUseThis` uses `Date.now()` for filename — should use `randomUUID()`~~ | D7 | D7 security audit MEDIUM-2 | **CLOSED 2026-03-04** — `Date.now()` replaced with hardcoded mock UUID; comment references `expo-crypto`. |

### LOW / SHOULD FIX

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~Web preview keyboard input requires click-first-to-focus workaround~~ | web-preview | Infrastructure session 2026-02-20 | **CLOSED 2026-02-20** — `document.activeElement.blur()` added at end of `keyPress()` in `web-preview/D2.html`; physical keyboard works immediately after any button click. |
| ~~Web preview FAB overlap in has-data state~~ | web-preview | Infrastructure session 2026-02-20 | **CLOSED 2026-02-20** (session 2) — FAB hidden in has-data/no-match states via `setState()`; only visible in empty + offline states. Prior fix (flex row placement) was structural but FAB still appeared on screen. |
| ~~Web preview search bar click has no visual feedback~~ | web-preview | Infrastructure session 2026-02-20 | **CLOSED 2026-02-20** — `activateSearch()` adds `focused` class on click; blinking `|` cursor shown via CSS `::after` pseudo-element; cleared on first keypress, restored on clear. |
| ~~Web preview root URL shows directory listing~~ | web-preview | Infrastructure session 2026-02-20 | **CLOSED 2026-02-20** — `web-preview/index.html` added with meta-refresh redirect to `D2.html`; `http://localhost:3000/` now redirects automatically. |
| ~~Button overlap — root cause is duplicate new patient buttons visible simultaneously. Fix is visibility logic not positioning: show inline card when results exist, show FAB only when no results or empty state. Never show both together.~~ | D2 | Persona critique | **CLOSED 6a58a97** — FAB hidden in has-data state; `showFab = !isTyping \|\| showNoMatch` in live screen; `screenState !== 'has-data'` in mockup; CSS/JS updated in web preview. |
| ~~Search bar focus indicator — cursor appeared on right of placeholder instead of left; blue focus border lost on backspace; no cursor after last typed digit~~ | web-preview | Session 2026-02-22 | **CLOSED 5a95bed, 634c50c** — `::after` → `::before` on placeholder for left-aligned cursor; `active` class retained on backspace in `keyPress()`; `::after` added on `.search-bar.active .search-text` for cursor after typed digits. |
| ~~Real device: search bar no blue border on tap; no cursor visible before first digit~~ | D2 mockup | Real device session 2026-02-22 | **CLOSED 14b6894** — `isFocused` state added to root; `SearchBar` wrapped in `TouchableOpacity`; blue border (`searchBarActive`) and `BlinkingCursor` (Animated loop) shown on tap before any digit typed. Confirmed on iPhone. |
| ~~Real device: tapping outside search bar did not clear focus or grey border~~ | D2 mockup | Real device session 2026-02-22 | **CLOSED 5aa5ff1** — screen `View` wrapped in `TouchableWithoutFeedback`; outside tap calls `setIsFocused(false)` + `Keyboard.dismiss()`; inner touchables (keys, search bar, rows) handle their own events and do not propagate. Confirmed on iPhone. |
| ~~Real device: blinking cursor not visible after last typed digit~~ | D2 mockup | Real device session 2026-02-22 | **CLOSED 5aa5ff1** — `searchTypedRow` flex row wraps typed text + `BlinkingCursor`; `flex:0` on text node lets cursor sit flush after last digit. Confirmed on iPhone. |
| ~~Real device: FAB overlapping keypad key 3 (top-right key)~~ | D2 mockup | Real device session 2026-02-22 | **CLOSED 14b6894** — FAB removed from `position:absolute, bottom:320`; moved into `fabRow` View (`flexDirection:row, justifyContent:flex-end`) between ScrollView and NumericKeypad; never overlaps keys regardless of screen height. Confirmed on iPhone. |
| No combined offline + searching state | D2 | Persona critique | Mockup handles offline or searching but not both simultaneously; composite state needed |
| No name search — mobile-only lookup frustrates staff and tech-savvy doctors | D2 | Persona critique | Locked design decision (mobile as primary key); flag for product discussion before D3 build |
| Certificate pinning absent from API client | D2 | Security audit H-2 | Tracked above as pre-merge blocker. |
| Offline patient access generates no audit log | D2 | Security audit H-3 / QA E-9 | Tracked above as pre-merge blocker. |

### HIGH — Sync worker security audit (fix before device testing)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**SW-H-1:** `sync_queue` drain loop reads ALL pending entries — not filtered by `doctor_id`. If `clearDoctorSyncQueue()` fails silently on logout, Doctor A's entries are sent under Doctor B's JWT.~~ | Sync Worker | Security audit H-1 | **CLOSED 2026-03-13** — `doctor_id` passed into `runSyncWorker()`; `AND doctor_id = ?` added to drain SELECT and startup in_progress reset UPDATE. |
| ~~**SW-H-2:** `tryRefreshToken` does not store the new refresh token returned by the server. When the server rotates the token (spec requirement), the new token is silently dropped. Next refresh attempt uses the now-invalidated old token and silently aborts all future syncs.~~ | Sync Worker | Security audit H-2 | **CLOSED 2026-03-13** — `refresh_token?: string` added to `RefreshResponse` interface; `SecureStore.setItemAsync(REFRESH_TOKEN_KEY, body.refresh_token)` called after auth store update when token present. |
| ~~**SW-H-3:** `flushAuditEvents` reads ALL unsynced audit events — not filtered by `doctor_id`. Audit events from Doctor A's session could be transmitted under Doctor B's JWT, misattributing access records.~~ | Sync Worker | Security audit H-3 | **CLOSED 2026-03-13** — `AND doctor_id = ?` added to `flushAuditEvents` SELECT; `doctor_id` threaded from same H-1 fix. |

### MEDIUM — Sync worker security audit

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**SW-M-1:** Audit events never flush when `sync_queue` is empty. `batchSucceeded` gate prevents the flush in read-only sessions (e.g., doctor only views records, no new visits). DPDP §8 requires server-side audit trail for access events.~~ | Sync Worker | Security audit M-1 | **CLOSED 2026-03-13** — `if (batchSucceeded)` gate removed; `flushAuditEvents` called unconditionally and returns immediately if nothing to flush. |
| **SW-M-2:** `hasResetInProgress` module-level flag is never reset on doctor change. If Doctor B logs in within the same app process lifetime, the in_progress startup cleanup does not run for their first sync session. | Sync Worker | Security audit M-2 | Reset `hasResetInProgress` in the `useLogout` sequence, or tie it to a session counter in `useAuthStore`. |

### LOW — Sync worker security audit

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**SW-L-1 / D1-SA2-L-1:** `ACCESS_TOKEN_KEY` exported in `constants.ts` but unused — ambiguity about access token persistence.~~ | `src/auth/constants.ts` | Security audit v2 L-1 | **CLOSED 2026-03-16** — constant removed; replaced with a comment block explicitly stating access token is in-memory Zustand only and must not be stored. |
| **SW-L-2:** Mid-sync logout does not abort the in-flight run. The `?? currentToken` fallback on token re-read means `clearAuth()` during a sync run does not stop the current batch. | Sync Worker | Security audit L-2 | Remove the `?? currentToken` fallback; treat null token mid-run as an abort signal. |

### MUST FIX — D1 persona critique (all closed 2026-03-16)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D1-PC-MF-1:** Silent OTP-send failure — `catch` block in `handleSendOtp()` resets to `phone_entry` with no error message.~~ | D1 | Persona critique MF-1 | **CLOSED 2026-03-16** — `sendError` state added; "Couldn't send OTP" message shown in catch. |
| ~~**D1-PC-MF-2:** Auto-dismiss OTP-sent banner after 4s — no spec anchor.~~ | D1 | Persona critique MF-2 | **CLOSED 2026-03-16** — `setTimeout` removed; banner dismissed on first OTP keystroke. |
| ~~**D1-PC-MF-3:** Expired-OTP countdown dead-end — Resend locked behind countdown on `otp_expired`.~~ | D1 | Persona critique MF-3 | **CLOSED 2026-03-16** — `setCanResend(true)` called immediately on `otp_expired`. |

### SHOULD FIX — D1 persona critique (all closed 2026-03-16)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D1-PC-SF-1:** No explanatory context before OTP step.~~ | D1 | Persona critique SF-1 | **CLOSED 2026-03-16** — Guidance line "We'll send a 6-digit code to this number." added below phone input. |
| ~~**D1-PC-SF-2:** Text sizes too small for P1 (elderly patient) reuse — `inputLabel` 14px and `errorText` 13px.~~ | D1 | Persona critique SF-2 | **CLOSED 2026-03-16** — `inputLabel` raised to 16px, `errorText` raised to 14px. |

### MEDIUM — D1 Login mockup (fix before launch)

| Item | Screen | Source | Notes |
|---|---|---|---|
| **D1-M-1:** Android SMS OTP autofill not implemented — doctors manually transcribe OTP under consultation time pressure. | D1 | PM review §2 (Required, not optional) | No Expo managed-workflow module exists as of 2026-03. Options: (a) eject to bare workflow + `react-native-otp-verify`; (b) wait for an `expo-modules-core` community module; (c) ship without it and accept the gap. iOS autofill works via `textContentType="oneTimeCode"` (no code needed). Decision needed before D1 goes live. |
| **D1-M-2:** Demo state switcher block must be removed before production launch. | D1 | Builder decision | Located at bottom of `LoginScreen.tsx`. Clearly marked `REMOVE BEFORE PRODUCTION LAUNCH`. |

### HIGH — D1 security audit v2 (fix before device testing)

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D1-SA-H-1:** Demo block not guarded by `__DEV__` — exposes mock bypass codes in all builds.~~ | D1 | Security audit v1 H-1 | **CLOSED 2026-03-16** — demo block JSX wrapped in `{__DEV__ && (...)}`. |
| ~~**D1-SA-H-2:** Refresh token never written to `expo-secure-store` in login flow.~~ | D1 | Security audit v1 H-2 | **CLOSED 2026-03-16** — `SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refresh_token)` in `LoginScreen.tsx:218` before `setAuth()`. |
| ~~**D1-SA-H-3:** No session restoration on cold-start.~~ | D1 | Security audit v1 H-3 | **CLOSED 2026-03-16** — `restoreSession()` implemented in `App.tsx:120–158`. |
| ~~**D1-SA2-H-1:** `restoreSession()` in `App.tsx` blanket-catches all errors — deletes refresh token on network errors, not only on auth failures (401/403).~~ | App.tsx | Security audit v2 H-1 | **CLOSED 2026-03-16** — catch clause now checks `err instanceof ApiError && (err.status === 401 \|\| err.status === 403)` before clearing credentials. Network errors preserve the refresh token. `ApiError` imported explicitly. |

### MEDIUM — D1 security audit

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D1-SA-M-1:** Phone number not validated for valid Indian mobile prefix (6–9). `handleSendOtp` only checks length.~~ | D1 | Security audit v1 M-1 | **CLOSED 2026-03-16** — `parseInt(phone[0]) < 6` guard added; input layer rejects 0–5 with inline error. |
| ~~**D1-SA-M-2:** No `useRef` double-submit guard on Verify OTP.~~ | D1 | Security audit v1 M-2 | **CLOSED 2026-03-16** — `isVerifyingRef = useRef(false)` added; matches D6 `isSavingRef` pattern. |
| ~~**D1-SA-M-3:** WhatsApp fallback button has no client-side rate limiting during active countdown.~~ | D1 | Security audit v1 M-3 | **CLOSED 2026-03-16** — `disabled={!canResend}` added; same gate as Resend OTP. |
| ~~**D1-SA2-M-1:** Cold-start session restoration (successful and failed) is not logged to `audit_events`. `App.tsx` runs before `SQLiteProvider` so DB is inaccessible at that stage. F-9 partially unsatisfied.~~ | App.tsx | Security audit v2 M-1 | **ACCEPTED GAP 2026-03-16 — Option B:** Rely on server-side `POST /auth/refresh` audit trail for cold-start events. No code change needed. Local cold-start audit gap is documented technical debt, to be addressed post-v1 if audit requirements demand local coverage. |

### LOW — D1 security audit

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**D1-QA-M-1:** Network error during `verifyOtp` shows "Incorrect OTP" — misleading; doctor may exhaust TOO_MANY_ATTEMPTS retrying a valid OTP.~~ | D1 | QA v2 M-1 | **CLOSED 2026-03-16** — `null`-code branch added in `handleVerifyOtp` catch; `OtpError` type extended with `'no_connection'`; distinct "No internet connection" message shown. Security re-check: CLEAR. |
| ~~**D1-QA-M-2:** `handleSendOtp` has no synchronous double-submit guard — rapid double-tap can launch two concurrent `POST /auth/send-otp` calls; `otpToken` state becomes whichever call resolves last.~~ | D1 | QA v2 M-2 | **CLOSED 2026-03-16** — `isSendingRef = useRef(false)` added; reset in all exit paths (offline early-return, try success, catch). Mirrors `isVerifyingRef` pattern. Security re-check: CLEAR. |
| **D1-QA-M-3:** Resend failure during `otp_entry` phase reverts UI to `phone_entry` — doctor loses OTP entry card even though the existing `otpToken` is still valid. | D1 | QA v2 M-3 | Track call origin; stay in `otp_entry` on resend failure and surface inline resend error. `LoginScreen.tsx:192–194`. |
| **D1-SA-L-1:** Mock JWT `'mock-jwt-eyJhbGciOiJIUzI1NiJ9.mockpayload'` superficially resembles a real token (base64 header decodes to `{"alg":"HS256"}`). | D1 | Security audit L-1 | Replace with obviously fake placeholder: `'mock-token-not-real'`. |
| **D1-SA-L-2:** Resend OTP and WhatsApp buttons lack explicit `disabled` prop during loading phase — implicit only via conditional render. | D1 | Security audit L-2 | Add `disabled={phase === 'loading'}` explicitly to both buttons for clarity. |

---

## Rejected Ideas (Do Not Re-Propose)
| Idea | Why Rejected |
|---|---|
| Voice-based input for doctors | Core product principle: avoid new habits for doctors |
| Multi-doctor simultaneous edit | Structurally impossible given visit model; unnecessary complexity |
| Appointment scheduling in v1 | Out of scope; adds complexity without core value |
| Password-based auth | OTP is lower friction and reduces credential theft surface |
| Multi-staff concurrent editing | Out of scope. Visits are sequential append-only containers. A visit is owned by the opening doctor; staff can attach scans as separate record entries but cannot edit doctor notes. No locking mechanism needed — in practice, staff act sequentially on one device, not simultaneously. |

---

## GitHub Repository

**Repo URL:** https://github.com/rdevarakond88/medrecord
**Visibility:** Private — standalone repository, not a fork, not connected to any other project
**Primary branch:** `main`
**Branch strategy:**
- `main` — stable, reviewed code only
- `dev` — active development; all Claude Code sessions commit here
- Feature branches named: `feature/screen-d2-patient-search`, `feature/sync-queue`, etc.

**Commit convention:**
```
[screen/feature] short description

e.g.
[D2] Add patient search screen mockup
[sync] Implement offline queue processor
[security] Add consent check to visit endpoint
[docs] Update project-state after D2 approval
```

**What gets committed:**
- All `/docs` markdown files (always up to date)
- All `/agents` markdown files
- All source code
- `project-state.md` updated at end of every session

**What never gets committed:**
- `.env` files (secrets, API keys)
- `node_modules`
- Build artifacts (`/dist`, `/.expo`)
- Any file containing real patient data

---

## Environment Setup Notes

### Mobile testing — iPhone via Expo Go (WSL2 Windows)
- Run: `npm start` — kills port 8082, starts Metro on 8082, opens ngrok tunnel
- Port 8081 is permanently blocked by Windows Hyper-V reservation (bleeds into WSL2; unfixable)
- `--host lan` abandoned: WSL2 LAN IP (172.x.x.x) is not reachable from iPhone
- `--tunnel` (ngrok) is the only reliable approach on WSL2; `@expo/ngrok` in devDependencies
- URL format: `exp://xxxx-anonymous-8082.exp.direct` — changes every session (ngrok free tier)
- See `START-DEV.md` in project root for full instructions

### Web Preview (WSL2 Windows)
- Pure-HTML preview tool at `web-preview/D2.html` — NOT an Expo build
- Expo web bundle approach abandoned: react-native-web + Metro dev server
  fails silently on WSL2 (lazy module loading + WebSocket issues)
- Run preview: `npm run web` → open http://localhost:3000/ (redirects to D2.html) or http://localhost:3000/D2.html directly
- Expo SDK 54 / React 19 / RN 0.81.5 installed (package.json)
- app.json: web.bundler=metro, web.output=single

## Dependency Versions

### Expo / React Native (installed)
- `expo` ~54.0.33
- `react` 19.1.0
- `react-dom` 19.1.0
- `react-native` 0.81.5
- `react-native-web` ~0.21.2
- `@expo/metro-runtime` ~6.1.2

### Required by D2 live screen (add to package.json if not present)
- `expo-sqlite` (^14.x — async API with useSQLiteContext)
- `expo-crypto` (^13.x — randomUUID)
- `@tanstack/react-query` (^5.x)
- `@react-native-community/netinfo` (^11.x)
- `@react-navigation/native` (^6.x)
- `zustand` (^4.x)
