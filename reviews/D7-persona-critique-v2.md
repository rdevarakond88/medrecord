# PERSONA CRITIQUE v2 — Document Scanner (D7)

_Date: 2026-03-05_
_Mockup: `mockups/D7DocumentScannerScreen.tsx` (post SF-1, SF-2, SF-3 + NICE TO HAVE fixes — commit `f84c947`)_
_Prior critique: `reviews/D7-persona-critique.md` (v1 score: 3.3/5, verdict: Revise)_
_Re-evaluation trigger: all three SHOULD FIX items from v1 applied._

**Persona weights** (unchanged from v1):

| Persona | Weight | Rationale |
|---|---|---|
| Sunita (Staff) | 30% | PM-confirmed primary operator in 40–80 pt/day clinics |
| Dr. Sinha (Reluctant Doctor) | 20% | Key adoption gatekeeper; solo-practice doctor also operates scanner |
| Dr. Nair (Tech-Savvy Doctor) | 20% | Technical quality + Rule 10 / OCR / failure-mode expectations |
| Arjun (Semi-Savvy Patient) | 15% | "Use Photo Library" path is his primary interaction |
| Shantabai (Elderly Patient) | 15% | Passive trust signal — does the flow feel safe enough to comply? |

**Changes evaluated in this pass:**
- SF-1: `DocTypeSelector` (Prescription / Lab Report / Referral / X-ray / Other) on `D7PreviewState` and `D7PhotoLibraryPreviewState`. Default: Prescription. `handleUseThis` returns `{ localPath, label: selectedType }`.
- SF-2: `D7PhotoLibraryPreviewState` export added. Distinct mock data (Arjun Mehta / Sharma Diagnostics). ImagePicker URI path documented.
- SF-3: "Tap to capture anyway" sub-label below exposure indicator in `D7ViewfinderTooDark` and `D7ViewfinderOverexposed`.
- NICE TO HAVE: "Saving your document…" copy in `D7ProcessingState`; "Saved only to this visit" privacy line on both preview states; OCR comment in processing overlay.

---

## DR. RAMAKANT SINHA (Reluctant Doctor)

**Score: 3.5/5**

**First impression:**
Same camera view he recognised in v1. He taps the orange button. Image captured. Now on the preview screen he sees a new row of pill buttons: "Prescription | Lab Report | Referral | X-ray | Other." The first pill is highlighted in blue — "Prescription." He does not need to change it for the prescription he just scanned. He taps "Use This." Done.

**Would be confused by:**
- The flash toggle still cycles Off → On → Auto. In v1 this was flagged. Still unaddressed. He will leave it in "Auto" after two accidental taps and not understand why flash behaviour changed. Minor but persistent.
- The crop handles on the preview screen are still present. He still will not use them. In the v2 preview, the layout now shows: preview image → crop hint → type selector row → privacy line → "Use This" button. More elements between image and confirm button than in v1. He may momentarily scan the screen looking for the action button — but "Use This" is at the bottom in Primary Blue and he will find it.
- The "Tap to capture anyway" text under the exposure indicator is present in the Too Dark and Overexposed states. The text is 12pt italic in `Colors.textSecondary` (#64748B) with no dark pill background behind it — it sits directly on the live camera feed. Under typical clinic conditions (a document on a desk, mixed lighting), #64748B italic text on a camera feed may be difficult to read. The intent of SF-3 is correct; the execution has a contrast gap.

**Would like:**
- "Prescription" as the default type selector state — he rarely scans anything else. Most days he can ignore the selector entirely.
- Processing spinner still shows "Saving your document…" — plain language, reassuring.
- "Retake" is still clearly in the top-left. Still uses it without thinking.
- Offline still works. Data not lost.

**Residual change request:**
- The flash "Auto" cycle remains a source of confusion. Rename to "Auto (recommended)" or remove the Auto state entirely for v1.
- `captureAdvisory` needs a dark pill background so the "Tap to capture anyway" text is legible on the camera feed (see SF-3 contrast note in SHOULD FIX below).

**v1 → v2 delta:** SF-1 resolves his label concern cleanly — the selector is non-intrusive given the smart default. SF-3 communicates advisory intent but has a contrast gap that reduces its practical impact. Net: +0.5.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)

**Score: 4.0/5**

**First impression:**
`DocTypeSelector` is immediately useful and correctly implemented — scrollable pill row, accessible state attributes, `accessibilityState: { selected }` wired correctly. The `D7PhotoLibraryPreviewState` variant closes the mockup gap she flagged. The `handleUseThis` returning `{ localPath, label: selectedType }` is exactly the right data shape for D6/D4 integration.

**Would be confused by / would flag:**
- **`captureAdvisory` violates Rule 10.** The text "Tap to capture anyway" uses `Colors.textSecondary` (#64748B, a mid-gray) with no dark semi-transparent pill background. Rule 10 from LESSONS-AND-RUNBOOK.md is explicit: all camera overlay labels must use white text on a semi-transparent dark pill. Every other camera-screen overlay element (`exposurePill`, `topBarButton`, `flashToggle`, `guideLabel`, `photoLibraryText`) follows this rule. The `captureAdvisory` does not. On a real device under clinic lighting, #64748B italic text will likely be illegible against many camera backgrounds. The comment in the style notes "dark overlay behind bottomControls ensures this is legible" — but `bottomControls` has no `backgroundColor` in its style definition. This is a production-blocking contrast issue for that element.
- **`privacyLine` (#64748B on #000000)** — contrast ratio ≈ 4.59:1, which technically passes WCAG AA minimum but is at the threshold. All other preview-screen text uses `Colors.surface` or `rgba(255,255,255,x)`. The privacyLine is the only element using a light-background secondary colour on a dark background. Should be `rgba(255,255,255,0.55)` to match `cropHint` and other preview text for visual consistency and safety margin.
- OCR status is still not visible in the D7 UI itself (comment added, deferred to live build). She accepts this as a known deferral now that it is documented.
- The guide rectangle border (rgba(255,255,255,0.45)) against a white document under harsh tube lighting — still a device-testing question, unchanged from v1.

**Would like:**
- SF-1 resolves her primary concern: scans across a multi-document visit will now have distinct labels in D4 and D8. This was the most impactful fix for her workflows.
- SF-2: `D7PhotoLibraryPreviewState` correctly models the picker → preview entry path. The `ImagePicker.launchImageLibraryAsync()` comment is exactly the right annotation.
- `sanitizeOcrText()` still present and correctly documented at the write boundary.
- `accessibilityState={{ selected: selected === type }}` on `DocTypeSelector` options — correct VoiceOver/TalkBack semantics.

**Residual change request:**
- Fix `captureAdvisory` per Rule 10 before live build: wrap in `View` with `rgba(0,0,0,0.55)` background + pill border radius, change text color to `Colors.surface`.
- Fix `privacyLine` color to `rgba(255,255,255,0.55)` on preview screen.

**v1 → v2 delta:** SF-1 and SF-2 resolve her two main friction points. New Rule 10 violation in captureAdvisory is a concrete, fixable issue she would block in code review. Net: +0.5, with a new SHOULD FIX that needs live-build attention.

---

## SUNITA (Balancer / Staff)

**Score: 4.0/5**

**First impression:**
The camera screen is unchanged — still familiar, still learnable. After capture, the preview now shows the type selector above "Use This." She selects "Lab Report" with one tap. The flow is: viewfinder → capture → (pick type if not Prescription) → Use This. For a lab report: 4 taps. For a prescription: 3 taps (default is correct). "Saved only to this visit" below the selector tells the story if a patient asks.

**Would be confused by:**
- The "can't scan without an open visit" architecture gap remains. Not a D7 issue — product backlog. But she will encounter it daily.
- No scan count indicator when re-entering D7 from D6 for a second scan. If she scans a lab report and a prescription for the same visit, on the second entry to D7 there is no "1 scan already attached" counter. She may accidentally re-scan the lab report. This is a new-entry flow gap unfixed in v2.
- `captureAdvisory` contrast gap (flagged by Dr. Nair above) — "Tap to capture anyway" may not be reliably readable in the dim clinic storage room. She would benefit from it most in low-light conditions but that is exactly when contrast is hardest.

**Would like:**
- Type selector resolves her "which scan is which" problem directly. Now she can answer the doctor's "which scan is the haemogram?" question from D4 without opening each image.
- "Saved only to this visit" is a useful one-liner when a patient asks "where does that photo go?"
- "Saving your document…" in the processing state is plain language she can confirm verbally to the patient.
- The flow is still teachable in under 10 minutes to a new receptionist.

**Residual change request:**
- Scan count badge on D7 entry (from D6 context): "1 scan already attached to this visit." Prevents duplicate captures. Add to live-build requirements.
- `captureAdvisory` contrast fix (see Dr. Nair above).

**v1 → v2 delta:** SF-1 is the key win. Type selector adds minimal friction (one extra tap only when the type is not Prescription). "Saved only to this visit" handles the patient question. Net: +0.5.

---

## SHANTABAI (Elderly Patient)

**Score: 3.5/5**

**First impression:**
She watches Sunita scan her prescription folder. The processing screen now says "Saving your document…" instead of "Compressing and saving…" If she catches a glimpse, this is more reassuring — a document being saved sounds purposeful and familiar.

**What she instinctively processes (updated):**
- "Saving your document…" — she understands this. "Compressing" was opaque. This is a genuine improvement.
- The preview screen now shows the type selector row: "Prescription | Lab Report | Referral | X-ray | Other." If she sees this over Sunita's shoulder, she might notice "Prescription" is highlighted in blue. She may recognise the word "Prescription" as what she carries in her plastic folder. This is weakly reassuring.
- "Saved only to this visit" appears in small text below the type selector. At 12pt `Colors.textSecondary` (#64748B) on a black preview background, the contrast is borderline. At 71, with possible presbyopia, this line may not be readable at arms' length. If she cannot read it, the reassurance benefit is lost.
- No structural change to her experience — the scanning itself is still a camera being pointed at her documents by Sunita. Her willingness to comply still depends on Sunita's verbal explanation, not on screen content.

**What would cause anxiety (updated):**
- The preview screen has more elements than v1 (type selector + privacy line + crop hint + image + retake + Use This). If she is handed the phone for any reason, she would be overwhelmed. But she is not expected to operate the screen.
- The "Saving your document…" label is in the spinner overlay on the processing screen — she would need to be watching the phone closely to see it. If she is looking away, she misses it.

**v1 → v2 delta:** "Saving your document…" is a real improvement. "Saved only to this visit" is conceptually correct but may not be readable by elderly users at 12pt low-contrast. Net: +0.5, with the note that the privacyLine contrast should be fixed for it to be truly beneficial.

---

## ARJUN (Semi-Savvy Patient)

**Score: 4.0/5**

**First impression:**
Sunita taps "Use Photo Library." Native picker opens. He finds his haematology report in his camera roll. The preview appears. He sees the type selector row — "Prescription" is highlighted by default. He taps "Lab Report" (or if it were his specific case, perhaps "Other" for haematology). "Saved only to this visit" is visible below the selector. He taps "Use This." The image is saved. He returns to the visit screen.

**Would be confused by:**
- "Saved only to this visit" at 12pt #64748B on black — same readability concern as Shantabai. At 38, Arjun can likely read it but may need to look closely. He will read it because he cares about privacy.
- No explicit name of the doctor in the privacy note. "Saved only to this visit" tells him the scope is limited. He wants to know "this visit with Dr. [Name]" — one more word of specificity would close his privacy concern more completely.
- Post-scan confirmation: after "Use This" he returns to D6/D4. D7 itself still provides no count or label confirmation in the outgoing transition. He infers it worked from the thumbnail in D6. Residual concern.
- There is no "Haematology Report" option in the type selector. His report is a "Lab Report" — close enough, he will select it. But a patient-facing "Other" option with no sub-labelling means some scans will be categorised generically. Acceptable for v1.

**Would like:**
- The type selector is exactly what he needed. He selects "Lab Report" and knows that is what will be labelled in his record. This directly addresses his original complaint.
- "Saved only to this visit" is present and answers his main privacy question. Barely readable on the dark background but present.
- `D7PhotoLibraryPreviewState` is now modelled — the photo library path is confirmed to work identically to the camera capture path. This closes the mockup ambiguity.
- The flow from photo library to "Use This" is 3 interactions. Fast, familiar.

**Residual change request:**
- `privacyLine` color: change to `rgba(255,255,255,0.55)` for legibility on the dark preview background.
- Post-scan confirmation in D6/D4 (not D7 scope): "Lab Report saved" label or scan count update.

**v1 → v2 delta:** SF-1 and SF-2 both directly improve his experience. Privacy note is present if barely legible. Net: +0.5.

---

## WEIGHTED SCORE

| Persona | v1 Score | v2 Score | Weight | Weighted |
|---|---|---|---|---|
| Dr. Sinha (Reluctant Doctor) | 3.0 | 3.5 | 20% | 0.70 |
| Dr. Nair (Tech-Savvy Doctor) | 3.5 | 4.0 | 20% | 0.80 |
| Sunita (Staff / Balancer) | 3.5 | 4.0 | 30% | 1.20 |
| Shantabai (Elderly Patient) | 3.0 | 3.5 | 15% | 0.525 |
| Arjun (Semi-Savvy Patient) | 3.5 | 4.0 | 15% | 0.60 |

─────────────────────────────
**WEIGHTED AVERAGE: 3.8/5** (was 3.3/5)
─────────────────────────────

Gate: 3.8 ≥ 3.5 — **PASSED**. Previous v1 score of 3.3 did not clear this gate.

---

## MUST FIX

None. No persona scored ≤ 2. Weighted average 3.8 > 3.0 threshold.

---

## SHOULD FIX

- **`captureAdvisory` violates Rule 10** — flagged by Dr. Nair; affects Dr. Sinha and Sunita.
  Text "Tap to capture anyway" uses `Colors.textSecondary` (#64748B, mid-gray) with no dark pill
  background, directly on the live camera feed. `bottomControls` has no `backgroundColor`.
  Rule 10 (LESSONS-AND-RUNBOOK.md) requires white text on semi-transparent dark overlay for all
  camera labels. Every other camera-screen element follows this rule; `captureAdvisory` does not.
  Fix in live build: wrap in a pill `View` with `backgroundColor: 'rgba(0,0,0,0.55)'` and
  `borderRadius: 12`, change text color to `Colors.surface`. Do not ship to device without this fix.

- **`privacyLine` uses light-background color on dark preview screen** — flagged by Dr. Nair, Arjun,
  Shantabai. `Colors.textSecondary` (#64748B) on `#000000` yields ≈ 4.59:1 contrast — borderline
  WCAG AA, inconsistent with all other preview-screen text (which uses surface white / rgba white).
  Fix in live build: change to `rgba(255,255,255,0.55)` to match `cropHint` and preview text
  conventions. One-line style change.

- **No scan count on D7 re-entry** — flagged by Sunita.
  When Sunita navigates back to D7 from D6 for a second scan, there is no indicator showing how
  many scans are already attached. Duplicate capture risk. Add to live-build requirements for D7:
  accept an optional `existingScanCount` nav param and show "N scan(s) attached" in the viewfinder
  top bar when count > 0.

---

## NICE TO HAVE

- **Flash "Auto" rename** — flagged by Dr. Sinha. Cycle remains Off → On → Auto. "Auto" is
  unfamiliar terminology for non-technical doctors. Rename to "Auto" → "Auto ⚡" or simply remove
  Auto state for v1 (Off ↔ On toggle only). Low effort, low priority.

- **Privacy note specificity** — flagged by Arjun. "Saved only to this visit" could include the
  doctor's name: "Saved only to this visit with Dr. [Name]." One interpolation, no layout change.

- **OCR queued status** — flagged by Dr. Nair. Comment already placed in `D7ProcessingState`.
  Deferred to live build; wire as "Text extraction will run in the background" label in
  `processingOverlay`.

- **Batch scan mode** — flagged by Dr. Nair, Sunita. Defer to v2. Navigation model change required.

---

## BALANCER VERDICT: Ship as-is

**RATIONALE:** The v2 mockup scores 3.8/5, clearing the 3.5 validation gate that v1 did not meet.
All three SHOULD FIX items from v1 are resolved. The two new SHOULD FIX items (`captureAdvisory`
contrast and `privacyLine` color) are live-build styling corrections — both are single-line style
changes that do not require a mockup revision. The mockup correctly communicates the design intent
and provides a sound specification for the live build. Proceed to live build; address the two new
SHOULD FIX items during the live-build styling pass before device testing.
