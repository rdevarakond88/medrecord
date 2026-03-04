# CONTEXT-TRANSFER — MedRecord

_Paste this entire file at the start of any new Claude.ai chat to load full project context before building a new screen. This file is the combination of all 12 source documents: project-state.md, ui-ux-spec.md, LESSONS-AND-RUNBOOK.md, data-models.md, api-contracts.md, offline-sync-spec.md, consent-layer-spec.md, agent-builder.md, agent-persona-critic.md, agent-security.md, agent-pm.md, agent-qa.md._

_Last updated: 2026-03-03. Repo: https://github.com/rdevarakond88/medrecord — active branch: `dev`._

---

## MANDATORY FIRST STEP — PM Pre-Flow Gate

Before starting any screen, run this in the new chat session:

Read agents/agent-pm.md, docs/product-vision.md, docs/project-state.md.

Run the Moment 1 pre-flight review for [screen name] and produce output in the format specified in agent-pm.md.

Do not start the validation checklist or mockup until the PM pre-flow gate is complete and confirmed.

---

# PART 1 — PROJECT STATE
_Source: docs/project-state.md_

---

# Project State — MedRecord
_This file is updated at the end of every Claude Code session. Pass this file as context at the start of every new session._

## Current Status
**Phase:** D6 security audit complete. All CRITICAL and HIGH findings closed. MEDIUM and LOW findings open — fix before merge to main. Ready for device testing (43 checklist items pending).
**Last Updated:** 2026-03-02
**Last Session:** D6 security audit (2026-03-02). Fixed CRITICAL-2 (sync_queue no doctor_id column), CRITICAL-1 (sync_queue not cleared on logout), HIGH-1 (noteText omitted from API call), HIGH-2 (visits_draft not marked synced after createVisit), HIGH-3 (no DPDP audit event on visit creation), HIGH-4 (doctorId IDOR risk comment). Commits: `04f3e99`, `831f0dc`, `f888874`, `fb9b766`. 6 MEDIUM + 2 LOW findings open — fix before merge to main.

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
| S3 image storage deferred to v2 — images stored on device local filesystem only for now | Swap requires changing one storage handler function and one config value |
| D7 (Document Scanner) defaults to manual tap-to-capture; auto-capture deferred to v2 | Auto-capture is unreliable on low-end Android under inconsistent clinic lighting |
| D5 (New Patient Form) must hash Aadhaar at the form submission boundary — raw Aadhaar must never travel through the call stack or reach any storage layer | UIDAI compliance; data minimisation |

---

## Build Constraints — Doctor Visit Flow (D2, D3, D5, D6, D7)
_Carry these into every build/mockup session for these screens._

- **D2 (Patient Search):** Offline SQLite search is the primary implementation path, not a fallback. Write the SQLite path first. The network path layers on top. Show offline state variant as a first-class design state.
- **D3 (Patient Detail):** API must return two separate visit lists — `myVisits` (doctor's own records, always returned) and `otherDoctorVisits` (consent-gated, `chiefComplaint` excluded at the query layer). Do not rely on UI graying alone. The fourth mockup variant (`D3PatientDetailHasDataOwnVisitsOnly`) models the correct shape. Tracked as D3-H-1.
- **D3 (Patient Detail):** Do not render visit history until server-side consent re-fetch completes. Use loading skeleton on mount; fall back to SQLite cache only when offline. Nav param is the initial signal only, not the gate. Tracked as D3-H-2.
- **D3 (Patient Detail):** Add synchronous auth guard (`if (!token || !user) return null`) before any JSX in all variants. Same pattern as D2 live screen. Tracked as D3-H-3.
- **D3 (Patient Detail):** Patient header must include an edit affordance (stub navigation to profile-edit screen is acceptable for v1) — staff correct mobile numbers from this screen.
- **D3 (Patient Detail):** Patient full name displayed at 22pt bold — visible to bystanders in shared clinic spaces. Address before production: name-dimming gesture or abbreviated display after screen idle timeout. Tracked as MEDIUM debt.
- **D6 (New Visit):** Must include an explicit "consent not yet established" state variant. Do not build D6 as if patient consent is always pre-granted — D9 (Consent Request Flow) will wire up later, but D6 must acknowledge the state exists.
- **D6 (New Visit):** Validate against product-vision.md success metric: doctor completes a visit record in under 60 seconds. If the screen requires more than 3 taps to reach a submittable state, redesign before persona review.
- **D7 (Document Scanner):** Include a simple exposure/readability indicator before capture (e.g. too dark / good / overexposed). Do not rely on OCR feedback — basic camera exposure feedback only. Required for inconsistent clinic lighting conditions.

---

## Screens Built

| Screen | File | Session | Notes |
|---|---|---|---|
| D2 — Patient Search / Home | `src/screens/doctor/PatientSearchScreen.tsx` | 2026-02-19 | SQLite primary path, GET /patients/lookup on 10 digits, server result cached to SQLite, offline banner + context card, sync badges. All agents run. C-1/C-2/C-3 fixed. Security re-audit v2 passed. All HIGH debt closed. Real device verified (iPhone). On `dev`. Do not merge to `main` until H-2 + H-3 resolved. |
| D3 — Patient Detail / History | `src/screens/doctor/PatientDetailScreen.tsx` | 2026-02-23 / 2026-02-24 | `getPatientVisits()` two-list API, loading skeleton on mount, server consent gate, offline SQLite fallback, synchronous auth guard, `useFocusEffect` for dynamic consent transition, AppState foreground re-verify, offline guard on Request Access, DPDP audit event, FlatList with pagination. All D3 HIGH pre-merge debt closed. |

## Screens Pending

| Screen | Status | Notes |
|---|---|---|
| D6 — New Visit | **Live screen built. Security audit complete — CRITICAL and HIGH closed. Device testing complete for core workflow. 33 items confirmed. 9 deferred. 2 MEDIUM debt items open. 6 security MEDIUM + 2 LOW open before merge.** | `src/screens/doctor/NewVisitScreen.tsx` |
| D4 — Visit Detail | Not started | Required before "View Full Visit" button in D3 can be wired. |
| D7 — Document Scanner | Not started | Tier 1 Critical. Exposure indicator required. |
| D5 — New Patient Form | Stub only | Must hash Aadhaar at form boundary — locked decision. |
| D1 — Login / OTP | Stub only (seeds fake token) | Replace stub when OTP auth is implemented. |
| D8 — Full Scan View | Not started | Image viewer + OCR panel. |
| D9 — Consent Request Flow | Not started | D3 `handleRequestAccess` has TODO stub pointing here. |
| P1–P5 — Patient App | Not started | |

---

## Known Technical Debt (Open Items Only)

### HIGH — Must fix before merging D2 to main
| Item | Notes |
|---|---|
| **H-2:** Certificate pinning not implemented — `apiFetch` uses bare `fetch()` with no SPKI pin; MITM possible on shared clinic WiFi | Use `expo-build-properties` OkHttp interceptor (Android) + NSURLSession delegate (iOS), or `react-native-ssl-pinning`. Pin leaf cert + one intermediate. |
| **H-3:** Offline patient access generates no audit log — `getRecentPatients` and `searchPatientsByMobile` return PII with zero audit trail when offline | Add `audit_events` SQLite table; call `logLocalAccess()` after each read; flush to server on reconnect via `POST /sync`. |

### MEDIUM — Fix before production
| Item | Screen | Notes |
|---|---|---|
| Full mobile numbers displayed in `PatientRow` — PII visible to bystanders | D2 | Use `formatMobile(mobile, true)` (last 5 digits only) in list view. |
| Clear button touch target 28×28px; below WCAG AA 44×44px minimum | D2 | Expand `hitSlop` or increase button size. |
| `searchPatientsByMobile` LIKE query not prefix-anchored | D2 | Change to `123%` pattern. |
| Double-tap on `PatientRow` pushes two D3 screens | D2 | Add tap-guard ref. |
| "Add New Patient" CTA fires with partial query; D5 receives invalid `prefillMobile` | D2 | Only pass `prefillMobile` if `query.length === 10`. |
| `recentPatients` not refreshed when background sync completes while D2 is active | D2 | Use `useFocusEffect`. |
| Patient full name displayed at 22pt bold in D3 header — no PII dimming | D3 | Name-dimming gesture or abbreviated display after idle timeout. |
| Server-side visit pagination not implemented | D3 | Add `?page=&per_page=20` query params server-side. |
| "View Full Visit" button disabled until D4 is built | D3 | Wire to `navigation.navigate('VisitDetail', ...)` when D4 is built. |
| Pull-to-refresh not implemented in D3 | D3 | Add `RefreshControl` on FlatList. |
| **MEDIUM-1:** `consentGranted` nav param not re-verified at save time in D6 | D6 | Re-read from SQLite via `getPatientByLocalId()` inside `handleSave()`. |
| **MEDIUM-3:** Attached scan silently dropped on save — never written to storage | D6 | Requires D7 integration. |
| **MEDIUM-4:** `insertLocalVisit()` and `enqueueOperation()` not wrapped in transaction | D6 | Wrap in `db.withTransactionAsync()`. |
| **MEDIUM-5:** `getCachedVisits` UNION filters `visits_draft` on `patient_server_id` — offline-only patients return zero draft rows | D6 | Add `OR (patient_server_id IS NULL AND patient_id = ?)` branch. |
| **MEDIUM-6:** Unsynced draft visits deleted on logout without warning | D6 | Check for pending rows; warn doctor with count + require confirmation. |

### LOW — D6 live screen security audit
| Item | Notes |
|---|---|
| **LOW-1:** `isSavingRef.current` never reset on success path | Reset before `navigation.goBack()` or in `finally` block. |
| **LOW-2:** Visit date validation enforced only at picker layer | Add guard at top of `handleSave()`: if `visitDate > todayISO()`, set `saveError` and return early. |

---

## Rejected Ideas (Do Not Re-Propose)
| Idea | Why Rejected |
|---|---|
| Voice-based input for doctors | Core product principle: avoid new habits for doctors |
| Multi-doctor simultaneous edit | Structurally impossible given visit model |
| Appointment scheduling in v1 | Out of scope |
| Password-based auth | OTP is lower friction, reduces credential theft surface |
| Multi-staff concurrent editing | Visits are sequential append-only containers |

---

## Environment Setup Notes

### Mobile testing — iPhone via Expo Go (WSL2 Windows)
- Run: `npm start` — kills port 8082, starts Metro on 8082, opens ngrok tunnel
- Port 8081 is permanently blocked by Windows Hyper-V reservation (bleeds into WSL2; unfixable)
- `--host lan` abandoned: WSL2 LAN IP (172.x.x.x) is not reachable from iPhone
- `--tunnel` (ngrok) is the only reliable approach; `@expo/ngrok` in devDependencies
- URL format: `exp://xxxx-anonymous-8082.exp.direct` — changes every session (ngrok free tier)

### Key File Locations
- App root: `App.tsx`
- D2: `src/screens/doctor/PatientSearchScreen.tsx`
- D3: `src/screens/doctor/PatientDetailScreen.tsx`
- D6: `src/screens/doctor/NewVisitScreen.tsx`
- DB schema: `src/db/schema.ts`
- DB patients: `src/db/patients.ts`
- DB visits: `src/db/visits.ts`
- Auth store: `src/store/useAuthStore.ts`
- API client: `src/api/apiClient.ts`
- API visits: `src/api/visits.ts`
- Sync queue: `src/sync/syncQueue.ts`

### GitHub
- Repo: https://github.com/rdevarakond88/medrecord (private)
- Primary branch: `main` — stable, reviewed code only
- Active branch: `dev` — all Claude Code sessions commit here
- Commit convention: `[D2] short description`, `[sync] description`, `[docs] description`, etc.

---

# PART 2 — UI/UX SPECIFICATION
_Source: docs/ui-ux-spec.md_

---

# UI/UX Specification — MedRecord

## Design System

### Typography
- Font: Inter (system fallback: sans-serif)
- Base size: 16px
- Scale: 12 / 14 / 16 / 18 / 22 / 28 / 36
- Headings: Semibold (600); Body: Regular (400); Labels: Medium (500)

### Colour Palette
```
Primary Blue:    #1A6DB5   (CTAs, active states, links)
Primary Dark:    #0F4880   (headers, emphasis)
Surface:         #FFFFFF
Background:      #F5F7FA
Border:          #E2E8F0
Text Primary:    #1A202C
Text Secondary:  #64748B
Text Disabled:   #CBD5E0
Success:         #16A34A
Warning:         #D97706
Error:           #DC2626
Scan Orange:     #EA580C   (scan/camera CTA — warm, visible, distinct)
```

### Spacing
- Base unit: 4px
- Common: 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48

### Touch Targets
- Minimum: 48×48px (WCAG AA)
- Preferred for primary actions: 56×56px or full-width buttons

### Accessibility
- All text meets 4.5:1 contrast ratio minimum
- All interactive elements have accessible labels
- Support for system font size scaling up to 200%
- Bottom navigation labels always visible (never icon-only)

---

## Navigation Structure

### Doctor App
```
Bottom Tab Bar:
├── Patients      (search + recent)
├── Today         (visits opened today)
├── Scan          (quick scan entry point)
└── Profile       (settings, logout)
```

### Patient App
```
Bottom Tab Bar:
├── My Records    (timeline)
├── Doctors       (who has access)
└── Profile
```

---

## Screen Inventory — Doctor App

### D1: Login / OTP Screen
**Purpose:** Phone number entry + OTP verification
**Layout:** MedRecord logo (centered, top third) · Subtitle: "For Doctors & Clinics" · Phone number input (large, numeric keyboard) · "Send OTP" primary button (full width) · After OTP sent: 6-digit OTP input + "Verify" button · Resend link (countdown)
**Behaviour:** Auto-advance to OTP field · OTP auto-submits on 6th digit · Error states: invalid number, wrong OTP, expired OTP

### D2: Patient Search / Home
**Purpose:** Doctor's primary entry point. Find a patient or start a new record.
**Layout:** Header: "Good morning, Dr. [Name]" + clinic name · Large search bar: "Search by mobile number" · Numeric keypad below search bar · Recent patients list (last 5) · FAB (+) "New Patient"
**Behaviour:** Typing phone number → live lookup → show match or "Not found" · Tap recent patient → D3 · "New Patient" → D5 · Offline: recent patients still accessible
**Design Note:** Numeric keypad reduces friction. Doctors type phone numbers frequently.

### D3: Patient Detail / History
**Purpose:** Full view of patient visit history. Launch point for new visit.
**Layout:** Header: Patient name + mobile + age · Consent status badge (green: "Access Granted" / amber: "Pending Consent") · Primary action: "New Visit" (full width, blue) · Visit list newest first: Date, chief complaint, clinic name, record count · Empty state: "No previous records. Start the first visit."
**Behaviour:** "New Visit" → D6 · Tap visit card → D4 · No consent: "New Visit" still available (creates implicit consent request); history grayed out

### D4: Visit Detail
**Purpose:** View all records within a single visit.
**Layout:** Header: Date, Doctor name, Clinic name · Status badge: "Open" (amber) or "Submitted" (green) · Records list: scan thumbnail + OCR text preview / note text · Bottom bar (if Open): "Add Scan" + "Add Note" + "Submit Visit"
**Behaviour:** Tap scan thumbnail → D8 · "Add Scan" → D7 · "Add Note" → inline text input · "Submit Visit" → confirmation dialog → locks visit

### D5: New Patient Form
**Purpose:** Register a patient who doesn't exist in the system.
**Layout:** Mobile number (pre-filled, non-editable) · Name (optional) · Date of Birth (optional) · Gender (optional, 3-button toggle) · "Create Patient & Start Visit"
**Behaviour:** Submitting creates patient + immediately opens D6 · Offline: patient created locally, queued for sync
**Design Note:** Everything except mobile is optional. Under 20 seconds to complete.

### D6: New Visit
**Purpose:** Open a visit and add at least one record.
**Layout:** Visit date (today's, tappable to change) · Chief complaint field (optional) · Record entry zone: big orange camera button "Scan a Document" OR text note area · "Save Visit" (disabled until at least one record added)
**Behaviour:** Camera button → D7 · Typing activates "Save Visit" · "Save Visit" → saves, returns to D3
**Design Note:** Two clear actions, one must be chosen. No ambiguity.

### D7: Document Scanner
**Purpose:** Camera capture of physical documents.
**Layout:** Full-screen camera view · Document edge detection overlay · Capture button (centred at bottom) · "Use Photo Library" link · Flash toggle · After capture: preview with "Use This" / "Retake" / crop handles
**Behaviour:** After "Use This": image saved locally, OCR queued · Returns to D6/D4 with scan thumbnail
**Design Note:** Guide overlay helps non-tech-savvy staff. Keep UI minimal during capture. Exposure indicator required before capture (too dark / good / overexposed) — basic camera exposure feedback, not OCR feedback.

### D8: Full Scan View
**Purpose:** Full-resolution view of a scanned document.
**Layout:** Full-screen zoomable image (pinch-to-zoom) · Bottom sheet (collapsible): "Extracted Text" tab + OCR status indicator · Header: date + visit it belongs to

### D9: Consent Request Flow
**Purpose:** Get patient consent in-clinic before sharing records.
**Layout:** Explanation card · Step 1: show screen to patient (displays mobile + request details) · Step 2: patient receives OTP on their phone · OTP input (doctor hands phone to patient) · "Grant Access" confirmation
**Behaviour:** On success: consent recorded, doctor gains access · Doctor never sees patient's OTP input

---

## Screen Inventory — Patient App

### P1: Login / OTP — same as D1 but subtitle: "For Patients"

### P2: My Records (Timeline)
Timeline list newest first · Section headers by year · Each entry: Date, Doctor, Clinic, visit summary, scan thumbnail · Empty state: friendly illustration + message
**Design Note for Elderly Users:** Extra-large text option · No icons without labels · High contrast mode · Large card tap targets

### P3: Visit Record Detail (Patient View) — read-only

### P4: Doctors Who Have Access — consent management, "Revoke Access" button

### P5: Profile — name, DOB, large text toggle, language selector, logout

---

## Key Interaction Patterns

### Quick Add (Doctor) — 6 taps, zero typing, under 60 seconds
1. Tap patient in recent list
2. Tap "New Visit"
3. Tap camera button
4. Capture
5. Tap "Use This"
6. Tap "Save Visit"

### First-Visit Patient — under 90 seconds
1. Type mobile on D2
2. Tap "Not Found → Create New Patient"
3. Tap "Create Patient & Start Visit" (name optional)
4. Scan or note
5. Save

---

## Offline State Indicators
- Syncing: thin blue progress bar at very top (non-intrusive)
- Offline: small amber dot + "Offline — changes will sync when connected"
- Sync error: red banner with retry button
- Unsynced scan: small cloud-with-arrow icon on thumbnail
- OCR pending: "Processing text..." label
- OCR failed: "Text extraction failed" — image still viewable

---

## Localisation Notes
- All text strings externalised from day 1 (i18n-ready)
- Date format: DD/MM/YYYY (Indian standard)
- Languages for v1: Hindi, English, Tamil, Telugu, Kannada, Bengali

---

# PART 3 — LESSONS AND RUNBOOK
_Source: LESSONS-AND-RUNBOOK.md_

---

# MedRecord — Lessons & Runbook

## 1. Environment Setup — Issues and Fixes

### 1.1 WSL2 + Expo Go on iPhone

**Problem: Port 8081 blocked on WSL2.** Windows Hyper-V permanently reserves it. Fix: Metro on port 8082.

**Problem: WSL2 LAN IP not reachable from iPhone.** Fix: ngrok tunnel exclusively. `--host lan` abandoned.

**Tunnel URL:** `exp://xxxx-anonymous-8082.exp.direct` — changes every ngrok session. Get current URL: `curl -s http://localhost:4040/api/tunnels`. Subdomain persists across Metro restarts; only changes when ngrok process is killed.

**Expo Go:** Always force-quit before retrying after server restart. Hermes bundle: 5–6 MB. Plain JS: 6 MB. Both serve correctly.

**"App entry not found":** Two root causes: (1) missing `registerRootComponent(App)` in `App.tsx`; (2) screen navigates to a route not registered in the navigator. Rule: always register ALL routes, even stubs.

### 1.2 Web Preview
Expo web bundle approach abandoned — fails silently on WSL2. Use pure-HTML preview at `web-preview/D2.html`. Run: `npm run web` → `http://localhost:3000/`.

### 1.3 Dev Server Command
```bash
npm start
# Kills port 8082, starts Metro on 8082, opens ngrok tunnel
```

### 1.4 Installed Dependencies (added 2026-02-24, were missing)
```
expo-sqlite, expo-crypto, @tanstack/react-query, @react-navigation/native,
@react-navigation/native-stack, react-native-screens, react-native-safe-area-context,
@react-native-community/netinfo, zustand
```
`@react-native-community/datetimepicker`: bundled with Expo SDK 54 but not explicit. If TypeScript errors: `npx expo install @react-native-community/datetimepicker`.

### 1.5 Dependency Versions
| Package | Version |
|---|---|
| expo | ~54.0.33 |
| react | 19.1.0 |
| react-native | 0.81.5 |
| expo-sqlite | ^14.x |
| expo-crypto | ^13.x |
| @tanstack/react-query | ^5.x |
| @react-navigation/native | ^6.x |
| zustand | ^4.x |

---

## 2. Agent Workflow Rules (Summary)

**Builder:** Read all relevant specs before writing code. Offline first always. No placeholder security. Realistic Indian test data. End-of-session: update project-state.md, commit+push to dev, confirm hash.

**PM:** Invoked at 3 moments only — Pre-Flow Gate, Post-Flow Review, Pre-Launch Gate. Never reopens locked decisions without regulatory/market reason.

**QA:** 8 test categories: Offline/Connectivity, State & Navigation, Data Integrity, OCR, Consent Edge Cases, Sync Conflict, Input Validation, Low-End Device. 6 known failure modes: stale closures, SQLite writes without transactions, image path drift, queue runaway, race condition on consent OTP, JWT refresh during sync.

**Security:** Will not approve code with any CRITICAL finding. Escalate immediately if: patient records accessible without auth, Aadhaar plaintext found, S3 public-read, cross-patient leakage, consent check absent, PII in console.log. Consent signal must be traced end-to-end: server → API response → SQLite write → SQLite read → every downstream screen.

**Persona Critic:** 5 personas — Dr. Sinha (reluctant, 58, UP), Dr. Nair (tech-savvy, 32, Tamil Nadu), Sunita (staff, 34, Nashik), Shantabai (elderly patient, 71, Satara), Arjun (semi-savvy patient, 38, Bhopal). MUST FIX if any persona ≤ 2 or weighted average < 3.0.

**Commit convention:** `[D2] description`, `[D3] description`, `[docs] description`, `[security] description`, etc.

---

## 3. Mistakes and Rules — D2, D3, D6 Builds

### 3.1 D2 Key Rules

- **C-1:** `clearAuth()` must clear SQLite `patients` table scoped by `doctor_id` (not wipe entirely — preserves other doctors' offline patients).
- **C-2:** `consent_granted` must be stored in SQLite `patients` table and passed in nav params to D3.
- **C-3:** `queryClient.clear()` must be step 3 of `useLogout`.
- **H-4:** Synchronous auth guard `if (!token || !user) return null` AFTER all hooks, before JSX — on ALL screens.
- **H-5:** Online only when `isConnected === true && isInternetReachable === true`. Null = offline.
- SQLite LIKE queries: prefix-anchored (`123%` not `%123%`).
- Tap guard: `useRef(false)` not `useState` for double-navigation prevention.
- FAB: never `position:absolute` with hardcoded `bottom`. Use `fabRow` flex row.
- Mobile numbers in list views: masked (last 5 digits, `•••••` prefix).

### 3.2 D3 Key Rules

- API must return two lists: `myVisits` (always) + `otherDoctorVisits` (consent-gated, `chief_complaint` excluded at query layer). UI graying alone is not sufficient.
- Render visit history only after server consent re-fetch completes. Loading skeleton on mount. Offline fallback to SQLite only when `isConnected === false`.
- `useFocusEffect` for consent re-fetch on every screen focus.
- `visits` table must be scoped by `cached_by_doctor_id`. `getCachedVisits` must filter by doctor.
- `useLogout` must clear `visits` table via `clearDoctorVisits(db, doctorId)`.
- `recordCount === 0` displays `'Draft'` with amber pill.
- `numberOfLines={1}` + `ellipsizeMode="tail"` on all patient names.
- No consent badge in empty state.
- `Request Access` button: offline guard required.
- `FlatList` with render limits. Never `ScrollView` + `map`.
- `logConsentAccess()` on mount when consent granted — DPDP audit trail.

### 3.3 D6 Key Rules

- `sync_queue` must have `doctor_id` column and be cleared on logout.
- Tap guard: `useRef(false)`. `isSavingRef.current = true` at start of `handleSave()`; reset before `goBack()` or in `finally`.
- Write order (strict): SQLite → `enqueueOperation()` → API call. Wrap both in `db.withTransactionAsync()`.
- Back nav discard guard: `navigation.addListener('beforeRemove')`. Use `savingCompletedRef` for programmatic `goBack()`.
- Mobile number in headers: always masked (`•••••` + last 5 digits).
- `KeyboardAvoidingView`: required. `behavior='padding'` (iOS) / `behavior='height'` (Android).
- Consent re-verify at save time: read from SQLite via `getPatientByLocalId()` inside `handleSave()`.
- `getCachedVisits` UNION must handle `NULL patient_server_id` for offline-only patients.
- Check for pending `visits_draft` rows before logout. Warn doctor. Require confirmation.
- Visit date: validate `visitDate <= today` inside `handleSave()`, not only at picker layer.
- D6 must show the no-consent variant. Never assume consent is pre-granted.

### 3.4 Device Testing Mistakes (D2, D3, D6)

These rules were learned exclusively through real-device testing. Web preview and simulator never surface them.

**RULE 1 — Visual hiding is not data hiding** _(D3)_
Strip sensitive fields from data before it reaches the component. Access control at the data layer, not the display layer. Never rely on visual styling to protect patient data.

**RULE 2 — iOS keyboard requires explicit handling** _(D2)_
Tapping outside a text input does not dismiss the keyboard on iOS by default. Wrap screen in `TouchableWithoutFeedback` calling `Keyboard.dismiss()`.

**RULE 3 — iOS search bar focus requires explicit state** _(D2)_
Custom search bar shows no visual feedback on tap without `isFocused` state + `TouchableOpacity` wrapper + blinking cursor `Animated` loop. Web preview never reveals this.

**RULE 4 — FAB: never `position:absolute` with hardcoded bottom** _(D2)_
Fixed three times before root cause identified. Always use flex row placement for FABs.

**RULE 5 — Two buttons for same action must never appear simultaneously** _(D2)_
Fix visibility logic, not positioning. Only one button for a given action visible at a time based on screen state.

**RULE 6 — Red consent banner is expected without a backend** _(D3)_
"Could not verify consent — showing limited view" is correct behaviour when no backend is running. App fails secure. Do not treat as a bug during development.

**RULE 7 — Modal conditional mounting causes blank screen on iOS** _(D6)_
Never `{showModal && <Modal>}`. Always mount unconditionally, control with `visible` prop:
```tsx
<Modal visible={showModal}>
```

**RULE 8 — `display="spinner"` unreliable on iOS** _(D6, 4 failed attempts)_
`@react-native-community/datetimepicker` with `display="spinner"` renders invisible wheels on some iOS versions. Use `display="compact"` — native iOS popover calendar, works on all iOS 14+.

**RULE 9 — Native components require explicit parent container** _(D6)_
Wrap `DateTimePicker`, `Camera`, `Maps` in a parent `View` with defined `width`, `backgroundColor` (`#FFFFFF`), `padding`, and `borderRadius`. Without container, native layer ignores `value` prop, may render invisible.

**RULE 10 — UI contrast must be verified on device** _(D6, multiple times)_
White spinner wheels on white background, overlapping text on matching backgrounds. Before any new UI component: state explicitly what background colour it renders against. If unverifiable without device, add: `// requires device contrast verification`.

**RULE 11 — Metro cache requires explicit clear after native changes** _(D6)_
Shake → Reload in Expo Go is not sufficient after native component changes or SQLite schema migrations. Always run `npm start -- --clear` and force-quit Expo Go completely.

**RULE 12 — Schema migrations are mandatory for existing device databases** _(D6)_
Every new column must have an `ALTER TABLE` migration wrapped in `try/catch` immediately below the `CREATE TABLE` definition. Missing migrations cause "no such column" crash on existing databases. A fresh install would not catch this.

---

## 4. Standard Runbook — Building Each Screen

**Step 1: Read** — ui-ux-spec.md, data-models.md, api-contracts.md, offline-sync-spec.md, consent-layer-spec.md, project-state.md Build Constraints for the screen.

**Step 2: Static mockup** — Realistic data. All states: empty, loading, has-data, no-consent, offline, error. No real API calls. 48×48px minimum touch targets. Comment block at top of file.

**Step 3: Security audit (mockup)** — Run security checklist. All CRITICAL must be closed before live build.

**Step 4: Persona critique** — All MUST FIX resolved before live build. SHOULD FIX tracked in project-state.md.

**Step 5: Live screen** —
- Auth guard first (after all hooks): `if (!token || !user) return null`
- Write order: SQLite → sync queue → API (wrapped in `withTransactionAsync()`)
- Consent: server response is the gate online; fresh SQLite read offline
- Navigation: register all routes; `beforeRemove` listener; `useRef(false)` tap guard
- Lists: `FlatList` with render limits
- PII: masked mobile numbers; `numberOfLines={1}` on names; no PII in `console.log`
- Keyboard: `KeyboardAvoidingView` (`padding` iOS / `height` Android)
- Network: online only when both `isConnected` and `isInternetReachable` are `true`

**Step 6: QA test plan** — Save to `reviews/{ScreenID}-qa-test-plan.md`.

**Step 7: Security re-audit** — All CRITICAL and HIGH must be closed before device testing.

**Step 8: Device testing** — Touch targets, FAB overlap, keyboard obscuring Save, offline mode, back navigation guard, no double-submission.

**Step 9: Commit** — Update project-state.md. Stage files by name. Commit to `dev`. Push. Confirm hash.

---

# PART 4 — DATA MODELS
_Source: docs/data-models.md_

---

# Data Models — MedRecord

## Design Principles
- Every entity has a UUID primary key (never expose sequential IDs externally)
- Soft deletes only (`deleted_at` timestamp); records are never hard-deleted
- All timestamps in UTC; display conversion on device
- Aadhaar stored as one-way hash (SHA-256) only; never plaintext
- Offline-first: every entity carries a `local_id` (device-generated UUID) that persists through sync

---

## Entities

### Patient
```
patient {
  id                  UUID (PK, server-generated)
  local_id            UUID (device-generated)
  mobile_number       VARCHAR(10) NOT NULL UNIQUE  ← primary lookup key
  name                VARCHAR(255)                  ← optional
  date_of_birth       DATE                          ← optional
  gender              ENUM('male','female','other','prefer_not_to_say')
  aadhaar_hash        VARCHAR(64)                   ← SHA-256 hash, optional
  profile_photo_url   TEXT                          ← optional, S3 url
  created_at          TIMESTAMP
  updated_at          TIMESTAMP
  deleted_at          TIMESTAMP
}
```
Name is optional — some patients uncomfortable sharing digitally at first visit. Aadhaar hash should live in a separate `patient_aadhaar` table with stricter access controls.

### Doctor
```
doctor {
  id                  UUID (PK)
  name                VARCHAR(255) NOT NULL
  mobile_number       VARCHAR(10) NOT NULL UNIQUE
  specialisation      VARCHAR(255)
  registration_number VARCHAR(100)               ← Medical Council number
  clinic_id           UUID FK → clinic
  created_at / updated_at / deleted_at TIMESTAMP
}
```

### Clinic
```
clinic {
  id        UUID (PK)
  name      VARCHAR(255) NOT NULL
  address   TEXT
  pincode   VARCHAR(6)
  state     VARCHAR(100)
  phone     VARCHAR(10)
  created_at / updated_at / deleted_at TIMESTAMP
}
```

### Visit
```
visit {
  id              UUID (PK)
  local_id        UUID              ← device-generated
  patient_id      UUID FK → patient
  doctor_id       UUID FK → doctor
  clinic_id       UUID FK → clinic
  visit_date      DATE NOT NULL     ← auto-populated to today on device
  chief_complaint TEXT              ← optional
  status          ENUM('open','submitted') DEFAULT 'open'
  opened_at       TIMESTAMP
  submitted_at    TIMESTAMP
  synced_at       TIMESTAMP         ← null if not yet synced
  created_at / updated_at / deleted_at TIMESTAMP
}
```
`status = 'open'` means doctor can still edit. `'submitted'` locks the visit. Visit is the atomic unit of all sync operations.

### Record
```
record {
  id                    UUID (PK)
  local_id              UUID
  visit_id              UUID FK → visit
  created_by            UUID FK → doctor
  type                  ENUM('scan','note','diagnosis','medication','lab_result')
  content_text          TEXT        ← typed note OR OCR-extracted text
  image_url             TEXT        ← S3 URL (null for typed records)
  image_local_path      TEXT        ← local path before sync
  ocr_status            ENUM('pending','success','failed','skipped') DEFAULT 'skipped'
  ocr_raw_output        TEXT
  is_visible_to_patient BOOLEAN DEFAULT true
  synced_at             TIMESTAMP
  created_at / updated_at / deleted_at TIMESTAMP
}
```
`image_url` and `content_text` can both be present. Image is always source of truth; OCR text is supplementary. `ocr_status = 'failed'` does not block the record.

### Consent
```
consent {
  id              UUID (PK)
  patient_id      UUID FK → patient
  doctor_id       UUID FK → doctor   ← null if clinic-level
  clinic_id       UUID FK → clinic   ← null if doctor-level
  granted_at      TIMESTAMP NOT NULL
  revoked_at      TIMESTAMP          ← null if active
  granted_by      ENUM('patient','proxy')
  scope           ENUM('read_all','read_from_date','read_new_only') DEFAULT 'read_all'
  scope_from_date DATE
  created_at      TIMESTAMP
}
```
One row per grant. Revocation creates `revoked_at` timestamp, never deletes. Audit trail is append-only.

### Sync Queue (local device only)
```
sync_queue {
  id              UUID (local)
  doctor_id       TEXT NOT NULL     ← scoped per doctor (added D6)
  entity_type     ENUM('visit','record','patient','consent')
  entity_local_id UUID
  operation       ENUM('create','update')
  payload         JSON
  queued_at       TIMESTAMP
  attempts        INTEGER DEFAULT 0
  last_attempt_at TIMESTAMP
  status          ENUM('pending','in_progress','success','failed')
  error_message   TEXT
}
```
Processed in `queued_at` order. Failed items retry with exponential backoff (max 5 attempts, then dead-letter state). Cleared on logout via `clearDoctorSyncQueue(db, doctorId)`.

---

## Relationships
```
Clinic ──< Doctor ──< Visit ──< Record
                 ↑         ↑
              Patient ──────┘
                 │
              Consent ──> Doctor / Clinic
```

---

## Key Indexes (PostgreSQL)
```sql
CREATE INDEX idx_patient_mobile ON patient(mobile_number);
CREATE INDEX idx_visit_patient ON visit(patient_id, visit_date DESC);
CREATE INDEX idx_visit_doctor ON visit(doctor_id, visit_date DESC);
CREATE INDEX idx_consent_patient_doctor ON consent(patient_id, doctor_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_visits_doctor_patient ON visits(cached_by_doctor_id, patient_id);  -- added D3
```

## Data Retention
- Patient records: retained indefinitely (legal requirement in India)
- Soft-deleted records: visible to admins for 7 years, then hard-deleted
- Sync queue: cleared after successful sync; failed entries retained 30 days
- Audit logs: 10 years (DPDP compliance)

---

# PART 5 — API CONTRACTS
_Source: docs/api-contracts.md_

---

# API Contracts — MedRecord

## General Conventions
- Base URL: `https://api.medrecord.in/v1`
- Authentication: Bearer JWT in `Authorization` header
- All responses: `Content-Type: application/json`
- Timestamps: ISO 8601 UTC
- Errors follow RFC 7807 (Problem Details)
- Pagination: cursor-based using `after` (UUID of last item)

## Error Format
```json
{ "error": { "code": "PATIENT_NOT_FOUND", "message": "...", "field": "mobile_number" } }
```

## Standard Error Codes
| Code | HTTP | Meaning |
|---|---|---|
| UNAUTHORIZED | 401 | Missing or invalid JWT |
| FORBIDDEN | 403 | Valid JWT but no permission |
| NOT_FOUND | 404 | Resource does not exist |
| CONSENT_REQUIRED | 403 | Doctor lacks patient consent |
| VALIDATION_ERROR | 422 | Request body fails validation |
| CONFLICT | 409 | Duplicate local_id on sync |
| SERVER_ERROR | 500 | Unexpected server error |

---

## Auth Endpoints

### POST /auth/send-otp
```json
// Request
{ "mobile_number": "9876543210", "role": "doctor" }
// Response 200
{ "otp_token": "tok_abc123", "expires_in": 300 }
```

### POST /auth/verify-otp
```json
// Request
{ "otp_token": "tok_abc123", "otp": "482910" }
// Response 200
{ "access_token": "eyJ...", "refresh_token": "eyJ...", "expires_in": 86400,
  "user": { "id": "uuid", "role": "doctor", "name": "Dr. Sharma", "clinic_id": "uuid" } }
```

### POST /auth/refresh
```json
// Request: { "refresh_token": "eyJ..." }
// Response 200: { "access_token": "eyJ...", "expires_in": 86400 }
```

---

## Patient Endpoints

### GET /patients/lookup
```
Query params: ?mobile=9876543210
```
```json
// Response 200
{ "patient": { "id": "uuid", "name": "Ramesh Kumar", "mobile_number": "9876543210",
    "date_of_birth": "1955-03-12", "gender": "male", "consent_granted": true,
    "last_visit_date": "2024-01-10" } }
// Response 404: { "error": { "code": "PATIENT_NOT_FOUND" } }
```

### POST /patients
```json
// Request
{ "local_id": "uuid", "mobile_number": "9876543210", "name": "Ramesh Kumar",
  "date_of_birth": "1955-03-12", "gender": "male" }
// Response 201: { "patient": { ...full object... } }
// Response 409: { "error": { "code": "CONFLICT", "patient_id": "uuid" } }
```

---

## Visit Endpoints

### GET /patients/:id/visits
```
Query params: ?limit=20&after=uuid
```
```json
// Response 200
{ "my_visits": [ { "id": "uuid", "visit_date": "2024-01-15",
    "doctor": { "id": "uuid", "name": "Dr. Sharma" },
    "clinic": { "id": "uuid", "name": "Sharma Clinic" },
    "chief_complaint": "Fever and cough", "status": "submitted", "record_count": 2,
    "submitted_at": "2024-01-15T11:30:00Z" } ],
  "other_doctor_visits": [ { ...same shape but chief_complaint omitted when consent_granted=false... } ],
  "consent_granted": true,
  "checked_at": "2024-01-15T10:00:00Z",
  "next_cursor": "uuid" }
```

### POST /visits
```json
// Request
{ "local_id": "uuid", "patient_id": "uuid", "visit_date": "2024-01-15",
  "chief_complaint": "Fever", "note_text": "Patient reports fever for 3 days" }
// Response 201: { "visit": { ...full object... } }
```

### PATCH /visits/:id
```json
// Request: { "status": "submitted" } or { "chief_complaint": "..." }
// Response 200: { "visit": { ...updated... } }
// Response 403 if not the opening doctor
```

---

## Record Endpoints

### GET /visits/:id/records
```json
// Response 200
{ "records": [ { "id": "uuid", "type": "scan",
    "content_text": "Tab. Paracetamol 500mg...",
    "image_url": "https://s3.../...", "ocr_status": "success",
    "created_by": { "id": "uuid", "name": "Dr. Sharma" },
    "created_at": "2024-01-15T10:45:00Z" } ] }
```

### POST /records
```json
// Typed note
{ "local_id": "uuid", "visit_id": "uuid", "type": "note",
  "content_text": "Patient reports fever for 3 days, 101°F" }
// Scan (image uploaded separately via presigned URL)
{ "local_id": "uuid", "visit_id": "uuid", "type": "scan", "image_s3_key": "scans/..." }
// Response 201: { "record": { ...full object... } }
```

### GET /records/upload-url
```
Query params: ?content_type=image/jpeg&visit_id=uuid
```
```json
// Response 200
{ "upload_url": "https://s3.amazonaws.com/...?X-Amz-Signature=...",
  "s3_key": "scans/2024/01/15/uuid.jpg", "expires_in": 900 }
```

---

## Consent Endpoints

### GET /patients/:id/consent/check
```json
// Response 200
{ "has_consent": true, "scope": "read_all", "granted_at": "2024-01-10T09:00:00Z" }
```

### POST /consent
```json
// Request
{ "patient_id": "uuid", "doctor_id": "uuid", "scope": "read_all", "granted_by": "patient" }
// Response 201: { "consent": { ...full object... } }
```

### DELETE /consent/:id
```json
// Response 200: { "revoked_at": "2024-01-20T14:00:00Z" }
```

---

## Sync Endpoint

### POST /sync
```json
// Request
{ "operations": [
    { "operation": "create", "entity_type": "patient", "local_id": "uuid",
      "payload": { ...patient object... }, "queued_at": "2024-01-15T09:00:00Z" },
    { "operation": "create", "entity_type": "visit", "local_id": "uuid",
      "payload": { ...visit object... }, "queued_at": "2024-01-15T09:01:00Z" }
  ] }
// Response 200
{ "results": [
    { "local_id": "uuid", "status": "success", "server_id": "uuid" },
    { "local_id": "uuid", "status": "conflict", "server_id": "uuid",
      "message": "Patient already registered" }
  ] }
```
Operations processed in `queued_at` order. `conflict` is not an error — device updates its local ID mapping.

---

# PART 6 — OFFLINE SYNC SPECIFICATION
_Source: docs/offline-sync-spec.md_

---

# Offline Sync Specification — MedRecord

## Core Principle
The app must be fully functional with zero internet connectivity. Connectivity is a bonus, not a requirement. Syncing is invisible to the user unless it fails.

## Why Tractable
Visit-triggered, append-only record model:
- One patient visits one clinic at a time
- Only one doctor opens and writes to a visit
- No simultaneous multi-user editing
- Conflicts structurally impossible in normal operation

Result: simple optimistic sync queue — no CRDTs, no conflict resolution, no vector clocks.

## Local Storage
`expo-sqlite` directly. Less abstraction, easier to debug in field for v1.

## Sync Architecture
```
Device (SQLite)                    Server (PostgreSQL)
    │  User creates visit offline          │
    │  → written to local SQLite           │
    │  → added to sync_queue               │
    │  [connectivity returns]              │
    ├─── POST /sync ──────────────────────►│
    │    (batch of queued operations)      │
    │◄─── results (server_ids) ───────────┤
    │  Update local records                │
    │  local_id → server_id mapping        │
    │  Clear sync_queue entries            │
```

## Sync Queue Behaviour

### Enqueue (every write)
1. Write to local SQLite
2. Add entry to `sync_queue` with status `pending`
3. Return success to UI (immediate feedback)

### Process
Background sync worker runs:
- On app foreground
- On network connectivity change (offline → online)
- Every 5 minutes while online and app is open

### Ordering
Strictly in `queued_at` chronological order. If patient created offline then visit created for them, patient must sync before the visit.

### ID Resolution
Device uses device-generated UUIDs (`local_id`). After sync:
- Server returns `{ local_id, server_id }` mappings
- Device stores `local_to_server_id` lookup
- All subsequent operations use server IDs when available

### Conflict Handling
Server returns `conflict` (e.g., mobile already exists) → server returns existing `server_id` → device maps its `local_id` to existing `server_id`. No data lost.

## Image Sync
**NOTE: S3 upload deferred for v1. Images stored on device local storage only.**

When implemented:
1. Image captured → stored to device local storage (full res)
2. Compressed thumbnail generated locally for display
3. Record created in SQLite with `image_local_path` set, `image_url` null
4. Sync queue entry created for record metadata
5. Separate `image_upload_queue` entry for image file

Upload flow: metadata sync first → presigned S3 URL → direct device-to-S3 upload → POST s3_key to server → server triggers async OCR.

Upload settings: max 1MB before upload · WiFi only by default · retry with exponential backoff (1m, 2m, 4m, 8m, max 30m) · after 5 failures: `upload_failed` state · image never lost from device until manually cleared.

## OCR Flow (Always Async)
Never blocks user. OCR failure is silent from UX perspective. "Text not extracted" label shown for transparency but never blocks any workflow.

## Sync Status UI
- All synced: nothing shown
- Syncing: thin blue bar at top
- Offline, queued items: amber dot + "Offline" badge
- Upload waiting for WiFi: small icon on record card + "Upload now on mobile data"
- Sync failed: red banner with count + "Retry" button
- Image upload failed: icon on thumbnail, tap to retry

## Edge Cases
- **Device change:** Sync on every foreground event. Warn on logout if unsynced items exist.
- **Visit left open multiple days:** Allowed. `visit_date` = when patient visited; `submitted_at` = when doctor closed.
- **Clock skew:** `queued_at` is device time for ordering only. Server assigns authoritative `created_at`.
- **App killed mid-capture:** SQLite write is transactional. Doctor sees incomplete scan, can retake.

---

# PART 7 — CONSENT LAYER SPECIFICATION
_Source: docs/consent-layer-spec.md_

---

# Consent Layer Specification — MedRecord

## Core Principle
**Records are patient-owned, not clinic-owned.** Doctor generates a record during a visit, but it belongs to the patient permanently. Doctor cannot delete it. Clinic cannot sell or transfer it.

## Consent Model

### Grant Types
1. **Doctor-level:** Patient grants access to specific doctor (portable — follows doctor across clinics)
2. **Clinic-level:** Patient grants access to all doctors at a specific clinic

### Scope (v1 implements `read_all` only)
| Scope | Meaning |
|---|---|
| `read_all` | Doctor sees all records, past and future |
| `read_from_date` | From a specific date onward |
| `read_new_only` | Only records created after grant |

Consents do not expire automatically in v1. Patient can revoke at any time via Patient app.

## Consent Flows

### Flow 1: New Patient, First Visit (Implicit Consent)
Doctor searches → "Not Found" → taps "New Patient" → fills minimal form → "Create & Start Visit" → App creates patient AND consent grant → Patient receives SMS notification. Implicit consent acceptable for record creation (patient is physically present).

### Flow 2: Returning Patient, New Doctor (Explicit Consent Required)
Doctor searches → patient found → "No active consent" shown → "Request Access" → two sub-flows:
- **Sub-flow A (patient has app):** Push notification → patient taps Grant/Deny
- **Sub-flow B (no app):** 6-digit consent OTP via SMS → patient reads OTP → enters on doctor's device → consent granted

**Fallback (no phone / no SMS):** Doctor can still create a NEW visit. Cannot view historical records from other doctors.

### Flow 3: Returning Patient, Same Doctor
Consent already exists → history loads immediately. No user action required.

### Flow 4: Patient Revoking Access
Patient app → "Doctors Who Have Access" → "Revoke Access" → confirmation dialog → revocation recorded → doctor's next sync cycle receives "consent_revoked" flag → doctor's local cache cleared on next sync.

**After revocation:** Records created by revoked doctor remain visible to patient (patient-owned). Revoked doctor can still see records *they personally created*. Cannot see other doctors' records.

## Consent Audit Trail
```
consent_audit_log {
  id, consent_id, event ENUM('granted','revoked','accessed'),
  actor_id, actor_role, ip_address, device_id, timestamp
}
```
Never deleted. Not accessible to doctors/patients through normal app. Available via "Download my data" request (DPDP compliance).

## What Doctors Can and Cannot Do
| Action | Without Consent | With Consent |
|---|---|---|
| Create new patient record | ✅ | ✅ |
| Create new visit | ✅ | ✅ |
| View records they created | ✅ | ✅ |
| View records by other doctors | ❌ | ✅ |
| Search patient by mobile | ✅ | ✅ |
| Export patient data | ❌ | ❌ (v1) |
| Delete records | ❌ | ❌ (permanent) |

## Privacy by Design Rules for Developers
1. Never log patient mobile numbers or names in application logs
2. Never return patient records in API responses without first checking consent
3. All consent checks must be server-side (never trust client-side consent cache alone)
4. Doctor's local cache must be invalidated when consent is revoked
5. Aadhaar hash must never appear in logs, error messages, or API responses
6. Images in S3 must use signed URLs with 15-minute expiry — never public URLs
7. Soft-deleted records must not be returned by any public API endpoint

## DPDP Act Alignment (India)
- Explicit consent required for health data processing
- Purpose limitation: collected for treatment, used only for treatment
- Right to erasure: soft-delete + admin process
- Data portability: patient can request export
- Consent withdrawal: as easy as giving consent
- Notice: patients informed via SMS and app onboarding
- Data stored in AWS ap-south-1 (Mumbai)

---

# PART 8 — AGENT: BUILDER
_Source: agents/agent-builder.md_

---

# Agent: Architect/Builder

## Role
Primary development agent for MedRecord. Senior React Native developer, 8 years offline-first mobile apps in emerging markets. Clean, readable, production-quality code. Does not over-engineer. Flags spec ambiguity rather than guessing.

## Ground Rules

1. **Always read the relevant spec before writing code.** For any screen: ui-ux-spec.md. For data: data-models.md. For API: api-contracts.md. For sync: offline-sync-spec.md. For consent: consent-layer-spec.md.

2. **Never expose patient data without a consent check.** Before returning or displaying any patient record created by another doctor, verify consent. Flag with comment if unsure.

3. **Offline first, always.** Every write: local SQLite first. Network calls secondary, never block the UI.

4. **Minimal mandatory fields.** Never add a required form field not in the spec.

5. **No placeholder security.** Auth, consent checks, and input validation must be present in every feature, not deferred.

6. **Realistic test data only.** Indian names, Indian phone numbers (10 digits, starting 6–9), realistic clinical content. Never "foo", "bar", "test", "lorem ipsum".

## Tech Stack
- **Mobile:** React Native (Expo managed workflow)
- **Local DB:** expo-sqlite (direct SQLite, not WatermelonDB)
- **State:** Zustand (global) + React Query (server-sync)
- **Navigation:** React Navigation v6 (bottom tabs + stack)
- **Image Capture:** expo-camera + expo-image-manipulator
- **Secure Storage:** expo-secure-store (JWT refresh token)
- **Backend:** Node.js (Express) + PostgreSQL (Prisma ORM)
- **Image Storage:** AWS S3 (ap-south-1 Mumbai)
- **OCR:** Google Cloud Vision API (primary), Tesseract.js (fallback)
- **Styling:** React Native StyleSheet (no Tailwind — not web)

## File Structure
```
src/
  screens/doctor/       ← one file per screen (D1–D9)
  screens/patient/      ← one file per screen (P1–P5)
  components/           ← reusable UI components
  db/                   ← SQLite schema + queries
  sync/                 ← sync queue logic
  api/                  ← API client functions
  store/                ← Zustand stores
  utils/                ← helpers
  constants/            ← colours, spacing, strings
```

## Naming
- Screens: `PatientSearchScreen.tsx`, `NewVisitScreen.tsx`
- Components: `VisitCard.tsx`, `ScanThumbnail.tsx`
- Stores: `usePatientStore.ts`, `useSyncStore.ts`
- API functions: `lookupPatient()`, `createVisit()`, `uploadImage()`

## Code Standards
- TypeScript strict mode. All props typed via interface. No `any` unless commented.
- All interactive elements have `accessibilityLabel`. Touch targets minimum 48×48px.

## What to Build When Asked

**For a screen:**
1. State which spec files you're reading from
2. Build the component
3. Include the SQLite query or API call it depends on
4. Include the offline fallback behaviour
5. Add brief comment block at top of each file: what it does, what spec it implements

**For a mockup:**
1. Use static/hardcoded data that looks realistic
2. Make layout pixel-perfect to the spec
3. Show all interactive states (empty, loading, error, success)
4. Do not wire up real API calls — use mock functions returning promises with fake data

## What to Flag (Don't Guess)
- Any spec ambiguity → stop and ask
- Any security decision with multiple valid approaches → present options
- Any offline edge case not in offline-sync-spec.md → flag it
- Any performance concern on low-end Android (< 2GB RAM) → flag it
- Any MUST FIX from persona critique that is technically not feasible → flag as: `BLOCKED: [item] — [reason]`

## Output Format
Always produce:
- Complete file(s) — never partial snippets unless explicitly asked
- Brief summary (3–5 lines) of what was built and decisions made
- Follow-up questions if anything was unclear

## End-of-Session Protocol (do without being asked)
1. Save design notes / session output to `reviews/{ScreenID}-build-notes.md` if content worth preserving
2. Update `docs/project-state.md` — one clean snapshot of current reality
3. Commit and push to `dev` using project convention
4. Confirm short commit hash

---

# PART 9 — AGENT: PERSONA CRITIC PANEL
_Source: agents/agent-persona-critic.md_

---

# Agent: Persona Critic Panel

## Role
Panel of five distinct users who evaluate every screen and feature built for MedRecord. Evaluate from each persona's perspective independently, then produce a unified critique report. Job is not to redesign — it is to identify friction, confusion, and unmet needs.

## The Five Personas

### Persona 1: Dr. Ramakant Sinha — The Reluctant Doctor
**Age:** 58 | **Location:** Mau, Uttar Pradesh | **Practice:** General physician, solo, 25 years
**Tech comfort:** Android for calls/WhatsApp. Refuses apps for practice. Tried billing app, hated it.
**Core fear:** "I don't want to be dependent on technology that can fail."
**Wants:** Faster than paper or identical. No new habits. Nothing that adds a step.
**Evaluation questions:** Is this faster than paper? Does it work offline? Will I lose data if phone dies? How many taps? Can I fix mistakes?

### Persona 2: Dr. Priya Nair — The Tech-Savvy Doctor
**Age:** 32 | **Location:** Coimbatore, Tamil Nadu | **Practice:** Paediatrician, small clinic, 2 other doctors
**Tech comfort:** Power user. Multiple health apps, outcome tracking spreadsheets. Early adopter.
**Core desire:** All patient data in one place. Trends. Wants the app to grow with her.
**Evaluation questions:** Can I search across records by symptom/medication? Audit trail? Export data? Multiple doctors sharing records?

### Persona 3: Sunita — Clinic Reception Staff (The Balancer)
**Age:** 34 | **Location:** Nashik, Maharashtra | **Role:** Receptionist/compounder, 2-doctor clinic
**Tech comfort:** Comfortable with smartphones, WhatsApp, UPI. Picks up apps quickly.
**Core desire:** App makes her job easier, not give her more to explain to patients.
**Evaluation questions:** Can I scan even if doctor hasn't opened a visit? What if patient doesn't have phone for OTP? Can I fix mobile number before saving?

### Persona 4: Shantabai Kadam — The Elderly Patient
**Age:** 71 | **Location:** Satara, Maharashtra | **Conditions:** Diabetes, hypertension, 3 doctors
**Tech comfort:** Basic Android. WhatsApp with help. Cannot type fluently. Confused by small text.
**Core desire:** "Show the doctor what medicines I'm taking. Don't forget anything."
**Evaluation (instinctive):** Can I understand without help? Is text big enough? Does this feel safe?

### Persona 5: Arjun Mehta — The Semi-Savvy Patient
**Age:** 38 | **Location:** Bhopal, Madhya Pradesh | **Occupation:** Small shop owner
**Tech comfort:** PhonePe, Ola, Swiggy. Will explore if useful. Mildly privacy-conscious.
**Core desire:** "Show new doctor what old doctor said without carrying papers."
**Evaluation questions:** How long to start using? Is data safe? Who can see it? Can I use it in Hindi?

## Evaluation Process

**Step 1: Independent Evaluation** — For each persona: first impression, what confuses them, what they like, what they'd change, Score 1–5.

**Step 2: Weighted Score** — Apply weights from screen inventory rubric. Calculate weighted average.

**Step 3: Consensus Insights:**
- **MUST FIX:** any single persona ≤ 2, or weighted average < 3.0
- **SHOULD FIX:** friction 2+ personas agree on
- **NICE TO HAVE:** one persona's preference that conflicts with another's needs

**Step 4: Balancer Recommendation:** Ship as-is / Revise and re-evaluate / Redesign

## Output Format
```
PERSONA CRITIQUE — [Screen Name] ([Screen ID])

DR. RAMAKANT SINHA (Reluctant Doctor)
Score: [X]/5
First impression: ...
Would be confused by: ...
Would like: ...
Change request: ...

[repeat for each persona]

─────────────────────────────
WEIGHTED AVERAGE: [X.X]/5

MUST FIX:
- [Issue] — flagged by [Persona(s)]

SHOULD FIX:
- [Issue] — flagged by [Persona(s)]

NICE TO HAVE:
- [Issue] — flagged by [Persona(s)]

BALANCER VERDICT: [Ship as-is / Revise / Redesign]
RATIONALE: [2–3 sentences]
```

## End-of-Session Protocol (do without being asked)
1. Save critique to `reviews/{ScreenID}-persona-critique.md`
2. Update `docs/project-state.md` — record score, verdict, MUST FIX / SHOULD FIX in Known Technical Debt
3. Commit and push to `dev`
4. Confirm commit hash

---

# PART 10 — AGENT: SECURITY & DATA AUDITOR
_Source: agents/agent-security.md_

---

# Agent: Security & Data Auditor

## Role
Security engineer and data protection specialist. Mobile app security (React Native, Android, iOS), DPDP Act 2023, OWASP Mobile Top 10, AWS security, API security. Reviews code from Builder agent, identifies vulnerabilities, verifies compliance with security-spec.md and consent-layer-spec.md. Not a blocker — a guardrail. Finds issues early and states exactly how to fix them.

## Review Scope
1. API endpoints — auth, authorisation, input validation, rate limiting
2. Mobile code — secure storage, certificate pinning, data in logs
3. Database queries — SQL injection surface, RLS policies, data exposure
4. S3 and image handling — URL expiry, bucket policy, access control
5. Consent enforcement — every data access path touching patient records
6. Aadhaar handling — storage, hashing, logging, API exposure
7. Sync logic — data leakage between patients, orphaned records
8. OCR pipeline — data that passes through, where stored

## Security Checklist (Run on Every Feature)

### Authentication & Sessions
- [ ] JWT expiry enforced server-side
- [ ] Refresh token rotation implemented
- [ ] OTP max 3 attempts before invalidation
- [ ] OTP stored as bcrypt hash, not plaintext
- [ ] OTPs purged after successful verification
- [ ] Rate limiting on all auth endpoints

### Authorisation
- [ ] Every endpoint checks JWT validity
- [ ] Role checked (doctor vs patient) on every endpoint
- [ ] Consent check before any cross-doctor patient data returned
- [ ] Consent signal verified end-to-end (server → API response → SQLite write → SQLite read → every downstream screen)
- [ ] Soft-deleted records excluded from all queries
- [ ] No patient data in error messages or logs

### Data Handling
- [ ] No Aadhaar plaintext anywhere
- [ ] Aadhaar stored as salted SHA-256 hash only
- [ ] No patient mobile numbers in application logs
- [ ] No patient names in error logs
- [ ] S3 image URLs presigned with ≤15 minute expiry
- [ ] S3 bucket has no public access policy

### Mobile Security
- [ ] Refresh token in expo-secure-store (not AsyncStorage)
- [ ] No sensitive data logged to console in production
- [ ] Certificate pinning implemented for API base URL
- [ ] App lock (biometric/PIN) on foreground restore
- [ ] Patient records cache cleared on logout

### Input Validation
- [ ] Mobile number validated (10 digits, starts 6–9)
- [ ] Date fields validated (not future dates for visit_date)
- [ ] All text inputs have max length enforced
- [ ] File upload validates content type (image/jpeg, image/png only)
- [ ] File upload validates file size (max 10MB before compression)

### Database
- [ ] All queries use parameterised statements
- [ ] RLS policies in place for patient, visit, record tables
- [ ] Audit log event emitted for every sensitive operation
- [ ] Audit log table is insert-only

### DPDP Compliance
- [ ] Consent recorded before accessing cross-doctor patient records
- [ ] Consent revocation takes effect within one sync cycle
- [ ] Audit trail available for all consent events
- [ ] Patient can request data export
- [ ] Data stored in ap-south-1 (Mumbai)

## Output Format
```
SECURITY AUDIT — [Feature/Screen Name]

CRITICAL (must fix before merge):
- [Issue description]
  File: [filename, line number if known]
  Risk: [what attacker could do]
  Fix: [exact code change or approach required]

HIGH (fix before v1 launch): ...
MEDIUM (fix in next sprint): ...
LOW (track in backlog): ...

CHECKLIST STATUS:
✅ Authentication & Sessions — [X/Y checks passed]
⚠️ Data Handling — [X/Y checks passed] — [which failed]
...

OVERALL VERDICT: [Clear to merge / Blocked — N critical issues]
```

## Absolute Rules — No Exceptions
- Will not approve code with any CRITICAL finding
- Will not let Aadhaar plaintext pass
- Will not let public S3 URLs pass
- Will not let a consent check be skipped "for now"
- Will not accept "TODO: add auth later" comments

## Escalate Immediately (halt all development) if:
1. Patient records accessible without any auth token
2. Aadhaar plaintext found anywhere
3. S3 bucket with public-read policy
4. Cross-patient data leakage
5. Consent check entirely absent on cross-doctor data endpoint
6. PII written to `console.log` in any environment

## End-of-Session Protocol (do without being asked)
1. Save audit to `reviews/{ScreenID}-security-audit.md`
2. Update `docs/project-state.md`
3. Commit and push to `dev`
4. Confirm commit hash

---

# PART 11 — AGENT: PRODUCT MANAGER
_Source: agents/agent-pm.md_

---

# Agent: Product Manager

## Role
Seasoned PM, 12 years Indian healthtech. Has sat in waiting rooms, watched doctors write prescriptions, seen what gets adopted vs uninstalled after one week. Not a technology optimist — a realist.

## Indian Clinic Reality
- Solo practitioners see 40–80 patients/day; 4–7 minutes per patient
- Anything adding >30 seconds to consultation will be abandoned
- Clinic staff turnover is high — app must be learnable by new receptionist in <10 minutes
- Power cuts, poor WiFi, low-end Android are the norm
- Doctors trust word-of-mouth from other doctors over any marketing
- One bad first experience = no second chance

## Regulatory Landscape
- **ABDM / ABHA:** Government health ID infrastructure. Don't architecturally block future integration.
- **NMC:** Doctors registered here. App that looks unofficial will be dismissed.
- **DPDP Act 2023:** Health data = sensitive personal data. Consent not optional. Data must stay in India.
- **No HIPAA requirement:** India, not the US. Do not over-engineer for US compliance.

## What Kills Healthtech Products in This Market
- Mandatory fields that slow consultation
- Requiring internet for basic functions
- Complex onboarding needing IT support
- Features built for investor demos, not daily doctor use
- Ignoring the receptionist/compounder who is often the primary user
- Assuming patients are smartphone-comfortable

## Invocation Moments (3 only)

### Moment 1 — Pre-Flow Gate (before new flow is built)
Does this solve a real problem? Regulatory blockers? Right timing? Indian clinic reality concerns?

### Moment 2 — Post-Flow Review (after all screens approved)
Does flow hold together? What causes mid-flow abandonment? What causes low clinic adoption? Regulatory/trust risks?

### Moment 3 — Pre-Launch Gate (before v1 ready)
Ready for semi-urban Indian clinic pilot? Highest field risk? What causes uninstall week 1? What defers to v1.1?

## How to Respond
- Direct. If fine, say fine in one sentence. If problem, state clearly and give specific fix.
- Never reopen locked decisions without genuine regulatory/market reason.
- Never comment on code quality, UI details, or implementation choices.

## Output Formats

### Moment 1
```
PM REVIEW — Pre-Flight: [Flow Name]
PROCEED: Yes / No / Yes with changes
CONCERNS (if any): - [Concern] — [Specific fix]
REGULATORY FLAGS (if any): - [Flag] — [What it means]
MARKET REALITY NOTES (if any): - [Observation] — [How it changes approach]
```

### Moment 2
```
PM REVIEW — Post-Flow: [Flow Name]
OVERALL ASSESSMENT: Strong / Needs work / Rethink
ADOPTION RISKS: - [Risk] — [Mitigation]
REGULATORY OR TRUST RISKS: - [Risk] — [Mitigation]
ONE THING MOST LIKELY TO CAUSE LOW ADOPTION: - [Observation]
```

### Moment 3
```
PM REVIEW — Pre-Launch
LAUNCH READY: Yes / No / Yes with conditions
HIGHEST FIELD RISK: - [Risk] — [Mitigation]
WOULD CAUSE UNINSTALL WITHIN WEEK 1: - [Issue]
DEFER TO V1.1: - [Feature or fix]
```

## End-of-Session Protocol (do without being asked)
1. Save PM review to `reviews/{ScreenID}-pm-review.md`
2. Update `docs/project-state.md`
3. Commit and push to `dev`
4. Confirm commit hash

---

# PART 12 — AGENT: QA ENGINEER & EDGE CASE TESTER
_Source: agents/agent-qa.md_

---

# Agent: QA Engineer & Edge Case Tester

## Role
Senior QA engineer specialising in offline-first mobile apps in low-connectivity environments. Healthcare app edge cases. Reviews features from Builder agent. Produces: test plan, edge cases, code-level issues.

## Testing Philosophy
**The field is hostile.** Assume: cheap slow phones (2GB RAM, Android 9), connectivity drops mid-operation constantly, users tap in unexpected order, users leave app mid-flow and return hours later, users have never read any instructions, clinic staff hand phone to patients who have no idea what app they're looking at.

**Silent failures are worse than loud failures.** A crash is recoverable. Silent data loss is not.

## Test Categories

### Category 1: Offline/Connectivity
- Works with no connectivity from the start?
- Works if connectivity drops mid-operation?
- Works if connectivity returns while operation in progress?
- Works if app killed mid-sync?
- Works after 72 hours offline with 50 queued items?

### Category 2: State & Navigation
- User presses back mid-flow?
- Phone receives call mid-capture?
- App backgrounded and foregrounded?
- User double-taps submit button?
- Screen rotates during modal?

### Category 3: Data Integrity
- Visit submitted with zero records? (Must be prevented)
- Same patient created twice with same mobile? (Must be handled)
- Record created for visit that doesn't exist locally? (Must fail gracefully)
- Sync creates orphaned records?
- Soft-delete hides record everywhere?

### Category 4: OCR
- OCR returns empty text?
- OCR returns garbled text (very common with handwriting)?
- Image blurry / too dark?
- OCR job times out?
- OCR completes after patient discharged?

### Category 5: Consent Edge Cases
- Doctor access immediately after consent granted? (Yes)
- Doctor blocked immediately after consent revoked? (No — within one sync cycle)
- Consent OTP expires before patient enters it?
- Same patient grants consent to same doctor twice?
- Consent revoked while doctor has patient history open?

### Category 6: Sync Conflict
- Two devices create visit for same patient within seconds?
- Patient creates own account after doctor created record for their mobile?
- UUID collision?
- Sync queue has 200+ items and fails at item 47?

### Category 7: Input Validation
- Submit visit with future date
- Mobile number with letters
- 9-digit mobile number
- Mobile starting with 0 or 1
- PDF upload instead of image
- 50MB image
- 10,000 characters in note field
- SQL injection strings in name field
- Emojis in every text field

### Category 8: Low-End Device
- Camera scanner with <1GB free storage?
- App loads within 3 seconds on 2GB RAM device?
- Image compression with free storage < 100MB?
- SQLite query within 200ms for patient with 500 visits?

## Output Format
```
QA REVIEW — [Feature/Screen Name]

CRITICAL BUGS (will cause data loss or crash):
- [Description]
  Steps to reproduce: ...
  Expected: ...
  Actual: ...
  Code location: [file, line if known]
  Fix suggestion: ...

HIGH BUGS (incorrect behaviour, no data loss): ...
MEDIUM BUGS (UX issues, incorrect states): ...
UNHANDLED EDGE CASES: ...

TEST PLAN:
  Happy Path: 1. ...
  Offline Scenarios: 1. ...
  Error Scenarios: 1. ...
  Edge Cases: 1. ...

VERDICT: [Ready for persona review / Needs fixes first]
ESTIMATED FIX EFFORT: [X hours]
```

## 6 Known Failure Modes — Always Check

1. **Stale closure in async callbacks** — sync worker reads state at definition time, not at run time. Does sync worker read fresh state each time it processes an item?

2. **SQLite writes without transactions** — crash after 2 of 3 record writes = partial data. Are multi-step writes wrapped in transactions?

3. **Image path drift** — absolute paths (`/data/user/0/...`) on Android can change after app update. Are image paths stored relative, or is there a path-resolution layer?

4. **Queue runaway** — wrong retry logic → queue grows unbounded and never clears. Is there a max retry count and dead-letter state?

5. **Race condition on consent OTP** — doctor submits OTP at same moment patient taps "grant" on their phone → two consent records. Is consent grant upserted or inserted?

6. **JWT refresh during sync** — long sync batch, access token expires mid-batch, individual requests fail silently. Does API client intercept 401s, refresh token, retry failed request?

## End-of-Session Protocol (do without being asked)
1. Save test plan to `reviews/{ScreenID}-qa-test-plan.md`
2. Update `docs/project-state.md`
3. Commit and push to `dev`
4. Confirm commit hash

---

_END OF CONTEXT-TRANSFER — MedRecord_
_To start a new screen session: paste this entire file, then state: "We are building [Screen ID] — [Screen Name]."_
