# MedRecord — Lessons & Runbook

_Source of truth for environment setup, agent workflows, build mistakes, and the standard screen-building runbook. Based entirely on `docs/` and `agents/` files. Updated: 2026-03-03._

---

## Table of Contents

1. [Environment Setup — Issues and Fixes](#1-environment-setup--issues-and-fixes)
2. [Agent Workflow Rules](#2-agent-workflow-rules)
3. [Mistakes and Rules — D2, D3, D6 Builds](#3-mistakes-and-rules--d2-d3-d6-builds)
   - [3.4 Device Testing Mistakes (D2, D3, D6)](#34-device-testing-mistakes-d2-d3-d6)
   - [3.5 Process Mistakes](#35-process-mistakes)
4. [Standard Runbook — Building Each Screen](#4-standard-runbook--building-each-screen)

---

## 1. Environment Setup — Issues and Fixes

### 1.1 WSL2 + Expo Go on iPhone

**Problem: Port 8081 is blocked on WSL2.**
- Root cause: Windows Hyper-V permanently reserves port 8081; this bleeds into WSL2 and cannot be fixed.
- Fix: Run Metro on port 8082. The `npm start` script kills port 8082, starts Metro on 8082, and opens an ngrok tunnel.

**Problem: WSL2 LAN IP not reachable from iPhone.**
- Root cause: WSL2 LAN IP (172.x.x.x) is not reachable from devices on the same WiFi network.
- Fix: Use ngrok tunnel exclusively. `--host lan` was tried and abandoned. `@expo/ngrok` is in devDependencies.

**Tunnel URL format:**
```
exp://xxxx-anonymous-8082.exp.direct
```
- URL changes every ngrok session (free tier). Get current URL: `curl -s http://localhost:4040/api/tunnels`
- ngrok subdomain persists across Metro restarts within the same session. Only changes when the ngrok process is killed.

**Expo Go troubleshooting:**
- Always force-quit Expo Go on the device before retrying after a server restart.
- Hermes bytecode bundle is 5–6 MB. Plain JS bundle is 6 MB. Both serve correctly.

**Problem: "App entry not found" error in Expo Go.**
- Root causes (both must be present):
  1. Missing `registerRootComponent(App)` in `App.tsx` — do not rely on `export default` alone.
  2. A screen navigates to a route name (e.g., `'Login'`) that is not registered in the navigator.
- Rule: Always register ALL routes that any screen navigates to, even if the target is a stub.
- Example: `PatientSearchScreen` calls `navigation.replace('Login')` on mount when no token exists. `'Login'` must be a registered route in App.tsx or the app crashes on every cold start.

### 1.2 Web Preview (WSL2 Windows)

**Expo web bundle approach abandoned.**
- Root cause: `react-native-web` + Metro dev server fails silently on WSL2 (lazy module loading + WebSocket issues).
- Fix: Pure-HTML preview tool at `web-preview/D2.html`. Not an Expo build.
- Run: `npm run web` → opens `http://localhost:3000/` (redirects to D2.html via meta-refresh in `web-preview/index.html`).

**Web preview known fixes applied (all closed):**
- Keyboard input required click-first-to-focus → fixed with `document.activeElement.blur()` at end of `keyPress()`.
- FAB overlap in has-data state → fixed by hiding FAB in has-data/no-match states via `setState()`.
- Search bar click had no visual feedback → fixed with `focused` CSS class + blinking cursor `::after` pseudo-element.
- Root URL showed directory listing → fixed with `web-preview/index.html` meta-refresh redirect.
- Cursor appeared on right of placeholder instead of left → `::after` changed to `::before`.
- Blue focus border lost on backspace → `active` class retained on backspace in `keyPress()`.

### 1.3 Dev Server Command

```bash
npm start
# Kills port 8082, starts Metro on 8082, opens ngrok tunnel
```

### 1.4 Installed Dependencies

These were missing from `package.json` and had to be added (2026-02-24):
```
expo-sqlite, expo-crypto, @tanstack/react-query, @react-navigation/native,
@react-navigation/native-stack, react-native-screens, react-native-safe-area-context,
@react-native-community/netinfo, zustand
```

`@react-native-community/datetimepicker` is bundled with Expo SDK 54 but not explicit in `package.json`. If TypeScript errors occur: `npx expo install @react-native-community/datetimepicker`.

### 1.5 Dependency Versions

| Package | Version |
|---|---|
| expo | ~54.0.33 |
| react | 19.1.0 |
| react-native | 0.81.5 |
| react-native-web | ~0.21.2 |
| expo-sqlite | ^14.x (async API with useSQLiteContext) |
| expo-crypto | ^13.x (randomUUID) |
| @tanstack/react-query | ^5.x |
| @react-navigation/native | ^6.x |
| zustand | ^4.x |

---

## 2. Agent Workflow Rules

### 2.1 Builder Agent (agent-builder.md)

**Before writing any code:**
1. Read `ui-ux-spec.md` for any screen.
2. Read `data-models.md` for any data operation.
3. Read `api-contracts.md` for any API call.
4. Read `offline-sync-spec.md` for any sync logic.
5. Read `consent-layer-spec.md` for any consent check.

**Non-negotiable rules:**
- Never expose patient data without a consent check. Flag with a comment if unsure.
- Offline first, always. Every write: local SQLite first, then network. Network never blocks the UI.
- No placeholder security. Auth, consent checks, and input validation must be present in the feature, not deferred via `// TODO` comments.
- No mandatory fields beyond what the spec requires. Zero friction is the product's survival condition.
- Use realistic test data only: Indian names, Indian mobile numbers (10 digits, starting 6–9), realistic clinical content. Never use "foo", "bar", "test", "lorem ipsum".

**When to stop and ask (do not guess):**
- Any spec ambiguity.
- Any security decision with multiple valid approaches.
- Any offline edge case not in `offline-sync-spec.md`.
- Any performance concern on low-end Android (< 2GB RAM).
- Any MUST FIX from persona critique that is technically not feasible → flag as: `BLOCKED: [item] — [reason]`.

**Output format for every feature:**
- Complete file(s), never partial snippets unless explicitly asked.
- Brief summary (3–5 lines) of what was built and decisions made.
- Follow-up questions if anything was unclear.

**End-of-session protocol (do without being asked):**
1. Save design notes / build summary to `reviews/{ScreenID}-build-notes.md` if the session produced content worth preserving.
2. Update `docs/project-state.md` — one clean snapshot of current reality, not an append-only log.
3. Commit and push to `dev` using project commit convention.
4. Confirm short commit hash.

### 2.2 PM Agent (agent-pm.md)

**Invoked at exactly three moments:**

**Moment 1 — Pre-Flow Gate** (before a new flow is built):
- Does this flow solve a real problem for this market?
- Are there regulatory blockers?
- Is the timing right?
- Any Indian clinic reality that should change the approach?

**Moment 2 — Post-Flow Review** (after all screens are approved):
- Does the flow hold together as a real product experience?
- What would cause a doctor to abandon it mid-flow?
- What would cause low adoption at clinic level?
- Any regulatory or trust risks introduced?

**Moment 3 — Pre-Launch Gate** (before v1 is declared ready):
- Is this genuinely ready for a semi-urban Indian clinic pilot?
- Highest risk thing that could go wrong in the field?
- What would make a doctor uninstall within week 1?
- What belongs in v1.1 and should not delay launch?

**Rules:**
- Never reopen decisions locked in `docs/project-state.md` without a genuine regulatory or market reason.
- Never comment on code quality, UI details, or implementation choices — those are Builder/QA/Security/Persona domains.

**End-of-session protocol:**
1. Save PM review to `reviews/{ScreenID}-pm-review.md`.
2. Update `docs/project-state.md`.
3. Commit and push to `dev`.
4. Confirm commit hash.

### 2.3 QA Agent (agent-qa.md)

**8 test categories to run on every feature:**
1. Offline/Connectivity — works with no connectivity, mid-drop, mid-sync, after app kill, after 72h offline.
2. State & Navigation — back press mid-flow, phone call mid-capture, app background/foreground, double-tap submit, screen rotation.
3. Data Integrity — visit with zero records prevented, duplicate mobile handled, orphaned records, soft-delete visible nowhere.
4. OCR — empty text, garbled text, blurry/dark image, timeout, completion after patient discharged.
5. Consent Edge Cases — immediate access after grant, blocked within one sync after revoke, expired OTP, duplicate grant, revoke while doctor has history open.
6. Sync Conflict — two devices create visit simultaneously, patient creates own account after doctor, UUID collision, queue failure at item 47 of 200.
7. Input Validation — future date, letters in mobile, 9-digit mobile, mobile starting 0 or 1, PDF upload, 50MB image, 10,000-char note, SQL injection strings, emojis.
8. Low-End Device — camera with <1GB storage, app load <3s on 2GB RAM, image compression with <100MB free, SQLite query <200ms for 500 visits.

**6 known failure modes to always check:**
1. **Stale closure in async callbacks** — sync worker must read fresh state each cycle.
2. **SQLite writes without transactions** — multi-step writes must be wrapped in `withTransactionAsync()`.
3. **Image path drift** — absolute paths on Android can change after app update; check path-resolution strategy.
4. **Queue runaway** — verify max retry count and dead-letter state exist.
5. **Race condition on consent OTP** — consent grant must be upserted, not inserted.
6. **JWT refresh during sync** — API client must intercept 401s, refresh token, retry the failed request.

**End-of-session protocol:**
1. Save test plan to `reviews/{ScreenID}-qa-test-plan.md`.
2. Update `docs/project-state.md`.
3. Commit and push to `dev`.
4. Confirm commit hash.

### 2.4 Security Agent (agent-security.md)

**Absolute rules — no exceptions:**
- Will not approve code with any CRITICAL finding.
- Will not let Aadhaar plaintext pass under any circumstances.
- Will not let public S3 URLs pass under any circumstances.
- Will not let a consent check be skipped "for now."
- Will not accept "TODO: add auth later" comments.

**Escalate immediately (halt all development) if:**
1. Patient records accessible without any auth token.
2. Aadhaar plaintext found in codebase, logs, or API response.
3. S3 bucket with public-read policy.
4. Cross-patient data leakage (one doctor's query returning another doctor's patients).
5. Consent check entirely absent on a cross-doctor data endpoint.
6. PII (names, phone numbers) written to `console.log` in any environment.

**Consent signal must be verified end-to-end.** Presence of a consent check in code is not sufficient — trace the full data flow: server → API response → SQLite write → SQLite read → every downstream screen that depends on it.

**End-of-session protocol:**
1. Save audit to `reviews/{ScreenID}-security-audit.md`.
2. Update `docs/project-state.md`.
3. Commit and push to `dev`.
4. Confirm commit hash.

### 2.5 Persona Critic Agent (agent-persona-critic.md)

**5 personas:**
1. **Dr. Ramakant Sinha** (58, Mau UP) — Reluctant Doctor. Core fear: dependency on technology that can fail. Evaluates: is this faster than paper? Does it work offline? How many taps?
2. **Dr. Priya Nair** (32, Coimbatore) — Tech-Savvy Doctor. Core desire: all patient data in one place, trends, audit trail. Will push to limits, benchmark against other apps.
3. **Sunita** (34, Nashik) — Clinic Reception Staff. Core desire: app makes her job easier. Evaluates: workflow gaps between doctor and patient experience, edge cases like missing phone for OTP.
4. **Shantabai Kadam** (71, Satara) — Elderly Patient. Core desire: show the doctor what medicines she's taking. Evaluates: text legibility, confusion, privacy perception.
5. **Arjun Mehta** (38, Bhopal) — Semi-Savvy Patient. Core desire: share records with new doctor without carrying papers. Evaluates: privacy, onboarding length, Hindi support.

**Scoring thresholds:**
- MUST FIX: any single persona scores ≤ 2, or weighted average < 3.0.
- SHOULD FIX: friction points 2+ personas agree on.
- NICE TO HAVE: one persona's preference that conflicts with another's needs.

**Verdict options:** Ship as-is / Revise and re-evaluate / Redesign.

**End-of-session protocol:**
1. Save critique to `reviews/{ScreenID}-persona-critique.md`.
2. Update `docs/project-state.md` — record score, verdict, and MUST FIX / SHOULD FIX items in Known Technical Debt.
3. Commit and push to `dev`.
4. Confirm commit hash.

### 2.6 Session Commit Convention

```
[screen/feature] short description

Examples:
[D2] Add patient search screen mockup
[D3] Security audit complete
[D6] Fix KeyboardAvoidingView + mobile number masking in header
[sync] Implement offline queue processor
[security] Add consent check to visit endpoint
[docs] Update project-state after D3 approval
```

**What gets committed:** All `/docs`, `/agents`, `/src`, `project-state.md`.
**What never gets committed:** `.env` files, `node_modules`, build artifacts (`/dist`, `/.expo`), any file containing real patient data.

---

## 3. Mistakes and Rules — D2, D3, D6 Builds

### 3.1 D2 — Patient Search / Home

**CRITICAL bugs found and fixed:**

**C-1: Cross-doctor data leakage on shared devices.**
- `clearAuth()` did not clear the SQLite `patients` table. Logging out on a shared clinic device left Doctor A's patients visible to Doctor B.
- Fix: Added `doctor_id` column to `patients` table. `clearDoctorPatients(db, doctorId)` deletes only the logged-out doctor's rows. Other doctors' offline-only patients are preserved.
- Rule: The `patients` table must always be scoped per `doctor_id`, never wiped entirely on logout (would destroy offline-only patients if doctor logs out mid-session).

**C-2: Consent signal never reached D3.**
- `consent_granted` was fetched from server but never stored in local SQLite schema. D3 received no consent signal.
- Fix: Added `consent_granted` column to `patients` table and `LocalPatient` type. Written in upsert. Passed in `PatientDetail` nav params.

**C-3: Stale data from Doctor A served to Doctor B.**
- React Query `QueryClient` not cleared on logout. Stale patient + consent data from Doctor A could be served to Doctor B's session.
- Fix: `queryClient.clear()` is step 3 of the `useLogout` sequence.

**HIGH bugs found and fixed:**

- **H-1:** `getRecentPatients` not scoped to `doctor_id`. Fixed as part of C-1 (same `doctor_id` column).
- **H-2:** Auth errors (401) from `lookupPatient` silently swallowed by React Query. Fixed: `isError`/`error` destructured; 401 detected and shown as red banner, redirects to Login after 2s.
- **H-3:** No validation on first digit of Indian mobile number. Fixed: `handleKeyPress` rejects digits 0–5 on first keystroke; inline red error "Mobile numbers start with 6–9".
- **H-4:** No auth guard on D2 mount. Fixed: synchronous `if (!token || !user) return null` before JSX (after all hooks). Rule: this pattern applies to ALL screens.
- **H-5:** `useNetworkStatus` returns `true` when `isInternetReachable` is `null` (captive portal / no-internet WiFi). Fixed: condition changed to `isConnected === true && isInternetReachable === true`; initial state `false`; null treated as offline.

**Real-device bugs found (iPhone, 2026-02-22):**

- Search bar had no blue border on tap, no cursor before first digit. Fixed: `isFocused` state + `TouchableOpacity` wrapper + `BlinkingCursor` Animated loop.
- Tapping outside search bar did not clear focus. Fixed: outer `TouchableWithoutFeedback` calls `setIsFocused(false)` + `Keyboard.dismiss()`.
- FAB overlapping keypad key 3 (top-right). Root cause: `position:absolute, bottom:320` is fragile across device heights. Fix: moved FAB into `fabRow` View (`flexDirection:row, justifyContent:flex-end`) between ScrollView and NumericKeypad. Never overlaps regardless of screen height.
- Rule: **Never use `position:absolute` with hardcoded `bottom` value for FABs.** Use flex row placement.

**Rules established in D2:**

- `getRecentPatients` and `searchPatientsByMobile` must both be guarded: do not run if `!token || !user`.
- SQLite LIKE queries must be prefix-anchored (`123%` not `%123%`).
- `onPress` on patient rows must have a tap-guard ref to prevent double-navigation. Use `useRef(false)` (synchronous), not `useState` (async — lag creates race window).
- "Add New Patient" CTA must only pass `prefillMobile` to D5 if `query.length === 10`.
- `recentPatients` must be refreshed on screen focus via `useFocusEffect`.
- Mobile numbers in list views must be masked (last 5 digits only). Full number only in D3 post-consent.

### 3.2 D3 — Patient Detail / History

**CRITICAL bugs found in mockup and fixed before live build:**

- **D3-C-1:** Chief complaint text rendered in grayed visit cards (no-consent variant) — clinical content visible without consent. Fix: `{ ...visit, chiefComplaint: null }` passed to all grayed `VisitCard` components.
- **D3-C-2:** Own-doctor visits not distinguished from other-doctor visits in no-consent variant — all visits grayed indiscriminately. Fix: Fourth variant `D3PatientDetailHasDataOwnVisitsOnly` added, modeling `myVisits` (expandable) + `otherDoctorVisits` (grayed, chiefComplaint null).

**Rule from D3-C-2:** The API must return two separate visit lists — `myVisits` (doctor's own records, always returned) and `otherDoctorVisits` (consent-gated, `chief_complaint` excluded at the query layer). Do not rely on UI graying alone.

**CRITICAL bugs found in live screen and fixed:**

- **C-1:** `chief_complaint` rendered in grayed cards via stale SQLite cache when `offlineConsent=false`. Fix: offline path strips `chief_complaint` from `otherVisits` when `offlineConsent=false`. Enforced at data assignment, not in `VisitCard`.
- **H-1:** Offline consent gate used stale `navConsentGranted` nav param instead of fresh SQLite read. Fix: offline path calls `getPatientByLocalId(db, patientLocalId)` to get current `consent_granted`. Nav param is the initial signal only, not the gate.
- **H-2:** `visits` table not doctor-scoped — `getCachedVisits` returned any doctor's rows. Fix: `cached_by_doctor_id TEXT NOT NULL DEFAULT ''` column added; `getCachedVisits(db, patientId, doctorId)` and `upsertVisitsFromServer(..., doctorId)` filter/write by doctor. New index `idx_visits_doctor_patient` added.
- **H-3:** `useLogout` did not clear `visits` table. Fix: `clearDoctorVisits(db, doctorId)` added; called in `useLogout` as step 2b immediately after `clearDoctorPatients`.

**Rules established in D3:**

- Every screen must have synchronous auth guard: `if (!token || !user) return null` AFTER all hooks, before JSX. This is the D2 pattern — apply to all screens.
- Do not render visit history until server-side consent re-fetch completes. Use loading skeleton on mount; fall back to SQLite cache only when `isConnected === false`.
- Use `useFocusEffect` for consent re-fetch on every screen focus. This handles D9 returning and pushing back to D3 without requiring navigate-away-and-back.
- `AppState` foreground re-verify for consent.
- `recordCount === 0` must display `'Draft'` with amber pill, not "0 records".
- `numberOfLines={1}` + `ellipsizeMode="tail"` on patient names to prevent long names pushing content off-screen.
- Do not show consent badge in empty state — it is semantically misleading.
- `Request Access` button must have an offline guard. If offline, show "Cannot send consent request — no internet connection."
- Use `FlatList` with `maxToRenderPerBatch={10}`, `windowSize={5}`, `initialNumToRender={10}`, `removeClippedSubviews` for visit lists. Never `ScrollView` + `map` — will OOM on 200+ visits on 2GB RAM device.
- `logConsentAccess()` must be called on D3 mount when consent is granted — DPDP audit trail.

### 3.3 D6 — New Visit

**CRITICAL security bugs found and fixed (2026-03-02):**

- **CRITICAL-1:** `sync_queue` not cleared on logout — unsynced operations from Doctor A could be processed under Doctor B's session. Fixed: `clearDoctorSyncQueue(db, doctorId)` added to `useLogout`.
- **CRITICAL-2:** `sync_queue` had no `doctor_id` column — could not be doctor-scoped. Fixed: column added to schema.

**HIGH security bugs found and fixed:**

- **HIGH-1:** `noteText` omitted from the API call body in `createVisit()`. Fixed: `note_text` included in payload.
- **HIGH-2:** `visits_draft` not marked `synced` after `createVisit()` succeeds. Fixed: status updated to `synced` after successful server response.
- **HIGH-3:** No DPDP audit event emitted on visit creation. Fixed: `logVisitCreation()` added.
- **HIGH-4:** `doctorId` IDOR risk — comment and code reviewed; doctorId sourced from auth token, not from nav params or client input.

**Rules established in D6:**

- **Tap guard pattern:** Use `useRef(false)` (synchronous) NOT `useState` (async) for double-submit prevention. State setter lag creates a race window; refs close it. `isSavingRef.current = true` at the start of `handleSave()`; reset it before `navigation.goBack()` on success path (or in `finally` block) so it doesn't get permanently locked.

- **Offline-first write ordering (strict):** SQLite write → `enqueueOperation()` → API call. Both SQLite and sync queue operations must be wrapped in `db.withTransactionAsync()` so they succeed or fail atomically. Partial failure leaves an orphaned sync queue entry.

- **Back navigation discard guard:** Use `navigation.addListener('beforeRemove')` — covers iOS swipe-back, Android hardware back, and custom back button in one place. Use `savingCompletedRef` to allow programmatic `goBack()` from save-success without triggering the discard dialog.

- **Mobile number masking in headers:** Never show the full patient mobile number in D6 header. Use masked format (`•••••` + last 5 digits). Matches D2 list view pattern.

- **KeyboardAvoidingView is required.** Without it: (1) Save Visit button is hidden behind keyboard when note field is active; (2) note text field scrolls out of view — doctor cannot see what they are typing. Wrap full screen content with `behavior='padding'` on iOS and `behavior='height'` on Android.

- **Consent re-verification at save time:** Do not trust the `consentGranted` nav param at save time — it may be stale. Re-read `consent_granted` from SQLite via `getPatientByLocalId()` inside `handleSave()` before calling `insertLocalVisit()`.

- **visits_draft UNION in getCachedVisits:** The UNION query must handle offline-only patients with `NULL patient_server_id`. Add `OR (patient_server_id IS NULL AND patient_id = ?)` branch bound to local patient ID — otherwise draft visits for offline-only patients return zero rows in D3.

- **Unsynced draft guard on logout:** Check for pending `visits_draft` rows before logout; warn doctor with count and require explicit confirmation. Silent deletion of unsynced visits is irreversible data loss.

- **Visit date validation at save time:** Enforce `visitDate <= today` inside `handleSave()`, not only at the picker layer. State can be manipulated.

- **D6 must acknowledge "consent not yet established" state.** Build and show the no-consent variant. D9 will wire up later, but D6 must not assume consent is always pre-granted.

- **D6 success metric gate:** Validate against the product-vision.md metric: doctor completes a visit record in under 60 seconds. If the screen requires more than 3 taps to reach a submittable state, redesign before persona review.

### 3.4 Device Testing Mistakes (D2, D3, D6)

These rules were learned exclusively through real-device testing. Web preview and simulator never surface them.

---

**RULE 1 — Visual hiding is not data hiding**
_Learned in D3._

Using opacity, colour, or CSS to visually hide sensitive data is not sufficient. Chief complaint was visible through gray opacity in no-consent cards. Fix: strip sensitive fields from the data before it reaches the component. Access control must happen at the data layer, not the display layer. Never rely on visual styling to protect patient data.

---

**RULE 2 — iOS keyboard behaviour requires explicit handling**
_Learned in D2._

On iOS, tapping outside a text input does not dismiss the keyboard by default. Wrap the entire screen in `TouchableWithoutFeedback` calling `Keyboard.dismiss()`. Without this, the keyboard stays open permanently after the user taps away from the input.

---

**RULE 3 — iOS search bar focus requires explicit state**
_Learned in D2._

On iOS, a custom search bar shows no visual feedback on tap without explicit `isFocused` state + `TouchableOpacity` wrapper + blinking cursor `Animated` loop. Web preview never reveals this — it only appears on a real device.

---

**RULE 4 — FAB overlap: never use `position:absolute` with hardcoded bottom values**
_Learned in D2._

`position:absolute` with hardcoded `bottom` values is fragile across device heights and overlaps other elements. This was fixed three times before the root cause was identified. Fix: always use flex row placement for FABs. Never hardcode bottom position values.

---

**RULE 5 — Two buttons for the same action must never appear simultaneously**
_Learned in D2._

The inline "Create New Patient" card and the FAB were both visible at the same time. Fix: control visibility logic so only one appears at a time based on screen state. Never fix overlap by adjusting positioning — fix the visibility logic.

---

**RULE 6 — Red consent banner is expected behaviour without a backend**
_Learned in D3._

"Could not verify consent — showing limited view" banner is correct behaviour when no backend server is running. Do not treat it as a bug during development. The app fails secure — shows no-consent view when the server is unreachable. This is by design.

---

**RULE 7 — Modal conditional mounting causes blank screen on iOS**
_Learned in D6._

Mounting a `Modal` conditionally with `{showModal && <Modal>}` causes a blank screen on iOS because the native presentation animation fires before content renders. Fix: always mount the `Modal` unconditionally in the React tree. Control visibility with the `visible` prop only:
```tsx
<Modal visible={showModal}>
```

---

**RULE 8 — `display="spinner"` is unreliable on iOS**
_Learned in D6 after 4 failed attempts._

`@react-native-community/datetimepicker` with `display="spinner"` renders invisible wheels on some iOS versions. Use `display="compact"` for iOS date pickers — renders a native iOS popover calendar that works reliably on all iOS 14+.

---

**RULE 9 — Native components require an explicit parent container**
_Learned in D6._

Any third-party native component (`DateTimePicker`, `Camera`, `Maps`) must be wrapped in an explicit parent `View` with defined `width`, `backgroundColor` (`#FFFFFF`), `padding`, and `borderRadius`. Without a container, the native layer ignores the `value` prop and may render invisible or zero-height content.

---

**RULE 10 — UI contrast must be verified on device**
_Learned in D6, occurred multiple times._

Building UI components without verifying contrast on a real device results in invisible elements — white spinner wheels on white background, overlapping text on matching backgrounds. Before adding any new UI component, state explicitly what background colour it renders against. If contrast cannot be verified without a device, add a code comment flagging it as `// requires device contrast verification`.

---

**RULE 11 — Metro cache requires explicit clear after native changes**
_Learned in D6._

After any native component change or SQLite schema migration, shake → Reload in Expo Go is not sufficient. Always run `npm start -- --clear` and force-quit Expo Go completely before reloading. Failure to do this results in the old bundle running silently with no error.

---

**RULE 12 — Schema migrations are mandatory for existing device databases**
_Learned in D6._

Every new column added to any SQLite table must have a corresponding `ALTER TABLE` migration wrapped in `try/catch` immediately below the `CREATE TABLE` definition. Missing migrations cause "no such column" crash on existing device databases. This happened with `is_own_visit` during D6 device testing. A fresh install would not catch this — always test schema changes on a device with an existing database.

---

### 3.5 Process Mistakes

---

**Mistake 9 — PM pre-flow gate skipped for D3 and D6**

What happened: The PM agent was created during D2 with instructions to run before every new screen. The transition brief for D3 and D6 did not include it. It was silently dropped for two screens.

Rule going forward: The PM pre-flow gate is mandatory before every new screen session. It must be the first item in CONTEXT-TRANSFER.md and the first step in every new screen chat. If it was skipped for a completed screen, run it retroactively before that screen is merged to main.

---

**Mistake 10 — Backend Agent session not triggered after api-contracts.md was modified by Security Audit**

What happened: The D9 Security Audit C-1 finding required replacing `POST /consent` with two new endpoints (`POST /consent/request` + `POST /consent/verify`) in `api-contracts.md`. The Builder applied the contract change. No Backend Agent session was run to implement and deploy those endpoints. The Device Tester pre-flight discovered both endpoints return 404. D9 device testing was blocked.

Root cause: The Backend Agent step (Step 11) is documented as running "after ALL frontend screens for the flow are complete." But a Security Audit mid-flow that modifies `api-contracts.md` creates a new backend obligation that the existing Step 11 trigger condition does not cover. The blocker was noted in `project-state.md` but no session was queued — the note was passive, not a hard gate.

Rule going forward: Any time a Security Audit **modifies `api-contracts.md`** (adds, renames, or restructures endpoints), the next session must be Backend Agent (Step 11) — not Device Tester. When closing a Security Audit session, the agent must explicitly check whether `api-contracts.md` was changed and, if so, set "Backend Agent session required" as Priority 1 in `project-state.md` Recommended Next Session Order, ranked above Device Tester. The Device Tester pre-flight (Step 8 Part A) also enforces this — see item 5 added to that checklist.

---

**Mistake 11 — Persona Critic skipped after P1 mockup; project-state.md contradicted CLAUDE.md**

What happened: The P1 mockup Builder session ended and updated `project-state.md` with "Builder: P2 mockup" as the next item (item 10), batching all Persona Critic reviews to a single item 14 ("After all patient mockups built"). This directly contradicts the CLAUDE.md rule: "Persona Critic — After **every** mockup is built." The following session (this one) opened as a Builder Agent for P2 without questioning the sequence, because it read project-state.md and followed what was written there. The user caught the error by recalling that the previous session had verbally indicated Persona Critic was next.

Root cause: project-state.md is the ground truth every session reads. CLAUDE.md has the rule, but there was no enforcement mechanism — the rule relied entirely on the previous session writing project-state.md correctly. When the file contradicted the rule, the file won.

Rule going forward:
1. When a Builder session ends after completing a mockup, the next item written into `project-state.md` MUST be a Persona Critic session for that screen. Two consecutive Builder mockup sessions with no Persona Critic between them is a workflow violation.
2. If the opening session status line shows two consecutive Builder mockup sessions with no Persona Critic between them, the agent must stop, flag the violation, correct the sequence, and ask the user before proceeding.
3. This rule is now explicitly documented in CLAUDE.md under "Mandatory Builder → Persona Critic Sequence."

How it was caught: The user remembered from the previous session that Persona Critic was declared as next, and questioned why a Builder session had been opened instead. The agent had not caught the contradiction between project-state.md and CLAUDE.md at session start.

---

**Mistake 12 — Reading a reference screen before building a new one without announcing the reason**

What happened: A Builder session for P2 opened and read `PatientLoginScreen.tsx` (P1) before writing any P2 code — standard practice for matching code style. But no explanation was given upfront. The user saw a P1 file being read in a P2 session and interrupted to ask whether the wrong screen was being worked on.

Root cause: The Builder reads an existing screen as a code reference before writing a new sibling screen (imports, StyleSheet structure, mock data format, TypeScript conventions, DEV demo switcher pattern). This is correct behaviour, but it looks like working on the wrong thing to anyone watching the tool calls.

Rule going forward: Whenever the Builder reads an existing screen solely as a style/pattern reference — not to modify it — state this explicitly before opening the file. A single sentence is enough:

> "Reading PatientLoginScreen.tsx as a code reference for P2 — not modifying it."

This applies any time a file is read for reference purposes that is not the file being built.

---

**Mistake 13 — Builder registered a new flow's root screen in App.tsx but never added a dev navigation entry point to reach it**

What happened: PatientLoginScreen (P1) was built and registered in App.tsx. No existing screen navigates to it — it is the root of the patient app flow. The QA test plan assumed "tap PatientLogin from developer navigation" but that navigation didn't exist. The Device Tester discovered this at session start; device testing was blocked before a single test case could run.

Root cause: Route registration in App.tsx prevents crashes (Rule 1.1) but does not guarantee reachability. For screens mid-flow, a parent screen provides the path. For screens that are the root of a new navigation flow, no parent exists yet — the Builder must create one explicitly. There is a difference between a route being *registered* and being *reachable*.

Rule going forward: Whenever a Builder session creates the first screen of a new navigation flow (i.e., no registered screen navigates to it), the Builder must also add a dev-only entry point — a `{__DEV__ && ...}` button on the closest existing screen — before closing the session. This check is now step 3 of the Builder End-of-Session Protocol in `agents/agent-builder.md`. The session is not complete until the new screen is reachable on a device.

---

## 4. Standard Runbook — Building Each Screen

### Step 1: Read Before Writing

Before any code:
- `docs/ui-ux-spec.md` — layout, behaviour, design notes for the screen.
- `docs/data-models.md` — entities, fields, relationships.
- `docs/api-contracts.md` — request/response shapes, error codes.
- `docs/offline-sync-spec.md` — sync queue behaviour, ordering, ID resolution.
- `docs/consent-layer-spec.md` — what is accessible with and without consent.
- `docs/project-state.md` — Build Constraints section for the specific screen. Locked Decisions table.

### Step 2: Build a Static Mockup First

- Use hardcoded, realistic data (Indian names, 10-digit mobile numbers starting 6–9).
- Show **all interactive states:** empty, loading, has-data, no-consent, offline, error.
- Do not wire up real API calls — use mock functions that return promises with fake data.
- Layout must match the spec. Touch targets minimum 48×48px.
- Add a comment block at the top of the file: what it does, what spec it implements.

### Step 3: Security Audit (Mockup)

Run agent-security.md checklist against the mockup before the live build begins. Catch consent violations, PII exposure, and auth gaps at mockup stage — cheaper to fix than in live code. All CRITICAL findings must be closed before live build starts.

### Step 4: Persona Critique

Run agent-persona-critic.md evaluation against the mockup. All MUST FIX items must be resolved before the live build. SHOULD FIX items are tracked in `docs/project-state.md` Known Technical Debt.

### Step 5: Build the Live Screen

Follow these rules in order:

**Auth guard first (after all hooks):**
```tsx
if (!token || !user) return null
```

**Every write operation:**
1. Write to local SQLite first (inside `db.withTransactionAsync()` if the write involves multiple tables or the sync queue).
2. Enqueue to `sync_queue` in the same transaction.
3. Make API call after local write succeeds.
4. Never block the UI on network.

**Consent gating:**
- Online path: wait for server response before rendering any other-doctor visit data.
- Offline path: read `consent_granted` from SQLite (fresh, not from nav params).
- Never use nav params as the sole consent gate at save time.

**Navigation guards:**
- Register every route target in App.tsx, even stubs.
- For flow-root screens (nothing navigates to them yet), also add a `{__DEV__ && ...}` entry point on the closest existing screen — registration alone does not make a screen reachable on device (Mistake 13).
- Add `navigation.addListener('beforeRemove')` for screens with unsaved state.
- Use `savingCompletedRef` to allow programmatic `goBack()` without triggering the discard dialog.
- Use `useRef(false)` tap guard for submit buttons, not `useState`.

**Lists:**
- Use `FlatList` with `maxToRenderPerBatch={10}`, `windowSize={5}`, `initialNumToRender={10}`, `removeClippedSubviews`. Never `ScrollView` + `map`.

**PII display:**
- Mobile numbers in list/header views: masked (last 5 digits only, `•••••` prefix).
- Patient name: `numberOfLines={1}` + `ellipsizeMode="tail"` everywhere.
- Never log patient names or mobile numbers to `console.log`.

**Keyboard:**
- Wrap full screen content in `KeyboardAvoidingView` with `behavior='padding'` (iOS) / `behavior='height'` (Android).

**Network status:**
- Online only when `isConnected === true && isInternetReachable === true`. Null treated as offline.

### Step 6: QA Test Plan

Run agent-qa.md categories (especially Offline/Connectivity, Data Integrity, Consent Edge Cases). Save test plan to `reviews/{ScreenID}-qa-test-plan.md`.

### Step 7: Security Re-Audit (Live Screen)

Re-run security checklist on the live screen code. All CRITICAL and HIGH findings must be closed before device testing.

### Step 8: Device Testing

Test on a real device via Expo Go. Key items to verify:
- All touch targets tappable without precision.
- FAB does not overlap keypad or other elements at various device heights.
- Keyboard does not obscure Save button or active text field.
- Offline mode: search, recent list, save — all function without connectivity.
- Back navigation discard guard fires on swipe-back (iOS), hardware back (Android), and custom back button.
- No double-submission possible.

### Step 9: End-of-Session Commit

1. Update `docs/project-state.md` — one clean current-state snapshot.
2. Save any build notes to `reviews/{ScreenID}-build-notes.md`.
3. Stage files by name (not `git add -A`) to avoid accidentally committing `.env`.
4. Commit to `dev` with project convention.
5. Push to `origin dev`.
6. Confirm short commit hash.

---

## Appendix: Locked Decisions (Do Not Revisit)

From `docs/project-state.md`:

| Decision | Rationale |
|---|---|
| Mobile number is primary patient key | Simpler than Aadhaar, lower regulatory risk, higher coverage |
| Aadhaar stored as SHA-256 hash only | UIDAI compliance, data minimisation |
| Visit-triggered, append-only records | No simultaneous writes; simplifies sync |
| Last-write-wins sync (no CRDTs) | Sufficient given write model |
| expo-sqlite directly (not WatermelonDB) | Less abstraction, easier to debug in field for v1 |
| Zustand + React Query for state | Proven pattern for offline-first RN apps |
| AWS ap-south-1 (Mumbai) for all storage | DPDP data localisation expectation |
| OCR is async, never blocks UI | Core UX principle — speed > features |
| Google Vision API (primary), Tesseract (fallback) | Better accuracy on handwriting |
| S3 image storage deferred to v2 | Images stored on device local filesystem only for now |
| D7 defaults to manual tap-to-capture | Auto-capture unreliable on low-end Android under inconsistent clinic lighting |
| D5 must hash Aadhaar at form boundary | Raw Aadhaar must never travel through the call stack or reach any storage layer |

## Appendix: Rejected Ideas (Do Not Re-Propose)

| Idea | Why Rejected |
|---|---|
| Voice-based input for doctors | Avoids new habits for doctors |
| Multi-doctor simultaneous edit | Structurally impossible given visit model |
| Appointment scheduling in v1 | Out of scope |
| Password-based auth | OTP is lower friction, reduces credential theft surface |
| Multi-staff concurrent editing | Visits are sequential append-only containers |
