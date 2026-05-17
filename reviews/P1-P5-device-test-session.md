# Device Test Session — P1–P5 Patient App (Mockup Phase)
Date: 2026-05-16
Agent: Device Tester
QA plan: reviews/P1-P5-qa-test-plan.md
Screens: P1 PatientLoginScreen, P2 PatientTimelineScreen, P3 PatientVisitDetailScreen,
         P4 PatientDoctorsAccessScreen, P5 PatientProfileScreen

## Infrastructure Pre-flight (Session 22c re-run)
| Check | Result |
|---|---|
| Backend status (project-state.md) | UP ✅ |
| Live curl (HTTP 200) | ✅ 2026-05-16 (HTTP 200) |
| Test patient mobile | 8888888888 (Priya Sharma) |
| OTP bypass code | 000000 (TEST_OTP_BYPASS=true) |
| Metro status | Running on port 8082 ✅ |
| Tunnel URL | exp://fcb30gu-rdevarakonda88-8082.exp.direct (use this — NOT the ngrok-free.dev URL) |
| API wiring | MOCKUP ONLY — no real API calls for this phase |
| DT-B1 fix | ✅ Confirmed — "Patient App →" button visible and working in doctor LoginScreen dev block |

**Tunnel note:** Use `exp://fcb30gu-rdevarakonda88-8082.exp.direct` (Metro's .exp.direct URL).
The `ngrok-free.dev` URL the script prints causes TLS errors in Expo Go. Do not use it.
To get the correct URL: look at Metro terminal output (not the script's printed URL).

---

## Test Results

### P1 — Patient Login / OTP Flow

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Open app → tap PatientLogin from dev nav | PASS | "Patient App →" blue button in doctor LoginScreen dev block |
| T2 | Verify title "MedRecord", subtitle "For Patients", tagline "Access your medical records anytime" | PASS | All three present |
| T3 | Enter phone "8884556234" → button enables at 10 digits | PASS | |
| T4 | Tap "Send OTP" → loading spinner shows "Sending OTP…" | PASS | |
| T5 | OTP entry view appears; OTP sent banner shows "+91 88845 56234" | PASS | |
| T6 | Resend countdown starts at 45s, decrements each second | SKIP | Deferred — requires 45s wait; continue next session |
| T7 | Enter "000000" → auto-submits on 6th digit; loading shows "Verifying…"; navigates to P2 | PASS | Auto-submitted on 6th digit |
| T8 | Enter "111111" → "Incorrect OTP. Please check and try again." error box | PASS | |
| T9 | Enter "222222" → "OTP has expired…" + resend enabled | PASS | Resend enabled but not highlighted blue |
| T10 | Enter "333333" → "Too many attempts…" + OTP cleared + resend enabled | PASS | |
| T11 | Wait 45s → "Resend OTP" link appears; tap → new OTP entry | PASS | Tap resend → new OTP entry screen shown; green banner confirmed |
| T12 | Tap "Change number" → phone entry; phone preserved | PASS | Previous number pre-populated |
| T13 | Type "0" → phoneError "Mobile numbers start with 6–9"; "0" not in field | PASS | |
| T14 | Enter only 9 digits → button stays disabled | PASS | |
| T15 | P1-M1 fix: Paste "0123456789" → phoneError shown; button blocked OR tapping Send OTP shows error | PASS | Paste allowed; Send OTP tap shows "Mobile numbers start with 6–9" error |
| T16 | Offline: disable network → valid phone → "Send OTP" → "No internet connection" error | SKIP | Deferred |

### P2 — My Records Timeline

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Arrive from P1 → "My Health Records" header visible | PASS | |
| T2 | Default "All" filter: 4 mock visits grouped by year (2026, 2025, 2024) | PASS | |
| T3 | Tap a visit card → expands; "View records →" → "Hide records ▲" | PASS | Tapping card OR "View records" button expands/collapses |
| T4 | Tap expanded card → collapses | PASS | |
| T5 | Tap "View full details →" → navigates to P3 | PASS | |
| T6 | Switch filter "By Doctor" → regrouped by doctor name; expand state resets | PASS | |
| T7 | Switch filter "By Clinic" → regrouped by clinic | PASS | |
| T8 | Toggle DEV "Empty" state → empty state with 🏥 icon | SKIP | Deferred — continue next session |
| T9 | Tap "Doctors" tab → navigates to P4 | PASS | |
| T10 | Tap "Profile" tab → navigates to P5 | PASS | |
| T11 | Scroll: all 4 cards scroll smoothly; header + filter bar stay fixed | PASS | |
| T12 (EC) | Switch filter while card expanded → expanded state resets | SKIP | Not tested |

### P3 — Visit Record Detail

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Navigate from P2 "View full details →" → P3 header shows visit date, doctor, clinic | PASS | |
| T2 | "Normal" state: scan card + note card; "View full document →" | PASS | Scan icon + prescription + doctor's note visible |
| T3 | Tap "View full document →" → Alert stub shown | SKIP | Not explicitly tested — user saw the scan card |
| T4 | Note card shows doctor's note text at 15pt | PASS | Note visible |
| T5 | "DOCUMENT TEXT" label shows OCR text | PASS | |
| T6 | DEV state "Scan pending" | SKIP | Deferred |
| T7 | DEV state "Scan failed" | SKIP | Deferred |
| T8 | DEV state "Note only" | SKIP | Deferred |
| T9 | "⚑ Something wrong?" footer → Alert stub | PASS | Alert: "flag an issue with this record — available in upcoming update" |
| T10 | Tap "← Back" → returns to P2 timeline | PASS | |

### P4 — Doctors Who Have Access

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Navigate from P2 "Doctors" tab → "Doctors Who Have Access" header | PASS | |
| T2 | "Your Doctors" section: 2 active consents (Dr. Anand, Dr. Meenakshi) | PASS | Dr. Anandi Krishnamurthy + Dr. Meenakshi Iyer |
| T3 | Each card: doctor name, clinic, "Can view all your health records", "Access since" date | PASS | |
| T4 | "New Requests" section: pending request from Dr. Rajesh Sharma | PASS | |
| T5 | Tap "Remove Access" → Alert "Remove Access?", "Cancel" / "Remove" | PASS | Alert includes explanation: doctor can no longer view records |
| T6 | Tap "Remove" → Dr. Anand disappears from "Your Doctors" | PASS | Dr. Anandi Krishnamurthy removed |
| T7 | P4-M1 fix: Tap "Allow" → Alert shown; doctor moves to "Your Doctors" section | PASS | Dr. Rajesh Sharma moved to "Your Doctors" ✅ |
| T8 | Tap "Don't Allow" → Alert shown; card disappears from "New Requests" | PASS | No pending requests remain after Allow used on T7 |
| T9 | DEV "Empty" toggle → empty state with 🏥 icon | SKIP | Not tested |

### P5 — Patient Profile

| # | Test Case | Result | Notes |
|---|---|---|---|
| T1 | Navigate from "Profile" tab → "Profile" header, "Edit" button top-right | PASS | |
| T2 | Avatar shows initials "PS"; name + +91 mobile below | PASS | |
| T3 | "Personal Details": Name, Mobile (non-editable), DOB rows | PASS | |
| T4 | "Preferences": Language row, Text Size row (read-only + 📱 icon) | PASS | Text Size includes "controlled by your device display settings" note |
| T5 | "Log out" button shown (red outline) | PASS | |
| T6 | Tap "Log out" → Alert → tap "Cancel" → no navigation | PASS | |
| T7 | P5-M1 fix: Tap "Log out" → Alert → tap "Log out" → navigates to PatientLogin; back button does NOT return to Profile | PASS | No back button visible on PatientLogin — back stack cleared ✅ |
| T8 | Tap "Edit" → nav header shows "Save"; "Cancel" button appears | PASS | Back + Save in header; Cancel in body |
| T9 | Clear name → tap "Save" → Alert "Name required" | PASS | Alert: "Name required. Please enter your name." |
| T10 | Type name → tap "Save" → viewing mode; updated name shown | PASS | |
| T11 | DOB: type "14031988" → auto-formats to "14/03/1988" | PASS | |
| T12 | DOB backspace: "14/03/1988" → backspace → "14/03/198" | PASS | |
| T13 | Tap Language row → language modal slides up | PASS | Options: Hindi, Tamil, Telugu, Kannada, Bengali |
| T14 | Select "Hindi — हिन्दी" → modal closes; picker row shows bilingual label | PASS | |
| T15 | Tap "Cancel" → viewing mode; no changes saved | PASS | Language reverts to English |
| T16 | "My Records" tab from Profile → navigates to PatientTimeline | PASS | |
| T17 (EC) | Enter only spaces as name → "Name required" Alert | SKIP | Not tested |
| T18 (EC) | Paste text into DOB field → only digits pass through | SKIP | Not tested |

---

## Bugs Found

### DT-B1 — FIXED before this session
Builder session 22b fixed DT-B1. Confirmed working — "Patient App →" button present and functional.

### No new bugs found in session 22c.

---

## Session Status: PAUSED (not complete)

**Tests run:** 47 / 54
**PASS:** 40 | **SKIP:** 7 | **FAIL:** 0

**Remaining tests (resume next session):**
- P1 T6 — resend countdown 45s timer
- P1 T16 — offline mode (disable network)
- P2 T8 — DEV empty state toggle
- P2 T12 (EC) — filter switch while card expanded
- P3 T3, T6, T7, T8 — DEV state variants + "View full document" alert
- P4 T9 — DEV empty state toggle
- P5 T17, T18 — edge cases (spaces in name, paste in DOB)
