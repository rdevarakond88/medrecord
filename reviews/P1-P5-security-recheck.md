# Security Re-check — P1–P5 Patient App

**Original audit:** `reviews/P1-P5-security-audit.md`
**Re-check scope:** C-1, C-2, H-1, M-1 (all findings mandated for fix before QA)
**Auditor:** Security Agent
**Date:** 2026-05-16
**Verdict:** CLEAR TO QA

---

## Fix Verification

### C-1 — OTP plaintext logged unconditionally in auth.ts ✅ FIXED

**File:** `backend/src/routes/auth.ts`, lines 64–70

```js
// OTP log — dev/bypass only; never logged in production
if (process.env.NODE_ENV !== 'production' || process.env.TEST_OTP_BYPASS === 'true') {
  console.log(`[OTP-DEV] ${mobile_number}: ${rawOtp}  (token: ${otpToken})`);
}
if (process.env.TEST_OTP_BYPASS === 'true') {
  console.log(`[OTP] Test bypass is ON — you may also enter: 000000`);
}
```

**Verification:** In production (`NODE_ENV=production`, no bypass): neither branch executes — OTP and mobile number are never written to stdout. In dev/bypass: OTP logged only when intentional. Matches the prescribed fix exactly.

---

### C-2 — Consent OTP logged in both branches in consent.ts ✅ FIXED

**File:** `backend/src/routes/consent.ts`, lines 105–111

```js
// Consent OTP log — dev/bypass only; never logged in production
if (process.env.TEST_OTP_BYPASS === 'true') {
  console.log(`[CONSENT OTP-DEV] patient=${patient.mobileNumber} otp=${rawOtp} token=${otpToken}`);
} else {
  // TODO: wire real SMS provider (Twilio / MSG91 / AWS SNS)
  console.log(`[SMS] Consent OTP queued for patient (production — SMS provider not yet wired)`);
}
```

**Verification:** The `else` branch (production path) now logs a generic string with no PII, no OTP, no mobile number. The bypass path only runs when `TEST_OTP_BYPASS=true`. Original risk fully eliminated.

---

### H-1 — `DELETE /consent/:id` missing IDOR ownership guard ✅ FIXED

**File:** `backend/src/routes/consent.ts`, lines 241–245 and line 256

```js
// IDOR guard: only the patient or the doctor named on the consent may revoke it
if (consent.patientId !== req.auth!.sub && consent.doctorId !== req.auth!.sub) {
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  return;
}
```

```js
actorRole: req.auth!.role,   // line 256 — was hardcoded 'doctor'
```

**Verification:** Any caller whose `sub` does not match `patientId` or `doctorId` on the consent record receives HTTP 403. The audit log now records the actual caller role from the JWT rather than a hardcoded string. Both required elements of the fix are present.

---

### M-1 — Consent routes using `requireAuth` instead of `requireDoctorAuth` ✅ FIXED

**File:** `backend/src/routes/consent.ts`

| Route | Line | Before | After |
|---|---|---|---|
| `POST /consent/request` | 70 | `requireAuth` | `requireDoctorAuth` |
| `POST /consent/verify` | 138 | `requireAuth` | `requireDoctorAuth` |
| `POST /consent/pending-request` | 278 | `requireAuth` | `requireDoctorAuth` |

**Verification:** All three routes now reject patient JWTs at the auth middleware layer. The original audit correctly noted that FK constraints provided incidental protection; that incidental protection is now backed by explicit authorization.

---

## Open Items Carried Forward

### M-4 — `GET /patients/:id/consent/check` uses `requireAuth` ⚠️ OPEN (MEDIUM)

**File:** `backend/src/routes/consent.ts`, line 27

Not included in the mandatory fix scope for this re-check. Practical impact remains low (patient UUID ≠ doctor UUID → always returns `has_consent: false`; no data leakage). Track for next sprint.

### Wire-step mandates — deferred, not yet applicable

| ID | Requirement | When |
|---|---|---|
| M-2 | Auth guards on P2–P5 patient screens | P1–P5 wire session |
| M-3 | P5 logout clears patient auth state + secure-store | P1–P5 wire session |

These are mockup screens with no live data — not a current risk. Must be applied before wire step completes.

---

## Updated Checklist

| Category | Result | Notes |
|---|---|---|
| Authentication & Sessions | ✅ 6/6 | JWT expiry enforced, refresh rotation, OTP attempts limited, OTP bcrypt-hashed, OTPs purged on use, rate limiting |
| Authorisation | ✅ 6/7 | All patient IDOR guards present ✅; `DELETE /consent/:id` IDOR guard added ✅; three consent routes use `requireDoctorAuth` ✅; `/consent/check` still uses `requireAuth` ⚠️ |
| Data Handling | ✅ 6/6 | No Aadhaar ✅, no mobile in patient-facing logs ✅, S3 N/A ✅, OTP log gated ✅, consent OTP log gated ✅, no PII in error messages ✅ |
| Mobile Security | ⚠️ 3/5 | Cert pinning ✅; patient auth guard needed at wire step ❌; logout incomplete at wire step ❌ |
| Input Validation | ✅ 4/5 | All present; future DOB not blocked ❌ (LOW backlog) |
| Database | ✅ 4/4 | Parameterised queries ✅, soft-delete excluded ✅, audit log ✅, IDOR guards ✅ |
| DPDP Compliance | ✅ 5/5 | Consent model ✅, revocation ✅, audit trail ✅, patient can revoke ✅, data in ap-south-1 ✅ |

---

## Overall Verdict

**CLEAR TO QA.**

All four mandatory findings (C-1, C-2, H-1, M-1) are correctly fixed and verified against the prescribed remediation in the original audit. The two CRITICAL data-exposure issues are fully resolved. The HIGH IDOR vulnerability is closed. The three MEDIUM misauthorised routes now enforce doctor-only access.

Remaining open items are wire-step mandates (M-2, M-3) and MEDIUM/LOW backlog items that do not block QA.

**Required next step:** QA Agent — P1–P5 Patient App.
