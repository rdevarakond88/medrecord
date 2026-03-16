# Security Audit — D1: auth.ts Wiring (v2 — Post-Fix Verification)
_Audited: 2026-03-16 | Auditor: Security Agent_
_Files reviewed:_
- `src/api/auth.ts` (new)
- `src/screens/doctor/LoginScreen.tsx` (wired)
- `App.tsx` (session restoration)
- `src/auth/constants.ts` (USER_PROFILE_KEY added)
- `src/store/useAuthStore.ts` (AuthUser exported)

_Spec refs: `docs/security-spec.md`, `docs/consent-layer-spec.md`, `agents/agent-security.md`_
_Prior report: `reviews/D1-security-audit.md` — H-2, H-3 deferred to this session_

---

## Prior Audit Closure Verification

### H-2: Refresh token not written to expo-secure-store in login flow

**Status: CLOSED ✅**

`LoginScreen.tsx` line 218:
```ts
await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refresh_token);
```
Written to SecureStore using the correct key (`REFRESH_TOKEN_KEY = 'medrecord_refresh_token'`)
before `setAuth()` is called. Access token never written to SecureStore. Correct order of
operations confirmed.

---

### H-3: Session restoration on cold-start absent from D1

**Status: CLOSED ✅ — with one new HIGH defect in the implementation (see H-1 below)**

`App.tsx` implements the full `restoreSession()` sequence:
1. Reads `REFRESH_TOKEN_KEY` from SecureStore.
2. Calls `refreshAccessToken(storedRefresh)` via `pinnedFetch` (F-6 compliant).
3. Reads `USER_PROFILE_KEY` (user profile cached at login).
4. Rotates refresh token if server issued a new one.
5. Calls `useAuthStore.getState().setAuth(access_token, user)` — in-memory only (F-2).
6. Navigates to `PatientSearch`; on any failure, clears credentials and goes to `Login`.

The mechanism is in place. However the error-handling path has a correctness defect that
constitutes a new HIGH finding — see H-1 below.

---

## Implementation Brief Verification (F-1 through F-10)

| # | Requirement | Verified |
|---|---|---|
| F-1 | Refresh token written to `REFRESH_TOKEN_KEY` in SecureStore after verify-OTP | ✅ `LoginScreen.tsx:218` |
| F-2 | Access token in Zustand only — never persisted | ✅ No SecureStore write for access token anywhere in changed files |
| F-3 | Session restoration: SecureStore → `/auth/refresh` → `setAuth()` → navigate | ✅ `App.tsx:120–158` — see H-1 caveat |
| F-4 | `TOO_MANY_ATTEMPTS` → distinct message + `setCanResend(true)` | ✅ `LoginScreen.tsx:253–259` |
| F-5 | 429 on `/auth/send-otp` → specific "rate limited" message | ✅ `LoginScreen.tsx:195–198` |
| F-6 | All auth calls via `pinnedFetch` | ✅ `auth.ts:79,109,136` |
| F-9 | `login_success` / `login_failure` logged to `audit_events` | ⚠️ Partial — OTP flow logged; cold-start restoration not logged (see M-1) |
| F-10 | No phone numbers, OTPs, user IDs, or JWT fragments in `console.log` | ✅ Zero `console.log` calls in `auth.ts`, `LoginScreen.tsx`, or `App.tsx` |

---

## HIGH (fix before device testing)

### H-1: restoreSession() deletes refresh token on ANY error — including plain network failure

**File:** `App.tsx`, lines 150–156

```ts
} catch {
  // Refresh failed (expired, revoked, or network error with no cached session).
  // Clear stale credentials and send the doctor through the OTP flow.
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_PROFILE_KEY);
  setInitialRoute('Login');
}
```

**Risk:** The blanket `catch` handles two fundamentally different failure modes identically:

1. **Auth failure (401/403):** refresh token is expired or revoked — credentials should be cleared.
2. **Network failure (timeout, DNS error, `ECONNABORTED`):** the API is unreachable — credentials
   are still valid but are silently destroyed.

Indian semi-urban clinics are explicitly in the threat model for poor connectivity
(`security-spec.md` §Threat Model: "Man-in-the-middle — shared/public WiFi"). A doctor who opens
the app in an area with weak 4G gets their 30-day refresh token deleted on the first cold-start
attempt. They must re-enter their phone number and OTP — losing the session entirely. Worse, a
network-layer attack (e.g., blocking `api.medrecord.in` at the network level) would force all
doctors to re-authenticate simultaneously, which is a denial-of-service against session continuity.

`pinnedFetch` wraps `react-native-ssl-pinning`'s `fetch`. A TLS pin mismatch throws synchronously
from the library (not a 401 from the server). This is also caught by the blanket catch and would
incorrectly wipe credentials — though a pin mismatch likely means MITM and credential clearing may
be desired. The distinction still matters: pin mismatch should be explicit, not conflated with
connectivity loss.

**Fix:** Inspect the error before deleting credentials. `refreshAccessToken` throws an `ApiError`
(from `throwApiError`) on server-returned non-2xx responses. Network failures throw a native error
(no `ApiError` wrapper). Only clear credentials on auth errors:

```ts
} catch (err) {
  // Only wipe credentials on an explicit auth rejection (401/403).
  // Network errors (no connectivity, timeout) leave credentials intact —
  // the doctor will be sent to Login but can restore the session when back online.
  const isAuthError =
    err instanceof ApiError && (err.status === 401 || err.status === 403);
  if (isAuthError) {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_PROFILE_KEY);
  }
  setInitialRoute('Login');
}
```

Note: `ApiError` is already imported in `App.tsx` indirectly via `refreshAccessToken` — it must be
imported explicitly from `'./src/api/apiClient'` for the `instanceof` check.

---

## MEDIUM (fix before v1 launch)

### M-1: Cold-start session restoration events not logged to audit_events (F-9 partial)

**File:** `App.tsx`, `restoreSession()` function

**Risk:** F-9 requires `login_success` and `login_failure` events to be logged to `audit_events`.
The OTP verification path in `LoginScreen.tsx` logs both events correctly (lines 240 and 251).
However, the cold-start restoration path in `App.tsx` fires before `SQLiteProvider` is rendered —
`useSQLiteContext()` is unavailable at that layer, so DB writes are impossible there. Neither a
successful cold-start session restore nor a failed one is logged to the local audit trail.

The audit gap means:
- A compromised refresh token used to restore a session (e.g., device cloned) leaves no local
  audit trail of the "login" event.
- Login failure events (expired/revoked token) are not locally audited.

The server emits its own audit event when it processes a `POST /auth/refresh` request, which
partially mitigates this. But the local audit trail is incomplete.

**Fix:** After `restoreSession()` sets `initialRoute`, pass a pending audit-log flag through
navigation params or a small Zustand slice so that `PatientSearchScreen` (on success) or
`LoginScreen` (on failure) writes the deferred `login_success` / `login_failure` event on mount.
Alternatively, for v1, document this as a known gap and rely on the server-side audit trail,
tracking it in Technical Debt.

---

## LOW (track in backlog)

### L-1 (SW-L-1 carry-over): ACCESS_TOKEN_KEY exported but unused

**File:** `src/auth/constants.ts`, line 14

```ts
export const ACCESS_TOKEN_KEY = 'medrecord_access_token';
```

**Context:** Raised as `SW-L-1` in the sync worker security audit (`reviews/sync-worker-security-audit.md:112`).
Still unresolved. The D1 wiring session confirmed that the access token stays in Zustand only
(F-2 ✅). The exported `ACCESS_TOKEN_KEY` is never imported anywhere.

**Risk:** Any future developer who searches for how to persist a token and finds this constant may
assume it is the sanctioned mechanism for storing the access token in SecureStore, violating F-2.

**Fix:** Remove the constant or replace with a comment:
```ts
// Access token is NOT persisted — it lives in Zustand in-memory only (security-spec.md §Authentication).
// Do not add a storage key here for the access token.
```

---

## Notes (No Finding — Verified Clean)

**Demo block `__DEV__` guard (H-1 from prior audit):** ✅ Confirmed present at `LoginScreen.tsx:532`.
Demo state functions operate on local state only and do not call the real API. The hint text
in the prior mockup audit (which advertised bypass codes) is absent from the live screen. Clean.

**F-2 — access token in Zustand only:** All five changed files were inspected. `ACCESS_TOKEN_KEY`
is declared but never called with `SecureStore.setItemAsync`. The user profile key
(`USER_PROFILE_KEY`) stores doctor profile metadata (id, role, name, clinic_id) in SecureStore —
this is correct and intentional for the H-3 session restoration path. Not a violation of F-2,
which restricts the *access token* only.

**F-10 — no PII in logs:** Zero `console.log` / `console.warn` / `console.error` calls in
`auth.ts`, `LoginScreen.tsx`, or `App.tsx`. Login failure metadata (`{ reason: code }`) contains
only error codes, not phone numbers, OTPs, or user IDs.

**login_failure actorId = '\*':** `LoginScreen.tsx:251` uses `'*'` for the `doctor_id` column
during a login failure because no actor has been verified yet. This is the correct approach —
the phone number cannot be stored per F-10, and the server-side audit log captures the mobile
number independently. Acceptable for v1.

**`INSERT OR IGNORE` in logAuthAuditEvent:** UUID collision risk is negligible (`expo-crypto`
`randomUUID()` uses a cryptographically secure source). The `IGNORE` clause is a correct safety
net against any edge case, not a workaround for a real bug.

**Cert pinning (F-6):** `pinnedFetch` uses `react-native-ssl-pinning` with leaf + intermediate
pins for `api.medrecord.in`. Not testable in Expo Go — requires an EAS custom dev client. This is
a pre-existing, documented limitation. All three `auth.ts` functions use `pinnedFetch`. ✅

---

## Checklist Status

| Section | Passed | Notes |
|---|---|---|
| **Authentication & Sessions** | 5/6 | H-2 ✅ H-3 ✅ closed; H-1 is a new defect in the error-handling path |
| **Authorisation** | N/A | No resource-access calls in the login screen |
| **Data Handling** | 4/4 | No Aadhaar ✅ No PII in logs ✅ No S3 ✅ No patient names in errors ✅ |
| **Mobile Security** | 4/5 | Refresh token in SecureStore ✅ No sensitive console.log ✅ Cert pinning ✅ Cache clear on logout ✅; App lock (biometric) not yet built — ongoing backlog |
| **Input Validation** | 4/4 | 10-digit length ✅ 6–9 prefix guard ✅ maxLength ✅ OTP numeric-only ✅ |
| **Database** | 2/2 | Parameterised queries ✅ Audit log insert-only (append pattern) ✅; RLS and role checks are server-side |
| **DPDP Compliance** | N/A | No patient data accessed in the login screen |

---

## Summary Table

| ID | Severity | Status | Item |
|---|---|---|---|
| H-1 (prior) | HIGH | ✅ CLOSED | Demo block not gated by `__DEV__` |
| H-2 (prior) | HIGH | ✅ CLOSED | Refresh token not written to expo-secure-store |
| H-3 (prior) | HIGH | ✅ CLOSED | Session restoration on cold-start absent |
| **H-1 (new)** | **HIGH** | **OPEN** | **restoreSession() deletes credentials on network errors** |
| M-1 (prior) | MEDIUM | ✅ CLOSED | Phone prefix (6–9) guard missing |
| M-2 (prior) | MEDIUM | ✅ CLOSED | Verify OTP double-submit not guarded with `useRef` |
| M-3 (prior) | MEDIUM | ✅ CLOSED | WhatsApp button not rate-limited during countdown |
| **M-1 (new)** | **MEDIUM** | **OPEN** | **Cold-start events not logged to audit_events (F-9 partial)** |
| SW-L-1 / L-1 | LOW | OPEN | `ACCESS_TOKEN_KEY` exported but unused — carry-over |

---

## Overall Verdict

**Blocked — 1 HIGH finding.**

`H-1` (`App.tsx` blanket catch deletes refresh token on network errors) must be fixed before
device testing proceeds. The fix is a small, targeted change to the catch clause in
`restoreSession()` — no architectural change required.

`M-1` (cold-start audit gap) may be deferred to v1 launch if acceptable: the server-side
`POST /auth/refresh` audit trail partially covers the gap. If deferred, it must be added to
Technical Debt explicitly.

`L-1` (`ACCESS_TOKEN_KEY`) should be resolved in the next constants.ts touch.

No CRITICAL findings. The core auth security properties — SecureStore for refresh token, Zustand
for access token, cert pinning on all calls, no PII in logs, and TOO_MANY_ATTEMPTS handling —
are all correctly implemented. The wiring is clean; only the error-handling edge case in the
cold-start restoration path needs fixing before this session is cleared.
