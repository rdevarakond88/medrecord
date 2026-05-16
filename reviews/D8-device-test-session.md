# Device Test Session — D8 Full Scan View

_Session date: 2026-05-16_
_Tester: Device Tester Agent_
_QA plan: reviews/D8-qa-test-plan.md_
_Builder fixes applied: commit bf5982a (D8-QA-H1, D8-QA-M1, D8-QA-M2, D8-SA-M1 all fixed)_

---

## Pre-Flight Checklist

| Check | Result |
|---|---|
| Backend health (`curl --max-time 60`) | ✅ HTTP 200 — 2026-05-16 |
| Test credentials (Dr. Test Doctor, 9999999999, OTP 000000) | ✅ confirmed |
| Test mobile number | ✅ 9999999999 |
| Local scan prerequisite | ❌ BLOCKED — see D8-DT-H1 below |

---

## Test Results

All tests SKIPPED — D8 is unreachable. See D8-DT-H1.

| # | Test | Result | Notes |
|---|---|---|---|
| 1 | Login → D2 → patient → D3 | PASS | User confirmed at D2 |
| 2 | D4 has scan record with "View full image →" | BLOCKED | D8-DT-H1: scan rows never appear in D4 |
| 3–33 | All remaining tests | SKIPPED | D8 unreachable; prerequisite failed |

---

## Bugs Found

### D8-DT-H1 — HIGH: D8 is unreachable — D4 never shows scan record rows for locally-created visits

**Severity:** HIGH (blocks all D8 device testing)

**Summary:**
D4 (Visit Detail) displays scan record rows by reading from server-synced `visit_records` only
(`src/screens/doctor/VisitDetailScreen.tsx:380 — records.filter(r => r.type === 'scan')`).
When a doctor creates a visit in D6 with a scan attached via D7, the scan is written to the
local `scans` table (keyed by `visit_local_id`). However, **the scan data is never sent to the
server** — the `createVisit` API payload in `NewVisitScreen.tsx:361-369` contains only:
`localId`, `patientId`, `doctorId`, `visitDate`, `chiefComplaint`, `noteText`, `consentGranted`.
No scan data is included. (S3 image upload is deferred to v2 per project decisions.)

Because the server never receives scan data, it never creates a `visit_records` row of
type `'scan'`. When D4 fetches records from the server, no scan rows are returned. The
`scanRecords` array is always empty. The "View full image →" button is never rendered.
D8 is therefore completely unreachable via the normal app flow.

Note: the `getScansForServerVisit()` function in `src/db/scans.ts` (called at
`VisitDetailScreen.tsx:293`) is correctly implemented — it CAN find local scans for a
server-synced visit via the `visits_draft` join. The gap is upstream: no scan row ever
appears in D4 to trigger the call.

**Reproduction steps:**
1. Login → D2 → select any patient → D3
2. Tap "+ New Visit" → D6 → add chief complaint → tap "Add a Scan" → D7
3. Pick an image from Photo Library → D7 saves scan to `scans` table
4. Return to D6 → Save → visit syncs to server
5. Back on D3 — visit now shows as synced (not draft) — tap "View Full Visit" → D4 opens
6. D4 shows: date, chief complaint, doctor, clinic, status. No scan row. No "View full image →".

**Fix required (Builder session):**
D4 must be updated to also read local scan records from the `scans` table and merge them
into its `records` state for display. Suggested approach:

After the server records are loaded/cached, query `getScansForServerVisit(db, visitServerId, user.id)`
and synthesize `LocalRecord` entries of type `'scan'` for each result. Merge these into `records`
so the existing `scanRecords` filter and `ScanRecordRow` rendering picks them up naturally.

`handleViewScan` is already correctly wired — it will work once a scan row exists to tap.

**Code locations:**
- `src/screens/doctor/VisitDetailScreen.tsx:101` — `records` state (needs local scans merged in)
- `src/screens/doctor/VisitDetailScreen.tsx:133-159` — records loading block (merge point)
- `src/screens/doctor/VisitDetailScreen.tsx:380` — `scanRecords` filter (unchanged — will work once records has scan entries)
- `src/screens/doctor/NewVisitScreen.tsx:361` — `createVisit` call (does NOT send scan data — by design for v1; fix is on D4 side, not here)
- `src/db/scans.ts:100-118` — `getScansForServerVisit` (correctly implemented, just never called for display)

---

## Session Summary

**D8 device testing BLOCKED after pre-flight + test #1 (Login path).**

**Bug count: 1 bug found — D8-DT-H1 (HIGH)**

**Builder Agent session required before device testing can resume.**
Items: D8-DT-H1 — D4 must be updated to show local scan rows from the `scans` table.

---

**SESSION COMPLETE — Next: Builder Agent — fix D8-DT-H1 (D4 local scan rows) — then re-run Device Test D8**
