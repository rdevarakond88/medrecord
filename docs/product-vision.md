# Product Vision — MedRecord (Working Title)

## Problem Statement

Patients in semi-urban and rural India carry physical paper records across multiple clinic visits. Doctors lack access to patient history during consultations. Existing digital solutions require expensive subscriptions, internet connectivity, and voice-based or complex workflows that create resistance among doctors who have practised comfortably without them for years.

## Core Design Principle

**Zero friction for doctors.** The app must feel as close to paper as possible. A doctor should never feel burdened, interrupted, or slowed down. If the digital workflow takes longer than scribbling on paper, the app has failed.

## Target Market

- Semi-urban and rural clinics across India
- Solo practitioners and small clinics (1–3 staff)
- Clinics with unreliable or no internet connectivity
- Patients who are elderly, low-literacy, or uncomfortable with technology
- Doctors who range from digitization-resistant to cautiously open

## User Roles

### Doctor / Clinic Staff
- Creates and manages patient records
- Scans physical documents
- Views patient visit history
- Adds typed or scanned notes to visits

### Patient
- Read-only access to their own timeline
- Controls which doctors/clinics can access their records
- Views scanned documents and typed notes chronologically

## Core Features

### 1. Document Scanner with OCR
- Camera-based capture of handwritten prescriptions, notes, reports
- Stores original image (never discarded) + extracted text for searchability
- OCR failure is silent — image is always the source of truth
- Patient can view both the image and extracted text

### 2. Doctor's Dashboard
- Patient lookup by mobile number (primary) or Aadhaar-linked ID (optional)
- View patient history at a glance
- Open a new visit, attach scan or note
- Close/submit visit when done

### 3. Patient Timeline View
- Chronological list of all records
- Grouped by clinic/doctor
- Each entry shows: date, doctor name, clinic, scan thumbnail, and any typed notes
- Read-only; patient cannot edit records

### 4. Offline-First Architecture
- Core functions (create visit, capture scan, add note) work with no connectivity
- Local queue syncs automatically when connection is available
- No data loss on connectivity interruption
- Visit records are timestamped at creation on device

### 5. Minimal Mandatory Entry
- Required: Date (auto-populated), one of — scan OR typed note
- Everything else (diagnosis, medication, doctor name, clinic) is optional
- No mandatory free-text fields on mobile keyboard

### 6. Patient Consent Layer
- Records are patient-owned, not clinic-owned
- Patient grants access to specific doctors or clinics
- Patient can revoke access (new records blocked; historical records access governed by policy — see consent-layer-spec.md)
- Consent is logged and auditable

## What This App Deliberately Does Not Do (v1)

- No billing or insurance integration
- No appointment scheduling
- No lab result integrations
- No AI diagnosis or clinical decision support
- No multi-doctor collaborative editing
- No video consultations

## Record Creation Model

Records are **visit-triggered and append-only**. A record is created only when a patient physically presents at a clinic. Since a patient can only be in one place at one time, simultaneous conflicting writes are not possible.

Within a clinic, a visit is a **container owned by the opening doctor/staff member**. Other staff may attach documents to the same visit container, but cannot edit the doctor's notes. The visit is open until explicitly submitted/closed.

## Regulatory Context (India)

- Primary law: Digital Personal Data Protection Act (DPDP), 2023
- Aadhaar usage governed by UIDAI regulations — must not be primary key; stored encrypted and separately
- Health data is "sensitive personal data" under DPDP — requires explicit consent
- No mandatory HIPAA compliance (US-specific), but good practice to align with its principles

## Success Metrics (v1)

- Doctor completes a visit record in under 60 seconds
- App works fully offline for up to 72 hours
- OCR extraction accuracy > 80% on clearly photographed text
- Patient can find any record within 3 taps
- Zero patient records exposed to unauthorised doctors
