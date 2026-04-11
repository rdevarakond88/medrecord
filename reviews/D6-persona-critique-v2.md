# Persona Critique — New Visit (D6) v2

**Mockup file:** `mockups/D6NewVisitScreen.tsx`
**Variants evaluated:** Empty, HasNote, HasScan, Offline, NoConsent, NoConsentHasNote (new), Saving (7 total)
**Date:** 2026-02-25
**Prior score:** 3.46/5 — Verdict: Revise and re-evaluate
**Fixes applied since v1:** M1, M2, M3, S1, S2, S3, S4 (7 items)
**Agent:** Persona Critic Panel (agent-persona-critic.md)

---

## Pre-evaluation: Fix Verification

| ID | Fix | Status | Evidence |
|---|---|---|---|
| M1 | Disabled Save shows hint + amber highlight on tap | ✅ | `handleDisabledPress` + `hintHighlighted` state in `D6NewVisitEmpty`; hint persistently visible |
| M2 | `scanThumbRemove` 48×48px | ✅ | `scanThumbRemove: { width: 48, height: 48 }` + `hitSlop={{ top:6, bottom:6, left:6, right:6 }}` |
| M3 | Add HasNote+NoConsent variant | ✅ | `D6NewVisitNoConsentHasNote` (lines 602–674): consent notice + filled note + `SaveButton enabled={true}` |
| S1 | Chief complaint optional at label level | ✅ | `"Chief Complaint (optional)"` in all variants |
| S2 | Date pill "Change" label | ✅ | `<Text style={styles.datePillChange}>Change</Text>` after chevron |
| S3 | Consent notice plain language | ✅ | No "implicit consent request"; Sunita's patient-without-app sentence included |
| S4 | Header clinic attribution | ✅ (partial) | Third subtitle line present — but `DOCTOR` constant declared at line 66 is unused; header hardcodes `"City Clinic · Dr. Sharma"` while `DOCTOR = { name: 'Dr. Priya Nair', clinic: 'Sunita Clinic, Nagpur' }` |

**New issue found during verification:** `D6NewVisitNoConsent` (Variant 5/7) — disabled `SaveButton` has no `onDisabledPress` and no hint text. The M1 pattern was applied only to `D6NewVisitEmpty`, leaving the NoConsent variant's disabled Save button silent. In this variant a consent notice and a silent disabled button coexist — a builder or tester reading Variant 5 in isolation may conclude that Save is disabled by consent status.

---

```
PERSONA CRITIQUE — New Visit (D6) v2

═══════════════════════════════════════════════════════════════

DR. RAMAKANT SINHA (Reluctant Doctor — 58, Mau UP)
Score: 4.0/5  [was 3.5]

First impression:
  Opens the screen, sees the orange button and the patient name. Below
  the disabled Save button he immediately reads: "Add a scan or note to
  save this visit." He knows exactly what is blocking him before he even
  tries to tap Save. This is the right design. The hint text being
  persistently visible (not tooltip-on-tap) is especially good for him —
  he will not discover it by accident; it is always there.

What improved:
  1. The hint text is always visible and turns amber on disabled-button tap.
     He will never experience a silent dead end in the primary Empty state.
  2. "Chief Complaint (optional)" at the section label level — he can
     decide to skip the field without tapping into it first.
  3. Date pill now reads "25/02/2026  ›  Change" — unambiguously tappable.
     No guessing required.
  4. Consent notice: "This patient hasn't set up record sharing yet. This
     visit will be saved to your device." He can read this aloud at a
     counter without needing to explain any software concepts.

Residual concerns:
  1. D6NewVisitNoConsent (Variant 5/7): he opens this variant for a patient
     without consent, sees the amber notice, and taps the grey Save button.
     Silence. No hint text appears. Nothing tells him Save is disabled because
     there is no record — he may assume it is disabled by the consent notice.
     This is the M1 problem re-appearing in a different variant.
  2. The "OR" divider between scan and note in all empty-state variants still
     implies note entry is equally available to whoever is holding the phone.
     Not his specific complaint, but it sets a precedent Sunita will navigate
     around.

Score rationale:
  All four of his original MUST/SHOULD issues are resolved. The residual
  NoConsent silent-button issue is real but only affects the consent-absent
  path. +0.5 from v1.

═══════════════════════════════════════════════════════════════

DR. PRIYA NAIR (Tech-Savvy Doctor — 32, Coimbatore)
Score: 4.1/5  [was 3.8]

First impression:
  The new D6NewVisitNoConsentHasNote variant (6/7) is exactly what she
  needed. Consent notice visible at top, note filled, Save button blue and
  active. The spec intent is unambiguous. She will not misread this and
  she will not allow a live builder to misread it. M3 is resolved correctly.

What improved:
  1. The NoConsentHasNote variant definitively eliminates the spec ambiguity
     she flagged. Any builder reading the seven-variant set will see: consent
     notice does not gate Save.
  2. Clinic attribution is now present in the header (third subtitle line).
     For her multi-doctor clinic, the visit's filing context is clear.
  3. The scanCtaSecondary pattern (orange outline button when a note is
     present) is consistent across WithNote and NoConsentHasNote — good
     internal consistency.

Residual concerns:
  1. The DOCTOR constant (`name: 'Dr. Priya Nair', clinic: 'Sunita Clinic,
     Nagpur'`) is declared at line 66 but never referenced. The ScreenHeader
     hardcodes "City Clinic · Dr. Sharma" — a different name and clinic.
     The DOCTOR constant is dead code. She will notice this immediately.
     A live builder copy-pasting ScreenHeader without reading DOCTOR may
     hardcode the wrong data or not know which variable drives this field.
  2. D6NewVisitNoConsent (Variant 5/7) disabled Save is still silent —
     she read M3's intent as "we should clarify the spec"; the NoConsent
     variant still risks confusing a builder who reads variants in sequence
     and sees: consent notice + disabled Save + no hint text.
  3. File-level spec comment block (lines 8–14) still lists 6 variants.
     The NoConsentHasNote variant is not listed. The function comment calls
     it "Variant 7" (line 598) but D6AllVariants labels it 6/7. D6NewVisitSaving's
     function comment still reads "Variant 6" (line 679) but it is rendered
     as 7/7. The numbering is internally inconsistent across three locations.
  4. D6AllVariants preview comment reads "see variant 7 for Save-enabled-
     with-consent-notice proof" (line 742) — but variant 7/7 is "Saving In
     Progress." The proof is variant 6/7. Misleading annotation.
  5. Nice-to-haves (visit type, draft autosave) unchanged — expected.

Score rationale:
  The two issues she flagged as MUST/SHOULD are correctly resolved. DOCTOR
  constant inconsistency and the NoConsent silent-Save are new, distinct issues.
  Both are fixable in minutes. +0.3 from v1.

═══════════════════════════════════════════════════════════════

SUNITA (Balancer / Clinic Staff — 34, Nashik)
Score: 4.0/5  [was 3.5]

First impression:
  The remove button no longer tests her accuracy. She confirms: 48×48px hit
  area plus hitSlop of 6px on all sides — on a rushed afternoon with a
  prescription in her left hand, she will land it. The consent notice now
  gives her a direct script: "ask them to download it or request their
  consent in person." When a patient at the counter asks why she is
  photographing their prescription, she has an answer.

What improved:
  1. scanThumbRemove: 48×48px + hitSlop. MUST FIX resolved precisely.
     The style comment ("touch target 48×48px — ui-ux-spec.md compliance")
     is a useful signal for the live builder.
  2. Consent notice: "If they don't have the app, ask them to download it
     or request their consent in person." This is the sentence she needed.
     It matches real clinic workflow — she can say these words out loud.

Residual concerns:
  1. D6NewVisitNoConsent (Variant 5/7): she uses this path often (many of
     her clinic's patients do not have the app yet). She opens the visit,
     sees the amber notice, and taps the grey Save button. Nothing happens.
     No hint text appears. She does not know if the consent notice is
     blocking Save or if she needs to add a record first. She will try a
     second tap, then assume the button is broken. This is the M1 failure
     pattern in the most common real-world path for her clinic.
  2. The "OR" divider between scan and note: she knows clinical notes are
     the doctor's responsibility. The OR structure implies both paths are
     equally hers to use. In practice she only taps the orange button — but
     the layout offers no role guidance.

Score rationale:
  Both her MUST/SHOULD concerns are resolved. The NoConsent silent-Save
  is a real operational concern for her specific workflow. +0.5 from v1.

═══════════════════════════════════════════════════════════════

SHANTABAI KADAM (Elderly Patient — proxy — 71, Satara)
Score: 4.0/5  [was 3.5]

First impression (proxy):
  If the doctor briefly shows her the screen, she sees a clean layout with
  the patient name in the header. The orange button is prominent but
  non-threatening. The amber consent notice is present but not alarming in
  its visual weight.

What improved:
  The consent notice body is now readable aloud without explanation:
  "This patient hasn't set up record sharing yet. This visit will be saved
  to your device. They will be asked to approve sharing the next time they
  open the app. If they don't have the app, ask them to download it or
  request their consent in person."

  Her proxy interests are served by this language. The previous "implicit
  consent request" would have required the doctor to pause and explain.
  Now the doctor can read it to her and she will understand: her records
  are saved locally, she will be asked to approve later. No anxiety-inducing
  jargon.

Residual concerns:
  1. "The next time they open the app" still assumes she has the app
     and knows what "the app" refers to in context. Mitigated by the
     following sentence (which covers the no-app case), but the phrasing
     still assumes app literacy as the default.
  2. The consent notice title "Consent not yet established" is clinical
     language. If the doctor reads only the title before the body text,
     she may worry. The body text quickly resolves this — minor sequencing
     concern.

Score rationale:
  The primary concern (jargon in consent notice) is resolved. Her proxy
  interests (attribution, safety, plain language) are well-served. +0.5.

═══════════════════════════════════════════════════════════════

ARJUN MEHTA (Semi-Savvy Patient — proxy — 38, Bhopal)
Score: 3.8/5  [was 3.0]

First impression (proxy):
  If he ever sees this screen, the consent notice now gives him a plain-
  language explanation of what is happening to his data. "This patient
  hasn't set up record sharing yet. This visit will be saved to your
  device. They will be asked to approve sharing the next time they open
  the app." He can follow this. He knows a record is being created, he
  knows he will be asked to approve sharing, and he knows what to do if
  he does not have the app.

What improved:
  1. "Implicit consent request" is gone. He does not have to reverse-engineer
     what "implicit" means in a medical-software context.
  2. "Saved to your device" — he understands local storage. This reassures
     him that a record is not immediately broadcast to unknown systems.
  3. The approval process is explained: "they will be asked to approve
     sharing." He knows something will happen; he is not left wondering.
  4. The D6NewVisitNoConsentHasNote variant (6/7) confirms — from a design
     perspective — that consent absence does not prevent the record from
     being created. The consent notice body now explains this clearly enough
     that he is not surprised by a record existing before he approves.

Residual concerns:
  1. "The next time they open the app" — he wants faster notification.
     This is a system constraint, not a mockup fix. The language is honest
     about the timing.
  2. No opt-out path — by design (doctors must document care). The consent
     notice does not explain that the record will exist regardless of his
     consent decision. A privacy-aware reading: he may believe withholding
     consent prevents the record. Not addressed. (Product/legal decision,
     not a D6 mockup fix.)
  3. Doctor-facing script for privacy-conscious patients still absent — unchanged.

Score rationale:
  Significant improvement on the consent language — his primary concern
  is substantially resolved. Timing gap and opt-out gap are system constraints.
  +0.8 from v1.

═══════════════════════════════════════════════════════════════

─────────────────────────────────────────────────────────────
SCORING SUMMARY

  Dr. Sinha  (Reluctant Doctor)     4.0/5  [was 3.5]  +0.5
  Dr. Nair   (Tech-Savvy Doctor)    4.1/5  [was 3.8]  +0.3
  Sunita     (Staff / Balancer)     4.0/5  [was 3.5]  +0.5
  Shantabai  (Elderly Patient)      4.0/5  [was 3.5]  +0.5  [proxy]
  Arjun      (Semi-Savvy Patient)   3.8/5  [was 3.0]  +0.8  [proxy]

WEIGHTED AVERAGE: 3.98/5  [was 3.46/5]  +0.52
─────────────────────────────────────────────────────────────

MUST FIX:
- D6NewVisitNoConsent (Variant 5/7): disabled SaveButton has no tap
  feedback and no hint text. In this variant a consent notice and a
  silent disabled button coexist — a builder or tester reading Variant 5
  in isolation may conclude that Save is disabled by consent status. This
  is the exact misinterpretation M3 was added to prevent at the spec level,
  but Variant 5 still exhibits the silent-failure pattern at the UX level.
  Fix: add the same onDisabledPress + saveHint pattern used in
  D6NewVisitEmpty. The hintHighlighted state, handleDisabledPress handler,
  styles.saveHint, and styles.saveHintHighlighted are already defined —
  only the wiring into D6NewVisitNoConsent's bottomBar is missing.
  Flagged by: Dr. Sinha, Sunita. Risk: Spec violation in live build.

SHOULD FIX:
- DOCTOR constant (declared at line 66: name 'Dr. Priya Nair', clinic
  'Sunita Clinic, Nagpur') is never referenced. ScreenHeader hardcodes
  "City Clinic · Dr. Sharma" — a different clinic and doctor name. DOCTOR
  is dead code. Fix: replace the hardcoded subtitle with
  `{DOCTOR.clinic} · {DOCTOR.name}` in ScreenHeader. This clarifies to
  the live builder exactly which runtime variables drive the clinic
  attribution line introduced by S4.
  Flagged by: Dr. Nair. Risk: Live builder misidentifies data source for
  clinic line; may hardcode instead of wiring to auth/visit context.

NICE TO HAVE:
- File-level spec comment (lines 8–14) lists 6 variants; update to 7 and
  add D6NewVisitNoConsentHasNote to the enumerated list.
  Flagged by: Dr. Nair.

- Variant numbering is inconsistent across three locations:
  · D6NewVisitNoConsentHasNote function comment says "Variant 7" (line 598)
    but D6AllVariants labels it 6/7.
  · D6NewVisitSaving function comment says "Variant 6" (line 679) but
    is rendered as 7/7 in D6AllVariants.
  · D6AllVariants comment "see variant 7 for Save-enabled-with-consent-
    notice proof" (line 742) points at Saving (7/7), not NoConsentHasNote (6/7).
  Normalise numbering across all three locations.
  Flagged by: Dr. Nair.

- Saving variant (7/7) shows only text-based "Saving…" feedback — no
  ActivityIndicator spinner. Adequate for the mockup; flag for live build
  to include an ActivityIndicator for tactile completeness on slower
  devices.
  Flagged by: Dr. Nair.

- Doctor-facing note explaining the consent model for privacy-conscious
  patients (Arjun's NICE TO HAVE from v1) — still absent. Flag for
  product discussion before D6 live build.
  Flagged by: Arjun (proxy).

─────────────────────────────────────────────────────────────

BALANCER VERDICT: Ship as-is

RATIONALE: The revised mockup has cleared 3.98/5, up 0.52 from the prior
3.46, well above the 3.5 proceed threshold. All seven MUST/SHOULD fix items
from v1 (M1–M3, S1–S4) are correctly implemented. The design fundamentals —
scan-first hierarchy, binary choice, persistent hint text, plain-language
consent notice, and the new NoConsentHasNote variant — are approved by
the panel. One MUST FIX and one SHOULD FIX are identified; both are
targeted corrections that take under 10 minutes to apply and require no
re-evaluation cycle. The MUST FIX (NoConsent hint text) is a direct
extension of the already-approved M1 pattern — the logic and styles are
written, only the wiring into D6NewVisitNoConsent's bottomBar is missing.
Apply both corrections and the mockup is cleared for D6 live build.
```

---

## Issues for project-state.md Debt Tracking

### MUST FIX — D6 mockup (fix before live build begins)

| ID | Item | Source |
|---|---|---|
| D6-M-4 | `D6NewVisitNoConsent` (Variant 5/7) disabled Save button has no tap feedback or hint text — M1 pattern not extended to this variant; consent notice + silent disabled button coexist, risking live-build misimplementation of Save as consent-gated | Persona critique v2 — Dr. Sinha, Sunita |

### SHOULD FIX — D6 mockup (fix before live build begins)

| ID | Item | Source |
|---|---|---|
| D6-S-5 | `DOCTOR` constant declared at line 66 is never referenced; `ScreenHeader` hardcodes `"City Clinic · Dr. Sharma"` instead of `{DOCTOR.clinic} · {DOCTOR.name}` — dead code confuses live builder about which variable drives clinic attribution line | Persona critique v2 — Dr. Nair |

### Resolved since v1

| ID | Item | Status |
|---|---|---|
| D6-M-1 | Disabled Save hint text | CLOSED — hint always visible, highlights amber on tap |
| D6-M-2 | scanThumbRemove touch target | CLOSED — 48×48px + hitSlop |
| D6-M-3 | NoConsent variant spec ambiguity | CLOSED — D6NewVisitNoConsentHasNote variant added |
| D6-S-1 | Chief complaint optional at label level | CLOSED |
| D6-S-2 | Date pill "Change" label | CLOSED |
| D6-S-3 | Consent notice plain language | CLOSED |
| D6-S-4 | Header clinic attribution | CLOSED (DOCTOR constant not wired — see D6-S-5) |
