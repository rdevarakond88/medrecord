# Persona Critique — My Records Timeline (P2)
_Date: 2026-05-16 | Agent: Persona Critic_

---

## DR. RAMAKANT SINHA (Reluctant Doctor)
**Score: 3/5**
**First impression:** "This looks organised. Visits grouped by year — that's sensible. I can see who the doctor was and what the visit was for. My patients might actually use this."
**Would be confused by:** "By Doctor" and "By Clinic" filters — what do they do exactly? He'd tap one and see… no change. Also the small "▼" chevron — he'd need a moment to realise the card is expandable.
**Would like:** Year grouping feels natural, like a paper folder. Doctor's name is prominent — his patients recognise their doctors' names. The visit summary (chief complaint) gives him quick context.
**Change request:** "What does 'By Doctor' do? If I have three doctors, will it show me only one doctor's visits? Make that clearer. And how does a patient know they can tap on a card?"

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)
**Score: 3/5**
**First impression:** "Clean layout. Good information hierarchy — date, doctor, clinic, summary. The expand-in-place pattern is a solid choice for a timeline."
**Would be confused by:** Filters ("All / By Doctor / By Clinic") are visible but do nothing in either demo state. A patient or doctor tapping "By Doctor" expecting grouped or filtered results gets no feedback. "IMG" in scan placeholders reads as a broken state, not a designed placeholder.
**Would like:** Record count pill is a nice detail. The OCR preview text in expanded view is genuinely useful — saves a full-screen navigation to quickly assess a document.
**Change request:** "Make the filters actually demo what they do — even a static second demo state. And there's no search. If I've had 20 visits across 5 years, how does a patient find the one with their diabetes test results?"

---

## SUNITA (Balancer / Staff)
**Score: 3.5/5**
**First impression:** "Clear. Visits in a list, newest first, grouped by year. I'd be comfortable helping a patient navigate this."
**Would be confused by:** Patients — especially older ones — will ask her "where are my documents?" She'll say "tap the card," they'll look at the tiny ▼ and not be sure what to do. The expand mechanic isn't communicated anywhere on the collapsed card except that chevron.
**Would like:** Empty state message is clear and non-alarming — a first-time patient won't be scared. "No records yet" + explanation is the right tone.
**Change request:** "Put 'Tap to view records' or 'View →' somewhere on the card. Something I can point to and say 'press that.' Also 'IMG' looks like a broken image — use a camera icon. Patients will ask me if something is wrong."

---

## SHANTABAI KADAM (Elderly Patient)
**Score: 2.5/5**
**First impression:** "My Health Records. I can understand that. I see my doctors' names — Dr. Anand, Dr. Meenakshi. Good. The dates are how I write them. That is comfortable."
**Would be confused by:**
1. The "▼" is very small (11px, greyed out) — she won't notice it and won't know the card opens. She sees a list of visits but cannot access the actual documents without accidentally tapping a card.
2. "IMG" in the scan box — is something broken? Is her prescription missing?
3. The filter bar — "By Doctor," "By Clinic" means nothing to her without context.
4. "1 scan, 1 note" — what is a "scan"? Is that her X-ray? What is a "note"?
5. The visit summary is in italic, which is harder to read.
**Would like:** The card is large and has a generous tap target — she will tap the card by accident if nothing else, which will work. The list of doctor names is reassuring.
**Change request:** "I need to know that I can press the card to see my papers. The arrow is too small. And 'IMG' and 'scan' and 'note' — what do these words mean? Use simpler words."

---

## ARJUN (Semi-Savvy Patient)
**Score: 3.5/5**
**First impression:** "Good. Visits by year, doctor's name, quick summary. The filter bar is familiar — like in an e-commerce app. Clean."
**Would be confused by:** Tapping "By Doctor" or "By Clinic" does nothing — he'd assume the app is broken or the feature isn't done. "IMG" placeholder looks like a failed image load.
**Would like:** The expand-in-place mechanic — he doesn't need to navigate away to see the content. OCR preview of the prescription text is very useful for quickly checking what was prescribed. The record count pill ("1 scan, 1 note") is informative.
**Change request:** "Make the filters work, even in the mockup — show a different view. And let me tap the record row to open the full document. Expanding in-place is fine for a preview, but I want to be able to zoom in on my X-ray report."

---

## WEIGHTED AVERAGE: 3.0/5

Criterion breakdown:

| Criterion | Weight | Score | Weighted |
|---|---|---|---|
| Speed to complete task | 30% | 3.0 | 0.90 |
| Visual clarity / no clutter | 25% | 3.5 | 0.875 |
| Familiarity (feels like paper) | 20% | 3.0 | 0.60 |
| Feature richness | 10% | 2.5 | 0.25 |
| Discoverability of features | 15% | 2.5 | 0.375 |
| **Total** | | | **3.0/5** |

_Screen inventory threshold: ≥ 3.5 to proceed without revision. Current score: 3.0 — below threshold._

---

## MUST FIX

- **P2-PC-M1** — Expand affordance is insufficient for elderly patients: the card's tappability depends entirely on a greyed-out 11px "▼" chevron. The core value of this screen — seeing the actual records — is invisible to Shantabai. Add an explicit "View records →" text link or a more prominent tap cue below the record count pill. The screen inventory explicitly calls out "Elderly-friendly design is critical here." — _flagged by Shantabai (2.5/5), confirmed by Sunita and Dr. Sinha._

## SHOULD FIX

- **P2-PC-S1** — Replace "IMG" text with a camera/document icon shape in the scan thumbnail placeholder — "IMG" reads as a broken image state, not a designed placeholder. Damages trust for all users. — _flagged by Shantabai, Sunita, Arjun, Dr. Nair._
- **P2-PC-S2** — Replace "scan" → "Document", "note" → "Doctor's note" throughout — patients do not use clinical app jargon. — _flagged by Shantabai._
- **P2-PC-S3** — Filter chips should demonstrate their behavior in at least one demo state — even a static "By Doctor" view grouping the same 4 visits under two doctor headings would make the intent clear. Currently both demo states show filters as non-functional. — _flagged by Dr. Nair, Arjun._
- **P2-PC-S4** — Visit summary in italic — italic reduces readability for older users and low-vision users. Switch to regular weight, perhaps a slightly dimmed colour. — _flagged by Shantabai._

## NICE TO HAVE

- Search / find a record by symptom, doctor, or medication — out of scope for mockup but a clear v2 feature gap. — _Dr. Nair, Arjun._
- Tap a record row to open the full-screen view (P3: Visit Record Detail) — architecturally correct (P3 is next), but the tap affordance on the record row should be confirmed in the wire step. — _Arjun._

---

## BALANCER VERDICT: Revise and re-evaluate

**Rationale:** The screen's core job — giving a patient access to their health records — depends on an expand interaction that is invisible to the most vulnerable user group (elderly patients), and the screen inventory explicitly mandates elderly-friendly design as critical for P2. One MUST FIX (expand affordance) and four SHOULD FIX items exist. The fixes are lightweight (add a text cue, swap terminology, swap an icon, add one demo filter state) — no redesign needed. Apply MUST FIX + SHOULD FIX and re-run the critique.
