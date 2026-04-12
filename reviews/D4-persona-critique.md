# Persona Critique — Visit Detail (D4)
_Completed: 2026-04-12_

---

## PERSONA CRITIQUE — Visit Detail (D4)

### DR. RAMAKANT SINHA (Reluctant Doctor)
**Score: 3/5**

**First impression:** Date is big and clear. Chief complaint shows first. Notes read like what he'd write on a pad. Looks manageable.

**Would be confused by:** "Submit Visit" — what does "submit" mean? To whom? Is this like a government form? He'd hesitate over the confirmation dialog. Also "OCR unavailable" and "OCR processing…" are tech terms he has never encountered. Three equal-weight buttons at the bottom — which one is the right one when he's done?

**Would like:** The clinical content order (complaint → notes → scans) mirrors how he thinks. The date is prominent. No excessive menus.

**Change request:** Rename "Submit Visit" to "Finish Visit" or "Close Visit". Mark the finish action differently (e.g. full-width, distinct from the two add-buttons) so it is clear that it is the "I'm done" action, not a third add button. Replace "OCR unavailable" with "Image only — text not extracted." The patient's name is nowhere on this screen — he cannot confirm he is looking at the right patient without scrolling back.

---

### DR. PRIYA NAIR (Tech-Savvy Doctor)
**Score: 3.5/5**

**First impression:** Notices the clean section structure immediately. Appreciates that notes come before scans. OCR preview text in scan cards is a genuinely useful time-saver.

**Would be confused by:** No edit or delete on an open visit. If she adds a note with a typo there is no way to correct it from this screen. After a visit is submitted there is no addendum path — a submitted visit is completely frozen.

**Would like:** The inline note input sliding up in-context is good. View Scan link for each scan is the right pattern. Consent gate in the no-consent variant is correctly visible.

**Change request:** Add a delete/edit affordance (long-press or swipe) for notes and scans while the visit is open. Add an "Append note" or "Addendum" path for submitted visits — once locked, clinical information may still need a correction (medication change, follow-up note). OCR retry button on a failed scan. "View Scan →" should clarify it navigates to a full image view — a doctor may not realise it is a link.

---

### SUNITA (Balancer / Staff)
**Score: 3/5**

**First impression:** Scans the screen top-to-bottom. Meta card with doctor + clinic is clear. Status badge is immediately readable.

**Would be confused by:** In the no-consent variant, the note text ("ECG and Echo findings available in scan records") and the scan OCR preview ("ECG: Normal sinus rhythm. QTc 412ms.") are fully visible even though consent is denied. The consent banner only says "some clinical content is hidden" — but from her perspective this reads as inconsistent: the chief complaint is blocked but the ECG findings in the note are not. A patient might ask why the doctor can read those details without their permission. She would not know how to explain the distinction.

**Would like:** A patient name at the top. Right now the screen shows who the doctor is but not who the patient is — if she opens the wrong visit she has no quick way to confirm the patient. A "Share summary" option for submitted visits — patients sometimes ask for a printout.

**Change request:** Show the patient name (first name + initial) in the meta card. Clarify the consent gate scope — either gate notes and scans too when consent is denied, or add a visible note explaining what IS accessible without consent.

---

### SHANTABAI (Elderly Patient)
**Score: 3.5/5**

_Note: Shantabai will not use this screen herself — this is a doctor-facing view. Evaluation is from a passive trust/privacy perspective: would she feel comfortable knowing this screen exists?_

**First impression:** Watching the doctor use this, she would see her visit date, the doctor's name, her chief complaint, and the prescription note. The large date (22pt) and readable note text (15pt, line-height 22) would reassure her that the doctor is looking at something real and organised.

**Would be confused by:** The amber consent banner in the no-consent variant might alarm her if she catches a glimpse — "Patient consent not granted" sounds like something went wrong.

**Would like:** Reassurance that her records are organised and not visible to everyone. The consent gate (even if partial) gives her some comfort.

**Change request:** Consent banner wording should be patient-neutral — the current text "Patient consent not granted" could confuse a patient who glimpses it. Consider "Limited access — patient has not authorised this view."

---

### ARJUN (Semi-Savvy Patient)
**Score: 3/5**

**First impression:** Would understand the concept of visit records and scan images. Approves of the consent gate visible in the no-consent variant.

**Would be confused by:** In the no-consent variant, a note saying "ECG and Echo findings available in scan records" is visible without his consent. He would consider this a privacy violation — he did not consent to the doctor reading his test results, but the note referencing them is still visible. The consent gate applies only to chief_complaint by spec, but a note written by another doctor may contain equally sensitive information. The boundary is not where Arjun intuitively expects it to be.

**Would like:** All content from another doctor's visit to be hidden until consent is granted — not just the chief complaint. A clear indication of what will be visible to the new doctor before he grants access.

**Change request:** Either (a) gate notes and scan OCR too when consent_granted=false, or (b) surface a clear explanation that notes/scans are always visible and only chief complaint requires consent — so Arjun knows what he is consenting to before he agrees.

---

## Summary

```
─────────────────────────────
WEIGHTED AVERAGE: 3.5/5

Criteria breakdown (rubric weights applied):
  Speed to complete task     (30%) — 4.0/5  → notes in 1 tap, submit in 1 tap + dialog
  Visual clarity / no clutter (25%) — 3.5/5  → clean, but three equal-weight bottom buttons
  Familiarity (feels like paper) (20%) — 4.0/5  → complaint → notes → scans mirrors chart order
  Feature richness            (10%) — 2.0/5  → no edit, no delete, no addendum, no print
  Discoverability             (15%) — 3.0/5  → add buttons clear; "Submit" is ambiguous

Weighted: (4.0×0.30) + (3.5×0.25) + (4.0×0.20) + (2.0×0.10) + (3.0×0.15) = 3.53/5
```

---

## MUST FIX

- **Consent gate incomplete:** when `consent_granted=false`, notes text and scan OCR previews are visible — only `chief_complaint` is gated. Notes written by another doctor may contain sensitive clinical findings. Either (a) extend the gate to cover notes and scan OCR when consent is denied, or (b) clarify the spec explicitly and surface the scope of the gate to the patient before consent is requested. Spec gap must be resolved before live build. — _flagged by Arjun, Sunita._

- **"Submit Visit" label:** "submit" is tech jargon unfamiliar to reluctant users. Rename to "Finish Visit" or "Close Visit." — _flagged by Dr. Sinha._

---

## SHOULD FIX

- **Patient name absent from screen:** The meta card shows the doctor's name and clinic but not the patient's name. A doctor or staff viewing this screen cannot confirm they are looking at the correct patient without navigating back. Add patient full name (or first name + family initial) to the meta card. — _flagged by Dr. Sinha, Sunita._

- **Three equal-weight bottom buttons:** "+ Scan", "+ Note", and "Finish Visit" share the same size, height, and visual prominence. The finish action is irreversible — it should be visually distinct from the two additive actions (full-width second row, or stronger visual treatment) so it cannot be accidentally tapped instead of adding a record. — _flagged by Dr. Sinha, Dr. Nair._

- **No note edit/delete while visit is open:** A typo in a note has no correction path before submission. Add long-press or a small edit/delete affordance on open-visit note cards. — _flagged by Dr. Nair, Sunita._

---

## NICE TO HAVE

- Addendum capability for submitted visits — append-only notes after lock. — _flagged by Dr. Nair._
- OCR retry affordance on a failed scan. — _flagged by Dr. Nair._
- Print / share summary for submitted visits. — _flagged by Sunita._
- Consent banner wording: "Patient consent not granted" → "Limited access — patient has not authorised this view" (patient-neutral). — _flagged by Shantabai._

---

## BALANCER VERDICT: Revise and re-evaluate

**Rationale:** The mockup is structurally sound — content order is correct, consent gate renders visually, and the inline note input flow is good. However two issues require resolution before proceeding to the data-wiring step: the consent gate scope (notes and scan OCR are visible without consent — the spec must explicitly declare whether this is intentional, and if so the patient must understand the scope before granting consent); and the "Submit Visit" / bottom bar layout (equal-weight destructive action creates accidental-submit risk and is unfamiliar to low-tech users). Fix these two MUST FIX items, then re-evaluate. The SHOULD FIX items (patient name in header, edit/delete for open notes) should also be applied — both address real operational friction the Builder can resolve in under 30 minutes.
