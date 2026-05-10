# SECURITY AUDIT — D9 Consent Request Flow (Live Screen)

**Version:** v2 (live screen — post-Builder QA fixes)
**Date:** 2026-05-09
**Auditor:** Security Agent
**Files reviewed:**
- `src/screens/doctor/ConsentRequestScreen.tsx`
- `src/api/consent.ts`
- `src/db/visits.ts` (logConsentRequested, lines 602–621)
- `src/screens/doctor/PatientDetailScreen.tsx` (navigate → ConsentRequest, lines 375–393)
- `App.tsx` (ConsentRequest route param type, lines 78–84)
- `docs/security-spec.md`
- `docs/consent-layer-spec.md`
- `docs/api-contracts.md` (consent endpoints section)
- `reviews/D9-security-audit.md` (v1 mockup audit — cross-reference)

**Prior audit verdict:** BLOCKED — C-1 (POST /consent bypass). All prior CRITICAL/HIGH/MEDIUM findings from v1 mockup audit confirmed addressed in this live build.

---

## CRITICAL (must fix before merge)

None.

---

## HIGH (fix before v1 launch)

None.

---

## MEDIUM (fix before device testing / v1 launch)

### M-1: Confirm button not disabled when client-side OTP countdown reaches zero

**File:** `src/screens/doctor/ConsentRequestScreen.tsx` lines 548–549, 609–614

```tsx
const expiryExpired = otpSecondsLeft === 0;   // computed — line 549
...
<TouchableOpacity
  style={[
    styles.patientConfirmButton,
    !isComplete && styles.patientConfirmButtonDisabled,   // only isComplete checked
  ]}
```

When `expiryExpired === true`, the "Code expired — ask your doctor to resend" label renders correctly (lines 602–607), but the Confirm button remains active (blue, pressable) if all 6 boxes are filled. A patient who fills all 6 digits just before expiry sees a visually active Confirm button contradicting the "Code expired" text immediately below.

**Risk:** No security bypass — the server returns 410 (exhausted/expired) and the screen transitions to State 6 correctly. However, the active button on an expired OTP consumes the patient's interaction and returns a confusing 410 error in low-literacy clinic settings.

**Fix:**
```tsx
style={[
  styles.patientConfirmButton,
  (!isComplete || expiryExpired) && styles.patientConfirmButtonDisabled,
]}
onPress={expiryExpired ? undefined : () => void handleConfirm()}
```

---

### M-2: Full `patientMobile` (unmasked) carried as navigation route param through entire D9 stack

**File:** `App.tsx` lines 78–84; `src/screens/doctor/PatientDetailScreen.tsx` line 387

```ts
ConsentRequest: {
  patientLocalId:  string;
  patientServerId: string | null;
  patientName:     string;
  maskedMobile:    string;
  patientMobile:   string;   // full unmasked mobile number
};
```

React Navigation serializes route params to a plain JS object, readable via `navigation.getState()` and captured by crash reporting integrations (Sentry, Bugsnag), React Native devtools (Flipper), and any navigation state persistence layer. The full mobile number is not logged within D9, but its presence in serialized navigation state creates a data-minimization surface under DPDP Act 2023 §5 (purpose limitation, data minimisation).

`patientMobile` is only used in `handleStartNewVisit` (State 7 path) to navigate to D6. It is displayed nowhere on D9 — all display uses `maskedMobile`.

**Risk:** If a crash reporting SDK captures navigation state (common default behaviour), the full mobile number of every patient for whom a consent request is initiated could be transmitted off-device.

**Fix (preferred):** Remove `patientMobile` from the `ConsentRequest` route params. In `handleStartNewVisit`, re-read the mobile from SQLite via `getPatientByLocalId(db, patientLocalId)` before navigating to D6. The SQLite read adds negligible latency on the State 7 exit path (not the hot path).

**Fix (acceptable for v1):** If SQLite re-read is deferred, verify no crash reporting SDK is configured to capture React Navigation route state and document as accepted debt.

---

## LOW (track in backlog)

### L-1: Patient full name visible in `DoctorHeader` (States 2, 6, 7, 8)

**File:** `src/screens/doctor/ConsentRequestScreen.tsx` lines 401–404

`headerSubtitle` shows `patientName` unabbreviated in all doctor-facing states. Same debt tracked from D3 (name-dimming / idle-timeout). D9 is a brief transient flow, reducing exposure vs D3. Accepted debt for v1.

### L-2: `sendConsentRequest()` called via `useEffect` before auth guard check

**File:** `src/screens/doctor/ConsentRequestScreen.tsx` lines 198–200, 205

`useEffect(() => { void sendConsentRequest(); }, [])` is registered before the `if (!token || !user) return null` auth guard. If the auth store is null on first render, the effect fires and calls `user!.id`; the TypeError is swallowed by the non-blocking `try/catch`; the subsequent API call sends `Authorization: Bearer null` and gets a 401 → generic error state shown. In practice, ConsentRequest is only reachable from D3 (which has its own auth guard), so the auth store is always populated. Same accepted pattern as D2/D3/D6.

### L-3: Three `setInterval` timers run from mount regardless of `flowState`

**File:** `src/screens/doctor/ConsentRequestScreen.tsx` lines 150–175

All three countdown timers (resend, OTP expiry, rate limit) run from mount regardless of which state is displayed. Math.max/Math.ceil guard against negative values. No security impact — minor CPU cost only.

---

## Checklist Status

| Category | Result |
|---|---|
| ✅ Authentication & Sessions | 6/6 — OTP attempt limits handled (400→attemptsRemaining, 410→exhausted), rate limit handled (429→State 8), JWT sent on all calls |
| ✅ Authorisation | 5/5 applicable — all API calls carry Bearer JWT; consent signal traced end-to-end (OTP verify → goBack → D3 useFocusEffect re-validates from server) |
| ⚠️ Data Handling | 4/4 log checks pass; M-2 flagged — full mobile in nav params |
| ✅ Mobile Security | 3/3 applicable — `pinnedFetch` on all consent calls; no `console.log`; no sensitive data in renders |
| ⚠️ Input Validation | 2/2 applicable checks pass; M-1 flagged — Confirm enabled on expired OTP |
| ✅ Database / Audit | 4/4 — parameterised INSERT; `logConsentRequested` called on initial request and every resend; insert-only |
| ✅ DPDP Compliance | 3/3 applicable — `consent_request_initiated` audit event emitted before each POST /consent/request; revocation and export not D9 scope |

---

## Prior Findings Verification

| Prior Finding | Status in Live Build |
|---|---|
| C-1: POST /consent bypass | ✅ **Closed** — replaced with POST /consent/request + POST /consent/verify OTP two-step |
| H-1: Missing endpoint contracts | ✅ **Closed** — contracts in api-contracts.md; live screen implements them correctly |
| H-2: Consent OTP expiry unspecified | ✅ **Closed** — PM confirmed 10 min; `OTP_EXPIRY_SECS = 600` and countdown shown (M-2) |
| H-3: No 429 UI state | ✅ **Closed** — State 8 (rate_limited) fully implemented |
| M-1 (prior): No tap guard on Confirm | ✅ **Closed** — `isSubmittingRef = useRef(false)` implemented |
| M-2 (prior): No DPDP audit event | ✅ **Closed** — `logConsentRequested()` called on mount and every resend |
| M-3 (prior): Ambiguous failure messaging | ✅ **Closed** — distinct messages for 400 (invalid_otp + attemptsRemaining) vs 410 (exhausted) |
| L-1 (prior): Patient name in DoctorHeader | ⚠️ **Carried forward** — accepted debt for v1 |
| L-2 (prior): Dev state navigator no __DEV__ guard | ✅ **Closed** — live screen has no dev navigator |

---

## OVERALL VERDICT: CLEAR TO MERGE — 0 critical, 0 high findings

Two MEDIUM items (M-1 Confirm button on expired OTP, M-2 full mobile in nav params) should be
fixed before device testing begins. Both are straightforward fixes. Neither blocks the security
audit gate.

**Next step:** Builder Agent — fix M-1 and M-2, then Device Tester session.
