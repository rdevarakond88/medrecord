PERSONA CRITIQUE — Patient Detail / History (D3)
Generated: 2026-02-23
Evaluator: agent-persona-critic.md
Source: mockups/D3PatientDetailScreen.tsx

---

DR. RAMAKANT SINHA (Reluctant Doctor)
Score: 3.5/5
First impression: "I tap on Priya Venkataraman from the search list and her record opens immediately — name, age, and dates. There's a big blue button to start a new visit. That's what I came here for. The list of dates below looks like my paper file, newest at the top. Good."
Would be confused by: The amber 'Pending Consent' state — he sees the patient's name and age but a locked history below. "Why is this blocked? She's my patient standing right in front of me." He will not understand that consent is a digital, per-patient access grant. He also will not discover the inline expand on visit cards — there is no chevron, no hint text, nothing indicating a card is tappable. He will tap 'Request Access' without knowing whether it makes a call, sends an SMS, or opens another screen.
Would like: 'New Visit' is exactly where he expects it — first thing after the header, full width, unmissable. Visit list reads like a ledger: date, complaint, clinic. He can skim it in two seconds. Age is shown directly. Offline banner is reassuring, not alarming.
Change request: "Tell me what 'Request Access' actually does before I tap it. And there's no arrow or anything on the visit rows — I didn't know I could tap them. Add a small arrow or write 'tap to expand' somewhere."

---

DR. PRIYA NAIR (Tech-Savvy Doctor)
Score: 3/5
First impression: "Clean layout. Three states are the right design decision — consent granted / pending / empty. I can see the inline expand, which is smart. But I'm already looking for a filter on the visit list... and it's not there. For a patient I've seen 30 times, I'd be scrolling forever."
Would be confused by: No filter or search on the visit list — for high-volume practices, scrolling an unfiltered list is unacceptable. The '3 records' pill is opaque — are these prescriptions? Scans? Lab reports? She wants this breakdown before deciding whether to expand a card. The inline preview shows raw free-text vitals with no structure — she expects medications and diagnosis to be parsed, not just concatenated. 'View Full Visit' is a stub with no navigation target yet (acceptable for a mockup, but she notes it).
Would like: The three-state consent model is logically correct and well-implemented. Mobile masking to last 5 digits shows the right data-minimisation thinking. 'New Visit' accessible even without consent is the right call — she can build a new record and not be blocked by a historical consent gap. Newest-first ordering is correct.
Change request: "I need at minimum a date-range filter on the visit list. The record count pill should break down record types on tap (e.g., '2 scans, 1 note'). Add a share icon in the header — even a stub with 'Coming in v2' acknowledges the need. Consider a 'Last prescribed' summary line in the patient header for quick reference before a consultation."

---

SUNITA (Balancer / Staff)
Score: 3.5/5
First impression: "I open this before the doctor walks in to check the patient is correct and their history is ready. Patient name, a badge, and a list of visits — I can brief the doctor in five seconds. But that amber 'Pending Consent' badge: do I tap 'Request Access' right now? What happens? Does it send the patient a message immediately? I don't want to do that by accident while they're still sitting in the waiting room."
Would be confused by: 'Request Access' has no confirmation dialog and no explanation of its consequence. She will not tap it without knowing if it fires an SMS to the patient's mobile. No patient profile edit affordance — if a mobile number was entered incorrectly during registration, there is no way to correct it from this screen. The grayed history state leaves her with no script to explain to the patient why records are hidden. 'New Visit' has no confirmation step — easy to open for the wrong patient during a busy intake queue.
Would like: The offline banner immediately tells her if data is stale — she can warn the doctor before he comes in. Visit list gives her a fast verbal briefing: "last visit 5 days ago, cough." Empty state is clear — new patient, zero confusion. Consent gate box visually separates the access problem from the new visit action.
Change request: "'Request Access' must show a confirmation dialog: 'This will send an SMS to the patient's registered mobile (•••••84627). Proceed?' I need to know what I'm triggering. Add an edit icon on the patient header — number corrections happen every week. And give me the last visit date in the header card itself, not just in the list, so I can brief the doctor at a glance."

---

SHANTABAI (Elderly Patient)
Score: 4/5
Note: D3 is doctor-facing. Shantabai does not operate this screen but is physically present in the clinic while it is open.
First impression: She glances at the doctor's phone while sitting across the desk. She sees her name in large text and a list of dates she vaguely recognises as past visits. The screen looks like an organised record. It is not confusing to look at passively.
Would be confused by: The amber 'Pending Consent' badge, if she notices it, would cause quiet anxiety — "Did I do something wrong? Why is it pending?" The grayed history state might make her think the app is broken. She would not say anything, but she would worry.
Would like: Text is large and readable (22pt patient name). Visit dates are in DD/MM/YYYY format — she recognises this format. The screen does not ask her to do anything.
Privacy concern: Her full name is displayed in large, bold text at the top of the screen with no option to minimise or dim it. In a clinic with a shared waiting area or an open desk, this is visible to other patients at a distance. This echoes D2's mobile number exposure issue — resolved for numbers, but the patient name is now the highest-exposure PII on screen.

---

ARJUN (Semi-Savvy Patient)
Score: 3.5/5
Note: D3 is doctor-facing. Arjun evaluates from the perspective of what happens to his data.
First impression: He briefly sees the doctor's screen — his name and a masked mobile ending in his last five digits. He notices the masking and immediately approves. He can see his visit history: dates, complaints, clinics. That is exactly the context he wanted his doctor to have without him having to explain it verbally.
Would be confused by: The 'Pending Consent' state — he thought he granted consent when he registered. He does not understand why it is still pending (this is a D9/onboarding design problem, not a D3 flaw). The consent model is invisible from his side — he has no way to know the scope of what 'Access Granted' actually shares.
Would like: Mobile masked to last 5 digits — reassuring for a privacy-conscious user. His full visit history visible to the doctor — that is the entire value proposition for him. The screen looks professional and organised; it makes him feel the clinic is competent.
Privacy concern: Full patient name displayed prominently is visible to adjacent patients — same concern as Shantabai.

---

─────────────────────────────
WEIGHTED AVERAGE: 3.5/5

Rubric: Speed 30%, Visual Clarity 25%, Familiarity 20%, Feature Richness 10%, Discoverability 15%.
Per-criterion scores (averaged across 5 personas):

| Criterion              | Weight | Score | Weighted |
|------------------------|--------|-------|----------|
| Speed to complete task |   30%  |  4.0  |   1.20   |
| Visual clarity         |   25%  |  4.2  |   1.05   |
| Familiarity            |   20%  |  3.2  |   0.64   |
| Feature richness       |   10%  |  2.6  |   0.26   |
| Discoverability        |   15%  |  2.6  |   0.39   |
| **Total**              |        |       | **3.54** |

Threshold for proceeding without revision: 3.5. Result: marginally above threshold; proceed with targeted revisions before live build.

---

MUST FIX:
- 'Request Access' button fires with no confirmation and no explanation of consequence — staff or doctor could accidentally trigger an SMS to the patient's registered mobile without intent. This damages clinical trust if it fires during intake for the wrong patient, or before the patient is aware. A confirmation dialog is required before this can ship. Flagged by Sunita.

SHOULD FIX:
- Visit cards have no expand affordance — no chevron, no 'tap to expand' hint, no pressed state indicator. The inline preview is a core feature of this screen and it is entirely hidden from discovery for non-tech-savvy doctors. Flagged by Dr. Sinha; discoverability criterion score: 2.6. Add a trailing chevron (›) or a faint 'Tap to preview' micro-label on each card.
- Patient full name displayed at 22pt bold with no PII dimming option — visible to other patients in shared clinic spaces. The D2 debt item resolved mobile number masking in the list view; the same principle now applies to patient name on D3. Consider a screen-lock or auto-dim gesture, or at minimum flag this as a known privacy exposure. Flagged by Shantabai and Arjun.
- No patient profile edit affordance on the header card — staff cannot correct an incorrectly entered mobile number from this screen. An edit icon (stub navigation is acceptable) should be present in the header before the live build. Flagged by Sunita.

NICE TO HAVE:
- Visit list filter by date range or keyword — critical for high-volume practices (30+ patient visits per patient history). Flagged by Dr. Nair. Conflicts with Dr. Sinha's simplicity preference; defer to v2 or implement as a collapsible filter row.
- Record type breakdown in 'N records' pill — expand on tap to show e.g. '2 scans, 1 note'. Flagged by Dr. Nair.
- 'Last prescribed medication' quick-view line in the patient header — lets the doctor see the most recent Rx at a glance before scrolling the visit list. Flagged implicitly by Dr. Sinha.
- Share / export affordance (stub) in the header — acknowledges Dr. Nair's expectation without shipping the feature in v1.

---

BALANCER VERDICT: Revise and re-evaluate
RATIONALE: D3 scores 3.54/5 — marginally above threshold — and the overall structure is solid: the three-state consent model is correct, the 'New Visit' primary action is well-placed, PII masking is applied, and the offline banner is unobtrusive. However, two targeted revisions are required before the live build begins: 'Request Access' needs a confirmation dialog (operational safety, flagged by Sunita), and visit cards need an expand affordance (discoverability failure, flagged by Dr. Sinha). Both are contained, low-effort changes that should not delay the live screen session. Patient name PII visibility in shared spaces should be logged as a SHOULD FIX debt item and carried into the D3 live build session.
