# SECURITY AUDIT — D9 Consent Request Flow (Mockup)

**Date:** 2026-05-09
**Auditor:** Security Agent
**Files reviewed:**
- `mockups/D9ConsentRequestScreen.tsx` (revised after Builder Step 4)
- `docs/api-contracts.md` (Consent Endpoints section)
- `docs/security-spec.md`
- `docs/consent-layer-spec.md`

**Scope note:** This is a mockup-stage audit — the goal is to catch design-level security gaps before they are baked into the live build. Findings reference api-contracts.md where the live implementation will be built from.

---

## CRITICAL (must fix before wiring / merge)

### C-1: `POST /consent` in api-contracts.md bypasses OTP verification

**File:** `docs/api-contracts.md` lines 397–410

**What it says now:**
```json
POST /consent
{ "patient_id": "uuid", "doctor_id": "uuid", "scope": "read_all", "granted_by": "patient" }
→ 201 { "consent": { ... } }
```

**Risk:** This endpoint accepts a direct consent grant from the doctor's authenticated JWT — no OTP required. Any authenticated doctor can call `POST /consent` with any `patient_id` and grant themselves access to that patient's historical records without the patient's knowledge. The `granted_by: "patient"` claim is entirely client-supplied and trivially forgeable. The OTP flow exists in the UI but the server would never enforce it.

**Fix:**
1. Remove (or mark internal-only) the existing `POST /consent` endpoint from the client-facing API contracts.
2. Replace the D9 consent flow with two properly-scoped endpoints:
   - `POST /consent/request` — doctor calls this; server sends OTP SMS to patient's registered mobile; response returns an `otp_token` scoped to the `(doctor_id, patient_id)` pair.
   - `POST /consent/verify` — doctor calls this with the `otp_token` + 6-digit `otp`; server verifies, creates the consent grant internally, returns the consent object.
3. The `otp_token` must encode or reference `doctor_id` server-side so a different doctor cannot reuse an OTP token generated for another doctor's request.

This fix must be made in `docs/api-contracts.md` before the Builder starts wiring D9.

---

## HIGH (fix before live build ships)

### H-1: Missing API contracts for `POST /consent/request` and `POST /consent/verify`

**File:** `docs/api-contracts.md`

The PM pre-flight review (2026-05-09) already flagged this. These two endpoints are referenced in the D9 mockup flow (State 1 → Requesting, State 3 → OTP Input) but do not exist in the API contracts. Without them, the Builder has no contract to implement against and the only available endpoint is the bypass path identified in C-1.

The contracts must specify:
- `POST /consent/request`: Auth: doctor JWT. Body: `{ patient_id }`. Response: `{ otp_token, expires_in }`. Rate limit: per security-spec "POST /consent: 10 per patient per hour." OTP stored as bcrypt hash server-side. OTP purged on successful verify.
- `POST /consent/verify`: Auth: doctor JWT. Body: `{ otp_token, otp }`. Max 3 wrong attempts before `otp_token` invalidated. Response 200: `{ consent_id, granted_at, scope }`. Response 400: `{ error: "invalid_otp", attempts_remaining: N }`. Response 410: `{ error: "otp_expired_or_exhausted" }`.

**Fix:** Add both endpoint contracts to `docs/api-contracts.md` before Builder wires D9.

### H-2: Consent OTP expiry not specified — mockup says "10 minutes", spec says 5

**File:** `mockups/D9ConsentRequestScreen.tsx` line 509

The Failure state (Variant 6) reads: "codes are valid for 10 minutes." The security-spec OTP Security section specifies "OTP expiry: 5 minutes" for auth OTPs. Consent OTPs are a different type and their expiry is not documented anywhere.

**Risk:** If the UI says 10 minutes but the server expires the consent OTP at a different time, doctors and patients will be confused when a seemingly "fresh" code is rejected. Inconsistency erodes trust and causes the consent flow to be abandoned.

**Fix:** Decide and document the consent OTP expiry in `docs/security-spec.md` (under a new "Consent OTP Security" subsection) or in `docs/api-contracts.md` as part of the H-1 endpoint contracts. Update the Failure state text in the mockup to match the decided value.

### H-3: No UI state designed for rate limit exhaustion on consent OTP requests

**File:** `mockups/D9ConsentRequestScreen.tsx`

The security-spec specifies "POST /consent: 10 per patient per hour" rate limiting. If a doctor (or the Resend button) triggers 10 requests in an hour, the API returns 429. There is no UI state for this scenario. The live build will either crash silently or fall through to the generic Failure state — which offers "Resend and try again," which will also fail (429), trapping the doctor in a loop.

**Fix:** Add a comment in the mockup (or a Variant 8 state in the live build) for the rate-limit-exhaustion case. Suggested message: "Too many requests — please wait before requesting a new code." The live build must catch 429 responses from `POST /consent/request` and surface this state explicitly.

---

## MEDIUM (fix before v1 launch)

### M-1: Patient-facing Confirm button needs tap guard in live build

**File:** `mockups/D9ConsentRequestScreen.tsx` `D9ConsentOtpInput` (line 352–359)

`handleConfirm` has no tap guard. On the live screen, a double-tap sends two `POST /consent/verify` requests simultaneously. Per the established project pattern (MEMORY.md): use `useRef(false)` synchronously, not `useState` (async lag creates a race window). The Builder must add `isSubmittingRef = useRef(false)` to D9ConsentOtpInput in the live screen.

### M-2: DPDP audit event not called out in mockup — required in live build

**File:** `mockups/D9ConsentRequestScreen.tsx`

Per `docs/security-spec.md` audit logging requirements, consent events must be logged: "Consent granted/revoked." The established pattern (see D3) uses `insertAuditEvent()` to the local `audit_events` table, synced to server. D9's live build must emit:
- `consent.request.initiated` when doctor taps "Request Consent" (server call starts)
- Consent granted/denied events will be logged server-side on `POST /consent/verify`

The mockup has no comment flagging this. Add a `// LIVE BUILD: insertAuditEvent(db, 'consent.request.initiated', ...)` comment to the live screen so the Builder doesn't miss it.

### M-3: Failure state messaging ambiguous after OTP exhaustion

**File:** `mockups/D9ConsentRequestScreen.tsx` line 516 (`Variant 6 — Failure`)

"Resend and try again" is shown in all failure cases. After 3 failed attempts the OTP is invalidated per spec. The button label "Resend and try again" correctly implies a new code is sent, but the body copy says "Ask your patient to check the latest SMS" — if the old code is exhausted, a new SMS will be sent. The body copy should acknowledge this distinction so the doctor isn't confused ("A new code has been sent" vs "Check the latest SMS from before").

**Fix:** Distinguish two failure sub-messages in the live build: wrong-code-but-attempts-remain vs otp-exhausted. The `POST /consent/verify` response `attempts_remaining` field (from H-1 fix) enables this.

---

## LOW (track in backlog)

### L-1: Full patient name visible in DoctorHeader in a shared clinic setting

**File:** `mockups/D9ConsentRequestScreen.tsx` line 104–105

`DoctorHeader` shows `PATIENT.name` as the subtitle. This is visible to clinic staff or bystanders standing behind the doctor. Same debt tracked in D3 (name-dimming or abbreviated display after idle). Lower risk here given D9 is a brief transient flow. Document as accepted debt for v1.

### L-2: Dev-only state navigator has no `__DEV__` guard

**File:** `mockups/D9ConsentRequestScreen.tsx` lines 657–679 (default export `D9ConsentRequestScreen`)

The state navigator bar at the bottom is rendered unconditionally. The live screen will be a different component, but the Builder must not copy the default export as-is. Flag for Builder: wrap the stateNav render in `{__DEV__ && ...}` or simply ensure the live screen doesn't include the navigator.

### L-3: Patient-facing Confirm button has no `accessibilityHint`

**File:** `mockups/D9ConsentRequestScreen.tsx` line 428

`accessibilityLabel="Confirm code"` is present but no `accessibilityHint` explains what happens next (e.g., "Activates doctor access to your health records"). Low-literacy patients using screen readers will not have context. Minor addition for the live build.

---

## Checklist Status

| Category | Checkable from mockup | Status |
|---|---|---|
| Authentication & Sessions | OTP expiry, attempt limit, rate limit | ⚠️ H-2 (expiry unspecified), H-3 (no rate-limit state); attempt lockout UI not shown |
| Authorisation | Consent gating, endpoint auth | ❌ C-1 CRITICAL — POST /consent bypass, H-1 missing endpoints |
| Data Handling | Patient data in logs, Aadhaar | ✅ Patient-facing states expose zero PII; mobile masked to last 4 digits on doctor-facing |
| Mobile Security | Tap guard, no sensitive logs | ⚠️ M-1 (tap guard not shown in mockup) |
| Input Validation | OTP boxes maxLength | ✅ maxLength={1} per box × 6 boxes; `textContentType="oneTimeCode"` set for iOS SMS autofill |
| Database / Audit | Audit events for consent | ⚠️ M-2 (not flagged in mockup) |
| DPDP Compliance | Consent audit trail | ⚠️ M-2; consent recording is the purpose of D9 — design is correct |

---

## OVERALL VERDICT: BLOCKED — 1 CRITICAL finding

**C-1 (consent bypass in POST /consent API contract) must be fixed before the Builder wires D9.**

**Required actions before Builder wiring session:**
1. **Builder + PM**: Update `docs/api-contracts.md` to replace `POST /consent` with `POST /consent/request` + `POST /consent/verify` with OTP scope tied to `(doctor_id, patient_id)`. (Closes C-1 and H-1.)
2. **PM decision**: Decide consent OTP expiry (recommend 10 minutes for consent vs 5 for auth) and document in security-spec. Update mockup Failure state text. (Closes H-2.)
3. **Builder (mockup revision)**: Add comment or state stub for rate-limit exhaustion (429) handling. (Closes H-3.) Medium/low priority — can be done in the live build step with a code comment.

Items M-1 and M-2 are live-build reminders for the Builder session. L-1 through L-3 are backlog debt.
