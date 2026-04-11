# Persona Critique — New Patient Form (D5)
_Date: 2026-04-11 | Mockup: `mockups/D5NewPatientForm.tsx` | Step 3 of D5 build_

---

## DR. RAMAKANT SINHA (Reluctant Doctor)
**Score: 4/5**

**First impression:** "Clean. Less than a paper chit. Good."

**Would be confused by:** The "Optional" tags — he may wonder if he's doing something wrong by leaving fields blank, or whether the patient will have problems later. The hint "This number was not found — you are registering a new patient" is two lines in small grey text he may not read. The lock 🔒 emoji beside the number may puzzle him briefly.

**Would like:** The simplicity. Only 4 fields, all optional except mobile. Single button. Offline state auto-saves without asking him to do anything extra — this is exactly the "it just works" behaviour that wins him over.

**Change request:** The submit button label "Create Patient & Start Visit" is developer language. He thinks of it as "Register patient." Consider "Save & Begin Visit" or simply "Start Visit." Also: no confirmation after save — show a brief inline hint so he knows the tap did something and where he'll land next.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)
**Score: 3/5**

**First impression:** Functional but bare-bones. She immediately notices blood group, address, and allergies are absent.

**Would be confused by:** Nothing — this screen is simple enough that confusion is not the issue. Her issue is the absence of features.

**Would like:** At minimum, a "Notes / Chief Complaint" quick-capture field so she can note the reason for visit at registration time. She also wants a clear indication of what data can be added later (via profile edit).

**Change request:** Add an informational note below the form — "Additional details (blood group, allergies, address) can be added from the patient profile." This sets expectations and reduces her sense of incompleteness. Medium-priority: the age derived from DOB is hardcoded as "39 years" in the mockup — must be dynamic in the live build.

---

## SUNITA (Balancer / Staff)
**Score: 3/5**

**First impression:** She recognises this screen — it's the form she'd fill in at the front desk when a new patient walks in. Simple and fast.

**Would be confused by:** What happens if she saves a patient with the wrong name (typo)? There's no edit path shown after save. She'll want to know she can fix it from D3. The back arrow exits the form — she'll worry about whether a half-filled form autosaves or is lost.

**Would like:** A "Discard changes?" confirmation if she taps back with a name already typed. She also wants DOB to feel fast — a date picker on mobile can be slow; a typed DD/MM/YYYY input with auto-format might serve her better for patients whose age she knows by heart.

**Change request:** (MUST FIX) Add back-navigation discard guard — the codebase already has the pattern (`navigation.addListener('beforeRemove')` + `savingCompletedRef`). Apply it in the live build. SHOULD FIX: Show a brief note that patient profile can be edited after save.

---

## SHANTABAI KADAM (Elderly Patient)
**Score: 4/5** _(proxy — this form is filled by staff/doctor, not patient)_

**Proxy concern:** The form collects DOB — many elderly patients in rural India don't know their exact DOB. The "Optional" designation on DOB handles this correctly. Data collected about her is minimal, optional, and doesn't expose PII to bystanders on this screen. No issue.

---

## ARJUN MEHTA (Semi-Savvy Patient)
**Score: 3/5** _(proxy — this form is filled by staff/doctor, not patient)_

**Proxy concern:** Arjun is privacy-conscious. He'd want to know: is his name stored permanently? Can the doctor see it without his consent? The offline banner "synced when online" is good — he'd appreciate knowing his record isn't immediately uploaded. However, no consent signal is visible at registration time.

---

## Weighted Average

| Persona | Score | Weight |
|---|---|---|
| Dr. Sinha | 4 | 30% |
| Dr. Nair | 3 | 25% |
| Sunita | 3 | 30% |
| Shantabai | 4 | 8% |
| Arjun | 3 | 7% |

**Weighted average: 3.38 / 5**

---

## MUST FIX

- **No back-navigation discard guard** — if Sunita or Dr. Sinha taps ← after typing a name, data is silently lost. The codebase already has the `navigation.addListener('beforeRemove')` + `savingCompletedRef` pattern (used in D6). Apply it in the live build. _Flagged by: Sunita_

## SHOULD FIX

- **Submit button label** — "Create Patient & Start Visit" is developer language. "Save & Begin Visit" is clearer for non-technical users. _Flagged by: Dr. Sinha_
- **No post-save affordance** — user has no indication where they'll land after tapping the button. Add a hint or ensure D6 opens immediately with a visible transition. _Flagged by: Dr. Sinha_
- **No "add more later" note** — no signal that additional patient details (blood group, allergies, address) can be added from the patient profile after save. Sets wrong expectation of incompleteness. _Flagged by: Dr. Nair, Sunita_
- **Age calculation hardcoded** — "Age: 39 years" is static in the mockup. Flag for live build to compute dynamically from DOB. _Flagged by: Dr. Nair_

## NICE TO HAVE

- **Typed DOB with auto-format** (DD/MM/YYYY) as alternative to date-picker, for staff who know patient age by heart. _Flagged by: Sunita_
- **Consent acknowledgement note** at registration time (brief, non-blocking). _Flagged by: Arjun proxy_

---

## BALANCER VERDICT: Revise and re-evaluate

**Rationale:** The form is clean, fast, and well-suited to the 20-second completion target. The MUST FIX (discard guard) is a live-build concern, not a mockup blocker — it does not require a mockup redesign. The SHOULD FIX items (button label, post-save hint, "add more later" note) are small copy/UX changes that can be applied to the mockup before the live build begins. Recommendation: apply SHOULD FIX items to the mockup in a quick revision, then proceed directly to Step 4 (Security Review) without a full re-evaluation panel.
