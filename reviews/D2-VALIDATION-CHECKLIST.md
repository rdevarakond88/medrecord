# D2 — Real Device Validation Checklist

Tested on: **iPhone via Expo Go**
Test date: **2026-02-22**
Build: `dev` branch — commits 14b6894, 5aa5ff1

---

## Mockup interactive behaviour

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Search bar focus indicator — blue border appears on tap | ✅ Confirmed | `isFocused` state + `searchBarActive` style; fires on `TouchableOpacity.onPress` |
| 2 | Search bar unfocus — border returns to grey on tap outside | ✅ Confirmed | `TouchableWithoutFeedback` wraps screen; `setIsFocused(false)` + `Keyboard.dismiss()` on outside tap |
| 3 | Cursor position — blinking cursor appears after last typed digit | ✅ Confirmed | `searchTypedRow` flex row; `flex:0` on typed text; `BlinkingCursor` sits flush after last digit |
| 4 | FAB keypad overlap — FAB does not overlap keypad key 3 | ✅ Confirmed | FAB moved from `position:absolute, bottom:320` into `fabRow` View between ScrollView and NumericKeypad |
| 5 | Typing works — digits enter correctly via keypad | ✅ Confirmed | `NumericKeypad` `onPress` wired to `handleKeyPress`; first-digit validation (0–5 rejected) works |

## Live screen behaviour (code-review only — not testable without backend)

| # | Item | Status | Notes |
|---|---|---|---|
| 6 | 401 session-expired banner | Code reviewed | `SessionExpiredBanner` renders on `ApiError.status === 401`; redirects after 2s |
| 7 | First-digit validation on live keypad | Code reviewed | `handleKeyPress`: `query.length === 0 && key < '6'` → `mobileError` state + red border |
| 8 | Auth guard on D2 mount | Code reviewed | `useEffect([token, user])` → `navigation.replace('Login')` if either falsy |

## Deferred — fix written, needs D1 navigation stack to test

| # | Item | Status | Notes |
|---|---|---|---|
| 12 | 401 session expired — red banner shown + redirect to Login after 2s | 🔶 Deferred | Fix written in `PatientSearchScreen.tsx`. `SessionExpiredBanner` renders on `ApiError.status === 401`; 2s timer then `navigation.replace('Login')`. Needs registered Login route to verify end-to-end. Verify during D1 session. |
| 13 | Auth guard on D2 mount — unauthenticated user cannot see screen | 🔶 Deferred | Fix written in `PatientSearchScreen.tsx` line 244. Synchronous `if (!token \|\| !user) return null` guard added before JSX (2026-02-23); `useEffect` redirect to Login follows. Needs registered Login route + NavigationContainer to verify. **Verify during D1 session:** (1) blank screen for one frame — no greeting, no patient list, no keypad visible; (2) immediate redirect to Login; (3) no patient data visible at any point. |

## Deferred — needs real device WiFi test

| # | Item | Status | Notes |
|---|---|---|---|
| 14 | Captive portal / no-internet WiFi — offline mode activates correctly | 🔶 Deferred | Fix written in `useNetworkStatus.ts`: `isConnected === true && isInternetReachable === true` required for online state; null treated as offline. Cannot reproduce in Expo Go simulator. Test on actual clinic-style WiFi before v1 launch. |

---

## Outstanding — not yet device-tested

These items remain open (tracked in `project-state.md` tech debt):

- H-2: Certificate pinning (pre-merge blocker)
- H-3: Offline audit log (pre-merge blocker)
- M-2: Full mobile number PII masking in list view
- M-3: Clear button touch target below WCAG 44×44px
