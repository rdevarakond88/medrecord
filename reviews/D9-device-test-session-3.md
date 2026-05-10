# D9 Device Test Session 3 — Consent Request Flow

**Date:** 2026-05-10
**Device:** iPhone (iOS, Expo Go via ngrok tunnel; iPhone is hotspot source)
**Tester:** Device Tester Agent
**QA Test Plan:** `reviews/D9-qa-test-plan.md`
**Live screen:** `src/screens/doctor/ConsentRequestScreen.tsx`
**Goal:** Verify BUG-D9-DT2-1 fix (gestureEnabled: false) + BUG-D9-DT1-4 (offline verify error)

## Pre-flight

| Check | Result |
|---|---|
| GET /v1/health | HTTP 200 ✅ |
| POST /consent/request | HTTP 401 ✅ |
| POST /consent/verify | HTTP 401 ✅ |
| OTP bypass | TEST_OTP_BYPASS=true — code 000000 |
| Test doctor mobile | 9999999999 |
| Test patient mobile | 7777777777 |

---

## Test Results

| ID | Description | Result | Notes |
|---|---|---|---|
| TC-FIX-3 | BUG-D9-DT2-1: iOS swipe-back from failure state (State 6) blocked by gestureEnabled: false | FAIL | Swipe still dismisses the screen. Same console error: "The screen 'ConsentRequest' was removed natively but didn't get removed from JS state." Dynamic `navigation.setOptions({ gestureEnabled: false })` in a useEffect does NOT prevent the iOS swipe gesture on NativeStack — same outcome as the beforeRemove approach. → BUG-D9-DT3-1 logged |
| TC-FIX-4 | BUG-D9-DT1-4: Offline error shown immediately on verify with no connectivity | SKIP | iPhone is hotspot source — disabling connectivity would drop the session. Same constraint as session 2. Carry forward. |

---

## Bugs Found

| ID | Severity | Description | Root Cause | Fix Required |
|---|---|---|---|---|
| BUG-D9-DT3-1 | MEDIUM | BUG-D9-DT2-1 NOT fixed: iOS swipe-back from State 6 still dismisses ConsentRequestScreen despite `gestureEnabled: false` via `navigation.setOptions()`. Console error identical to session 2. | Dynamic `navigation.setOptions({ gestureEnabled })` on NativeStack does not propagate to the iOS native layer at runtime — the option is likely processed at screen-push time only. The `beforeRemove` listener still fires, calls `e.preventDefault()`, which causes the native/JS state split. | Builder must find an alternative approach. Options to investigate: (1) Set `gestureEnabled: false` statically in App.tsx `<Stack.Screen>` options for ConsentRequest and handle all back navigation programmatically; (2) Show failure state as a modal overlay on State 3 so there is no screen to swipe away; (3) Use `navigation.replace('ConsentRequest', ...)` to push a fresh screen when entering failure state, making swipe-back go to D3 intentionally (which may be acceptable UX). Do NOT retry `navigation.setOptions` or `beforeRemove` — both have been confirmed ineffective on iOS NativeStack. |

---

## Session End Summary

**Date:** 2026-05-10
**Device:** iPhone (iOS, Expo Go via ngrok tunnel)
**Result:** COMPLETE — 1 bug found

### Counts

| Result | Count |
|---|---|
| PASS | 0 |
| FAIL | 1 |
| SKIP | 1 |

### Bug count: 1

| ID | Severity | Summary |
|---|---|---|
| BUG-D9-DT3-1 | MEDIUM | gestureEnabled: false via dynamic setOptions also ineffective — iOS swipe still dismisses State 6; both known approaches exhausted; Builder must use alternative architecture |

### Open items carried forward

| Item | Status | Reason |
|---|---|---|
| BUG-D9-DT1-4 re-verify (TC-FIX-4) | UNTESTED | iPhone is hotspot source — cannot disable connectivity. Re-test in session 4 on a WiFi-connected device. |

### Builder Handoff Decision

Builder Agent session required before merge — items:
- BUG-D9-DT3-1 (MEDIUM — gestureEnabled: false via setOptions ineffective on iOS NativeStack; Builder must use alternative approach; see root cause note above)
- BUG-D9-DT1-4 (MEDIUM — fix from DT1 Builder session; unverified on device; must re-verify in session 4 before merge)

**SESSION COMPLETE — Next: Builder Agent — D9 Builder session 3 — D9 Consent Request Flow**
