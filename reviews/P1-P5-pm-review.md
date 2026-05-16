# PM Review — Pre-Flight: P1–P5 Patient App
_Generated: 2026-05-16 | Agent: PM Agent | Moment: 1 (Pre-Flow Gate)_

---

## PM REVIEW — Pre-Flight: P1–P5 Patient App

**PROCEED: Yes with changes**

---

## CONCERNS

**1. No patient-facing API endpoints exist for P2, P3, or P4.**
The backend accepts `role: "patient"` in `POST /auth/send-otp` but `POST /auth/verify-otp` only creates doctor JWTs (`role: 'doctor'` hardcoded at lines 163, 181, 235 in `backend/src/routes/auth.ts`). P2 (patient timeline), P3 (visit record detail), and P4 (consent list + revocation) require patient-specific backend routes that do not yet exist.

Fix: plan a Backend Agent session after all P-screen mockups are approved — same pattern as the Doctor flow. Builder can build P1–P5 as mockups and static wire-ups, but device testing for P2–P4 is blocked until the backend is extended.

**2. Patient JWT response shape is undocumented.**
`api-contracts.md` shows only the doctor response for `POST /auth/verify-otp`. The patient `user` object (field set, role value, whether `clinic_id` is absent) is undefined. Builder needs this before wiring P1.

Fix: document the patient auth response in `api-contracts.md` during the Builder mockup session (can be done as part of Step 5b contract sync check).

**3. `DELETE /consent/:id` requires a patient JWT that cannot yet be obtained.**
The contract marks this endpoint as "patient-initiated only" but there is no working patient auth path yet. Not a blocker for mockup, but must be closed in the Backend Agent session before P4 can be device-tested.

---

## REGULATORY FLAGS

**DPDP Act 2023 — consent revocability is non-negotiable.**
P4 (Doctors Who Have Access) is the sole patient-side revocation mechanism. P4 cannot be deferred to v1.1. Shipping v1 with a consent-grant flow (D9) but no patient-side revocation path violates the spirit of DPDP for a health data product. P4 is mandatory for v1.

---

## MARKET REALITY NOTES

**Elderly patients do not self-install apps.**
The realistic P1–P5 user is an adult family member downloading and managing the app on behalf of the patient. Builder should design for a literate 25–40 year old acting as proxy — not assume the elderly patient navigates the device directly. "Large text mode" in P5 still matters for readability, but primary UX should assume moderate tech literacy.

**P5 "large text mode" — do not build a custom toggle.**
Use React Native's built-in accessibility scaling: respect the system font size via `allowFontScaling` and Dynamic Type. A custom font-size toggle adds scope and breaks unpredictably on low-end Android. Builder must use the platform mechanism, not a custom solution.

**P2 image loading — text must render before thumbnails.**
Patients on 2G/3G in semi-urban areas will see a broken timeline if scan thumbnails load eagerly. Text metadata (date, doctor name, clinic) must be visible immediately; images load lazily behind. Builder must not block list render on image fetch.

**App discovery gap — flag for future session.**
There is no mechanism for patients to discover or download this app. The natural moment is post-consent in D9. A future Builder session should add a "share app link via WhatsApp" to D9's post-consent confirmation screen. This is outside P1–P5 scope but must not be forgotten — it directly affects patient adoption rate.

---

## Screen Scope Confirmed

| Screen | Name | Tier | Status |
|---|---|---|---|
| P1 | Login / OTP (Patient) | Tier 4 | Ready for mockup |
| P2 | My Records Timeline | Tier 2 | Ready for mockup; device test blocked pending backend |
| P3 | Visit Record Detail | Tier 2 | Ready for mockup; device test blocked pending backend |
| P4 | Doctors Who Have Access | Tier 2 | Ready for mockup; **mandatory for v1 (DPDP)**; device test blocked pending backend |
| P5 | Patient Profile | Tier 4 | Ready for mockup; use system font scaling only |
