# PM REVIEW — Post-Flow: Doctor Visit Flow (D2, D3, D6, D7)

**Date:** 2026-03-13
**Agent:** PM Agent — Moment 2 (post-flow review)
**Scope:** All four screens of the Doctor Visit Flow are now built and device-tested.

---

## OVERALL ASSESSMENT: Needs work — before pilot, not before merge

The four screens hold together as a coherent consultation workflow.
The core loop (search → history → new visit → scan) works on device,
is genuinely offline-first, and meets the 60-second visit target for
established patients. That is real progress. But three gaps make the
flow incomplete for any real clinic, even a limited pilot.

---

## ADOPTION RISKS

**1. New patient flow is completely broken.**
In a real clinic, a meaningful fraction of consultations are first-time
patients. From D2, the doctor searches, finds nothing, taps "Add New
Patient" — and hits a stub. The workflow stops cold. D5 is not optional
for pilot readiness. Fix: build D5 before any pilot, even as a minimum
viable form (mobile + name only).

**2. Sync worker does not exist.**
D6 and D7 write to `visits_draft` and `sync_queue`, but nothing processes
that queue. Data lives only on the device. If the device is lost, wiped,
or the doctor switches phones, every unsynced visit is gone. In a clinic
that sees 40–80 patients a day, this is a trust-destroying loss. A doctor
who loses a week of records does not give second chances. Fix: sync worker
must ship before pilot. It does not need to be perfect — a basic background
flush on WiFi reconnect is sufficient for v1.

**3. Doctors cannot view a visit's content from D3.**
"View Full Visit" is a disabled stub. The doctor can see a list of past
visits but cannot open any of them. This undermines the core value
proposition: a patient's history is visible but not readable. D4 is needed
before the history feature is credible to a new user.

**4. Login is still a stub seeding fake tokens.**
Any real pilot requires actual OTP auth. A doctor who sees a "Login" screen
that accepts anything will not trust the app with patient data. D1 must be
built before pilot.

---

## REGULATORY OR TRUST RISKS

**1. Offline patient access generates no audit log (D2 H-3).**
Every offline lookup of patient data is unlogged. Under DPDP, access to
sensitive personal data must be logged. This is a pre-merge blocker for D2
— fix before merging to main.

**2. Consent request is unreachable.**
D6 correctly shows a "consent not yet established" state, but the doctor
cannot actually send a consent request — D9 is not built. For multi-doctor
scenarios (a specialist seeing a GP's patient), consent is the gateway to
any records. Without D9, those doctors cannot use the app at all. This is a
usage-narrowing gap, not a regulatory violation — but note it for scoping.

**3. Pre-merge security blockers in D2 and D6 remain open.**
Certificate pinning (D2 H-2), transaction atomicity (D6 M-4), consent
re-read at save (D6 M-1), and draft-deletion warning (D6 M-6) are all
unresolved. None of these prevent committing to dev, but none should reach
main or any pilot build unresolved.

---

## ONE THING MOST LIKELY TO CAUSE LOW ADOPTION

**The sync worker gap.** A doctor who creates visit records for a week
and then loses them — due to a phone wipe, device change, or app reinstall —
will not use the app again and will tell other doctors not to use it.
Word-of-mouth in this market is the only channel that matters. One data-loss
story destroys the reputation the app needs to spread. Build the sync worker
before any live patient data is created in the app.

---

## NEXT BUILD PRIORITY ORDER (recommended)

| Priority | Item | Reason |
|---|---|---|
| 1 | Pre-merge blockers (D2 H-2, H-3; D6 M-1, M-4, M-5, M-6) | Foundation. Everything else builds on top. |
| 2 | Sync worker | Non-negotiable before any pilot or live data. |
| 3 | D1 (Login / OTP) | Required for real auth before pilot. |
| 4 | D5 (New Patient Form) | Required to avoid flow breakage for new patients. |
| 5 | D4 (Visit Detail) | Unlocks the value of D3's history list. |
| 6 | D9 (Consent Request) | Unlocks multi-doctor use cases. |
| 7 | D8 (Full Scan View) | Additive, not blocking anything. |
