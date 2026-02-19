# Screen Inventory — Mockup Build Order

## Priority Sequence for Mockup Review

Build and review screens in this order. Each tier should be reviewed and approved before moving to the next.

---

## Tier 1: Core Doctor Flow (Must Review First)

These are the screens a doctor uses in every single visit. If these feel wrong, everything else is irrelevant.

| Screen ID | Name | Why It's Critical |
|---|---|---|
| D2 | Patient Search / Home | First screen after login. Sets the tone for the entire app. |
| D3 | Patient Detail / History | Where doctors spend most of their time. |
| D6 | New Visit | The moment of maximum friction — must feel effortless. |
| D7 | Document Scanner | Core differentiator. Camera UX must be excellent. |

---

## Tier 2: Patient-Facing Flow

| Screen ID | Name | Notes |
|---|---|---|
| P2 | My Records Timeline | Elderly-friendly design is critical here. |
| P3 | Visit Record Detail | Read-only. Should feel clean and reassuring. |
| P4 | Doctors Who Have Access | Consent management. Must be understandable. |

---

## Tier 3: Supporting Doctor Screens

| Screen ID | Name | Notes |
|---|---|---|
| D1 | Login / OTP | Standard but must be fast. |
| D4 | Visit Detail | Viewed after visit submitted. Less time-critical. |
| D5 | New Patient Form | Quick form. Minimal fields. |
| D8 | Full Scan View | Image viewer with OCR text panel. |
| D9 | Consent Request Flow | In-clinic OTP hand-off. Unusual UX pattern. |

---

## Tier 4: Patient Supporting Screens

| Screen ID | Name | Notes |
|---|---|---|
| P1 | Login / OTP (Patient) | Same as D1 with different copy. |
| P5 | Patient Profile | Settings, language, large text mode. |

---

## Mockup Format Instructions (for Claude Code)

When generating mockups:
- Use React Native StyleSheet (not Tailwind — this is React Native, not web)
- Use placeholder data that looks realistic (Indian names, Indian phone numbers)
- Every screen should be self-contained — no navigation required to assess the design
- Show offline state variant for D2, D3, D6 (amber indicator visible)
- Show both "has data" and "empty state" variants for D2, D3, P2
- Use the colour palette from ui-ux-spec.md exactly
- Touch targets must be minimum 48×48px
- All text must pass 4.5:1 contrast check

---

## Mockup Evaluation Rubric

After each screen is built, it will be evaluated by the Persona Critic agent against these criteria:

| Criterion | Weight | Doctor Reluctant | Doctor Tech-Savvy | Patient Elderly | Patient Semi-Savvy |
|---|---|---|---|---|---|
| Speed to complete task | 30% | ⬆️ Critical | Medium | Low | Medium |
| Visual clarity / no clutter | 25% | ⬆️ Critical | Medium | ⬆️ Critical | Medium |
| Familiarity (feels like paper) | 20% | ⬆️ Critical | Low | Medium | Low |
| Feature richness | 10% | Low | ⬆️ Critical | Low | Medium |
| Discoverability of features | 15% | Low | Medium | ⬆️ Critical | ⬆️ Critical |

Scores 1–5 per criterion. Weighted average must be ≥ 3.5 to proceed without revision.
