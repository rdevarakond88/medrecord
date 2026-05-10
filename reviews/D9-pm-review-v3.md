# PM REVIEW — Post-Flow: D9 Consent Request Flow + Pre-Launch Gate

**Date:** 2026-05-10
**Agent:** PM Agent — Moment 2 (D9 Post-Flow) + Moment 3 (Pre-Launch Gate)
**Scope:** D9 Consent Request Flow is complete. All core v1 doctor-facing screens are now
device-tested and security-cleared. This review closes out D9 and assesses v1 pilot readiness.

---

## MOMENT 2 — Post-Flow: D9 Consent Request Flow

### OVERALL ASSESSMENT: Strong

The consent flow is built correctly for the market it serves. SMS OTP is the right mechanism
— no patient app required, works on any phone, familiar to patients who receive bank OTPs daily.
Three security audits, four device test sessions, zero open MEDIUM+ findings. The 10-minute OTP
window (PM-approved 2026-05-09) is realistic for semi-urban SMS delivery delays. D3 is fully
wired — `handleRequestAccess` navigates to D9 with masked mobile only; M-2 (full mobile in
nav params) is confirmed closed.

---

### ADOPTION RISKS

**1. SMS delivery failure with no patient mobile correction path in-flow.**
When a doctor sends a consent request and the patient's SMS doesn't arrive — wrong number,
poor signal, SMS gateway delay — the flow dead-ends. The doctor sees a loading state, then
a "request sent" confirmation with no delivery signal. There is no way to edit the patient's
mobile number from within D9 or even from D3 without a working edit affordance (the D3 header
edit button is a stub). In a real clinic, the doctor will abandon the consent flow entirely
after one failed attempt and revert to manual record-keeping.
**Fix before pilot:** Wire the D3 patient mobile edit (replace stub with a minimal edit form —
mobile number field only). This is the single most important missing piece for D9 to work in
the field.

**2. OTP relay friction for low-literacy or elderly patients.**
The flow requires the patient to locate an SMS, read a 6-digit code, and relay it to the doctor
within the OTP window. For patients who are unfamiliar with SMS (common in semi-urban India
among older demographics), staff assistance adds 1–2 minutes to the consultation.
No design mitigation for v1 — inherent to the SMS OTP model. Acceptable for v1.

**3. No consent revocation UI.**
D9 grants consent; revocation is not implemented. Under DPDP Act 2023, patients must be able
to withdraw consent. For a closed pilot with known participants this is acceptable short-term.
Must be in v1.1 before any open enrollment or public-facing launch.

---

### REGULATORY OR TRUST RISKS

**1. DPDP consent revocation gap.**
`consent_granted = 1` persists until explicitly revoked; no revocation endpoint or UI exists.
This is documented as accepted pilot debt. Mitigation for pilot: document explicitly in pilot
consent that participants can contact the clinic to revoke — do not imply in-app revocation
is available.

**2. No consent expiry mechanism.**
Once granted, consent is permanent until revoked. DPDP interpretations vary on whether
time-bounded consent is required for health data. Flag for legal review before expanding
beyond the initial pilot clinic.

---

### INFRASTRUCTURE READINESS

- **Backend:** Deployed at `https://medrecord-api.onrender.com/v1` — health check 200 ✅ (2026-05-10)
- **Consent endpoints:** POST /consent/request → HTTP 401 ✅; POST /consent/verify → HTTP 401 ✅
- **Device testing:** COMPLETE — sessions 1–4; zero open bugs; BUG-D9-DT1-4 accepted as
  untested-but-correct-by-construction (offline verify path mirrors verified D6 pattern)
- **Security re-audit v3:** 0 critical / 0 high / 0 medium findings ✅
- **D3 → D9 navigation:** Fully wired (`navigation.navigate('ConsentRequest', {...})`) — not a stub ✅

---

### ONE THING MOST LIKELY TO CAUSE LOW ADOPTION

**No way to correct the patient's mobile number when SMS doesn't arrive.**
A doctor who initiates consent, waits for the patient's SMS, hears "I didn't get anything,"
and has no path forward within the app — that is the flow-ending moment. The patient mobile
edit stub in D3 is the missing link. Every other piece of D9 is production-ready.

---

---

## MOMENT 3 — Pre-Launch Gate: v1 Pilot Readiness

All 8 core doctor-facing screens complete and device-tested:
D1 Login, D2 Patient Search, D3 Patient Detail, D4 Visit Detail, D5 New Patient Form,
D6 New Visit, D7 Document Scanner, D9 Consent Request.

### LAUNCH READY: Yes with conditions

The doctor workflow is end-to-end functional and tested: login → search patients → create
new patients → record visits → attach scans → view visit detail → request patient consent.
Four conditions must be met before handing this to a real clinic.

---

### CONDITIONS (must complete before pilot)

**1. EAS build with cert pinning.**
All device testing was done in Expo Go. `pinnedFetch` with `react-native-ssl-pinning` does
NOT work in Expo Go — cert pinning is silently bypassed in all test sessions. A real clinic
pilot with patient health data, visit notes, and OTPs transiting over shared clinic WiFi
without cert pinning is an unacceptable security posture. Build the EAS binary, load the
pinned certs, run one smoke-test session against the live backend to confirm pinning works.

**2. Patient mobile edit (D3 stub → working form).**
The D3 header edit button navigates nowhere. This is the only path to correct a wrong patient
mobile number — which is directly required for D9 consent requests to reach the right phone.
Minimum viable build: a modal or screen with a single editable mobile number field, validated
at boundary, saved to SQLite and queued for server sync.

**3. Remove `syncLogger.ts` from production.**
`src/sync/syncLogger.ts` and all call sites in `NewVisitScreen.tsx` (lines 64, 342, 344, 368,
372) write to `console.log` with no `__DEV__` guard. Active in EAS production builds.
UUIDs only — no PII — but hygiene issue and file header explicitly flags removal.

**4. Fix D5-M-1: `UNIQUE(mobile_number)` not doctor-scoped.**
On a shared clinic device, Doctor B's new patient creation silently fails if Doctor A already
has the same mobile number. This is a high-probability failure in a multi-doctor clinic —
exactly the target use case. Change constraint to `UNIQUE(doctor_id, mobile_number)` with
schema migration.

---

### HIGHEST FIELD RISK

**Cert pinning not validated in EAS build.**
All API traffic — patient demographics, visit notes, consent OTPs — has been tested in an
environment where cert pinning is inactive. The code is in place. It has never been run in
a production build. A failed cert pin in production will break the app for every doctor.
A missing cert pin in production exposes patient data to MITM on clinic WiFi. Both failure
modes are catastrophic. Validate before any real patient touches the app.

---

### WOULD CAUSE UNINSTALL WITHIN WEEK 1

A doctor sends a consent request, the patient says "I didn't get an SMS," the doctor
has no way to correct the mobile number in the app, and the patient leaves without
granting access. The doctor then tells the next clinic they encounter: "the consent thing
doesn't work." Indian healthtech spreads by word of mouth among doctors. One visible
failure during a consultation is a reputation event, not just a UX bug.

---

### INFRASTRUCTURE CHECKLIST

| Item | Status |
|---|---|
| Backend deployed and reachable | YES ✅ — Render.com, health check 200 (2026-05-10) |
| All 8 core screens device-tested against live backend | YES ✅ |
| Cert pinning validated in EAS build | NO ⚠️ — all testing in Expo Go; EAS build required before pilot |
| Test credentials and pilot onboarding flow | PARTIAL — test credentials exist; no formal onboarding flow built yet |

---

### DEFER TO V1.1 (do not delay launch for these)

- D8 Full Scan View (image viewer + OCR panel)
- P1–P5 Patient App
- Consent revocation UI
- DPDP consent expiry mechanism
- Aadhaar field in D5 (locked decision — hash at boundary when added)
- Android SMS autofill in D1
- Server-side visit pagination (D3)
- D4-QA-M2/M3/M4 (visit record integrity edge cases)
- D3-M-2 consent audit over-fire
- D3: Patient name dimming / PII idle timeout
- D2: Full mobile numbers in PatientRow (partially masked already)
- D2: Remaining MEDIUM UX items (touch targets, LIKE query, double-tap guard)
- SW-M-2: `hasResetInProgress` not reset on doctor change

---

### RECOMMENDED NEXT SESSION ORDER

| Priority | Session | Reason |
|---|---|---|
| 1 | **D9 → main PR** | D9 is clear to merge. Create PR #4 and merge. |
| 2 | **Builder: Patient mobile edit** | Missing link for D9 to work in field. Minimal form — mobile field only. |
| 3 | **Builder: D6 syncLogger removal** | Required before EAS production build. |
| 4 | **Builder: D5-M-1 schema fix** | UNIQUE constraint fix — required for multi-doctor clinic. |
| 5 | **EAS build + cert pinning smoke test** | Highest field risk. Must happen before any real patient data. |
| 6 | **Device test: EAS build smoke test** | Confirm cert pinning, core flow, and D9 in production binary. |
