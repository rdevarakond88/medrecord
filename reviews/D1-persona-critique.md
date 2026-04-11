# Persona Critique — Login / OTP Screen (D1 / P1)
_Reviewed: 2026-03-16 | Reviewer: Persona Critic Panel_

---

## Screen
- **File:** `src/screens/doctor/LoginScreen.tsx`
- **States reviewed:** phone_entry, loading, OTP sent banner, OTP entry,
  wrong-OTP error (999999), expired-OTP error (000000)
- **Mockup commit:** 3da44a4

---

## DR. RAMAKANT SINHA (Reluctant Doctor)
**Score: 4/5**

**First impression:** "Two steps — enter number, get code. This I can do." The
clean card layout with a single action per phase is exactly right for him.
Pre-filled +91 and large phone input reduce friction.

**Would be confused by:**
1. If the SMS send fails (network error), the screen silently returns to
   phone_entry with no message. He has no idea what happened — he'd assume his
   phone is broken or the app crashed.
2. The OTP auto-submits the moment he types the 6th digit. He might not have
   double-checked his entry. The motion will feel startling the first time.
3. The OTP expired error says "request a new one" but the Resend button is
   locked behind a countdown — he can't act immediately.

**Would like:** "Change number" link below OTP is reassuring. WhatsApp fallback
is a smart escape hatch given unreliable SMS in UP.

**Change request:** Show an explicit error if the OTP send API call fails. On
expired-OTP error, enable Resend immediately (bypass countdown).

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)
**Score: 4/5**

**First impression:** Standard modern OTP login — immediately familiar. She'd
be delighted by iOS QuickType autofill and the auto-submit on 6th digit.

**Would be confused by:** Nothing — she's seen this exact pattern dozens of times.

**Would like:** WhatsApp fallback is a thoughtful India-specific addition she'd
appreciate and recommend to colleagues.

**Change request:** Biometric / face-ID login for returning users is
conspicuously absent — she'll note this as a missing v1 feature. Not a blocker
for mockup review. Language selector would also be expected at login.

---

## SUNITA (Balancer / Clinic Staff)
**Score: 4/5**

**First impression:** Clean and professional enough to hand a new doctor on
their first day. The flow is unambiguous.

**Would be confused by:** Silent failure on OTP send. If a network hiccup
occurs, the screen resets to phone entry with zero explanation. She'd have to
tell the doctor "just try again" with no way to confirm what failed.

**Would like:** The change-number link prevents the stuck state she dreads —
doctor typed wrong number, now locked out of OTP screen.

**Change request:**
1. An error message is required in the OTP-send failure catch block.
2. When OTP has expired and the countdown is still running, Resend should unlock
   immediately — the user already knows the OTP is dead.

---

## SHANTABAI (Elderly Patient)
**Score: 3/5**

**First impression:** "MedRecord — For Patients." She can read the title. She
might hesitate at the mobile-number label — would she type her landline? Her
son's number she uses for WhatsApp? No context is given to guide her.

**Would be confused by:**
1. The OTP concept requires a mental model she may not have. There is no
   explanatory sentence before the Send OTP button.
2. The OTP-sent banner appears for 4 seconds then disappears. She reads slowly.
   By the time she registers the number and wants to confirm it, the banner is gone.
3. Auto-submit fires when she types the 6th digit. If she miskeys, the form
   submits before she can review.
4. Input labels (14px) and error text (13px) are too small for a user who
   already struggles with small text on her basic Android.

**Would like:** A confirmation that a message is coming to her phone. Large text.
She'd warm to the WhatsApp route since she uses WhatsApp with family.

**Change request:**
1. Add guidance line under phone input: "We'll send a 6-digit code to this number."
2. Keep the OTP-sent banner visible until the user starts entering the OTP —
   do not auto-dismiss after 4s.
3. Increase inputLabel to ≥16px; error text to ≥14px.

---

## ARJUN (Semi-Savvy Patient)
**Score: 4/5**

**First impression:** Instantly recognises the pattern — identical to PhonePe,
Ola, BHIM. Zero learning curve.

**Would be confused by:** Nothing in the flow. Would notice the absence of a
language selector — he'd want to switch to Hindi at login, not after.

**Would like:** iOS OTP autofill (if on iPhone). Auto-submit means no extra tap.

**Change request:** Language selector accessible before login for P1 (patient
variant).

---

## WEIGHTED AVERAGE: 3.8 / 5
_(4 + 4 + 4 + 3 + 4) ÷ 5 — above the 3.5 pass threshold_

---

## MUST FIX

**MF-1 — Silent OTP-send failure**
`catch` block in `handleSendOtp()` resets to `phone_entry` with no error
message. Any network error leaves the user staring at the phone form with zero
explanation. The user has no way to distinguish "I typed wrong" from "something
broke."
_Flagged by: Dr. Sinha, Sunita, Shantabai._
Fix: add an error state for OTP-send failure; display a message such as
"Couldn't send OTP. Please try again." in the catch block.

**MF-2 — Auto-dismiss OTP-sent banner (builder unanchored decision)**
No spec anchor. The banner is the user's only confirmation of which number the
OTP was sent to — it must remain visible until the user begins entering the OTP.
Shantabai cannot read and process a disappearing banner in 4 seconds; Dr. Sinha
may also be slow to act.
_Flagged by: Shantabai; explicitly raised by Builder as unanchored._
Fix: remove `setTimeout(() => setOtpSentBanner(false), 4000)`. Dismiss the
banner on the first OTP keystroke (`onChangeText` for the OTP input).

**MF-3 — Expired OTP + active countdown = dead end**
On `otp_expired` error, the Resend button remains locked behind the countdown.
The user is explicitly told to "request a new one" but cannot.
_Flagged by: Dr. Sinha, Sunita._
Fix: when `otpError === 'otp_expired'`, call `setCanResend(true)` immediately,
bypassing the remaining countdown.

---

## SHOULD FIX

**SF-1 — No explanatory context before OTP step**
`phone_entry` shows no hint that "a 6-digit code will be sent to this number."
Elderly patients and first-time users don't know what OTP means. One sentence
below the phone input would remove all ambiguity.
_Flagged by: Shantabai, Dr. Sinha._

**SF-2 — Text sizes too small for P1 reuse (elderly patients)**
`inputLabel` (14px) and `errorText` (13px) fall below comfortable readability
for Shantabai's use case. Login is the entry point — cannot rely on a post-login
large-text mode toggle.
Target: `inputLabel` ≥ 16px, `errorText` ≥ 14px.
_Flagged by: Shantabai._

**SF-3 — Single OTP input vs. individual digit boxes**
Single large field with letter-spacing is functional but the dominant OTP
pattern in India (PhonePe, bank apps) is individual boxes. Minor familiarity gap.
_Flagged by: Dr. Sinha, Shantabai._

---

## NICE TO HAVE

- **Language selector at login** — patients who prefer Hindi cannot set their
  language before entering the OTP flow. Flagged by Arjun.
- **Biometric / remember-device for returning users** — expected by tech-savvy
  users for a v1.1 iteration. Flagged by Dr. Nair.
- **Android SMS autofill (D1-M-1)** — already tracked by Builder as TODO.

---

## BALANCER VERDICT: Revise and re-evaluate

Three MUST FIX items are present — one is a genuine code defect (silent
failure), one is a spec-less builder decision (auto-dismiss banner) that causes
real harm for elderly users, and one is a usability dead-end (expired OTP
countdown lock). All three are small, targeted fixes. The SHOULD FIX items on
text sizes directly affect Shantabai's score of 3/5, which is the only persona
near the floor. A single revision pass addressing the three MUST FIX items and
the text sizes should bring Shantabai to 4/5 and clear the screen for live build.
