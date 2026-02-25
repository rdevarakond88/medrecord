# D6 — New Visit
## Validation Checklist

Created before build starts. Every item must be confirmed or explicitly deferred with a written reason before D6 is called done.

**Template source:** D3-VALIDATION-CHECKLIST.md + LESSONS-AND-RUNBOOK.md

### How to Use This Checklist
- ✅ Confirmed — tested and verified working
- 🔶 Deferred — explicitly deferred with reason written below
- 🔴 Blocked — cannot proceed; must fix before moving forward
- Blank = not yet tested

---

## Section 1 — Visual Layout (Web Preview Testable)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Visit date shown prominently in DD/MM/YYYY format | | |
| 2 | Visit date is tappable (distinct affordance — not plain text) | | |
| 3 | Chief complaint field present with placeholder "Why did patient visit? (Optional)" | | |
| 4 | Chief complaint is visually labeled as optional — not a required field | | |
| 5 | Orange camera button "Scan a Document" displayed large and centred (primary CTA) | | |
| 6 | Text note area present with placeholder "Or type a note..." | | |
| 7 | Camera button and note area are visually distinct — two clear, mutually non-exclusive paths | | |
| 8 | "Save Visit" button is full width | | |
| 9 | "Save Visit" button is visually disabled (greyed) when no record has been added | | |
| 10 | "Save Visit" button becomes active (blue) once a note is typed or scan is attached | | |
| 11 | Scan thumbnail shown in record zone when scan is attached | | |
| 12 | Scan thumbnail includes an unsynced cloud icon when device is offline | | |
| 13 | Offline banner visible when device has no connection (amber dot + message) | | |
| 14 | "Consent not yet established" notice visible when doctor opened D6 without prior consent | | |
| 15 | Consent notice does not block the Save Visit action — doctor can still save | | |
| 16 | All touch targets minimum 48×48px (camera button, Save, date, chief complaint) | | |
| 17 | All text passes 4.5:1 contrast ratio | | |
| 18 | Colour palette matches ui-ux-spec.md exactly (Orange #EA580C for scan CTA, Blue #1A6DB5 for Save) | | |
| 19 | Font is Inter; sizes follow spec scale | | |
| 20 | Patient name / context visible in header so doctor is sure whose visit they are creating | | |

---

## Section 2 — Interaction Behaviour (Real Device / Expo Go Required)

| # | Item | Status | Notes |
|---|---|---|---|
| 21 | Tapping camera button navigates to D7 (Document Scanner) | | |
| 22 | Typing in the note area activates the "Save Visit" button | | |
| 23 | Deleting all typed text deactivates the "Save Visit" button again (returns to disabled) | | |
| 24 | Chief complaint field is skippable — Save works without it | | |
| 25 | Chief complaint field is skippable even when scan is attached | | |
| 26 | Tapping the date opens a date picker or inline date selector | | |
| 27 | Date picker defaults to today; past dates selectable; future dates blocked | | |
| 28 | "Save Visit" tap triggers save and returns to D3 with new visit in list | | |
| 29 | Double-tap on "Save Visit" does not create two duplicate visit records (tap-guard) | | |
| 30 | Back navigation from D6 (before saving) does not create an orphan/draft visit record | | |
| 31 | Back navigation prompts a discard confirmation if note has been typed (prevents accidental loss) | | |
| 32 | Keyboard dismiss on tap outside note area does not lose typed content | | |
| 33 | Screen can be reached via 3 taps from D3 and reach a submittable state — ≤60-second goal (per project-state.md constraint) | | |

---

## Section 3 — Data States (Real Device / Expo Go Required)

| # | Item | Status | Notes |
|---|---|---|---|
| 34 | Empty state: no note, no scan — Save disabled | | |
| 35 | Has-note state: note typed — Save active | | |
| 36 | Has-scan state: thumbnail shown, Save active | | |
| 37 | Has-note-and-scan state: both shown, Save active | | |
| 38 | Saving in progress: spinner shown, Save button non-interactive (prevents double-submit) | | |
| 39 | Save success: navigates to D3; new visit appears at top of visit list | | |
| 40 | Save error: error banner shown — not a silent fail; doctor can retry | | |
| 41 | Offline save: SQLite write first; visit appears immediately in D3 offline cache; cloud icon indicates unsynced | | |
| 42 | D3 visit list refreshes on return — new visit visible without navigate-away-and-back | | |

---

## Section 4 — Consent Logic (Real Device / Expo Go Required)

| # | Item | Status | Notes |
|---|---|---|---|
| 43 | Mockup includes an explicit "consent not yet established" state variant (per project-state.md D6 constraint) | | |
| 44 | Consent state is passed from D3 nav params and displayed in D6 | | |
| 45 | "Consent not yet established" notice is informational only — does not block record creation | | |
| 46 | Creating a visit without consent creates an implicit consent request (per D3 spec) — stub is acceptable in v1, but the data model must support it | | |
| 47 | If consent is granted, no consent notice is shown — clean default state | | |

---

## Section 5 — Security (Real Device / Expo Go Required)

| # | Item | Status | Notes |
|---|---|---|---|
| 48 | Auth guard: if token or user is null, screen renders nothing and redirects to Login | | |
| 49 | Patient ID from nav params validated — screen shows error, does not crash if missing or malformed | | |
| 50 | Visit is always scoped to the authenticated doctor's ID — not a generic unscoped insert | | |
| 51 | Note text is not logged to console — no PII in logs | | |
| 52 | SQLite write happens before any server call — visit never lost if server unreachable | | |
| 53 | Local visit record includes doctor_id and patient_id — cannot be misattributed across logout/login cycle | | |
| 54 | Draft visit (unsaved) discarded cleanly on back navigation — no half-written record persists | | |

---

## Section 6 — Navigation & Integration

| # | Item | Status | Notes |
|---|---|---|---|
| 55 | D3 → D6 nav params include correct patient ID (and consent state) | | |
| 56 | D6 → D7 (camera tap) passes patientId and visitId context so scan is associated correctly | | |
| 57 | D7 → D6 returns correctly with scan thumbnail and the note area is still intact | | |
| 58 | D6 → D3 after Save passes signal for list refresh (or uses useFocusEffect on D3 to re-fetch) | | |
| 59 | If D7 is cancelled (no scan taken), D6 returns to previous state without data loss | | |
| 60 | If D6 route is missing or patient ID absent — safe error state, no crash | | |

---

## Section 7 — Performance

| # | Item | Status | Notes |
|---|---|---|---|
| 61 | D6 screen loads in under 1 second from D3 tap | | |
| 62 | Note input is responsive — no lag on typing on low-end Android (2GB RAM target) | | |
| 63 | Camera button tap → D7 launch within 300ms | | |
| 64 | "Save Visit" SQLite write completes in under 2 seconds | | |
| 65 | ≤3 taps from D3 entry to submittable state — measured and confirmed | | |

---

## Deferred Items Log

Any item marked 🔶 must have a written reason here.

| Checklist # | Item | Reason for Deferral | Fix By | Sign-Off |
|---|---|---|---|---|
| | | | | |

---

## Gate

| Gate | Confirmed By | Date |
|---|---|---|
| Visual layout approved (Section 1) | | |
| Persona critique score ≥ 3.5 | | |
| Security agent: no CRITICAL or HIGH findings | | |
| QA agent: no CRITICAL bugs | | |
| All checklist items confirmed or deferred with reason | | |
| project-state.md updated as clean snapshot | | |
| Committed and pushed to GitHub | | |
| **D6 is DONE** | | |

---

## The Three Questions (from LESSONS-AND-RUNBOOK.md)

Before calling D6 done, answer yes to all three:

1. Does this checklist have zero blank rows?
2. Have logic and security fixes been verified on real device — not just web preview?
3. Is project-state.md a clean snapshot with D6 marked complete?
