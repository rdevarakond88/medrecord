# Persona Critique — Consent Request Flow (D9)
_Completed: 2026-05-09_

---

## PERSONA CRITIQUE — Consent Request Flow (D9)

### DR. RAMAKANT SINHA (Reluctant Doctor)
**Score: 2/5**

**First impression:** Sees a spinner, then "SMS sent", then needs to hand his phone to the patient. He'd stop right there — this is something he has never done before. Paper didn't require him to pass his phone to a patient and explain what they're supposed to do with it.

**Would be confused by:** The overall interaction model — not the screen itself. He doesn't object to any individual label, but the act of handing a clinic phone to a 71-year-old patient and expecting her to find and enter a 6-digit SMS code is a new social burden he did not have before. He will also not understand why he needs to do this for patients he already knows. "Patient is ready — show them the entry screen" is an instruction he has to interpret and act on — it doesn't feel automatic.

**Would like:** "Patient not available" as a first-class exit is exactly right for him. He'll use this button often, and it leads to a clear state (new visit, no history). The skip path has the right weight — prominent but not the primary call to action.

**Change request:** Add 1-line framing in the Waiting screen: "This unlocks [Patient Name]'s records from other doctors. First visit only." He needs to understand why this overhead is worth it, and that it's a one-time cost per patient. Consent caching must be confirmed — repeat visits should never trigger this flow again. His 2/5 is mostly a workflow-model score, not a screen score; the screen design itself is reasonable given the constraint.

---

### DR. PRIYA NAIR (Tech-Savvy Doctor)
**Score: 4/5**

**First impression:** Immediately understands the OTP flow. Approves of the 7-state design — it covers the failure modes (resend, retry, patient not available). The masked mobile display is the right privacy decision.

**Would be confused by:** The instruction card labels "Step 1" but there is no "Step 2" visible. After she taps "Patient is ready — show them the entry screen" and hands the phone over, she gets no indication the patient is entering the code. If the patient takes 60 seconds, she doesn't know whether the patient is working through it or has stalled. The doctor is essentially blind after the handoff.

**Would like:** The resend countdown timer is well-implemented — accurate wall-clock math, not drift-prone. The failure screen giving the 10-minute OTP validity is a useful detail. Auto-return to D3 on success is the correct choice.

**Change request:** Add a "Waiting for patient…" intermediate state visible to the doctor after tapping "Patient is ready" — even a simple "Your patient is entering the code now" placeholder. The OTP validity window (10 minutes) should also appear in the Waiting state, not just the Failure state.

---

### SUNITA (Balancer / Staff)
**Score: 3/5**

**First impression:** Immediately reads the masked mobile (•••• 9876) and thinks: "Is that the right number?" She manages intake and has caught mobile number typos before. There is no way to correct the number from this screen before the SMS is sent.

**Would be confused by:** If the patient says "that last four digits don't match my number," there's nothing Sunita can do from this screen. She'd have to back out, go to D5/D3 to fix the number, and restart the whole flow. No in-flow mobile number correction is a real operational gap for front-desk staff. Also: the OTP entry screen is English-only — many patients (particularly older women, patients from smaller towns) will ask Sunita what to do, which puts her back in the loop as a translator.

**Would like:** The "Patient not available" path is her most-used escape hatch. The step-by-step instruction card is operationally clear for training new staff. The countdown to resend is a useful signal.

**Change request:** Add a "Wrong number? Edit and resend" link in the Waiting state before the patient attempts entry. At minimum a way to cancel and restart. For the OTP entry screen: add a Hindi subtitle under the primary instruction — "अपना 6-अंकों का कोड डालें" — so she doesn't have to translate for every patient.

---

### SHANTABAI (Elderly Patient)
**Score: 2.5/5**

**First impression:** A white screen with "MedRecord" in blue, large text "Enter your 6-digit code", and six boxes. She has never used an OTP entry screen without her grandson's help. The screen is clean and uncluttered — this is the right instinct. But she is on a stranger's phone, in a busy clinic, possibly holding a prescription folder.

**Would be confused by:** (1) Six individual boxes — she may not understand she needs to tap the first box to start. She might tap the "Confirm" button first, see it do nothing (it's disabled), and think the phone is broken. There is no feedback on why the button is disabled. (2) "Check the SMS from MedRecord on your phone" — she'd have to switch to her own phone to find the SMS, then switch back to the doctor's phone to type it. This context switch is genuinely hard on a borrowed device. (3) "Didn't receive a code? Ask your doctor to resend" — she may not understand "resend." She'll show it to the doctor anyway, which is fine, but the phrasing adds a translation step.

**Would like:** The white background and large 28pt instruction text are exactly right. The 6 large OTP boxes (48×60 each) with 26pt digit size are readable if she finds them. The "Confirm" button is a large full-width target.

**Change request:** When the disabled "Confirm" button is tapped with fewer than 6 digits entered, show a brief inline message: "Please enter all 6 digits." Without this, she'll tap Confirm repeatedly and conclude the phone is malfunctioning. Also: add a Hindi instruction line below the English — even a simple "अपना SMS कोड डालें" reduces friction for non-English readers.

---

### ARJUN (Semi-Savvy Patient)
**Score: 4/5**

**First impression:** Recognises the OTP box pattern immediately — same as PhonePe, Paytm, Ola. Feels familiar and trustworthy. Six boxes, number-pad keyboard, auto-advance. He'd enter the code in under 10 seconds.

**Would be confused by:** The success screen footnote — "You can remove this access at any time from the MedRecord app." He may not have the patient-facing MedRecord app installed. "The MedRecord app" sounds like a different product. He'd wonder: "Is this another app I need to download? What if I don't have it?" If he doesn't act on this immediately, he may feel he's lost the ability to revoke access.

**Would like:** Zero patient/doctor data on the patient-facing screens — this is correct for his privacy concerns. The consent is opt-in, time-bounded by session (SMS expires in 10 min), and the doctor can't see his OTP input. These are all right.

**Change request:** Revise success footnote to: "To remove this access later, contact the clinic." Don't imply a patient app the user may not have.

---

## Summary

```
─────────────────────────────
WEIGHTED AVERAGE: 3.4/5

Criteria breakdown (rubric weights — D9 is a dual-audience screen):
  Clarity of handoff sequence (doctor ↔ patient)    (35%) — 3.5/5
  Legibility for low-literacy / non-English patients (25%) — 2.5/5  ← English-only OTP entry
  Speed / friction for the doctor                   (20%) — 3.0/5
  Privacy and trust signals                         (10%) — 4.5/5
  Fallback path quality                             (10%) — 4.5/5

Weighted: (3.5×0.35) + (2.5×0.25) + (3.0×0.20) + (4.5×0.10) + (4.5×0.10) = 3.4/5
```

---

## MUST FIX

- **OTP entry screen is English-only** — the patient-facing screen (Variant 3) carries no regional language. The spec explicitly states this screen must be safe for a low-literacy patient in 10 seconds. An English-only instruction fails Shantabai and much of the clinic's actual patient population. Add Hindi subtitle at minimum: under "Enter your 6-digit code" add "अपना 6-अंकों का कोड डालें"; under "Check the SMS from MedRecord" add "MedRecord के SMS से कोड देखें." — _flagged by Sunita, Shantabai._

- **Disabled "Confirm" button provides no feedback** — any patient who taps it with fewer than 6 digits entered gets no indication of why it isn't responding. Show inline hint on tap: "Please enter all 6 digits." Without this, elderly patients will tap it repeatedly and assume the phone is broken. — _flagged by Shantabai._

- **Dr. Sinha's 2/5 score triggers the MUST FIX threshold.** His score reflects inherent workflow friction from the consent model (passing the phone to a patient is a new social step), not a fixable screen-layout issue. The actionable mitigation: (a) add 1-line framing in the Waiting state — "Unlocks full patient history — one-time setup for new patients"; (b) confirm in spec and implementation that consent is cached — returning patients must never trigger this flow again. — _flagged by Dr. Sinha._

---

## SHOULD FIX

- **No mobile number correction path** — if the registered mobile is wrong, the flow dead-ends. Staff cannot correct it mid-flow. Add "Wrong number? Go back to edit" link in the Waiting state. — _flagged by Sunita._

- **Doctor has no feedback after handing phone to patient** — after tapping "Patient is ready — show them the entry screen", the doctor side goes dark. There is no "Waiting for patient to enter code…" state visible to the doctor. Add a minimal holding state on the doctor's side, or clarify how the hand-back-and-auto-return flow works in the UX. — _flagged by Dr. Nair._

- **Success screen footnote implies a patient app the user may not have** — "You can remove this access at any time from the MedRecord app" is misleading if the patient doesn't have the patient app installed. Revise to: "To remove access later, contact the clinic." — _flagged by Arjun._

---

## NICE TO HAVE

- OTP validity window (10 minutes) shown in the Waiting state, not only in the Failure state — Sunita needs this to manage patient expectations proactively. — _flagged by Dr. Nair, Sunita._
- Consider a single large number input field as an alternative to 6 discrete boxes for clinics serving many elderly patients — 6 separate boxes are UX-standard but cognitively harder than one field on a borrowed device. — _flagged by Shantabai._

---

## BALANCER VERDICT: Revise and re-evaluate

**Rationale:** The privacy architecture is excellent — the patient-facing states expose zero clinical context, the masked mobile is correct, the fallback exit is first-class, and the auto-return to D3 is the right success behaviour. However two issues must be fixed before the live build: the English-only OTP entry screen (a direct failure against the spec's low-literacy requirement) and the silent disabled button (will cause repeated tap attempts by elderly patients who don't understand why nothing is happening). The SHOULD FIX items — especially the mobile number correction gap — will surface as real operational friction on Day 1 at any clinic. Apply all MUST FIX and SHOULD FIX items; proceed to Security Agent without a full re-evaluation unless screen structure changes materially.
