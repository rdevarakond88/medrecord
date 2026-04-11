# D6 New Visit — Device Test Session 5
**Date:** 2026-03-28
**Tester:** Device Tester Agent
**Device:** iPhone (Expo Go)
**Backend:** https://medrecord-api.onrender.com/v1 ✅
**Purpose:** Verify BUG-D6-DT4-1 fix (InteractionManager.runAfterInteractions replacing 200ms setTimeout)

---

## Pre-Flight

| Check | Result |
|---|---|
| Backend health (`/v1/health`) | ✅ 200 `{"status":"ok","timestamp":"2026-03-28T18:29:52Z"}` |
| Test credentials (mobile: 9999999999, OTP: 000000) | ✅ |
| BUG-D6-DT4-1 fix deployed | ✅ (InteractionManager.runAfterInteractions — Builder 2026-03-27) |

---

## Results

| Checklist # | Item | Result | Notes |
|---|---|---|---|
| BUG-D6-DT4-1 fix | CameraView live viewfinder after InteractionManager fix | ❌ FAIL | Camera preview still black — fix did not resolve issue. See BUG-D6-DT5-1 below. |
| 49 | (deferred — simulation required, v1 acceptable) | SKIP | Carried from session 4 |
| 60 | (deferred — simulation required, v1 acceptable) | SKIP | Carried from session 4 |

---

## Bugs Found

### BUG-D6-DT5-1 — CameraView black screen persists after InteractionManager fix (HIGH — escalated)
**Checklist items affected:** Camera capture path blocked
**Screen:** D7 (DocumentScannerScreen.tsx)
**Fix history:**
- BUG-D6-DT2-1: useFocusEffect — FAILED
- BUG-D6-DT3-1: useFocusEffect + 200ms setTimeout — FAILED
- BUG-D6-DT4-1: InteractionManager.runAfterInteractions() — FAILED
- Snack Expo also tested by user — black screen reproduced there too

**Steps to reproduce:**
1. Open New Visit (D6) → tap orange scan button
2. D7 opens — all UI controls visible (✕, flash toggle, guide rect, exposure pill, capture button)
3. Wait 2–3 seconds
4. Camera preview area is black — no live viewfinder

**Expected:** Live camera viewfinder within ~1 second of D7 opening
**Actual:** CameraView preview is black — 4 consecutive fix attempts have not resolved it
**Workaround:** "Use Photo Library" button in D7 works correctly
**Severity:** HIGH — primary camera capture path blocked

**Key evidence from Snack Expo failure:**
- Bug reproduced in Snack Expo (a different sandboxed Expo environment)
- This strongly suggests the issue is NOT a timing/mount problem
- Root cause is likely one of:
  1. expo-camera SDK 54 compatibility issue with iOS in Expo Go / sandboxed environments
  2. `facing` prop or camera config causing AVCaptureSession to fail silently
  3. Missing `useCameraPermissions` hook usage (expo-camera SDK 14+ changed the API)
  4. expo-camera version mismatch with Expo SDK 54

**Recommended Builder investigation:**
- Check `expo-camera` package version vs SDK 54 compatibility matrix
- SDK 54 ships with expo-camera 16.x — verify `useCameraPermissions()` hook is used (not legacy `Camera.requestCameraPermissionsAsync()`)
- Check if `CameraView` requires `isActive` prop in the installed version
- Review expo-camera 16.x changelog for breaking API changes from SDK 53 → 54
- If Expo Go is fundamentally blocking AVCaptureSession access: document this as an Expo Go limitation and either (a) defer camera testing to EAS custom dev build, or (b) add a "camera unavailable in Expo Go" fallback that forces the photo library path

---

## Session Summary

| Field | Value |
|---|---|
| Items tested | 1 (BUG-D6-DT4-1 verification) |
| PASS | 0 |
| FAIL | 1 (BUG-D6-DT4-1 fix verification — camera still black) |
| SKIP | 2 (items 49, 60 — permanently deferred, v1 acceptable) |
| Bugs found | 1 — BUG-D6-DT5-1 HIGH (CameraView black screen — 4th consecutive fix attempt failed; Snack Expo also failed) |

---

## Session End Checklist

1. **Bug count:** 1 bug found — BUG-D6-DT5-1 HIGH (CameraView black screen, 4 fixes attempted, Snack Expo also confirmed)
2. **Builder handoff decision:** Builder Agent session required — items: BUG-D6-DT5-1
3. **SESSION COMPLETE — Next: Builder Agent — investigate and fix BUG-D6-DT5-1 (CameraView black screen, likely expo-camera API or SDK 54 compatibility root cause)**
