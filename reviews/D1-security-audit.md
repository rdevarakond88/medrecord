# Security Audit — D1 / P1: Login / OTP Screen
_Audited: 2026-03-16 | Auditor: Security Agent_
_Files reviewed: `src/screens/doctor/LoginScreen.tsx`, `src/store/useAuthStore.ts`_
_Spec refs: `docs/security-spec.md`, `docs/consent-layer-spec.md`, `agents/agent-security.md`_

---

## Context

This is a **static mockup**. All network calls are mocked via `mockSendOtp()` and `mockVerifyOtp()` in the file itself. The real implementation will live in `src/api/auth.ts` (not yet built). This audit covers:
1. Security issues in the mockup that are actionable now.
2. Flagged requirements for `auth.ts` that cannot be verified today but are mandatory before the real screen is wired.

---

## HIGH (fix before `auth.ts` is wired)

### H-1: Demo state switcher rendered unconditionally — no `__DEV__` guard

**File:** `src/screens/doctor/LoginScreen.tsx`, lines 440–468

**Risk:** The entire demo block — including the inline hint text `"Wrong OTP: enter 999999 · Expired OTP: enter 000000 · Any other 6-digit: success"` — is rendered unconditionally in every build. If `mockVerifyOtp` is not replaced before production shipping (the two-failure scenario: demo block survives AND mock functions survive), this text tells an attacker the exact bypass code. More concretely: if QA testers run builds from `dev` on real devices, this text is visible and could cause confusion about what is "real" auth behaviour.

The mock bypass is entirely in `mockVerifyOtp`. The demo block amplifies the risk by advertising the codes. Both must go before any production build, but the demo block can be mechanically protected right now.

**Fix:** Wrap the entire demo block in `{__DEV__ && (...)}`. This guarantees it cannot appear in any production/release build regardless of whether someone forgets to remove it:
```tsx
{__DEV__ && (
  <View style={styles.demoBlock}>
    ...
  </View>
)}
```

---

### H-2: Refresh token never written to `expo-secure-store` in the login flow

**File:** `src/screens/doctor/LoginScreen.tsx`, line 192; `src/store/useAuthStore.ts`, lines 1–8

**Risk:** After successful OTP verification, the screen calls `setAuth(token, user)` and navigates to `PatientSearch`. The `useAuthStore` comment explicitly states: _"The refresh token is stored in expo-secure-store (handled in D1 login flow)."_ But the D1 login flow currently does not write any refresh token to `expo-secure-store`. When `auth.ts` is wired, if this step is missed:

- Sessions cannot be silently restored after app restart (doctors must re-enter OTP every cold start — unacceptable UX and an operational failure for the 5-minute app-lock feature).
- If a developer fills the gap by storing the refresh token in AsyncStorage instead (a common mistake), it is stored in plaintext on the device filesystem — violating the security spec (`docs/security-spec.md` §At Rest, §Device Security).

**Fix (for `auth.ts` implementation):** The verify-OTP API response must return `{ access_token, refresh_token, user }`. The login flow must:
```ts
import * as SecureStore from 'expo-secure-store';
import { REFRESH_TOKEN_KEY } from '../auth/constants';  // already exists — see sync worker

// After successful verify:
await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, response.refresh_token);
setAuth(response.access_token, response.user);           // in-memory only
navigation.replace('PatientSearch');
```
`REFRESH_TOKEN_KEY` is already defined in `src/auth/constants.ts` (confirmed in sync worker session). Access token stays in-memory Zustand only; never persisted.

---

### H-3: Session restoration on app launch is absent from D1

**File:** `src/screens/doctor/LoginScreen.tsx` (absent)

**Risk:** The spec requires a 30-day refresh token. Without a session restoration check, every app cold-start sends the doctor through the full OTP flow — contradicting the spec and the existing `tryRefreshToken()` infrastructure already built in `syncWorker.ts` (sync worker session, 2026-03-13). If the sync worker can silently refresh the token, the login screen must also do so on cold start.

**Fix (for `auth.ts` / app launch logic):** On `App.tsx` mount (or a dedicated splash screen), before rendering the navigator:
1. Read `REFRESH_TOKEN_KEY` from `expo-secure-store`.
2. If present: call `POST /auth/refresh` via `pinnedFetch` (already exists).
3. On success: call `setAuth(newAccessToken, user)` + navigate to `PatientSearch`.
4. On failure (expired / revoked): clear secure store, navigate to `Login`.
5. If absent: navigate to `Login` directly.

This is the complement to H-2 — writing the refresh token at login is only useful if it is read on restart.

---

## MEDIUM (fix before live build of D1)

### M-1: Phone number not validated for valid Indian mobile prefix (digits 6–9)

**File:** `src/screens/doctor/LoginScreen.tsx`, line 164

**Risk:** `handleSendOtp` only checks `phone.length !== 10`. Numbers beginning with 0–5 are not valid Indian mobile numbers but will pass this guard and trigger a server OTP request. D2 already enforces this (closed HIGH item H-3, 2026-02-22). D1 must be consistent. Inconsistency between screens signals the check is not a first-class contract.

**Fix:** Add a start-digit validation at the `handleSendOtp` guard and as a `TextInput` input filter:
```ts
// In handleSendOtp:
const firstDigit = parseInt(phone[0], 10);
if (phone.length !== 10 || firstDigit < 6) return;

// In onChangeText:
const digits = t.replace(/\D/g, '').slice(0, 10);
// Reject first digit 0–5 at input layer (same pattern as D2):
if (digits.length === 1 && parseInt(digits[0], 10) < 6) return;
setPhone(digits);
```
Optionally surface an inline error `"Mobile numbers start with 6–9"` on invalid first digit (matching the D2 pattern).

---

### M-2: Verify OTP double-submit not guarded with `useRef` tap guard

**File:** `src/screens/doctor/LoginScreen.tsx`, lines 185–215

**Risk:** The auto-submit `useEffect` (line 211) fires when `otp.length === 6 && phase === 'otp_entry' && otpError === null`. If a user enters the 6th digit and simultaneously taps the Verify OTP button (possible on slow devices where `phase` state update has not yet rendered), two concurrent `handleVerifyOtp` calls can fire. Each call independently sends a verify request and calls `setAuth`. The second call may arrive with a "token already consumed" error from the server — but more critically, the server-side attempt counter is decremented twice, burning one of the three allowed attempts.

The project's established pattern for this is `useRef(false)` (synchronous) rather than `useState` (async) — see D6 `isSavingRef` and MEMORY.md "Tap guard pattern."

**Fix:**
```ts
const isVerifyingRef = useRef(false);

async function handleVerifyOtp() {
  if (otp.length !== 6 || isVerifyingRef.current) return;
  isVerifyingRef.current = true;
  setPhase('loading');
  setOtpError(null);
  try {
    const { token, user } = await mockVerifyOtp(phone, otp);
    if (timerRef.current) clearInterval(timerRef.current);
    setAuth(token, user);
    navigation.replace('PatientSearch');
  } catch (err: unknown) {
    isVerifyingRef.current = false;   // reset on failure so user can retry
    // ... existing error handling
  }
  // Note: no reset on success — screen unmounts
}
```

---

### M-3: WhatsApp fallback button has no client-side rate limiting during active countdown

**File:** `src/screens/doctor/LoginScreen.tsx`, lines 401–413

**Risk:** The WhatsApp fallback button is active and tappable at all times — including during the 45-second SMS resend countdown. The server rate limit (5 per mobile per hour) will eventually block it, but a user with unsteady hands (or an attacker with a scripted device) can drain the hourly budget via WhatsApp before the SMS countdown expires. There is no UI feedback that the WhatsApp request is also subject to a rate limit.

**Fix:** Apply the same `canResend` gate to the WhatsApp button, or maintain a separate `canResendWhatsApp` state that also starts a 45-second countdown on WhatsApp send. At minimum, disable the WhatsApp button during `phase === 'loading'` (already handled by phase gate, but explicit `disabled` prop would make it clear):
```tsx
<TouchableOpacity
  onPress={() => handleSendOtp('whatsapp')}
  disabled={phase === 'loading' || !canResend}  // or its own countdown
  ...
>
```

---

## LOW (track in backlog)

### L-1: Mock JWT string is structurally valid base64 — superficially resembles a real token

**File:** `src/screens/doctor/LoginScreen.tsx`, line 97

**Risk:** `'mock-jwt-eyJhbGciOiJIUzI1NiJ9.mockpayload'` — the `eyJ...` prefix decodes to `{"alg":"HS256"}` and will pass naive JWT detection regex. If any downstream code tries to parse or log this token (e.g., a debug utility), it may produce misleading output or cause a JWT-decoding error that leaks the mock value into a log. The comment and `REMOVE BEFORE LAUNCH` label are present, but the superficial realism is unnecessary.

**Fix:** Replace with an obviously fake placeholder: `'mock-token-not-real'`. No functional impact.

---

### L-2: `handleSendOtp` does not guard against concurrent send during `loading` phase

**File:** `src/screens/doctor/LoginScreen.tsx`, lines 163–181

**Risk:** The WhatsApp button (line 403) is reachable during the `otp_entry` phase regardless of loading state. A user could tap "Didn't receive SMS? Try WhatsApp" while a WhatsApp send is already in flight (from a prior tap). `phase` is set to `loading` which hides the OTP card, but the WhatsApp button is in the same `otp_entry` section that is conditionally rendered — so once the phase switches to `loading`, the button disappears. This is handled implicitly by the phase gate but only because of the conditional render. Explicit `disabled={phase === 'loading'}` on both the Resend OTP and WhatsApp buttons would make the intent clear and robust to any future rendering changes.

---

## Flags for `auth.ts` (cannot verify in mockup — mandatory before wiring)

These are security requirements from `docs/security-spec.md` that apply to the real authentication implementation. They are flagged here so they are not omitted from the `auth.ts` session.

| # | Requirement | Spec reference |
|---|---|---|
| F-1 | Write refresh token to `expo-secure-store` using `REFRESH_TOKEN_KEY` immediately after successful OTP verification. Never write to AsyncStorage. | `security-spec.md` §At Rest (Device); useAuthStore.ts comment |
| F-2 | Access token (JWT, 15-min expiry) stays in Zustand in-memory only — never persisted. | `security-spec.md` §Authentication |
| F-3 | Session restoration on cold-start: read refresh token from SecureStore → `POST /auth/refresh` via `pinnedFetch` → `setAuth()` → navigate. If refresh fails, clear SecureStore and navigate to Login. | `security-spec.md` §Authentication; sync worker `tryRefreshToken()` pattern |
| F-4 | Handle `TOO_MANY_ATTEMPTS` error code from `/auth/verify-otp` with a specific error message ("Too many attempts. Please request a new OTP.") and `setCanResend(true)`. The 3-attempt limit is server-enforced but the client must surface it. | `security-spec.md` §OTP Security |
| F-5 | Handle `429 Too Many Requests` from `/auth/send-otp` (5/hr rate limit) with a specific error message — not a generic "Couldn't send OTP". | `security-spec.md` §Rate Limiting |
| F-6 | All auth API calls must go through `pinnedFetch` (not bare `fetch`). `src/api/pinnedFetch.ts` is already built. | `security-spec.md` §Transport Security; D2 H-2 fix |
| F-7 | OTP must be stored as a bcrypt hash on the server, never plaintext. Purge from database immediately after successful verification. (Server concern — flag for backend implementation.) | `security-spec.md` §OTP Security |
| F-8 | JWT claims must include `device_id` to support remote wipe and per-device session invalidation. | `security-spec.md` §JWT Claims |
| F-9 | Log `login_success` and `login_failure` events (with `actor_id`, `device_id`, `outcome`) via the existing audit log infrastructure. Fire-and-forget to `audit_events` table; flush to server via sync worker. | `security-spec.md` §Audit Logging |
| F-10 | No phone numbers, OTPs, user IDs, or JWT fragments must appear in any `console.log` in `auth.ts` or the login screen. The current mockup has zero `console.log` calls — maintain this. | `security-spec.md` §Vulnerability Management; `consent-layer-spec.md` Privacy by Design Rule 1 |

---

## Checklist Status

| Section | Passed | Notes |
|---|---|---|
| **Authentication & Sessions** | 1/6 | F-1 through F-6 flagged for auth.ts; OTP length/type ✅ |
| **Authorisation** | N/A | Not applicable to login screen |
| **Data Handling** | 4/4 | No Aadhaar ✅ No PII in logs ✅ No S3 ✅ No patient names in errors ✅ |
| **Mobile Security** | 1/5 | Refresh token absent (H-2) ❌; cert pinning flagged (F-6); no sensitive console.log ✅ |
| **Input Validation** | 3/4 | 10-digit length ✅, maxLength enforced ✅, 6-digit OTP ✅; starts-with-6–9 ❌ (M-1) |
| **Database** | N/A | No DB access in login screen |
| **DPDP Compliance** | N/A | No patient data accessed in this screen |

---

## Summary Table

| ID | Severity | Item | Actionable now? |
|---|---|---|---|
| H-1 | HIGH | Demo block not gated by `__DEV__` | ✅ Yes — wrap in `{__DEV__ && ...}` |
| H-2 | HIGH | Refresh token not written to expo-secure-store in login flow | ⚠️ Flagged for auth.ts |
| H-3 | HIGH | Session restoration on cold-start absent | ⚠️ Flagged for auth.ts |
| M-1 | MEDIUM | Phone number not validated for 6–9 start digit | ✅ Yes — add guard in handleSendOtp + input filter |
| M-2 | MEDIUM | No `useRef` double-submit guard on Verify OTP | ✅ Yes — add `isVerifyingRef` |
| M-3 | MEDIUM | WhatsApp button has no client-side rate limiting during countdown | ✅ Yes — apply `canResend` gate or dedicated countdown |
| L-1 | LOW | Mock JWT superficially resembles a real token | ✅ Yes — replace with obviously fake string |
| L-2 | LOW | Send OTP / WhatsApp lack explicit `disabled` prop on loading | ✅ Yes — add explicit disabled state |

---

## Overall Verdict

**Blocked — 3 HIGH findings.**

H-1 is actionable immediately in `LoginScreen.tsx` and should be resolved before this screen is merged. H-2 and H-3 are architectural requirements for `auth.ts` — they cannot be closed in the mockup, but they must be in the Builder's `auth.ts` implementation brief and verified in that session's security audit.

M-1 and M-2 are straightforward fixes in the current file. M-3 is minor and can follow.

**No CRITICAL findings.** No Aadhaar, no patient data, no real auth bypass possible in the mockup as written. The screen is clean from a data-exposure standpoint. Once H-1 is fixed in the mockup and H-2/H-3 are committed to the `auth.ts` implementation brief, the mockup may be considered clear for the QA agent.
