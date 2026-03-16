# QA REVIEW — D1: Login / OTP Screen
_Reviewed: 2026-03-16 | Reviewer: QA Agent_
_File reviewed: `src/screens/doctor/LoginScreen.tsx`_
_Security audit ref: `reviews/D1-security-audit.md` (H-1/M-1/M-2/M-3 closed; H-2/H-3 deferred to auth.ts)_

---

## Scope

Static mockup. All network calls are mocked (`mockSendOtp`, `mockVerifyOtp`). Tests below cover:
- Phase transitions: `phone_entry` → `loading` → `otp_entry` → `loading` → navigate
- OTP auto-submit, countdown, resend, WhatsApp fallback
- Error states (wrong OTP, expired OTP, send failure)
- Guards: `isVerifyingRef`, `canResend`, phone start-digit validation
- App lifecycle and navigation edge cases

Not in scope: `auth.ts` wiring, session restoration (H-3), refresh token (H-2) — deferred.

---

## CRITICAL BUGS (will cause data loss or crash in production)

None found.

---

## HIGH BUGS (will cause incorrect behaviour, no data loss)

None found.

The three security fixes from the audit are confirmed in code:
- **H-1 closed** — `{__DEV__ && (...)}` wraps the demo block at line 472. ✓
- **M-1 closed** — `parseInt(phone[0], 10) < 6` guard in `handleSendOtp` (line 168) and
  input-layer filter in `onChangeText` (line 300). Inline error renders. ✓
- **M-2 closed** — `isVerifyingRef.current` guard in `handleVerifyOtp` (lines 194–195). ✓
- **M-3 closed** — `disabled={!canResend}` on WhatsApp button (line 433). ✓

---

## MEDIUM BUGS (UX issues, incorrect states)

### MB-1: `otpSentBanner` not cleared when user taps "Change number"

**Steps to reproduce:**
1. Enter any valid phone number (e.g. 9876543210).
2. Tap "Send OTP" — OTP sent successfully.
3. Observe the green "OTP sent to +91 98765 43210" banner above the OTP card.
4. Tap "Change number" before typing any digit in the OTP field.
5. Observe: banner persists — user is now in phone_entry phase with a green banner
   telling them OTP was sent to the previous number.

**Expected:** Banner disappears when returning to phone_entry.
**Actual:** Banner shows above the phone entry card, potentially confusing the user into
thinking they must use the old number.

**Code location:** `LoginScreen.tsx:444–457` (Change number `onPress` handler).
`setOtpSentBanner(false)` is not called.

**Note:** The banner _is_ cleared on first OTP digit keystroke (line 380). This only
manifests if the user taps "Change number" before typing anything.

**Fix suggestion:** Add `setOtpSentBanner(false)` to the Change number handler.

---

### MB-2: `sendError` renders on phone_entry after a failed resend from otp_entry

**Steps to reproduce:**
1. Enter valid phone, send OTP successfully.
2. Wait for 45-second countdown to expire (`canResend = true`).
3. Tap "Resend OTP" — mock resolves successfully in normal flow, but consider:
   in production, a network error during resend will call `setPhase('phone_entry')`
   and `setSendError('send_failed')` (lines 183–184).
4. User is dropped back to phone_entry with the send failure error banner AND with
   the OTP countdown state still present in memory.

**Expected:** The failure message is correct and actionable.
**Actual:** The user loses the OTP entry card entirely and sees the phone_entry card again
— they must re-enter or confirm the phone number to proceed. This is the intended design
(MF-1 comment), but the `otp` state (6 digits from prior attempt) is retained in memory.

**Why this matters:** When the user re-sends and transitions back to otp_entry,
`setOtp('')` is called (line 175) and the OTP field is blank as expected. State is
ultimately correct, but it's worth documenting as behaviour testers should expect.

**Code location:** `LoginScreen.tsx:181–185` (catch in `handleSendOtp`). No additional
fix needed — verify this design decision with PM before auth.ts session.

---

## UNHANDLED EDGE CASES (not bugs yet, but will bite in production)

### UE-1: App backgrounded during 45-second countdown — timer and real time diverge

**Scenario:** Doctor receives a call mid-login. App backgrounds during countdown.
Android may throttle `setInterval`. When app resumes, `resendSeconds` shows a value
that hasn't tracked elapsed real time. The countdown could appear to resume at a stale
value (e.g. still showing 38s when 30+ seconds have elapsed).

**Impact:** On iOS this is minor; on Android low-end devices it could leave the user
waiting on a stale countdown when `canResend` should already be true.

**Recommended handling for auth.ts session:** Record `Date.now()` when the countdown
starts. On app-foreground event (`AppState.change === 'active'`), compare elapsed time
and fast-forward or expire the countdown accordingly.

---

### UE-2: No `TOO_MANY_ATTEMPTS` client-side handling (3 attempt limit)

**Scenario:** User enters wrong OTP three times. The security spec (F-4) requires the
server to enforce a 3-attempt limit. The current client has no handling for
`TOO_MANY_ATTEMPTS` error code — it would fall through to the generic `wrong_otp`
branch (line 215) and show "Incorrect OTP. Please check and try again," which is
misleading (the user cannot try again with the same OTP request).

**Code location:** `LoginScreen.tsx:208–215` (catch block in `handleVerifyOtp`).
`TOO_MANY_ATTEMPTS` is not handled.

**Recommended handling for auth.ts session:** Detect `code === 'TOO_MANY_ATTEMPTS'`
and: show a distinct error ("Too many attempts. Please request a new OTP."), clear the
OTP field, and call `setCanResend(true)` so the user can immediately resend.

---

### UE-3: No connectivity check before API calls — generic error hides root cause

**Scenario:** Doctor is in a zero-connectivity zone (basement clinic). They enter their
phone number and tap Send OTP. `mockSendOtp` resolves (mock always succeeds), but in
production, the bare `fetch` call will reject. The catch block shows
"Couldn't send OTP. Please check your connection and try again."

The message is correct, but there is no network-state check before the call. If the
phone is in airplane mode, the error still shows after the 1-second mock delay, making
the connectivity issue unclear.

**Recommended handling:** `@react-native-community/netinfo` is already installed
(MEMORY.md). Check `NetInfo.fetch()` before sending OTP. If offline, show
"No internet connection. Please check and retry." immediately without triggering a
loading state.

---

### UE-4: Auto-submit fires on 6th digit before user can proofread their OTP

**Scenario:** iOS QuickType bar auto-fills the OTP from SMS. The 6 digits are
inserted in one paste event. The auto-submit `useEffect` (line 222) fires immediately.
If the autofilled OTP is wrong (e.g. user has two active login attempts open),
submission is made without any user confirmation.

This is accepted design (auto-submit is a specified feature), but worth documenting
for device testing: verify that iOS `textContentType="oneTimeCode"` inserts the
correct OTP and that no double-insert occurs.

---

### UE-5: `phone[0]` guard in `handleSendOtp` is redundant but not harmful

`handleSendOtp` checks `firstDigit < 6` (line 169). This is correctly layered on top
of the input-layer filter (line 300). However, `handleSendOtp` can only be reached if
`phone.length === 10`, which means the user has entered 10 digits. The input filter
prevents the first digit from being <6, so `handleSendOtp` should never see an invalid
first digit in practice.

The redundant check is a safety net — no fix needed, but testers should confirm both
layers independently in testing.

---

### UE-6: No explicit `disabled` on Send OTP button during `loading` phase

The Send OTP button is conditionally rendered inside `{phase === 'phone_entry' && ...}`.
When phase transitions to `loading`, the entire card — including the button — disappears.
This provides implicit protection against double-submit on the send path.

However, there is no explicit `disabled={phase === 'loading'}` prop on the button. If
a future change moves the loading indicator inline (rather than replacing the card),
the double-send protection would silently break.

**Recommended handling:** Add `disabled={phase === 'loading' || phone.length < 10}` to
the Send OTP button for defensive robustness. Low priority for mockup; medium priority
before auth.ts wiring.

---

### UE-7: `resendSeconds` initial value (45) is shown before countdown begins

If the user navigates to otp_entry and the countdown starts, `resendSeconds` is
initialised to `RESEND_SECONDS = 45` and immediately begins decrementing via the first
`setInterval` tick at t=1s. For the first ~1 second, the UI shows "Resend in 45s" even
though the countdown technically started. This is a one-second cosmetic issue.

For 1-second mock delays this is imperceptible. In production (real network latency),
the OTP send completes, `startResendCountdown()` fires, and the user sees "Resend in 45s"
for the first second. Acceptable — no fix needed.

---

## TEST PLAN

---

### Happy Path

1. **Full SMS login flow**
   - Launch app → LoginScreen renders in `phone_entry` phase.
   - Phone input receives auto-focus. Keyboard is numeric pad.
   - Type "9876543210" — no phone error, Send OTP button enabled.
   - Tap "Send OTP" → `loading` phase: OTP entry card disappears, spinner shows "Please wait…".
   - After ~1.1s mock delay → `otp_entry` phase.
   - "OTP sent to +91 98765 43210" green banner visible.
   - OTP input auto-focused. Keyboard is numeric pad.
   - Type "123456" — banner dismisses on first keystroke.
   - After 6th digit auto-submit fires: loading phase → after 1s mock → navigates to `PatientSearch`.
   - Verify: `useAuthStore` token and user are set.

2. **Manual Verify OTP button tap (user taps before auto-submit fires)**
   - Reach otp_entry as above. Type 5 digits. Tap "Verify OTP" — button is disabled (length < 6). Nothing happens.
   - Type 6th digit — auto-submit fires (button tap redundant but harmless).
   - Verify: only ONE verify request is made (not two). `isVerifyingRef` closes the race.

3. **Phone number formatted display**
   - Type "98765" — formattedPhone = "+91 98765". Banner (if visible) shows correct truncated format.
   - Type "4321" → formattedPhone = "+91 98765 43210" (10 digits). OTP card label and banner confirm.

---

### Offline / Connectivity Scenarios

4. **Send OTP with no connectivity (simulated via mock failure)**
   - Modify test environment to reject `mockSendOtp`. (In production: disable WiFi/data.)
   - Tap "Send OTP" → loading → catch fires → back to `phone_entry` with red error box:
     "Couldn't send OTP. Please check your connection and try again."
   - Phone number, cursor position preserved.
   - Tap "Send OTP" again → new attempt proceeds.
   - Verify: error banner dismissed when send succeeds on retry.

5. **Connectivity drops during OTP verify (mock)**
   - Reach otp_entry. Simulate verify failure (modify mock or use expired mock).
   - Enter 6-digit OTP → auto-submit → error returned.
   - Verify appropriate error message shown, `isVerifyingRef` reset, user can retry.

6. **App backgrounded during 45s countdown (manual device test)**
   - Enter phone, send OTP, arrive at otp_entry.
   - Immediately background the app for 60+ seconds.
   - Return to foreground.
   - **Expected (current behaviour):** Countdown may show residual seconds. Timer should
     have expired and `canResend` should be true (or will become true when remaining
     interval ticks fire). If countdown is showing >0s after 60s elapsed, this is a
     timing-gap defect (UE-1).
   - Verify: "Resend OTP" link is accessible after 45s regardless of backgrounding.

---

### Error Scenarios

7. **Wrong OTP**
   - Reach otp_entry. Enter "999999" (6 digits).
   - Auto-submit fires → after 1s → wrong_otp error.
   - Red error box: "Incorrect OTP. Please check and try again."
   - OTP input border turns red, background #FEF2F2.
   - OTP field is NOT cleared — user sees "999999" and can edit.
   - `phase` returns to `otp_entry`. Timer continues from wherever it was.
   - Type over wrong OTP: backspace to 5 digits → error clears immediately (first keystroke).
   - Enter "123456" → auto-submit → success.

8. **Expired OTP**
   - Reach otp_entry. Enter "000000" (6 digits).
   - Auto-submit fires → after 1s → otp_expired error.
   - Red error box: "OTP has expired. Please request a new one."
   - `canResend` set to true IMMEDIATELY (regardless of remaining countdown time).
   - Timer cleared — countdown stops.
   - Both "Resend OTP" link and WhatsApp button become active simultaneously.
   - Tap "Resend OTP" → new OTP sent → banner shows new confirmation → countdown restarts at 45s.
   - Enter any non-expired OTP → success.

9. **OTP send failure (send_failed)**
   - Enter valid phone. Simulate send failure (modify mock).
   - "Couldn't send OTP. Please check your connection and try again." shown.
   - User corrects connectivity (or retries) → taps Send OTP again → error box disappears on new attempt.
   - Verify: error box also disappears when user changes phone number (line 306: `setSendError(null)`).

10. **Wrong OTP after expired OTP (two errors in sequence)**
    - Enter "000000" → expired error → `canResend = true`.
    - Without resending, backspace to 5 digits → type "999991" → auto-submit.
    - Server returns WRONG_OTP (not expired — same OTP request, just wrong code).
    - Verify: error message is "Incorrect OTP…" (wrong_otp branch), NOT "OTP has expired…"
    - Verify: `isVerifyingRef` is reset correctly so user can try again.

---

### Guard and Rate-Limiting Tests

11. **`canResend` gate: Resend OTP button hidden during countdown**
    - Arrive at otp_entry. Verify: "Resend in 45s" countdown shows. No "Resend OTP" link.
    - Countdown expires (or use demo "OTP" button + wait 45s). "Resend OTP" link appears.
    - Tap "Resend OTP" → new OTP sent → countdown restarts → link disappears again.

12. **`canResend` gate: WhatsApp button disabled during countdown**
    - Arrive at otp_entry. WhatsApp button visible but opacity 0.4 (styles.whatsappBtnDisabled).
    - Tap disabled WhatsApp button → no action (disabled prop prevents onPress).
    - Countdown expires → WhatsApp button becomes active (full opacity).
    - Tap → `handleSendOtp('whatsapp')` fires → loading → OTP sent via WhatsApp channel.

13. **`isVerifyingRef` double-submit guard**
    - Arrive at otp_entry. Type 5 digits.
    - Rapidly tap "Verify OTP" button (disabled at <6 digits — no trigger). Confirm: button disabled.
    - Type 6th digit → auto-submit fires.
    - **On slow device (or via demo "Verifying" state):** Simulate simultaneous auto-submit
      and button tap during the loading phase transition.
    - Verify: only one `handleVerifyOtp` call reaches the mock (look for single 1s delay,
      not 2 concurrent delays). `isVerifyingRef.current` prevents the second call.

14. **Phone start-digit validation (input layer — M-1)**
    - Tap phone input. Type "1" — rejected immediately. Phone field remains empty.
    - Inline error shown: "Mobile numbers start with 6–9."
    - Type "9" — error clears, "9" accepted.
    - Complete to 10 digits → Send OTP button enables.

15. **Phone start-digit validation (handleSendOtp layer — M-1 safety net)**
    - This layer is theoretically unreachable via normal UI (input filter already blocks it).
    - To test: programmatically call `handleSendOtp()` with `phone = '5123456789'`.
    - Expected: function returns early (no mock call, no phase change).

16. **Phone length gate on Send OTP button**
    - Type 9 digits → "Send OTP" button is greyed (disabled). Tap → nothing happens.
    - Type 10th digit → button enables and becomes blue.
    - Clear to 0 digits → button disabled again.

---

### State & Navigation Tests

17. **"Change number" from otp_entry — state cleanup**
    - Enter phone, send OTP, arrive at otp_entry.
    - Do NOT type in OTP field. Tap "Change number."
    - Expected: phase = `phone_entry`. OTP field gone. Timer cleared (no memory leak).
    - **Verify MB-1:** Is the "OTP sent to…" banner dismissed? (Currently it is NOT — this is MB-1.)
    - Phone field should retain previous number for easy correction.
    - `otpError` is null. `canResend` is false (if user returned before countdown).

18. **Back navigation / swipe (iOS) from otp_entry**
    - The screen uses `navigation.replace('PatientSearch')` on success (no history stack entry).
    - From otp_entry, attempt iOS swipe-back gesture.
    - Expected: swipe-back is available if LoginScreen was pushed (not replaced).
    - Verify that the swipe does not trigger a discard dialog (no `beforeRemove` listener needed here).
    - If swipe-back reaches a blank screen or crashes, the navigation stack setup in `App.tsx`
      needs investigation (verify LoginScreen is a `push` target, not `replace` destination).

19. **Phone receives incoming call during OTP loading phase**
    - Trigger "Send OTP" → app enters loading phase.
    - Receive an incoming call, accept, hang up, return to app.
    - Expected: loading state completes (mock resolves), otp_entry phase renders.
    - `timerRef` may have been paused (OS-level) — countdown accuracy check (UE-1).

20. **Screen rotation during OTP entry (tablet / landscape)**
    - Enter phone, send OTP, arrive at otp_entry.
    - Rotate device to landscape.
    - Expected: `KeyboardAvoidingView` with `behavior="padding"` (iOS) or `"height"` (Android)
      adapts. Card is still visible and scroll works. OTP input is not clipped.
    - No state loss on rotation (React Native retains state across orientation changes).

21. **Auto-focus on otp_entry arrival**
    - After successful OTP send, OTP input should auto-focus after 300ms delay (line 180).
    - Verify keyboard appears without user tap on a real device.
    - On slow devices: if 300ms delay fires before the OTP card render completes,
      `otpInputRef.current` may be null → `focus()` silently no-ops. User must tap manually.
    - Acceptable for now; verify on a 2GB RAM device.

---

### Input Validation Tests

22. **Non-digit characters in phone input**
    - Paste "98abc76-543210" into phone field.
    - Expected: `t.replace(/\D/g, '')` strips non-digits → "9876543210" (10 digits, valid).
    - No error shown. Send OTP button enabled immediately.

23. **Phone number starting with 0 (e.g. 0123456789)**
    - Type "0" → rejected at input layer, inline error shown.
    - Verify input remains empty (value reverts to `phone = ''`).

24. **Phone number starting with 5 (e.g. 5123456789)**
    - Type "5" → rejected at input layer.
    - Same as above.

25. **Phone number starting with 6, 7, 8, 9 — all accepted**
    - Type "6" → accepted. Type "7" → accepted. Etc.
    - No inline error.

26. **9-digit phone number**
    - Enter "987654321" (9 digits) → Send OTP button disabled. Tap → nothing.
    - Type 10th digit → enabled.

27. **Non-digit characters in OTP field**
    - Paste "12ab56" into OTP field.
    - Expected: `t.replace(/\D/g, '')` → "1256" (4 digits). Auto-submit does not fire.
    - No error shown — user sees partial OTP, can continue typing.

28. **OTP longer than 6 digits (copy-paste)**
    - Paste "12345678" → `.slice(0, 6)` → "123456". Auto-submit fires.
    - Verify: only 6 digits processed.

29. **Emoji / special characters in phone field**
    - Paste "📞98765" → `/\D/` strips all non-digits → "98765" (5 digits).
    - Send OTP button disabled. No crash.

---

### Accessibility Tests

30. **Screen reader labels**
    - Verify `accessibilityLabel="Mobile number"` on phone input.
    - Verify `accessibilityLabel="One-time password"` on OTP input.
    - Verify `accessibilityLabel="Send OTP"`, `"Verify OTP"`, `"Resend OTP via SMS"`,
      `"Didn't receive SMS? Try WhatsApp"`, `"Change mobile number"` on buttons.
    - Verify `accessibilityRole="header"` on "MedRecord" logo text.
    - Verify `accessibilityLiveRegion="assertive"` on error boxes (user is notified immediately).
    - Verify `accessibilityLiveRegion="polite"` on OTP sent banner (notified after current action).

31. **Keyboard navigation**
    - On phone_entry, `returnKeyType="done"` triggers `handleSendOtp('sms')` via `onSubmitEditing`.
    - Verify hardware keyboard "Return"/"Done" submits phone number.

---

### Demo Block Tests (DEV builds only)

32. **`__DEV__` guard confirms demo block is stripped in release builds**
    - In dev build: demo block visible below the main card. Buttons functional.
    - In release/production build: demo block completely absent (Metro dead-code elimination).
    - **This is H-1 — verify it is closed.** Run a production build before auth.ts wiring
      and confirm the yellow demo block is gone.

33. **Demo "Phone" button**
    - Tap → phase = phone_entry, phone = '', otp = '', otpError = null.

34. **Demo "OTP" button**
    - Tap → phase = otp_entry, phone = '9876543210', otp = '', banner = false, countdown starts.
    - Auto-submit should NOT fire (otp.length = 0).

35. **Demo "Wrong" button**
    - Tap → phase = otp_entry, otp = '123456', otpError = 'wrong_otp'.
    - Auto-submit should NOT fire (otpError !== null in the useEffect check).

36. **Demo "Expired" button**
    - Tap → phase = otp_entry, otp = '123456', otpError = 'otp_expired'.
    - canResend should be whatever it was before (not explicitly reset in this path).
    - Auto-submit should NOT fire (otpError !== null).

37. **Demo "Verifying" button**
    - Tap → phone = '9876543210', then phase = loading after 50ms.
    - Loading spinner visible. No controls accessible.

---

### Low-End Device Tests

38. **OTP auto-submit on a 2GB RAM Android device**
    - Key concern: the 300ms `setTimeout(() => otpInputRef.current?.focus())` fires before
      the component fully mounts on slow devices. If `otpInputRef.current` is null, the
      focus call is a silent no-op. Verify keyboard opens automatically; if not, this needs
      a longer delay or a callback-based approach.

39. **Rapid digit entry (15 keystrokes in 2 seconds)**
    - On a slow device, state updates from `onChangeText` may batch. Verify that
      `otp` never exceeds 6 digits (`.slice(0, 6)` in the handler) and that auto-submit
      fires exactly once when the 6th digit is confirmed.

40. **Countdown timer on low-end device with GC pauses**
    - `setInterval` with 1000ms ticks may drift on devices under memory pressure.
    - Verify that the countdown reaches 0 (and `canResend = true`) within ≤50s of arrival
      at otp_entry. (Exact timing may drift, but should not be arbitrarily delayed.)

---

## VERDICT

**Ready for device testing (mockup). Cleared to proceed.**

No CRITICAL or HIGH bugs found in the current implementation. Security fixes H-1, M-1, M-2, M-3 are confirmed applied and correct.

Two medium UX issues (MB-1: banner not dismissed on "Change number"; MB-2: send-fail drops user to phone_entry from otp_entry — design question for PM) are documented but do not block device testing of the mockup.

The most significant open items are deferred to the auth.ts session:
- TOO_MANY_ATTEMPTS error handling (UE-2)
- Connectivity pre-check (UE-3)
- Countdown drift on app backgrounding (UE-1)
- No explicit disabled prop on Send OTP during loading (UE-6)

---

## ESTIMATED FIX EFFORT

| Item | Effort |
|---|---|
| MB-1 — Clear banner on "Change number" | 15 min |
| MB-2 — PM design decision: acceptable, no code change | 0 |
| UE-1/UE-2/UE-3/UE-6 — deferred to auth.ts session | auth.ts session |

**Total pre-auth.ts fix effort: ~15 minutes.**

MB-1 is the only actionable fix in this session. It can be addressed now or deferred to
the auth.ts Builder session — it does not block device testing of the mockup.
