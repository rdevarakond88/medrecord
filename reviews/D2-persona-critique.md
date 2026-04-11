PERSONA CRITIQUE — Patient Search / Home (D2)
Generated: 2026-02-19
Evaluator: agent-persona-critic.md
Source: mockups/D2PatientSearchScreen.tsx

---

DR. RAMAKANT SINHA (Reluctant Doctor)
Score: 3/5
First impression: "This looks clean. I can see Priya Raghunathan right at the top — she came in recently. The number pad is familiar, like dialling a phone. But that button in the corner with the '+' sign... the text below it is so small I can't read it. What does it do?"
Would be confused by: The FAB button — the "New Patient" label is fontSize: 8, essentially invisible on screen. He cannot tell what the button does without guessing. If he types a number that has no match in the system, nothing happens — there is no "no results found" state shown in this mockup, so he would assume the app broke.
Would like: Recent patients visible immediately without any action. Numeric keypad (familiar, no full typing needed). The offline banner is reassuring — "at least it tells me when something is wrong."
Change request: "What do I press to add a new patient? There's a plus sign but the writing underneath is invisible. And what happens if a patient's number isn't in here — how do I know to add them?"

---

DR. PRIYA NAIR (Tech-Savvy Doctor)
Score: 3/5
First impression: "Clean design, fast to understand. Numeric keypad is smart — reduces friction for frequent number entry. Offline handling is well thought out with the amber banner and context card. But I can only search by mobile number? I often remember a patient's name, not their number."
Would be confused by: No name search. She benchmarks against apps she uses daily that support multi-field search. She'd also notice the FAB label is unreadable at fontSize: 8.
Would like: Sync status badges in offline state. The "Not found → Create New" flow in the has-data state. Clean colour palette and layout.
Change request: "The 'New Patient' button label is basically invisible at that font size. Fix that. Also — name search would be a significant improvement, but I understand it may be a deliberate constraint."

---

SUNITA (Balancer / Staff)
Score: 3/5
First impression: "I'll be using this search all day. Let me see if I can find a patient by name... I can't. That's going to be a problem. Some patients don't remember which number they registered under, or they changed their SIM."
Would be confused by: No name search. The clear (✕) button in the search bar is 28×28px — far too small for rapid tapping when a queue of patients is forming. She will misfires on it repeatedly.
Would like: The recent patients list for returning patients. Seeing which patients are local-only vs. synced during offline mode.
Change request: "The 'X' button to clear the search is really small — I'll keep hitting the search bar instead. Fix the touch target. And I need to know what the doctor should do when a patient's number returns zero results — there's no screen for that."

---

SHANTABAI (Elderly Patient)
Score: 2/5
First impression: [Glancing over the doctor's shoulder while waiting] "Is that Priya Raghunathan's phone number? I can read it clearly on the screen. And Ramesh Yadav's name. These are other patients sitting in the same waiting room."
Would be confused by: Everything on this screen is for the doctor, not her. But seeing another patient's full name and complete mobile number visibly displayed would make her uncomfortable and anxious about her own data.
Would like: Nothing — this is not her screen. But she would feel safer if the phone numbers were not fully displayed.
Change request: [To herself] "I hope the doctor is not showing my number like that when I'm not in the room."

---

ARJUN (Semi-Savvy Patient)
Score: 2/5
First impression: "I walked in and the doctor's screen is showing a list of patients — with full names and complete phone numbers. I can read them clearly from where I'm standing. That's someone else's PII. If this is how visible my data is on this screen, I'm not comfortable."
Would be confused by: Why full, unmasked mobile numbers of other patients are plainly visible in the recent list. He uses PhonePe and knows what data exposure risks look like.
Would like: To know his data is protected. He would feel reassured if numbers were partially masked in the list view.
Change request: "That patient list should not show complete phone numbers. Show last 4–5 digits only. The doctor can verify the full number once they tap into the patient's record."

---

─────────────────────────────
WEIGHTED AVERAGE: 3.2/5

Rubric: Speed 30%, Visual Clarity 25%, Familiarity 20%, Feature Richness 10%, Discoverability 15%.
Per-criterion scores (averaged across 5 personas):

| Criterion              | Weight | Score | Weighted |
|------------------------|--------|-------|----------|
| Speed to complete task |   30%  |  3.4  |   1.02   |
| Visual clarity         |   25%  |  3.6  |   0.90   |
| Familiarity            |   20%  |  3.2  |   0.64   |
| Feature richness       |   10%  |  2.8  |   0.28   |
| Discoverability        |   15%  |  2.4  |   0.36   |
| **Total**              |        |       | **3.20** |

Threshold for proceeding without revision: 3.5. Result: below threshold.

---

MUST FIX:
- clearBtn touch target is 28×28px — direct violation of the 48×48px minimum in ui-ux-spec.md. Flagged by Sunita. Staff will routinely mis-tap this during high-volume patient intake.
- fabLabel uses fontSize: 8 — unreadable in practice; FAB is functionally icon-only, violating the spec's "labels always visible" principle. The doctor cannot discover how to create a new patient. Flagged by Dr. Sinha, Dr. Nair, Sunita.
- No "zero results" state — when all 10 digits are typed and no patient is found, the mockup has no design state for this critical path. The has-data state always shows a match; if a number genuinely has no record, the screen leaves the doctor with no clear next action. Flagged by Dr. Sinha.
- Full mobile numbers displayed unmasked in recent patients list — in a shared clinic space, the recent-patients list exposes other patients' complete mobile numbers to bystanders. Partial masking (show last 5 digits only) in list views is required. Flagged by Shantabai (score ≤ 2) and Arjun (score ≤ 2); consistent with the project's data-minimisation principle.

SHOULD FIX:
- No name search capability — flagged by Dr. Nair and Sunita. However, mobile-as-primary-key is a locked project decision (project-state.md). Flag for product discussion rather than mockup fix.
- FAB bottom: 320 is hardcoded — comment in code acknowledges this is "approximated for mockup." Fragile across screen heights; needs proper flex positioning before production.
- No combined "offline + searching" state — the mockup cannot be simultaneously offline and showing search results. A composite state is needed for the full design to be complete.

NICE TO HAVE:
- Show last visit chief complaint in patient row for faster recognition without tapping through — Dr. Nair.
- Summary stats in header ("8 patients seen today") for practice management awareness — Dr. Nair.
- Sort/filter for recent patients beyond default recency order — Dr. Nair, Sunita.

---

BALANCER VERDICT: Revise and re-evaluate
RATIONALE: Two personas score ≤ 2 due to the unmasked mobile numbers privacy issue, and the overall weighted average of 3.20 falls below the 3.5 threshold required to proceed. All four MUST FIX items are contained code-level changes — touch target size, font size, one new screen state, and a masking flag — none of which require structural redesign. The screen's foundation is solid: the keypad UX, offline-first design, and recent-patients list are all well-executed and should score above threshold after the fixes are applied.
