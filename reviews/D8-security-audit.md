# Security Audit — D8 Full Scan View

**Date:** 2026-05-12
**Agent:** Security Agent
**Files audited:**
- `src/screens/doctor/FullScanViewScreen.tsx`
- `src/components/ScanImageViewer.tsx`
- `src/db/scans.ts` (getScansForServerVisit — new function)
- `src/screens/doctor/VisitDetailScreen.tsx` (handleViewScan — D4 entry point to D8)

---

## CRITICAL (must fix before merge)

None.

---

## HIGH (fix before v1 launch)

None.

---

## MEDIUM (fix before v1 launch)

### D8-SA-M1: No `scan_viewed` audit event when a doctor views a full scan image

**File:** `src/screens/doctor/VisitDetailScreen.tsx:290` (`handleViewScan`)
**Risk:** `security-spec.md` explicitly lists "Image uploaded/downloaded" as an auditable event. D4 emits `logVisitViewed` (`visit_viewed`) on screen mount — this covers visit-level access but not individual scan image access. If a doctor views specific scans repeatedly, or views scans from a patient they are no longer treating, that access is invisible to the audit trail. Under DPDP Act 2023 §8, patients can request a log of who accessed their health images; that log is incomplete without this event.

**Fix:** Add `logScanViewed()` to `src/db/scans.ts`, emitting `event_type = 'scan_viewed'` with `metadata: { scanId, visitId, label }`. Call it in `handleViewScan` (VisitDetailScreen.tsx ~line 302) immediately before `navigation.navigate('FullScanView', …)`. Pattern is identical to `logVisitViewed` in `src/db/visits.ts`.

```typescript
// src/db/scans.ts — add this function
export async function logScanViewed(
  db: SQLiteDatabase,
  params: { scanId: string; visitId: string; doctorId: string; patientId: string; label: string },
): Promise<void> {
  const id  = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO audit_events
       (id, event_type, doctor_id, patient_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, 'scan_viewed', params.doctorId, params.patientId,
     JSON.stringify({ scanId: params.scanId, visitId: params.visitId, label: params.label }), now],
  );
}
```

---

## LOW (backlog)

### D8-SA-L1: `resolveScanPath()` null-path fallback produces invalid URI

**File:** `src/db/scans.ts:39`
**Code:** `return (FileSystem.documentDirectory ?? '') + relativePath;`
**Risk:** If `FileSystem.documentDirectory` is null (edge case on some Android configurations at very early startup), the resolved URI is just the relative path string (e.g. `"doctorId/scans/uuid.jpg"`), causing `ScanImageViewer`'s `Image` component to fail silently with a broken image. Not exploitable — no security risk. Not observed in Expo SDK 54 practice.
**Fix (deferred):** Log a non-PII warning and return `null`; `FullScanViewScreen` renders an "image not available" state instead of a broken image placeholder.

---

## Checklist Status

| Category | Status | Notes |
|---|---|---|
| Authentication & Sessions | ✅ Pass | Auth guard present (`if (!token \|\| !user) return null`). No new auth endpoints. |
| Authorisation | ✅ Pass | `getScansForServerVisit()` double-scopes by `serverVisitId` AND `doctorId`. D8 reachable only via D3 (consent-gated) → D4 → D8 chain. No consent bypass path. |
| Data Handling | ⚠️ 5/6 | S3 check N/A (images stored on device filesystem — v1 decision). No Aadhaar exposure. OCR text sanitised upstream by D7 `sanitizeOcrText()`. `patientName` displayed as 12pt dimmed sub-line (accepted pattern). MEDIUM gap: image access not individually audited — see D8-SA-M1. |
| Mobile Security | ✅ Pass | No `console.log` calls in any new file (grep confirmed). `clearDoctorScanRecords()` + `clearDoctorScans()` called on logout (doctor-scoped). Images in `FileSystem.documentDirectory` (platform-encrypted; excluded from iCloud backup by default). |
| Input Validation | ✅ Pass | All SQLite queries use parameterised statements. `ocrText` null-safety handled in `OcrPanelBody` (`ocrStatus === 'success' && ocrText` guard). React Native `Text` is not XSS-vulnerable. |
| Database | ✅ Pass | All queries in `scans.ts` use `?` params — no string concatenation. `INNER JOIN visits_draft` + `s.doctor_id = ?` enforces cross-doctor isolation. |
| DPDP Compliance | ⚠️ Partial | Consent enforced upstream (D3 → D4 → D8 chain). MEDIUM audit trail gap logged as D8-SA-M1. |

---

## Overall Verdict

**CLEAR TO MERGE — 0 CRITICAL, 0 HIGH.**

1 MEDIUM finding (D8-SA-M1 — add `logScanViewed` before v1 launch).
1 LOW finding (D8-SA-L1 — `resolveScanPath` null guard — backlog).
