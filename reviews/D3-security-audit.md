SECURITY AUDIT — Patient Detail / History (D3)
Generated: 2026-02-23
Auditor: agent-security.md
Source: mockups/D3PatientDetailScreen.tsx
Spec references: consent-layer-spec.md, docs/project-state.md

Note: This is a static mockup — no live API calls, no SQLite queries, no auth tokens.
Findings are classified by the risk they introduce into the live build if the current
design is carried forward unchanged. "File: mockup line N" means the design decision
expressed at that line creates the risk.

---

CRITICAL (must fix before live build begins):

- Chief complaint text is rendered in the no-consent grayed variant without consent.
  File: mockups/D3PatientDetailScreen.tsx, line 364 (grayed VisitCard render in
  D3PatientDetailHasDataNoConsent); line 202–209 (visitComplaint field in VisitCard).
  Risk: In the live build, if the no-consent variant is fed real visit data from
  SQLite or the API — as it will be — the chief complaint field will display clinical
  content ("Knee pain, difficulty walking"; "Persistent cough and mild fever") to a
  doctor who has not received patient consent. This is a direct violation of
  consent-layer-spec.md: "Never return patient records in API responses without first
  checking consent." Chief complaint is clinical record content, not metadata. The
  grayed opacity-0.4 styling does not constitute access control — the data is rendered
  in the component tree and readable in memory. The DPDP Act 2023 classifies health
  data as sensitive personal data requiring explicit consent before processing.
  Fix: The no-consent variant must receive visit rows with chiefComplaint stripped to
  null. In the live build, the API query for the no-consent path must not return
  chiefComplaint. The VisitCard component is already safe (it handles null cleanly
  at line 201), but the data feeding it must be consent-scoped at the query layer,
  not the display layer. Update the mockup to pass chiefComplaint: null on all VISITS
  in the D3PatientDetailHasDataNoConsent render to correctly model the live data shape.

---

HIGH (fix before live build):

- No auth guard on screen mount — all three variants render patient name and masked
  mobile from nav params with no token check.
  File: mockups/D3PatientDetailScreen.tsx — all three exported functions (lines 242,
  320, 376). No equivalent of D2's synchronous `if (!token || !user) return null` guard.
  Risk: If the auth token has expired or the user is logged out mid-session, D3 renders
  patient PII on the first frame before any navigation redirect fires. On a shared clinic
  device, a second doctor could pick up the phone and see the previous doctor's patient.
  Fix: In the live build, add the same synchronous null-render guard used in D2's live
  screen (PatientSearchScreen.tsx line 244). All three D3 variants must check token and
  user before returning any JSX.

- No distinction between own-doctor visits and other-doctor visits in the no-consent
  variant — all visits are grayed indiscriminately.
  File: mockups/D3PatientDetailScreen.tsx, lines 362–365
  (D3PatientDetailHasDataNoConsent renders all VISITS with grayed={true}).
  Risk: consent-layer-spec.md is explicit: "View records they created — Without
  Consent: ✅." A doctor who treated this patient previously can see their own visit
  records without consent. The current design grays everything, which is both a UX
  error (blocking a doctor from their own clinical notes) and a design flaw that will
  produce an incorrect API query in the live build — the query will either over-restrict
  (hiding the doctor's own records) or under-restrict (fetching all records and relying
  on the UI to hide them).
  Fix: The no-consent variant needs a fourth display state: own-doctor visits rendered
  normally (not grayed), other-doctor visits grayed. In the live build, the API must
  return two separate lists: `myVisits` (always returned) and `otherDoctorVisits`
  (consent-gated, returned without chiefComplaint). The mockup should model this
  distinction before the live build begins.

- Consent signal relies on client-side nav param for initial render — the window
  between mount and server re-verification exposes visit history.
  File: docs/project-state.md (Open Questions resolved 2026-02-20) — "D3 re-fetches
  fresh on open but uses [consentGranted nav param] as the initial gate signal."
  Risk: If consent was revoked between D2 loading its SQLite cache and D3 opening,
  the nav param is stale-granted. Variant 1 (HasDataConsentGranted) renders the full
  visit list on the first frame, before the server re-fetch completes and corrects the
  state. This is a narrow window but a real one on slow connections.
  Fix: In the live build, D3 must render a loading skeleton on mount — do not display
  visit history until the server-side consent re-fetch returns. Fall back to the SQLite
  cache only when the device is confirmed offline (isConnected === false), and display
  the offline banner clearly in that case. consent-layer-spec.md is unambiguous: "All
  consent checks must be server-side (never trust client-side consent cache alone for
  access control)."

---

MEDIUM (fix before production):

- handleRequestAccess has no offline guard — tapping "Send Request" while offline
  will silently do nothing (stub onPress: () => {}).
  File: mockups/D3PatientDetailScreen.tsx, lines 299–313.
  Risk: In the live build, if the doctor taps "Send Request" while offline, the consent
  SMS is never dispatched and neither the doctor nor the patient receives any feedback.
  The doctor assumes the request was sent; the patient receives nothing; the clinical
  encounter proceeds on a false assumption. This is a patient safety concern in time-
  sensitive consultations, not just a UX issue.
  Fix: In the live build, check network status before the Alert is shown. If offline,
  replace the Alert with: "Cannot send consent request — no internet connection. The
  patient can still enter a consent OTP if they received one previously, or you can
  start a new visit without accessing their history." Do not show the "Send Request"
  option at all when offline.

- No consent accessed audit event emitted when D3 opens with consent granted.
  File: Live build concern — no comment or flag in the mockup.
  Risk: consent-layer-spec.md defines an 'accessed' event in the consent_audit_log
  schema. DPDP Act 2023 requires patients to be able to request a log of who accessed
  their data. If D3 does not emit an accessed event on mount, doctors' viewing of
  patient history will leave no audit trail. A patient requesting their data access log
  will receive an incomplete record.
  Fix: In the live build, emit a consent_accessed event to the SQLite audit_events
  table when D3 mounts with consent granted and visit history is displayed. Sync to
  the server audit log on reconnect via POST /sync. This is the same audit pattern
  required for D2 (tracked as H-3 pre-merge blocker).

- Full placeholder phone number written in a code comment.
  File: mockups/D3PatientDetailScreen.tsx, line 49:
  `// full: +91 98765 84627 — masked to last 5 per PII rule`
  Risk: This specific instance uses fictional data and poses no direct risk. However,
  it establishes a pattern of documenting full numbers in comments. In the live build,
  a developer following this pattern with a real test or production number would write
  PII into the source code and git history permanently. consent-layer-spec.md and
  security-spec Privacy Rule 1 state: "Never log patient mobile numbers or names in
  application logs." Source code comments are not logs, but git history is permanent
  and searchable.
  Fix: Remove the full number from the comment. Replace with:
  `// full number stored in SQLite patients table — only last 5 digits displayed per PII rule`

---

LOW (track in backlog):

- No app-lock (biometric/PIN) on foreground restore.
  File: Live build concern across all screens.
  Risk: A doctor who sets down an unlocked phone in a clinic waiting room leaves
  all on-screen patient data visible. AppState transitions from 'background' to
  'active' must trigger a lock screen requiring biometric or PIN re-auth before
  any patient data is re-rendered.
  Fix: Implement an AppState listener in the root navigator. On 'active' from
  'background', show a lock overlay and require biometric/PIN before restoring
  the screen. expo-local-authentication is the appropriate package.

- Certificate pinning absent from API client (already tracked as H-2 pre-merge
  blocker in project-state.md). Confirming it remains unresolved and applies to
  all live screens including D3.

- First-record preview data should be lazy-fetched in the live build.
  File: mockups/D3PatientDetailScreen.tsx, line 93–97 (FIRST_RECORD_PREVIEW).
  Risk: If the live build pre-fetches the first record for every visit card on screen
  load, it pulls more PHI into memory than necessary. A screen with 20 visits would
  fetch 20 record previews regardless of whether the doctor expands any of them.
  Fix: In the live build, fetch the first record preview lazily on first card expansion.
  Cache the result in component state after the first fetch within the session so
  subsequent expand/collapse cycles do not re-fetch.

---

CHECKLIST STATUS:

⚪ Authentication & Sessions — 0/6 checks applicable (static mockup; all deferred to live build)
   → JWT expiry, OTP handling, rate limiting: live build concerns, not present in mockup.
   → Flag: auth guard on mount must be implemented in live build (HIGH finding above).

⚠️  Authorisation — 2/5 checks passed
   ✅ Consent check present in design (three screen variants model the three consent states)
   ✅ Soft-deleted records: no delete path exists in mockup (append-only model respected)
   ❌ Consent check bypassed by clinical data rendered in grayed no-consent variant (CRITICAL)
   ❌ Own-doctor vs other-doctor visits not distinguished in no-consent path (HIGH)
   ❌ No role check on mount (live build must add; same pattern as D2)

⚠️  Data Handling — 3/4 checks applicable and passed; 1 flag
   ✅ No Aadhaar data anywhere in mockup
   ✅ Mobile number correctly masked to last 5 digits in PatientHeader (line 122)
   ✅ No console.log statements anywhere in the file
   ⚠️  Full placeholder mobile number written in a code comment (line 49) — MEDIUM

⚪ Mobile Security — 0/5 checks applicable (static mockup)
   → Auth guard, certificate pinning, app lock: live build concerns.
   → All flagged in HIGH and LOW findings above.

⚪ Input Validation — N/A (D3 is a read-only display screen; no user input fields)

⚪ Database — N/A (static mockup; no SQLite queries present)

⚠️  DPDP Compliance — 2/4 checks partially addressed
   ✅ Consent recorded before accessing cross-doctor records: modelled in screen design
   ✅ Data localisation: not a mockup concern; AWS ap-south-1 decision is locked
   ⚠️  Consent revocation: offline banner present, but no stale-consent handling designed
      for the live build (if consent was revoked while device was offline, the cached
      "granted" state will show history until next sync — acceptable per spec "within one
      sync cycle" but must be documented in the live build implementation)
   ❌ Audit trail for consent 'accessed' events: not yet designed (MEDIUM finding above)

---

OVERALL VERDICT: Blocked — 1 critical finding

The no-consent variant's grayed visit cards render chief complaint text (clinical
content) without consent. This design decision, if carried unchanged into the live
build, would constitute a consent violation under both consent-layer-spec.md and the
DPDP Act 2023. The fix is surgical: pass chiefComplaint: null in the no-consent data
path. The mockup should be corrected to model the correct live data shape before the
live build session begins.

The own-doctor vs other-doctor visit distinction (HIGH) also requires a design
decision before the live build — the API query design and the screen layout both
depend on it.

All remaining findings (HIGH auth guard, MEDIUM offline/audit items, LOW backlog
items) are standard live-build implementation requirements with clear fixes documented
above.
