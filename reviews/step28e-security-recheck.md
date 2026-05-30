# Security Re-check — Step 28e
**Scope:** `PATCH /patient/profile` mobile field guard only  
**File:** `backend/src/routes/patient.ts` lines 77–137  
**Change introduced in:** Step 28d (Builder Agent, 2026-05-30)  
**Agent:** Security Agent  
**Date:** 2026-05-30  

---

## Verdict: CLEAR TO MERGE

0 CRITICAL · 0 HIGH · 0 MEDIUM · 1 LOW (informational, v2 debt)

---

## Audit Checklist

### 1. Guard fires before `validate()`?

**PASS.**

Route chain for `PATCH /patient/profile`:
1. `requirePatientAuth` — router-level (line 25), runs first for all routes in this file
2. Inline guard `(req, res, next) => { mobile_number check }` — first argument to `router.patch()`
3. `validate(updateProfileSchema)` — second argument
4. Async handler

The inline guard is position 2 in the chain, before Zod (`validate`) at position 3. When `mobile_number` is present in the body, the guard returns 400 and calls `return` without calling `next()` — the Zod validator and handler never execute.

### 2. Returns HTTP 400 + `MOBILE_IMMUTABLE` when `mobile_number` is in body?

**PASS.**

```ts
if (req.body && typeof req.body === 'object' && 'mobile_number' in req.body) {
  res.status(400).json({
    error: {
      code:    'MOBILE_IMMUTABLE',
      message: 'Mobile number cannot be changed. Contact support for account recovery.',
    },
  });
  return;
}
```

- `req.body && typeof req.body === 'object'` — safe for null/undefined body (null is falsy, short-circuits)
- `'mobile_number' in req.body` — uses the `in` operator, fires when the key exists regardless of value (`null`, `""`, etc.) ✅
- `return` after `res.status(400).json(...)` — `next()` is not called; chain stops here ✅
- No PII in the 400 response body — error code + static user-facing message only ✅

### 3. No new auth/PII exposure?

**PASS.**

- `requirePatientAuth` (auth.ts:30–38) runs before the guard: verifies JWT, checks `role === 'patient'`. Unauthenticated requests get 401 before reaching the guard. Doctor tokens get 403. ✅
- `patientId` in the handler is always `req.auth!.sub` (JWT claim, line 94) — never from body or query params ✅
- `prisma.patient.update` uses `where: { id: patientId }` — patient-scoped, no cross-patient risk ✅
- Error paths (`catch`, `findFirst` null) do not expose PII ✅
- `console.error('[PATCH /patient/profile]', err)` on 500 — logs to server stderr only, not to client ✅

### 4. Could the guard be bypassed?

**No viable bypass found.**

- **camelCase `mobileNumber`**: Not caught by the guard, but `updateProfileSchema` only accepts `name`, `date_of_birth`, `preferred_language`. Zod strips unknown fields at `validate()` (`req.body = result.data` in validate.ts:18). `mobileNumber` is silently dropped and never reaches the handler. No bypass — two independent layers.
- **URL query param `?mobile_number=...`**: Guard checks `req.body` only. Handler uses `body.name/date_of_birth/preferred_language` — no query params used. ✅
- **`__proto__` injection**: Node.js JSON body parser (standard Express setup) creates plain objects via `JSON.parse`. `__proto__` injection in JSON doesn't set properties on `Object.prototype` in Node.js ≥ 12 (CVE-2019-26485 mitigations in place). Not a viable vector.
- **`mobile_number: undefined` in JSON**: `JSON.parse` strips `undefined` values from JSON. A body of `{"mobile_number":null}` → key present → guard fires ✅. No way to send `mobile_number` as `undefined` via JSON.

### 5. `updateProfileSchema` as second layer?

**PASS — defense in depth.**

Even if the guard were somehow bypassed:
```ts
const updateProfileSchema = z.object({
  name:               z.string()...,
  date_of_birth:      z.string()...,
  preferred_language: z.enum(VALID_LANGUAGES)...,
})
```
Zod only allows these three fields. After `validate()`, `req.body` contains only `result.data` — unknown fields (including `mobile_number`) are stripped. The handler cannot reach `body.mobile_number`. ✅

---

## Findings

### LOW — 28e-L1: No audit event on `MOBILE_IMMUTABLE` rejection

**File:** `backend/src/routes/patient.ts`, lines 80–90  
**Risk:** Informational — no data exposure, no functional impact.

A patient repeatedly sending `mobile_number` in `PATCH /patient/profile` requests generates no `logAudit()` call. The attempt leaves no trace in the audit log. In a regulated production deployment where patients can request their complete access log (DPDP Act §8), repeated probing would be invisible.

**Recommendation:** Add a `logAudit({ event: 'patient.profile_mobile_change_blocked', ... })` call before the 400 response. One line.

**Disposition:** Accepted as v2 debt. No real patients exist in this deployment. Does not block merge.

---

## Summary

The Step 28d mobile guard is correctly implemented. Execution order is correct (guard before validate), the 400/MOBILE_IMMUTABLE response fires on any body containing `mobile_number`, auth chain is intact, no PII is exposed in any path. The Zod schema provides independent second-layer protection against bypass.

**Next step:** Session is complete — no Builder session required.
