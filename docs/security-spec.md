# Security Specification — MedRecord

## Threat Model

Primary threats for a healthcare records app in India's semi-urban market:

1. **Unauthorised record access** — Doctor views another patient's records without consent
2. **Clinic data theft** — Disgruntled clinic staff exports all patient data
3. **Man-in-the-middle** — Intercept data on shared/public WiFi (common in clinics)
4. **Device theft** — Doctor's phone stolen, patient records exposed
5. **Insecure S3 images** — Scanned prescriptions accessible without authentication
6. **Aadhaar exposure** — Regulatory and reputational catastrophe if leaked
7. **OTP abuse** — Attacker uses consent OTP flow to grant themselves access
8. **Replay attacks** — Old API requests replayed to create duplicate records

---

## Authentication

### Mechanism
- OTP-based login (no passwords — reduces credential theft surface)
- OTP delivered via SMS (primary) + WhatsApp (fallback, for better delivery in rural areas)
- JWT access token (15-minute expiry) + refresh token (30-day expiry, rotated on use)
- Refresh token stored in device secure storage (Keychain on iOS, Keystore on Android)

### JWT Claims
```json
{
  "sub": "doctor_uuid",
  "role": "doctor",
  "clinic_id": "clinic_uuid",
  "device_id": "device_uuid",
  "iat": 1705312800,
  "exp": 1705313700
}
```

### OTP Security
- OTP is 6 digits, numeric only
- OTP expiry: 5 minutes
- Max 3 attempts before OTP invalidated (new request required)
- Rate limit: max 5 OTP requests per mobile number per hour
- OTPs stored as bcrypt hash on server (never plaintext)
- OTPs purged from database immediately after successful verification

### Consent OTP Security
Consent OTPs follow the same base rules as auth OTPs with two differences:

- **OTP expiry: 10 minutes** (vs 5 min for auth OTPs)
- **Rate limit: max 10 consent OTP requests per `(doctor_id, patient_id)` per hour** (vs 5 per mobile for auth)

Rationale: Consent OTPs are an in-person, synchronous flow — both doctor and patient are physically present. SMS delivery delays in rural/low-signal areas (1–3 min) plus the time for a patient to locate their phone and read or dictate the code make a 5-minute window unreliably short. The security downside is minimal: the OTP is delivered to the patient's registered mobile, both parties are co-located, and attempt limits and rate limits are still enforced.

All other rules apply identically: 6-digit numeric, bcrypt-hashed server-side, purged on successful verification, invalidated after 3 wrong attempts.

---

## Transport Security

- TLS 1.3 required for all API connections
- Certificate pinning on mobile app (prevents MITM even on compromised networks)
- HTTP Strict Transport Security (HSTS) on all server endpoints
- No HTTP fallback — HTTP requests rejected with 301

---

## Data Encryption

### At Rest (Server)
- PostgreSQL database encrypted at rest (AWS RDS encryption, AES-256)
- S3 images encrypted at rest (SSE-S3 or SSE-KMS)
- Aadhaar hashes stored in separate `patient_sensitive` table with column-level encryption (pgcrypto)
- Database backups encrypted with separate KMS key

### At Rest (Device)
- Sensitive data (JWT refresh token, cached patient records) stored in platform secure storage
- App data directory encrypted via platform (iOS Data Protection, Android FBE)
- Biometric lock option for app (Face ID / fingerprint) for doctor devices

### In Transit
- All API traffic over TLS 1.3
- S3 presigned URLs expire in 15 minutes — cannot be bookmarked or cached

---

## Authorisation (Backend Rules)

Every API endpoint enforces these checks in order:

1. **Valid JWT** — token not expired, not tampered
2. **Role check** — endpoint accessible to this role (doctor/patient)
3. **Resource ownership** — doctor belongs to a clinic; patient is accessing their own data
4. **Consent check** — for cross-doctor record access, valid consent must exist
5. **Soft-delete check** — deleted records never returned

**Never trust the client for access control.** Even if the app hides a button, the server re-validates every request.

### Row-Level Security (PostgreSQL RLS)
```sql
-- Doctors can only read their own clinic's visit records OR visits they have consent for
CREATE POLICY visit_access ON visit
  FOR SELECT TO app_doctor_role
  USING (
    doctor_id = current_setting('app.doctor_id')::uuid
    OR EXISTS (
      SELECT 1 FROM consent
      WHERE consent.patient_id = visit.patient_id
        AND consent.doctor_id = current_setting('app.doctor_id')::uuid
        AND consent.revoked_at IS NULL
    )
  );
```

---

## S3 Security

- Bucket is **private** — no public access whatsoever
- All image access via **presigned URLs** (15-minute expiry)
- Presigned URL generation requires valid JWT (server-side)
- Separate S3 buckets for: scans (production), backups, thumbnails
- Bucket policy denies all non-application IAM roles
- S3 access logging enabled — all GET/PUT events logged to CloudWatch
- No direct mobile → S3 bucket credentials; always via presigned URL

---

## Aadhaar Handling

This is the highest-risk data element.

- **Never store Aadhaar number in plaintext** anywhere — not in database, not in logs, not in error messages
- Store only SHA-256(aadhaar_number + application_salt) — one-way, used only for lookup
- Salt is environment-specific, stored in AWS Secrets Manager, not in codebase
- Aadhaar field is in a separate `patient_aadhaar` table — requires separate DB permission to access
- Aadhaar is never returned in any API response — not even to the patient's own app
- Audit log every time aadhaar_hash is used in a lookup

---

## Device Security

- Implement **app-level lock** (biometric/PIN) that activates after 5 minutes of inactivity
- On lock screen: no patient data visible — only login prompt
- On incorrect PIN 5× consecutive: wipe local cached patient data (not records on server)
- "Remote wipe" of cached data via server flag (for lost/stolen devices)

---

## Rate Limiting

| Endpoint | Limit | Window |
|---|---|---|
| POST /auth/send-otp | 5 per mobile | 1 hour |
| POST /auth/verify-otp | 3 per token | Per token |
| GET /patients/lookup | 60 per doctor | 1 minute |
| POST /sync | 10 per device | 1 minute |
| GET /records/upload-url | 30 per doctor | 1 minute |
| POST /consent | 10 per patient | 1 hour |

Rate limits enforced via Redis. Return `429 Too Many Requests` with `Retry-After` header.

---

## Audit Logging

Log every sensitive event:
- Login success/failure
- Patient record accessed
- Consent granted/revoked
- Record created/modified
- Image uploaded/downloaded
- Admin access

Log format:
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "event": "record.accessed",
  "actor_id": "doctor_uuid",
  "actor_role": "doctor",
  "resource_id": "record_uuid",
  "patient_id": "patient_uuid",
  "ip": "103.x.x.x",
  "device_id": "device_uuid",
  "outcome": "success"
}
```

Audit logs:
- Write-only to application (append only, no updates, no deletes)
- Stored in separate CloudWatch log group with 10-year retention
- Alerts for: bulk access patterns (>50 patients in 10 minutes by one doctor), after-hours access, failed consent checks

---

## Vulnerability Management

- Dependency scanning: automated via npm audit + Snyk in CI/CD pipeline
- No third-party analytics SDKs that touch patient data (no Firebase Analytics, no Mixpanel on data screens)
- Penetration test before v1 launch and annually thereafter
- Security headers on all API responses: `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`
- SQL injection prevention: parameterised queries only (never string concatenation in SQL)
- No `eval()` anywhere in codebase

---

## Incident Response Plan (Brief)

1. **Detection:** Automated alert fires (unusual access pattern / log anomaly)
2. **Containment:** Revoke affected JWT, disable affected account
3. **Assessment:** Audit logs reviewed to determine scope of exposure
4. **Notification:** Affected patients notified within 72 hours (DPDP requirement)
5. **Remediation:** Patch deployed, post-mortem written
6. **Regulatory:** Report to Data Protection Board of India if >100 patients affected

---

## Security Checklist for Every Code Review

- [ ] Does this endpoint check consent before returning patient data?
- [ ] Are SQL queries parameterised?
- [ ] Is Aadhaar data handled correctly (no plaintext, no logging)?
- [ ] Are S3 URLs presigned with short expiry?
- [ ] Is rate limiting applied?
- [ ] Is the audit log event emitted?
- [ ] Are soft-deleted records excluded from results?
- [ ] Is the JWT claim validated before trusting it?
