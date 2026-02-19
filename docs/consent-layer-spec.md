# Consent Layer Specification — MedRecord

## Core Principle

**Records are patient-owned, not clinic-owned.** A doctor generates a record during a visit, but that record belongs to the patient permanently. The doctor cannot delete it. The clinic cannot sell or transfer it.

---

## Consent Model

### Grant Types
1. **Doctor-level consent**: Patient grants access to a specific doctor (portable — follows doctor across clinics)
2. **Clinic-level consent**: Patient grants access to all doctors at a specific clinic

### Scope Options
| Scope | Meaning | Default? |
|---|---|---|
| `read_all` | Doctor sees all records, past and future | ✅ Yes (v1) |
| `read_from_date` | Doctor sees records from a specific date onward | No |
| `read_new_only` | Doctor can only see new records created after grant | No |

In v1, only `read_all` is implemented for simplicity.

### Duration
- Consents do not expire automatically in v1
- Patient can revoke at any time via the Patient app
- Revocation takes effect immediately (within next sync cycle)

---

## Consent Flows

### Flow 1: New Patient, First Visit (Implicit Consent with Confirmation)

**Context:** Patient has no existing records anywhere. Doctor wants to create the first record.

1. Doctor searches mobile number → "Not Found"
2. Doctor taps "New Patient"
3. Doctor fills minimal form (mobile only required)
4. Doctor taps "Create & Start Visit"
5. App creates patient record AND creates a consent grant for this doctor
6. **Patient receives SMS:** "Dr. [Name] at [Clinic] has created a health record for you on MedRecord. Download the app to view your records: [link]"
7. Visit proceeds normally

**Rationale:** Implicit consent is acceptable for record creation (doctor is treating the patient in person). Patient is notified and can revoke access via the app at any time.

---

### Flow 2: Returning Patient, New Doctor (Explicit Consent Required)

**Context:** Patient has records with Doctor A. Doctor B wants to view them at a different clinic.

1. Doctor B searches patient mobile → patient found
2. App checks consent → "No active consent"
3. Doctor B sees: "[Patient Name]'s records exist but require their permission."
4. Doctor B taps "Request Access"
5. **Two sub-flows available:**

**Sub-flow A: Patient has the app**
- Patient receives push notification: "Dr. [Name] at [Clinic] is requesting access to your records."
- Patient opens app → sees request → taps "Grant" or "Deny"
- Doctor B's device notified of outcome (polls or push)

**Sub-flow B: Patient doesn't have the app (common case)**
- App generates a 6-digit consent OTP
- Doctor B: "Please ask your patient to check their phone for an SMS"
- Patient receives SMS with OTP
- Doctor hands phone to patient (or patient reads OTP aloud)
- Patient enters OTP on doctor's device
- Consent granted, doctor gains access

**Fallback (no phone nearby / no SMS):**
- Doctor can still create a NEW visit for the patient (new records only)
- Doctor cannot view historical records from other doctors without consent
- Patient's new records with Doctor B are visible to Doctor B immediately

---

### Flow 3: Returning Patient, Same Doctor

- Consent already exists from previous visit
- App checks → valid consent → history loads immediately
- No user action required

---

### Flow 4: Patient Revoking Access

1. Patient opens "Doctors Who Have Access" (P4)
2. Taps "Revoke Access" for a specific doctor or clinic
3. Confirmation dialog: "Are you sure? Dr. [Name] will no longer be able to view your records."
4. Revocation recorded with timestamp
5. Doctor's next sync cycle will receive "consent_revoked" flag
6. Doctor's local cache of this patient's records should be cleared on next sync

**What happens to records created by the revoked doctor?**
- Records created by that doctor remain visible to the patient (patient-owned)
- The revoked doctor can still see records *they personally created* (their own clinical notes)
- The revoked doctor cannot see records created by other doctors

---

## Consent Audit Trail

Every consent event is logged and immutable:
```
consent_audit_log {
  id              UUID
  consent_id      UUID FK → consent
  event           ENUM('granted','revoked','accessed')
  actor_id        UUID     ← who performed the action
  actor_role      ENUM('patient','doctor','system')
  ip_address      VARCHAR  ← server-side only
  device_id       VARCHAR  ← device identifier
  timestamp       TIMESTAMP
}
```

Audit logs are:
- Never deleted
- Not accessible to doctors or patients through the normal app
- Available to patient via "Download my data" request (DPDP compliance)
- Available to system admins for compliance investigation

---

## What Doctors Can and Cannot Do

| Action | Without Consent | With Consent |
|---|---|---|
| Create new patient record | ✅ | ✅ |
| Create new visit | ✅ | ✅ |
| View records they created | ✅ | ✅ |
| View records by other doctors | ❌ | ✅ |
| Search patient by mobile | ✅ | ✅ |
| Export patient data | ❌ | ❌ (v1 — not available to any doctor) |
| Delete records | ❌ | ❌ (records are permanent) |

---

## DPDP Act Alignment (India)

The Digital Personal Data Protection Act, 2023 requires:
- **Explicit consent** for processing sensitive personal data (health data qualifies)
- **Purpose limitation**: data collected for treatment, used only for treatment
- **Right to erasure**: patient can request deletion (handled via soft-delete + admin process)
- **Data portability**: patient can request export of all their data
- **Consent withdrawal**: must be as easy as giving consent — our revocation flow satisfies this
- **Notice**: patients must be informed what data is collected — satisfied by SMS notification and app onboarding

### What Is NOT Required (common misconceptions)
- Aadhaar verification is NOT required for health apps (only for certain government services)
- A Data Protection Officer is required only for "Significant Data Fiduciaries" — likely not applicable to v1 scale
- Localisation of health data (storing only in India) is expected to be mandated — use AWS ap-south-1 (Mumbai) region

---

## Privacy by Design Rules for Developers

1. Never log patient mobile numbers or names in application logs
2. Never return patient records in API responses without first checking consent
3. All consent checks must be server-side (never trust client-side consent cache alone for access control)
4. Doctor's local cache must be invalidated when consent is revoked
5. Aadhaar hash must never appear in logs, error messages, or API responses
6. Images in S3 must use signed URLs with 15-minute expiry — never public URLs
7. Deleted records (soft-deleted) must not be returned by any public API endpoint
