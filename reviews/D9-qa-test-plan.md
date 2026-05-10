# QA REVIEW — D9 Consent Request Flow

**Date:** 2026-05-09
**QA Agent version:** v1
**Files reviewed:**
- `mockups/D9ConsentRequestScreen.tsx`
- `docs/api-contracts.md` §Consent Endpoints
- `docs/security-spec.md` §Consent OTP Security
- `docs/consent-layer-spec.md`
- `reviews/D9-security-audit.md`

**Scope note:** This is a mockup-stage QA review. The live screen has not been built.
Bugs marked CRITICAL or HIGH are design-level gaps that will produce incorrect or broken
behaviour when the Builder wires D9. The test plan cases marked `[DEVICE]` require a live
screen to execute; cases marked `[DESIGN]` are verifiable against the mockup now.

---

## TESTING PREREQUISITES

| Field | Value |
|---|---|
| Backend URL | `https://medrecord-api.onrender.com/v1` |
| Backend status | UP — HTTP 200 confirmed 2026-05-03. Cold-starts ~20–30s; use `--max-time 30`. |
| Consent endpoints deployed? | **UNKNOWN — must verify before device testing.** `POST /consent/request` and `POST /consent/verify` were added to the API contract 2026-05-09. Confirm the backend developer has deployed these before any device test session. |
| Test credentials | Dr. Test Doctor — mobile `9999999999` |
| OTP bypass | `TEST_OTP_BYPASS=true` — code `000000` |
| Cert pinning | Deferred to EAS custom dev client — not testable in Expo Go |
| **Status** | **BLOCKED — consent endpoints not confirmed deployed. Mark READY TO TEST once backend confirms POST /consent/request and POST /consent/verify are live.** |

---

## H-3 DECISION: Rate-limit exhaustion UI state

The security audit left H-3 open for the QA Agent to determine whether a toast is sufficient or a distinct UI state is required.

**Decision: A distinct persistent state (not a toast) is required.**

Reason: When `POST /consent/request` returns 429, it includes `retry_after_seconds`. The current Failure state (Variant 6) shows "Resend and try again" — if the doctor is in a rate-limit situation, tapping Resend hits 429 again, creating an infinite loop. A toast disappears in ~3 seconds and the doctor forgets about it; the next tap re-triggers 429. The live build must:

1. Detect 429 response from `POST /consent/request` (initial request and resend).
2. Show a distinct error state or banner (can be an inline card replacing the resend row) with message: "Too many requests — please wait [N] minutes before requesting a new code." Calculate N from `retry_after_seconds`.
3. Disable the Resend button for the duration of `retry_after_seconds`.
4. A new Variant 8 (`D9ConsentRateLimited`) is recommended for the mockup so the Builder has a visual contract. An inline banner on State 2 is acceptable as an alternative if it permanently replaces the Resend section.

This is a HIGH finding and must be addressed before the live build is wired.

---

## CRITICAL BUGS

### C-1: iOS OTP autofill writes only the last digit of the auto-filled code

**File:** `mockups/D9ConsentRequestScreen.tsx` `D9ConsentOtpInput` line 331

**What the code does:**
```tsx
const digit = value.replace(/[^0-9]/g, '').slice(-1);
```
This strips non-numeric characters and keeps only the **last** character. When iOS triggers
`textContentType="oneTimeCode"` autofill, iOS calls `onChangeText` on the **first input** with
the full 6-digit string (e.g. `"483920"`). The handler discards the first 5 digits and writes
only `"0"` to box 1. The remaining 5 boxes stay empty.

**Impact:** iOS SMS autofill — which is very common on iPhones and reduces errors for
non-technical patients — is silently broken. The patient sees 1 digit filled and 5 empty boxes
and must manually retype the code. Worse, they may not understand why the auto-suggestion
didn't work and assume the code is wrong.

**Steps to reproduce (device test, iOS):**
1. Navigate to State 3 (OTP Input, patient-facing).
2. iOS prompts "Use code from Messages" above the keyboard.
3. Tap the suggestion.
4. Observe: box 1 shows only the last digit; boxes 2–6 are empty.

**Expected:** All 6 boxes auto-populated.
**Actual:** Box 1 gets only the last digit of the suggested code.

**Fix:** Handle paste/autofill by detecting `value.length > 1` and distributing digits across
boxes:
```tsx
const handleDigitChange = (index: number, value: string) => {
  const cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned.length > 1) {
    // Paste or autofill — distribute across boxes starting from index
    const next = [...digits];
    let focusIndex = index;
    for (let i = 0; i < cleaned.length && index + i < OTP_LENGTH; i++) {
      next[index + i] = cleaned[i];
      focusIndex = index + i;
    }
    setDigits(next);
    inputRefs.current[Math.min(focusIndex + 1, OTP_LENGTH - 1)]?.focus();
    return;
  }
  const digit = cleaned.slice(-1);
  // ... rest of existing logic
};
```

---

### C-2: Resend SMS must call POST /consent/request again — current mockup does not

**File:** `mockups/D9ConsentRequestScreen.tsx` `D9ConsentWaiting` `handleResend` line 177

**What the code does:**
```tsx
const handleResend = useCallback(() => {
  endTimeRef.current = Date.now() + RESEND_SECONDS * 1000;
  setSecondsLeft(RESEND_SECONDS);
  setCanResend(false);
}, []);
```
This resets only the **UI countdown timer**. In the live build, Resend must:
1. Call `POST /consent/request` to get a fresh `otp_token` (which triggers a new SMS).
2. Replace the stored `otp_token` in state with the new one.
3. Discard the old `otp_token`.

If the live build copies this `handleResend` as-is and only adds an API call as an afterthought
but forgets to update the stored `otp_token`, the following silent failure occurs: patient
receives a **new** SMS with a new OTP, enters it, but `POST /consent/verify` is called with the
**old** `otp_token`. The server rejects it (410 — expired or exhausted), the patient's correctly
entered code fails, and the doctor has no idea why. Consent is never granted.

**This is a silent, non-obvious failure.** The doctor sees Failure state, thinks the patient
entered it wrong, resends again. The situation does not self-resolve.

**Fix:** In the live build, `handleResend` must:
```tsx
const handleResend = useCallback(async () => {
  setCanResend(false);
  setSecondsLeft(RESEND_SECONDS);
  endTimeRef.current = Date.now() + RESEND_SECONDS * 1000;
  const result = await apiRequestConsent(patientId);   // POST /consent/request
  setOtpToken(result.otp_token);                        // replace stale token
}, [patientId]);
```

---

## HIGH BUGS

### H-1: State 2b (DoctorWaiting) is scoped to sub-flow A which is deferred to v2

**File:** `mockups/D9ConsentRequestScreen.tsx` lines 282–313

Sub-flow A (patient has the app, approves from their own device) is deferred to v2 per the PM
review. State 2b ("Your patient is entering the code now — this screen will update automatically")
implies push notification or polling that would only make sense in sub-flow A, where the patient
is on a different device.

In v1's sub-flow B (doctor hands phone to patient), the patient IS on the doctor's phone. There
is no "doctor side" to show during patient OTP entry — the doctor has handed the device over.
State 2b as written is unreachable in the correct v1 flow and misleading if somehow reached.

**Risk:**
- Builder may route "Patient is ready" → State 2b (waiting for a push that will never come in v1)
  instead of directly to State 3 (OTP Input). Doctor sees the "waiting" state indefinitely.
- Copy "This screen will update automatically" creates false expectations in v1.

**Fix:**
- For v1 live build: "Patient is ready" button transitions directly to State 3 (OTP Input).
- Either remove State 2b from the v1 live screen entirely, or add a clear `// v2 only` comment
  so the Builder doesn't wire it into the v1 flow.

---

### H-2: Rate-limit exhaustion has no UI state (H-3 from security audit — closed as HIGH here)

Addressed in the H-3 Decision section above. This is a HIGH bug for the live build.

---

### H-3: otp_token lifecycle across back-navigation is not defined

**Impact:** Doctor presses Android hardware back button from State 2 (Waiting). The OTP token
is still valid for up to 10 minutes. The patient has received an SMS. D3 re-renders. Doctor
decides to try again and taps "Request Access" — a new consent request is initiated, generating
a new OTP and SMS. The old SMS (and patient reading it) is invalidated.

**Problem states:**
1. Patient reads the **first** SMS and enters its code → fresh consent request was already
   called, first `otp_token` is still active (not cancelled server-side), so `POST /consent/verify`
   with the old token + old OTP still works — **correct**, but the new SMS also arrived and
   confused the patient.
2. Patient reads the **second** SMS → enters its code → also works — but the first `otp_token`
   is orphaned (never verified or expired).

Per the API contract, there is no `DELETE /consent/request/:token` to cancel an in-flight
request. The live build must at minimum decide:
- Does pressing back from State 2 (or tapping "Wrong number") silently abandon the flow and
  return to D3 without initiating a new request?
- Or does the "Request Access" button on D3 always initiate a fresh request on each tap?

**Fix recommendation:** On pressing back from any D9 doctor-facing state, return to D3 without
a new request. The old `otp_token` expires naturally at 10 minutes. If doctor wants to try again
from D3, tapping "Request Access" calls `POST /consent/request` fresh. This is the least
confusing path for the patient.

---

### H-4: Success state copy "contact the clinic" contradicts consent-layer-spec

**File:** `mockups/D9ConsentRequestScreen.tsx` line 488

```
"To remove access later, contact the clinic."
```

Per `docs/consent-layer-spec.md` §Flow 4, patients revoke access via the **Patient app** (P4
screen), not by contacting the clinic. This is already flagged as a SHOULD FIX comment in the
mockup (line 484). Promoting to HIGH because it is factually wrong per the spec and teaches
patients an incorrect mental model at the moment consent is granted.

**Fix:** Change to "To manage or remove access later, use the MedRecord app." (If patient app
is not yet deployed, omit entirely or use: "Contact MedRecord support to remove access.")

---

## MEDIUM BUGS

### M-1: Confirm button has no tap guard (from security audit — live build reminder)

`D9ConsentOtpInput` `handleConfirm` has no `isSubmittingRef`. Double-tap sends two
`POST /consent/verify` requests simultaneously. Per project pattern, use `useRef(false)` not
`useState` (sync vs async). Add before the live build ships.

**Code location:** `mockups/D9ConsentRequestScreen.tsx` line 352

---

### M-2: Patient-facing OTP screen has no expiry indicator

The OTP is valid for 10 minutes. The patient-facing State 3 has no timer or expiry hint.
In a rural SMS delivery scenario: doctor taps Request at T+0, SMS arrives at T+3 min,
patient locates their phone at T+6, slowly reads digits at T+8, taps Confirm at T+10:30 →
410 (expired). Patient sees a cryptic failure with no explanation of what went wrong.

**Recommended fix for live build:** Add a subtle expiry hint near the OTP boxes:
"Code expires in [countdown]" (showing minutes remaining). This is less critical than C-1
and C-2 but prevents abandonment and confusion near the expiry boundary.

---

### M-3: Failure state messaging does not distinguish wrong-code vs exhausted

**File:** `mockups/D9ConsentRequestScreen.tsx` `D9ConsentFailure`

`POST /consent/verify` returns two distinct failure modes:
- `400 + attempts_remaining` → wrong OTP, can retry without new SMS
- `410` → OTP exhausted or expired, must call `POST /consent/request` again

The current Failure state body ("Ask your patient to check the latest SMS from MedRecord")
is only correct for the 400 case. For 410, the patient needs to check a **new** SMS that is
sent when the doctor taps "Resend and try again."

**Fix (from security audit M-3):** In the live build, branch on the response:
- `400`: "Incorrect code. Your patient has [N] attempt(s) remaining — ask them to re-check the SMS."
- `410`: "Code expired or used up. We'll send a new code when you tap below."

---

### M-4: DPDP audit event not called out in mockup — live build reminder

Per `docs/security-spec.md` audit logging and the established D3 pattern, the live build must
emit a `consent.request.initiated` audit event to the local `audit_events` table when the
doctor taps "Request Consent" (before `POST /consent/request` completes). Server-side logging
handles the grant/deny events.

**Fix:** Add `// LIVE BUILD: insertAuditEvent(db, 'consent.request.initiated', { doctor_id, patient_id })` comment at the POST /consent/request call site in the live screen.

---

## UNHANDLED EDGE CASES

### E-1: App killed mid-flow (between State 3 and State 4)

Patient enters all 6 digits and taps Confirm. Before `POST /consent/verify` completes,
the app is killed (low memory, incoming call forces a restart). On relaunch, the app
returns to D3. Consent is NOT granted (server never received the request, or received it
but the connection dropped before the response). The patient's phone still shows the OTP SMS.

**Recommended handling:** On D3 relaunch (via `useFocusEffect`), re-verify consent status
server-side — this is already done per D3-H-2. If consent was granted before the crash
(e.g. server processed the POST but response was lost), D3 will load with consent. If not,
doctor must start over. No special recovery needed — the re-verify on D3 mount handles it.
Document this in the live build's `onError` handler: show "Something went wrong — return to
patient" and navigate to D3.

---

### E-2: Two doctors request consent for the same patient simultaneously

Doctor A and Doctor B both tap "Request Access" for the same patient within the same minute.
Both calls to `POST /consent/request` succeed. Patient receives two SMS messages.
Whichever code the patient enters for whichever doctor, that doctor gets consent. The other
`otp_token` expires naturally. This is a valid and handled scenario — the server scopes
`otp_token` to `(doctor_id, patient_id)`, so the two tokens are independent.

**No fix required.** Document as known-acceptable behaviour: two consents may be granted
simultaneously. Consent is not exclusive.

---

### E-3: Patient dictates OTP aloud in a waiting room (privacy)

In Indian clinics, it is common for patients to read codes aloud to the doctor who types it in.
The 6-digit code is spoken openly. The consent flow enables this (doctor types on their device,
or patient types directly). No technical fix — the social context is by design. But the live
build's doctor-facing OTP input (if the doctor enters it on behalf of the patient) must still
call `POST /consent/verify` — there must not be a separate "doctor-enters-it" bypass path
that skips patient interaction.

**No fix required.** The current design correctly uses a single `POST /consent/verify` endpoint
regardless of who physically types the OTP.

---

### E-4: SMS delayed > 10 minutes (common in rural India)

Doctor sends consent request. Patient's phone shows no SMS for 11 minutes (network congestion,
DND mode, wrong operator routing). Doctor has already tapped Skip. Patient receives the SMS
later. The code is expired (otp_token 410). No action is possible from the patient's side —
the flow has already exited. This is expected and handled (OTP expires). The doctor can
re-initiate consent on the next visit.

**No fix required.** Document in patient-facing State 2 as a helpful note: "If your patient
doesn't receive the code within a few minutes, you can resend or skip for now."

---

### E-5: Doctor enters OTP on behalf of patient without patient's knowledge

The OTP is sent to the patient's registered mobile. The doctor does not see the OTP content
(only the patient's phone does). If a patient does not have their phone with them, the
"Patient not available" fallback correctly prevents consent bypass — doctor cannot grant
themselves consent without the OTP.

**Verify in live build:** Confirm there is no code path from State 7 (Patient Not Available)
that grants consent. The "Start New Visit" button must navigate to D6 with `consent_granted: false`.

---

## TEST PLAN

### TESTING PREREQUISITES CHECK (run before every device test session)

```
TC-PRE-1: curl --max-time 30 https://medrecord-api.onrender.com/v1/health → expect HTTP 200
TC-PRE-2: POST /consent/request exists → curl --max-time 30 -X POST /v1/consent/request -H "Authorization: Bearer [test_token]" -d '{"patient_id":"[test_id]"}' → expect 200 or 401 (not 404)
TC-PRE-3: POST /consent/verify exists → same check → expect 200 or 400 (not 404)
TC-PRE-4: Confirm test doctor token is valid (GET /v1/patients/lookup?mobile=9999999999 returns 200)
```

---

### Happy Path

| ID | Description | Steps | Expected | Variant |
|---|---|---|---|---|
| TC-HP-1 | Full consent grant flow — happy path | 1. Doctor on D3, no consent. Tap "Request Access". 2. App transitions to State 1 (Requesting). 3. POST /consent/request completes. 4. App shows State 2 (Waiting). 5. Doctor taps "Patient is ready". 6. App shows State 3 (OTP Input). 7. Patient enters correct 6-digit code. 8. Tap Confirm. 9. App shows State 4 (Verifying). 10. POST /consent/verify returns 200. 11. App shows State 5 (Success). 12. After ~2s auto-return to D3 with full visit history loaded. | D3 loads with `consent_granted: true`, visit history from other doctors visible. | [DEVICE] |
| TC-HP-2 | iOS SMS autofill fills all 6 boxes | On State 3 (OTP Input), iOS prompts "Use code from Messages". Tap the suggestion. | All 6 boxes auto-populated with correct digits. | [DEVICE — iOS] |
| TC-HP-3 | Returning patient — D9 not shown | Doctor opens D3 for a patient who already granted consent. | D9 is never launched. Consent granted state loads directly. | [DEVICE] |
| TC-HP-4 | Skip → start visit without history | On State 2, tap "Patient not available right now? Skip". | App transitions to State 7 (Patient Not Available). Tapping "Start New Visit" navigates to D6 with consent_granted: false. D3 does not reload with history. | [DEVICE] |
| TC-HP-5 | Wrong number — go back to edit | On State 2, tap "Wrong number? Go back to edit". | Returns to D3 (or patient edit stub). No new consent request is fired. | [DEVICE] |

---

### Offline / Network Scenarios

| ID | Description | Steps | Expected | Variant |
|---|---|---|---|---|
| TC-OFF-1 | POST /consent/request fails — no connectivity | Turn off WiFi and mobile data before tapping "Request Access". Tap. | Clear error state shown ("No internet connection — check your network and try again"). Not State 1 indefinitely. | [DEVICE] |
| TC-OFF-2 | Network drops between request and verify | Enable connectivity, reach State 2 (SMS sent). Turn off WiFi/data. Patient enters code and taps Confirm. | POST /consent/verify fails. App shows error ("Connection lost — please try again"). Not silent failure. | [DEVICE] |
| TC-OFF-3 | Network drops after POST /consent/verify sent but before response | No reliable test — test TC-OFF-2 path instead. App must not silently grant consent client-side before server confirms. | Consent NOT granted locally until server 200. | [DEVICE] |
| TC-OFF-4 | App backgrounded during State 3 (patient entering OTP) | Patient starts entering OTP, phone call arrives. App backgrounds and returns after 2 minutes. | OTP boxes retain entered digits. Confirm button still works. Time spent backgrounded counts against 10-minute expiry window. | [DEVICE] |

---

### Error / Failure Scenarios

| ID | Description | Steps | Expected | Variant |
|---|---|---|---|---|
| TC-ERR-1 | Wrong OTP — 1st attempt (2 remaining) | Enter incorrect 6-digit code. Tap Confirm. | App shows State 6 (Failure). Body copy states "You have 2 attempt(s) remaining." "Resend and try again" button available. | [DEVICE] |
| TC-ERR-2 | Wrong OTP — 3rd attempt (exhausted) | Enter incorrect code 3 times. | After 3rd attempt: POST /consent/verify returns 410. App shows State 6 with "Code exhausted — a new code will be sent." Doctor must start over. | [DEVICE] |
| TC-ERR-3 | OTP expired (> 10 minutes) | Initiate request. Wait 10+ minutes without entering code. Enter any 6-digit code. | POST /consent/verify returns 410. App shows Failure state with "Code expired" messaging (not "incorrect code"). | [DEVICE] |
| TC-ERR-4 | Rate limit exhaustion — 10 requests in 1 hour | Tap Resend 10 times within 1 hour for the same patient. 11th call returns 429. | App shows rate-limit state: "Too many requests — wait [N] minutes." Resend button disabled for `retry_after_seconds`. NOT the standard Failure state with "Resend and try again" (which would loop). | [DEVICE] |
| TC-ERR-5 | Server error (500) on POST /consent/request | (Simulate via test endpoint or network proxy.) | App shows error state with "Something went wrong — please try again." Not a crash. Not silent. | [DEVICE] |
| TC-ERR-6 | Confirm tapped with fewer than 6 digits | Enter 5 digits. Tap Confirm. | Error message below OTP boxes: "Please enter all 6 digits." Boxes remain editable. | [DEVICE] |
| TC-ERR-7 | Confirm tapped with 0 digits (blank form) | Tap Confirm without entering any digit. | Same as TC-ERR-6 — error shown, no API call made. | [DEVICE] |

---

### Resend Scenarios

| ID | Description | Steps | Expected | Variant |
|---|---|---|---|---|
| TC-RSD-1 | Resend before 30s countdown | On State 2, attempt to tap Resend before countdown reaches 0. | Resend button not shown; only countdown text visible. Cannot resend prematurely. | [DEVICE] |
| TC-RSD-2 | Resend after 30s — new otp_token stored | Wait for countdown to reach 0. Tap Resend. | New POST /consent/request call made. New `otp_token` stored in component state. Countdown resets to 30s. Patient receives a new SMS. | [DEVICE] |
| TC-RSD-3 | Enter code from first SMS after Resend | Doctor resends. Patient enters the code from the **first** SMS. | `POST /consent/verify` is called with the **new** `otp_token` and the **old** OTP value → server returns 400 (invalid_otp) or 410 (token mismatch). App shows Failure state, not silent success. Consent NOT granted. | [DEVICE] |
| TC-RSD-4 | Enter code from second SMS after Resend | Doctor resends. Patient enters the code from the **second** SMS. | Verification succeeds. Consent granted. | [DEVICE] |

---

### State Navigation Tests

| ID | Description | Steps | Expected | Variant |
|---|---|---|---|---|
| TC-NAV-1 | Android hardware back from State 2 | On State 2 (Waiting), press Android hardware back button. | Returns to D3. No new consent request fired. No confirmation dialog needed (flow is reversible). | [DEVICE — Android] |
| TC-NAV-2 | iOS swipe-back from State 2 | On State 2 (Waiting), swipe back gesture. | Same as TC-NAV-1. | [DEVICE — iOS] |
| TC-NAV-3 | Back from State 3 (OTP Input) — Android | Patient presses back while on State 3. | Returns to State 2 (Waiting). Countdown resumes from where it was. OTP still valid. | [DEVICE — Android] |
| TC-NAV-4 | Double-tap Confirm | Patient taps Confirm twice rapidly. | Only one `POST /consent/verify` request is sent (tap guard via `isSubmittingRef`). No duplicate consent records. | [DEVICE] |
| TC-NAV-5 | Navigate to D9 for patient who already has consent | Manually navigate to D9 for a patient with active consent. | App should not show D9 for consented patients — this navigation path should not exist. Confirm D3 checks consent before offering "Request Access". | [DESIGN] |

---

### Input Validation Tests

| ID | Description | Steps | Expected | Variant |
|---|---|---|---|---|
| TC-INP-1 | OTP box rejects alpha characters | Type "a", "b", "z" into an OTP box. | Box stays empty or shows no character. Only digits accepted. | [DEVICE] |
| TC-INP-2 | OTP box rejects special characters | Type "#", "@", " " into an OTP box. | Box stays empty. | [DEVICE] |
| TC-INP-3 | Paste 6-digit string into first box | Long-press box 1, paste "483920". | All 6 boxes populated correctly (1 digit each). Fix C-1 must be applied first. | [DEVICE] |
| TC-INP-4 | Paste string longer than 6 digits | Paste "4839201" (7 chars) into box 1. | First 6 digits fill boxes 1–6. 7th digit ignored. | [DEVICE] |
| TC-INP-5 | Backspace retreats to previous box | Enter digit in box 3. Press Backspace on empty box 3. | Focus moves to box 2. Box 2 content cleared. | [DEVICE] |
| TC-INP-6 | Auto-advance on digit entry | Type digit into box 1. | Focus automatically moves to box 2. | [DEVICE] |

---

### Low-End Device Tests

| ID | Description | Steps | Expected | Variant |
|---|---|---|---|---|
| TC-LOW-1 | State transitions under memory pressure | Run D9 flow on a 2GB RAM device with 5+ apps in background. | All state transitions complete without freeze or missing state. No OTP box focus issues. | [DEVICE — Android low-end] |
| TC-LOW-2 | Slow network (2G/EDGE) | Run D9 on 2G. POST /consent/request takes 10–15 seconds. | State 1 (Requesting) spinner remains visible throughout. No timeout crash. Once SMS confirmed, transitions to State 2. | [DEVICE] |
| TC-LOW-3 | Timeout on POST /consent/request | Simulate 30s+ timeout. | After timeout, app shows error state: "Request timed out — please try again." Not a crash. Not State 1 indefinitely. | [DEVICE] |

---

### Security Verification Tests (post-live-build)

| ID | Description | Steps | Expected | Variant |
|---|---|---|---|---|
| TC-SEC-1 | otp_token cannot be reused after verify | After successful consent grant, re-send `POST /consent/verify` with the same otp_token and OTP. | Server returns 410 (token already purged after successful verification). | [API test] |
| TC-SEC-2 | otp_token scoped to doctor — another doctor cannot use it | Doctor A gets otp_token. Doctor B sends `POST /consent/verify` with Doctor A's token and correct OTP. | Server returns 403 (token belongs to different doctor). | [API test] |
| TC-SEC-3 | POST /consent endpoint removed | Send `POST /v1/consent` directly (old bypass endpoint). | Returns 404 or 405 (endpoint removed per C-1 fix). | [API test] |
| TC-SEC-4 | Consent NOT granted if POST /consent/verify is skipped | Doctor calls only `POST /consent/request`. Then accesses patient visits. | `GET /patients/:id/visits` still returns `consent_granted: false`. No consent without completed verify. | [API test] |
| TC-SEC-5 | Patient-facing state exposes zero PII | Navigate to State 3 (OTP Input). | No patient name, no doctor name, no clinic name, no mobile number visible. Only "MedRecord" branding and OTP entry. | [DEVICE] |

---

## VERDICT

**Needs fixes before live build starts.**

CRITICAL findings C-1 (iOS autofill) and C-2 (resend must re-fetch otp_token) are
design-level gaps that will produce silent consent failures in production. Both must be
addressed in the Builder's live-build session — not after wiring.

HIGH findings H-1 (State 2b is v2-only), H-2 (rate-limit state required), H-3 (otp_token
back-nav lifecycle) must be addressed by the Builder in the same live-build session.

**ESTIMATED FIX EFFORT:** 2–3 hours (C-1 autofill distribution: 30 min; C-2 resend token
refresh: 20 min; H-1 State 2b removal: 15 min; H-2 rate-limit state: 45 min; H-3 back-nav
decision + implementation: 30 min; M-1 tap guard: 15 min; M-2 expiry hint: 20 min;
M-3 failure sub-messages: 20 min; M-4 audit event comment: 5 min.)

**Security verification tests (TC-SEC-1 through TC-SEC-5) require the live screen AND
deployed backend consent endpoints. Mark device testing BLOCKED until both are confirmed.**
