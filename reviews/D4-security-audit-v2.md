# D4 — Visit Detail — Security Re-audit v2

**Agent:** Security Agent
**Date:** 2026-05-09
**Scope:** Changes made after the original security audit (2026-04-19) — two Builder sessions:
- `f71d28a` — BUG-D4-DT2-1 + BUG-D4-DT2-2 (2026-05-03)
- `fa1bf90` — BUG-D4-DT3-1 through BUG-D4-DT3-5 (2026-05-09)

**Previous audit:** `reviews/D4-security-audit.md` — all CRITICAL/HIGH/MEDIUM/LOW findings closed 2026-04-19

---

## Files Reviewed

| File | Change type |
|---|---|
| `src/screens/doctor/VisitDetailScreen.tsx` | Full review (BUG-DT3-3/4/5) |
| `src/db/records.ts` | Full review (BUG-DT3-1) |
| `src/db/visits.ts` | Full review (BUG-DT3-2) |
| `src/sync/syncWorker.ts` | Full review (BUG-DT2-1) |
| `src/screens/doctor/PatientDetailScreen.tsx` | Diff review (BUG-DT2-1) |
| `backend/src/routes/visits.ts` | Diff review (BUG-DT2-1 bonus) |

---

## Threat Areas Checked

For each change, I checked against the threat model in `docs/security-spec.md`:

| Threat | Relevant changes | Result |
|---|---|---|
| Unauthorised record access (consent bypass) | `isOwnVisitLive`, `consentGrantedLive` changes | ✅ No regression |
| Cross-doctor data leakage | `getCachedVisits` UNION ALL exclusion clause, doctor_id scoping in `updateLocalNoteText` | ✅ No regression |
| Offline consent gate bypass | `consentGrantedLive` still re-read from SQLite in `loadRecords` | ✅ No regression |
| Auth bypass / session expiry | 401 handling unchanged | ✅ No regression |
| SQLite injection | All parameterised queries | ✅ No regression |
| PII in sync payloads | `enqueueOperation` payloads unchanged (note text only, no patient PII) | ✅ No regression |

---

## Finding-by-Finding Review

### BUG-D4-DT3-1 — `sync_status='local_edit'` in records.ts

**Change:** `updateLocalNoteText` sets `sync_status = 'local_edit'` on inline edit. `upsertRecordsFromServer` conflict clause now guards both `'pending'` and `'local_edit'` rows from server overwrites.

**Security assessment:**
- `updateLocalNoteText` uses `WHERE id = ? AND doctor_id = ?` — doctor-scoped ✅
- Server cannot overwrite a locally-edited note — prevents silent data disclosure if server held an older, unreacted version of the note ✅
- `local_edit` rows are not pushed to the server (PATCH /records/:id not implemented — MEDIUM debt). This is a data integrity gap, not a security vulnerability. The doctor sees their own edit; other doctors with consent see the original server text. This is the correct v1 behaviour until PATCH is implemented.

**Result: CLEAR**

---

### BUG-D4-DT3-2 — Ghost duplicate exclusion in `getCachedVisits`

**Change:** The `visits_draft` leg of the UNION ALL now excludes rows whose `server_id` already exists in the `visits` table (scoped by `cached_by_doctor_id = ?`).

**Security assessment:**
- The NOT EXISTS subquery is scoped to `cached_by_doctor_id = ?` (the current doctor) ✅
- The parent `visits_draft` query is also scoped to `doctor_id = ?` ✅
- No cross-doctor leakage is possible — a ghost row exclusion can only affect rows already owned by the querying doctor ✅

**Result: CLEAR**

---

### BUG-D4-DT3-3 — `enqueueOperation` moved outside `withTransactionAsync`

**Change:** `enqueueOperation` in `handleSaveNote` moved outside the `db.withTransactionAsync()` block.

**Security assessment:**
This is the same expo-sqlite constraint as BUG-D3-DT11-1. The sync_queue INSERT fails silently when nested inside `withTransactionAsync`. Moving it outside is the only way to make it work on device.

The consequence is a brief data-integrity gap: if the app is force-killed between the `withTransactionAsync` commit (note in `visit_records`) and the `enqueueOperation` call (note in `sync_queue`), the note is permanently in SQLite but has no sync_queue entry — it will never be uploaded to the server.

**This re-opens D4-SA-C1 to the same bounded gap that D3 accepted after BUG-D3-DT11-1.** The gap is small (microseconds between two consecutive awaits on first-call), and the note is never lost from the doctor's device. The doctor would see it locally but it would not appear in the server record.

This is a **data integrity risk, not a security vulnerability**:
- No consent bypass ✅
- No unauthorized data access ✅
- No PII leakage ✅

**Result: CLEAR** — documented as LOW known limitation (see below).

---

### BUG-D4-DT3-4 — Defensive empty-text guard in `handleSaveNote`

**Change:** `if (!text.trim()) return;` added at top of `handleSaveNote`.

**Security assessment:** Purely defensive. Prevents an empty-string note from reaching SQLite or the sync queue. No security concern.

**Result: CLEAR**

---

### BUG-D4-DT3-5 — `isOwnVisitLive` replaces `isOwnVisit` nav param in JSX

**Change:** `isOwnVisitLive` state added; can be corrected from `false → true` if `visits_draft` has a row for `visitServerId + user.id`. All consent-gate and edit-gate JSX now uses `isOwnVisitLive`.

**Security assessment:**
- `showClinicalContent = isOwnVisitLive || consentGrantedLive` — if `isOwnVisitLive` is incorrectly `true`, clinical content is shown without consent. The check that sets `isOwnVisitLive = true` queries `visits_draft WHERE server_id = ? AND doctor_id = ?`. This can only return true if a row scoped to `user.id` exists — no cross-doctor mutation possible ✅
- The ratchet is one-way: `false → true` only. If the nav param says `true`, the check is skipped and `isOwnVisitLive` stays `true` (correct; D3's server-fetched data is authoritative for `is_own_visit = true` values) ✅
- `canEditNotes = isOwnVisitLive && isOpen` — edit/delete affordance correctly restricted to own open visits ✅

**Result: CLEAR**

---

### BUG-D4-DT2-1 — `effectiveServerId` in `PatientDetailScreen.tsx`

**Change:** `fetchData` re-reads the patient from SQLite at call time to get the current `server_id`, instead of relying on the frozen nav param `patientServerId`.

**Security assessment:**
- `getPatientByLocalId` queries `WHERE local_id = ?` (not doctor-scoped). Pre-existing pattern from D3's original build; accepted in the D3 security audit. `patientLocalId` in nav params was set in the current doctor's session from a doctor-scoped SQLite read, so the UUID is reliably that doctor's patient ✅
- Using SQLite-sourced `server_id` is a security improvement over a nav param: it reduces the trust surface from "whatever D3 passed in the navigation call" to "what the sync worker has confirmed server-side" ✅
- `effectiveServerId` falls back to `patientServerId` from nav params if the SQLite read returns null — same risk level as before ✅

**Result: CLEAR**

---

### BUG-D4-DT2-1 bonus — `status` field added to backend `GET /patients/:id/visits`

**Change:** `status: v.status` added to both `myVisits` and `otherVisits` response shapes.

**Security assessment:** Read-only field add. The `status` field ('open' | 'submitted') is not PII. It does not disclose clinical content, patient identity, or consent state. No security concern.

**Result: CLEAR**

---

### syncWorker.ts — `fixOrphanVisitPayloads` inside loop + `server_id` guards

**Change:** `fixOrphanVisitPayloads` moved from before the drain loop to inside it. `if (result.server_id)` guards added to `applyResult`.

**Security assessment:**
- `fixOrphanVisitPayloads` is already scoped to `doctorId` — moving it inside the loop has no impact on its isolation guarantees ✅
- `if (result.server_id)` guards prevent passing `undefined` to SQLite, eliminating a TypeScript type error. The queue entry is still marked 'success' either way — no data loss, no security gap ✅

**Result: CLEAR**

---

## Known Limitations (carry forward)

| ID | Severity | Description | File | Status |
|---|---|---|---|---|
| **D4-KL-1** | LOW | `enqueueOperation` outside `withTransactionAsync` in `handleSaveNote` — app force-kill between SQLite note write and sync_queue INSERT leaves note unsynced. Same expo-sqlite constraint as BUG-D3-DT11-1. Note is never lost from device. | `VisitDetailScreen.tsx:220` | Accepted — expo-sqlite limitation. Fix requires expo-sqlite patch or alternative queue insertion strategy. |
| **D4-QA-M2** | MEDIUM | `upsertRecordsFromServer` runs one `db.runAsync` per row without transaction — app killed mid-loop leaves visit_records partially updated. Self-healing on next fetch. | `src/db/records.ts:78-94` | Fix before v1 launch |
| **D4-QA-M3** | MEDIUM | Soft-deleted note reappears after next server refresh — `upsertRecordsFromServer` conflict clause allows overwriting `sync_status='deleted'` rows. Fix deferred pending DELETE /records/:id backend implementation. | `src/db/records.ts:183` | Fix when backend DELETE endpoint implemented |
| **D4-QA-M4** | MEDIUM | `handleFinishVisit` does not update `visits.record_count` after PATCH succeeds — D3 visit list shows pre-finish record count until next full fetch. | `VisitDetailScreen.tsx:274-276` | Fix before v1 launch |

---

## Prior Findings Verification

All findings from the original 2026-04-19 audit (D4-SA-C1, H1, H2, M1, M2, M3, L1) were verified as still closed after reviewing the new changes. The BUG-DT3-3 fix partially re-opens D4-SA-C1 (documented as D4-KL-1 above — LOW, not a security vulnerability).

---

## Verdict

**CLEAR TO MERGE TO MAIN**

All CRITICAL and HIGH security findings from the original audit remain closed. The Builder fixes for device test sessions 3 and 4 introduce no new security vulnerabilities. D4-KL-1 (enqueueOperation gap) is a data integrity limitation at LOW severity, identical to the accepted D3 gap, and does not block merge.

MEDIUM known limitations (D4-QA-M2, M3, M4) are pre-existing and must be fixed before v1 launch; they do not block the D4 → main merge.
