# Device Test Session — P1–P5 Patient App (Mockup Phase)
Date: 2026-05-16
Agent: Device Tester
QA plan: reviews/P1-P5-qa-test-plan.md
Screens: P1 PatientLoginScreen, P2 PatientTimelineScreen, P3 PatientVisitDetailScreen,
         P4 PatientDoctorsAccessScreen, P5 PatientProfileScreen

## Infrastructure Pre-flight
| Check | Result |
|---|---|
| Backend status (project-state.md) | UP ✅ |
| Live curl (HTTP 200) | ✅ 2026-05-16 (HTTP 200) |
| Test patient mobile | 8888888888 (Priya Sharma) |
| OTP bypass code | 000000 (TEST_OTP_BYPASS=true) |
| Metro status | Running on port 8082 ✅ |
| Tunnel URL | https://lunchbox-saddled-relock.ngrok-free.dev |
| Expo URL | exp://lunchbox-saddled-relock.ngrok-free.dev (NOTE: do NOT paste this manually — ngrok free tier shows interstitial; scan Metro QR code instead for .exp.direct URL) |
| API wiring | MOCKUP ONLY — no real API calls for this phase |

---

## Test Results

### P1 — Patient Login / OTP Flow

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Open app → tap PatientLogin from dev nav | | |
| T2 | Verify title "MedRecord", subtitle "For Patients", tagline "Access your medical records anytime" | | |
| T3 | Enter phone "8884556234" → button enables at 10 digits | | |
| T4 | Tap "Send OTP" → loading spinner shows "Sending OTP…" | | |
| T5 | OTP entry view appears; OTP sent banner shows "+91 88845 56234" | | |
| T6 | Resend countdown starts at 45s, decrements each second | | |
| T7 | Enter "000000" → auto-submits on 6th digit; loading shows "Verifying…"; navigates to P2 | | |
| T8 | Enter "111111" → "Incorrect OTP. Please check and try again." error box | | |
| T9 | Enter "222222" → "OTP has expired…" + resend enabled | | |
| T10 | Enter "333333" → "Too many attempts…" + OTP cleared + resend enabled | | |
| T11 | Wait 45s → "Resend OTP" link appears; tap → new OTP entry | | |
| T12 | Tap "Change number" → phone entry; phone preserved | | |
| T13 | Type "0" → phoneError "Mobile numbers start with 6–9"; "0" not in field | | |
| T14 | Enter only 9 digits → button stays disabled | | |
| T15 | P1-M1 fix: Paste "0123456789" → phoneError shown; button blocked OR tapping Send OTP shows error | | |
| T16 | Offline: disable network → valid phone → "Send OTP" → "No internet connection" error | | |

### P2 — My Records Timeline

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Arrive from P1 → "My Health Records" header visible | | |
| T2 | Default "All" filter: 4 mock visits grouped by year (2026, 2025, 2024) | | |
| T3 | Tap a visit card → expands; "View records →" → "Hide records ▲" | | |
| T4 | Tap expanded card → collapses | | |
| T5 | Tap "View full details →" → navigates to P3 | | |
| T6 | Switch filter "By Doctor" → regrouped by doctor name; expand state resets | | |
| T7 | Switch filter "By Clinic" → regrouped by clinic | | |
| T8 | Toggle DEV "Empty" state → empty state with 🏥 icon | | |
| T9 | Tap "Doctors" tab → navigates to P4 | | |
| T10 | Tap "Profile" tab → navigates to P5 | | |
| T11 | Scroll: all 4 cards scroll smoothly; header + filter bar stay fixed | | |
| T12 (EC) | Switch filter while card expanded → expanded state resets | | |

### P3 — Visit Record Detail

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Navigate from P2 "View full details →" → P3 header shows visit date, doctor, clinic | | |
| T2 | "Normal" state: scan card + note card; "View full document →" | | |
| T3 | Tap "View full document →" → Alert stub shown | | |
| T4 | Note card shows doctor's note text at 15pt | | |
| T5 | "DOCUMENT TEXT" label shows OCR text | | |
| T6 | DEV state "Scan pending" → "Text being extracted — usually under a minute." | | |
| T7 | DEV state "Scan failed" → "Text extraction was not successful. Ask clinic staff to rescan…" | | |
| T8 | DEV state "Note only" → single note card, no scan | | |
| T9 | "⚑ Something wrong?" footer → Alert stub | | |
| T10 | Tap "← Back" → returns to P2 timeline | | |

### P4 — Doctors Who Have Access

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Navigate from P2 "Doctors" tab → "Doctors Who Have Access" header | | |
| T2 | "Your Doctors" section: 2 active consents (Dr. Anand, Dr. Meenakshi) | | |
| T3 | Each card: doctor name, clinic, "Can view all your health records", "Access since" date | | |
| T4 | "New Requests" section: pending request from Dr. Rajesh Sharma | | |
| T5 | Tap "Remove Access" → Alert "Remove Access?", "Cancel" / "Remove" | | |
| T6 | Tap "Remove" → Dr. Anand disappears from "Your Doctors" | | |
| T7 | P4-M1 fix: Tap "Allow" → Alert shown; doctor moves to "Your Doctors" section | | |
| T8 | Tap "Don't Allow" → Alert shown; card disappears from "New Requests" | | |
| T9 | DEV "Empty" toggle → empty state with 🏥 icon | | |

### P5 — Patient Profile

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Navigate from "Profile" tab → "Profile" header, "Edit" button top-right | | |
| T2 | Avatar shows initials "PS"; name + +91 mobile below | | |
| T3 | "Personal Details": Name, Mobile (non-editable), DOB rows | | |
| T4 | "Preferences": Language row, Text Size row (read-only + 📱 icon) | | |
| T5 | "Log out" button shown (red outline) | | |
| T6 | Tap "Log out" → Alert → tap "Cancel" → no navigation | | |
| T7 | P5-M1 fix: Tap "Log out" → Alert → tap "Log out" → navigates to PatientLogin; back button does NOT return to Profile | | |
| T8 | Tap "Edit" → nav header shows "Save"; "Cancel" button appears | | |
| T9 | Clear name → tap "Save" → Alert "Name required" | | |
| T10 | Type name → tap "Save" → viewing mode; updated name shown | | |
| T11 | DOB: type "14031988" → auto-formats to "14/03/1988" | | |
| T12 | DOB backspace: "14/03/1988" → backspace → "14/03/198" | | |
| T13 | Tap Language row → language modal slides up | | |
| T14 | Select "Hindi — हिन्दी" → modal closes; picker row shows bilingual label | | |
| T15 | Tap "Cancel" → viewing mode; no changes saved | | |
| T16 | "My Records" tab from Profile → navigates to PatientTimeline | | |
| T17 (EC) | Enter only spaces as name → "Name required" Alert | | |
| T18 (EC) | Paste text into DOB field → only digits pass through | | |

---

## Bugs Found

### DT-B1 — BLOCKING: No dev nav entry point to PatientLogin
**Severity:** BLOCKING (prevents all P1–P5 device testing)
**Found:** Session start, before any test cases could run.
**Description:** The doctor's LoginScreen (`src/screens/doctor/LoginScreen.tsx`) is the app's
`initialRoute`. It has no button or link to navigate to `PatientLogin`. The `PatientLogin` route
is registered in App.tsx:225 but is unreachable from any on-device nav path.
This violates the "Mistake 13" process rule: flow-root screens must have a dev nav entry point.
**Fix:** Add a `__DEV__`-gated "Patient App →" button to the doctor's LoginScreen demo block
that calls `navigation.navigate('PatientLogin')`.
**Impact:** All 54 test cases blocked. No P1–P5 testing possible until fixed.

---

## Session Summary

**Total tests run:** 0 / 54
**Results:** BLOCKED before first test case
**Bugs found:** 1 BLOCKING (DT-B1 — no dev nav entry point to PatientLogin)
**Builder handoff:** REQUIRED — fix DT-B1, then restart device testing session
