# D9 Device Test Session 2 — Consent Request Flow

**Date:** 2026-05-10
**Device:** iPhone (iOS, Expo Go via ngrok tunnel; iPhone is hotspot source)
**Tester:** Device Tester Agent
**QA Test Plan:** `reviews/D9-qa-test-plan.md`
**Live screen:** `src/screens/doctor/ConsentRequestScreen.tsx`
**Goal:** Verify BUG-D9-DT1-1 through DT1-4 fixes from Builder session (2026-05-10)

## Pre-flight

| Check | Result |
|---|---|
| GET /v1/health | HTTP 200 ✅ (60s timeout — Render cold start) |
| POST /consent/request | HTTP 401 ✅ |
| POST /consent/verify | HTTP 401 ✅ |
| OTP bypass | TEST_OTP_BYPASS=true — code 000000 |

---

## Test Results

| ID | Description | Result | Notes |
|---|---|---|---|
| TC-FIX-1 | BUG-D9-DT1-1: State 2 shows 💬 icon (not ✉) | PASS | Bubble icon confirmed on device |
| TC-FIX-2 | BUG-D9-DT1-2: Backspace clears previous OTP box digit; next digit fills correct box | PASS | Entered 0 → box 1 → auto-advance to box 2 → backspace → box 1 cleared → typed 2 → filled box 1 correctly |
| TC-FIX-3 | BUG-D9-DT1-3: Back from failure state (State 6) returns to State 2 | FAIL | iOS swipe-back from State 6 still returns to D3. Console error: "The screen 'ConsentRequest' was removed natively but didn't get removed from JS state. This can happen if the action was prevented in a beforeRemove listener, which is not fully supported in the native stack." → BUG-D9-DT2-1 logged |
| TC-FIX-4 | BUG-D9-DT1-4: Offline error shown immediately on verify with no connectivity | SKIP | iPhone is hotspot source — disabling connectivity would drop Claude Code session. Untestable in this setup. Carry forward to session 3. |

---

## Bugs Found

| ID | Severity | Description | Root Cause | Fix Required |
|---|---|---|---|---|
| BUG-D9-DT2-1 | LOW | BUG-D9-DT1-3 NOT fixed: iOS swipe-back from failure state (State 6) still navigates to D3. `beforeRemove` + `e.preventDefault()` is not supported by NativeStackNavigator for iOS swipe gesture. Console error confirms native/JS state split. | React Navigation native stack does not honour `e.preventDefault()` for the iOS swipe gesture — the screen is dismissed at the native layer before JS can intercept. | Builder must use `navigation.setOptions({ gestureEnabled: false })` when entering `failure` state, and re-enable on state exit. Do NOT use `beforeRemove` for this case on native stack. |

---

## Session End Summary

**Date:** 2026-05-10
**Device:** iPhone (iOS, Expo Go via ngrok tunnel)
**Result:** COMPLETE — 1 bug found

### Counts

| Result | Count |
|---|---|
| PASS | 2 |
| FAIL | 1 |
| SKIP | 1 |

### Bug count: 1

| ID | Severity | Summary |
|---|---|---|
| BUG-D9-DT2-1 | LOW | BUG-D9-DT1-3 not fixed — `beforeRemove` + `e.preventDefault()` unsupported on NativeStack iOS swipe; fix requires `gestureEnabled: false` in failure state |

### Open items carried forward

| Item | Status | Reason |
|---|---|---|
| BUG-D9-DT1-4 re-verify (TC-FIX-4) | UNTESTED | iPhone is hotspot source — cannot disable connectivity in this setup. Re-test in session 3 on WiFi-independent device or via airplane-mode test on a separate internet source. |

### Builder Handoff Decision

Builder Agent session required before merge — items:
- BUG-D9-DT2-1 (LOW — replace `beforeRemove` approach with `navigation.setOptions({ gestureEnabled: false })` for failure state)
- BUG-D9-DT1-4 (MEDIUM — fix from DT1 Builder session; unverified on device; must re-verify in session 3 before merge)

**SESSION COMPLETE — Next: Builder Agent — D9 Builder session 2 — D9 Consent Request Flow**
