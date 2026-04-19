# API Contracts — MedRecord

## General Conventions

- Base URL: `https://api.medrecord.in/v1`
- Authentication: Bearer JWT in `Authorization` header
- All responses: `Content-Type: application/json`
- Timestamps: ISO 8601 UTC (`2024-01-15T10:30:00Z`)
- Errors follow RFC 7807 (Problem Details)
- Pagination: cursor-based using `after` (UUID of last item)
- Soft-deleted items never returned unless explicitly requested by admin

## Error Format
```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "No patient found with this mobile number",
    "field": "mobile_number"   // optional, for validation errors
  }
}
```

## Standard Error Codes
| Code | HTTP Status | Meaning |
|---|---|---|
| UNAUTHORIZED | 401 | Missing or invalid JWT |
| FORBIDDEN | 403 | Valid JWT but no permission |
| NOT_FOUND | 404 | Resource does not exist |
| CONSENT_REQUIRED | 403 | Doctor lacks patient consent |
| VALIDATION_ERROR | 422 | Request body fails validation |
| CONFLICT | 409 | Duplicate local_id on sync |
| SERVER_ERROR | 500 | Unexpected server error |

---

## Auth Endpoints

### POST /auth/send-otp
Send OTP to mobile number for login.
```json
// Request
{
  "mobile_number": "9876543210",
  "role": "doctor" | "patient",
  "channel": "sms" | "whatsapp"   // optional — defaults to "sms" if omitted
}

// Response 200
{ "otp_token": "tok_abc123", "expires_in": 300 }
```

### POST /auth/verify-otp
```json
// Request
{ "otp_token": "tok_abc123", "otp": "482910" }

// Response 200 — existing doctor
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 86400,
  "user": {
    "id": "uuid",
    "role": "doctor",
    "name": "Dr. Sharma",
    "clinic_id": "uuid"
  }
}

// Response 200 — mobile not yet registered as a doctor
{ "status": "new_user" }
// NOTE: Doctor registration flow is not yet implemented in v1.
// The D1 Login screen checks for status === "new_user" and shows an
// appropriate message. Full registration UI is a future screen.
```

### POST /auth/refresh
```json
// Request
{ "refresh_token": "eyJ..." }

// Response 200
{
  "access_token": "eyJ...",
  "expires_in": 86400,
  "refresh_token": "eyJ..."   // optional — server SHOULD rotate the refresh token on every use
                               // and return the new one here. Frontend stores it back to SecureStore.
                               // Security requirement SW-H-2: refresh token rotation prevents
                               // a stolen token from being valid indefinitely.
}
```

---

## Patient Endpoints

### GET /patients/lookup
Look up patient by mobile number. Returns minimal profile. Requires valid consent or doctor initiating first visit.
```
Query params: ?mobile=9876543210
```
```json
// Response 200
{
  "patient": {
    "id": "uuid",
    "name": "Ramesh Kumar",       // null if not set
    "mobile_number": "9876543210",
    "date_of_birth": "1955-03-12", // null if not set
    "gender": "male",
    "consent_granted": true,
    "last_visit_date": "2024-01-10"
  }
}

// Response 404
{ "error": { "code": "PATIENT_NOT_FOUND", "message": "..." } }
```

### POST /patients
Create a new patient record (first visit flow).
```json
// Request
{
  "local_id": "uuid",
  "mobile_number": "9876543210",
  "name": "Ramesh Kumar",          // optional
  "date_of_birth": "1955-03-12",   // optional
  "gender": "male"                  // optional
}

// Response 201
{ "patient": { ...full patient object... } }

// Response 409 (mobile already registered)
{ "error": { "code": "CONFLICT", "patient_id": "uuid" } }
// NOTE: The client does not parse patient_id from the 409 error body directly —
// the current ApiError class does not carry extra error fields beyond code/message/status.
// On a 409, D5 falls back to GET /patients/lookup to retrieve the existing server ID.
// Backend: ensure /patients/lookup is accessible immediately after a 409 (no eventual consistency lag).
```

### GET /patients/:id
Full patient profile. Requires consent.
```json
// Response 200
{
  "patient": { ...full object... },
  "consent": {
    "granted_at": "2024-01-10T09:00:00Z",
    "scope": "read_all"
  }
}
```

---

## Visit Endpoints

### GET /patients/:id/visits
Returns the patient's visit history split by ownership, plus the current consent state.
This combines consent verification and visit retrieval in a single round-trip (security
requirement D3-H-2 — avoids a separate consent API call on every D3 load).

**Security constraints (MUST be enforced at the SQL query layer — not client-side):**
- **D3-H-1:** The server MUST exclude `chief_complaint` from `other_doctor_visits`
  when `consent_granted=false`. This must be done at the SQL layer, NOT by the
  client suppressing the field after receipt. Client-side suppression alone is
  not sufficient — a compromised or modified client could expose the field.
- **D3-H-2:** `consent_granted` and `checked_at` are returned so D3 can verify
  consent in a single round-trip without a separate consent endpoint call.

```json
// Response 200
{
  "my_visits": [
    {
      "id": "uuid",
      "visit_date": "2024-01-15",
      "chief_complaint": "Fever and cough",   // always present for the authenticated doctor's own visits
      "clinic_name": "Sharma Clinic",
      "record_count": 2,
      "status": "open"   // NOTE (D4): "open" | "submitted" — required by D4 (Visit Detail) to show
                         // the correct bottom bar and enable/disable Finish Visit. Backend MUST return
                         // this field for every visit in both lists. Default 'open' for newly created
                         // visits; 'submitted' after PATCH /visits/:id { status: 'submitted' }.
    }
  ],
  "other_doctor_visits": [
    {
      "id": "uuid",
      "visit_date": "2024-01-10",
      "chief_complaint": null,    // MUST be null/absent at SQL layer when consent_granted=false (D3-H-1)
      "clinic_name": "City Clinic",
      "record_count": 1,
      "status": "submitted"       // NOTE (D4): same field required for other-doctor visits
    }
  ],
  "consent_granted": true,        // authoritative consent state for this doctor–patient pair
  "checked_at": "2024-01-15T10:30:00Z"  // server UTC ISO timestamp of the consent check
}
```

**Notes:**
- `my_visits`: visits created by the authenticated doctor for this patient. Always returned with full data.
- `other_doctor_visits`: visits created by any other doctor. `chief_complaint` is excluded at the
  database query layer when `consent_granted=false`. When `consent_granted=true`, `chief_complaint` is included.
- `status` field added for D4 (Step 5b). The frontend caches it in `visits.status` and uses it to
  determine whether the bottom action bar (Add Note / Finish Visit) is shown.
- Visits are returned newest first within each list.
- No cursor pagination — D3 loads the full history in one call for v1.

### POST /visits
Create a new visit.
```json
// Request
{
  "local_id": "uuid",          // required for idempotency — server must deduplicate on this field.
                                // Frontend sends this as CreateVisitRequest.localId (src/api/visits.ts).
                                // Backend developer: enforce deduplication on this field.
                                // Do not accept duplicate local_id values.
  "patient_id": "uuid",
  "doctor_id": "uuid",         // the doctor creating this visit.
                                // SECURITY: Server MUST validate that doctor_id matches the
                                // authenticated JWT sub claim. Reject with 403 if mismatch.
                                // Never trust body doctor_id blindly — IDOR risk if not validated.
  "visit_date": "2024-01-15",
  "chief_complaint": "Fever",  // optional
  "note_text": "...",          // optional — doctor-typed note; included so note is server-persisted
                                // immediately on the online path, not dependent on sync worker
  "consent_granted": true      // optional boolean — reflects whether the patient granted consent
                                // at the time of this visit
}

// Response 201
{ "visitId": "uuid", "createdAt": "2024-01-15T11:30:00Z" }
```

### PATCH /visits/:id
Update visit (chief complaint, status). Only the opening doctor can update.
```json
// Request — to submit/close a visit
{ "status": "submitted" }

// Request — to update complaint
{ "chief_complaint": "Fever and cough" }

// Response 200
{ "visit": { ...updated visit object... } }

// Response 403 if not the opening doctor
```

---

## Record Endpoints

### GET /visits/:id/records
All records in a visit.

**Security constraints:**
- SECURITY: Server MUST validate that the requesting doctor either owns the visit or has active
  consent for the patient. Return 403 CONSENT_REQUIRED if neither condition is met.
- `content_text` for scan records should be withheld (null) when consent is absent — same rule as
  `chief_complaint` suppression in GET /patients/:id/visits. Enforce at the query layer.

```json
// Response 200
{
  "records": [
    {
      "id": "uuid",
      "type": "scan",                              // "note" | "scan"
      "content_text": "Tab. Paracetamol 500mg...", // null if OCR failed/skipped; null for redacted content
      "image_url": "https://s3.../...",            // null — S3 image storage deferred to v2
      "image_thumbnail_url": "https://s3.../...thumb",  // null — deferred to v2
      "ocr_status": "success",                     // null for note records
      "created_by": { "id": "uuid", "name": "Dr. Sharma" },
      "created_at": "2024-01-15T10:45:00Z"
    }
  ]
}
```

**Note for note-type records:**
- `type`: `"note"`
- `content_text`: the note text (always present)
- `image_url`, `image_thumbnail_url`: null (notes have no image)
- `ocr_status`: null (not applicable to notes)

### POST /records
Create a new record (note or initiate scan upload).

**SECURITY:** Server MUST verify that the authenticated doctor owns the visit (or is the doctor
who created it) before accepting a new record. Reject with 403 if not the visit owner.
Additionally, the server MUST verify the visit `status` is `"open"` — reject with 409 if
the visit is already `"submitted"`.

**Idempotency:** `local_id` MUST be deduplicated server-side. If a record with the same
`local_id` already exists, return 201 with the existing record (do not create a duplicate).
This prevents double-writes on network retry.

```json
// Request — typed note (D4)
{
  "local_id": "uuid",      // client-generated UUID; server deduplicates on this field
  "visit_id": "uuid",
  "type": "note",
  "content_text": "Patient reports fever for 3 days, 101°F"
}

// Request — scan (image uploaded separately via presigned URL; S3 deferred to v2)
{
  "local_id": "uuid",
  "visit_id": "uuid",
  "type": "scan",
  "image_s3_key": "scans/2024/01/15/uuid.jpg"  // after upload to S3
}

// Response 201
{ "record": { ...full record object... } }
```

### PATCH /records/:id
Update an existing record (note text edit).

**NOTE (D4 — not yet implemented server-side for v1):**
The frontend soft-stores note edits locally only. This endpoint is required for v2 to
sync edits to the server. Backend developer: implement this endpoint before D4 device testing.

**SECURITY:** Server MUST verify that the requesting doctor created this record (same doctor
who originally posted it). Only own records may be edited — never another doctor's records.
The visit must also be in `status="open"` — submitted visits are locked.

```json
// Request
{
  "content_text": "Updated note text…"   // only applicable to type="note" records
}

// Response 200
{ "record": { ...updated record object... } }

// Response 403 if not the record creator
// Response 409 if visit is already submitted
```

### DELETE /records/:id
Delete (permanently) a record.

**NOTE (D4 — not implemented in v1):**
The server data model is append-only for v1. The frontend uses a local soft-delete
(`sync_status='deleted'` in visit_records) so the record is hidden on the device.
This endpoint is required for v2 if true deletion is needed for compliance reasons.
Until then, "deleted" records remain on the server.

**SECURITY:** Server MUST verify the requesting doctor created this record. The visit
must be in `status="open"`.

```json
// Response 204 No Content

// Response 403 if not the record creator
// Response 409 if visit is already submitted
```

### GET /records/upload-url
Get a presigned S3 URL for direct image upload from device.
```
Query params: ?content_type=image/jpeg&visit_id=uuid
```
```json
// Response 200
{
  "upload_url": "https://s3.amazonaws.com/...?X-Amz-Signature=...",
  "s3_key": "scans/2024/01/15/uuid.jpg",
  "expires_in": 900
}
```

---

## Consent Endpoints

### GET /patients/:id/consent/check
Check if requesting doctor has consent for this patient.
```json
// Response 200
{
  "has_consent": true,
  "scope": "read_all",
  "granted_at": "2024-01-10T09:00:00Z"
}
```

### POST /consent
Grant consent (called after patient verifies via OTP in-clinic).
```json
// Request
{
  "patient_id": "uuid",
  "doctor_id": "uuid",         // or clinic_id
  "scope": "read_all",
  "granted_by": "patient"
}

// Response 201
{ "consent": { ...full consent object... } }
```

### DELETE /consent/:id
Revoke consent. Patient-initiated only.
```json
// Response 200
{ "revoked_at": "2024-01-20T14:00:00Z" }
```

---

## Sync Endpoint

### POST /sync
Batch sync from device. Processes queued offline operations in order.
```json
// Request
{
  "operations": [
    {
      "operation": "create",
      "entity_type": "patient",
      "local_id": "uuid",
      "payload": { ...patient object... },
      "queued_at": "2024-01-15T09:00:00Z"
    },
    {
      "operation": "create",
      "entity_type": "visit",
      "local_id": "uuid",
      "payload": { ...visit object... },
      "queued_at": "2024-01-15T09:01:00Z"
    },
    {
      "operation": "create",
      "entity_type": "audit_event",
      "local_id": "uuid",
      "payload": {
        "event_type": "string",       // e.g. "consent_accessed", "visit_created", "patient_searched"
        "doctor_id": "uuid",
        "patient_id": "uuid",
        "metadata": { ...any relevant context... },  // nullable
        "created_at": "2024-01-15T09:00:00Z"         // client-recorded UTC ISO timestamp
      },
      "queued_at": "2024-01-15T09:00:00Z"
    }
  ]
}

// Response 200
{
  "results": [
    {
      "local_id": "uuid",
      "status": "success",
      "server_id": "uuid"      // server-assigned ID to replace local_id
    },
    {
      "local_id": "uuid",
      "status": "conflict",
      "server_id": "uuid",     // already exists; use this ID going forward
      "message": "Patient already registered"
    }
  ]
}
```

**Supported entity types:**
| entity_type | Description |
|---|---|
| `patient` | New patient registration |
| `visit` | New visit created offline |
| `audit_event` | DPDP Act 2023 compliance audit log entry (see below) |

**audit_event entity:**
The server MUST store all `audit_event` operations in a persistent audit log table.
DPDP Act 2023 (India's Digital Personal Data Protection Act) requires an auditable
trail of all access to patient personal data. Audit events are flushed from the device
after the main sync_queue drain, but use the same POST /sync endpoint.
The server should NOT return `server_id` for audit events in the results array — these
are append-only log entries and do not need an ID mapping back to the client.

**Notes:**
- Operations processed in `queued_at` order
- `conflict` is not an error — device should update its local ID mapping
- Images uploaded separately via presigned URLs before or after sync

---

## OCR Webhook (Internal)

### POST /internal/ocr-complete
Called by OCR worker when processing completes (async).
```json
// Request (from worker, authenticated via service token)
{
  "record_id": "uuid",
  "status": "success" | "failed",
  "extracted_text": "Tab. Paracetamol 500mg...",
  "confidence": 0.87,
  "raw_output": { ...Tesseract/Vision API JSON... }
}

// Response 200
{ "updated": true }
```
