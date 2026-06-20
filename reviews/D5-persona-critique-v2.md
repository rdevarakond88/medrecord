# PERSONA CRITIQUE — New Patient Form (D5)

**Reviewed by:** Persona Critic Panel
**Session date:** 2026-06-20
**Screen:** D5 — New Patient Form (static mockup)
**Version:** v2

---

## DR. RAMAKANT SINHA (Reluctant Doctor)
Score: 3/5
First impression: Only four fields. Finally, something I don't need to study. The mobile is already filled in — good, one less thing to type.
Would be confused by: The date-of-birth date picker. On paper I write "12/04/1953" without thinking — here I have to scroll a wheel. And "Save & Begin Visit" — does saving mean the patient file is created, and it also opens a consultation? That's two things happening at once. On paper those are separate steps I control.
Would like: The brevity is correct. That it works offline — that's the first question I have for any software. That the fields I care about (name, date of birth) are visible and nothing is hidden.
Change request: Let me type the date, not scroll a picker. Explain what "Save & Begin Visit" does in plain terms — does pressing it open a new consultation immediately? And if I made a typo in the mobile number on the previous screen, I cannot fix it here. Where do I go?

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)
Score: 3/5
First impression: Clean and intentionally minimal. I appreciate the speed, but I'm immediately tallying what's missing.
Would be confused by: Nothing technically — the UI is straightforward. But there's no audit timestamp visible, no indication of who registered this patient or when. And the amber offline banner tells me I'm offline but not when the pending record will sync or how I'll know it succeeded.
Would like: The single-action registration-to-visit flow is efficient — no extra navigation. Offline-first is the right architecture for this context.
Change request: Blood group and allergies belong at registration, not the patient profile. As a paediatrician, I need to know allergies before the first visit opens — not after. The "additional details later" model creates a dangerous default of omission. Also: add a sync status indicator beyond the amber banner — a "pending sync" count or "last synced" timestamp somewhere visible.

---

## SUNITA (Balancer / Staff)
Score: 2.5/5
First impression: Faster to fill than I expected. But I already see a problem — the mobile number is locked, and I notice I typed it wrong on the previous screen.
Would be confused by: I cannot edit the mobile number on this screen. If I entered "9876543201" instead of "9876543210" and only notice now — after filling in the name and date of birth — I have to go back. But the discard guard fires and I lose everything I entered. That will happen in the morning queue. Also: "Additional details can be added from the patient profile" — where is the patient profile? New staff won't know where to navigate.
Would like: The form is fast enough for a busy front desk. All fields optional is realistic — patients don't always have DOB ready. The offline banner is clear and doesn't alarm me.
Change request: Put an edit icon next to the mobile number that routes back to the search screen while preserving the name and DOB I've already entered. Make the discard guard dialog say exactly what will be lost ("Name and date of birth you entered will not be saved") — not generic language. Add a path or arrow to "patient profile" so new staff can find it.

---

## SHANTABAI (Elderly Patient)
Score: 3.5/5
First impression: (Not the direct user — clinic staff operates this screen. Evaluated on indirect impact.)
Would be confused by: Nothing on the screen — she never sees it. But she sees staff typing about her and may feel anxious without explanation.
Would like: The form is fast, so her wait is short. Four fields means staff isn't asking her for ten pieces of information she may not remember.
Change request: The screen gives staff nothing to say to an anxious elderly patient watching them fill in a form. A one-line patient-facing label or a visible cue staff can read aloud — "We're recording your name, phone number, and date of birth" — would let staff reassure her without improvising.

---

## ARJUN (Semi-Savvy Patient)
Score: 3/5
First impression: (Also not the direct user. Evaluated from the chair across the desk.) Four fields — faster than I expected. But I'd be asking why you need my date of birth.
Would be confused by: No visible indication of where this data goes or how it is protected. If I ask "is this linked to my Aadhaar?" or "will this go to a government database?" — the screen gives staff nothing to point to.
Would like: The fact that only four fields are collected. That there is no Aadhaar prompt. The brevity reads as low-intrusion.
Change request: One-line privacy note visible on the form: "Stored securely on your clinic's account only." Hindi option for name entry. No Aadhaar prompt until the clinic can explain to me exactly why it is needed.

---

## WEIGHTED AVERAGE

| Dimension | Weight | Score | Contribution |
|---|---|---|---|
| Speed to complete task | 30% | 3.5 | 1.05 |
| Visual clarity / no clutter | 25% | 4.0 | 1.00 |
| Familiarity (feels like paper) | 20% | 2.5 | 0.50 |
| Feature richness | 10% | 2.0 | 0.20 |
| Discoverability of features | 15% | 3.0 | 0.45 |

**WEIGHTED AVERAGE: 3.2/5**

---

## MUST FIX
- Non-editable mobile number with no visible correction path — flagged by Dr. Ramakant, Sunita. If a mobile is mis-entered on the search screen, the operator cannot correct it without losing all entered data. A patient record linked to the wrong mobile becomes unsearchable by the patient and unreachable for record-sharing. Clinical data integrity risk — must resolve before any live registration.

## SHOULD FIX
- Date-of-birth date picker is less familiar than typed entry — flagged by Dr. Ramakant. Operators transcribing from a paper ID card or patient recall are slower on a scroll picker than a typed "DD/MM/YYYY" field. At minimum, ensure the picker defaults to the correct decade for adults, not today's date.
- "Save & Begin Visit" merges two distinct clinical acts without explanation — flagged by Dr. Ramakant, Sunita. A one-line inline explanation ("This will register the patient and open a new visit immediately") removes the ambiguity without adding UI weight.
- "Additional details can be added from the patient profile" offers no path — flagged by Sunita. New staff will not know where to go. Add either a tappable link or a visible screen name ("from the Patient Detail screen").
- No staff-facing patient explanation affordance — flagged by Shantabai, Arjun. The screen gives staff nothing to say to an anxious or privacy-conscious patient. A single quiet label ("What we collect: name, mobile, date of birth") is enough.
- No sync feedback beyond amber banner — flagged by Dr. Priya. Offline-created records need a visible "pending sync" indicator somewhere in the flow so staff know registration is not lost.

## NICE TO HAVE
- Blood group and allergies at registration — flagged by Dr. Priya. Valid clinical concern for specialists, but conflicts with the lean design that benefits Dr. Ramakant and reduces Sunita's morning queue time. Right resolution is a collapsible "clinical details" section, not mandatory fields.
- Hindi name entry — flagged by Arjun. Requires localization infrastructure; worth a separate spike but not a blocker for v1.
- Aadhaar integration — deferred to v2 by design. Arjun's consent concern is noted but handled at that milestone.

---

## BALANCER VERDICT: Revise and re-evaluate

RATIONALE: The core design decisions — minimal required fields, offline-first, all-optional data, single-action registration-to-visit — are correct for this clinical context and should not change. One issue must be resolved before any real registration happens: the locked mobile number with no correction path is not a UX preference, it is a data integrity risk that will produce unreachable patient records on the first busy day. The remaining SHOULD FIX items are small enough to address in a single revision pass without structural change; re-evaluate after mobile correction path and action label clarity are in place.
