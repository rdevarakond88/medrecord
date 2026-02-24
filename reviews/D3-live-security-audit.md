SECURITY AUDIT — Patient Detail / History (D3 Live Screen)
Generated: 2026-02-24
Auditor: agent-security.md
Sources reviewed:
  - src/screens/doctor/PatientDetailScreen.tsx
  - src/api/visits.ts
  - src/db/visits.ts
  - src/db/schema.ts (visits + audit_events tables)
  - src/db/patients.ts (getPatientByLocalId addition)
  - docs/consent-layer-spec.md
  - docs/project-state.md

Scope: This is an audit of the live (production-wired) D3 screen. Unlike the mockup
audit, all issues in this report represent real runtime vulnerabilities — not design
gaps to be addressed later. CRITICAL and HIGH findings must be resolved before D3
can be considered safe to use with real patient data.

---

CRITICAL (must fix before any production use):

- C-1: chief_complaint rendered in grayed visit cards when SQLite cache contains
  stale consented data — consent-layer-spec Rule 2 violation.

  File: src/screens/doctor/PatientDetailScreen.tsx, line 702–710 (VisitCard);
        src/screens/doctor/PatientDetailScreen.tsx, lines 164–176 (fetchData offline path)

  Root cause: In the ONLINE path the server correctly strips chief_complaint from
  other_doctor_visits when consent_granted=false. SQLite stores null. Safe.
  In the OFFLINE path, fetchData calls getCachedVisits() which returns whatever
  chief_complaint value was last written — including non-null values cached during
  a prior consent-GRANTED session. The offline path (line 164–176) passes
  cached.otherVisits directly to setOtherVisits() without stripping chief_complaint:

    const offlineConsent = navConsentGranted ?? false;
    ...
    setOtherVisits(cached.otherVisits);   // ← no strip when offlineConsent=false

  VisitCard then renders (line 702–710):
    {visit.chief_complaint ? (
      <Text style={[styles.visitComplaint, grayed && styles.textGrayed]}>
        {visit.chief_complaint}
      </Text>
    ) : null}

  When grayed=true, textGrayed applies color:Colors.textDisabled (the
  visitCardGrayed style applies opacity:0.4 to the entire card). The clinical
  text is in the React component tree at 40% opacity — readable, selectable,
  and accessible to screen readers. Opacity is NOT access control.

  The mockup audit flagged this as D3-C-1 (CRITICAL). The fix applied to the mockup
  was to pass chiefComplaint:null to grayed VisitCard instances. The live build
  relies on the server enforcing this at the query layer — which is correct for the
  online path — but does not enforce it in the offline fallback path.

  Scenario to reproduce:
    1. Doctor opens D3 for Patient X online; consent_granted=true.
    2. Server returns other_doctor_visits with non-null chief_complaint.
    3. SQLite cache: other_doctor_visits stored with non-null chief_complaint.
    4. Patient revokes consent.
    5. Device goes offline before next sync.
    6. Doctor opens D3 again (offline). fetchData() offline path runs.
       offlineConsent = navConsentGranted (still true from nav param).
    7. Even with offlineConsent=false, cached.otherVisits has non-null
       chief_complaint. The no-consent variant renders grayed cards with
       clinical text visible at 40% opacity.

  Consent-layer-spec Rule 2: "Never return patient records in API responses
  without first checking consent." Rendering clinical data in the component
  tree without consent is equivalent to returning it.

  Fix: In fetchData offline path, strip chief_complaint from otherVisits
  when offlineConsent=false. Enforce at the point of data assignment, not
  in VisitCard (which cannot know whether the source was server or cache):

    setOtherVisits(
      offlineConsent
        ? cached.otherVisits
        : cached.otherVisits.map(v => ({ ...v, chief_complaint: null }))
    );

  This ensures that regardless of what the cache contains, grayed visit cards
  never receive non-null chief_complaint — matching the invariant that the
  server enforces on the online path.

---

HIGH (fix before D3 is used with real patient data):

- H-1: Offline consent gate uses stale nav param instead of SQLite — can show
  wrong consent variant after the device has up-to-date revocation information.

  File: src/screens/doctor/PatientDetailScreen.tsx, line 104, line 164

  navConsentGranted is read from route.params at component creation:
    const { ..., consentGranted: navConsentGranted } = route.params;

  route.params is fixed at navigation time (when D2 called navigation.navigate).
  It does not update when fetchData() runs and updates SQLite.

  Scenario to reproduce:
    1. D2 navigates to D3 with consentGranted=true.
    2. D3 online fetch returns consent_granted=false (consent was revoked).
    3. fetchData() updates SQLite: UPDATE patients SET consent_granted=0.
    4. D3 correctly shows no-consent variant.
    5. Doctor navigates to D4 (once built).
    6. Device goes offline.
    7. Doctor returns to D3. useFocusEffect fires fetchData().
    8. Offline path: offlineConsent = navConsentGranted = true (original nav param).
    9. D3 shows consent_granted variant — WRONG. The device knows consent was
       revoked (step 3 updated SQLite) but the offline path ignores this.

  Combined with C-1: if the SQLite cache still has non-null chief_complaint
  from before the revocation, step 9 would show full visit history with
  clinical content.

  Fix: In the offline path, read consent_granted from the patient state
  (loaded from SQLite via getPatientByLocalId) rather than navConsentGranted:

    const offlineConsent = patient?.consent_granted ?? false;

  The patient state is loaded from SQLite on mount (line 121–124). This
  reflects the most recent value written by any prior online D3 fetch.
  If patient state hasn't loaded yet (null on first render), default to false
  (fail secure).

  Note: The patient state is loaded once on mount and not refreshed on every
  focus. The fetchData() function should also update patient state after updating
  SQLite in the online path, or getPatientByLocalId should be called within
  fetchData to get the freshest value.

---

- H-2: visits table is not doctor-scoped — cross-doctor data leakage on shared
  clinic devices in the offline path.

  File: src/db/visits.ts, lines 42–76 (getCachedVisits);
        src/db/schema.ts (visits table definition)

  The visits table has no doctor_id (viewing doctor) column. getCachedVisits
  queries only by patient_server_id:

    SELECT * FROM visits WHERE patient_server_id = ? ORDER BY visit_date DESC

  The is_own_visit flag is set by whoever last called upsertVisitsFromServer.
  On a shared device:
    1. Doctor A opens Patient X online → upsertVisitsFromServer marks Doctor A's
       visits as is_own_visit=1, others as is_own_visit=0.
    2. Doctor A logs out. clearDoctorPatients() removes patients but NOT visits.
    3. Doctor B logs in, opens Patient X offline (before any online fetch).
    4. getCachedVisits returns Doctor A's cache. Doctor A's visits are marked
       is_own_visit=1 — appearing to Doctor B as "My Visits."
    5. Doctor B sees Doctor A's own clinical visits (chief_complaint, clinic_name)
       in the "My Visits" section without any consent verification.

  This violates consent-layer-spec Rule 2. Doctor B is seeing records created by
  Doctor A without any consent check from Patient X for Doctor B.

  (In the online path, Doctor B's fetch overwrites the cache correctly. This is
  a purely offline vulnerability — but offline is a first-class use case in this
  app's target environment.)

  Fix: Add cached_by_doctor_id column to the visits table:

    ALTER TABLE visits ADD COLUMN cached_by_doctor_id TEXT NOT NULL DEFAULT '';

  Filter by this column in getCachedVisits:

    SELECT * FROM visits
    WHERE patient_server_id = ? AND cached_by_doctor_id = ?
    ORDER BY visit_date DESC

  Pass the current user.id when calling getCachedVisits.
  Add clearDoctorVisits(db, doctorId) and call it in the logout sequence.

---

- H-3: useLogout hook does not clear the visits table — clinical data
  persists across logout/login on shared devices.

  File: src/hooks/useLogout.ts (existing file, D2 era);
        src/db/schema.ts (visits table, new in D3)

  The existing logout sequence calls clearDoctorPatients() to wipe the patients
  table for the logged-out doctor. The new visits table is NOT cleared.

  After logout, all cached visit data (visit dates, clinic names, record counts,
  and potentially chief_complaint values for visits where consent was previously
  granted) remains in SQLite. A second doctor on the same device can access this
  data in the offline path (as described in H-2).

  Even without H-2, leaving clinical data in SQLite after logout violates the
  principle of data minimisation and the project decision that "patients table
  cleared on logout" (security checklist: "Patient records cache cleared on
  logout"). The visits cache is an extension of the patient record cache.

  Fix: Add clearDoctorVisits(db, doctorId) to src/db/visits.ts:

    export async function clearDoctorVisits(
      db: SQLite.SQLiteDatabase,
      doctorId: string,
    ): Promise<void> {
      await db.runAsync(
        `DELETE FROM visits WHERE cached_by_doctor_id = ?`,
        [doctorId],
      );
    }

  Call it in the useLogout hook as step 4, after clearDoctorPatients().
  This requires the cached_by_doctor_id column from H-2's fix.

  Note: If H-2 is not fixed (no cached_by_doctor_id column), clearDoctorVisits
  cannot be doctor-scoped. A blunt DELETE FROM visits would clear ALL doctors'
  visit caches — acceptable as a stopgap since the visits cache is ephemeral
  (rebuilt on next online D3 open).

---

MEDIUM (fix before production):

- M-1: ErrorBanner displays raw server error message — potential patient data
  in server error responses exposed in UI.

  File: src/screens/doctor/PatientDetailScreen.tsx, lines 193–198

    setFetchError(
      err instanceof ApiError
        ? err.message
        : 'Could not verify consent — showing limited view.',
    );

  ErrorBanner renders this message directly (line 831–833):
    <Text style={styles.errorBannerText} numberOfLines={2}>
      {message}
    </Text>

  ApiError.message comes from body.error.message in the server's JSON response.
  If the server includes patient identifiers (patient ID, mobile number, name)
  in its error messages — a common pattern in debugging-friendly APIs — these
  would be displayed visibly on screen, violating consent-layer-spec Rule 1:
  "Never log patient mobile numbers or names in application logs."
  A UI display to a bystander is worse than a log.

  Fix: Either sanitize err.message before display (strip UUIDs and phone-
  number-shaped strings with a regex), or replace the raw message entirely
  with a fixed safe string: "Could not verify consent — showing limited view."
  The ApiError.code can be used for developer diagnostics without exposing
  the full message to the UI.

---

- M-2: consent_accessed audit event fires on every useFocusEffect transition,
  inflating the DPDP audit trail.

  File: src/screens/doctor/PatientDetailScreen.tsx, lines 233–238

    useEffect(() => {
      if (loadState === 'loaded' && consentGranted && user && patientServerId) {
        void logConsentAccess(db, user.id, patientServerId);
      }
    }, [loadState, consentGranted]);

  useFocusEffect fires fetchData() on every screen focus. Each call transitions
  loadState to 'loading' → 'loaded'. Every 'loading'→'loaded' transition while
  consentGranted=true triggers a new audit event write.

  A doctor who navigates D3 → D4 → D3 → D4 → D3 five times in a consultation
  would generate five consent_accessed events for the same viewing session.
  When the patient requests their DPDP data access log, they see five identical
  events for a single consultation, which inflates the record and could create
  confusion or compliance questions.

  Fix: Use a ref to track whether the audit event has been written for this
  screen session. Reset on consent state change (from denied to granted):

    const auditWrittenRef = useRef(false);
    // Reset when consent transitions from denied to granted:
    useEffect(() => {
      if (!consentGranted) auditWrittenRef.current = false;
    }, [consentGranted]);
    // Write at most once per consent grant:
    useEffect(() => {
      if (loadState === 'loaded' && consentGranted && !auditWrittenRef.current) {
        auditWrittenRef.current = true;
        void logConsentAccess(db, user!.id, patientServerId!);
      }
    }, [loadState, consentGranted]);

---

- M-3: logConsentAccess() failure silently swallowed — DPDP audit trail
  write failures are undetectable.

  File: src/screens/doctor/PatientDetailScreen.tsx, line 235

    void logConsentAccess(db, user.id, patientServerId);

  `void` discards the Promise. If the SQLite write throws (disk full, database
  locked, schema migration not yet run), the failure is silently dropped. The
  DPDP audit trail has a gap with no indication that a gap exists.

  Healthcare regulations require complete audit trails. A silent write failure
  means a doctor accessed a patient's records with no audit evidence — which
  creates compliance exposure if a patient later requests their data access log.

  Fix: Add a catch that logs to a non-PII error reporter (not console.log in
  production) without crashing the UI:

    logConsentAccess(db, user.id, patientServerId).catch((err) => {
      // TODO: report to non-PII error monitoring (e.g., Sentry with PII scrubbing)
      // Do not log patient identifiers here
    });

---

- M-4: visitCardGrayed uses opacity as the only rendering defence — clinical
  data remains accessible in the component tree at 40% opacity.

  File: src/screens/doctor/PatientDetailScreen.tsx, styles line 1076–1078

    visitCardGrayed: { opacity: 0.4 }

  This is a design-level vulnerability inherent to the opacity approach. The
  text in grayed visit cards (clinic_name, visit_date, and potentially
  chief_complaint if C-1 is not fixed) is in the React component tree and is:
  - Selectable by screen readers (accessibility APIs expose all rendered text
    regardless of opacity)
  - Visible to bystanders at an angle under clinic lighting conditions
  - Accessible via React DevTools in debug builds

  The C-1 fix (stripping chief_complaint from grayed cards) is the primary
  defence. This finding documents the residual risk from clinic_name and
  visit_date being visible at 40% opacity for grayed cards.

  clinic_name and visit_date on grayed cards are intentional — the spec shows
  these to motivate the doctor to request consent (they can see visits exist
  without seeing clinical content). This is by design. Document explicitly that
  clinic_name and visit_date are intentionally surfaced on consent-absent cards,
  and that chief_complaint is the only field that must be null.

---

LOW (track in backlog):

- L-1: No timeout on getPatientVisits() API call — loading skeleton can hang
  indefinitely on poor connections.

  File: src/api/apiClient.ts (apiFetch function); src/api/visits.ts

  apiFetch uses bare fetch() with no AbortController or timeout. On very slow
  connections (common in rural clinic settings), the consent re-fetch can hang
  for minutes, leaving the loading skeleton visible with no fallback. The doctor
  has no way to cancel and proceed with cached data.

  Fix: Add an AbortController with a 10-second timeout to apiFetch. On timeout,
  throw an error that fetchData's catch block handles — falling back to SQLite
  cache with an offline banner. This matches the spirit of D3-H-2: "fall back
  to SQLite cache only when isConnected === false" should also apply when the
  server is reachable but unresponsive.

---

- L-2: consentRequestSent state resets on component re-mount — potential
  duplicate consent SMS on navigation stack reset.

  File: src/screens/doctor/PatientDetailScreen.tsx, line 115

    const [consentRequestSent, setConsentRequestSent] = useState(false);

  If D3 is removed from the navigation stack and re-opened (e.g., deep link,
  session restore, or explicit stack reset), consentRequestSent resets to false.
  The "Waiting for patient to approve" state is gone. If the doctor opens D3
  again and taps "Request Access," a second SMS is sent to the patient.

  For patients in rural areas with limited SMS plans, duplicate SMS is a direct
  cost. It also creates confusing OTPs (the patient would have two valid OTPs
  simultaneously if the server doesn't invalidate the first on re-request).

  Fix: Persist consentRequestSent in the Zustand patient store, keyed by
  patient_server_id. Read on mount. Clear when consent is granted or when
  the OTP window expires.

---

- L-3: Certificate pinning absent from API client — MITM possible on shared
  clinic WiFi (pre-existing H-2 debt).

  File: src/api/apiClient.ts
  Status: Pre-existing pre-merge blocker tracked in project-state.md. Not
  introduced by D3. Confirmed applicable to getPatientVisits() call.

---

- L-4: App-lock biometric not implemented on foreground restore (pre-existing
  LOW debt).

  File: src/screens/doctor/PatientDetailScreen.tsx, lines 219–228 (AppState
  listener)

  The AppState listener re-validates consent on foreground restore (which is
  correct). However, there is no lock screen between 'background' and 'active'.
  If a doctor sets down an unlocked phone showing a patient's visit history,
  any bystander who picks it up can see the data — and the AppState listener
  only fires once the screen transitions back to active (which requires
  interaction). A passive bystander sees the data without triggering any
  re-auth.

  expo-local-authentication is the appropriate package. Tracked as LOW debt
  at project level.

---

CHECKLIST STATUS:

⚠️  Authentication & Sessions — 3/5 applicable checks passed
   ✅ JWT expiry handled via 401 redirect to Login (lines 181–185)
   ✅ Auth guard synchronous null-render (D3-H-3, line 244)
   ✅ 401 shows session expired banner + redirects in 2s
   ⚪ JWT refresh rotation, OTP, rate limiting: server-side; not applicable to D3 screen
   ❌ No request timeout — consent re-fetch can hang indefinitely (L-1)

❌  Authorisation — 3/7 checks passed
   ✅ Consent check performed before visit history renders (D3-H-1, D3-H-2)
   ✅ Consent signal verified server-side (online path — server response is gate)
   ✅ Fail-secure: consentGranted initialised to false; error path sets to false (line 199)
   ❌ CRITICAL: chief_complaint rendered in component tree for grayed cards in offline
      path when stale cache has consented data (C-1)
   ❌ HIGH: Offline consent gate uses stale nav param, not SQLite (H-1)
   ❌ HIGH: visits table not doctor-scoped — cross-doctor leakage in offline path (H-2)
   ⚪ Soft-deleted records: server-side concern; visits cache is server-populated

⚠️  Data Handling — 3/4 applicable checks passed
   ✅ No Aadhaar anywhere in D3 or supporting modules
   ✅ Mobile masked to last 5 digits in patient header (line 402)
   ✅ No console.log statements in any of the reviewed files
   ❌ MEDIUM: ErrorBanner displays raw server error message — potential PII exposure (M-1)

❌  Mobile Security — 1/4 checks applicable to D3
   ✅ No sensitive data in logs (no console.log)
   ❌ Certificate pinning absent (pre-existing H-2 / L-3 here)
   ❌ App-lock biometric absent (pre-existing LOW / L-4 here)
   ❌ visits table not cleared on logout (H-3)

⚪  Input Validation — N/A (D3 is a read-only display screen; no user-entered data)

⚠️  Database — 4/5 checks passed
   ✅ All SQLite queries use parameterised statements (? placeholders throughout)
   ✅ getPatientByLocalId, getCachedVisits, upsertVisitsFromServer — no concatenation
   ✅ logConsentAccess uses INSERT OR IGNORE (correct for idempotent audit writes)
   ❌ HIGH: visits table has no doctor_id scoping — getCachedVisits returns
      any doctor's cached data for the same patient_server_id (H-2)
   ⚠️  MEDIUM: audit_events table exists but consent_accessed event fires on every
      focus transition (M-2)

⚠️  DPDP Compliance — 3/5 checks addressed
   ✅ Consent verified server-side before cross-doctor records displayed
   ✅ AppState listener re-validates on foreground restore
   ✅ audit_events table created; logConsentAccess writes on consent access
   ⚠️  PARTIAL: audit trail writes to SQLite; POST /sync flush deferred (pre-existing H-3 debt)
   ❌ MEDIUM: audit event fires multiple times per session (M-2)

---

OVERALL VERDICT: Blocked — 1 critical finding

C-1 (chief_complaint exposed in grayed cards via stale offline cache) is a direct
consent-layer-spec Rule 2 violation. The D3 live screen claims to enforce that
"chiefComplaint is excluded at the query layer, not the display layer" — but this
is only true for the online path. The offline path passes cached data with
non-null chief_complaint to grayed VisitCard components, rendering clinical content
at 40% opacity without consent.

H-2 and H-3 (visits table not doctor-scoped, not cleared on logout) together
create a cross-doctor data leakage path on shared clinic devices — the same class
of vulnerability that C-1 (patients table scoping) and C-2 (QueryClient clear on
logout) addressed for D2. The same fix pattern applies here.

H-1 (stale nav param for offline consent) compounds C-1: even when the device has
up-to-date revocation information in SQLite, the offline path ignores it.

C-1 fix is two lines. H-1 fix is one line. H-2 and H-3 require a schema migration
and a logout hook update — the same shape as the D2 CRITICAL fixes from session
2026-02-20.

None of the HIGH findings require architectural changes. All have clear, bounded
fixes documented above.
