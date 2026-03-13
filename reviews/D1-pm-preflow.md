# PM REVIEW — Pre-Flight: D1 Login / OTP

**Date:** 2026-03-13
**Agent:** PM
**Moment:** 1 — Pre-flight gate before Builder starts D1

---

## PROCEED: Yes with changes

---

## CONCERNS

**1. WhatsApp fallback scope is ambiguous**
The security spec locks in "SMS primary + WhatsApp fallback for rural delivery." WhatsApp delivery is server-side (the app calls `POST /auth/send-otp`), so the Builder does not wire up WhatsApp directly. However, the UI needs a "Didn't receive SMS? Try WhatsApp" secondary link. Without it, the fallback channel is invisible to the user. Add this link to the D1 build: it appears below the resend countdown and triggers a separate API flag (e.g. `?channel=whatsapp`). **Required — do not defer.**

**2. Android SMS OTP autofill not specified**
Android supports automatic OTP population via SMS Retriever API. In a market where ~80% of target devices are Android, not implementing this means doctors manually transcribe the OTP under time pressure during a consultation. Builder should implement React Native SMS autofill (`react-native-otp-verify` or Expo-equivalent). iOS handles this natively. **Required, not optional.**

**3. Screen is Doctor-only for this build — prop-ise the subtitle now**
P1 (Patient login) reuses D1 with a subtitle change ("For Patients" vs "For Doctors & Clinics"). Builder should accept the subtitle as a prop, not hardcode it. Zero extra effort now; avoids a rewrite when the patient app is built.

**4. "OTP sent" confirmation display**
Show a clear "OTP sent to +91 XXXXX" confirmation immediately after the API call returns — before the OTP arrives. Do not leave the user wondering if anything happened. A doctor who sees no feedback after tapping "Send OTP" will tap again, or abandon.

**5. Distinguish error states**
"Wrong OTP" and "OTP expired" must be distinct error messages. Both map to a 4xx API error but the user action is different: wrong OTP → try again; expired → request a new one. The resend countdown (45s, UI spec) and OTP validity window (5 min, security spec) are not in conflict — the countdown is a spam guard, not an expiry indicator.

---

## REGULATORY FLAGS

None blocking. OTP-based auth does not trigger separate DPDP 2023 consent obligations. The security spec (OTP expiry, attempt limits, rate limits, JWT claims, SecureStore for refresh token) is already locked and compliant. Builder follows it as written.

---

## MARKET REALITY NOTES

- Doctors in this market do not memorise passwords and do not use password managers. OTP is the right auth mechanism. No change to the core approach.
- Semi-urban India has variable SMS delivery times (5–30 seconds typical, but occasionally up to 2–3 minutes on certain networks). The 45s resend countdown is appropriate — do not shorten it to the point of encouraging re-requests.
- The login screen is the first impression. Any failure here (slow OTP delivery, unclear feedback) signals "broken app" to a cautious practitioner who may not give it a second chance.
