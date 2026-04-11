# Offline Sync Specification — MedRecord

## Core Principle

The app must be fully functional with zero internet connectivity. Connectivity is a bonus, not a requirement. Syncing is invisible to the user unless it fails.

## Why This Is Tractable (Not Hard)

Given the product's visit-triggered, append-only record model:
- A patient visits one clinic at a time
- Only one doctor opens and writes to a visit
- No simultaneous multi-user editing of the same record
- Conflicts are structurally impossible in normal operation

This means we can use a **simple optimistic sync queue** — no CRDTs, no conflict resolution algorithms, no vector clocks needed.

---

## Local Storage Technology

**Recommended: WatermelonDB** (React Native)
- Built for offline-first React Native apps
- SQLite under the hood
- Lazy-loaded, high performance on low-end Android devices
- Sync adapter pattern matches our needs

**Alternative: SQLite directly via expo-sqlite** (simpler, less abstraction)

For v1, SQLite directly is recommended — less magic, easier to debug in the field.

---

## Sync Architecture

```
Device (SQLite)                    Server (PostgreSQL)
    │                                      │
    │  User creates visit offline          │
    │  → written to local SQLite           │
    │  → added to sync_queue               │
    │                                      │
    │  [connectivity returns]              │
    │                                      │
    ├─── POST /sync ──────────────────────►│
    │    (batch of queued operations)      │
    │                                      │
    │◄─── results (server_ids) ───────────┤
    │                                      │
    │  Update local records                │
    │  local_id → server_id mapping        │
    │  Clear sync_queue entries            │
```

---

## Sync Queue Behaviour

### Enqueue
Every write operation (create patient, create visit, create record) immediately:
1. Writes to local SQLite
2. Adds entry to `sync_queue` table with status `pending`
3. Returns success to the UI (user sees immediate feedback)

### Process
A background sync worker runs:
- On app foreground
- On network connectivity change (from offline → online)
- Every 5 minutes while online and app is open

### Ordering
Operations are processed strictly in `queued_at` chronological order.

**Why this matters:** If a patient is created offline, then a visit is created for them, the patient must sync before the visit. The sync endpoint handles this by processing operations in order and returning server IDs that subsequent operations within the same batch can reference.

### ID Resolution
Local SQLite uses device-generated UUIDs (`local_id`). After sync:
- Server returns `{ local_id, server_id }` mappings
- Device stores a `local_to_server_id` lookup table
- All subsequent operations use server IDs when available
- Sync batch can include operations that reference `local_id`s — server resolves them

### Conflict Handling
In the rare case server returns `conflict` (e.g., patient with that mobile already exists):
- Server returns the existing `server_id`
- Device maps its `local_id` to the existing `server_id`
- No data is lost; subsequent operations use the correct server ID

---

## Image Sync

> **NOTE: S3 upload is deferred for v1. Images are stored on device local storage only. The upload queue and presigned URL steps are skipped. OCR is also deferred as it depends on S3. Images remain fully viewable from local storage.**

Images are the most bandwidth-intensive part of sync. Handle separately from metadata.

### Capture Flow (Offline)
1. Image captured by camera
2. Stored to device local storage (full resolution)
3. Compressed thumbnail generated locally for display
4. Record created in local SQLite with `image_local_path` set, `image_url` null, `synced_at` null
5. Sync queue entry created for the record metadata
6. A separate `image_upload_queue` entry created for the image file

### Upload Flow (Online)
1. Metadata sync runs first (creates record on server)
2. Image upload worker picks up `image_upload_queue` entries
3. Fetches presigned S3 URL from server for each image
4. Uploads image directly from device to S3 (not via server)
5. POSTs `record_id + s3_key` to server to update record
6. Server triggers async OCR job
7. On success: local record updated with `image_url`, local file retained for 7 days then pruned

### Bandwidth Sensitivity
- Images compressed to max 1MB before upload (sufficient for prescription legibility)
- Upload only on WiFi by default (configurable in Profile → Settings)
- "Upload on mobile data" toggle for clinics with only 4G

### Failure Handling
- Upload fails: retry with exponential backoff (1m, 2m, 4m, 8m, max 30m intervals)
- After 5 failures: mark as `upload_failed`, surface in sync status UI
- Image is never lost from device until manually cleared

---

## OCR Flow (Always Async)

OCR is always asynchronous and never blocks the user.

```
Image uploaded to S3
       │
       ▼
Server receives s3_key
       │
       ▼
Queues OCR job (Bull queue / SQS)
       │
       ▼
Worker: Tesseract (local) or Google Vision API
       │
       ├─ success → POST /internal/ocr-complete with extracted_text
       │            → record updated with content_text, ocr_status='success'
       │            → push notification to device (optional, low priority)
       │
       └─ failure → POST /internal/ocr-complete with status='failed'
                    → record.ocr_status = 'failed'
                    → image is still fully usable; text search unavailable for this record
```

**Important:** OCR failure is silent from a UX perspective. The doctor sees the image regardless. The patient sees the image regardless. A small "Text not extracted" label is shown for transparency but never blocks any workflow.

---

## Sync Status UI

### States and Indicators

| State | Indicator | User Action Available |
|---|---|---|
| All synced | Nothing shown | — |
| Syncing in progress | Thin blue bar at top | — |
| Offline, has queued items | Amber dot + "Offline" badge | — |
| Upload waiting for WiFi | Small icon on record card | "Upload now on mobile data" |
| Sync failed (non-image) | Red banner + count of failed items | "Retry" button |
| Image upload failed | Icon on scan thumbnail | Tap to retry |

### Philosophy
- Success is invisible
- Progress is minimal and non-blocking
- Failure is clear and actionable
- Never show technical error messages to users

---

## Edge Cases

### Device Change (Doctor gets a new phone)
1. Doctor logs in on new device
2. App downloads all server-synced data for that doctor's patients
3. Any unsynced data on old device is lost if old device not available
- **Mitigation:** Sync on every foreground event. Warn on logout if unsynced items exist.

### Visit Left Open for Multiple Days
- Allowed. Doctor may open a visit Friday, finish notes Monday.
- `visit_date` reflects when the patient actually visited, not when notes were completed
- `submitted_at` reflects when doctor closed the visit
- No automatic timeout on open visits in v1

### Patient Returns to Different Clinic (Same Doctor)
- New visit, new clinic_id — handled naturally
- Doctor's lookup by mobile number shows full history regardless of clinic

### Patient Returns to Different Doctor, Same Clinic
- Consent must exist for new doctor
- In-clinic consent flow (D9) handles this
- New doctor creates new visit under their doctor_id

### App Killed Mid-Capture
- Image already written to local storage before capture returns
- SQLite write is transactional — either complete or rolled back
- Sync queue entry will not exist if the app was killed before it was written — doctor sees incomplete scan, can retake

### Clock Skew
- Device clock may be wrong (common on low-end Android)
- `queued_at` is device time, used only for ordering within a single device's queue
- Server assigns authoritative `created_at` on receipt
- `visit_date` is user-editable (date picker) to handle wrong device dates
