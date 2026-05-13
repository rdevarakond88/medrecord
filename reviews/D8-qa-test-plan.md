# QA REVIEW — D8 Full Scan View

_Date: 2026-05-12_
_Reviewer: agent-qa.md_
_Source files reviewed: src/screens/doctor/FullScanViewScreen.tsx,
src/components/ScanImageViewer.tsx, src/db/scans.ts,
src/screens/doctor/VisitDetailScreen.tsx (handleViewScan),
src/utils/formatters.ts, reviews/D8-security-audit.md,
docs/ui-ux-spec.md § D8_

---

## TESTING PREREQUISITES

| Field | Value |
|---|---|
| Backend URL | `https://medrecord-api.onrender.com/v1` |
| Backend status | **UP** — HTTP 200 confirmed 2026-05-10. Cold-start ~20-30s on first request. |
| Test credentials | Dr. Test Doctor — mobile `9999999999`, OTP bypass `000000` (TEST_OTP_BYPASS=true) |
| Cert pinning | Not testable in Expo Go — deferred to EAS build (priority 6 in project state) |
| D8 entry path | Login → D2 Patient Search → D3 Patient Detail → D4 Visit Detail → tap "View full image →" on a scan record row |
| Prerequisite | A visit with at least one scan must exist locally (created via D6 → D7). D8 is unreachable without a local scan. If no local scan exists, D4 shows an "Image not available" Alert and D8 never opens. |
| **Status** | **READY TO TEST** |

---

## CRITICAL BUGS (will cause data loss or crash in production)

None.

---

## HIGH BUGS (will cause incorrect behaviour, no data loss)

### D8-QA-H1: No image load error handler — blank black screen on missing image file

`ScanImageViewer` renders `<Image source={{ uri }}>` with no `onError` prop. If the image
file does not exist at `uri` (deleted by the OS, path drift on Android after APK reinstall,
or file corrupted), the component renders nothing — the user sees a blank black rectangle
with no error message, no retry affordance, and no explanation.

**Steps to reproduce:**
1. Create a visit with a scan in D6 → D7.
2. Navigate to D8 via D4 and confirm the image loads.
3. Exit the app. Use a file manager or `adb shell` to delete the scan file from the
   filesystem (`<documentDirectory>/<doctorId>/scans/<uuid>.jpg`).
4. Re-open the app. Navigate back to the same scan via D4 → D8.

**Expected:** An "image not available" state with a human-readable explanation (e.g.,
"Image could not be loaded. Ask staff to rescan.").

**Actual:** Blank black screen. No error, no indication anything went wrong.

**Code location:** `src/components/ScanImageViewer.tsx:51` — `<Image source={{ uri }}`
— missing `onError` prop.

**Fix suggestion:** Add `onError` handler:
```typescript
const [imageError, setImageError] = useState(false);
// in JSX:
<Image
  source={{ uri }}
  onError={() => setImageError(true)}
  ...
/>
// render a "not available" overlay when imageError is true
```

---

## MEDIUM BUGS (UX issues, incorrect states)

### D8-QA-M1: Badge and body out of sync when ocrStatus='success' but ocrText is empty string

`OcrPanelBody` guards OCR text display with `ocrStatus === 'success' && ocrText`
(line 138). An empty string (`''`) is falsy, so if OCR completes on a blank page and
returns an empty string, the first condition fails. The function falls through to the
`deferred` branch, rendering "No extracted text available." But `OcrPanelHandle` still
shows the "Text extracted ✓" badge — the badge and body are contradictory.

**Steps to reproduce:**
1. Scan a blank page (or a very faint document where OCR extracts no characters).
2. If the backend sets `ocr_status = 'success'` with `content_text = ''`, open D8.
3. Observe: badge reads "Text extracted ✓", body reads "No extracted text available."

**Expected:** Either badge reads "No text" and body reads "No extracted text available",
or the backend never sets status=success with empty text (an upstream fix).

**Actual:** Contradictory UI — badge and body disagree.

**Code location:** `src/screens/doctor/FullScanViewScreen.tsx:138` — `if (ocrStatus === 'success' && ocrText)`.

**Fix suggestion:** Add explicit empty-string guard:
```typescript
if (ocrStatus === 'success' && ocrText && ocrText.length > 0) {
  // show text
} else if (ocrStatus === 'success' && (!ocrText || ocrText.length === 0)) {
  // show "OCR ran but produced no text — image may be blank or unreadable"
}
```
Or, simpler: treat `''` the same as `null` by normalising at the nav param call site in
`handleViewScan` (VisitDetailScreen.tsx:305): `ocrText: record.content_text || null`.

---

### D8-QA-M2: Image content sized to full window height — user must scroll before zooming

`ScanImageViewer` calls `useWindowDimensions()` and sets both `contentContainerStyle`
and `Image style` to `{ width, height }` where `height` is the full logical screen height
(e.g., 852pt on iPhone 14 Pro). The viewer's actual visible area is smaller: the header
(~62pt) and OCR panel (up to 280pt expanded, ~60pt collapsed) consume vertical space.

Result: the scroll canvas is the full screen height, but the ScanImageViewer container
is `flex: 1` within the remaining space (~510pt expanded, ~730pt collapsed). The canvas
is **taller than its container**, so the image overflows: the user sees only the top
portion of the image initially and must scroll vertically to see the bottom before they
can even begin to zoom.

For a typical portrait prescription (A4 ~1:1.41), with `resizeMode="contain"` the image
renders at 390×550 inside a 390×852 canvas. The canvas is centred with ~151pt of black
on each side. In a ~510pt visible frame, the user sees the top 510pt of the 852pt
canvas — which is the top padding + roughly 60% of the actual scan image. The rest
requires scrolling.

On Android, where `maximumZoomScale` is ignored, the user can only scroll — they cannot
zoom. The off-screen portion of the image is effectively inaccessible unless they scroll.

**Steps to reproduce:**
1. Open D8 with the OCR panel expanded (default state).
2. Observe whether the full scan image is visible without scrolling.
3. Repeat with panel collapsed.

**Expected:** Full scan image (fit-to-width, or fit-to-available-height) visible without
any scrolling at 1× zoom.

**Actual:** Top portion only; user must scroll to see the bottom of the image.

**Code location:** `src/components/ScanImageViewer.tsx:41-57` — `contentContainerStyle={{ width, height }}` and `Image style={{ width, height }}`.

**Fix suggestion (two options):**
- Option A (simpler): Accept `availableHeight` prop from the parent, replacing
  `useWindowDimensions().height`:
  ```typescript
  interface ScanImageViewerProps {
    uri:               string;
    availableHeight:   number;
    accessibilityLabel?: string;
  }
  // In FullScanViewScreen, measure container height with onLayout and pass down.
  ```
- Option B (component-owned): Use `onLayout` inside `ScanImageViewer` to measure the
  container height and use that instead of `useWindowDimensions().height`.

---

## UNHANDLED EDGE CASES (not bugs yet, but will be in production)

### D8-QA-E1: Index-based scan matching can return the wrong scan if scan order shifts

`handleViewScan` (VisitDetailScreen.tsx:293-294) calls `getScansForServerVisit` and
picks `localScans[scanIdx]` where `scanIdx` is the positional index of the scan-type
record within the visit's record list. `getScansForServerVisit` orders by `created_at ASC`.

If two scans are created within the same second (e.g., on a fast device in D7), they may
be ordered arbitrarily. If the record list and the scans table disagree on ordering (due
to timestamp ties or a D7 session that creates them out of order), the wrong scan image
opens for a given record card.

**Recommended handling (v2):** Add a `scanId` column to `visit_records` (or to the
equivalent visit record data) so D8 can navigate directly by ID rather than by position.
For v1, this is acceptable given the sequential D7 capture flow.

---

### D8-QA-E2: Long OCR text (3000+ characters) renders slowly on low-end Android

The OCR panel uses a `ScrollView` with `maxHeight: 180` containing a `Text` component
with no truncation limit. A very long OCR text (e.g., multi-page lab report) is rendered
in full — React Native's `Text` renders all characters into a single layout pass.
On 2GB RAM Android devices, this can cause a visible freeze on panel expand.

**Recommended handling:** Add `numberOfLines` + "Show more" expand pattern if
`ocrText.length > 2000`, or use a `FlatList` of paragraph chunks. Defer to v2.

---

### D8-QA-E3: Token expiry on D8 silently renders blank screen

If the auth token expires while D8 is open, `useAuthStore` clears `token`/`user`. The
screen re-renders the auth guard (`if (!token || !user) return null`) and shows a blank
white screen with no redirect. This is consistent with the D3-H-3 pattern and not unique
to D8, but it is worth testing to confirm the guard fires and does not crash.

**Recommended handling:** All screens — implement a global auth state listener that
navigates to Login on token expiry. Deferred to post-v1 (existing pattern, not a D8-specific regression).

---

### D8-QA-E4: Audit trail gap — scan_viewed event not logged (D8-SA-M1)

As flagged by the Security Agent: `handleViewScan` does not call `logScanViewed()` before
navigating to D8. Under DPDP Act 2023 §8, this is a compliance gap for v1. Device testing
should confirm the absence of this event (so the builder task is well-specified) — not
test for it to pass. Must be added before v1 launch.

---

## TEST PLAN

### Happy Path

1. Login as Dr. Test Doctor → D2 Patient Search → select test patient → D3 Patient Detail.
2. Open a visit in D4 that has at least one scan record. Verify a scan record row appears
   with a "View full image →" label.
3. Tap "View full image →". Verify D8 opens (no crash).
4. Verify header shows: scan label (e.g., "Prescription"), patient name as a dimmed sub-line,
   and visit date in DD/MM/YYYY format.
5. Verify the scan image is visible and fills the screen (image should be visible without
   scrolling — note: may require scrolling with panel expanded per D8-QA-M2).
6. Verify "Pinch to zoom" hint is visible on first open.
7. iOS only: Pinch to zoom in on the image. Verify zoom works up to 4×.
8. Drag/scroll. Verify "Pinch to zoom" hint disappears after first drag.
9. Verify the OCR panel is expanded by default at the bottom of the screen.
10. Verify the panel handle shows "Scan Text" label on the left and a status badge on the right.
11. Tap the panel handle. Verify panel collapses to a strip showing only the handle.
12. Tap the collapsed strip. Verify panel re-expands.
13. Tap the back button (←). Verify navigation returns to D4 with no crash.

---

### OCR States

14. **OCR Success:** Open D8 for a scan where OCR completed. Verify:
    - Badge: "Text extracted ✓" (green)
    - Body: OCR text visible, 15pt system font
    - Text is selectable (long-press → system copy menu appears)
15. **OCR Pending:** Open D8 for a scan where OCR is still running. Verify:
    - Badge: "Processing…" (amber)
    - Body: spinner + "Text extraction in progress… (usually under a minute)"
16. **OCR Failed:** Open D8 for a scan where OCR failed. Verify:
    - Badge: "Not extracted" (red)
    - Body: "Image only — text not extracted" + "Ask staff to rescan if text is needed."
17. **OCR Deferred:** Open D8 for a scan where OCR was never started. Verify:
    - Badge: "No text" (grey)
    - Body: "No extracted text available" + "Ask staff to rescan if text is needed."

---

### Error Scenarios

18. **Missing image file (D8-QA-H1):** Delete the scan image file from the device filesystem.
    Navigate to the same scan via D4 → D8. Observe what happens.
    - Expected: Error state with explanation.
    - Actual (current): Blank black screen. Log as confirmed failure of D8-QA-H1.
19. **No local scans (different device):** Test D4's "Image not available" Alert path:
    navigate to a visit that has a scan record but no corresponding local file in the scans
    table (simulate by clearing scan DB records for the visit). Verify D4 shows the Alert
    and D8 is never opened.
20. **Empty OCR text (D8-QA-M1):** If a scan can be created with `ocrStatus='success'` and
    `ocrText=''`, verify badge and body are consistent. Note: may require backend-side setup.

---

### Navigation and State

21. Open D8. Background the app. Foreground it. Verify image still visible, OCR panel state
    preserved (expanded/collapsed remembered within the session).
22. Open D8. Receive a phone call (or simulate with device). Return to app. Verify state
    preserved, no crash.
23. Open D8 on an Android device. Verify no crash (even though pinch-to-zoom does not work).
    Verify the image displays at 1× and scroll-pan works.
24. iOS: Open D8 in landscape orientation (if rotation is not locked). Verify image re-centers.
    Verify OCR panel does not overflow the screen.
25. Android hardware back button. Verify navigates back to D4.
26. Open D8 from scan #1 of a multi-scan visit. Back to D4. Tap scan #2. Verify the correct
    distinct image loads for each scan (index-based matching verification).

---

### Long Content Edge Cases

27. Open D8 for a scan with a very long label (e.g., "Detailed Blood Test Report Including
    Liver Function Panel"). Verify `numberOfLines={1}` truncates with ellipsis in the header.
28. Open D8 for a patient with a long name (e.g., "Rameshwaran Venkataraman Subramaniam").
    Verify patient name truncates with ellipsis in the header.
29. Open D8 for a scan with long OCR text (500+ words). Verify OCR panel scrolls smoothly.
    Verify panel does not exceed `maxHeight: 180` in the scroll area.

---

### Low-End Device / Offline

30. Open D8 on airplane mode. Verify screen loads fully (no network call needed — all data
    is local). No "offline" spinner should appear.
31. Open D8 on a device with <1GB free storage. Verify image renders correctly (no compression
    at read time — the file was already written by D7).
32. Open D8 immediately after a cold app launch (force-quit → re-open). Verify image loads.

---

### Logout Cleanup

33. Open D8, view a scan. Log out. Verify:
    - `clearDoctorScanRecords()` removes all scans rows from the `scans` table for that doctor.
    - `clearDoctorScans()` deletes the `<doctorId>/scans/` directory from the filesystem.
    - On next login as the same doctor: the scan records are gone (not re-shown from stale DB).

---

## VERDICT

**Needs fixes first — 1 HIGH, 2 MEDIUM bugs found.**

| ID | Severity | Summary | Fix Required Before |
|---|---|---|---|
| D8-QA-H1 | HIGH | No image error handler — blank black screen on missing file | Device testing |
| D8-QA-M1 | MEDIUM | Badge/body mismatch when ocrStatus='success' + empty ocrText | Device testing |
| D8-QA-M2 | MEDIUM | Image sized to full window height; user must scroll before zooming | Device testing |
| D8-QA-E1 | Edge case | Index-based scan matching; wrong image if timestamp ties | v2 |
| D8-QA-E2 | Edge case | Long OCR text performance on low-end Android | v2 |
| D8-QA-E3 | Edge case | Token expiry shows blank screen instead of Login redirect | Post-v1 |
| D8-SA-M1 | MEDIUM (security) | `logScanViewed` not implemented | v1 launch |

**ESTIMATED FIX EFFORT:** 2–3 hours for H1 + M1 + M2 (Builder session). D8-SA-M1 adds ~1 hour.
