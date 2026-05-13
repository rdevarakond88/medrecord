# PM Review — Pre-Flight: D8 Full Scan View vs. P1–P5 Patient App

**Date:** 2026-05-12
**Agent:** PM Agent — Moment 1 (Pre-Flow Gate)
**Question:** Should D8 (Full Scan View) or P1–P5 (Patient App) be built next?

---

## Decision

**PROCEED: Build D8 first, then open P1 flow.**

---

## Reasoning

1. **D8 closes an open dead-end in the live product.**
   D7 (scanner) → D4 (visit detail) → "View Full Scan" → D8 (not built).
   Any doctor in a pilot clinic who taps "View Full Scan" hits a dead end today.
   That is an uninstall risk. Fix it before putting the app in front of anyone.

2. **D8 is small and bounded** — 1–2 Builder sessions. The patient app is a full
   new flow (P1 → P2 → P3 → P4) requiring PM pre-flight, persona critique, security,
   QA, and device testing on each screen. Do not open a large new workstream while
   one quick close-out item sits unfinished.

3. **The patient app deserves its own clean pre-flight.** P2 (patient timeline) is
   the patient's core experience — elderly-friendly design, read-only consent gating,
   and DPDP audit coverage. It needs focused planning, not a rushed start.

4. **D8 has no new backend dependency.** Images are stored on device filesystem
   (S3 deferred to v2). D8 reads from device filesystem + SQLite only. No blocking risk.

---

## Concerns

None that block D8.

---

## Regulatory Flags

- D8 displays scanned documents which may contain raw clinical text, patient name,
  or Aadhaar digits. The OCR sanitizer in D7 already strips 12-digit Aadhaar patterns.
  The Builder must confirm the full-scan view displays sanitized OCR text, not raw
  extracted text.

---

## Market Reality Notes

- D8 screen time per doctor will be short — they glance at a scan, not read it at
  length. Keep the UI minimal: image dominant, OCR text collapsible below.
  Do not fill the screen with controls.
- Elderly patients are the primary consumers of scans (via P3 later). D8 and P3
  will likely share the same image viewer component. Plan for that reuse in the
  D8 Builder session so P3 does not duplicate it.

---

## Next Steps

1. **Builder Agent — D8 Full Scan View** (mockup first, then wire, then security/QA/device test)
2. After D8 is device-tested and merged: **PM pre-flight for P1–P5 Patient App** as a separate session.
