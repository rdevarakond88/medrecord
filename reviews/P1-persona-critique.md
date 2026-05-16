# Persona Critique — Patient Login / OTP Screen (P1)
_Date: 2026-05-16 | Critic: Persona Critic Agent | Builder session: commit 8153969_

---

## DR. RAMAKANT SINHA (Reluctant Doctor)
**Score: 4/5**

**First impression:** "This looks like my bank's login. I know exactly what to do."

**Would be confused by:** Nothing in the flow itself. He might briefly wonder whether he needs a separate app for patients or whether this is part of his own app.

**Would like:** Standard OTP pattern he has used in banking apps — no new habits required. The +91 prefix is clearly separated so he won't accidentally type it.

**Change request:** No critical changes. Mild note: when helping a patient log in, he'd appreciate the loading text distinguishing "Sending OTP…" from "Verifying…" — it tells him what the app is doing so he's not staring at a spinner unsure if he tapped.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)
**Score: 4/5**

**First impression:** Clean and competent. Looks like a proper auth screen, not a prototype.

**Would be confused by:** Does the patient remain logged in across sessions, or do they have to OTP every single visit? The mockup doesn't hint at session persistence. That's a wire-step concern, but it's the first question she'd ask.

**Would like:** Well-structured error states — wrong OTP, expired OTP, too many attempts, no connection all handled distinctly. Auto-submit on 6th digit is a nice touch.

**Change request:** Session persistence or biometric unlock for returning patients (defer to wire step). Minor: loading text should differ by phase (sending vs verifying).

---

## SUNITA (Balancer / Staff)
**Score: 3/5**

**First impression:** "I've shown patients how to do this in WhatsApp — same idea."

**Would be confused by:** What does she tell a patient who left their phone at home? The screen has no fallback message or alternative path shown. Also: no value-proposition line — when a confused patient asks "what is this app?", "For Patients" doesn't answer the question.

**Would like:** The OTP-sent banner showing the formatted number (+91 88845 56234) confirms which number received the code — useful when she's watching a patient type.

**Change request:**
1. Add a one-liner below "For Patients" — e.g., "Access your medical records" — so she can point to the screen when explaining the app.
2. Show a small help note under the OTP field for no-phone scenarios (can be deferred to wire step, but should be planned now).

---

## SHANTABAI (Elderly Patient)
**Score: 3/5**

_Note: Per PM review (2026-05-16), Shantabai's family member (25–40 yo) is the primary navigator of this screen — her direct concerns are partially mitigated by proxy use._

**First impression:** Blue "MedRecord" text and "For Patients" — she may recognise the name if the doctor mentioned it. Phone number field is large (18px, plenty of space).

**Would be confused by:**
- The OTP placeholder "• • • • • •" could look like something she needs to press (dots suggest interactive elements on older Android UIs).
- No contextual hint like "Check your SMS inbox" is present after the phone phase.
- "Change number" is 13px in textSecondary colour — very small tap target. She might miss it if she entered the wrong number.

**Would like:** Large OTP input box (30px font ✅), clear Verify button, single large action per phase.

**Change request:**
1. Increase "Change number" to minimum 14px; ensure 44×44px tap target (WCAG AA).
2. Add hint text under OTP input: "Check your SMS inbox for a 6-digit code."

---

## ARJUN (Semi-Savvy Patient)
**Score: 4.5/5**

**First impression:** "Oh, this is just like PhonePe or Ola — I know this."

**Would be confused by:** Nothing in the core flow. The 45-second countdown before resend matches what he expects from banking apps.

**Would like:** Auto-submit on 6th digit — exactly the UX he expects. Error states (wrong OTP, expired, too many attempts) are clearly distinguished.

**Change request:**
- After auto-submit, show "Verifying…" loading text (vs generic "Please wait…") so he isn't wondering if the tap registered.
- Would appreciate a language toggle to Hindi somewhere (deferred V2, understood).

---

## WEIGHTED AVERAGE: 4.0/5

| Criterion | Weight | Score | Weighted |
|---|---|---|---|
| Speed to complete task | 30% | 4.5 | 1.35 |
| Visual clarity / no clutter | 25% | 4.0 | 1.00 |
| Familiarity | 20% | 4.0 | 0.80 |
| Feature richness | 10% | 3.0 | 0.30 |
| Discoverability | 15% | 3.5 | 0.525 |
| **Total** | | | **4.0/5** |

---

## MUST FIX
_None. No persona scores ≤ 2; weighted average 4.0 > 3.0 threshold._

## SHOULD FIX

| ID | Severity | Item |
|---|---|---|
| P1-PC-S1 | SHOULD FIX | Add one-line value proposition below "For Patients" subtitle — e.g., "Access your medical records" — so first-time patients understand the app before logging in. Flagged by: Sunita, Shantabai. |
| P1-PC-S2 | SHOULD FIX | "Change number" link too small (13px, textSecondary, no minimum tap area). Increase to 14px minimum; ensure 44×44px tap target per WCAG AA. Flagged by: Shantabai, Sunita. |
| P1-PC-S3 | SHOULD FIX | Loading text is generic "Please wait…" for both send and verify phases. Differentiate: "Sending OTP…" / "Verifying…" to reduce spinner anxiety. Flagged by: Dr. Sinha, Dr. Nair, Arjun. |

## NICE TO HAVE
- Language toggle (Hindi / Marathi / Tamil) — Arjun, Shantabai (defer to V2)
- Session persistence / biometric unlock for returning patients — Dr. Nair (wire-step decision)
- OTP placeholder "_ _ _ _ _ _" over "• • • • • •" — Shantabai

---

## BALANCER VERDICT: Ship as-is (apply SHOULD FIX items before wire step)

P1 is a Tier 4 screen sharing the same proven OTP pattern as D1, and scores 4.0/5 — well above the 3.5 threshold. No persona finds the core flow confusing. The three SHOULD FIX items are one-line changes (tagline, "Change number" sizing, loading text) that can be applied by the Builder at wire step without requiring a separate Persona Critic re-evaluation cycle. No redesign needed.
