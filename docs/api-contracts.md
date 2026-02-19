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
{ "mobile_number": "9876543210", "role": "doctor" | "patient" }

// Response 200
{ "otp_token": "tok_abc123", "expires_in": 300 }
```

### POST /auth/verify-otp
```json
// Request
{ "otp_token": "tok_abc123", "otp": "482910" }

// Response 200
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
```

### POST /auth/refresh
```json
// Request
{ "refresh_token": "eyJ..." }

// Response 200
{ "access_token": "eyJ...", "expires_in": 86400 }
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
All visits for a patient, newest first. Requires consent.
```
Query params: ?limit=20&after=uuid
```
```json
// Response 200
{
  "visits": [
    {
      "id": "uuid",
      "visit_date": "2024-01-15",
      "doctor": { "id": "uuid", "name": "Dr. Sharma" },
      "clinic": { "id": "uuid", "name": "Sharma Clinic" },
      "chief_complaint": "Fever and cough",
      "status": "submitted",
      "record_count": 2,
      "submitted_at": "2024-01-15T11:30:00Z"
    }
  ],
  "next_cursor": "uuid"
}
```

### POST /visits
Create a new visit.
```json
// Request
{
  "local_id": "uuid",
  "patient_id": "uuid",
  "visit_date": "2024-01-15",
  "chief_complaint": "Fever"    // optional
}

// Response 201
{ "visit": { ...full visit object... } }
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
```json
// Response 200
{
  "records": [
    {
      "id": "uuid",
      "type": "scan",
      "content_text": "Tab. Paracetamol 500mg...",  // null if OCR failed/skipped
      "image_url": "https://s3.../...",
      "image_thumbnail_url": "https://s3.../...thumb",
      "ocr_status": "success",
      "created_by": { "id": "uuid", "name": "Dr. Sharma" },
      "created_at": "2024-01-15T10:45:00Z"
    }
  ]
}
```

### POST /records
Create a new record (note or initiate scan upload).
```json
// Request — typed note
{
  "local_id": "uuid",
  "visit_id": "uuid",
  "type": "note",
  "content_text": "Patient reports fever for 3 days, 101°F"
}

// Request — scan (image uploaded separately via presigned URL)
{
  "local_id": "uuid",
  "visit_id": "uuid",
  "type": "scan",
  "image_s3_key": "scans/2024/01/15/uuid.jpg"  // after upload to S3
}

// Response 201
{ "record": { ...full record object... } }
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
