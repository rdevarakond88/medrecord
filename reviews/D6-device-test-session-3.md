# D6 New Visit — Device Test Session 3
**Date:** 2026-03-20
**Tester:** Device Tester Agent
**Device:** iPhone (Expo Go)
**Backend:** https://medrecord-api.onrender.com/v1 ✅
**Purpose:** Clear 5 items blocked by BUG-D6-DT2-1 (#36, #37, #25, #57, #59); verify BUG-D6-DT2-1 fix

---

## Pre-Flight

| Check | Result |
|---|---|
| Backend health (`/v1/health`) | ✅ 200 `{"status":"ok"}` |
| Test credentials (mobile: 9999999999, OTP: 000000) | ✅ |
| BUG-D6-DT2-1 fix deployed | ✅ (cameraKey remount — Builder 2026-03-20) |

---

## Results

| Checklist # | Item | Result | Notes |
|---|---|---|---|
| 59 | D7 cancelled → D6 returns to previous state without data loss | ✅ PASS | Note preserved, scan area empty on return |
| 36 | Has-scan state: thumbnail shown, Save active | ✅ PASS | Tested via photo library path (camera blocked — see BUG-D6-DT3-1) |
| 37 | Has-note-and-scan state: both shown, Save active | ✅ PASS | Tested via photo library path |
| 25 | Chief complaint skippable with scan attached | ✅ PASS | Save succeeds with scan only, no note — navigates back to D3 |
| 57 | D7→D6 returns with scan thumbnail and note intact | ✅ PASS | Note + thumbnail both present on return; state fully preserved |

---

## Bugs Found

### BUG-D6-DT3-1 — CameraView black screen persists after BUG-D6-DT2-1 fix (HIGH)
**Checklist items affected:** None newly blocked (all 5 items cleared via photo library path)
**Screen:** D7 (DocumentScannerScreen.tsx)
**Previous fix:** BUG-D6-DT2-1 — `cameraKey` state increments on `cameraPermission.granted` transition, forcing CameraView remount (Builder 2026-03-20). Fix did NOT resolve the issue.
**Steps to reproduce:**
1. Open New Visit (D6) → tap orange scan button
2. D7 opens — all UI controls visible (✕, flash toggle, guide rect, exposure pill, capture button)
3. Camera preview area is black — no live viewfinder

**Expected:** Live camera viewfinder renders on screen open
**Actual:** CameraView preview is black on every attempt; all overlay UI renders correctly
**Workaround:** "Use Photo Library" button in D7 works correctly — photo library path functional
**Severity:** HIGH — camera capture path blocked; photo library is a functional workaround but not the primary UX
**Fix required:** Builder Agent session. `cameraKey` remount did not resolve the underlying AVCaptureSession issue. Suggested investigation angles for Builder:
- `onCameraReady` callback — delay showing viewfinder until camera is confirmed ready
- Delayed CameraView mount (short `setTimeout` / `useMounted` state before rendering `<CameraView>`)
- Check if issue is Expo Go-specific (custom dev build may behave differently)
- Check expo-camera release notes for SDK 54 known iOS black screen issues

---

## Session Summary

| Field | Value |
|---|---|
| Items tested | 5 |
| PASS | 5 (items 25, 36, 37, 57, 59) |
| FAIL | 0 |
| Bugs found | 1 — BUG-D6-DT3-1 HIGH (CameraView black screen — BUG-D6-DT2-1 fix ineffective) |
| Still deferred | 2 (items 49, 60 — simulation required, v1 acceptable) |
