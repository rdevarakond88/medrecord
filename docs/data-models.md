# Data Models — MedRecord

## Design Principles
- Every entity has a UUID primary key (never expose sequential IDs externally)
- Soft deletes only (deleted_at timestamp); records are never hard-deleted
- All timestamps in UTC; display conversion happens on device
- Aadhaar stored as one-way hash (SHA-256) for lookup only; never stored in plaintext
- Offline-first: every entity carries a `local_id` (device-generated UUID) that persists through sync

---

## Entities

### Patient
```
patient {
  id                  UUID (PK, server-generated)
  local_id            UUID (device-generated, used before sync)
  mobile_number       VARCHAR(10) NOT NULL UNIQUE  ← primary lookup key
  name                VARCHAR(255)                  ← optional
  date_of_birth       DATE                          ← optional
  gender              ENUM('male','female','other','prefer_not_to_say') ← optional
  aadhaar_hash        VARCHAR(64)                   ← SHA-256 hash, optional, separate table preferred
  profile_photo_url   TEXT                          ← optional, S3 url
  preferred_language  VARCHAR(50)                   ← default "English"; updated via PATCH /patient/profile
  created_at          TIMESTAMP
  updated_at          TIMESTAMP
  deleted_at          TIMESTAMP                     ← soft delete
}
```

**Notes:**
- Mobile number is the join key between patient and doctor lookup
- Name is optional because some patients are uncomfortable sharing it digitally at first visit
- Aadhaar hash should ideally live in a separate `patient_aadhaar` table with stricter access controls

---

### Doctor
```
doctor {
  id                  UUID (PK)
  name                VARCHAR(255) NOT NULL
  mobile_number       VARCHAR(10) NOT NULL UNIQUE
  specialisation      VARCHAR(255)               ← optional
  registration_number VARCHAR(100)               ← Medical Council number, optional
  clinic_id           UUID FK → clinic
  created_at          TIMESTAMP
  updated_at          TIMESTAMP
  deleted_at          TIMESTAMP
}
```

---

### Clinic
```
clinic {
  id                  UUID (PK)
  name                VARCHAR(255) NOT NULL
  address             TEXT
  pincode             VARCHAR(6)
  state               VARCHAR(100)
  phone               VARCHAR(10)
  created_at          TIMESTAMP
  updated_at          TIMESTAMP
  deleted_at          TIMESTAMP
}
```

---

### Visit
```
visit {
  id                  UUID (PK)
  local_id            UUID              ← device-generated, for offline use
  patient_id          UUID FK → patient
  doctor_id           UUID FK → doctor
  clinic_id           UUID FK → clinic
  visit_date          DATE NOT NULL     ← auto-populated to today on device
  chief_complaint     TEXT              ← optional, what the patient came for
  status              ENUM('open','submitted') DEFAULT 'open'
  opened_at           TIMESTAMP         ← when doctor opened the visit on device
  submitted_at        TIMESTAMP         ← when doctor closed/submitted
  synced_at           TIMESTAMP         ← null if not yet synced to server
  created_at          TIMESTAMP
  updated_at          TIMESTAMP
  deleted_at          TIMESTAMP
}
```

**Notes:**
- `status = 'open'` means the doctor can still attach/edit; `'submitted'` locks the visit
- A visit becomes the atomic unit of all sync operations
- Other clinic staff can attach documents to an open visit but cannot edit doctor notes

---

### Record
A Record is a single piece of clinical content within a Visit. One visit can have multiple records (e.g., one scan + one typed note).

```
record {
  id                  UUID (PK)
  local_id            UUID
  visit_id            UUID FK → visit
  created_by          UUID FK → doctor   ← who created this specific record
  type                ENUM('scan','note','diagnosis','medication','lab_result')
  content_text        TEXT               ← typed note OR OCR-extracted text
  image_url           TEXT               ← S3 URL for scanned image (null for typed records)
  image_local_path    TEXT               ← local device path before sync
  ocr_status          ENUM('pending','success','failed','skipped') DEFAULT 'skipped'
  ocr_raw_output      TEXT               ← raw OCR JSON, kept for auditability
  is_visible_to_patient BOOLEAN DEFAULT true
  synced_at           TIMESTAMP
  created_at          TIMESTAMP
  updated_at          TIMESTAMP
  deleted_at          TIMESTAMP
}
```

**Notes:**
- `image_url` and `content_text` can both be present (scan + extracted text)
- Image is always the source of truth; OCR text is supplementary and searchable
- `ocr_status = 'failed'` does not block the record — image is still saved
- `is_visible_to_patient` allows doctor to mark sensitive records (e.g., psychiatric notes) as non-visible until consent workflow is added in v2

---

### Consent
```
consent {
  id                  UUID (PK)
  patient_id          UUID FK → patient
  doctor_id           UUID FK → doctor   ← null if clinic-level consent
  clinic_id           UUID FK → clinic   ← null if doctor-level consent
  granted_at          TIMESTAMP NOT NULL
  revoked_at          TIMESTAMP          ← null if still active
  granted_by          ENUM('patient','proxy')  ← proxy = family member
  scope               ENUM('read_all','read_from_date','read_new_only') DEFAULT 'read_all'
  scope_from_date     DATE               ← used when scope = 'read_from_date'
  created_at          TIMESTAMP
}
```

**Notes:**
- One row per grant. Revocation creates a `revoked_at` timestamp, never deletes the row
- Audit trail is append-only
- `scope = 'read_all'` is the default for simplicity in v1; finer scopes available for v2

---

### ConsentPendingRequest
Async consent request for patients who have the Patient App installed (consent-layer-spec Flow 2A).
Doctor creates this via `POST /consent/pending-request`. Patient sees it in P4 and responds via
`POST /patient/consent-requests/:id/respond`. Distinct from `ConsentOtpRequest` (inline OTP flow).

```
consent_pending_request {
  id          UUID (PK)
  doctor_id   UUID FK → doctor
  patient_id  UUID FK → patient
  status      ENUM('pending','approved','denied') DEFAULT 'pending'
  created_at  TIMESTAMP
  responded_at TIMESTAMP          ← null until patient responds
}
```

**Notes:**
- One pending request per (doctor, patient) pair — creating a new one replaces an unresponded prior one
- On approval: a `Consent` row is created and this row's status is set to 'approved'
- On denial: status set to 'denied', no Consent row created

---

### Sync Queue (local device only, not synced to server)
```
sync_queue {
  id                  UUID (local)
  entity_type         ENUM('visit','record','patient','consent')
  entity_local_id     UUID
  operation           ENUM('create','update')
  payload             JSON              ← full entity snapshot at time of queue
  queued_at           TIMESTAMP
  attempts            INTEGER DEFAULT 0
  last_attempt_at     TIMESTAMP
  status              ENUM('pending','in_progress','success','failed')
  error_message       TEXT
}
```

**Notes:**
- This table lives only on the device (SQLite via WatermelonDB or similar)
- On connectivity, the app processes the queue in `queued_at` order
- Failed items retry with exponential backoff (max 5 attempts, then flag for manual review)

---

## Relationships Summary

```
Clinic ──< Doctor ──< Visit ──< Record
                 ↑         ↑
              Patient ──────┘
                 │
              Consent ──> Doctor / Clinic
```

---

## Indexes (PostgreSQL)

```sql
-- Patient lookup
CREATE INDEX idx_patient_mobile ON patient(mobile_number);
CREATE INDEX idx_patient_aadhaar ON patient(aadhaar_hash) WHERE aadhaar_hash IS NOT NULL;

-- Visit queries
CREATE INDEX idx_visit_patient ON visit(patient_id, visit_date DESC);
CREATE INDEX idx_visit_doctor ON visit(doctor_id, visit_date DESC);
CREATE INDEX idx_visit_sync ON visit(synced_at) WHERE synced_at IS NULL;

-- Record queries
CREATE INDEX idx_record_visit ON record(visit_id);
CREATE INDEX idx_record_sync ON record(synced_at) WHERE synced_at IS NULL;

-- Consent lookup
CREATE INDEX idx_consent_patient_doctor ON consent(patient_id, doctor_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_consent_patient_clinic ON consent(patient_id, clinic_id) WHERE revoked_at IS NULL;

-- Full-text search on OCR content
CREATE INDEX idx_record_fts ON record USING gin(to_tsvector('english', content_text))
  WHERE content_text IS NOT NULL;
```

---

## Data Retention Policy

- Patient records: Retained indefinitely (medical records have legal retention requirements in India)
- Soft-deleted records: Visible only to system admins for 7 years, then hard-deleted
- Sync queue: Cleared after successful sync; failed entries retained for 30 days
- Audit logs: Retained for 10 years (DPDP compliance)
