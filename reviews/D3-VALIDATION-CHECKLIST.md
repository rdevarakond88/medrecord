# D3 — Patient Detail / History
## Validation Checklist

Created before build starts. Every item must be confirmed or explicitly deferred with a written reason before D3 is called done.

**Template source:** D2-VALIDATION-CHECKLIST.md + LESSONS-AND-RUNBOOK.md

### How to Use This Checklist
- ✅ Confirmed — tested and verified working
- 🔶 Deferred — explicitly deferred with reason written below
- 🔴 Blocked — cannot proceed; must fix before moving forward
- Blank = not yet tested

---

## Section 1 — Visual Layout (Web Preview Testable)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Header displays patient name correctly | | |
| 2 | Header displays mobile number (last 5 digits only — PII rule from D2 debt) | | |
| 3 | Header displays age if available; gracefully absent if not | | |
| 4 | Consent badge shows green "Access Granted" when consent is true | | |
| 5 | Consent badge shows amber "Pending Consent" when consent is false | | |
| 6 | "New Visit" button is full width, blue, always visible regardless of consent state | | |
| 7 | Visit cards show: date, chief complaint (if available), clinic name, record count | | |
| 8 | Visit cards look clean when chief complaint is absent — no broken/empty field visible | | |
| 9 | Visit list is ordered newest first | | |
| 10 | Empty state shows "No previous records. Start the first visit." — not a broken/blank screen | | |
| 11 | When consent is false: visit history is visually grayed out | | |
| 12 | When consent is false: a clear message explains why history is grayed (e.g. "Request patient consent to view history") | | |
| 13 | Offline banner visible when device has no connection (amber dot + message) | | |
| 14 | All touch targets minimum 48×48px | | |
| 15 | All text passes 4.5:1 contrast ratio | | |
| 16 | Colour palette matches ui-ux-spec.md exactly (Primary Blue #1A6DB5, etc.) | | |
| 17 | Font is Inter; sizes follow spec scale | | |

---

## Section 2 — Interaction Behaviour (Real Device / Expo Go Required)

| # | Item | Status | Notes |
|---|---|---|---|
| 18 | Tapping a visit card expands inline preview of first record | | |
| 19 | Tapping expanded card again (or "View Full Visit") navigates to D4 | | |
| 20 | Double-tap on visit card does not push two D4 screens onto the stack (tap-guard) | | |
| 21 | "New Visit" button navigates to D6 | | |
| 22 | "New Visit" button works even when consent is false (creates implicit consent request) | | |
| 23 | Back navigation returns correctly to D2 | | |
| 24 | Inline expand is smooth — no visible lag or jump on tap | | |
| 25 | Screen scrolls correctly when visit list is long (10+ visits) | | |

---

## Section 3 — Data Loading & States (Real Device / Expo Go Required)

| # | Item | Status | Notes |
|---|---|---|---|
| 26 | Patient header renders immediately from nav params passed by D2 (no waiting for API) | | |
| 27 | Visit list shows loading state while fetching (skeleton or spinner) | | |
| 28 | Visit list renders correctly once data loads | | |
| 29 | Error state shown if visit list fetch fails (not a blank screen) | | |
| 30 | Offline: patient header still visible (from nav params — no network needed) | | |
| 31 | Offline: last-synced visit list shown from SQLite cache | | |
| 32 | Offline: visit list shows "last synced [time]" or offline indicator — doctor knows data may not be current | | |
| 33 | Empty state shown correctly for a patient with zero visits (not an error or blank) | | |
| 34 | Visit cards with 1 record and 5+ records both display record count correctly | | |

---

## Section 4 — Consent Logic (Real Device / Expo Go Required)

| # | Item | Status | Notes |
|---|---|---|---|
| 35 | consentGranted nav param received correctly from D2 | | |
| 36 | D3 re-fetches fresh consent status from server on open (not relying solely on nav param) | | |
| 37 | If nav param says consent granted but server says revoked — server value wins | | |
| 38 | If consent false: visit history grayed out, "New Visit" still active | | |
| 39 | If consent false: "Request Access" button or equivalent visible and tappable | | |
| 40 | If consent false: tapping "Request Access" initiates D9 consent flow | | |
| 41 | Patient with records from other doctors but no consent to current doctor — shows history exists but grayed, not empty state | | |
| 42 | Brand new patient (no records anywhere) — shows correct empty state, not grayed consent state | | |

---

## Section 5 — Security (Real Device / Expo Go Required)

| # | Item | Status | Notes |
|---|---|---|---|
| 43 | Auth guard: if token or user is null, screen renders nothing and redirects to Login | | |
| 44 | Doctor A cannot see visit records created by Doctor B without consent — verified with test data | | |
| 45 | Patient mobile number shown as last 5 digits only in header (full number only after consent) | | |
| 46 | Consent check is server-side — client-side consent state alone does not grant access to records | | |
| 47 | No patient PII appears in any console log or error message | | |
| 48 | Screen does not cache another doctor's patient data in SQLite after logout | | |

---

## Section 6 — Navigation & Integration

| # | Item | Status | Notes |
|---|---|---|---|
| 49 | D2 → D3 navigation passes correct patient ID and consentGranted in nav params | | |
| 50 | D3 → D6 ("New Visit") passes correct patient ID | | |
| 51 | D3 → D4 (visit card tap) passes correct visit ID | | |
| 52 | D3 → D9 (Request Access) passes correct patient ID | | |
| 53 | If patient ID in nav params is missing or malformed — screen shows error, does not crash | | |

---

## Section 7 — Performance

| # | Item | Status | Notes |
|---|---|---|---|
| 54 | Header renders in under 1 second (from nav params, no API wait) | | |
| 55 | Visit list with 20+ visits does not cause visible lag on scroll | | |
| 56 | Inline expand on tap responds within 300ms | | |
| 57 | No unnecessary re-renders when consent state unchanged | | |

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
| **D3 is DONE** | | |

---

## The Three Questions (from LESSONS-AND-RUNBOOK.md)

Before calling D3 done, answer yes to all three:

1. Does this checklist have zero blank rows?
2. Have logic and security fixes been verified on real device — not just web preview?
3. Is project-state.md a clean snapshot with D3 marked complete?
