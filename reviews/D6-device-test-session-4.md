# D6 New Visit — Device Test Session 4
**Date:** 2026-03-20
**Tester:** Device Tester Agent
**Device:** iPhone (Expo Go)
**Backend:** https://medrecord-api.onrender.com/v1 ✅
**Purpose:** Verify BUG-D6-DT3-1 fix (useFocusEffect + 200ms delay); clear remaining items 34, 35, 63

---

## Pre-Flight

| Check | Result |
|---|---|
| Backend health (`/v1/health`) | ✅ 200 `{"status":"ok"}` — 2026-03-20T19:30:11Z |
| Test credentials (mobile: 9999999999, OTP: 000000) | ✅ |
| BUG-D6-DT3-1 fix deployed | ✅ (useFocusEffect + 200ms delay — Builder 2026-03-20) |

---

## Results

| Checklist # | Item | Result | Notes |
|---|---|---|---|
| 34 | Empty state: no note, no scan — Save disabled | ✅ PASS | Save button greyed out on D6 open with no content |
| 35 | Has-note state: note typed — Save active | ✅ PASS | Button turns blue immediately on first character typed |
| 63 | Camera button tap → D7 launch within 300ms | ✅ PASS | D7 felt instant; no noticeable delay |
| BUG-D6-DT3-1 fix | CameraView live viewfinder after useFocusEffect + 200ms delay | ❌ FAIL | Camera preview still black — fix did not resolve issue. See BUG-D6-DT4-1 below. |

---

## Bugs Found

### BUG-D6-DT4-1 — CameraView black screen persists after useFocusEffect + 200ms delay fix (HIGH)
**Checklist items affected:** Camera capture path blocked
**Screen:** D7 (DocumentScannerScreen.tsx)
**Previous fix:** BUG-D6-DT3-1 — `useFocusEffect` + 200ms delayed mount of CameraView (Builder 2026-03-20). Fix did NOT resolve the issue.
**Steps to reproduce:**
1. Open New Visit (D6) → tap orange scan button
2. D7 opens — all UI controls visible (✕, flash toggle, guide rect, exposure pill, capture button)
3. Wait 2–3 seconds for camera to initialize
4. Camera preview area is black — no live viewfinder

**Expected:** Live camera viewfinder renders within ~1 second of D7 opening
**Actual:** CameraView preview is black; all overlay UI renders correctly; photo library path still works
**Workaround:** "Use Photo Library" button in D7 works correctly
**Severity:** HIGH — primary camera capture path blocked; two consecutive Builder fixes have not resolved the issue
**Suggested investigation for Builder:**
- This is the third attempted fix — the issue may be Expo Go-specific (AVCaptureSession restrictions in sandboxed environment)
- Test in a custom dev build (EAS) rather than Expo Go — AVCaptureSession behaviour differs
- Check expo-camera SDK 54 release notes / known issues for iOS black screen in Expo Go
- Try `onCameraReady` callback: only show viewfinder after `cameraReady` state = true
- Try `useIsFocused()` hook from `@react-navigation/native` as alternative to `useFocusEffect`
- Consider whether this is a fundamental Expo Go limitation — if so, may need to defer camera testing to custom dev build

---

## Session Summary

| Field | Value |
|---|---|
| Items tested | 4 (items 34, 35, 63 + BUG-D6-DT3-1 verification) |
| PASS | 3 (items 34, 35, 63) |
| FAIL | 1 (BUG-D6-DT3-1 fix verification) |
| Bugs found | 1 — BUG-D6-DT4-1 HIGH (CameraView black screen — useFocusEffect + 200ms fix ineffective) |
| Still deferred | 2 (items 49, 60 — simulation required, v1 acceptable) |
