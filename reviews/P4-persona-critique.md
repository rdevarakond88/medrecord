# Persona Critique — Doctors Who Have Access (P4)

**Date:** 2026-05-16
**Mockup file:** `src/screens/patient/PatientDoctorsAccessScreen.tsx`
**Verdict:** Revise and re-evaluate

---

## DR. RAMAKANT SINHA (Reluctant Doctor)

**Score: 3/5**

**First impression:** "So this is what my patients see when they manage who has access to their records. OK. Seems organised."

**Would be confused by:** Nothing directly — this is a patient screen, not his workflow. But he'd note: if a patient accidentally taps "Revoke Access" and panics, he'd have no way to know. He'd wonder: "If they revoke me, do I get told?"

**Would like:** The clean card layout — doctor name big and prominent, easy to identify. The confirmation alert before revoke is reassuring.

**Change request:** From a doctor's perspective, he senses the "Revoke" wording could cause patient anxiety at the desk. Patients might ask staff for help rather than act independently.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)

**Score: 3.5/5**

**First impression:** "Clean. Works. Covers the basics."

**Would be confused by:** Nothing structurally. But immediately asks: "What does 'access' mean exactly? Full record history, or just records I created? I want patients to understand what they're consenting to."

**Would like:** The pending request flow — Grant/Deny with confirmation alerts is a familiar, correct pattern. Tab bar is appropriate.

**Change request:** Add scope note per active consent card ("Can view your health records from all clinics"). Wants future audit trail — "what did the doctor view?" — but understands that's v2.

---

## SUNITA (Balancer / Staff)

**Score: 3/5**

**First impression:** "I'd have to explain this whole screen to most patients who come to our clinic. Let me see if I can do it quickly."

**Would be confused by:** "ACTIVE ACCESS" — patients will ask "active access means what?" She'd have to translate "Revoke Access" to plain Marathi on the fly every time. "Pending" badge is fine for her but needs explanation to patients.

**Would like:** The structure — seeing active consents and pending requests on the same screen is operationally efficient. Grant/Deny on pending requests is clearly laid out.

**Change request:** Replace "Revoke Access" with "Remove Access" or "Stop Sharing." Change section labels from "ACTIVE ACCESS" to "Your Doctors" and "PENDING REQUESTS" to "New Requests." These changes would halve her explanation time with patients.

---

## SHANTABAI KADAM (Elderly Patient)

**Score: 2/5**

**First impression:** Sees her doctors' names — that's reassuring. "Ah, Dr. Anand Krishnamurthy is here."

**Would be confused by:** "Revoke Access" — she doesn't know this word. She'd look at the red-bordered button and assume something is wrong or broken. "ACTIVE ACCESS" and "PENDING REQUESTS" are English labels she cannot parse without help. She'd see a "Pending" badge and not know what it means. "Grant Access" is also outside her vocabulary. She'd tap nothing without asking her grandchild for help.

**Would like:** That her doctor's name is big and readable. The 🏥 empty state icon is friendly. She can read the date format ("15 Jan 2025") — familiar.

**Change request:** Replace all action labels with simple plain English: "Remove" instead of "Revoke Access," "Allow" / "Don't Allow" instead of "Grant Access" / "Deny." Change section labels to "Your Doctors" and "New Requests." "Access since" at 13px is too small — needs 14px minimum. The info note "Revoking access takes effect immediately" also uses "revoking" — must be updated to match.

---

## ARJUN MEHTA (Semi-Savvy Patient)

**Score: 3.5/5**

**First impression:** "Ah, like a permissions screen in a banking app. This is straightforward."

**Would be confused by:** What does "access" mean in practice? Does Dr. Anand see only records from his clinic, or all my records everywhere? This ambiguity is a real privacy concern.

**Would like:** That he can see the date since access was granted — that's transparency he values. The DPDP info note "You control who can see your records" directly answers his data privacy anxiety. Grant/Deny flow is intuitive — he's done this in other apps.

**Change request:** One sentence per card explaining scope: "Can view all your health records." He'd also like a time-limited access option, but understands that's probably v2.

---

## WEIGHTED AVERAGE: 3.0 / 5

_(Simple average across five personas: 3 + 3.5 + 3 + 2 + 3.5 = 15 ÷ 5 = 3.0)_

---

## MUST FIX

| ID | Item | Flagged by |
|---|---|---|
| P4-PC-M1 | "Revoke Access" and "Grant Access" / "Deny" vocabulary is opaque to elderly patients — Shantabai scores 2/5 primarily due to this barrier. The action buttons are the functional core of this screen; vocabulary that prevents confident independent use is blocking. Replace with plain-English equivalents: "Remove Access" (revoke), "Allow" and "Don't Allow" (grant/deny pending). Update info note to match ("Removing access takes effect immediately"). | Shantabai, Sunita |

---

## SHOULD FIX

| ID | Item | Flagged by |
|---|---|---|
| P4-PC-S1 | Section labels "ACTIVE ACCESS" / "PENDING REQUESTS" are in legal/medical register. Replace with "Your Doctors" and "New Requests." | Shantabai, Sunita |
| P4-PC-S2 | No scope explanation on active consent cards — "access" is undefined (all records? clinic-only?). Trust-critical ambiguity. Add one-line note: "Can view all your health records" under each active doctor card. | Arjun, Dr. Nair |
| P4-PC-S3 | "Access since" text at 13px falls below 14px minimum required for a patient screen with elderly primary audience. Increase to 14px. | Shantabai |

---

## NICE TO HAVE

| Item | Flagged by |
|---|---|
| Audit trail or "last accessed" timestamp per doctor (v2 feature) | Dr. Nair |
| Time-limited access option ("Grant for 30 days") | Arjun |

---

## BALANCER VERDICT: Revise and re-evaluate

The structural design is correct — cards, pending/active separation, confirmation on destructive actions — but the vocabulary (Revoke, Grant, Pending, Active Access) is drawn from legal/medical register that the primary audience (Shantabai, elderly patients) cannot work with independently. Since this is a consent management screen where patient comprehension is a first-order requirement, language clarity is not a polish concern. The M1 fix is a terminology change (≤ 10 lines of code), and the three SHOULD FIX items are similarly contained. One Builder revision session will bring this to Ship as-is.
