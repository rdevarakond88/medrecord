# Security Audit — P1–P5 Patient App

**Screens:** P1 Patient Login, P2 My Records Timeline, P3 Visit Detail,
P4 Doctors Who Have Access, P5 Patient Profile
**Backend:** Patient-facing endpoints + auth routes + consent routes (live on Render)
**Auditor:** Security Agent
**Date:** 2026-05-16
**Verdict:** BLOCKED — 2 CRITICAL issues in live production backend

---

## CRITICAL (must fix before merge — backend is LIVE NOW)

### C-1 — OTP plaintext + mobile number logged unconditionally to stdout in production
**File:** `backend/src/routes/auth.ts`, line 66
```js
console.log(`[OTP] ${mobile_number}: ${rawOtp}  (token: ${otpToken})`);
```
This line runs on every `POST /auth/send-otp` in ALL environments including the live Render deployment. It is not gated behind `TEST_OTP_BYPASS` or `NODE_ENV`. Anyone with Render dashboard log access or a log drain can read live OTPs and mobile numbers as they are generated.

**Risk:** Full account takeover. OTPs are the only authentication credential. Mobile numbers are PII under DPDP Act 2023.

**Fix:** Gate behind environment check:
```js
if (process.env.NODE_ENV !== 'production' || process.env.TEST_OTP_BYPASS === 'true') {
  console.log(`[OTP-DEV] ${mobile_number}: ${rawOtp}  (token: ${otpToken})`);
}
if (process.env.TEST_OTP_BYPASS === 'true') {
  console.log(`[OTP] Test bypass is ON — you may also enter: 000000`);
}
```

---

### C-2 — Consent OTP plaintext + mobile number logged in BOTH branches
**File:** `backend/src/routes/consent.ts`, lines 106–110
```js
if (process.env.TEST_OTP_BYPASS === 'true') {
  console.log(`[CONSENT OTP] patient=${patient.mobileNumber} otp=${rawOtp} token=${otpToken}`);
} else {
  // TODO: wire real SMS provider
  console.log(`[SMS] Send OTP ${rawOtp} to ${patient.mobileNumber}`);
}
```
The `else` branch (placeholder for real SMS provider) still logs the raw OTP and mobile number. Both branches expose credentials unconditionally.

**Risk:** Same as C-1. Any observer of Render logs can extract consent OTPs in real-time and either grant consent to themselves or block a legitimate grant attempt.

**Fix:** Replace the else branch:
```js
} else {
  // TODO: wire real SMS provider (Twilio / MSG91 / AWS SNS)
  console.log(`[SMS] Consent OTP queued for patient (production — SMS provider not yet wired)`);
}
```

---

## HIGH (fix before v1 launch)

### H-1 — `DELETE /consent/:id` missing IDOR ownership guard
**File:** `backend/src/routes/consent.ts`, lines 231–260
```js
router.delete('/consent/:id', requireAuth, async (req, res) => {
  const consent = await prisma.consent.findUnique({ where: { id: consentId } });
  // ← No check that requester owns this consent
  await prisma.consent.update({ where: { id: consentId }, data: { revokedAt } });
```
`requireAuth` allows any authenticated role. No ownership check validates that the caller is the patient whose consent this is, or the doctor named in it. The audit log also hardcodes `actorRole: 'doctor'` even if a patient JWT calls this endpoint.

Note: The correct patient-facing revocation route (`DELETE /patient/consents/:id` in `patient.ts`) **does** have the IDOR guard and is properly secured. This is the legacy doctor-side endpoint.

**Risk:** Any authenticated user (including a patient) who obtains or guesses a consent UUID can silently revoke any patient's consent to any doctor. Consent UUIDs are v4 UUIDs so brute-force is impractical, but the exposure remains if a UUID leaks via any log or API response.

**Fix:** Add ownership guard before the update:
```js
if (consent.patientId !== req.auth!.sub && consent.doctorId !== req.auth!.sub) {
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  return;
}
```
Also fix: replace hardcoded `actorRole: 'doctor'` with `req.auth!.role` in the audit log call.

---

## MEDIUM (fix in next sprint)

### M-1 — Consent routes use `requireAuth` instead of `requireDoctorAuth`
**File:** `backend/src/routes/consent.ts`
- `POST /consent/request` (line 68) — doctor-only operation
- `POST /consent/verify` (line 139) — doctor-only operation
- `POST /consent/pending-request` (line 270) — doctor-only operation

A patient JWT can call all three. Practical risk is mitigated by FK constraints (patient UUID ≠ valid doctor UUID in DB — Prisma would throw a constraint error), but the authorization design is wrong.

**Fix:** Replace `requireAuth` with `requireDoctorAuth` on all three routes.

### M-2 — Patient screens P2–P5 need auth guards — wire-step mandate
**Files:** PatientTimelineScreen.tsx, PatientVisitDetailScreen.tsx, PatientDoctorsAccessScreen.tsx, PatientProfileScreen.tsx

None of these screens check for a valid patient JWT before rendering. Not a current bug (screens are mockups with no real data), but a mandatory wire-step requirement.

**Fix (wire step):** Add this guard at the start of each screen component after hooks:
```js
if (!patientToken || !patientUser) {
  navigation.replace('PatientLogin');
  return null;
}
```

### M-3 — P5 Logout does not clear patient auth state or secure-store — wire-step mandate
**File:** `src/screens/patient/PatientProfileScreen.tsx`, lines 272–278

`handleLogout` navigates to PatientLogin but does NOT clear the expo-secure-store refresh token or Zustand patient auth state. On a shared or stolen device, the refresh token persists and the next user could resume the session.

**Fix (wire step):** Before navigating, call:
1. Clear Zustand patient auth store
2. Delete patient refresh token from expo-secure-store
3. Clear SQLite patient record cache (same pattern as `clearDoctorVisits()` for doctors)
Then navigate to PatientLogin.

### M-4 — `GET /patients/:id/consent/check` uses `requireAuth` instead of `requireDoctorAuth`
**File:** `backend/src/routes/consent.ts`, line 27

A patient JWT can call this endpoint. With a patient UUID as `doctorId`, no consents are found (patients aren't doctors), so the practical return is always `has_consent: false`. Low impact but authorization design is wrong.

**Fix:** Replace `requireAuth` with `requireDoctorAuth`.

---

## LOW (track in backlog)

### L-1 — JWT access token currently 24h — reduce to 15m before production
**File:** `backend/src/utils/jwt.ts`, line 7 (`ACCESS_TOKEN_EXPIRY = '24h'`)

Already commented: "reduce to 15m before production launch." The `expires_in: 86400` in auth responses is consistent with the actual JWT expiry — no client/server mismatch. Pure configuration.

**Fix:** Change `'24h'` → `'900'` (15 minutes in seconds) and update `expires_in` response from `86400` to `900` before production launch.

### L-2 — P5 Name TextInput missing `maxLength` prop
**File:** `src/screens/patient/PatientProfileScreen.tsx`

Backend validates max 255 chars via Zod, but the TextInput for Name has no `maxLength`. Users can type arbitrarily long names; server rejects at submission.

**Fix:** Add `maxLength={255}` to the Name EditRow's TextInput.

### L-3 — DOB field accepts future dates on server
**File:** `backend/src/routes/patient.ts`, `updateProfileSchema`

The regex validates `YYYY-MM-DD` format only; no check that `date_of_birth` is in the past.

**Fix:** Add `.refine(d => new Date(d) < new Date(), 'DOB cannot be a future date')` to the date_of_birth Zod field.

---

## Checklist Status

| Category | Result | Notes |
|---|---|---|
| Authentication & Sessions | ✅ 6/6 | JWT expiry enforced, refresh rotation implemented, OTP attempts limited, OTP bcrypt-hashed, OTPs purged on use, rate limiting on auth endpoints |
| Authorisation | ⚠️ 5/7 | All patient-facing IDOR guards present ✅; `DELETE /consent/:id` missing IDOR ❌; three consent routes use wrong auth level ❌ |
| Data Handling | ❌ 4/6 | No Aadhaar data ✅, no mobile in patient-facing logs ✅, S3 N/A (images are local) ✅; OTP + mobile in auth.ts log ❌; OTP + mobile in consent.ts log ❌; no PII in error messages ✅ |
| Mobile Security | ⚠️ 3/5 | Cert pinning on EAS build ✅; patient auth guard needed at wire step ❌; logout incomplete at wire step ❌ |
| Input Validation | ✅ 4/5 | Mobile 10-digit/6-9 validated on client and server ✅, OTP 6-digit validated ✅, Zod on all endpoints ✅, name max length server-side ✅; future DOB not blocked ❌ |
| Database | ✅ 4/4 | Parameterised queries (Prisma) ✅, soft-delete excluded ✅, audit log on all sensitive ops ✅, IDOR guards on all patient routes ✅ |
| DPDP Compliance | ✅ 5/5 | Consent model ✅, revocation ✅, consent audit trail ✅, patient can revoke at any time ✅, data in ap-south-1 ✅ |

---

## Overall Verdict

**BLOCKED — 2 CRITICAL issues (C-1, C-2) in live production backend.**

OTPs and mobile numbers are being written to stdout on every auth and consent OTP request in the current live deployment. This must be fixed immediately.

**Required next steps:**
1. **Builder Agent session** — fix C-1, C-2 (remove OTP from production logs), H-1 (add IDOR guard to `DELETE /consent/:id`), and M-1 (`requireDoctorAuth` on 3 consent routes)
2. **Security Agent re-check** — verify fixes before proceeding to QA
3. **QA Agent** — after security re-check passes

Wire-step mandates (M-2, M-3) must be tracked as mandatory requirements for the P1–P5 wire session.
