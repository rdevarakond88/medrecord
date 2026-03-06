# SECURITY AUDIT — D7 Document Scanner (Live Screen Re-Audit)

_Auditor: agent-security.md_
_Date: 2026-03-05_
_Audit version: v2 (live screen re-audit)_
_Source files audited:_
  - `src/screens/doctor/DocumentScannerScreen.tsx`
  - `src/db/scans.ts`
  - `src/db/schema.ts` (scans table + sync_queue)
  - `src/hooks/useLogout.ts`
  - `App.tsx`
_Prior audit: `reviews/D7-security-audit.md` (mockup, 2026-03-04)_
_QA findings reference: `reviews/D7-qa-test-plan.md`_
_PM pre-flow reference: `reviews/D7-pm-preflow.md`_

---

## Re-Audit Purpose

The mockup audit (v1) found and fixed CRITICAL-1 (auth guard position) and CRITICAL-2 (visitId
null check) as demonstrated patterns. This re-audit verifies that both fixes survived correctly
into the live screen, and runs the full D7-specific security checklist against the live code.

---

## CRITICAL (must fix before merge)

_None._

All CRITICAL findings from the mockup audit are confirmed fixed in the live screen.

---

## HIGH (fix before v1 launch)

_None new._

### Inherited HIGH-4 (from D7 QA test plan — carry forward)

JWT refresh not handled for scan sync entries. When the background sync worker is built and
processes scan `enqueueOperation` entries, if the access token expires mid-batch, scan upload
requests will receive 401 responses. Without a 401 intercept + silent token refresh in the API
client, the scan entry remains `in_progress` and the queue stalls. Scan files may be cleaned up
between the failed attempt and the retry, causing "file not found" errors on subsequent retries.

**File:** `src/api/apiClient.ts` (to be verified when sync worker is built)
**Risk:** Silent scan upload failure; scan data never reaches server; no feedback to doctor.
**Fix:** Implement 401 intercept + silent token refresh in `apiClient.ts` before sync worker ships.
**Status:** Deferred to sync worker session. Not a new finding — documented in D7 QA test plan HIGH-4.

---

## MEDIUM (fix in next sprint)

### MEDIUM-1 (new): No audit event written for scan record creation

D7 saves a medical document scan to the `scans` table and `sync_queue` but does not write an
audit event to `audit_events`. D6 writes a `visit_created` audit event via `logVisitCreated()`
after `insertLocalVisit()`. The same DPDP §8 obligation applies to scan record creation: the
audit trail for all data written to a patient's record must be preserved.

**File:** `src/screens/doctor/DocumentScannerScreen.tsx`, `handleUseThis` (lines 277–303)
**Risk:** Incomplete DPDP §8 audit trail. Scan records (images, labels) written to a patient's
health record with no audit log entry. If a patient requests a data access report, scan
attachment events will be absent from the audit log.
**Fix:** Add a `logScanCreated()` function to `src/db/visits.ts` (or `src/db/auditLog.ts`
when that module is created for D2 H-3), and call it after `insertVisitScan()` completes
inside the `withTransactionAsync` block:
```tsx
await logScanCreated(db, user.id, patientId, scanId, visitId);
```
Pattern mirrors `logVisitCreated()` in `src/db/visits.ts:294–308`.

---

## LOW (track in backlog)

### LOW-1 (new): `queueOcrAsync` receives absolute path — v2 OCR wiring risk

`queueOcrAsync(absolutePath, visitId)` is called at line 306 with the session-local
`absolutePath`. The stub parameters are prefixed `_localPath` and `_visitId` (unused).
The comment in the stub body correctly states: "The OCR worker reads local_path from
the scans table." However, the parameter signature implies the absolute path would be
used when the function is wired. A v2 developer could reasonably use `_localPath` directly
rather than querying `scans.local_path` and calling `resolveScanPath()`, reintroducing the
KFM-3 path drift vulnerability that CRITICAL-2 closed.

**File:** `src/screens/doctor/DocumentScannerScreen.tsx`, lines 105–108
**Risk:** If v2 OCR implementation uses the passed absolute path instead of reading the
relative path from `scans` table + `resolveScanPath()`, the KFM-3 path drift bug recurs.
**Fix:** Rename the stub parameter from `_localPath` to `_scanId` (the scan DB ID). The OCR
worker should query `scans` by ID, call `resolveScanPath(scan.local_path)`, and process from there.
Add a comment: `// v2: pass scanId, not absolutePath — query scans table + resolveScanPath()`.

---

### LOW-2 (new): `user?.id ?? ''` fallback is dead code that obscures a scoping invariant

`user?.id ?? ''` appears at lines 262, 266, 282, and 287. After the auth guard at line 342
ensures `user` is non-null, these optional-chaining + fallback expressions are unreachable.
If they were ever reached (e.g., via a bug that bypassed the auth guard), `doctorId = ''`
would cause scan images to be stored at `{documentDirectory}/scans/{uuid}.jpg` — the global
scans root — rather than the doctor-scoped directory. The scan would escape the PM REQ 1
scoping guarantee.

**File:** `src/screens/doctor/DocumentScannerScreen.tsx`, lines 262, 266, 282, 287
**Risk:** If auth guard is bypassed (e.g., future refactor moves the guard), scans land in
an unscoped shared directory rather than `<doctorId>/scans/`. Defense-in-depth is absent.
**Fix (preferred):** Assert `user.id` is non-empty at the start of `handleUseThis` before any
path construction:
```tsx
const doctorId = user.id;
if (!doctorId) { setScreenState('error'); return; }
```
Replace `user?.id ?? ''` with `doctorId` throughout `handleUseThis`.

---

### LOW-3 (inherited from mockup, still open): LOW-2 from v1 — sanitizeOcrText non-breaking space

The `/\b\d{4}\s?\d{4}\s?\d{4}\b/g` regex covers single-space and no-space Aadhaar formats.
It does not cover non-breaking space (`\u00A0`), tab, or double-space variants. Low risk for
standard government-printed Aadhaar cards but worth tracking for OCR output from scanned copies.

**File:** `src/screens/doctor/DocumentScannerScreen.tsx`, line 95
**Fix:** Change `\s?` to `[\s\u00A0]*` to cover non-breaking space variants.

---

## D7-Specific Area Results

### 1. Auth Guard — CONFIRMED FIXED (CRITICAL-1 survived)

Auth guard at line 342: `if (!token || !user) return null;`

**Hook call order verified:**
- Line 152: `useSQLiteContext()` — hook 1
- Line 153: `useNavigation()` — hook 2
- Line 154: `useRoute()` — hook 3
- Line 155: `useAuthStore()` token — hook 4
- Line 156: `useAuthStore()` user — hook 5
- Line 160: `useCameraPermissions()` — hook 6
- Lines 162–166: `useState` × 5 — hooks 7–11
- Lines 169–172: `useRef` × 3 — hooks 12–14
- Lines 175–200: `useEffect` — hook 15
- Lines 203–320: `useCallback` × 5 — hooks 16–20
- **Line 342: `if (!token || !user) return null;` — AFTER all 20 hooks** ✅

Pattern matches D2/D3/D6. CRITICAL-1 fix survived into live screen correctly.

---

### 2. Doctor-Scoped Image Storage — PASS

| Check | Evidence | Result |
|---|---|---|
| `relativePath` uses `user.id` from auth store | Line 262: `` `${user?.id ?? ''}/scans/${uuid}.jpg` ``; `user` from `useAuthStore` line 156 | ✅ |
| `absolutePath` never written to SQLite | Line 279: `localPath: relativePath` in `insertVisitScan`; line 296: `image_local_path: relativePath` in payload. `absolutePath` used only for `FileSystem.moveAsync` (line 278) and `deleteAsync` (line 314) | ✅ |
| `resolveScanPath()` is the only reconstruction point | `src/db/scans.ts:36–38`; no other absolute path reconstruction exists in the codebase | ✅ |
| `clearDoctorScans()` called in useLogout | `src/hooks/useLogout.ts:48` | ✅ |
| `clearDoctorScanRecords()` called in useLogout | `src/hooks/useLogout.ts:47` | ✅ |

Logout sequence confirmed:
```
Step 2c: await clearDoctorScanRecords(db, doctorId)   — scans table rows cleared
Step 2d: await clearDoctorScans(doctorId)              — scan image files deleted
```
Both called before `queryClient.clear()` and `clearAuth()` — ordering correct.

---

### 3. Aadhaar Strip — PASS

| Check | Evidence | Result |
|---|---|---|
| `sanitizeOcrText()` present in live screen | Lines 90–96 | ✅ |
| Called at write boundary, not display time | `queueOcrAsync` stub (lines 105–108) documents: "sanitizeOcrText() must be called on the OCR output before any SQLite write." No display-time call exists. | ✅ |
| Word-boundary regex — no false positives on lab numbers | `/\b\d{4}\s?\d{4}\s?\d{4}\b/g` — word boundaries prevent matching mid-number substrings; a 13-digit bank account number has no `\b` after digit 12 and is not matched | ✅ |

HIGH-1 fix from QA (word-boundary regex) confirmed present in live screen. OCR is a deferred
no-op stub in v1 — `sanitizeOcrText()` has no actual call site yet, but its use at the write
boundary is documented in the stub comment for the v2 implementer.

---

### 4. visitId Validation — CONFIRMED FIXED (CRITICAL-2 survived)

Two independent guards confirm:

**Guard 1 — prevents camera from rendering:**
```tsx
// Lines 362–374
if (!visitId || screenState === 'error') {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>No active visit</Text>
      <Text style={styles.errorBody}>Open or create a visit before scanning a document.</Text>
      <TouchableOpacity onPress={() => navigation.goBack()}>...</TouchableOpacity>
    </View>
  );
}
```

**Guard 2 — prevents `handleUseThis` from proceeding even if state is corrupted:**
```tsx
// Line 241
if (isSavingRef.current || !capturedUri || !visitId) return;
```

`visitId` sourced only from `route.params` (line 158); never constructed or modified within the
screen. TypeScript types `visitId` as `string` (non-optional) in `RootStackParamList`, enforcing
non-null at the call site. Both runtime guards cover JavaScript runtime edge cases. ✅

---

### 5. Scans Table Security — PASS

| Check | Evidence | Result |
|---|---|---|
| `doctor_id` column present | `src/db/schema.ts:138`: `doctor_id TEXT NOT NULL` | ✅ |
| No cross-doctor scan reads from query layer | `src/db/scans.ts` has only `insertVisitScan` (INSERT) and `clearDoctorScanRecords` (DELETE WHERE doctor_id = ?). No SELECT queries exist at the D7 layer. | ✅ |
| INSERT only — no UPDATE on scan records | `insertVisitScan` is INSERT-only. No UPDATE statement exists in `scans.ts`. | ✅ |
| DELETE is doctor-scoped (logout only) | `clearDoctorScanRecords` deletes `WHERE doctor_id = ?` — parameterized, doctor-scoped. | ✅ |

Note: `updateVisitScan()` in `src/db/visits.ts:267–282` (the pre-CRITICAL-1-fix function that
overwrote `scan_local_path`) is still present in the codebase but is not called by D7 or any
other screen. It is dead code and should be removed in a future cleanup pass to prevent accidental
reuse.

---

### 6. PII in Logs — PASS

**Zero `console.log` calls** found in `src/screens/doctor/DocumentScannerScreen.tsx` (confirmed
by grep — no matches). No patient name, mobile number, scan path, or visitId in any log output.

Dev-mode file size log (checklist item #56) is not present in the code — it remains a `[DEVICE]`
item to be confirmed during device testing. Since it does not exist yet, there is no PII risk.

---

### 7. Consent Architecture — CORRECT

| Check | Result |
|---|---|
| D7 does not read or display any patient history | ✅ No SQLite reads for patient data. `patientId` nav param used only in `enqueueOperation` payload — a UUID, not PII. |
| D7 only writes to `scans` table and `sync_queue` | ✅ Writes: `FileSystem.moveAsync` (filesystem), `insertVisitScan` (scans table), `enqueueOperation` (sync_queue). No other tables touched. |
| No consent check needed for record creation | ✅ Per `consent-layer-spec.md` table: "Create new visit" and "Create new patient record" are both permitted WITHOUT consent. D7 creates a scan record within an existing visit. Record creation is not consent-gated by design. |

Architecturally correct per `consent-layer-spec.md`. No consent check is needed or appropriate in D7.

---

### 8. Three PM Pre-Flow Requirements — ALL CONFIRMED

**PM REQ 1: Doctor-scoped path + logout cleanup**

Path: `${user.id}/scans/${uuid}.jpg` — doctor-scoped ✅
Logout cleanup:
- `clearDoctorScanRecords(db, doctorId)` at `useLogout.ts:47` ✅
- `clearDoctorScans(doctorId)` at `useLogout.ts:48` ✅

Both called in step 2 of the logout sequence, before React Query cache clear and before `clearAuth()`.
Ordering correct — no race window.

**PM REQ 2: sanitizeOcrText at write boundary**

`sanitizeOcrText()` defined at lines 90–96 with correct word-boundary regex.
Call site documented in `queueOcrAsync` stub — applied to OCR output before SQLite write.
No OCR text is written to SQLite in v1 (OCR deferred) — no Aadhaar strip failure possible.

**PM REQ 3: Full scan → scans table → enqueueOperation path (closes D6 MEDIUM-3)**

```
handleUseThis → withTransactionAsync {
  FileSystem.moveAsync → scans table (insertVisitScan) → sync_queue (enqueueOperation)
}
```

All three writes are atomic within a single `withTransactionAsync`. `entity_local_id` in
`enqueueOperation` is `scanId` (not `visitId`) — one sync queue entry per scan. D6 MEDIUM-3
confirmed closed.

---

## Checklist Status

```
✅  Authentication & Sessions   — Auth guard after all 20 hooks; CRITICAL-1 fix confirmed
✅  Authorisation               — doctor_id from auth store; visitId from nav params only;
                                  no cross-doctor reads in D7 layer
✅  Data Handling               — relative path in SQLite; absolutePath filesystem-only;
                                  sanitizeOcrText defined + documented; zero console.log
✅  Mobile Security             — tap guard via useRef (isSavingRef); doctor-scoped path;
                                  both clearDoctorScans + clearDoctorScanRecords in useLogout
✅  Input Validation            — visitId null checked (two guards); DocTypeSelector uses enum
                                  (no free-text input); ImagePicker restricts to Images media type
✅  Database                    — all queries parameterized; scans.doctor_id NOT NULL;
                                  INSERT-only on scan records; no cross-doctor reads
⚠️  DPDP Compliance             — 3/4 checks passed;
                                  FAIL: no audit event for scan record creation (MEDIUM-1)
```

**Detailed checklist (security-relevant items):**
- [✅] Auth guard: `if (!token || !user) return null` at line 342, after all 20 hooks (CRITICAL-1 ✅)
- [✅] visitId validated non-null before any write — two independent guards (CRITICAL-2 ✅)
- [✅] `doctorId` sourced from `user.id` (auth store) — never from nav params or any client input
- [✅] `relativePath` only stored in SQLite — never `absolutePath`
- [✅] `resolveScanPath()` is the sole reconstruction point
- [✅] `clearDoctorScanRecords(db, doctorId)` in useLogout step 2c
- [✅] `clearDoctorScans(doctorId)` in useLogout step 2d
- [✅] `sanitizeOcrText()` present with `/\b\d{4}\s?\d{4}\s?\d{4}\b/g` (HIGH-1 fix ✅)
- [✅] `sanitizeOcrText()` documented at write boundary in `queueOcrAsync` stub (PM REQ 2)
- [✅] `insertVisitScan()` — one row per scan, no overwrite (CRITICAL-1/QA fix ✅)
- [✅] `FileSystem.moveAsync` inside `withTransactionAsync` (CRITICAL-3/QA fix ✅)
- [✅] `ocr_status: 'deferred'` — accurate for no-op stub (HIGH-2/QA fix ✅)
- [✅] `max_attempts` column in `sync_queue` (HIGH-3/QA fix ✅)
- [✅] Zero `console.log` calls — no PII leakage risk
- [✅] PM REQ 1 confirmed: doctor-scoped path + logout cleanup both wired
- [✅] PM REQ 2 confirmed: sanitizeOcrText defined with correct regex + documented
- [✅] PM REQ 3 confirmed: full scan → scans table → enqueueOperation path atomic
- [✅] D6 MEDIUM-3 closed
- [⚠️] No `record_created` audit event for scan saves (MEDIUM-1 — open)
- [⚠️] `queueOcrAsync` receives absolutePath — v2 OCR wiring risk (LOW-1 — open)
- [⚠️] `user?.id ?? ''` fallback creates theoretical unscoped path if guard bypassed (LOW-2 — open)
- [⚠️] `sanitizeOcrText` regex does not cover non-breaking space (LOW-3 — inherited from v1)
- [⚠️] `updateVisitScan()` dead code still in `src/db/visits.ts` (cleanup — backlog)

---

## OVERALL VERDICT: **CLEAR TO MERGE — no CRITICAL or HIGH findings**

_Signed off 2026-03-05._

### Closed in this session (v2 re-audit):
- CRITICAL-1 (mockup): Auth guard after all hooks ✅ **confirmed in live screen**
- CRITICAL-2 (mockup): visitId non-null guard + ErrorState ✅ **confirmed in live screen**
- PM REQ 1: Doctor-scoped path + clearDoctorScans + clearDoctorScanRecords in useLogout ✅
- PM REQ 2: sanitizeOcrText with word-boundary regex, documented at write boundary ✅
- PM REQ 3: scan → scans table → enqueueOperation, atomic in withTransactionAsync ✅

### New findings (live screen, not in mockup audit):
- MEDIUM-1: No `record_created` audit event for scan saves (DPDP §8 completeness)
- LOW-1: `queueOcrAsync` receives absolutePath — v2 OCR wiring risk
- LOW-2: `user?.id ?? ''` fallback is dead code that obscures a scoping invariant

### Remaining open (carry forward):
- HIGH-4: JWT refresh for scan sync entries — deferred to sync worker session
- LOW-3: sanitizeOcrText regex missing non-breaking space coverage (inherited from v1)
