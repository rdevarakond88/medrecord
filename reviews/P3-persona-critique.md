# Persona Critique — Visit Record Detail (P3)

**Date:** 2026-05-16
**Screen:** P3 — Visit Record Detail (`PatientVisitDetailScreen.tsx`)
**Evaluator:** Persona Critic Panel

---

## DR. RAMAKANT SINHA (Reluctant Doctor)

**Score: 4/5**

**First impression:** "This is what the patient sees? Clean. Date is big. My name is there. That's good — they know whose record it is."

**Would be confused by:** Nothing on this screen — it is not his to operate. He'd note that the patient sees exactly what was recorded: prescription text, doctor's note. Transparent.

**Would like:** The screen stays out of the way. No buttons to press, no forms to fill. The patient can show it to another doctor and the data speaks for itself.

**Change request:** Mild concern about "Something wrong? Let us know →" — if patients start flagging records, someone needs to act on it. Wants to know what happens next. Acceptable as a stub for now.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)

**Score: 3/5**

**First impression:** "Clean, minimal. Date, doctor, clinic — all there. The demo states are thorough — pending OCR, failed OCR, note-only all handled. Good engineering discipline."

**Would be confused by:** Nothing technically broken. But the screen is entirely passive.

**Would like:** The 4 OCR states are well differentiated. The pending message ("usually under a minute") reduces patient anxiety — she appreciated the same pattern in D8.

**Change request:** No sharing mechanism. The entire point of this screen for a patient like Arjun is "show my records to a new doctor." There is no Share button, no way to export the scan, no way to copy the medication list. Even a stub Share button signals intent. The "Something wrong?" stub is honest — acceptable. Sharing is a real gap for v1.

---

## SUNITA (Balancer / Staff)

**Score: 4/5**

**First impression:** "Date, doctor name, clinic — I can immediately tell which visit this is. If a patient brings this to me, I know exactly what they're looking at."

**Would be confused by:** Nothing. The screen is clear enough that she won't need to explain it.

**Would like:** The OCR pending and failed messages ("Text being extracted — usually under a minute," "Ask clinic staff to rescan if text is needed") are patient-friendly. She won't need to answer "why can't I see the text?" calls for these states.

**Change request:** "Something wrong? Let us know →" might route patient complaints to someone she has to handle. Wants to know what the post-tap flow looks like. Acceptable as a stub.

---

## SHANTABAI (Elderly Patient — 71, basic Android, diabetes/hypertension)

**Score: 3.5/5**

**First impression:** "10 May 2026 — big, blue, easy to read. Dr. Anand. My doctor. Good." The date at 22px/700 in blue is immediately visible. Doctor name at 17px/600 is readable. Clinic at 14px secondary is smaller but secondary content — acceptable.

**Would be confused by:** The 160px blue-tinted box with a 📄 emoji and "View full document →" looks like an image that failed to load. She is used to seeing broken-image icons in this style (blue frame, centered placeholder, link text). She may think something went wrong rather than understanding she should tap to see the original scan. The OCR text below it is clear — she CAN get value without tapping — but the box itself is confusing. Also: "RECORDS IN THIS VISIT" (11px) and "DOCUMENT TEXT" (11px) are invisible to her.

**Would like:** The prescription text (15px, line-height 24) is readable. Doctor's Note is in plain language. She can read "Tab. Paracetamol 500mg — twice daily × 5 days" — it looks exactly like her paper prescription. The note text is comforting and concrete.

**Change request:** The thumbnail box should not look like a broken image load. A neutral document-card style (no blue image-frame border, label OUTSIDE the tappable area) would reduce confusion. The 11px labels should be ≥ 12px.

---

## ARJUN (Semi-Savvy Patient — 38, shopowner, Bhopal)

**Score: 3.5/5**

**First impression:** "Clean. Looks like a receipt or document. The date is clear. I can see the prescription text immediately — I don't even need to tap anything. That's good."

**Would be confused by:** The 160px placeholder box above the OCR text. He understands it is a tap target ("View full document →" label is clear enough for him) but wonders why it is styled like an image placeholder rather than a dedicated document button. The 📄 emoji repeated twice (header + thumbnail) is redundant.

**Would like:** The OCR text is the real value — it shows the medication list immediately without tapping. He can hand his phone to a new doctor who can read it directly. The "Something wrong?" footer is a safety net he notices and approves of.

**Change request:** No Share button. His core use case is "show this to a new doctor" — he can hand the phone, but a Share option (WhatsApp link, PDF) would make this genuinely useful. Also wants to know who else can see this record.

---

## WEIGHTED AVERAGE: 3.8/5

Criterion breakdown:

| Criterion | Weight | Score | Weighted |
|---|---|---|---|
| Speed to complete task | 30% | 4.5 | 1.35 |
| Visual clarity / no clutter | 25% | 4.0 | 1.00 |
| Familiarity (feels like paper) | 20% | 3.5 | 0.70 |
| Feature richness | 10% | 2.5 | 0.25 |
| Discoverability of features | 15% | 3.5 | 0.53 |
| **Total** | | | **3.83** |

---

## MUST FIX

None.

---

## SHOULD FIX

| ID | Severity | Item | Flagged by |
|---|---|---|---|
| P3-PC-S1 | SHOULD FIX | Scan thumbnail styled as broken-image placeholder. The 160px blue-tinted box with a generic 📄 emoji matches the visual pattern of a failed image load (colored border, centered icon, link text inside). Replace the image-frame styling with a neutral document-card style: no blue border/background; place "Tap to view original scan" label OUTSIDE the tappable box as hint text beneath it, making the tap target unambiguous. | Shantabai, Arjun |
| P3-PC-S2 | SHOULD FIX | 11px supplementary labels ("RECORDS IN THIS VISIT", "DOCUMENT TEXT") are below readable threshold for elderly users. Increase to 12px minimum. "DOCUMENT TEXT" is important context before the prescription text. | Shantabai |
| P3-PC-S3 | SHOULD FIX | "Something wrong? Let us know →" is 14px textSecondary underlined — looks like fine print / inactive label. Add a small ⚑ icon alongside the text, or increase color to textPrimary at slightly reduced opacity to distinguish it as a real tap target. | Shantabai, Arjun |

---

## NICE TO HAVE

- **Share / export mechanism** — Arjun, Dr. Nair. Primary deferred feature for v2. Even a stub "Share this record" button with an Alert would signal intent to users who arrive expecting this capability.
- **Visit reason/complaint in the visit info card** — helps patients identify visits by symptom rather than date. Deferred to wire step (can be populated from the visit's chief complaint field if the API provides it).

---

## BALANCER VERDICT: Ship as-is

**Rationale:** Weighted score is 3.83/5 — above the 3.5 threshold. No MUST FIX items. The core content (OCR prescription text, doctor's note at 15px/line-height 24) is immediately readable without tapping and matches the paper prescription format patients already recognize. The three SHOULD FIX items address secondary UX polish — thumbnail styling, label sizing, footer affordance — not the primary read path. Apply all three before the wire step. No re-evaluation required. Proceed to Builder: P4 mockup.
