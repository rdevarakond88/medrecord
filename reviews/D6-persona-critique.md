# Persona Critique — New Visit (D6)

**Mockup file:** `mockups/D6NewVisitScreen.tsx`
**Variants evaluated:** Empty, HasNote, HasScan, Offline, NoConsent, Saving (6 total)
**Date:** 2026-02-25
**Agent:** Persona Critic Panel (agent-persona-critic.md)

---

```
PERSONA CRITIQUE — New Visit (D6)

═══════════════════════════════════════════════════════════════

DR. RAMAKANT SINHA (Reluctant Doctor — 58, Mau UP)
Score: 3.5/5

First impression:
  The large orange "Scan a Document" button is the first thing he sees.
  He understands the binary choice immediately: scan a paper or type a note.
  This matches his mental model — it's like asking "do you want to write
  something down or photograph it?"

Would be confused by:
  1. The disabled "Save Visit" button gives no feedback when tapped. He will
     press it, nothing will happen, and he will assume the app is broken. He
     has no way to know it requires a note or scan first. There is no inline
     hint text, no tooltip, no haptic pulse — just silence.
  2. "Chief Complaint" as a section label. After 25 years, he knows the term,
     but it sounds like a mandatory form field. The "(Optional)" placeholder
     inside the text box is too subtle — it's only visible if he taps in.
     Section-level "(optional)" label would be clearer.
  3. The date pill's tappability. The chevron (›) alone is a weak affordance.
     He may read the date as a display label, not a control. He will only
     discover it is tappable by accident.
  4. The NoConsent variant. The phrase "implicit consent request" is software
     language, not clinic language. He will not parse it on a busy morning.

Would like:
  1. The scan-or-note binary — no ambiguity about what to do, no extra options.
  2. Patient name + mobile in the header — always knows whose visit he is on.
  3. That Save becomes active the moment he types. Natural, immediate feedback.
  4. The offline banner — reassures him that device failure won't lose the visit.
  5. The scan-first hierarchy. He hands the phone to Sunita, she taps the orange
     button, they are done. This is faster than handing her a notepad.

Change request:
  - MUST FIX: Disabled "Save Visit" must show an inline message when tapped:
    "Add a scan or note first." Silent disabled buttons are dead ends.
  - SHOULD FIX: Chief complaint section label should read
    "Chief Complaint (optional)" at label level, not just in placeholder.
  - SHOULD FIX: Date pill needs a "Change" text label next to the chevron.
    Icon + chevron alone is ambiguous for first-time users.
  - SHOULD FIX: NoConsent notice language: replace "implicit consent request"
    with plain text: "This patient hasn't shared records yet. You can still
    save this visit — they will be notified."

═══════════════════════════════════════════════════════════════

DR. PRIYA NAIR (Tech-Savvy Doctor — 32, Coimbatore)
Score: 3.8/5

First impression:
  Clean hierarchy. Scan primary, note secondary. She immediately approves
  the orange CTA and notices the scan-demotes-to-secondary pattern in the
  HasNote variant (scanCtaSecondary). She will clock the char counter on the
  note field (246/2000) and appreciate it.

Would be confused by:
  1. No clinic attribution in the header. She works in a multi-doctor clinic.
     The header shows patient name but not which clinic or doctor this visit is
     attributed to. If she rotates between two clinic locations, which one does
     this visit appear under?
  2. The NoConsent variant shows Save permanently disabled. The mockup does not
     include a "HasNote + NoConsent" state to demonstrate that consent does not
     block saving. She may read the NoConsent variant as "Save is blocked by
     consent" — contradicting the spec rule that "New Visit is always available."
  3. No visit type or category field. She tracks follow-up vs. first-visit
     vs. referral for her outcome spreadsheets. This field is absent.
  4. No draft/autosave signal. If she steps out mid-visit, does the partially
     typed note survive navigating away? The mockup offers no indication.

Would like:
  1. The scan-demotes-to-secondary pattern when a note is present (Variant 2).
     Intelligent hierarchy — she has seen this in better-designed medical apps.
  2. The char counter on the note field.
  3. The Saving variant (6) — prevents double-submit on a busy Friday afternoon.
  4. The "Add Another Scan" affordance in HasScan variant.

Change request:
  - SHOULD FIX: Add clinic name or doctor attribution line to the header
    (especially important for multi-doctor clinics).
  - MUST FIX (design communication): The NoConsent variant must include a
    has-record sub-state (or a clear annotation) to confirm that Save becomes
    active once a record is added, regardless of consent status. As-drawn, a
    live builder could misread this and implement Save as permanently blocked
    when consent is absent — a spec violation.
  - NICE TO HAVE: Visit type selector (First Visit / Follow-Up / Referral).
    Not in v1 spec, but flag for product discussion.
  - NICE TO HAVE: Draft autosave — "Draft saved" toast when navigating away
    mid-entry.

═══════════════════════════════════════════════════════════════

SUNITA — Balancer / Clinic Staff (34, Nashik)
Score: 3.5/5

First impression:
  She opens D6 on behalf of the doctor (he is with a patient). She sees the
  big orange button immediately. One tap, camera opens. She is done in 20
  seconds. This is exactly the workflow she needs.

Would be confused by:
  1. The "Remove scan" (✕) touch target is 36×36px (scanThumbRemove style).
     This is below the 44×44px WCAG AA minimum and below the project spec of
     48×48px minimum. She uses this screen quickly, often one-handed, sometimes
     while holding a paper. She will miss the target and accidentally tap the
     thumbnail or the label instead.
  2. She cannot pre-scan before the doctor opens a visit. D6 requires the
     doctor to have tapped "New Visit" on D3 first. In a busy clinic, the
     doctor is seeing a patient while she is at the counter. This is a workflow
     gap — she wants to scan the prescription while the patient is still at
     the window, before the doctor has finished the previous visit.
     (Note: this is a system design gap, not a D6 design fault — flagging for
     product tracking.)
  3. The consent notice body: "The patient will be notified on their next app
     open." What if the patient does not have the app? She will be asked this
     by patients, and the screen offers no answer.
  4. The "OR" divider between scan and note. She knows she should not type
     clinical notes — that is the doctor's job. The OR structure implies she
     could type a note, which may create confusion about whose responsibility
     it is.

Would like:
  1. The orange button — obvious, large, exactly where she expects it.
  2. "Prescription, test report, X-ray…" hint text — tells her what is
     appropriate to scan.
  3. The "☁ Pending sync" offline indicator on the scan thumbnail —
     reassures her the scan is not lost.
  4. Patient name in the header — she will always double-check before saving.

Change request:
  - MUST FIX: scanThumbRemove touch target must be ≥ 48×48px (currently 36×36).
    Use hitSlop or enlarge the tap area.
  - SHOULD FIX: Consent notice should add: "If the patient doesn't have the
    app, ask them to download it or request consent in person." One sentence
    gives Sunita an answer for patients at the counter.
  - NICE TO HAVE: Pre-visit scan queue — allow scanning before a visit is
    opened, then attach to the visit when the doctor opens it. (Product
    roadmap item, not D6 scope.)

═══════════════════════════════════════════════════════════════

SHANTABAI KADAM (Elderly Patient — 71, Satara)
Score: 3.5/5

Note: Shantabai never uses D6 directly. It is a doctor-facing screen.
Her score reflects how well the screen protects her interests as a patient
whose records are being created on this screen.

First impression (proxy):
  If the doctor briefly shows her the screen — e.g. to show the date of the
  visit — she would see a clean, uncluttered layout. The large orange button
  and the "New Visit" header are non-threatening.

Would be confused by (proxy):
  1. The consent notice: "Consent not yet established. This visit will create
     an implicit consent request." If the doctor explains this to her, she
     will not understand "implicit consent request." She may become anxious:
     "Does the doctor need my permission? Am I in trouble?"
  2. "The patient will be notified on their next app open." She does not know
     what "app open" means. She may not have the app.

Would like (proxy):
  1. Her name is visible in the header — her records are clearly attributed to
     her, not accidentally mixed with another patient.
  2. The scan thumbnail showing "✓ Saved locally" — if someone explains it,
     she understands her prescription is safely kept.
  3. The offline indicator — her rural doctor's clinic has patchy connectivity.
     Knowing the record saves offline is important for her care continuity.

Change request:
  - SHOULD FIX: Consent notice language must be plain enough to read aloud to
    a patient: "This patient's permission for sharing records hasn't been set
    up yet. This visit will be saved, and they will be asked to approve
    sharing later." No jargon.

═══════════════════════════════════════════════════════════════

ARJUN MEHTA (Semi-Savvy Patient — 38, Bhopal)
Score: 3.0/5

Note: Like Shantabai, Arjun does not use D6. His score reflects how well the
screen handles his data privacy interests.

First impression (proxy):
  Arjun would not see this screen. But if he ever reads the consent notice
  (e.g. doctor briefly tilts the screen), he will notice: the doctor can
  create a visit record about him WITHOUT his explicit approval.

Would be confused by:
  1. The consent notice says "implicit consent request" — he doesn't know what
     this means. More critically: he is privacy-conscious and will worry that
     a doctor recorded a visit about him without asking first.
  2. "The patient will be notified on their next app open." He wants to know
     immediately, not the next time he opens the app. Delay feels like a
     privacy gap.
  3. There is no way for him to opt out of a visit record being created. Once
     the doctor taps "Save Visit," a record exists regardless of his consent
     state. This is by design (doctors must be able to document care), but it
     is not explained to him anywhere.

Would like (proxy):
  1. Clear, plain-language explanation of what "consent not yet established"
     means for him as the patient.
  2. An indication that he will be notified soon — not just "next app open."

Change request:
  - SHOULD FIX: Consent notice body text — rewrite for plain language.
    Current: "This visit will create an implicit consent request. The patient
    will be notified on their next app open."
    Proposed: "This patient hasn't set up record sharing yet. This visit will
    be saved to your device. They will be asked to approve sharing the next
    time they open the app."
  - NICE TO HAVE: Doctor-facing note explaining that patients receive a
    consent prompt after the visit saves — gives doctors a clear script to
    explain the model to privacy-conscious patients like Arjun.

═══════════════════════════════════════════════════════════════

─────────────────────────────────────────────────────────────
WEIGHTED AVERAGE: 3.46/5

Scoring breakdown:
  Dr. Sinha (Reluctant Doctor)    3.5/5
  Dr. Nair (Tech-Savvy Doctor)    3.8/5
  Sunita (Staff / Balancer)       3.5/5
  Shantabai (Elderly Patient)     3.5/5  [proxy]
  Arjun (Semi-Savvy Patient)      3.0/5  [proxy]

  Unweighted mean: (3.5 + 3.8 + 3.5 + 3.5 + 3.0) / 5 = 3.46/5

─────────────────────────────────────────────────────────────

MUST FIX:
- Disabled "Save Visit" button gives no feedback on tap — silent failure
  confuses first-time users (especially Dr. Sinha). Add inline hint text
  below the button: "Add a scan or note to save this visit."
  Flagged by: Dr. Sinha. Risk: Users abandon the screen thinking it is frozen.

- scanThumbRemove touch target is 36×36px — below spec minimum of 48×48px
  and WCAG AA minimum of 44×44px. Sunita uses this one-handed under time
  pressure. This will cause mis-taps.
  Flagged by: Sunita. Source: ui-ux-spec.md touch target requirement.

- D6NewVisitNoConsent variant shows Save permanently disabled — a live
  builder reading only this variant could implement Save as blocked-by-consent,
  violating the spec rule that "New Visit is always available." The mockup
  must include a HasNote+NoConsent sub-state, or an annotation clearly
  marking that Save is disabled only because no record has been added (not
  because of consent status).
  Flagged by: Dr. Nair. Risk: Spec violation introduced during live build.

SHOULD FIX:
- Chief complaint section label needs "(optional)" at label level, not just
  in placeholder text. Placeholder is invisible until tapped.
  Flagged by: Dr. Sinha.

- Date pill tappability — chevron alone is insufficient affordance for
  reluctant tech users. Add "Change" text label or a more explicit calendar
  button.
  Flagged by: Dr. Sinha.

- Consent notice language throughout — "implicit consent request" and
  "next app open" are jargon. Rewrite in plain language for doctors to read
  aloud to patients. See Arjun's proposed rewording above.
  Flagged by: Dr. Sinha, Shantabai (proxy), Arjun (proxy).

- No clinic attribution in header — in multi-doctor clinics, the visit must
  show which clinic it will be filed under. Header currently shows only
  patient name and mobile.
  Flagged by: Dr. Nair.

NICE TO HAVE:
- Visit type / category (First Visit / Follow-Up / Referral) — useful for
  outcome tracking but not in v1 spec. Raise with product before D6 live build.
  Flagged by: Dr. Nair.

- Draft autosave indicator — show "Draft saved" when navigating away
  mid-entry. Reduces anxiety for doctors called away suddenly.
  Flagged by: Dr. Nair.

- Pre-visit scan queue — Sunita wants to scan before the doctor opens the
  visit. Structural product gap, not a D6 fix.
  Flagged by: Sunita.

- Doctor-facing note explaining that the patient will receive a consent
  prompt — gives doctors a script for privacy-aware patients.
  Flagged by: Arjun (proxy).

─────────────────────────────────────────────────────────────

BALANCER VERDICT: Revise and re-evaluate

RATIONALE: The core design is strong — the scan-first hierarchy, binary
scan/note choice, and patient-name-in-header are all correct decisions that
serve the primary user (the doctor) well. The weighted average of 3.46 falls
just below the ≥ 3.5 threshold to proceed without revision. Three MUST FIX
items must be addressed before the live build begins: the silent disabled
button, the undersized remove target, and the NoConsent variant's ambiguity.
The consent notice language rewrites are a secondary priority but affect
staff and patient trust. None of these require a redesign — all are
targeted fixes to the existing layout.
```

---

## Issues for project-state.md Debt Tracking

### MUST FIX — D6 mockup (fix before live build begins)

| ID | Item | Source |
|---|---|---|
| D6-M-1 | Disabled "Save Visit" button gives no tap feedback — add inline hint: "Add a scan or note to save this visit." | Persona critique — Dr. Sinha |
| D6-M-2 | `scanThumbRemove` touch target is 36×36px; must be ≥ 48×48px per spec | Persona critique — Sunita |
| D6-M-3 | `D6NewVisitNoConsent` variant does not show Save becoming active when a record is added — ambiguous; live builder may incorrectly block Save on consent state | Persona critique — Dr. Nair |

### SHOULD FIX — D6 mockup (fix before live build begins)

| ID | Item | Source |
|---|---|---|
| D6-S-1 | Chief complaint section label needs "(optional)" at label level, not just in placeholder | Persona critique — Dr. Sinha |
| D6-S-2 | Date pill tappability needs explicit "Change" label alongside chevron | Persona critique — Dr. Sinha |
| D6-S-3 | Consent notice language — "implicit consent request" and "next app open" are jargon; rewrite in plain language | Persona critique — Dr. Sinha, Arjun, Shantabai |
| D6-S-4 | Header missing clinic attribution — multi-doctor clinics need to know which clinic the visit is filed under | Persona critique — Dr. Nair |
