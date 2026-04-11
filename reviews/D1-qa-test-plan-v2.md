# QA Review — D1: Login / OTP (auth.ts live wiring — v2)
_Reviewed: 2026-03-16 | QA Agent_
_Prior plan: `reviews/D1-qa-test-plan.md` (mockup-only, pre-auth.ts wiring)_

_Files reviewed:_
- `src/api/auth.ts` (new — sendOtp, verifyOtp, refreshAccessToken via pinnedFetch)
- `src/screens/doctor/LoginScreen.tsx` (wired)
- `App.tsx` (restoreSession — cold-start path)
- `src/auth/constants.ts`

_Spec refs: `docs/security-spec.md`, `docs/api-contracts.md`, `agents/agent-qa.md`_
_Security audits: `reviews/D1-security-audit.md`, `reviews/D1-security-audit-v2.md`_

_Security status at time of QA:_
- All HIGH findings closed (D1-SA2-H-1 fixed 2026-03-16 — network errors now preserve refresh token)
- D1-SA2-M-1 accepted gap: cold-start audit events not logged locally; rely on server-side
  `POST /auth/refresh` audit trail. No code change needed.

---

## CRITICAL BUGS (will cause data loss or crash in production)

None found.

---

## HIGH BUGS (will cause incorrect behaviour, no data loss)

None found.

---

## MEDIUM BUGS (incorrect states, confusing UX)

### M-1: Network error during `verifyOtp` shown as "Incorrect OTP"

**File:** `LoginScreen.tsx`, lines 244–268

```ts
const code = err instanceof ApiError ? err.code : null;
// ...
} else {
  setOtpError('wrong_otp');   // ← fires for ANY non-ApiError, including network drops
}
```

**Scenario:** Doctor has no connectivity when auto-submit fires (airplane mode, or
connectivity drops precisely between OTP-sent and OTP-verify). `verifyOtpApi` throws a
native network error — not an `ApiError`. `code` is `null`. Falls through to
`setOtpError('wrong_otp')` → "Incorrect OTP. Please check and try again."

The OTP is correct. The doctor re-enters it, retries, potentially exhausts all three
`TOO_MANY_ATTEMPTS` tries, and is locked out — because the app told them their OTP was
wrong when connectivity was the actual problem.

**Steps to reproduce:**
1. Enter phone, send OTP, receive OTP.
2. Enable airplane mode on device.
3. Enter the correct 6-digit OTP (or wait for auto-submit if already entered).
4. Observe: "Incorrect OTP. Please check and try again." — misleading.

**Expected:** A distinct "No internet connection. Please check and retry." message,
matching the send-OTP path which already does a `NetInfo.fetch()` pre-check (UE-3 from
v1 plan, applied correctly on the send path but not the verify path).

**Fix suggestion:** Add a `null` code branch before the `wrong_otp` fallthrough:
```ts
} else if (code === null) {
  // Network error — not a wrong OTP
  setOtpError('no_connection');  // or add a new 'verify_network_error' OtpError type
} else {
  setOtpError('wrong_otp');
}
```
Add the corresponding render block and message in the OTP card, matching the
send-OTP error box pattern.

---

### M-2: `handleSendOtp` has no synchronous double-submit guard

**File:** `LoginScreen.tsx`, lines 167–201

`handleVerifyOtp` is correctly guarded with `isVerifyingRef.current` (resolved in the
v1 QA / security audit). `handleSendOtp` is not guarded. The "Send OTP" button is
`disabled={phone.length < 10}` and transitions phase to `loading` on success — but both
state updates are React state and batch asynchronously. On a slow device (2GB RAM Android),
a double-tap on "Send OTP" before the loading re-render fires launches two simultaneous
`POST /auth/send-otp` requests.

**What happens:** Whichever call resolves last wins the `setOtpToken(otp_token)` write.
If the SMS for the first token is delivered first, the user copies it into the field.
Verify fails with `WRONG_OTP` — they consumed one of three attempts on a valid but stale
token. On the resend path the risk is higher: `canResend` is `true`, both buttons are
enabled, and a double-tap on "Resend OTP" easily triggers two concurrent sends.

**Steps to reproduce:**
1. Enter a valid phone number.
2. Double-tap "Send OTP" before the loading spinner renders (requires fast/slow device timing).
3. Observe two simultaneous `POST /auth/send-otp` network requests.
4. The `otpToken` state reflects whichever call resolved last.

**Expected:** Second tap is a no-op (same as `isVerifyingRef` pattern).

**Fix suggestion:** Add `isSendingRef = useRef(false)`. Set `isSendingRef.current = true`
at the top of `handleSendOtp`; reset in the `catch` block. No reset on success (phase
transitions to `loading`, which hides the button tree).

---

### M-3: Resend failure during `otp_entry` drops user back to `phone_entry`

**File:** `LoginScreen.tsx`, lines 192–194

```ts
} catch (err: unknown) {
  setPhase('phone_entry');   // ← always, regardless of originating phase
  setSendError('send_failed' | 'rate_limited');
}
```

`handleSendOtp` is called from both the initial "Send OTP" button (phase `phone_entry`)
and the "Resend OTP" / "Try WhatsApp" buttons (phase `otp_entry`). When a resend fails,
the catch always sets phase to `phone_entry`. The doctor loses the OTP entry card while
potentially holding a valid `otpToken` in state.

**Steps to reproduce:**
1. Enter phone, send OTP, advance to OTP entry.
2. Wait 45 seconds (countdown expires). Tap "Try WhatsApp".
3. Simulate a server 500 or block connectivity during the resend call.
4. Observe: entire OTP entry card disappears; phone entry card shown with error.

**Expected:** Stay in `otp_entry` with an inline resend error. The doctor can still enter
the OTP they may already have from the previous delivery.

**Fix suggestion:** Track whether the call originated from `otp_entry`. On failure, if
originating phase was `otp_entry`, stay in `otp_entry` and surface a separate
`resendError` inline state rather than reverting phase.

---

## UNHANDLED EDGE CASES

### UE-1: iOS SecureStore persistence across app reinstall

On iOS, the Keychain (used by `expo-secure-store`) survives app reinstalls. A doctor
who reinstalls the app will have `restoreSession()` find their existing refresh token
and skip the login screen entirely.

**Risk for v1:** Acceptable behaviour. Post-v1 concern is a stolen/sold device where
the session persists until the 30-day refresh token expiry with no "sign out all devices"
UI. Document and address post-v1.

---

### UE-2: TLS pin mismatch during `restoreSession()` preserves credentials but blocks cold-start forever

`pinnedFetch` throws a native non-`ApiError` on a pin mismatch. `restoreSession()` catches
it; `isAuthError` is `false`; credentials are preserved; doctor is sent to Login.
On every subsequent cold-start the same mismatch fires, credentials accumulate in
SecureStore but are unusable. If the production cert rotates and the bundle is not updated,
all doctors are locked at Login with no actionable error.

**Recommended:** Post-v1, add a distinct catch for SSL pin errors. Clear credentials and
surface an "app update required" message.

---

### UE-3: `USER_PROFILE_KEY` absent after a successful cold-start refresh → forced re-OTP

`App.tsx:133–138` — if `refreshAccessToken` succeeds but `USER_PROFILE_KEY` is absent
(e.g. first run after upgrading from a pre-auth.ts-wiring build, or key corruption),
`REFRESH_TOKEN_KEY` is deleted and the doctor is sent to Login. The just-minted access
token is discarded. A rotated refresh token (if any) is not persisted.

**Expected impact:** One-time event on first cold-start after upgrade. Affects all
devices upgrading from the pre-wired build. Cover explicitly in device testing.

---

### UE-4: Server 5/hr rate limit vs 45-second UI countdown — no pre-warning

The server allows 5 OTP sends per mobile per hour. The UI countdown resets every 45
seconds, allowing up to ~5 sends in 225 seconds before hitting the server's 429. The UI
does not track send counts and shows no pre-warning before the final allowed request.
After hitting 429, "Too many OTP requests. Please wait." is shown — functional but
surprising to users who didn't know there was a limit.

**Recommended:** Acceptable for v1. Post-v1: track send count in state and show a soft
warning after the 4th send.

---

### UE-5: `SecureStore.setItemAsync` partial write on login — stale token, misleading error

`LoginScreen.tsx:218–228` — `REFRESH_TOKEN_KEY` is written first, then `USER_PROFILE_KEY`.
If the second write fails (extremely unlikely — iOS Keychain hardware failure), the
`catch` block shows "Incorrect OTP" even though auth succeeded. Next cold-start finds the
refresh token but no profile, deletes the refresh token, forces re-OTP.

**Risk:** Near-zero probability. Document as known edge case; no fix required before v1.

---

### UE-6: cert pinning not testable in Expo Go

All three `auth.ts` functions use `pinnedFetch` (F-6 compliant). The SSL pin check
requires `react-native-ssl-pinning` with bundled `.cer` files — this does NOT work in
Expo Go. Device testing against the real backend in Expo Go will bypass the pin check.

**Required action before production:** Run all auth flows against the live API in an EAS
custom dev client (with correct `.cer` files bundled) to validate that cert pinning does
not break the auth flow and that the pins match the production cert.

---

## TEST PLAN

### Happy Path

1. **First launch — no credentials in SecureStore:**
   - Cold-start app on fresh install.
   - Observe: spinner visible briefly, then Login screen (not PatientSearch).
   - Enter a valid 10-digit mobile starting with 9. Tap "Send OTP".
   - Observe: loading spinner, then OTP entry card with green "OTP sent to +91 XXXXX XXXXX" banner.
   - Enter the 6-digit OTP received via SMS.
   - Observe: auto-submit fires on 6th digit → loading spinner → navigates to PatientSearch.
   - Verify: `REFRESH_TOKEN_KEY` written to `expo-secure-store`.
   - Verify: `USER_PROFILE_KEY` written to `expo-secure-store`.
   - Verify: Zustand `useAuthStore` has `token` and `user` populated (PatientSearch loads patients).
   - Verify: `audit_events` SQLite table has one `login_success` row with `doctor_id = <user.id>`.

2. **Session restoration — returning user (cold-start):**
   - After test 1, completely kill the app (swipe to close on iOS, force-stop on Android).
   - Reopen app.
   - Observe: spinner briefly shown, then PatientSearch directly (no Login screen).
   - Verify: Zustand `token` is populated and PatientSearch can load data.
   - Verify: if the server rotated the refresh token on this call, `REFRESH_TOKEN_KEY` in
     SecureStore holds the new value (not the original).

3. **Manual "Verify OTP" button tap (with double-submit guard):**
   - Reach OTP entry. Type 5 digits. Tap "Verify OTP" → button disabled, no action.
   - Type 6th digit → auto-submit fires. Simultaneously tap "Verify OTP" button.
   - Verify: only ONE verify request fires (`isVerifyingRef` blocks the second).

4. **WhatsApp fallback (after 45-second countdown):**
   - Send OTP, wait 45 seconds. "Resend OTP" link and WhatsApp button become active.
   - Tap "Didn't receive SMS? Try WhatsApp".
   - Observe: loading spinner, then return to OTP entry with fresh banner.
   - Verify: `otpToken` in state is updated (new token from the resend call).

5. **Change number — state cleanup:**
   - Send OTP, arrive at OTP entry.
   - Tap "Change number".
   - Verify: phase = `phone_entry`; OTP field gone; OTP-sent banner dismissed; countdown timer stopped.
   - Enter a different valid phone, send OTP, complete flow.

### Offline Scenarios

6. **No connectivity at phone entry — NetInfo pre-check fires (UE-3 from v1, implemented):**
   - Enable airplane mode.
   - Enter valid phone, tap "Send OTP".
   - Observe: `NetInfo.fetch()` returns `isConnected = false`.
   - Observe: immediate "No internet connection. Please check and retry." message — no spinner.
   - Disable airplane mode, retry → OTP sent.

7. **Connectivity drops between OTP send and verify — M-1 regression:**
   - Send OTP successfully, arrive at OTP entry.
   - Enable airplane mode.
   - Enter the correct 6-digit OTP (auto-submit fires).
   - **BUG M-1 expected:** "Incorrect OTP. Please check and try again." shown — this is wrong.
   - Correct behaviour (post-fix): "No internet connection" or similar distinct message.
   - Disable airplane mode, retry with same OTP → verify succeeds.

8. **D1-SA2-H-1 regression — network error preserves refresh token:**
   - Log in successfully (refresh token in SecureStore).
   - Enable airplane mode.
   - Kill and reopen app.
   - Observe: `restoreSession()` fails with a network error (not a 401/403).
   - Observe: Login screen shown.
   - **Critical check:** `REFRESH_TOKEN_KEY` must still be present in SecureStore (not deleted).
   - Disable airplane mode, kill and reopen → session restores successfully.

9. **Expired or revoked refresh token — credentials cleared on cold-start:**
   - Log in, then simulate server-side token revocation (or wait for the 30-day expiry in a
     test environment configured with a short TTL).
   - Kill and reopen app.
   - Observe: Login screen shown.
   - **Critical check:** `REFRESH_TOKEN_KEY` and `USER_PROFILE_KEY` are absent from SecureStore
     (cleared on 401/403 from the server's refresh response).
   - Complete full OTP login → session restored.

### Error Scenarios

10. **Wrong OTP:**
    - Send OTP, enter an incorrect code. Verify red border + "Incorrect OTP" message.
    - Retype first digit → error message dismissed immediately.
    - Enter correct OTP → verify succeeds.

11. **OTP expired (server returns OTP_EXPIRED):**
    - Send OTP, wait >5 minutes, then enter any code.
    - Verify: "OTP has expired. Please request a new one." message.
    - Verify: resend buttons enabled immediately (canResend = true, countdown cleared).

12. **Three wrong attempts → TOO_MANY_ATTEMPTS:**
    - Enter wrong OTP three times.
    - After third failure: "Too many attempts. Please request a new OTP." message.
    - Verify: OTP field cleared; resend buttons enabled immediately.

13. **Rate-limited send (429 on POST /auth/send-otp):**
    - Send OTP 5+ times in rapid succession (once per 45-second window; 5 sends exhaust the
      server's hourly limit).
    - 6th attempt: "Too many OTP requests. Please wait before trying again." message.
    - No loading spinner persists.

14. **Invalid mobile prefix (0–5):**
    - Type "5" as first digit. Observe: rejected immediately; inline error "Mobile numbers
      start with 6–9"; field stays empty.
    - Type "9" → accepted; error cleared.
    - Complete 10-digit number → OTP sent successfully.

### Cold-Start Edge Cases

15. **USER_PROFILE_KEY absent after upgrade (UE-3):**
    - Simulate by manually deleting `USER_PROFILE_KEY` from SecureStore while leaving
      `REFRESH_TOKEN_KEY` intact.
    - Kill and reopen app.
    - Observe: `restoreSession()` refreshes token successfully, then finds no user profile,
      deletes `REFRESH_TOKEN_KEY`, shows Login screen.
    - Verify: doctor must complete full OTP login.

16. **Cold-start with no keys in SecureStore (fresh install / post-logout):**
    - SecureStore empty.
    - Cold-start: spinner → Login screen. No crash, no hang.

### State & Navigation Tests

17. **Double-tap "Resend OTP" rapidly — M-2 regression:**
    - Wait for countdown to expire (canResend = true).
    - Double-tap "Resend OTP" as fast as possible.
    - **BUG M-2 expected:** Two `POST /auth/send-otp` requests may fire; otpToken is
      whichever call resolved last.
    - Correct behaviour (post-fix): second tap is a no-op.

18. **App backgrounded during verify call:**
    - Send OTP, enter correct 6 digits (auto-submit fires), immediately background app.
    - Foreground after 2–3 seconds.
    - Verify: navigation to PatientSearch completes normally.

19. **App backgrounded during countdown:**
    - Send OTP, arrive at OTP entry.
    - Background app for 60 seconds (longer than the 45s countdown).
    - Foreground.
    - Verify: countdown reached 0 while backgrounded; canResend = true; resend buttons active.

20. **Screen rotation during OTP entry:**
    - Arrive at OTP entry, rotate device to landscape.
    - Verify: card still visible; OTP input not clipped; no state loss.

21. **`login_success` audit event (F-9):**
    - Complete login. Query `audit_events` SQLite table.
    - Expect: row with `event_type = 'login_success'`, `doctor_id = <user.id>`,
      `created_at` within seconds of login. No PII in metadata.

22. **`login_failure` audit event (F-9):**
    - Enter wrong OTP. Query `audit_events`.
    - Expect: row with `event_type = 'login_failure'`, `doctor_id = '*'`,
      `metadata = {"reason":"WRONG_OTP"}`.

23. **`login_failure` on network error (F-9 partial — M-1 related):**
    - Trigger verify with no connectivity.
    - Query `audit_events`.
    - Expect: row with `event_type = 'login_failure'`, `metadata = {"reason":"network_error"}`.

24. **Cold-start audit gap (D1-SA2-M-1 — accepted):**
    - Complete cold-start session restoration.
    - Query `audit_events` SQLite table.
    - Confirm: no `login_success` row from this cold-start (local audit gap is expected —
      server-side `POST /auth/refresh` is the audit source for this event).

25. **Cert pinning — Expo Go note:**
    - Device tests in Expo Go will NOT exercise the cert pin check (UE-6).
    - Mark all auth tests in Expo Go as "functionally verified; cert pinning deferred to
      EAS custom dev client test".

---

## VERDICT

**Ready for device testing.**

No CRITICAL or HIGH bugs found. All HIGH findings from the security audits (v1 and v2)
are closed. The core security properties — SecureStore for refresh token, Zustand for
access token, network-error-preserving cold-start, cert pinning on all calls, no PII in
logs, TOO_MANY_ATTEMPTS handling — are correctly implemented.

Three MEDIUM bugs are documented. They do not block device testing but should be fixed
before v1 launch:

| Bug | Severity | Blocks device testing? |
|---|---|---|
| M-1: network error during verify shows "wrong OTP" | MEDIUM | No |
| M-2: no double-submit guard on handleSendOtp | MEDIUM | No |
| M-3: resend failure drops to phone_entry from otp_entry | MEDIUM | No |

**Cert-pinning device test:** Must be run in an EAS custom dev client, not Expo Go.
Schedule this test before production launch.

---

## ESTIMATED FIX EFFORT

| Bug | Effort |
|---|---|
| M-1 — distinct error for network failure on verify | 30 min |
| M-2 — isSendingRef double-submit guard on handleSendOtp | 30 min |
| M-3 — stay in otp_entry on resend failure | 1 hr |

**Total: ~2 hours.** Recommend addressing M-1 and M-2 in the next Builder session.
M-3 is lower priority (requires server error or connectivity drop specifically during resend).
