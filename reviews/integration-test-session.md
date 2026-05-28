# Integration Test Session
**Date:** 2026-05-17
**Agent:** Integration Tester
**Step:** 27 — Connected doctor-patient scenarios

## Infrastructure Pre-flight
| Check | Result |
|---|---|
| Backend `/health` curl (WSL2) | HTTP 200 ✅ — cold-started (31s); warm after health check |
| Backend OTP endpoint (curl) | HTTP 200 ✅ — `{"mobile_number":"9999999999","role":"doctor","channel":"sms"}` accepted |
| Phone Safari `/health` | HTTP 200 ✅ — phone can reach backend |
| Doctor credentials | 9999999999 / OTP 000000 ✅ |
| Patient credentials | 8888888888 / OTP 000000 ✅ |
| `__DEV__` "Patient App →" button | Present ✅ |
| ngrok tunnel | Fixed — ngrok v3 binary + @expo/ngrok compatibility patches applied ✅ |

Pre-flight: **BLOCKED — 2 critical pre-condition bugs found before Scenario 1 could start**

---

## Scenario Results

| # | Scenario | Result | Notes |
|---|---|---|---|
| 1 | Doctor creates new patient → patient can log in | BLOCKED | BUG-IT-PRE-1 |
| 2 | Doctor creates visit → patient sees it in timeline | BLOCKED | BUG-IT-PRE-1 + BUG-IT-PRE-2 |
| 3 | Doctor requests consent → patient sees pending request | BLOCKED | BUG-IT-PRE-1 + BUG-IT-PRE-2 |
| 4 | Patient grants access → doctor sees records | BLOCKED | BUG-IT-PRE-1 + BUG-IT-PRE-2 |
| 5 | Patient denies access → doctor cannot see records | BLOCKED | BUG-IT-PRE-1 + BUG-IT-PRE-2 |
| 6 | Patient revokes access → doctor loses access | BLOCKED | BUG-IT-PRE-1 + BUG-IT-PRE-2 |
| 7 | Doctor creates visit after consent → patient sees it | BLOCKED | BUG-IT-PRE-1 + BUG-IT-PRE-2 |

---

## Bugs Found

### BUG-IT-PRE-1: `pinnedFetch` uses SSL-pinning path in Expo Go — all API calls fail
**Severity:** CRITICAL
**Scenario:** Pre-condition — blocks all 7 scenarios (doctor login fails)
**Steps to reproduce:**
  1. Start Expo Go with Expo tunnel
  2. Attempt doctor login: enter 9999999999 → tap Send OTP
  3. "Couldn't send OTP. Please check your connection and try again." error shown
**Expected:** OTP sent; OTP entry screen shown
**Actual:** `pinnedFetch` throws before any HTTP request completes
**Root cause:**
- `require('react-native-ssl-pinning')` does NOT throw in Expo Go because the `q` npm dependency is installed — the JS module loads successfully and `sslFetch` is set to the module's `fetch` function
- `NativeModules.RNSslPinning` is `null` in Expo Go (native module not built in)
- When `sslFetch(url, ...)` is called, it executes `RNSslPinning.fetch(...)` which throws `TypeError: Cannot read properties of null (reading 'fetch')`
- This exception propagates to `handleSendOtp` catch block → `send_failed` error displayed
**Fix required in:** `src/api/pinnedFetch.ts`
- Add `NativeModules.RNSslPinning` availability check before setting `sslFetch`:
  ```typescript
  import { NativeModules } from 'react-native';
  let sslFetch: typeof fetch | null = null;
  try {
    if (NativeModules.RNSslPinning) {
      sslFetch = require('react-native-ssl-pinning').fetch;
    }
  } catch { /* ... */ }
  ```
**Why not caught earlier:** D1 device testing ran before `react-native-ssl-pinning` was added (May 10). P1–P5 device testing used `mockSendOtp` so never reached `pinnedFetch`.
**Screens involved:** All screens using `pinnedFetch` — D1 login, D2/D3/D6 API calls, D9 consent flow, P1 patient login (once wired)

---

### BUG-IT-PRE-2: Patient login (P1) never wired to real API — still a mockup
**Severity:** CRITICAL
**Scenario:** Pre-condition — blocks Scenarios 2–7 (patient side)
**Steps to reproduce:**
  1. Navigate to PatientLoginScreen (via __DEV__ button)
  2. Enter any phone number + OTP → "login succeeds" regardless
  3. Patient app loads with mock user data (id: "mock-patient-id-001", fake tokens)
**Expected:** Real OTP sent to phone; real patient JWT returned; real patient data loaded
**Actual:** `mockSendOtp()` returns a fake token; `mockVerifyOtp()` returns `{ access_token: 'mock_patient_access_token', ... }`; all subsequent patient API calls use this fake token and return 401 from the real backend
**Root cause:**
- The wire step for P1–P5 patient screens was never added to the orchestration plan
- `PatientLoginScreen.tsx` still contains `mockSendOtp` / `mockVerifyOtp` functions defined inline
- The 54/54 device test pass was testing mockup UI behavior (which always succeeds), not real API integration
**Fix required in:** `src/screens/patient/PatientLoginScreen.tsx`
- Remove `mockSendOtp` and `mockVerifyOtp` inline functions
- `sendOtp` in `src/api/auth.ts` is hardcoded with `role: 'doctor'` — Builder must add a `role` parameter or a separate `sendPatientOtp` function that sends `role: 'patient'`
- Wire `handleSendOtp` to call real `sendOtp(phone, channel)` with `role: 'patient'`
- Wire `handleVerifyOtp` to call real `verifyOtp(otpToken, otp)` — this is already role-agnostic
- Store real JWT tokens in SecureStore (check if patient token storage keys match what P2–P5 read)
**Screens involved:** P1 (login), and transitively P2–P5 (all use the fake token for API calls)

---

## Session End

**0 of 7 scenarios PASS. 0 FAIL. 7 BLOCKED.**

**2 bugs found:**
- BUG-IT-PRE-1: CRITICAL — pinnedFetch SSL-pinning path active in Expo Go; all doctor API calls fail
- BUG-IT-PRE-2: CRITICAL — PatientLoginScreen still uses mock functions; patient side never wired

**Builder Agent session required before re-run — items:**
- BUG-IT-PRE-1: Fix `src/api/pinnedFetch.ts` — guard `sslFetch` assignment with `NativeModules.RNSslPinning` check
- BUG-IT-PRE-2: Wire `src/screens/patient/PatientLoginScreen.tsx` to real API; add `role` param to `sendOtp` in `src/api/auth.ts`

After Builder fixes: re-run all 7 scenarios (all were blocked at pre-condition, none partially completed).

**SESSION COMPLETE — Next: Builder Agent — fix BUG-IT-PRE-1 + BUG-IT-PRE-2**

---

## Re-run — 2026-05-27 — All 7 scenarios

**Date:** 2026-05-27
**Agent:** Integration Tester
**Step:** 27-rerun — Re-run after BUG-IT-PRE-1 + BUG-IT-PRE-2 fixes

### Infrastructure Pre-flight
| Check | Result |
|---|---|
| Backend `/health` curl | HTTP 200 ✅ |
| Metro bundler | Running on 8082 ✅ |
| ngrok tunnel | Active ✅ |
| Doctor credentials (9999999999 / 000000) | Login confirmed ✅ — reached D2 |
| Patient credentials (8888888888 / 000000) | Login confirmed ✅ — reached P2 |
| `__DEV__` "Patient App →" button | Present ✅ |
| BUG-IT-PRE-1 fix verified | Doctor login works — pinnedFetch Expo Go guard active ✅ |
| BUG-IT-PRE-2 fix verified | Patient login hits real API — reached P2 with real credentials ✅ |

Pre-flight: **PASS**

---

### Scenario Results

| # | Scenario | Result | Notes |
|---|---|---|---|
| 1 | Doctor creates new patient → patient can log in | FAIL | BUG-IT-1 |
| 2 | Doctor creates visit → patient sees it in timeline | FAIL | BUG-IT-2 |
| 3 | Doctor requests consent → patient sees pending request | BLOCKED | BUG-IT-3 |
| 4 | Patient grants access → doctor sees records | BLOCKED | BUG-IT-3 |
| 5 | Patient denies access → doctor cannot see records | BLOCKED | BUG-IT-3 |
| 6 | Patient revokes access → doctor loses access | BLOCKED | BUG-IT-3 |
| 7 | Doctor creates visit after consent granted → patient sees it | FAIL | BUG-IT-2 |

---

### Bugs Found

#### BUG-IT-1: Patient OTP login fails for doctor-created patient
**Severity:** HIGH
**Scenario:** 1 — Doctor creates new patient → patient can log in
**Steps to reproduce:**
  1. Doctor (D5) creates new patient with mobile 6543210987
  2. Patient side: enter 6543210987 → Send OTP → OTP entry screen appears
  3. Enter 000000 → "OTP is incorrect. Please check and try again."
**Expected:** Login succeeds; P2 timeline loads (empty)
**Actual:** OTP verification rejected with bypass code 000000
**Root cause candidates:**
  (a) Patient 6543210987 not yet synced to server — only in local SQLite; backend
      sends a real OTP but TEST_OTP_BYPASS only works for patients already in the DB
  (b) TEST_OTP_BYPASS only applies to seeded test patients (8888888888, 9999999999)
**Screens involved:** D5 → P1

---

#### BUG-IT-2: Doctor-created visit does not appear in patient P2 timeline
**Severity:** HIGH
**Scenario:** 2 and 7 — Doctor creates visit → patient sees it in timeline
**Steps to reproduce:**
  1. Doctor logs in, opens patient 8888888888 in D3 (consent active)
  2. Doctor creates new visit via D6 with chief complaint "Integration test visit"
  3. Visit confirmed visible in D3 (no cloud icon, "Draft" label = recordCount 0) and in D4
  4. Patient logs in → P2 My Records tab → empty
  5. P2 has no pull-to-refresh
  6. Repeated in Scenario 7 with chief complaint "Scenario 7 integration test" — same result
**Expected:** New visit appears in patient P2 My Records with chief complaint visible
**Actual:** P2 My Records is empty; visit visible on doctor side only
**Root cause candidate:** Visit still in visits_draft on doctor side (not yet POSTed to server);
  GET /patient/timeline only returns server-side visits; sync worker did not run before
  doctor logged out / force-quit
**Screens involved:** D6 → P2

---

#### BUG-IT-3: Consent state inconsistent between D3 (doctor) and P4 (patient)
**Severity:** CRITICAL
**Scenario:** Blocks Scenarios 3, 4, 5, 6
**Steps to reproduce:**
  1. Doctor logs in → searches 8888888888 → D3 shows "Access Granted" badge (green)
  2. Patient logs in → P4 "Doctors" tab → lists Dr. Anand Krishnamurthy, Dr. Meenakshi Air,
     Dr. Rajesh Sharma (pending) — Doctor Test Doctor absent
**Expected:** If consent is active for Doctor Test Doctor, that doctor appears in P4 "Your Doctors"
  with a "Remove Access" button
**Actual:** Doctor Test Doctor has active consent per D3 but is invisible to the patient in P4 —
  patient cannot see, manage, or revoke this consent
**Root cause candidate:** Consent for Doctor Test Doctor was seeded directly in the backend DB
  (not established through the D9 consent request flow). GET /patient/consents returns only
  consents created via D9 / the consent_grants table, not the seeded consent record. This means
  the doctor has persistent invisible access that the patient cannot revoke.
**Screens involved:** D3 ↔ P4

---

### Session End

**0 of 7 scenarios PASS. 3 FAIL. 4 BLOCKED.**

**3 bugs found:**
- BUG-IT-1: HIGH — Patient OTP login (000000 bypass) fails for doctor-created patients
- BUG-IT-2: HIGH — Doctor-created visit never appears in patient P2 timeline
- BUG-IT-3: CRITICAL — Doctor has invisible consent that patient cannot see or revoke in P4

**Builder Agent session required — items:**
- BUG-IT-1: Investigate TEST_OTP_BYPASS scope — confirm whether bypass applies only to seeded patients or all patients; fix so doctor-created patients can log in with 000000 in test environment
- BUG-IT-2: Investigate visit sync flow — ensure visit is POSTed to server before or independent of logout/force-quit; consider: (a) trigger sync immediately on D6 save, (b) block logout until sync completes for draft visits, or (c) confirm sync worker fires reliably on app foreground
- BUG-IT-3: Investigate GET /patient/consents — ensure it returns ALL active consents for the patient regardless of how they were established (seeded or via D9 flow); or reset the seeded consent and re-establish it via D9 to produce a proper consent record

**SESSION COMPLETE — Next: Builder Agent — fix BUG-IT-1, BUG-IT-2, BUG-IT-3**
