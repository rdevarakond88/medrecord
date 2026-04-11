QA REVIEW — Patient Detail / History (D3)
Generated: 2026-02-23
Reviewer: agent-qa.md
Source: mockups/D3PatientDetailScreen.tsx
Context: Static mockup — four variants. Issues are classified by the risk they
introduce into the live build if the current design is carried forward unchanged.
"Mockup issue" = bug in the mockup itself. "Live build issue" = design gap that
must be addressed when the live screen is written.

---

CRITICAL BUGS (will cause data loss or crash in production):

None in the static mockup itself. One critical live-build concern is already
tracked as D3-H-2 (consent re-verification window) and D3-H-1 (two-list API).
See HIGH section below for the two issues closest to critical in the live build.

---

HIGH BUGS (will cause incorrect behaviour, no data loss):

- H-1: No loading state — consent re-fetch window will flash wrong variant on mount.
  Steps to reproduce: Open D3 from D2. `consentGranted` nav param is `true` (cached).
  Server re-fetch takes 1–2 seconds on a slow clinic connection. During this window
  Variant 1 (full history visible) is rendered on the stale cached value. If the
  server returns `consent_granted: false` (revoked since last sync), the history
  was visible to an unauthorised doctor for up to 2 seconds.
  Expected: D3 renders a loading skeleton on mount; visit history not shown until
  server consent re-fetch returns.
  Actual (mockup): No loading state exists. Variant selection is static.
  Code location: All four variant components — no loading/skeleton state designed.
  Fix: In the live build, show a neutral skeleton (patient header + "Checking
  access…" placeholder) on mount. Populate the correct variant only after the
  server consent response resolves. Fall back to SQLite cache only when
  `isConnected === false`.

- H-2: No error state for consent re-fetch failure — live build will have no
  defined behaviour when the server returns 5xx or times out.
  Steps to reproduce: Open D3 on poor connectivity. Server consent call times out.
  Expected: Fail secure — downgrade to no-consent variant; show banner "Could not
  verify consent — showing limited view. Tap to retry."
  Actual (mockup): No error variant exists; no error state designed.
  Code location: No error handling exists in any variant.
  Fix: Add an error fallback that defaults to the no-consent view. Never fail open
  (i.e., never show full history on an ambiguous server response). A retry affordance
  should be visible.

- H-3: Dynamic consent transition not designed — after consent is granted via D9,
  D3 has no path to transition to the consent-granted variant without a full
  navigation round-trip.
  Steps to reproduce: Doctor is on D3 (no-consent variant). They tap "Request
  Access". Patient enters OTP (D9 flow). Consent is granted. Doctor is returned to
  D3 — but D3 still shows the no-consent variant because the component was never
  re-mounted with an updated `consentGranted` param.
  Expected: D3 automatically transitions to Variant 1 (or Variant 4) when consent
  is granted, without the doctor needing to navigate back to D2 and re-open the
  patient.
  Actual (mockup): Separate stateless components per variant — no in-screen state
  transition possible.
  Code location: Variants 2 and 4 — `handleRequestAccess` stubs `onPress: () => {}`
  (line 361). No post-consent refresh path.
  Fix: In the live build, D3 must be a single component with `consentGranted` as
  a state variable (not just a nav param). After D9 completes and returns, D3
  re-evaluates its consent state and re-renders accordingly. Use React Navigation's
  `setParams` or a Zustand store to propagate the consent grant back into D3 without
  requiring navigation.

- H-4: `ScrollView` + `.map()` for visit list will cause severe jank and potential
  OOM on high-volume patients on low-end devices.
  Steps to reproduce: Open D3 for a patient with 200+ visits on a 2GB RAM Android 9
  device.
  Expected: Smooth scroll; only visible cards rendered.
  Actual (mockup): All visit cards rendered simultaneously via
  `{VISITS.map(visit => (<VisitCard ... />))}` (lines 332–339 in Variant 1, mirrored
  in Variants 2 and 4). With 200 visits × ~80px per card = 16,000px of rendered
  content, the JS thread will stall on a low-end device.
  Code location: Lines 332–339 (Variant 1), 416–422 (Variant 2), 530–537 and
  542–544 (Variant 4).
  Fix: Replace `ScrollView` + `map` with `FlatList` with `maxToRenderPerBatch={10}`
  and `windowSize={5}`. Paginate at 20 visits per page with a "Load more" footer.
  Implement server-side pagination on the visits query from the start.

---

MEDIUM BUGS (UX issues, incorrect states):

- M-1: `View Full Visit` button has no `onPress` and no disabled state — silent
  failure in both the mockup and the live build until D4 is wired.
  Code location: Line 277–282 (VisitCard inline preview).
  Fix suggestion: In the live build, disable this button (greyed, `disabled={true}`)
  if D4 is not yet available, rather than leaving it as a silent no-op. A silent
  button is worse than a disabled one.

- M-2: `New Visit` button has no `onPress` in any variant — silent failure.
  Code location: Lines 321–328 (Variant 1), 385–393 (Variant 2), 447–455
  (Variant 3), 500–508 (Variant 4).
  Fix suggestion: Expected for a static mockup. In the live build, `onPress` must
  navigate to D6. Add a navigation stub comment flagging the target screen to
  prevent this from being forgotten.

- M-3: `recordCount: 0` renders as "0 records" with no special handling.
  Code location: VisitCard, line 214–215:
  `visit.recordCount === 1 ? '1 record' : `${visit.recordCount} records``
  A visit with 0 records is an interrupted/draft session. "0 records" is confusing
  to a doctor ("Is this visit empty? Did something go wrong?").
  Fix suggestion: In the live build, add: `visit.recordCount === 0 ? 'Draft' :
  visit.recordCount === 1 ? '1 record' : `${visit.recordCount} records``.
  Consider a distinct pill colour for draft visits.

- M-4: Patient name has no overflow protection for long Indian names.
  Code location: `patientName` style (line 599–604) — no `numberOfLines` set.
  A name like "Thiruvengadam Krishnamoorthy Parthasarathy" at `fontSize: 22` and
  `fontWeight: 600` will wrap to 2–3 lines and push the consent badge far down
  the screen.
  Fix suggestion: In the live build, add `numberOfLines={1}` + `ellipsizeMode="tail"`
  to the patient name Text node. Optionally show the full name in an accessible hint.

- M-5: Empty state variant shows `ConsentBadge granted={true}` (green "Access
  Granted") with no visit history.
  Code location: `D3PatientDetailEmptyState`, line 445.
  "Access Granted" is semantically meaningless when there are no records to gate.
  A doctor seeing a green badge on an empty history may be confused or wonder if
  data is missing vs. the patient genuinely having no history.
  Fix suggestion: Omit the consent badge entirely in the empty state, or replace with
  a neutral "New Patient" indicator.

- M-6: Offline banner text is ambiguous about consent staleness — shows "Offline —
  showing last synced data" but does not communicate when the consent state was
  last verified. A patient who revoked consent 3 days ago may still appear as
  "Access Granted" to an offline doctor.
  Code location: `OfflineBanner` (line 156–165); offline branch in Variant 1
  (line 310).
  Fix suggestion: In the live build, surface the last sync timestamp alongside
  the offline banner: "Offline — consent verified [date]. Reconnect to update."

- M-7: Inline expanded preview shows identical `FIRST_RECORD_PREVIEW` text
  regardless of which visit is tapped — acceptable in a static mockup but will
  need lazy per-visit fetching in the live build.
  Code location: Lines 146–149 (`FIRST_RECORD_PREVIEW` constant), line 274.
  Fix suggestion: In the live build, each expanded card must fetch its own first
  record lazily on first expansion (keyed by `visit.id`), cache the result in
  component state, and not pre-fetch for all cards on load.

- M-8: Expanded card content may be clipped below the visible area with no
  auto-scroll.
  Steps to reproduce: Scroll to the last visit card at the bottom of the list.
  Tap to expand. The inline preview grows the card downward — the new content
  appears below the screen edge and the user does not know it exists.
  Code location: `handleCardPress` (line 301–304) — no scroll-to-expanded logic.
  Fix suggestion: After `setExpandedId`, use a `ScrollView` ref to scroll to the
  expanded card. `scrollToEnd()` is a blunt instrument; prefer measuring the card
  position and scrolling to bring the preview into view.

---

UNHANDLED EDGE CASES:

- E-1: Consent revoked while D3 is open and showing full history.
  A patient revokes consent from their app while the doctor has D3 open. D3
  continues to display full visit history until the doctor navigates away and back.
  Recommended handling: In the live build, add a `useFocusEffect` hook that
  re-validates consent each time D3 receives navigation focus. Also add an
  `AppState` listener to re-validate on foreground restore. Treat the refresh
  as a background operation — do not block the UI.

- E-2: Consent granted (via OTP) while doctor is mid-consultation with D3 open in
  no-consent state.
  After D9 completes and returns, the doctor is back on D3 still showing the
  no-consent variant. They must navigate away and back to see the newly unlocked
  history.
  Recommended handling: Tracked as H-3 above. After D9 returns, use
  `navigation.setParams({ consentGranted: true })` or update Zustand patient
  store so D3 re-evaluates consent state in-place.

- E-3: Patient has visits from 12 different clinics (high-volume multi-doctor
  patient in Variant 2 and 4).
  Variant 2 renders all VISITS grayed. Variant 4 renders VISITS_OTHER grayed.
  In production, a multi-clinic patient may have 50+ other-doctor visits. Rendering
  all as grayed cards simultaneously is a performance and UX problem.
  Recommended handling: Cap grayed-other-visits at 5 with a "Request consent to
  see all 47 other visits" summary card. Do not render 50 grayed cards.

- E-4: `expandedId` persists if the user double-taps a visit card rapidly on a
  slow device.
  The `handleCardPress` functional state update `prev => (prev === id ? null : id)`
  is correct and avoids stale closure. However, on a slow JS thread, two rapid
  taps may queue two state updates. The second update will toggle back to `null`
  (collapsed), which is the correct idempotent behaviour. No bug — but test on
  a 2GB RAM device to verify the transition doesn't produce a visible flicker.

- E-5: Back navigation from D4 ("View Full Visit") while the parent visit card
  is still expanded.
  When the doctor navigates to D4 and returns, the expanded card state
  (`expandedId`) is local to D3. If React Navigation caches D3 in the stack,
  the card will still be expanded on return — correct. If D3 is re-mounted
  (e.g., the navigation stack was cleared), `expandedId` resets to `null` and
  the card collapses — also acceptable but potentially disorienting.
  Recommended handling: No action needed; both behaviours are acceptable. Test
  on device to verify the chosen Navigation stack caching behaviour.

- E-6: Patient opens D3 on a device where the clock is wrong (a real failure mode
  on cheap Android devices with no NTP sync).
  The visit date is stored as `DD/MM/YYYY` string in the mockup. In the live build,
  if the device clock is wrong, "New Visit" creates a visit with an incorrect date.
  Recommended handling: Store `visit_date` as a server-assigned UTC timestamp,
  not a client-generated date. The server's clock is authoritative.

- E-7: `D3PatientDetailHasDataOwnVisitsOnly` (Variant 4) renders two separate
  date-ordered sections ("My Visits" and "Other Visits") rather than one
  interleaved date-ordered list.
  In the real app, visits are interleaved by date. Splitting into two sections
  means a "My Visits" entry from 18/02/2026 appears above an "Other Visits"
  entry from 14/07/2025, which is correct within each section but the sections
  themselves break the overall chronological narrative.
  Recommended handling: In the live build, decide at design time whether to use
  two sections (clear ownership distinction) or one interleaved list (clearer
  chronology). The current mockup models two sections. Flag as open design
  question before live build begins.

- E-8: No state for "consent request pending — waiting for patient response."
  After "Request Access" is tapped and confirmed in the Alert dialog, there is
  no intermediate state showing "Consent request sent — waiting for patient."
  The screen continues to show the no-consent variant with no feedback.
  Recommended handling: In the live build, add a "Request sent" state with a
  timer/polling indicator: "Waiting for patient to approve. They will receive
  an SMS." Disable the "Request Access" button while a request is pending to
  prevent duplicate consent requests.

- E-9: `VisitCard` in Variant 4 (`D3PatientDetailHasDataOwnVisitsOnly`) renders
  `VISITS_OTHER` without an `expanded` prop and without an `onPress` handler.
  Code location: Line 542–544:
  `<VisitCard key={visit.id} visit={visit} grayed={true} />`
  `expanded` defaults to `false`, `onPress` defaults to `undefined`. The card is
  `disabled={grayed}` so no press fires. This is correct for grayed cards. However,
  the `onPress` prop type is `() => void` (optional), so passing `undefined` is
  valid. Confirm on device that `disabled={true}` on `TouchableOpacity` with no
  `onPress` renders without warnings on both iOS and Android.

---

TEST PLAN:

Happy Path:
1. Open D3 from D2 → patient data (name, masked mobile, age) renders immediately
   from nav params before any network call completes.
2. Green "Access Granted" badge visible. "New Visit" button prominent and full-width.
3. Visit list shows 4 visits, newest-first (18/02/2026 at top, 02/03/2025 at bottom).
4. Tap visit v1 → card expands; chevron rotates to point downward; FIRST RECORD
   preview text appears; "View Full Visit" link visible.
5. Tap v1 again → card collapses; chevron returns to rightward.
6. Tap v3 (no chief complaint) → card expands cleanly with no complaint line;
   clinic name and record count visible; preview text shows.
7. Tap "New Visit" → (stub in mockup; navigation to D6 in live build).
8. Tap "View Full Visit" → (stub in mockup; navigation to D4 in live build).
9. Open Variant 2 → amber badge, all visit cards grayed, chevrons absent, consent
   gate box visible; "New Visit" still active.
10. Tap "Request Access" → Alert dialog shows with masked mobile number (•••••84627).
    "Cancel" dismisses without action. "Send Request" fires stub (onPress: () => {}).
11. Open Variant 4 → "My Visits" section shows 2 expandable cards; "Other Visits"
    section shows 2 grayed cards; consent gate scoped to "Other Doctors' Visits Hidden".
12. Open Variant 3 (empty state) → no visit list; "No previous records.\nStart the
    first visit." message centered; age absent from header.
13. Open Variant 1 with `offline={true}` → amber offline banner shown above scroll
    content; visit list still displays from static data.

Offline Scenarios:
1. Device has no connectivity from the moment D3 is opened → offline banner shows;
   visit data displays from SQLite cache (in live build); no error state triggered.
2. Device goes offline while browsing visit list → offline banner appears on next
   consent re-check cycle; existing visit data remains visible.
3. Tap "Request Access" while offline → live build: "Cannot send consent request —
   no internet connection" shown; "Send Request" option hidden. Mockup: Alert fires
   normally (acceptable for static mockup).
4. Consent was revoked while device was offline → on reconnect, consent re-fetch
   returns `false`; D3 downgrades to no-consent variant; visit history no longer
   visible. Live build test only.
5. Device offline for 72+ hours, patient has new visits from another doctor →
   SQLite cache does not have new visits; offline list is stale; offline banner
   communicates this. Live build test only.

Error Scenarios:
1. Server consent re-fetch returns 500 → live build must default to no-consent
   variant (fail secure); show retry banner. Mockup: no error state exists.
2. Server consent re-fetch returns 401 → live build must redirect to login screen
   matching D2 pattern.
3. Server consent re-fetch times out (> 5 seconds) → live build must fall back to
   SQLite cache with offline banner, even if device reports connectivity.
4. Navigation to D3 with missing `patientId` nav param → live build must validate
   params and navigate back with error rather than rendering a broken screen.
5. Visit list API returns empty array for a patient the SQLite cache shows having
   visits → treat as data inconsistency; show offline banner and display cached
   visits; do not show empty state.

Edge Cases:
1. Patient with 200+ visits → (H-4 above) FlatList + pagination required.
2. Visit card with `recordCount: 0` → "0 records" pill; live build must show
   "Draft" indicator instead.
3. Visit card where `chiefComplaint: null` → card renders cleanly with clinic name
   and record count only; verified in VISITS[2] in mockup.
4. Rapid double-tap on a visit card → functional state update handles idempotently;
   verify no flicker on low-end device.
5. Very long patient name (40+ chars) → wraps at 22pt font; live build must add
   `numberOfLines={1}` + ellipsis.
6. Expand last card in a long list → expanded content clipped below screen;
   (M-8 above) auto-scroll needed in live build.
7. Consent granted while D3 is showing no-consent variant → (H-3 above) in-screen
   state transition required without navigation round-trip.
8. Doctor backgrounds and foregrounds app while viewing visit history → live build
   must re-verify consent on foreground restore via `AppState` listener.
9. Expand one card, then scroll to a different card, then rotate device → expanded
   state preserved via `expandedId`; layout reflows correctly via ScrollView.
10. Open D3 with `consentGranted: undefined` (malformed nav params) → live build
    must treat as `false` (fail secure); ConsentBadge shows "Pending Consent".

---

VERDICT: Ready for live build — with tracked issues
The mockup correctly models all four consent states. The critical and high security
findings have been addressed. High-severity live-build concerns (H-1 loading state,
H-2 error state, H-3 dynamic consent transition, H-4 FlatList pagination) are
documented above and must be implemented before the live screen can ship.

ESTIMATED FIX EFFORT: 4–6 hours for the live build (loading/error states, dynamic
consent transition, FlatList replacement). No mockup changes required.
