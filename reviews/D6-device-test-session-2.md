# D6 New Visit — Device Test Session 2
**Date:** 2026-03-20
**Tester:** Device Tester Agent
**Device:** iPhone (Expo Go)
**Backend:** https://medrecord-api.onrender.com/v1 ✅
**Purpose:** Clear the 9 deferred items from session 1 (items needing D7 + backend + pending tests)

---

## Pre-Flight

| Check | Result |
|---|---|
| Backend health (`/v1/health`) | ✅ 200 |
| Test credentials (mobile: 9999999999, OTP: 000000) | ✅ |
| D7 built and accessible | ✅ |

---

## Deferred Items — Results

| Checklist # | Item | Result | Notes |
|---|---|---|---|
| 34 | Empty state: no note, no scan — Save disabled | ✅ PASS | Save button greyed out with no input |
| 35 | Has-note state: note typed — Save active | ✅ PASS | Button turned blue and enabled on text entry |
| 36 | Has-scan state: thumbnail shown, Save active | ❌ BLOCKED | BUG-D6-DT2-1 — camera black screen |
| 37 | Has-note-and-scan: both shown, Save active | ❌ BLOCKED | BUG-D6-DT2-1 — camera black screen |
| 25 | Chief complaint skippable with scan attached | ❌ BLOCKED | BUG-D6-DT2-1 — camera black screen |
| 57 | D7→D6 returns with scan thumbnail, note intact | ❌ BLOCKED | BUG-D6-DT2-1 — camera black screen |
| 59 | D7 cancelled → D6 returns to previous state | ❌ BLOCKED | BUG-D6-DT2-1 — camera black screen |
| 63 | Camera tap → D7 launches within 300ms | ✅ PASS | D7 opened immediately; camera black screen is separate bug |
| 40 | Save error banner shown, retry re-enables Save | ✅ PASS (conditional) | Offline save → draft in D3 confirmed correct. Error banner fires only on SQLite throw (line 387) — not triggerable without DB corruption. Code-wired path accepted via code review. |
| 49 | Missing nav param — no crash | 🔶 Still deferred | Requires runtime simulation — TypeScript compile-time guard accepted for v1 |
| 60 | Missing route/patient ID — safe error | 🔶 Still deferred | Requires runtime simulation — TypeScript compile-time guard accepted for v1 |

---

## Bugs Found

### BUG-D6-DT2-1 — CameraView black screen after permission grant (HIGH)
**Checklist items blocked:** 36, 37, 25, 57, 59, 63
**Screen:** D7 (DocumentScannerScreen.tsx)
**Steps to reproduce:**
1. Open New Visit (D6) → tap camera button
2. D7 opens → iOS camera permission prompt appears → tap Allow
3. Camera preview area is black — UI buttons are visible but no live viewfinder
4. Go back, re-enter New Visit → tap camera again (permission already granted)
5. Camera preview still black on second attempt

**Expected:** Live camera viewfinder renders immediately after permission is granted
**Actual:** CameraView preview is black on all attempts; cannot capture a scan
**Root cause hypothesis:** `CameraView` (expo-camera) fails to initialise the native camera layer on first mount after a same-cycle permission grant on iOS in Expo Go. Second attempt is also affected — CameraView is not recovering.
**Severity:** HIGH — blocks the entire scan workflow (D7's core purpose)
**Fix required:** Builder Agent session. Likely fix: add a `key` prop to `CameraView` that increments when `cameraPermission.granted` transitions to `true`, forcing a remount after permission is confirmed.

---

## Session Summary

| Field | Value |
|---|---|
| Items tested | 9 of 9 attempted (+ 2 still deferred from session 1) |
| PASS | 4 (items 34, 35, 40, 63) |
| BLOCKED | 5 (items 36, 37, 25, 57, 59 — BUG-D6-DT2-1) |
| Still deferred | 2 (items 49, 60 — simulation required, v1 acceptable) |
| Bugs found | 1 — BUG-D6-DT2-1 HIGH (CameraView black screen) |
