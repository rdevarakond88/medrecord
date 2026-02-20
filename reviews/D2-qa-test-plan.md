# QA REVIEW — D2: Patient Search Screen

**Screen:** `src/screens/doctor/PatientSearchScreen.tsx`
**Date:** 2026-02-19

---

## CRITICAL BUGS (will cause data loss or incorrect data access in production)

---

**C-1 — Cross-doctor patient data leakage on shared devices**

`clearAuth()` clears Zustand auth state but does not wipe the SQLite `patients` table or the `getRecentPatients` result. On a shared clinic phone, when Doctor A logs out and Doctor B logs in, `recentPatients` state initialises from `getRecentPatients(db)`, which returns Doctor A's patients — names, mobile numbers, visit dates — with zero auth check.

- **Steps to reproduce:** Doctor A logs in, searches for three patients. Doctor A logs out. Doctor B logs in. D2 renders. Recent patients section shows Doctor A's patients.
- **Expected:** No patient data visible until Doctor B has actually accessed patients under their own session.
- **Actual:** Doctor A's five most-recently accessed patients are displayed immediately.
- **Code location:** `src/screens/doctor/PatientSearchScreen.tsx` mount effect (`getRecentPatients` call); `src/store/useAuthStore.ts` `clearAuth()`
- **Fix suggestion:** On `clearAuth()`, run `DELETE FROM patients` (or at minimum `DELETE FROM patients WHERE synced_at IS NOT NULL`). Additionally, scope `getRecentPatients` to a `doctor_id` column added to the patients table.

---

**C-2 — `consent_granted` is fetched from server but silently discarded; D3 receives no consent signal**

`upsertPatientFromServer` maps `ApiPatient` fields to the local schema. The `ApiPatient` interface carries `consent_granted: boolean`, but the `LocalPatient` schema has no `consent_granted` column. The value is never written. `PatientSearchScreen` passes `patientLocalId` and `patientServerId` to D3 via `navigation.navigate('PatientDetail', ...)`. D3 has no way to know consent status from local data, so it will either crash looking for the field or, worse, display records to a doctor who has not been granted consent.

- **Steps to reproduce:** Patient has `consent_granted: false` on server. Doctor looks up patient by 10-digit mobile while online. Server returns patient. Doctor taps the patient row. D3 opens.
- **Expected:** D3 recognises consent is not granted and shows the in-clinic consent flow (D9).
- **Actual:** D3 receives no consent signal; behaviour depends entirely on D3's own implementation — if D3 trusts local data it will silently show full records.
- **Code location:** `src/db/patients.ts` `upsertPatientFromServer`; `src/api/patients.ts` `ApiPatient` interface
- **Fix suggestion:** Add `consent_granted INTEGER NOT NULL DEFAULT 0` to the patients table schema. Write it in `upsertPatientFromServer`. Pass it to D3 in the navigation params.

---

**C-3 — React Query cache persists across logout; stale token data returned to new session**

`useQuery` for `lookupPatient` is keyed on `['patient', query]`. When Doctor A logs out, the React Query `QueryClient` is not invalidated or reset. Doctor B logs in and types the same 10-digit number Doctor A previously searched. React Query returns the cached `ApiPatient` from Doctor A's session — including any consent state — without making a new network request.

- **Steps to reproduce:** Doctor A searches `9876543210`. Logs out. Doctor B logs in. Types `9876543210`. Query is served from cache.
- **Expected:** Fresh server fetch with Doctor B's token; fresh `consent_granted` value.
- **Actual:** Doctor A's cached result returned; Doctor B's token never sent; `consent_granted` may be wrong.
- **Code location:** Wherever `QueryClient` is instantiated (likely `App.tsx`); `src/screens/doctor/PatientSearchScreen.tsx` `useQuery` call
- **Fix suggestion:** Call `queryClient.clear()` inside `clearAuth()`.

---

## HIGH BUGS (incorrect behaviour, no data loss)

---

**H-1 — `getRecentPatients` not scoped to current doctor; cross-doctor contamination in multi-doctor device**

`SELECT * FROM patients ORDER BY COALESCE(last_visit_date, created_at) DESC LIMIT 5` returns the five most-recently touched patients regardless of which doctor created or accessed them. On a multi-doctor device this will mix patients.

- **Code location:** `src/db/patients.ts` `getRecentPatients`
- **Fix suggestion:** Add `doctor_id TEXT NOT NULL` column to patients table; filter `WHERE doctor_id = ?`.

---

**H-2 — Auth errors from `lookupPatient` are silently swallowed**

`useQuery` wraps `lookupPatient`. If the server returns 401 (expired token), `apiFetch` throws `ApiError(status: 401)`. React Query catches this and puts the query in `error` state, but the screen has no `isError` branch rendered to the user. The doctor types a 10-digit number, the spinner appears, then disappears, and the screen shows either stale local results or nothing. The doctor does not know the session expired.

- **Steps to reproduce:** Let access token expire. Go online. Type a 10-digit number not in local SQLite.
- **Expected:** "Session expired, please log in again" or automatic token refresh + retry.
- **Actual:** Silent failure; no result shown; no error message.
- **Code location:** `src/screens/doctor/PatientSearchScreen.tsx` `ContentArea` — no `isError` handling
- **Fix suggestion:** Add `isError` guard in `ContentArea`; implement 401 interceptor in `apiFetch` that refreshes the JWT and retries once.

---

**H-3 — No validation on first digit of Indian mobile number**

Valid Indian mobile numbers start with 6, 7, 8, or 9. Numbers starting with 0–5 are not valid. The numeric keypad allows entry of any sequence. `searchPatientsByMobile` fires a LIKE query on any 3+ digit string. A doctor who miskeys and starts with `0` will get a server lookup for `0XXXXXXXXX`, which will always return 404, potentially causing a new patient record to be created with an invalid mobile number.

- **Code location:** `src/screens/doctor/PatientSearchScreen.tsx` — query used without validation; `src/api/patients.ts` — no client-side pre-validation before fetch
- **Fix suggestion:** After first digit is entered, validate it is 6–9. Show inline error "Please enter a valid mobile number" if not. Block `useQuery` from firing.

---

**H-4 — D2 renders local SQLite patient data with no auth guard**

The component mounts and calls `getRecentPatients(db)` before confirming `token` is non-null. If navigation somehow reaches D2 before auth state is populated (race condition on app restore from background), patient data is displayed to an unauthenticated state.

- **Fix suggestion:** Guard the mount effect with `if (!token) return;`. Add a root-level navigation guard that redirects to login if `token` is null.

---

**H-5 — `useNetworkStatus` false-positive causes server lookup to fire on unconfirmed network**

`useNetworkStatus` returns `isConnected && isInternetReachable !== false`. On Android, `isInternetReachable` can be `null` (not yet determined) immediately after app foreground. `null !== false` is `true`, so `isOnline` is `true` even though internet is not confirmed. This causes `useQuery` to fire against a captive portal or unreachable network, and the resulting error is silently swallowed (see H-2).

- **Steps to reproduce:** Connect to a WiFi network with a captive portal (no real internet). Type a 10-digit number.
- **Fix suggestion:** Change condition to `isConnected === true && isInternetReachable === true`.

---

## MEDIUM BUGS (UX issues, incorrect states)

---

**M-1 — No "zero results" state for 10-digit number with no local or server match**

When exactly 10 digits are typed and local SQLite has no match AND server returns 404, the `NoMatchSection` with "Add New Patient" CTA must appear. This state is missing in the mockup and may not be fully wired in the live screen.

- **Code location:** `src/screens/doctor/PatientSearchScreen.tsx` `ContentArea` — verify `isNoMatch` condition covers `localResults.length === 0 && serverResult === null && query.length === 10 && !isLoading`

---

**M-2 — Full mobile numbers visible in `PatientRow`; PII exposed to bystanders**

`formatMobile(mobile)` with no `mask` argument renders the full number (+91 XXXXX XXXXX). In a crowded clinic waiting room, bystanders can read patient mobile numbers. `formatters.ts` supports `mask=true` which shows last 5 digits only.

- **Fix suggestion:** Render `formatMobile(patient.mobile_number, true)` in `PatientRow`. Show the full number only in D3 after consent is confirmed.

---

**M-3 — Clear button touch target is 28×28px (WCAG AA minimum is 44×44px)**

The clear button (×) in the search bar is below the WCAG AA minimum touch target. A doctor with large fingers or working in a hurry will miss the tap repeatedly.

- **Fix suggestion:** Expand `hitSlop: { top: 10, bottom: 10, left: 10, right: 10 }` or increase the button style to `44×44` with a centred icon.

---

**M-4 — `upsertPatientFromServer` COALESCE merge can silently overwrite a newer local edit**

The upsert uses `COALESCE(excluded.name, patients.name)` — if the server sends an older version of the name (e.g., from a different device that hasn't synced), it overwrites the local name without checking `updated_at`.

- **Code location:** `src/db/patients.ts` `upsertPatientFromServer`
- **Fix suggestion:** Only overwrite local fields if `excluded.updated_at > patients.updated_at`.

---

**M-5 — Non-zero `staleTime` on React Query lookup can return stale `consent_granted` value**

A patient who revoked consent may still appear accessible until the stale window expires. Given consent drives access to sensitive medical records, `staleTime` for `lookupPatient` should be `0`.

- **Code location:** `src/screens/doctor/PatientSearchScreen.tsx` `useQuery` options

---

## UNHANDLED EDGE CASES (not bugs yet, but will be in production)

---

**E-1 — Offline-only patient (`server_id: null`) tapped; D3 receives `patientServerId: null`**

Navigation passes both `patientLocalId` and `patientServerId`. If the patient was created offline and sync has not completed, `server_id` is null. D3 must handle null server ID gracefully.

- **Recommended handling:** D3 must accept `patientServerId: string | null`. Show an "Unsynced patient — some features unavailable" notice if server_id is null.

---

**E-2 — Sync completes while doctor is on D2; `recentPatients` state goes stale**

`recentPatients` is loaded once on mount. If a background sync adds patients to SQLite while the doctor is on D2, the list does not refresh.

- **Recommended handling:** Use `useFocusEffect` to re-run `getRecentPatients` each time D2 comes into focus. Alternatively subscribe to a sync-complete event.

---

**E-3 — Doctor types 10 digits, changes number, retypes same 10 digits; two concurrent server requests**

Rapid query key changes may produce overlapping in-flight requests. The later response may arrive after an earlier one and render stale data.

- **Recommended handling:** Confirm React Query cancels the previous request on key change (`keepPreviousData: false`; use an `AbortController` in `lookupPatient`).

---

**E-4 — Clock skew causes incorrect ordering in `getRecentPatients`**

The spec notes device clocks can be wrong on cheap Android devices. `COALESCE(last_visit_date, created_at) DESC` sorts by device-local time, so a device with an incorrect clock will sort patients incorrectly.

- **Recommended handling:** After sync, use server-assigned `created_at` for ordering. `visit_date` is user-editable (per offline-sync-spec.md) to handle wrong device dates.

---

**E-5 — App killed while `lookupPatient` in-flight; on relaunch, no result and no stale spinner**

If the API call was in-flight when the app was killed, the server response is never received. The patient is not in local SQLite.

- **Recommended handling:** On mount, always reset loading state. React Query handles this correctly if the QueryClient is not persisted across app kills — confirm it is not.

---

**E-6 — `searchPatientsByMobile` LIKE query matches number anywhere in the string, not prefix-anchored**

Pattern `%123%` will match `9812345678` AND `9998123456`. With common digit sequences (e.g., `999`) this returns unrelated results and creates cognitive noise.

- **Recommended handling:** Change LIKE pattern to `123%` (prefix-anchored). Indian mobile numbers are 10 digits with known prefixes, so prefix search is strictly more useful.

---

**E-7 — Double-tap on `PatientRow` pushes two D3 screens onto the navigation stack**

On a slow device, two taps before navigation completes will push two `PatientDetail` screens.

- **Recommended handling:** Disable the row `onPress` immediately on first tap using a ref flag, or use `navigation.replace` instead of `navigation.navigate`.

---

**E-8 — "Add New Patient" tapped with partially-typed number (3–9 digits) prefills D5 with invalid mobile**

`navigation.navigate('NewPatientForm', { prefillMobile: query })` fires regardless of whether `query` is a valid 10-digit number.

- **Recommended handling:** Only pass `prefillMobile` if `query.length === 10`. Otherwise navigate to D5 with no prefill.

---

**E-9 — Offline patient access generates no audit log**

When a doctor views patient search results while offline, there is no audit trail. This is a healthcare compliance gap.

- **Recommended handling:** Write to an `audit_log` table in local SQLite on every patient access (`patient_id`, `doctor_id`, `accessed_at`, `action: 'view'`). Sync audit logs to the server as part of the sync queue.

---

## TEST PLAN

### Happy Path

1. Doctor opens app, authenticated, device online. D2 loads. Recent patients section shows up to 5 patients ordered by last visit date.
2. Doctor types 3 digits → local SQLite LIKE query fires → results appear within 200ms.
3. Doctor types 4–9 digits → results narrow in real-time from local SQLite.
4. Doctor types 10 valid digits → server lookup fires → spinner shows → server returns patient → patient row appears → `upsertPatientFromServer` runs → patient now cached in local SQLite.
5. Doctor taps a patient row → navigates to D3 with `patientLocalId` + `patientServerId` + `consent_granted`.
6. Doctor clears the query (taps ×) → returns to recent patients view.
7. Doctor types 10 digits, server returns 404, local SQLite has no match → "No patient found" + "Add New Patient" CTA appears.
8. Doctor taps "Add New Patient" → navigates to D5 with `prefillMobile: query`.

### Offline Scenarios

1. **Full offline from launch:** Disable network before opening app. D2 loads with amber `OfflineBanner`. Type 3–9 digits → local SQLite search fires, results appear. Type 10 digits → no server call made; if no local match, `NoMatchSection` appears.
2. **Connectivity drops mid-lookup:** Type 9 digits while online. Go offline. Type 10th digit. Verify: `useQuery` either does not fire (isOnline = false) or fails gracefully with no crash. `OfflineBanner` appears.
3. **Connectivity returns while on screen:** Go offline, type 8 digits. Go online. Verify no stale `isOnline` triggers a lookup on an 8-digit query. Complete to 10 digits → server lookup fires correctly.
4. **App backgrounded mid-lookup:** Type 10 digits, press home before server responds. Return to app. Verify: spinner does not persist; query is re-issued or result loads from cache.
5. **Offline patient in recent list:** Create patient offline (local_id, no server_id). Recent patients list shows the patient. Tap row. Navigate to D3 with `patientServerId: null`. D3 handles gracefully.
6. **72 hours offline:** App opened after 3 days offline. All interactions use local SQLite only. No data loss. Sync queue unaffected by this screen.

### Error Scenarios

1. **Server returns 500:** Mock server to return 500 on patient lookup. Verify: error state surfaced to user (not silently swallowed); local SQLite result shown if available; no crash.
2. **Server returns 401 (expired token):** Verify: either auto-refresh + retry happens, or user is redirected to login. No silent failure.
3. **Network timeout:** Set server response delay to 30s. Type 10 digits. Verify: React Query timeout fires; loading state clears; error or fallback shown.
4. **SQLite unavailable (storage full):** Fill device storage to <5MB. Open app. Verify: `getRecentPatients` failure is caught; empty list shown; no crash.
5. **Malformed server response:** Server returns patient with `null` mobile_number. Verify: `upsertPatientFromServer` does not insert a row violating the `NOT NULL UNIQUE` constraint.

### Input Validation Tests

1. Enter `0987654321` (starts with 0) → inline validation error; no lookup triggered.
2. Enter `1987654321` (starts with 1) → same.
3. Enter `5987654321` (starts with 5) → same.
4. Enter `6987654321` (starts with 6) → valid; lookup fires at 10 digits.
5. Enter 9 digits → verify server lookup does NOT fire; no "Add New Patient" CTA shown.
6. Enter 11 digits → numeric keypad must cap at 10; 11th tap ignored.
7. Enter `9999999999` (all same digit) → valid format; lookup fires; 404 expected; `NoMatchSection` shown.
8. Physical keyboard connected (Bluetooth): attempt to type letters. Verify non-numeric input is rejected.

### State & Navigation Tests

1. **Double-tap patient row:** Tap a patient row twice rapidly on a slow device. Verify only one D3 screen is pushed onto the navigation stack.
2. **Back from D3 to D2:** Navigate to D3, press back. Verify D2 retains previous query and results, or resets cleanly — either is acceptable but must be consistent.
3. **Phone call mid-lookup:** Type 10 digits, receive incoming call before server responds. Accept call, return to app. Verify no crash; query cancelled or result loads correctly.
4. **Screen rotation during search:** Type 5 digits, rotate device. Verify query text preserved, results preserved, no duplicate SQLite queries fired.
5. **Tab bar navigation while query in progress:** Type 10 digits, quickly tap another tab. Return to Patients tab. Verify state is either preserved or cleanly reset; no memory leak from dangling `useQuery`.
6. **"Add New Patient" double-tap:** Tap the CTA twice rapidly. Verify only one D5 screen is pushed.
7. **App restore from background after 30 minutes:** Background app with D2 active. Return after 30 minutes. Verify: token is still valid or refresh triggered; `recentPatients` re-fetched (`useFocusEffect`); `OfflineBanner` state is current.

### Consent Edge Cases

1. Doctor looks up a patient with `consent_granted: false`. Verify D2 shows the patient in results (search is not consent-gated) but passes `consent_granted: false` to D3.
2. Patient revokes consent on their own device while doctor has D2 open with that patient visible. Doctor taps the row. Verify D3 receives the current consent state (server lookup re-fetches on navigate; `staleTime: 0`).
3. Patient grants consent while doctor is on D2. Doctor had previously received a no-access result. Doctor searches again. Verify fresh `useQuery` fires and now shows `consent_granted: true`.

### Low-End Device Tests

1. Run `searchPatientsByMobile` against local SQLite with 500 patients. Verify response < 200ms. Confirm `idx_patient_mobile` index is used.
2. Load D2 on a 2GB RAM device (or equivalent emulator). Verify first contentful render < 3 seconds.
3. `getRecentPatients` with 500 patients in SQLite → verify `LIMIT 5` prevents full table scan cost; confirm `idx_patient_last_visit` is used.
4. Scroll recent patients list rapidly on a slow device. Verify no dropped frames.

### Security Tests

1. **Cross-doctor leak:** Doctor A logs in, accesses 5 patients, logs out. Doctor B logs in. Verify D2 shows an empty recent patients list.
2. **Auth guard:** Force-navigate to D2 route while auth store has `token: null`. Verify the screen does not render patient data.
3. **PII in accessibility labels:** Run TalkBack on D2. Verify patient rows do not speak out the full mobile number when mobile masking is active.
4. **React Query cache on logout:** After logout, verify `queryClient.getQueryData(['patient', '9876543210'])` returns `undefined`.

---

## VERDICT: Needs fixes first

**ESTIMATED FIX EFFORT: ~18 hours**

| Issue | Effort |
|---|---|
| C-1: SQLite wipe on logout + doctor_id scoping | 4h |
| C-2: consent_granted to schema + D3 nav params | 3h |
| C-3: queryClient.clear() on logout | 1h |
| H-1: doctor_id scoping on getRecentPatients (depends on C-1) | 2h |
| H-2: 401 handling + token refresh interceptor | 3h |
| H-3: first-digit validation on keypad | 1h |
| M-2: mobile masking in PatientRow | 0.5h |
| M-3: clear button touch target | 0.5h |
| E-7: double-tap guard on PatientRow | 1h |
| E-2: useFocusEffect for recent patients refresh | 1h |

The three critical bugs (C-1 cross-doctor data leakage, C-2 silent consent_granted discard, C-3 React Query cache on logout) represent real patient data confidentiality failures that will be triggered in normal multi-doctor clinic use. These must be resolved before any further persona or production review.
