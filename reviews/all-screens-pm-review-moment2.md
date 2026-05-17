# PM REVIEW — Post-Flow: Complete Product (All Screens)
_Generated: 2026-05-16 | Agent: PM Agent | Moment: 2 (Post-Flow Review)_
_Scope: All 14 screens — D1–D9 (Doctor App) + P1–P5 (Patient App)_

---

## OVERALL ASSESSMENT: Strong — clear to merge, three conditions before clinic pilot

All 14 screens are built, QA-reviewed, security-audited, and device-tested. The
core doctor flow (D1→D2→D3→D4→D5→D6→D7→D8→D9) and patient flow (P1→P2→P3→P4→P5)
both hold together and pass device testing. No open CRITICAL or HIGH findings.
MEDIUM debt is documented and tracked.

---

## ADOPTION RISKS

**1. Consent OTP friction in clinic reality**
D9 requires the patient to check their phone and type a 6-digit OTP while the
doctor waits during a 4–7 minute consultation. If the patient is elderly, has
their phone in a bag, or has a non-local SIM, the OTP doesn't arrive or can't
be typed in time. The doctor gets blocked, gives up, and the cross-doctor history
access — the core multi-doctor value — is never established.

This is not a code bug; it is a workflow constraint of consent-by-OTP.

Mitigation: for the first pilot, select a single-doctor clinic where the "other
doctor visit access" scenario does not apply. The core D1–D8 solo-doctor loop
(login, search, new patient, new visit, scan, view history) runs without D9. D9
should be piloted separately once a multi-doctor clinic is identified.

**2. No patient app discovery path**
After D9 consent completes, there is no mechanism for the patient to learn the
app exists or download it. A patient who walks out without the app cannot use
P1–P5. For the pilot, clinic staff must manually share the app link.

Fix: add a "Share app with patient via WhatsApp" button to D9's post-consent
confirmation screen. Defer to v1.1; do not block merge.

**3. D3 patient name visible to bystanders**
Full patient name at 22pt bold on D3 with no idle-timeout dimming. In a shared
waiting room or multi-desk clinic, a patient's medical history screen is readable
to anyone nearby.

Mitigation: first pilot in a private consultation room only. Address before
scaling to multi-desk or shared-space clinics.

---

## REGULATORY OR TRUST RISKS

**1. EAS build cert pinning not validated — pre-pilot blocker**
All device testing was done in Expo Go, which bypasses `pinnedFetch` (cert
pinning silently falls back to bare fetch in Expo Go). The app must NOT go to
a real clinic pilot using Expo Go or a non-EAS build. MITM protection is not
validated until an EAS build runs successfully on a physical device.

The EAS init is currently blocked by missing `ascAppId`/`appleTeamId` in eas.json
— a 2-line deletion unblocks it. This is the single highest-priority pre-pilot
action. No real patient data should touch the app before cert pinning is
confirmed active.

**2. syncLogger.ts active in production builds**
Console-logs UUIDs (no PII) from NewVisitScreen.tsx. Must be removed before
EAS build ships. Tracked as D6-M-new-1.

Fix: one Builder session — remove `src/sync/syncLogger.ts` and all call sites
in NewVisitScreen.tsx, syncWorker.ts, useSyncWorker.ts.

**3. Soft-deleted notes reappear after server refresh (D4-QA-M3)**
A doctor who deletes a draft note and then sees it reappear after re-opening
the visit will lose trust in data integrity. Deferred because `DELETE /records/:id`
backend endpoint is not implemented. Track as v1.1 mandatory fix.

---

## INFRASTRUCTURE READINESS

- **Backend:** Deployed at `https://medrecord-api.onrender.com/v1` — HTTP 200 ✅ (confirmed 2026-05-16). Patient-facing endpoints live (`GET /patient/profile → 401` confirmed). Cold-start ~20–30s on first request.
- **Device testing status:** COMPLETE — all 14 screens (D1–D9 + P1–P5). 54/54 PASS on patient app (2026-05-16). Zero open bugs on all doctor screens.
- **EAS build + cert pinning:** NOT validated. Pre-pilot blocker (not merge blocker). eas.json fix: delete empty `ascAppId` and `appleTeamId` lines, then `eas init && eas build --profile preview --platform ios`.
- **Test credentials:** ✅ — doctor `9999999999`, patient `8888888888`, OTP bypass `000000`.

---

## ONE THING MOST LIKELY TO CAUSE LOW ADOPTION

The consent OTP step (D9) will fail in field conditions more often than estimated.
When it fails, the doctor sees only their own past visits — not history from other
doctors. In a solo-doctor clinic this is fine; the app has full value. In a
multi-doctor clinic or referral scenario, the app's value collapses to a visit
recorder.

**First pilot must be scoped to a solo-doctor clinic.** Pilot in a multi-doctor
clinic only after D9 OTP failure handling is improved (timeout messaging, re-send,
staff-assisted flow).

---

## MERGE RECOMMENDATION: PROCEED — merge dev to main

**Pre-pilot conditions** (must complete before real patient data, not before merge):

| Priority | Item | Action |
|---|---|---|
| 1 | EAS build + cert pinning validation | Delete empty `ascAppId`/`appleTeamId` from eas.json, run `eas init`, build, validate pinnedFetch active |
| 2 | syncLogger.ts removal | One Builder session — remove `src/sync/syncLogger.ts` + call sites |
| 3 | Pilot clinic selection | Solo-doctor clinic only for first pilot |
| v1.1 | "Share app with patient" on D9 post-consent screen | Low effort, high patient acquisition impact |
| v1.1 | DELETE /records/:id backend + D4-QA-M3 fix | Prevent soft-deleted notes from reappearing |
| v1.1 | D3 name dimming on idle timeout | Before multi-desk clinic deployment |
