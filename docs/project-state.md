# Project State — MedRecord
_This file is updated at the end of every Claude Code session. Pass this file as context at the start of every new session._

## Current Status
**Phase:** D2 complete and real-device verified — next: D3 Patient Detail / History
**Last Updated:** 2026-02-23
**Last Session:** D2 auth guard investigation (2026-02-23). Identified two issues: (1) `App.tsx` renders the mockup directly — no navigation stack exists yet, so D2 is reachable without login at the app-entry level; (2) the auth guard in `PatientSearchScreen.tsx` was a `useEffect` only, meaning one frame of UI rendered before the redirect fired. Fixed (2) by adding a synchronous `if (!token || !user) return null` at line 244 (after all hooks, before JSX). App.tsx comment updated to document the structural gap. Checklist items 12, 13, 14 added as deferred. Verification of item 13 (auth guard end-to-end) deferred to D1 session — needs registered Login route + NavigationContainer. Committed 3bc3475. **Next: D3 mockup.**

---

## Decisions Made (Locked — Do Not Revisit Without Good Reason)

| Decision | Rationale |
|---|---|
| Mobile number is primary patient key | Simpler than Aadhaar, lower regulatory risk, higher coverage |
| Aadhaar stored as SHA-256 hash only | UIDAI compliance, data minimisation |
| Visit-triggered, append-only records | No simultaneous writes possible; simplifies sync |
| Last-write-wins sync (no CRDTs) | Sufficient given write model; avoids complexity |
| expo-sqlite directly (not WatermelonDB) | Less abstraction, easier to debug in field for v1 |
| Zustand + React Query for state | Proven pattern for offline-first RN apps |
| AWS ap-south-1 (Mumbai) for all storage | DPDP data localisation expectation |
| OCR is async, never blocks UI | Core UX principle — speed > features |
| Google Vision API (primary), Tesseract (fallback) | Vision API better accuracy on handwriting |
| S3 image storage deferred to v2 — images stored on device local filesystem only for now. Swap requires changing one storage handler function and one config value. | — |
| D7 (Document Scanner) defaults to manual tap-to-capture; auto-capture deferred to v2 | Auto-capture is unreliable on low-end Android under inconsistent clinic lighting |
| D5 (New Patient Form) must hash Aadhaar at the form submission boundary — raw Aadhaar must never travel through the call stack or reach any storage layer | UIDAI compliance; data minimisation; extends existing SHA-256 hash decision |

---

## Build Constraints — Doctor Visit Flow (D2, D5, D6, D7)
_Carry these into every build/mockup session for these screens._

- **D2 (Patient Search):** Offline SQLite search is the primary implementation path, not a fallback. Write the SQLite path first. The network path layers on top. Show offline state variant as a first-class design state.
- **D6 (New Visit):** Must include an explicit "consent not yet established" state variant in the mockup. Do not build D6 as if patient consent is always pre-granted — D9 (Consent Request Flow) will wire up later, but D6 must acknowledge the state exists.
- **D6 (New Visit):** Validate against the product-vision.md success metric: doctor completes a visit record in under 60 seconds. If the screen requires more than 3 taps to reach a submittable state, redesign before persona review.
- **D7 (Document Scanner):** Include a simple exposure/readability indicator before capture (e.g. too dark / good / overexposed). Do not rely on OCR feedback — this is basic camera exposure feedback only. Required for inconsistent clinic lighting conditions.

---

## Screens Built

| Screen | File | Session | Notes |
|---|---|---|---|
| D2 — Patient Search / Home | `mockups/D2PatientSearchScreen.tsx` (mockup) / `src/screens/doctor/PatientSearchScreen.tsx` (live) | 2026-02-19 | Static mockup approved. Live screen wired: SQLite primary path, GET /patients/lookup on 10 digits, server result cached to SQLite, offline banner + context card, sync badges, navigation stubs to D3/D5. **All agents run:** security audit v1 (BLOCKED), persona critique (3.2/5), QA test plan (`reviews/D2-qa-test-plan.md`). C-1/C-2/C-3 fixed (2026-02-20). Security re-audit v2 passed. All HIGH debt items closed (2026-02-22). **Real device verified (2026-02-22) on iPhone via Expo Go:** search bar focus/unfocus, cursor after digit, FAB position, digit entry — all confirmed. Checklist: `reviews/D2-VALIDATION-CHECKLIST.md`. **On `dev`. Do not merge to `main` until H-2 + H-3 resolved.** |

## Screens Pending
All remaining screens from screen-inventory.md (next: D3 — Patient Detail / History)

---

## Open Questions

| Question | Screen | Source | Status |
|---|---|---|---|
| Should `consent_granted` be stored in local SQLite and passed to D3 via nav params, or should D3 always re-fetch fresh from server on open? | D2→D3 | QA C-2 / Security H-1 | **Resolved 2026-02-20** — stored in SQLite, passed in PatientDetail nav params as `consentGranted`. D3 re-fetches fresh on open but uses this as the initial gate signal. |
| Should the `patients` table be scoped per `doctor_id` (filtered) or wiped entirely on logout? Wiping loses offline-only patients if doctor logs out mid-session. | D2 | QA C-1 / Security C-1 | **Resolved 2026-02-20** — scoped per `doctor_id`. `clearDoctorPatients(db, doctorId)` deletes only the logged-out doctor's rows. Other doctors' offline-only patients are preserved. |
| Should offline patient access audit logs be written to SQLite and synced in v1, or deferred to v2? | D2 | QA E-9 / Security H-3 | Unresolved — healthcare compliance decision (tracked as H-3 pre-merge blocker above) |

---

## Known Technical Debt

### CRITICAL — Must fix before merging D2 to main

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**C-1:** `clearAuth()` does not clear SQLite `patients` table → cross-doctor data leakage on shared clinic devices~~ | D2 | Security audit C-1 / QA C-1 | **CLOSED 2026-02-20** — `doctor_id` column added; `clearDoctorPatients()` + `useLogout` hook wipe SQLite on logout. |
| ~~**C-2:** `consent_granted` fetched from server but never stored in local schema; D3 receives no consent signal~~ | D2→D3 | Security audit H-1 / QA C-2 | **CLOSED 2026-02-20** — `consent_granted` column added to schema + `LocalPatient`; written in upsert; passed in PatientDetail nav params. |
| ~~**C-3:** React Query `QueryClient` not cleared on logout; stale patient + consent data from Doctor A served to Doctor B's session~~ | D2 | Security audit H-4 / QA C-3 | **CLOSED 2026-02-20** — `queryClient.clear()` is step 3 of the `useLogout` sequence. |

### HIGH — Must fix before merging D2 to main

| Item | Screen | Source | Notes |
|---|---|---|---|
| **H-2:** Certificate pinning not implemented — `apiFetch` uses bare `fetch()` with no SPKI pin; MITM possible on shared clinic WiFi | D2 | Security audit v2 H-2 | Required before merge to main. Use `expo-build-properties` OkHttp interceptor (Android) + NSURLSession delegate (iOS), or `react-native-ssl-pinning`. Pin leaf cert + one intermediate. |
| **H-3:** Offline patient access generates no audit log — `getRecentPatients` and `searchPatientsByMobile` return PII with zero audit trail when offline | D2 | Security audit v2 H-3 | Required before merge to main. Add `audit_events` SQLite table; call `logLocalAccess()` after each read; flush to server audit log on reconnect via `POST /sync`. |

### HIGH — Fix before D3 build

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~**H-1:** `getRecentPatients` not scoped to `doctor_id`; returns any doctor's patients on a shared device~~ | D2 | Security audit M-3 / QA H-1 | **CLOSED 2026-02-20** — resolved as part of C-1 fix. |
| ~~**H-2 (UX):** Auth errors (401) from `lookupPatient` silently swallowed by React Query; no user feedback on expired session~~ | D2 | Security audit M-1 / QA H-2 | **CLOSED** — `isError`/`error` destructured from `useQuery`; `useEffect` detects `ApiError` with `status === 401`, sets `sessionExpired` state, shows red banner "Your session has expired. Please log in again.", redirects to Login after 2s. |
| ~~**H-3 (UX):** No validation on first digit of Indian mobile number (valid: 6–9); numbers starting 0–5 trigger server lookup and may create invalid patient records~~ | D2 | Security audit M-2 / QA H-3 | **CLOSED** — `handleKeyPress` rejects digits 0–5 on first keystroke; sets `mobileError` state; inline red message "Mobile numbers start with 6–9" shown below search bar; cleared on valid input or clear. |
| ~~**H-4:** No auth guard on D2 mount; `getRecentPatients` runs before `token` is confirmed non-null~~ | D2 | Security audit L-3 / QA H-4 | **CLOSED** — `useEffect` on `[token, user]` calls `navigation.replace('Login')` if either is falsy; both `getRecentPatients` and `searchPatientsByMobile` effects guarded with `if (!token \|\| !user) return`. **Upgraded 2026-02-23:** synchronous `if (!token \|\| !user) return null` added at line 244 before JSX — screen renders nothing on first frame when unauthenticated. End-to-end verification deferred to D1 session (needs NavigationContainer + registered Login route). See checklist item 13. |
| ~~**H-5:** `useNetworkStatus` returns `true` when `isInternetReachable` is `null` (unconfirmed); triggers false server lookups on captive portal / no-internet WiFi~~ | D2 | QA H-5 | **CLOSED** — condition changed to `isConnected === true && isInternetReachable === true`; initial state changed to `false`; null treated as offline. |

### MEDIUM — Fix before production

| Item | Screen | Source | Notes |
|---|---|---|---|
| Full mobile numbers displayed in `PatientRow` — PII visible to bystanders in shared clinic spaces | D2 | Persona critique MUST FIX / QA M-2 | Use `formatMobile(mobile, true)` (last 5 digits only) in list view. Full number only in D3 post-consent. |
| Clear button touch target is 28×28px; below WCAG AA 44×44px minimum | D2 | Persona critique MUST FIX / QA M-3 | Expand `hitSlop` or increase button size to 44×44. |
| `searchPatientsByMobile` LIKE query not prefix-anchored (`%123%`); common digit sequences return noisy results | D2 | QA E-6 | Change to prefix-anchored LIKE pattern (`123%`). |
| Double-tap on `PatientRow` pushes two D3 screens onto navigation stack | D2 | QA E-7 | Add tap-guard ref; disable `onPress` immediately on first tap. |
| "Add New Patient" CTA fires with partial (3–9 digit) query; D5 receives invalid `prefillMobile` | D2 | QA E-8 | Only pass `prefillMobile` if `query.length === 10`. |
| `recentPatients` not refreshed when background sync completes while D2 is active | D2 | QA E-2 | Use `useFocusEffect` to re-run `getRecentPatients` on screen focus. |

### LOW / SHOULD FIX

| Item | Screen | Source | Notes |
|---|---|---|---|
| ~~Web preview keyboard input requires click-first-to-focus workaround~~ | web-preview | Infrastructure session 2026-02-20 | **CLOSED 2026-02-20** — `document.activeElement.blur()` added at end of `keyPress()` in `web-preview/D2.html`; physical keyboard works immediately after any button click. |
| ~~Web preview FAB overlap in has-data state~~ | web-preview | Infrastructure session 2026-02-20 | **CLOSED 2026-02-20** (session 2) — FAB hidden in has-data/no-match states via `setState()`; only visible in empty + offline states. Prior fix (flex row placement) was structural but FAB still appeared on screen. |
| ~~Web preview search bar click has no visual feedback~~ | web-preview | Infrastructure session 2026-02-20 | **CLOSED 2026-02-20** — `activateSearch()` adds `focused` class on click; blinking `|` cursor shown via CSS `::after` pseudo-element; cleared on first keypress, restored on clear. |
| ~~Web preview root URL shows directory listing~~ | web-preview | Infrastructure session 2026-02-20 | **CLOSED 2026-02-20** — `web-preview/index.html` added with meta-refresh redirect to `D2.html`; `http://localhost:3000/` now redirects automatically. |
| ~~Button overlap — root cause is duplicate new patient buttons visible simultaneously. Fix is visibility logic not positioning: show inline card when results exist, show FAB only when no results or empty state. Never show both together.~~ | D2 | Persona critique | **CLOSED 6a58a97** — FAB hidden in has-data state; `showFab = !isTyping \|\| showNoMatch` in live screen; `screenState !== 'has-data'` in mockup; CSS/JS updated in web preview. |
| ~~Search bar focus indicator — cursor appeared on right of placeholder instead of left; blue focus border lost on backspace; no cursor after last typed digit~~ | web-preview | Session 2026-02-22 | **CLOSED 5a95bed, 634c50c** — `::after` → `::before` on placeholder for left-aligned cursor; `active` class retained on backspace in `keyPress()`; `::after` added on `.search-bar.active .search-text` for cursor after typed digits. |
| ~~Real device: search bar no blue border on tap; no cursor visible before first digit~~ | D2 mockup | Real device session 2026-02-22 | **CLOSED 14b6894** — `isFocused` state added to root; `SearchBar` wrapped in `TouchableOpacity`; blue border (`searchBarActive`) and `BlinkingCursor` (Animated loop) shown on tap before any digit typed. Confirmed on iPhone. |
| ~~Real device: tapping outside search bar did not clear focus or grey border~~ | D2 mockup | Real device session 2026-02-22 | **CLOSED 5aa5ff1** — screen `View` wrapped in `TouchableWithoutFeedback`; outside tap calls `setIsFocused(false)` + `Keyboard.dismiss()`; inner touchables (keys, search bar, rows) handle their own events and do not propagate. Confirmed on iPhone. |
| ~~Real device: blinking cursor not visible after last typed digit~~ | D2 mockup | Real device session 2026-02-22 | **CLOSED 5aa5ff1** — `searchTypedRow` flex row wraps typed text + `BlinkingCursor`; `flex:0` on text node lets cursor sit flush after last digit. Confirmed on iPhone. |
| ~~Real device: FAB overlapping keypad key 3 (top-right key)~~ | D2 mockup | Real device session 2026-02-22 | **CLOSED 14b6894** — FAB removed from `position:absolute, bottom:320`; moved into `fabRow` View (`flexDirection:row, justifyContent:flex-end`) between ScrollView and NumericKeypad; never overlaps keys regardless of screen height. Confirmed on iPhone. |
| No combined offline + searching state | D2 | Persona critique | Mockup handles offline or searching but not both simultaneously; composite state needed |
| No name search — mobile-only lookup frustrates staff and tech-savvy doctors | D2 | Persona critique | Locked design decision (mobile as primary key); flag for product discussion before D3 build |
| Certificate pinning absent from API client | D2 | Security audit H-2 | Tracked above as pre-merge blocker. |
| Offline patient access generates no audit log | D2 | Security audit H-3 / QA E-9 | Tracked above as pre-merge blocker. |

---

## Rejected Ideas (Do Not Re-Propose)
| Idea | Why Rejected |
|---|---|
| Voice-based input for doctors | Core product principle: avoid new habits for doctors |
| Multi-doctor simultaneous edit | Structurally impossible given visit model; unnecessary complexity |
| Appointment scheduling in v1 | Out of scope; adds complexity without core value |
| Password-based auth | OTP is lower friction and reduces credential theft surface |
| Multi-staff concurrent editing | Out of scope. Visits are sequential append-only containers. A visit is owned by the opening doctor; staff can attach scans as separate record entries but cannot edit doctor notes. No locking mechanism needed — in practice, staff act sequentially on one device, not simultaneously. |

---

## GitHub Repository

**Repo URL:** https://github.com/rdevarakond88/medrecord
**Visibility:** Private — standalone repository, not a fork, not connected to any other project
**Primary branch:** `main`
**Branch strategy:**
- `main` — stable, reviewed code only
- `dev` — active development; all Claude Code sessions commit here
- Feature branches named: `feature/screen-d2-patient-search`, `feature/sync-queue`, etc.

**Commit convention:**
```
[screen/feature] short description

e.g.
[D2] Add patient search screen mockup
[sync] Implement offline queue processor
[security] Add consent check to visit endpoint
[docs] Update project-state after D2 approval
```

**What gets committed:**
- All `/docs` markdown files (always up to date)
- All `/agents` markdown files
- All source code
- `project-state.md` updated at end of every session

**What never gets committed:**
- `.env` files (secrets, API keys)
- `node_modules`
- Build artifacts (`/dist`, `/.expo`)
- Any file containing real patient data

---

## Environment Setup Notes

### Web Preview (WSL2 Windows)
- Pure-HTML preview tool at `web-preview/D2.html` — NOT an Expo build
- Expo web bundle approach abandoned: react-native-web + Metro dev server
  fails silently on WSL2 (lazy module loading + WebSocket issues)
- Run preview: `npm run web` → open http://localhost:3000/ (redirects to D2.html) or http://localhost:3000/D2.html directly
- Expo SDK 54 / React 19 / RN 0.81.5 installed (package.json)
- app.json: web.bundler=metro, web.output=single

## Dependency Versions

### Expo / React Native (installed)
- `expo` ~54.0.33
- `react` 19.1.0
- `react-dom` 19.1.0
- `react-native` 0.81.5
- `react-native-web` ~0.21.2
- `@expo/metro-runtime` ~6.1.2

### Required by D2 live screen (add to package.json if not present)
- `expo-sqlite` (^14.x — async API with useSQLiteContext)
- `expo-crypto` (^13.x — randomUUID)
- `@tanstack/react-query` (^5.x)
- `@react-native-community/netinfo` (^11.x)
- `@react-navigation/native` (^6.x)
- `zustand` (^4.x)
