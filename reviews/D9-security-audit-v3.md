# SECURITY AUDIT — D9 Consent Request Flow (v3)

**Version:** v3 (post-device-testing Builder sessions 1, 2, 3)
**Date:** 2026-05-10
**Auditor:** Security Agent
**Files reviewed:**
- `src/screens/doctor/ConsentRequestScreen.tsx`
- `App.tsx` (ConsentRequest route — gestureEnabled:false + params type)
- `src/api/consent.ts`
- `src/db/visits.ts` (logConsentRequested, lines 608–621)

**Prior audit:** v2 (2026-05-09) — Verdict: Clear to merge; M-1 + M-2 flagged for fix before device testing.

---

## CRITICAL (must fix before merge)

None.

---

## HIGH (fix before v1 launch)

None.

---

## MEDIUM (fix before v1 launch)

None. Both prior MEDIUM findings are now closed (see Prior Findings below).

---

## LOW (track in backlog)

### L-1: Patient full name in DoctorHeader (States 2, 6, 7, 8)

**Carried from v2.** `headerSubtitle` shows `patientName` unabbreviated. D9 is a brief transient flow, reducing exposure vs D3. Accepted debt for v1.

### L-2: `sendConsentRequest()` fires before auth guard check

**Carried from v2.** `useEffect(() => { void sendConsentRequest(); }, [])` is registered before the `if (!token || !user) return null` guard. If auth store is null, `user!.id` throws; swallowed by non-blocking try/catch; API call gets 401 → error state shown. In practice, ConsentRequest is only reachable from D3 (which has its own auth guard), so auth store is always populated. Same accepted pattern as D2/D3/D6.

### L-3: Three setInterval timers run from mount regardless of flowState

**Carried from v2.** All three countdown timers (resend, OTP expiry, rate limit) run from mount. Math.max/Math.ceil guard against negative values. No security impact — minor CPU cost only.

---

## Prior Findings Verification

| Prior Finding | Status |
|---|---|
| M-1 (v2): Confirm button enabled on expired OTP | ✅ **CLOSED** — `(!isComplete \|\| expiryExpired)` in style; `onPress={expiryExpired ? undefined : ...}` |
| M-2 (v2): Full `patientMobile` in ConsentRequest nav params | ✅ **CLOSED** — removed from route params in App.tsx; `handleStartNewVisit` re-reads mobile from SQLite via `getPatientByLocalId` |
| L-1 (v2): Patient name in DoctorHeader | ⚠️ **Carried** — accepted debt for v1 |
| L-2 (v2): sendConsentRequest before auth guard | ⚠️ **Carried** — accepted debt; screen only reachable from D3 |
| L-3 (v2): Three timers run from mount | ⚠️ **Carried** — accepted debt; CPU only |

---

## Device-Testing Fix Analysis (Builder sessions 1–3, 2026-05-10)

| Fix | Security Impact |
|---|---|
| DT1-1 — State 2 icon ✉ → 💬 | None — pure UI |
| DT1-2 — Backspace clears previous OTP box before refocus | None — input handling; digits still sanitized by `/[^0-9]/g` in `handleDigitChange` |
| DT1-3 — `beforeRemove` intercepts State 6 (failure) → State 2 | **Security-positive.** Without this, back from State 6 exits D9, `otp_token` is lost, re-entry to D9 issues a fresh token — silently resetting the server-side per-token attempt count. Fix preserves the token and keeps the doctor within the same token's attempt budget, preventing attempt-count bypass via screen exit/re-enter. |
| DT1-4 — `NetInfo.fetch()` check before handleConfirm | Neutral — consistent with project's `isConnected === false` strict-check pattern (D3, D6). If `isConnected` is null (iOS probe in progress), submit proceeds and the `catch` block handles any resulting network failure. |
| DT2-1 → DT3-1 — `gestureEnabled: false` static in App.tsx `Stack.Screen` | **Security-positive.** iOS NativeStack ignores `beforeRemove` for swipe gestures. Static option blocks swipe-back for the entire screen, eliminating the bypass around the attempt-count protection in States 3 and 6. Programmatic `navigation.goBack()` in all other states (DoctorHeader back button, State 5 auto-return) is unaffected — `gestureEnabled` only blocks the swipe gesture. |

---

## Checklist Status

| Category | Result |
|---|---|
| ✅ Authentication & Sessions | 6/6 — OTP attempt limits enforced (400 → attemptsRemaining, 410 → exhausted); rate limit enforced (429 → State 8); JWT sent on all calls; attempt-count bypass via screen re-entry closed (DT1-3 + DT3-1) |
| ✅ Authorisation | 5/5 applicable — all API calls carry Bearer JWT; consent signal traced end-to-end (OTP verify → goBack → D3 useFocusEffect re-validates from server) |
| ✅ Data Handling | 5/5 — no console.log; no PII in logs; M-2 closed (patientMobile removed from nav params); maskedMobile only in UI |
| ✅ Mobile Security | 3/3 applicable — `pinnedFetch` on all consent calls; no `console.log` anywhere in screen; no sensitive data in renders |
| ✅ Input Validation | 3/3 — digit-only input enforced; Confirm blocked on incomplete OTP; Confirm blocked on expired OTP (M-1 closed) |
| ✅ Database / Audit | 4/4 — parameterised INSERT; `logConsentRequested` called on initial request and every resend; insert-only; no PII in event fields |
| ✅ DPDP Compliance | 3/3 applicable — `consent_request_initiated` audit event emitted before each POST /consent/request; revocation and export not D9 scope |

---

## OVERALL VERDICT: CLEAR TO MERGE — 0 critical, 0 high, 0 medium findings

Both prior MEDIUM findings (M-1, M-2) are confirmed closed. Device-testing fixes introduced no new security vulnerabilities. DT1-3 (beforeRemove for State 6) and DT3-1 (static gestureEnabled: false) are security-positive improvements that close a latent attempt-count bypass path.

Three LOW items carried from v2 — accepted debt for v1.

**Next step:** PM Agent — D9 flow closure and merge to main.
