QA REVIEW — P1–P5 Patient App (Mockup Phase)
Screens: P1 PatientLoginScreen, P2 PatientTimelineScreen, P3 PatientVisitDetailScreen,
         P4 PatientDoctorsAccessScreen, P5 PatientProfileScreen
Date: 2026-05-16
QA Agent session — all five screens reviewed from source code.

---

TESTING PREREQUISITES:
- Backend URL: https://medrecord-api.onrender.com/v1
- Backend status: UP — HTTP 200 confirmed 2026-05-16. Patient endpoints live (GET /patient/profile → 401 ✅).
- Test patient mobile: 8888888888 (Priya Sharma). OTP bypass: code 000000 (TEST_OTP_BYPASS=true).
- API wiring status: ALL FIVE SCREENS ARE MOCKUP ONLY — no real API calls. Device tests
  validate UX flow and mockup states only. Wire-step device tests will require live API.
- Cert pinning: not active in Expo Go (deferred to EAS build). Not a blocker for mockup testing.
- Status: READY TO TEST (mockup UX validation). Wire-step device tests require a separate QA session.

---

MEDIUM BUGS (will cause incorrect or confusing behaviour in mockup/production):

P1-M1 — Send OTP button active but unresponsive when invalid number is pasted or autofilled
  Scenario: User pastes or autofills a 10-digit number whose first digit is < 6 (e.g., "0123456789").
  The inline `onChangeText` first-digit check only fires when `digits.length === 1`, so it does NOT
  block pasting a multi-digit invalid number. `phone` is set to "0123456789", length = 10, so
  `disabled={phone.length < 10}` evaluates false — button appears active.
  Tapping Send OTP: `handleSendOtp` checks `firstDigit < 6` and returns early. No error shown.
  Actual: Button appears tappable; tap produces no visual feedback, no error message.
  Expected: Either block invalid first digit on paste, or show an inline error when button is tapped
            with a sub-6 leading digit.
  Code: PatientLoginScreen.tsx:189–190 (handleSendOtp guard), :353–362 (onChangeText validation).
  Fix: In `handleSendOtp`, after the early-return check, also call `setPhoneError(...)` so the user
       sees feedback. Or add first-digit validation in `onChangeText` regardless of input length.

P4-M1 — Granting a consent request removes the pending card but does NOT move doctor to active list
  Scenario: User taps "Allow" on a pending consent request.
  `handleGrant` filters the request out of `pendingReqs` but does not add the doctor to `consents`.
  Actual: Doctor card disappears entirely after Allow. "Your Doctors" section unchanged.
  Expected: Doctor card moves from "New Requests" to "Your Doctors" section.
  Code: PatientDoctorsAccessScreen.tsx:197–203.
  Impact: Misleads wire-step developer about expected post-grant UX.
  Fix: In mockup, after filtering out the granted request, also push a synthesised `ActiveConsent`
       object into `consents` state. Wire step replaces with real API response handling.

P5-M1 — handleLogout navigates with `navigate` instead of `replace`
  Code: PatientProfileScreen.tsx:273.
  Actual: After logout, pressing the system/hardware back button returns user to Profile screen
          (without credentials — in production this would mean an unauthenticated screen renders).
  Expected: `navigation.replace('PatientLogin')` so the back stack is cleared.
  Fix: Change `navigation.navigate` → `navigation.replace` at wire step (or fix in mockup now
       since it's a one-word change that prevents confusing device test behaviour).

P4-M2 — infoNoteText rendered at 13px (below 14px minimum for patient audience)
  Code: PatientDoctorsAccessScreen.tsx styles.infoNoteText: fontSize: 13.
  Context: Persona Critic established 14px minimum for patient/elderly audience. This note
           ("You control who can see your records…") was not in the P4 critique pass.
  Fix: Change infoNoteText fontSize: 13 → 14.

---

UNHANDLED EDGE CASES (not bugs in mockup, but will matter at wire step):

P1-E1 — No auth guard: screen renders even if patient is already logged in
  At wire step, add a check: if patient token exists in SecureStore, skip login → navigate
  directly to PatientTimeline. Without this, tapping Back from P2 drops the user back on P1.

P2–P5-E1 — No auth guard on P2, P3, P4, P5 (Security wire-step mandate M-2)
  Any unauthenticated navigation to these screens (deep link, expired token, system restart)
  renders the screen without checking for a valid patient JWT.
  Recommended: Add auth guard in each screen's render path at wire step.
  Pattern (same as D2/D3): `if (!patientToken || !patientUser) return null;` after all hooks.

P2-E2 — Tab navigation grows the stack (structural architecture issue)
  P2 uses `navigation.navigate('PatientDoctorsAccess')` and `navigation.navigate('PatientProfile')`.
  Each tab press pushes onto the stack. The "My Records" tab in P4/P5 uses `navigation.goBack()`
  which works when navigating P2→P4, but breaks when navigating P2→P4→P5→"My Records" (only
  goes back one level to P4, not P2).
  Recommended: Replace stack navigation between patient tab screens with a proper Tab Navigator
  at the wire step, or use `navigation.popToTop()` on tab-bar presses.

P1-E3 — OTP token not invalidated client-side after failed verify / expiry
  After `too_many_attempts` or `otp_expired`, `otpToken` remains in state. Pressing "Resend OTP"
  (once canResend = true) calls `handleSendOtp(true)` which fetches a new token and overwrites
  `otpToken`. This is correct. But if `handleSendOtp` fails on resend, the old (expired) `otpToken`
  is still in state. A subsequent verify attempt would send an expired/blocked token.
  Recommended: On OTP_EXPIRED or TOO_MANY_ATTEMPTS, also call `setOtpToken(null)` and prevent
  verify until a fresh token is obtained.

P3-E1 — visitId nav param received but not used in display
  `route.params.visitId` is destructured (or available) but the screen uses mock data in __DEV__
  and does not use visitId for any API call. At wire step, visitId is the primary key for
  GET /patient/visits/:id. Must be used.

P3-E2 — `displayDate`, `displayDoctor`, `displayClinic` fall back to nav params in production build
  `const { date, doctorName, clinicName } = route.params;` — in production (`__DEV__ = false`),
  these nav params are used directly. If any is missing (malformed link, navigation bug), the
  render would show undefined. Add fallback strings at wire step.

P5-E2 — DOB accepts any input; no date validity check
  "99/99/9999" would save without error. Wire step must validate parsed date is a real calendar
  date (e.g., month ≤ 12, day ≤ 31, year ≤ current year).

P5-E3 — Language preference is only held in local component state (not persisted)
  Changing language and navigating away loses the preference. Wire step must persist to
  AsyncStorage or SecureStore, and apply app-wide.

P4-E2 — Consent revoke Alert says "Remove" but action uses `style: 'destructive'`
  Minor UX inconsistency. The DPDP spec says consent revoke should be deliberate. The two-step
  Alert confirmation (present) + style: destructive (present) is correct. No change needed.

---

WIRE-STEP SECURITY MANDATES (from Security Audit M-2 and M-3 — not yet implemented):
These are deferred items explicitly flagged in the Security Audit. QA confirms they are
required before any wire-step device testing:
  M-2: Auth guard (`requirePatientAuth`) on all P2–P5 routes (backend) AND auth check on
       all P2–P5 screens (frontend) — redirect to PatientLogin if patient JWT missing/expired.
  M-3: On logout (P5 handleLogout), clear patient refresh token from expo-secure-store AND
       clear patient auth state before navigating.

---

TEST PLAN:
  P1 — Patient Login / OTP Flow:
    Happy Path:
    1. Open app → tap PatientLogin from developer navigation or launch directly.
    2. Verify title "MedRecord", subtitle "For Patients", tagline "Access your medical records anytime".
    3. Enter phone "8884556234" → button enables at 10 digits.
    4. Tap "Send OTP" → loading spinner shows "Sending OTP…".
    5. OTP entry view appears; OTP sent banner shows "+91 88845 56234".
    6. Resend countdown starts at 45s, decrements each second.
    7. Enter "000000" → auto-submits on 6th digit. Loading shows "Verifying…".
    8. Navigates to PatientTimeline (P2). PASS.

    Error states:
    9. Enter "111111" → "Incorrect OTP. Please check and try again." error box. PASS.
    10. Enter "222222" → "OTP has expired. Please request a new one." + resend enabled. PASS.
    11. Enter "333333" → "Too many attempts. Please request a new OTP." + otp cleared + resend enabled. PASS.
    12. Wait 45s → "Resend OTP" link appears. Tap → spinner, new OTP entry. PASS.
    13. Tap "Change number" → returns to phone entry, phone preserved (user must re-enter). PASS.
    14. Enter phone "0123456789" (invalid first digit via character-by-character):
        - Type "0" → phoneError shows "Mobile numbers start with 6–9"; "0" does not appear in field. PASS.
    15. Enter only 9 digits → button stays disabled. PASS.

    Offline:
    16. Disable network → enter valid phone → tap "Send OTP" → "No internet connection" error. PASS.

  P2 — My Records Timeline:
    Happy Path:
    1. Arrive from P1 (PatientLogin) → verify "My Health Records" header.
    2. Default filter "All" shows 4 mock visits grouped by year (2026, 2025, 2024).
    3. Tap a visit card → expands to show records. "View records →" becomes "Hide records ▲". PASS.
    4. Tap expanded card again → collapses. PASS.
    5. Tap "View full details →" inside expanded card → navigates to P3 (PatientVisitDetail). PASS.
    6. Switch filter to "By Doctor" → visits regrouped by doctor name. "View records →" reset. PASS.
    7. Switch filter to "By Clinic" → regrouped by clinic. PASS.
    8. Toggle DEV "Empty" state → empty state with 🏥 icon and description. PASS.
    9. Tap "Doctors" tab → navigates to P4 PatientDoctorsAccess. PASS.
    10. Tap "Profile" tab → navigates to P5 PatientProfile. PASS.

    Scroll:
    11. All 4 visit cards scroll smoothly; header and filter bar stay fixed. PASS.

  P3 — Visit Record Detail:
    Happy Path:
    1. Navigate from P2 "View full details →" → P3 header shows visit date, doctor, clinic.
    2. "Normal" demo state: scan card + note card. Scan card shows doc card, "View full document →" opens Alert stub. PASS.
    3. Tap "View full document →" → Alert: "Full document viewer will be available in the next update." PASS.
    4. Note card shows doctor's note text at 15pt. PASS.
    5. "DOCUMENT TEXT" label shows OCR text. PASS.
    6. Switch DEV state to "Scan pending" → single scan card; body shows "Text being extracted — usually under a minute." PASS.
    7. Switch to "Scan failed" → scan card + note; body shows "Text extraction was not successful. Ask clinic staff to rescan if text is needed." PASS.
    8. Switch to "Note only" → single note card, no scan. PASS.
    9. "⚑  Something wrong?" footer → Alert stub. PASS.
    10. Tap "← Back" → returns to P2 timeline. PASS.

  P4 — Doctors Who Have Access:
    Happy Path:
    1. Navigate from P2 "Doctors" tab → header "Doctors Who Have Access".
    2. "Your Doctors" section shows 2 active consents (Dr. Anand, Dr. Meenakshi).
    3. Each card shows doctor name, clinic, "Can view all your health records", "Access since" date. PASS.
    4. "New Requests" section shows pending request from Dr. Rajesh Sharma. PASS.
    5. Tap "Remove Access" on Dr. Anand → Alert confirms: "Remove Access?", "Cancel" / "Remove". PASS.
    6. Tap "Remove" → Dr. Anand card disappears from "Your Doctors". PASS.
    7. Tap "Allow" on pending request → Alert "Access Allowed"; card disappears from "New Requests". PASS.
        EXPECTED FAIL: Doctor should move to "Your Doctors" but instead disappears. Log as P4-M1.
    8. Tap "Don't Allow" on pending request → Alert "Access Not Allowed"; card disappears. PASS.
    9. Toggle DEV "Empty" → empty state with 🏥 icon. PASS.
    10. "← Back" → navigates back.

  P5 — Patient Profile:
    Viewing mode:
    1. Navigate from "Profile" tab. Header shows "Profile", "Edit" button top-right.
    2. Avatar circle shows initials "PS" (Priya Sharma). Name and +91 mobile shown below. PASS.
    3. "Personal Details" card: Name, Mobile (non-editable), DOB rows. PASS.
    4. "Preferences" card: Language row, Text Size row (read-only with 📱 icon). PASS.
    5. "Log out" button shown (red outline). PASS.
    6. Tap "Log out" → Alert "Log out?" → tap "Cancel" → no navigation. PASS.
    7. Tap "Log out" → Alert → tap "Log out" → navigates to PatientLogin.
       EXPECTED FAIL: Uses navigate (not replace) — back button returns to Profile. Log as P5-M1.

    Editing mode:
    8. Tap "Edit" → nav header shows "Save". "Cancel" button appears in body.
    9. Name field is editable. Clear name → tap "Save" → Alert "Name required". PASS.
    10. Type name → tap "Save" → viewing mode; updated name shown in avatar + profile. PASS.
    11. DOB field: type "14031988" → auto-formats to "14/03/1988". PASS.
    12. DOB backspace: type "14/03/1988", backspace → "14/03/198" correctly. PASS.
    13. Tap Language row → language modal slides up. PASS.
    14. Select "Hindi — हिन्दी" → modal closes; picker row shows bilingual label. PASS.
    15. Tap "Cancel" in edit mode → returns to viewing; no changes saved. PASS.
    16. Tab bar navigation from Profile: "My Records" → PatientTimeline. PASS.

  Edge Cases:
    P1-EC-1: Tap "Send OTP" multiple times in quick succession (double-tap) →
             isSendingRef guard prevents duplicate requests. Only one loading spinner. PASS.
    P1-EC-2: Enter OTP, wait for auto-submit, then quickly type another digit before submit completes →
             isVerifyingRef guard prevents duplicate verify. PASS.
    P2-EC-1: Switch filter while a visit is expanded → expanded state resets. PASS.
    P5-EC-1: Enter name with only spaces → trim() returns ''; "Name required" Alert. PASS.
    P5-EC-2: Enter DOB with letters (if user finds a way to paste text into DOB field) →
             `replace(/\D/g, '')` strips non-digits. Only numerics pass through. PASS.

---

VERDICT: Ready for device testing (mockup phase).
No CRITICAL bugs. Two MEDIUM bugs should be fixed before or during device testing:
  - P5-M1 (navigate → replace for logout) — easy one-line fix; fixes confusing test behaviour.
  - P4-M1 (grant moves to active) — fix for correct mock behaviour before device test.
P1-M1 and P4-M2 can be fixed in the same Builder session.
Wire-step device test requires a separate QA session after wiring.

BUILDER SESSION REQUIRED: Yes — 4 medium bugs (P1-M1, P4-M1, P4-M2, P5-M1) before device test.

ESTIMATED FIX EFFORT: 1 hour (all four are targeted one-to-five line fixes).
