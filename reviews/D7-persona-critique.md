# PERSONA CRITIQUE — Document Scanner (D7)

_Date: 2026-03-05_
_Mockup: `mockups/D7DocumentScannerScreen.tsx`_
_Spec: `docs/ui-ux-spec.md` § D7 · PM review: `reviews/D7-pm-preflow.md`_
_Security audit: `reviews/D7-security-audit.md` (all CRITICAL + HIGH closed before this review)_

**Persona weights applied** (screen-inventory.md not yet created; weights derived from PM preflow
market-reality note: "staff, not doctors, will operate the scanner in most clinics"):

| Persona | Weight | Rationale |
|---|---|---|
| Sunita (Staff) | 30% | PM-confirmed primary operator in 40–80 pt/day clinics |
| Dr. Sinha (Reluctant Doctor) | 20% | Key adoption gatekeeper; solo-practice doctor also operates scanner |
| Dr. Nair (Tech-Savvy Doctor) | 20% | Technical quality + OCR/failure-mode expectations |
| Arjun (Semi-Savvy Patient) | 15% | "Use Photo Library" path is his primary interaction |
| Shantabai (Elderly Patient) | 15% | Passive trust signal — does the flow feel safe enough to comply? |

---

## DR. RAMAKANT SINHA (Reluctant Doctor)

**Score: 3/5**

**First impression:**
A dark full-screen camera view with an orange button at the bottom, a rectangle outline in the middle, and some text at the top. He recognises a camera. He knows what to do: point at the paper, press the button.

**Would be confused by:**
- The exposure indicator pill (coloured dot + text "Good" / "Too Dark — move to better light"). He has not seen this before. The natural instinct is: "If it says Too Dark, should I wait? Or can I still press?" The advisory-only design is correct but it does not communicate that the capture button remains active regardless. He may hesitate or ask Sunita, "Is this a problem?"
- The flash toggle cycling Off → On → Auto. He will tap it twice expecting a simple on/off. "Auto" is unfamiliar terminology; he may leave it in an unintended state.
- The crop handles on preview. He will not use them. He may accidentally drag one and not understand why the image looks cropped oddly. The hint "Drag corners to adjust crop" is small (13pt, low opacity white) and easily missed.
- After "Use This", all scans from a visit will be labelled "Document – 04/03/2026". If he scans a lab report and a prescription in the same visit, he cannot tell them apart when reviewing later in D4.

**Would like:**
- The single-tap capture flow. Three steps: point → press orange button → press "Use This". That is faster than photographing a document with WhatsApp and sending it to himself.
- "Retake" is visible and clearly placed in the top-left of the preview. He will use this without needing to learn it.
- Offline: images save locally. Data is not lost if the network drops. This addresses his core fear.
- Processing spinner during "Use This" — he knows it is working and does not tap again.

**Change request:**
- Add a brief label to the capture button or guide text to clarify: "Tap to capture — you can always retake." Removes the hesitation during exposure advisory states.
- Remove the "Auto" flash mode or rename it to "Auto (recommended)". Off/On is sufficient for Dr. Sinha's use.
- **Document type label selector on the preview screen** (Prescription / Lab Report / Referral / Other) before "Use This". Without this, he cannot distinguish scans within a single visit when he reviews D4.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)

**Score: 3.5/5**

**First impression:**
Clean, focused camera UI. Guide rectangle with corner brackets, exposure pill, flash toggle, "Use Photo Library" — all expected. She notices the guide rectangle border is semi-transparent (rgba 255,255,255,0.45); on a real device under harsh tube lighting, it may not stand out enough against a white document background. She files this as a device-testing question.

**Would be confused by:**
- OCR status is completely invisible from D7. After "Use This" she returns to D6 with a scan thumbnail but no indication that OCR is queued, running, or has completed. She knows to look in D8, but a first-time doctor would not. The spec says "OCR is async, never blocks UI" — correct — but a single passive line ("Text extraction will run in the background") on the Processing state or on the D6 thumbnail would close this gap without blocking anything.
- The crop handles (22×22px visual brackets, hitSlop 16px all sides) are correct for touch target size, but a doctor who wants precision crop on a lab report with dense text will find dragging four corners individually time-consuming. She expects a confirmed-region gesture, not four independent corner drags.
- All scans labelled "Document – 04/03/2026". She works with multiple scan types per visit (thyroid panel + ultrasound + referral letter). Indistinguishable labels are a direct problem for her organised record-keeping workflow.

**Would like:**
- Async OCR — correct. No spinner, no blocking, returns immediately to D6. This is the right call.
- "Use Photo Library" is visible and accessible. She expects this for patients who photograph their own reports.
- The tap guard (useRef, not useState) — she would not notice this but she benefits when the capture button does not double-fire on a tired tap.
- The `sanitizeOcrText()` Aadhaar strip — good data hygiene; she is compliance-aware.

**Change request:**
- **Document type label selector at the preview step** — mandatory before live build. "Prescription / Lab Report / Referral / X-ray / Other" — one tap before "Use This". Sets `scan.label` to something useful.
- Add a passive OCR status line in the D7ProcessingState or in the D6 scan thumbnail after return: "Text extraction queued." Zero UI cost, closes the expectation gap.
- Consider a "Scan another" option after "Use This" returns to D6 — avoids the extra tap sequence for multi-document visits. Nice to have, not blocking.

---

## SUNITA (Balancer / Staff)

**Score: 3.5/5**

**First impression:**
Recognises the camera immediately — looks like the WhatsApp camera. The orange button is large and unambiguous. The guide rectangle tells her where to place the document. "Use Photo Library" is visible below the capture button. She can learn this flow in under 5 minutes.

**Would be confused by:**
- **Scan without an open visit is architecturally blocked.** D7 requires a `visitId` nav param to proceed — the `ErrorState` guard enforces this (CRITICAL-2 fix). In practice: the doctor must have opened D6 (New Visit) before Sunita can scan. In a busy clinic where the doctor is already in the next patient's room, Sunita cannot pre-scan a newly arrived patient's lab report. This is an architecture constraint, not a D7 UI failure — but it creates a real workflow gap. The screen itself cannot fix this; it needs a future "scan and attach later" queue feature. Flagged here for product backlog.
- The exposure indicator in a dim storage room or sunny doorway. "Too Dark — move to better light" is the correct language (direct, actionable). She will follow the instruction. The advisory-only nature (capture button remains enabled) is correct for her — she cannot always control clinic lighting.
- No indication of how many scans are already attached to this visit. After returning to D6 and navigating back to D7 for a second scan, she has no counter ("1 scan attached"). She may scan the same document twice.
- "Document – 04/03/2026" label is generic. If a doctor later asks "which scan is the CBC?", she has no way to answer from D4 without opening each image.

**Would like:**
- The "Use Photo Library" option is exactly what she needs for the common case: patient arrives with a photo of their report already on their phone. Visible, one tap. Correct placement.
- "Retake" in the preview is obvious. She will retake blurry captures without needing guidance.
- Processing spinner — she knows the app is working.
- The flow is teachable to a new receptionist in under 10 minutes. Three steps with clear labels. No configuration at scan time.

**Change request:**
- **Document type label selector** — critical for her job. Without it she cannot answer "which scan is which" when the doctor reviews.
- A scan counter ("1 scan attached to this visit") visible when re-entering D7 from D6 — prevents duplicate scans.
- Backlog: "Scan and hold" queue for pre-visit scanning (architectural, not D7 scope).

---

## SHANTABAI (Elderly Patient)

**Score: 3/5**

**First impression:**
Shantabai does not operate the scanner. She watches Sunita point the phone at her plastic folder of prescriptions. The screen visible to her over Sunita's shoulder: a dark rectangle, a white outline, an orange button. It does not look alarming. It looks like Sunita is taking a photo.

**What she instinctively processes:**
- Is Sunita confident? If Sunita frames the document in the guide rectangle and taps the orange button without hesitation, Shantabai reads this as routine and complies.
- The "Compressing and saving…" spinner during processing is reassuring — the phone is doing something purposeful, not frozen.
- No other patient's name or record appears on screen — she cannot see anything that looks private or unfamiliar.
- The preview shows a document icon and label ("Lab Report — Sunita Ramesh Patil / Thyroid Function Test"). Her name is visible on the preview screen. She may notice this and feel reassured ("yes, that's my report") or slightly anxious ("who else will see my name?"). The second reaction depends entirely on whether Sunita has verbally explained the purpose.

**What would cause anxiety:**
- D7 itself provides no patient-facing explanation. There is no text visible to Shantabai that says "We are saving a copy of your prescription for your records." The reassurance must come entirely from Sunita. If Sunita is distracted or new, this explanation may not happen.
- The "Saving…" / "Compressing and saving…" wording is technical. If Shantabai is holding the phone or watching the screen, "Compressing" means nothing to her.

**What she does not notice:**
- The exposure indicator — she never sees the viewfinder for long enough.
- The flash toggle — irrelevant to her.
- OCR, crop handles, "Use Photo Library" — none of these are in her world.

**Change request (surface for product consideration):**
- A single line of patient-facing copy on the preview screen: "Saving a copy of this document to [patient name]'s health record." Addresses the primary anxiety at zero UI cost. Not a redesign — one text line below the preview image.
- "Compressing and saving…" → "Saving your document…" — plain language for the processing label.

---

## ARJUN (Semi-Savvy Patient)

**Score: 3.5/5**

**First impression:**
Arjun arrives with his phone containing a photograph of his haematology report. The staff opens D7. He sees the camera screen. Sunita taps "Use Photo Library." His native photo picker opens. He finds the report (he knows where it is — he took it two days ago). It appears in the D7 preview. Sunita taps "Use This." Done. He recognises this flow from WhatsApp and Google Photos.

**Would be confused by:**
- **After "Use This", what happens to the photo?** Arjun does not see any confirmation that his report was saved. He returns to the clinic's visit screen (D6/D4) which shows a thumbnail. If the thumbnail is small or ambiguous, he may not be certain the correct photo was attached.
- **Privacy: who can see this scan?** The D7 screen provides no information about access. Arjun's core concern is "I don't want my health data going everywhere." He has no signal from D7 that the scan is scoped to this doctor only, or that it will not be shared without his consent. This is a product-level concern, but D7 is the moment of maximum privacy salience.
- **Document type label** — he handed Sunita his "haematology report" but the system will save it as "Document – 04/03/2026". If he later reviews his records (in a future patient app), he will not know what was captured.
- The "Use Photo Library" flow is present in the mockup as a button but no variant shows the state after a photo is selected from the library. In the live build this should transition correctly to the preview state — but as a mockup gap, the flow is unverified for this path.

**Would like:**
- "Use Photo Library" is visible and accessible — exactly where he expects it, below the capture button.
- The review step (preview + "Use This" / "Retake") gives him a chance to confirm the correct photo was selected before committing.
- The flow is fast. From "Use Photo Library" to "Use This" is 3 interactions in under 20 seconds.

**Change request:**
- **Document type label selector on preview** — so "Haematology Report" becomes the saved label, not "Document."
- A confirmation line after "Use This" completes (visible in D6/D4 on return): "1 scan added — Lab Report." Closes the loop for Arjun.
- Backlog: A brief privacy note accessible from D7 preview ("Saved only to this visit — [Doctor name] only").

---

## WEIGHTED SCORE

| Persona | Score | Weight | Weighted |
|---|---|---|---|
| Dr. Sinha (Reluctant Doctor) | 3.0 | 20% | 0.60 |
| Dr. Nair (Tech-Savvy Doctor) | 3.5 | 20% | 0.70 |
| Sunita (Staff / Balancer) | 3.5 | 30% | 1.05 |
| Shantabai (Elderly Patient) | 3.0 | 15% | 0.45 |
| Arjun (Semi-Savvy Patient) | 3.5 | 15% | 0.525 |

─────────────────────────────
**WEIGHTED AVERAGE: 3.3/5**
─────────────────────────────

No single persona scored ≤ 2. Weighted average > 3.0. No automatic MUST FIX threshold triggered.

---

## MUST FIX

None. No persona score ≤ 2. Weighted average 3.3 > 3.0 threshold.

---

## SHOULD FIX

- **~~Missing document type label at capture time~~** — flagged by Dr. Sinha, Dr. Nair, Sunita, Arjun.
  **RESOLVED 2026-03-05** — `DocTypeSelector` component added to `D7PreviewState` and
  `D7PhotoLibraryPreviewState`. Options: Prescription / Lab Report / Referral / X-ray / Other.
  Default: Prescription. Selected label replaces hardcoded "Document – [date]" in `handleUseThis`
  via `labelledResult = { localPath, label: selectedType }`. (D7-SF-1)

- **~~"Use Photo Library" → preview transition not shown as a mockup state~~** — flagged by Arjun, Dr. Nair.
  **RESOLVED 2026-03-05** — `D7PhotoLibraryPreviewState` export added. Structurally identical to
  `D7PreviewState`; mock placeholder uses Arjun Mehta / Sharma Diagnostics data to distinguish
  the library-entry path. Real-build comment documents `ImagePicker.launchImageLibraryAsync()`
  URI entry point. (D7-SF-2)

- **~~Exposure indicator advisory nature not communicated~~** — flagged by Dr. Sinha.
  **RESOLVED 2026-03-05** — "Tap to capture anyway" sub-label added below `ExposureIndicator` in
  `D7ViewfinderTooDark` and `D7ViewfinderOverexposed`. 12px italic, Text Secondary #64748B.
  Not present in `D7ViewfinderGood`. (D7-SF-3)

---

## NICE TO HAVE

- **~~OCR queued status line~~** — flagged by Dr. Nair.
  **APPLIED 2026-03-05** — Comment added in `D7ProcessingState` processing overlay: "add 'Text
  extraction will run in the background' line here in live build." Deferred to live build.

- **~~Privacy note on preview~~** — flagged by Arjun, Shantabai.
  **APPLIED 2026-03-05** — "Saved only to this visit" line added below `DocTypeSelector` in
  both `D7PreviewState` and `D7PhotoLibraryPreviewState`. Text Secondary #64748B, 12px.

- **~~Plain-language processing copy~~** — flagged by Shantabai.
  **APPLIED 2026-03-05** — "Compressing and saving…" → "Saving your document…" in
  `D7ProcessingState` processing label.

- **Batch scan flow** — flagged by Dr. Nair, Sunita. "Scan another document" option after
  "Use This" without returning to D6. Conflicts with the current navigation model
  (D7 returns to caller on every "Use This"). Defer to v2.

---

## BALANCER VERDICT: Revise

**RATIONALE:** The core capture flow is well-designed for this market and this user population. The
3-tap path (frame → capture → confirm) is fast, offline-safe, and teachable in under 10 minutes.
The exposure indicator, flash toggle, guide rectangle, and crop handles all implement the spec
correctly. The tap guard and visitId guard are solid. One SHOULD FIX item — missing document type
label — will directly undermine D4 and D8 usability once real visits accumulate multiple scans;
this must be resolved before the live build begins. The "Use Photo Library" flow variant is a minor
mockup gap that should be added but does not require a full re-evaluation. Resolve these two items
and the screen is ready to build.
