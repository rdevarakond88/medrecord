---
planStatus:
  planId: plan-next-steps-2026-03-07
  title: MedRecord — Next Steps After D7 Complete
  status: draft
  planType: initiative
  priority: high
  owner: rdeva
  stakeholders: []
  tags: [d4, d6, merge, debt]
  created: "2026-03-07"
  updated: "2026-03-07T00:00:00.000Z"
  progress: 0
---

# MedRecord — Next Steps Plan

## Where We Are

- **D7 (Document Scanner):** Complete. Security audit v3 cleared. Device testing done (95/95 items). Ready for PR to `main`.
- **D2, D3, D6:** Built and on `dev`. Blocked from merging to `main` by open debt items.
- **D4, D5, D1, D8, D9, P1–P5:** Not started.

---

## The Two Paths

There are two independent tracks of work. They can be sequenced but not parallelised (per the one-step-per-session rule).

### Track A — Clear Debt and Merge to `main`

**Goal:** Get D2 + D3 + D6 + D7 onto `main` as a stable, audited baseline.

**Pre-merge blockers (must fix before any merge):**

| ID | Screen | Item | Severity |
|---|---|---|---|
| H-2 | D2 | Certificate pinning not implemented — MITM risk on clinic WiFi | HIGH |
| H-3 | D2 | Offline patient access generates no audit log — zero PII trail | HIGH |
| MEDIUM-1 | D6 | `consentGranted` nav param not re-verified at save time | MEDIUM |
| MEDIUM-4 | D6 | `insertLocalVisit()` + `enqueueOperation()` not in a transaction | MEDIUM |
| MEDIUM-5 | D6 | `getCachedVisits` UNION broken for offline-only patients (NULL `patient_server_id`) | MEDIUM |
| MEDIUM-6 | D6 | No warning before logout when unsynced drafts exist | MEDIUM |
| LOW-1 | D6 | `isSavingRef.current` not reset on success path | LOW |
| LOW-2 | D6 | Future-date visit not validated inside `handleSave()` | LOW |

**Step order (each is a separate session per AGENT_ORCHESTRATION.md):**

1. **Builder session** — Fix D6 MEDIUM-1, 4, 5, 6 + LOW-1, 2 (these are code changes; Builder agent required)
2. **Security re-audit session** — Re-audit D6 after fixes; confirm all MEDIUM/LOW closed
3. **Builder session** — Implement H-3: `audit_events` SQLite table + `logLocalAccess()` in D2
4. **Security re-audit session** — Confirm H-3 closed in D2
5. **Builder session** — Implement H-2: certificate pinning (`react-native-ssl-pinning` or `expo-build-properties` OkHttp interceptor)
6. **Security re-audit session** — Confirm H-2 closed; D2 cleared for merge
7. **Merge PR** — D2 + D3 + D6 + D7 → `main`

> **Note on H-2:** Certificate pinning requires a custom dev client build (not compatible with Expo Go). This may require a separate environment decision before the Builder session starts. Flag this before committing to the session.

---

### Track B — Build D4 (Visit Detail)

**Goal:** Unlock "View Full Visit" button in D3 and complete the Doctor Visit Flow.

**Why D4 next:**
- It unblocks D3 (`navigation.navigate('VisitDetail', ...)` is a TODO stub)
- It completes the core doctor flow: Search → Detail → New Visit → Scan → View Visit
- PM Moment 2 post-flow review cannot be run until D4 is built
- D8 (Full Scan View) and D9 (Consent Flow) depend on D4 being in place

**Step order (full agent pipeline for D4):**

1. **Builder session** — Static mockup of D4 (visit detail: date, doctor, clinic, status badge, records list — scan thumbnail + OCR text / note text, bottom bar: Add Scan, Add Note, Submit Visit)
2. **Persona Critic session** — Score mockup across 5 personas
3. **Builder session** — Apply MUST FIX items from critique
4. **Builder session** — Wire up live screen: `GET /visits/:id/records`, SQLite cache, offline fallback, consent check
5. **Security Agent session** — Full audit of D4 live screen
6. **QA Agent session** — Test plan for D4
7. **Commit + Push session** — Update project-state.md, commit to `dev`

---

## Recommended Sequencing

Given that D7 is the freshest and most complete, the first action is the D7 PR itself. Then:

```
[NOW]     → PR: D7 to main (no new session needed — already cleared)
[Session 1] → Builder: Fix D6 MEDIUM + LOW debt items
[Session 2] → Security: Re-audit D6
[Session 3] → Builder: D2 H-3 (offline audit log)
[Session 4] → Security: Re-audit D2 (H-3 closed?)
[Session 5] → Builder: D2 H-2 (certificate pinning) — confirm build approach first
[Session 6] → Security: Re-audit D2 (H-2 closed?)
[Session 7] → Merge PR: D2 + D3 + D6 to main
[Session 8] → Builder: D4 static mockup
[Session 9+] → Full D4 agent pipeline (Persona → Builder fixes → Wire → Security → QA)
[After D4]  → PM Moment 2: Post-Flow Review (D2+D3+D6+D7+D4 = Doctor Visit Flow complete)
```

---

## Session 1 — D6 Debt Fixes (Builder Agent)

All fixes confirmed by reading the source files. Exact changes:

### MEDIUM-5 — `getCachedVisits` UNION broken for offline-only patients
**File:** `src/db/visits.ts`, line 85
**Change:** The `visits_draft` WHERE clause filters on `patient_server_id = ?` which returns zero rows when `patient_server_id IS NULL` (offline-only patient). Fix: add `OR (patient_server_id IS NULL AND patient_id = ?)` branch.
```sql
-- Before
WHERE patient_server_id = ? AND doctor_id = ?
-- bind: [patientServerId, doctorId]

-- After
WHERE (patient_server_id = ? OR (patient_server_id IS NULL AND patient_id = ?))
  AND doctor_id = ?
-- bind: [patientServerId, patientServerId, doctorId]
-- (caller must pass patientLocalId as the second bind param)
```
Also need to update `getCachedVisits` signature to accept `patientLocalId` alongside `patientServerId`.

### MEDIUM-4 — `insertLocalVisit` + `enqueueOperation` not in a transaction
**File:** `src/screens/doctor/NewVisitScreen.tsx`, `handleSave()` lines 284–315
**Change:** Wrap `insertLocalVisit()`, `logVisitCreated()`, and `enqueueOperation()` in `db.withTransactionAsync()`. If any of the three fails, all three roll back — no orphaned sync queue entry without a matching draft row.

### MEDIUM-1 — `consentGranted` nav param not re-verified at save time
**File:** `src/screens/doctor/NewVisitScreen.tsx`, `handleSave()` before the transaction block
**Change:** Call `getPatientByLocalId(db, patientId)` at the top of `handleSave()`, read `freshConsent = patient?.consent_granted ?? consentGranted`, use `freshConsent` in both `insertLocalVisit()` and the `enqueueOperation` payload. Nav param `consentGranted` is only the initial display signal.

### LOW-2 — Future-date not validated inside `handleSave()`
**File:** `src/screens/doctor/NewVisitScreen.tsx`, `handleSave()` top
**Change:** Add guard: `if (visitDate > todayISO()) { setSaveError('Visit date cannot be in the future.'); isSavingRef.current = false; setIsSaving(false); return; }`

### LOW-1 — `isSavingRef.current` never reset on success path
**File:** `src/screens/doctor/NewVisitScreen.tsx`, `handleSave()` success path (line ~352)
**Change:** Add `isSavingRef.current = false;` immediately before `navigation.goBack()` on the success path. (It is already reset in the `catch` block.)

### MEDIUM-6 — No logout warning when unsynced drafts exist
**File:** `src/hooks/useLogout.ts`
**Change:** Before clearing SQLite, query `visits_draft` for rows with `sync_status = 'pending'` scoped to `doctor_id`. If count > 0, show `Alert.alert()` with the count and require explicit "Discard and Log Out" confirmation before proceeding. If doctor cancels, abort logout.
This requires `useLogout` to accept a navigation context or the Alert must be shown before calling the hook's return function — cleanest approach is a `confirmLogout(db, doctorId)` helper that returns a Promise<boolean> resolving after the Alert choice.

---

## Open Decision Before Starting

**H-2 (Certificate Pinning):** Expo Go does not support custom native modules required for cert pinning. The options are:

- **Option A:** Use `expo-build-properties` + OkHttp interceptor (Android) + NSURLSession delegate (iOS) — requires custom dev client build (`npx expo run:ios` / `npx expo run:android`), not Expo Go
- **Option B:** Use `react-native-ssl-pinning` — same constraint, requires custom dev client
- **Option C:** Defer pinning to a dedicated infrastructure session after all screens are built, and document it as a known pre-launch blocker

This decision affects the sequencing above. **Recommend Option C** — defer pinning to a dedicated session after D4 is built, so it doesn't block screen development. Mark it as a known pre-launch blocker.

If Option C is chosen, Track A steps 5–6 above collapse, and D2 can merge to `main` after H-3 is closed (steps 3–4).
