# PM Review — Step 28c: Sign-up / Account Deletion / Recovery Decisions
_Date: 2026-05-30_
_Session type: Post-completion product gap resolution (not a standard Moment 1/2/3)_

---

## Context

Three product gaps were identified by the human project owner after the project was declared complete (Mistakes 15, 16, 17 in LESSONS-AND-RUNBOOK.md). No build begins until the following four decisions are documented as Locked Decisions in `docs/project-state.md`.

---

## Decision 1 — Doctor Registration Model

**Question:** Self-serve registration, or admin-provisioned accounts?

**Decision: Admin-provisioned for v1. No self-serve registration screen.**

Rationale:
- Self-serve with no verification allows any mobile user to claim a doctor role and access patient health data. Not acceptable.
- Self-serve with NMC registration number is the correct long-term model but adds verification complexity (NMC API, manual review process) that is premature for a one-clinic pilot.
- Admin-provisioned is the standard approach for controlled Indian healthtech pilots. You know each doctor personally. Account is seeded in the backend by MedRecord admin.
- D1 (Login) remains login-only — correct as built.

Doctor self-registration deferred to v1.1 — design NMC registration number verification or invite-code flow at that point.

---

## Decision 2 — Patient Self-Registration Policy

**Question:** Can a patient create their own account without a doctor first adding them?

**Decision: Doctor-initiated patient creation is the intentional v1 model. No patient self-registration.**

Rationale:
- This is already correctly implemented via D5 (New Patient Form) + P1 (login-only). The question was whether this was intentional design or an accident — it is now explicitly intentional.
- Clinical context: patient is already in the clinic when added. Doctor has their mobile number. Record is created in real time during the consultation.
- Patient self-registration (walk-in, no doctor interaction) deferred to v1.1.

---

## Decision 3 — Account Deletion and Data Retention Policy

**Question:** What happens on user-requested account deletion? What data is kept?

**Decision: No deletion UI in v1. Policy documented for future implementation.**

Data handling policy (applies to v1.1 deletion UI when built):
- **PII deleted immediately on request:** name, mobile number, date of birth, Aadhaar hash
- **Clinical records retained:** visit notes, diagnoses, scan metadata retained for 3 years (outpatient) per MCI guidelines, stored against an anonymous UUID — not the mobile number. After 3 years: full purge.
- **Compliance basis:** DPDP Act 2023 (PII erasure right) satisfied by deleting PII; MCI retention requirement satisfied by retaining anonymized clinical records.

Re-join policy:
- If a patient re-registers with a previously deleted mobile number, a fresh account is created with no access to prior anonymized records. Old clinical records remain in the system under their original anonymous UUID, not linked to the new account.

V1 support model: any deletion requests handled via MedRecord admin escalation (manual backend operation). Acceptable for a controlled pilot with known users who have consented to participate.

---

## Decision 4 — Account Recovery Model

### 4a — Doctor Account Recovery

**Decision: Admin-reset for v1. No self-serve doctor profile screen.**

If a doctor loses access to their mobile number (lost phone, new SIM, number change), recovery is via MedRecord support escalation. Admin updates the mobile number in the backend. No in-app recovery flow needed for a one-clinic pilot where you know the doctor personally.

Doctor profile screen (name, mobile, clinic details) deferred to v1.1.

### 4b — Patient Mobile Number Mutability

**Decision: Patient mobile number is immutable for v1.**

Mobile number is the primary patient key — changing it breaks visit history linkage and consent records. PATCH /patient/profile must not accept mobile number changes.

If a patient's mobile number changes, recovery is via MedRecord admin escalation. Admin updates the mobile in the backend.

**This requires a Builder + Security verification task:** confirm PATCH /patient/profile backend rejects mobile field changes (or add guard if missing).

### 4c — OTP Resend

**Decision: OTP resend with 30-second cooldown is a pre-pilot requirement for both D1 and P1.**

If OTP SMS does not arrive (carrier delay, ported number), the user has no recourse. A resend button with cooldown is a small Builder task and must be in place before any real user attempts to log in.

Neither D1 nor P1 currently has this feature.

---

## Build Required Before Pilot

| Task | Screen | Notes |
|---|---|---|
| OTP resend (30s cooldown) | D1 — LoginScreen.tsx | Small Builder addition |
| OTP resend (30s cooldown) | P1 — PatientLoginScreen.tsx | Small Builder addition |
| Block mobile change in PATCH /patient/profile | Backend | Builder + Security verify |

This is one micro Builder session. No new screens. No persona critique. Security Agent re-check needed only for the mobile field guard (touches auth + PII).

---

## New Locked Decisions (add to project-state.md)

| Decision | Rationale |
|---|---|
| Doctor registration is admin-provisioned for v1 — no self-serve registration screen | Self-serve requires NMC verification, premature for pilot; admin-provisioned is standard for controlled Indian healthtech pilots |
| Patient creation is doctor-initiated for v1 — patient cannot self-register | Patient is added by doctor via D5 in real time during consultation; clinically correct for v1 |
| Deletion policy: PII deleted on request; clinical records retained 3yr anonymized per MCI guidelines | DPDP Act 2023 + MCI retention requirements; PII and clinical records treated separately |
| Re-join: deleted mobile number → fresh account, no link to prior anonymous records | Clinical safety: re-activated history could include records patient expected were deleted |
| Patient mobile number is immutable primary key in v1 — PATCH /patient/profile blocks mobile changes | Mobile is primary patient key; allowing self-change breaks visit history linkage and consent records |
| Doctor account recovery for v1 is admin-reset via support escalation; doctor profile screen deferred to v1.1 | Pilot involves known doctors; personal support escalation is sufficient |
| OTP resend with 30s cooldown is a pre-pilot requirement on all OTP screens (D1, P1) | If SMS doesn't arrive, user has no recourse — must have resend before real users interact with the app |

---

## Status

DECISIONS COMPLETE. All four gaps from Mistakes 15/16/17 are resolved.

Next session: **Builder Agent — OTP resend + mobile field guard** (pre-pilot micro-session)
- Add resend OTP button (30s cooldown) to D1 + P1
- Verify/add guard on PATCH /patient/profile to reject mobile changes
- Security re-check on mobile field guard only
