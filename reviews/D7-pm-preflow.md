# PM REVIEW — Pre-Flight: D7 Document Scanner
_Date: 2026-03-04_

---

## PROCEED: Yes with changes

---

## CONCERNS (if any):

- **D6 MEDIUM-3 is an open debt item waiting on D7** — Scans attached in D6 are silently dropped on save (`insertLocalVisit()` has no scan parameters; `enqueueOperation` payload does not include scan data). Building D7 must include integration with D6's scan attachment flow to close this debt. Do not treat D7 as a standalone screen — it closes an open security finding. The builder must wire the full path: D7 capture → image stored locally → `localPath` + `label` written to `visits_draft` → included in `enqueueOperation` payload.

- **Local filesystem storage is not doctor-scoped** — Images are stored on the device filesystem for v1 (S3 deferred to v2 — locked decision). Unlike SQLite, the filesystem is not automatically cleared by `useLogout`. On shared clinic devices, a doctor who logs out leaves scan images on-disk accessible to whoever picks up the phone next. Fix: store scan images under a doctor-scoped path (e.g., `<FileSystem.documentDirectory>/<doctorId>/scans/<uuid>.jpg`). On logout, delete the directory for the outgoing doctor. One function call, not an architectural change.

- **OCR output can capture Aadhaar numbers in plain text** — Indian medical documents (government hospital discharge summaries, some lab reports) sometimes include the patient's Aadhaar number on the printed page. If OCR extracts that text and stores it in SQLite, it violates the locked decision: "Aadhaar stored as SHA-256 hash only." The OCR text storage layer must strip detected Aadhaar patterns (any 12-digit sequence matching the Aadhaar format: `\d{4}\s?\d{4}\s?\d{4}`) before writing to the database. This is a regex strip at the write boundary, not an architectural concern.

---

## REGULATORY FLAGS (if any):

- **DPDP Act — local image storage without scoping** — Scan images are sensitive health data. Local filesystem storage without doctor-scoping is a data minimisation violation risk. Addressed in Concerns above. The fix is the doctor-scoped directory path + logout cleanup. No architectural change required.

- **DPDP Act — OCR text as derived sensitive data** — OCR output from a medical document is itself sensitive personal data. It must be treated with the same protections as the visit record it belongs to: stored in SQLite under the same `visits_draft` row, cleared on logout via `clearDoctorDraftVisits()`, and never logged. The OCR text field is not a new data class — it is a field within an existing protected record. No new consent flow required. Confirm the schema treats it as such before the build begins.

- **UIDAI — Aadhaar in OCR output** — Flagged above in Concerns. Strip before write. This is not optional.

---

## MARKET REALITY NOTES (if any):

- **Staff, not doctors, will operate the scanner in most clinics** — In a 40–80 patient/day semi-urban clinic, the compounder or receptionist scans lab reports while the doctor is already seeing the next patient. The guide rectangle overlay (already in spec) is the right choice. Keep the capture screen to a single tap. Zero configuration at scan time.

- **Handwritten prescriptions are common and OCR accuracy will be low** — Indian doctors' handwriting is famously difficult even for humans. Google Vision API is the correct primary OCR choice (already locked), but set internal expectations: the image is the authoritative record, OCR text is augmentation and search aid only. The D8 spec already models this correctly ("Text extraction failed — view image" is a first-class state, not an error). Ensure D7 does not present OCR accuracy as a feature during capture — the UI should promise nothing about text quality until D8.

- **"Use Photo Library" path is essential, not optional** — A significant share of Indian patients already photograph their lab reports and X-ray films before arriving at the clinic. This path (already in the spec) prevents a friction point where the doctor has to ask the patient to show the phone and then scan it. Keep it visible and not buried.

- **Exposure indicator constraint is confirmed correct** — Clinic lighting in semi-urban India is inconsistent: harsh tube lights, outside daylight from open doors, ceiling fans casting shadows. The constraint requiring a simple exposure/readability indicator (too dark / good / overexposed) before capture is the right call. Do not scope-creep this into a full camera SDK feature — a simple ambient light check and overlay colour change is sufficient.

- **Auto-capture deferral to v2 is correct** — Under inconsistent lighting and with low-end Android camera hardware, auto-capture false-triggers or misses the document edge. Manual tap-to-capture is slower by 1–2 seconds and more reliable by a large margin. Staff will not forgive a screen that captures a blurry or mis-framed image silently. Locked decision confirmed correct.

---

## Summary for Builder

Three required changes before build begins:

1. **Doctor-scope the local image directory path and add logout cleanup.** One function. Non-negotiable for DPDP compliance and shared-device safety.

2. **Strip Aadhaar-format digit sequences from OCR output before writing to SQLite.** One regex at the storage boundary. Non-negotiable per UIDAI and locked decision.

3. **D7 must close D6 MEDIUM-3 — wire the full scan → visits_draft → enqueueOperation path.** D7 is not done until scans survive a save cycle in D6.

Everything else in the spec is correctly designed for this market. Proceed.
