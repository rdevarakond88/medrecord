# PM REVIEW — Pre-Flight: D4 (Visit Detail)
_Date: 2026-04-12_

## PROCEED: Yes

---

## CONCERNS

- **Consent gate must carry into D4 explicitly** — D3 hides `chief_complaint`
  on other-doctor visit cards when `consent_granted=false`. D4 is the full
  view of that same visit. The Builder must receive this constraint in the
  session prompt: if the visit belongs to another doctor and `consent_granted`
  is false, `chief_complaint` must not render in D4 either. It is not implicit
  from D3's behavior.
  **Fix:** Add this as a build constraint to D4's Builder prompt, mirroring
  the D3-H-1 / consent-layer-spec language.

- **D8 (Full Scan View) is not started** — D4 will show scan records but cannot
  navigate to D8. Stubs are fine. But the Builder must render a scan list
  section with a clear "View Scan" stub (not omit scans entirely). Omitting
  it creates a screen that has to be reworked when D8 is built.
  **Fix:** Include scan list section in D4 with disabled/stub "View Scan" tap
  target, matching the pattern D3 used for "View Full Visit" before D4.

---

## REGULATORY FLAGS

- **DPDP audit event:** D3 fires `consent_accessed` on the visit list. D4 —
  viewing a specific other-doctor visit — should fire a more granular
  `visit_viewed` audit event (with `visit_id`, no patient PII). Flag this for
  the Security agent to verify after build; the Builder should stub it in.

---

## MARKET REALITY NOTES

- **Content order matters under time pressure:** Chief complaint and typed notes
  must be at the top of the screen, above scans. A doctor opening a prior
  visit mid-consultation has ~15 seconds. If they have to scroll past a loading
  scan list to find the clinical note, they will stop using this screen.
  **Fix:** Builder spec should state — notes and chief complaint section first,
  scans section below.

- **Scan images must not block the screen render:** If scans are attached and
  the network is slow, the screen cannot hang waiting for image loads.
  **Fix:** Scan thumbnails load asynchronously with a placeholder; text content
  (chief_complaint, notes) renders immediately from SQLite cache.

---

## SUMMARY

No blockers. Two constraints to carry into the Builder prompt:
1. Consent gate on `chief_complaint` (same rule as D3 — must be stated explicitly)
2. Scan section: stub navigation to D8, non-blocking async render
