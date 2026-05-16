# Persona Critique — Doctors Who Have Access (P4) — v2 Re-evaluation

**Date:** 2026-05-16
**Mockup file:** `src/screens/patient/PatientDoctorsAccessScreen.tsx`
**Revisions applied:** P4-PC-M1, P4-PC-S1, P4-PC-S2, P4-PC-S3
**Verdict:** Ship as-is

---

## DR. RAMAKANT SINHA (Reluctant Doctor)

**Score: 3.5/5** (↑ from 3.0)

**First impression:** "OK — this is what the patient sees. 'Remove Access' — I can tell a patient to press this if they want to stop sharing. That makes sense."

**Would be confused by:** Nothing new. He still wonders whether a patient who removes access triggers any notification to him — but that is an operational question, not a UX failure.

**Would like:** The confirmation alert — title "Remove Access?", message explaining the doctor "will no longer be able to view your records." Clear enough that a patient could act alone. "Allow" / "Don't Allow" on pending cards are natural two-option choices he recognises from everyday phone prompts.

**Change request:** None — residual "do I get notified?" is a backend feature concern, not this screen's responsibility.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)

**Score: 4.0/5** (↑ from 3.5)

**First impression:** "Good. 'Your Doctors' / 'New Requests' — clean labels. Scope note per card answers the question I had in v1."

**Would be confused by:** Nothing blocking. Would still like a "last accessed" timestamp (v2 concern, noted in v1 as NICE TO HAVE — unchanged).

**Would like:** "Can view all your health records" under each active card is exactly the transparency she requested. The Allow / Don't Allow split button is consistent with standard consent patterns she has seen in health apps.

**Change request:** None for this version.

---

## SUNITA (Balancer / Staff)

**Score: 4.0/5** (↑ from 3.0)

**First impression:** "Oh — 'Your Doctors' and 'New Requests.' I can explain this in one sentence to a patient now. 'Remove Access' is the button to press if they want to stop a doctor seeing their records."

**Would be confused by:** The "Pending" badge on new request cards — mild jargon she will still translate to "waiting for your decision," but it sits inside the "New Requests" section so context helps. Not a blocker.

**Would like:** The streamlined explanation path. The info note "You control who can see your records. Removing access takes effect immediately." is patient-facing copy she can point at.

**Change request:** Minor — the scopeNote "Can view all your health records" sits at 13px. For elderly patients she hands the phone to, that is at the edge of comfortable readability. 14px would match accessSince.

---

## SHANTABAI KADAM (Elderly Patient)

**Score: 3.5/5** (↑ from 2.0)

**First impression:** Sees "Your Doctors" — she understands immediately. "Ah, the doctors who can see my papers." Dr. Anand Krishnamurthy's name is big and bold. She feels oriented.

**Would be confused by:** The red-bordered "Remove Access" button still uses an abstraction ("access") she does not naturally use — but the confirmation dialog "Dr. X will no longer be able to view your records" resolves this once she taps. With grandchild help for first use, she can manage independently thereafter. The "Pending" badge on the new request card may still need a brief explanation.

**Would like:** "Allow" and "Don't Allow" — these are words she uses every day. "New Requests" is clear. Doctor names at 17px bold are easy to read. "Access since" at 14px is now comfortable.

**Change request:** The scopeNote "Can view all your health records" at 13px is at the boundary of comfortable reading. 14px would be consistent with the accessSince fix. Not a blocker, but worth closing before wire.

---

## ARJUN MEHTA (Semi-Savvy Patient)

**Score: 4.0/5** (↑ from 3.5)

**First impression:** "Straightforward — like a permissions panel. 'Your Doctors', 'New Requests.' Scope note tells me exactly what each doctor can see. Privacy question answered."

**Would be confused by:** Nothing blocking. Curious whether future versions will show which records a doctor has actually viewed, but understands that is v2.

**Would like:** The DPDP info note reads crisply — "You control who can see your records. Removing access takes effect immediately." That is the reassurance he needs. "Allow" / "Don't Allow" pattern matches banking app consent flows he knows.

**Change request:** None.

---

## WEIGHTED AVERAGE: 3.8 / 5

_(3.5 + 4.0 + 4.0 + 3.5 + 4.0 = 19.0 ÷ 5)_

---

## MUST FIX

None — all v1 MUST FIX items closed.

---

## SHOULD FIX

| ID | Item | Flagged by |
|---|---|---|
| P4-PC-v2-S1 | `scopeNote` ("Can view all your health records") renders at 13px. For a patient screen with elderly primary audience, body informational text should match the 14px minimum established in P4-PC-S3. One-line fix: `scopeNote` `fontSize` 13 → 14. | Shantabai, Sunita |

---

## NICE TO HAVE

| Item | Flagged by |
|---|---|
| Audit trail / "last accessed" timestamp per doctor card (v2) | Dr. Nair |
| Time-limited access ("Grant for 30 days") | Arjun |

---

## BALANCER VERDICT: Ship as-is

All four v1 findings are closed: vocabulary is now plain English, section labels are comprehensible, scope is explained per card, and accessSince font meets the 14px minimum. Shantabai's score recovers from 2/5 to 3.5/5 — she can now navigate the screen with one-time guidance rather than continuous help. The one residual SHOULD FIX (scopeNote at 13px) is a single-property change that does not block the wire step; apply before the wire session alongside the P1-PC open items.
