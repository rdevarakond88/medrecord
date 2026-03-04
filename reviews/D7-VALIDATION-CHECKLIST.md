# D7 — Document Scanner
## Validation Checklist

Created before build starts. Every item must be confirmed or explicitly deferred with a written reason before D7 is called done.

**Source files:** `docs/ui-ux-spec.md` (D7 section) · `docs/project-state.md` (D7 constraints) · `LESSONS-AND-RUNBOOK.md` (Rules 7, 9, 10, 11, 12) · `reviews/D7-pm-preflow.md`

### How to Use This Checklist

- ✅ Confirmed — tested and verified working
- 🔶 Deferred — explicitly deferred with reason written below
- 🔴 Blocked — cannot proceed; must fix before moving forward
- `[DEVICE]` — can only be confirmed on a real device via Expo Go; simulator/web preview is insufficient
- Blank = not yet tested

### Three PM Pre-Flow Requirements (must be confirmed before D7 is called done)

| PM Req | Requirement | Item(s) |
|---|---|---|
| PM REQ 1 | Doctor-scope local image directory + logout cleanup | #41, #42, #55, #56 |
| PM REQ 2 | Strip Aadhaar-format digit sequences from OCR output before SQLite write | #45, #46 |
| PM REQ 3 | Wire full scan → visits_draft → enqueueOperation path (closes D6 MEDIUM-3) | #43, #44, #63, #64, #65 |

---

## Section 1 — Visual Layout

_States to verify: viewfinder (camera live), preview (after capture), processing (after "Use This")._

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Full-screen camera viewfinder fills entire usable screen — no dead zones or unintended white margins | [DEVICE] | |
| 2 | Document edge detection rectangle guide overlay visible on viewfinder | [DEVICE] | |
| 3 | Guide rectangle is visually distinct against any background — white/bright border with corner brackets; not just opacity | [DEVICE] | |
| 4 | Capture button is large (minimum 64×64px), centred at bottom of viewfinder, and unobscured by overlay elements | [DEVICE] | |
| 5 | Capture button has `accessibilityLabel` set | | |
| 6 | "Use Photo Library" link is visible without scrolling from the viewfinder — not hidden below the fold | [DEVICE] | |
| 7 | Flash toggle button is visible in viewfinder corner with current state shown (off / on / auto) — not icon-only | [DEVICE] | |
| 8 | Exposure indicator visible above or adjacent to capture button before any photo is taken | [DEVICE] | |
| 9 | Exposure indicator has three visually distinct states: "Too Dark" · "Good" · "Overexposed" | [DEVICE] | |
| 10 | "Good" exposure state: green label or icon (success colour #16A34A per spec) | [DEVICE] | |
| 11 | "Too Dark" state: amber or red label (warning #D97706 or error #DC2626) | [DEVICE] | |
| 12 | "Overexposed" state: amber or red label — distinct from Good | [DEVICE] | |
| 13 | Exposure indicator does not overlap or obscure the guide rectangle or capture button | [DEVICE] | |
| 14 | After capture: image preview fills screen — no letterboxing or white gaps | [DEVICE] | |
| 15 | After capture: crop handles visible at edges of captured image | [DEVICE] | |
| 16 | After capture: "Use This" is the primary CTA — full width or prominently styled (blue #1A6DB5) | [DEVICE] | |
| 17 | After capture: "Retake" is visible as secondary action — not hidden, but clearly subordinate to "Use This" | [DEVICE] | |
| 18 | Crop handles have minimum 44×44px touch target — tappable without precision | [DEVICE] | |
| 19 | Processing state: loading indicator shown after "Use This" tapped — no silent processing | [DEVICE] | |
| 20 | Processing state: "Use This" button disabled or replaced with spinner — no double-capture possible | [DEVICE] | |
| 21 | Colour palette matches spec: Scan Orange #EA580C for capture CTA, Primary Blue #1A6DB5 for "Use This" | [DEVICE] | |
| 22 | All text and icon labels pass 4.5:1 contrast ratio on dark camera preview background — white labels on semi-transparent dark overlay | [DEVICE] | |

---

## Section 2 — Interaction Behaviour

| # | Item | Status | Notes |
|---|---|---|---|
| 23 | Single tap on capture button: takes a still image and transitions immediately to preview state | [DEVICE] | |
| 24 | Double-tap on capture button: does not capture two images — tap-guard (`useRef(false)`) prevents double-fire | [DEVICE] | |
| 25 | "Retake" from preview: returns to live viewfinder; previously captured image is not retained in state or on disk | [DEVICE] | |
| 26 | "Use This" from preview: triggers compression, saves to doctor-scoped local path, returns to calling screen with scan data | [DEVICE] | |
| 27 | "Use Photo Library" link: opens native image picker; selected image enters same preview → crop → "Use This" / "Retake" flow as camera capture | [DEVICE] | |
| 28 | Cancelling photo library picker without selecting: returns to D7 viewfinder with no state change, no orphan file | [DEVICE] | |
| 29 | Flash toggle: cycles through states (Off → On → Auto or Off ↔ On); persists within the D7 session | [DEVICE] | |
| 30 | Crop handles: dragging adjusts the crop region; "Use This" applies crop before saving to disk | [DEVICE] | |
| 31 | Back during viewfinder (before any capture): returns to caller immediately with no data written and no confirmation dialog | [DEVICE] | |
| 32 | Back during preview (after capture, before "Use This"): shows discard confirmation dialog — "Discard this scan?" with Discard / Keep editing options | [DEVICE] | |
| 33 | iOS swipe-back during preview state: triggers same discard confirmation as back button (via `navigation.addListener('beforeRemove')`) | [DEVICE] | |
| 34 | Android hardware back during preview state: triggers same discard confirmation | [DEVICE] | |
| 35 | "Use This" while offline: image saves locally, offline sync indicator shown, S3 upload queued — not blocked, no error shown | [DEVICE] | |
| 36 | OCR does not block the UI or delay return to D6 — async queue only; no spinner or wait state on D7 for OCR processing | [DEVICE] | |

---

## Section 3 — Exposure Indicator

_This section implements the project-state.md D7 constraint: "Include a simple exposure/readability indicator before capture (e.g. too dark / good / overexposed). Do not rely on OCR feedback — this is basic camera exposure feedback only."_

| # | Item | Status | Notes |
|---|---|---|---|
| 37 | Exposure indicator updates in real time as lighting changes — not a one-time static label on mount | [DEVICE] | |
| 38 | "Too Dark" state triggers when ambient light is below threshold — verified by covering lens or testing in dim room | [DEVICE] | |
| 39 | "Good" state shown under normal indoor clinic lighting (tube lights, overhead) | [DEVICE] | |
| 40 | "Overexposed" state triggers under direct sunlight or strong backlight | [DEVICE] | |
| 41 | Indicator provides exposure guidance only — no text references OCR accuracy, document quality, or extraction likelihood | | |
| 42 | Indicator does not prevent capture when "Too Dark" or "Overexposed" — it is advisory only; doctor can still tap capture | [DEVICE] | |
| 43 | Indicator label contrast readable on live camera preview in all three states — [RULE 10] verified on device, not simulator | [DEVICE] | |

---

## Section 4 — Data (includes PM Pre-Flow Requirements)

| # | Item | Status | Notes |
|---|---|---|---|
| 44 | **[PM REQ 1]** Scan images stored under a doctor-scoped directory path: `<FileSystem.documentDirectory>/<doctorId>/scans/<uuid>.jpg` — not a shared root-level directory | | |
| 45 | **[PM REQ 1]** Directory path uses the authenticated `user.id` from auth store — never a hardcoded string, patient ID, or nav param | | |
| 46 | **[PM REQ 3]** `localPath` written to `visits_draft` row for the associated visit after "Use This" — scan not silently dropped on save (closes D6 MEDIUM-3) | | |
| 47 | **[PM REQ 3]** `enqueueOperation` payload for the visit includes scan `localPath` and `label` — scan data will be sent to server when online | | |
| 48 | **[PM REQ 2]** OCR text storage layer strips 12-digit Aadhaar-format sequences before writing to SQLite — regex covers both spaced (`\d{4}\s\d{4}\s\d{4}`) and unspaced (`\d{12}`) forms | | |
| 49 | **[PM REQ 2]** Aadhaar strip applied at the write boundary — not at display time — so the stripped form is what reaches storage | | |
| 50 | Image file saved only after "Use This" tapped — "Retake" path leaves no file on disk | | |
| 51 | Image UUID generated via `expo-crypto` `randomUUID()` — no sequential or predictable filename | | |
| 52 | Image saved as JPEG (not PNG) — lower file size for document scans; consistent with compression target | | |
| 53 | `scan.label` set to a meaningful non-null string (e.g. `"Document"` or `"Scan 04/03/2026"`) — not `undefined` | | |
| 54 | OCR is queued asynchronously — no blocking call to Vision API or Tesseract from within D7 screen logic | | |
| 55 | Image compression applied via `expo-image-manipulator` with `compress: 0.7` (JPEG) or lower — raw camera output never stored directly | | |
| 56 | Compressed image confirmed to be <1MB before write — file size logged in dev mode | [DEVICE] | |

---

## Section 5 — Security

| # | Item | Status | Notes |
|---|---|---|---|
| 57 | Auth guard present: `if (!token \|\| !user) return null` after all hooks, before JSX — D2/D3/D6 pattern applied | | |
| 58 | `doctorId` sourced from `user.id` in auth store — never from nav params, route params, or any client-provided value | | |
| 59 | **[PM REQ 1]** Image directory is doctor-scoped — two different doctors on the same device store scans in separate directories and cannot cross-read | | |
| 60 | **[PM REQ 1]** `useLogout` deletes the outgoing doctor's scan directory on logout: `FileSystem.deleteAsync(<doctorId>/scans/, { idempotent: true })` — images do not survive across logout | | |
| 61 | No patient name or mobile number written to `console.log` within D7 | | |
| 62 | No scan file path (which embeds `doctorId` and `visitId`) written to `console.log` | | |
| 63 | `visitId` and `patientId` passed from D6/D4 via nav params — D7 does not independently look up patient records | | |
| 64 | `visitId` nav param validated as non-null before use — D7 shows error or refuses to proceed rather than saving a scan with no visit association | | |
| 65 | Camera permission check is non-blocking — if permission is denied, a clear message is shown and the user is returned to the caller screen | [DEVICE] | |

---

## Section 6 — Navigation & Integration

_D6 items 25, 36, 37, 57, 59, 63 were deferred pending D7. They close here._

| # | Item | Status | Notes |
|---|---|---|---|
| 66 | D6 → D7: `patientId` and `visitId` nav params received correctly; confirmed in D7 on mount | [DEVICE] | Closes D6 item #56 |
| 67 | D7 → D6: After "Use This", D7 passes `{ localPath, label }` back to D6 via navigation params or navigation state callback | [DEVICE] | |
| 68 | D6: scan thumbnail renders after D7 returns; `scan !== null` makes Save Visit active | [DEVICE] | Closes D6 item #36 |
| 69 | D6: chief complaint is still optional and Save works when only a scan is attached — no note required | [DEVICE] | Closes D6 item #25 |
| 70 | D6: note text typed before navigating to D7 is still present on D7 return — no state loss | [DEVICE] | Closes D6 item #57 |
| 71 | D6 has-note + has-scan state: both shown, Save active | [DEVICE] | Closes D6 item #37 |
| 72 | D6 → D7 → cancel (no scan taken) → D6: state unchanged — note text intact, no orphan scan file, Save active only if note was present | [DEVICE] | Closes D6 item #59 |
| 73 | D6 → D7 camera button tap → D7 mounts within 300ms | [DEVICE] | Closes D6 item #63 |
| 74 | D4 → D7: `patientId` and `visitId` nav params received correctly when D7 launched from D4 "Add Scan" button | [DEVICE] | |
| 75 | D4 → D7 → "Use This": returns to D4 with scan thumbnail added to record list | [DEVICE] | |
| 76 | D7 is registered as a named route in `App.tsx` (`'DocumentScanner'` or equivalent) — "App entry not found" cannot occur | | |

---

## Section 7 — Device Rules (LESSONS-AND-RUNBOOK.md)

| # | Item | Status | Notes |
|---|---|---|---|
| 77 | **[RULE 9]** `expo-camera` `CameraView` (or equivalent) wrapped in explicit parent `View` with defined `flex: 1`, `backgroundColor: '#000000'`, and no undefined dimensions — zero-height or invisible camera render prevented | | |
| 78 | **[RULE 9]** Native camera component verified to fill its container on device — simulator/web preview is insufficient for this check | [DEVICE] | |
| 79 | **[RULE 7]** Any `Modal` used in D7 (e.g. crop preview overlay) mounted unconditionally in the React tree — visibility controlled via `visible` prop only; never `{showModal && <Modal>}` | | |
| 80 | **[RULE 7]** If a Modal is used for preview: verified on iOS that the preview content is visible immediately without a blank-frame flash on open | [DEVICE] | |
| 81 | **[RULE 10]** Exposure indicator label contrast verified on a real device camera preview — not in simulator or static screenshot | [DEVICE] | |
| 82 | **[RULE 10]** "Use This" and "Retake" button labels verified readable on image preview background on device — dark scrim behind buttons confirmed | [DEVICE] | |
| 83 | **[RULE 11]** After installing `expo-camera` and `expo-image-manipulator`, Metro cache cleared with `npm start -- --clear` and Expo Go force-quit before first device test | [DEVICE] | |
| 84 | **[RULE 11]** After any `visits_draft` schema change (adding scan columns), Metro cache cleared and Expo Go force-quit — shake → Reload alone is insufficient | [DEVICE] | |
| 85 | **[RULE 12]** Any new column added to `visits_draft` for scan data (e.g. `scan_local_path`, `scan_label`) has `ALTER TABLE ... ADD COLUMN` migration in `try/catch` immediately below `CREATE TABLE` in `schema.ts` | | |
| 86 | **[RULE 12]** Schema migration tested on a device with an existing database (not fresh install) — no "no such column" crash | [DEVICE] | |

---

## Section 8 — Performance

| # | Item | Status | Notes |
|---|---|---|---|
| 87 | Compressed image is confirmed <1MB — file size logged in dev mode before shipping | [DEVICE] | |
| 88 | `expo-image-manipulator` compress parameter set to 0.7 (JPEG) or lower — not passing raw camera buffer | | |
| 89 | App does not crash when device has <1GB free storage — graceful error message shown, no partial file left on disk | [DEVICE] | |
| 90 | Cleanup on failed write: if image save fails mid-write, any partial file deleted from the doctor-scoped directory | | |
| 91 | Capture button responsive within 300ms of tap on a 2GB RAM device — no lag or stutter | [DEVICE] | |
| 92 | Viewfinder → preview transition completes within 1 second of capture tap | [DEVICE] | |
| 93 | Return to D6 after "Use This" completes within 2 seconds including file write and state update | [DEVICE] | |
| 94 | D7 screen mount does not block the main thread — camera permission request and directory creation done asynchronously | | |
| 95 | Camera viewfinder frame rate acceptable on low-end Android (2GB RAM) — no visible stuttering or freeze frames before capture | [DEVICE] | |

---

## Deferred Items Log

Any item marked 🔶 must have a written reason here before D7 is called done.

| Checklist # | Item | Reason for Deferral | Fix By | Sign-Off |
|---|---|---|---|---|
| _None yet_ | | | | |

---

## D6 Items Closed by D7

These items were deferred in `reviews/D6-VALIDATION-CHECKLIST.md` pending D7 being built. Mark each ✅ here and update D6 checklist once confirmed on device.

| D6 Item # | Description | D7 Checklist Item | Status |
|---|---|---|---|
| 25 | Chief complaint optional when only scan attached | #69 | |
| 36 | Has-scan state: thumbnail shown, Save active | #68 | |
| 37 | Has-note-and-scan state: both shown, Save active | #71 | |
| 57 | D7 → D6 returns correctly with note area intact | #70 | |
| 59 | D7 cancel → D6 state unchanged, no orphan scan | #72 | |
| 63 | Camera button tap → D7 launch within 300ms | #73 | |

---

## Open Debt Items (carry forward to D7 build session)

| Item | Screen | Source | Notes |
|---|---|---|---|
| S3 upload not implemented — scans stored local filesystem only | D7 | Locked decision | Swap requires changing one storage handler function and one config value when v2 builds S3 support. |
| OCR fallback (Tesseract) not tested without network — Google Vision API requires connectivity | D7 | QA concern | Tesseract fallback path must be tested in airplane mode. Track in D7 security audit session. |
| Auto-capture deferred to v2 | D7 | Locked decision | Manual tap-to-capture only in v1. Do not re-propose auto-capture. |

---

## Gate

| Gate | Confirmed By | Date |
|---|---|---|
| PM pre-flow gate passed | agent-pm.md (reviews/D7-pm-preflow.md) | 2026-03-04 |
| Visual layout approved (Section 1, items 1–22) | | |
| Security audit: no CRITICAL or HIGH findings | | |
| Persona critique score ≥ 3.5 | | |
| All 95 checklist items confirmed or deferred with written reason | | |
| Three PM pre-flow requirements confirmed (#44, #45, #46, #47, #48, #49, #59, #60) | | |
| Six D6 deferred items closed (#25, #36, #37, #57, #59, #63) | | |
| `docs/project-state.md` updated as clean snapshot | | |
| Committed and pushed to GitHub | | |
| **D7 is DONE** | | |

---

## The Three Questions (from LESSONS-AND-RUNBOOK.md)

Before calling D7 done, answer yes to all three:

1. Does this checklist have zero blank rows? _(check at end of device testing session)_
2. Have security and data fixes been verified on real device — not just code review? _(especially items 44–49, 56, 59–60, 77–86)_
3. Is `docs/project-state.md` a clean snapshot with D7 marked complete and D6 MEDIUM-3 closed?
