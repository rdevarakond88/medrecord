# Security Audit v2 — D6 New Visit Screen (targeted re-check)

**Scope:** Commit 5466351 — addition of `local_id` to `POST /visits` request body.
**Date:** 2026-03-17
**Auditor:** Security Agent

---

## Files Reviewed

| File | Change in scope |
|---|---|
| `src/api/visits.ts` | `localId: string` added to `CreateVisitRequest`; `local_id: req.localId` added to JSON body |
| `src/screens/doctor/NewVisitScreen.tsx` | `localId: visitLocalId` passed into `createVisit()` call; `visitLocalId` generated via `Crypto.randomUUID()` |
| `src/sync/syncQueue.ts` | `entity_local_id` and payload both carry the same UUID — checked for cross-doctor leakage |
| `docs/api-contracts.md` | POST /visits section — IDOR note on `doctor_id` |

---

## CRITICAL

None.

---

## HIGH

None.

---

## MEDIUM

None.

---

## LOW / Informational

### LI-1 — `local_id` uniqueness is client-enforced, not server-enforced (informational, already documented)

The server is responsible for deduplicating on `local_id` (api-contracts.md states "server must deduplicate on this field"). The client generates a fresh UUID per screen mount, which is correct. However, the server's deduplication guarantee is a backend implementation requirement, not visible in the frontend code. This is not a new gap introduced by commit 5466351 — it was already present and is documented in api-contracts.md with the instruction to the backend developer. **No client-side action required.**

---

## Audit Questions — Findings

### Q1. Is `visitLocalId` generated securely?

`visitLocalId` is generated as `Crypto.randomUUID()` from `expo-crypto` (line 147, `NewVisitScreen.tsx`):

```typescript
const visitLocalId = useRef<string>(Crypto.randomUUID()).current;
```

`expo-crypto`'s `randomUUID()` is backed by the platform's cryptographically secure random number generator (CSPRNG) — `SecRandomCopyBytes` on iOS and `java.security.SecureRandom` on Android. This is the same entropy source as `crypto.randomUUID()` in Node.js and the Web Crypto API. It is appropriate for this purpose.

**Verdict: ACCEPTABLE.** UUID v4 from a CSPRNG is the industry standard for client-side idempotency tokens.

---

### Q2. Does `local_id` contain or leak any PII?

The UUID is generated fresh at screen mount from `Crypto.randomUUID()`. It is a random 128-bit value in standard UUID v4 format (e.g. `f47ac10b-58cc-4372-a567-0e02b2c3d479`). It contains:

- No patient mobile number
- No patient name
- No doctor name or clinic identifier
- No timestamp component (UUID v4 has no ordered timestamp bits, unlike UUID v1/v7)
- No device identifier

**Verdict: No PII. CLEAR.**

---

### Q3. Is the `local_id` value predictable or guessable in a way that creates a security risk?

UUID v4 from a CSPRNG has 122 bits of entropy (6 bits are version/variant flags). The probability of a brute-force collision is astronomically small (1 in ~5.3 × 10^36 per attempt). An attacker cannot:

- Predict the next UUID from previous UUIDs (CSPRNG output is computationally indistinguishable from random)
- Reverse-engineer the UUID to learn anything about the device or user
- Use a crafted UUID to target a specific patient's visit, because the server must also validate that the `patient_id` and `doctor_id` in the request are authorised for the JWT — the UUID alone grants no access

**Verdict: Not predictable. No guessability risk. CLEAR.**

---

### Q4. Does sending `local_id` to the server introduce any new attack surface?

The `local_id` field is used purely for server-side idempotency / deduplication. The api-contracts.md explicitly instructs the backend: "server must deduplicate on this field." The server must not use `local_id` as a lookup key to overwrite another doctor's visit — the deduplication scope must be scoped to the authenticated doctor's own records (i.e. `WHERE local_id = ? AND doctor_id = <jwt_sub>`).

The frontend correctly sends `local_id` as an opaque identifier alongside the `patient_id`, `doctor_id`, and the JWT. The server-side IDOR risk on `doctor_id` was already documented in the original D6 security audit (HIGH-4) and is tracked as a backend implementation requirement with a code comment in `src/api/visits.ts` (lines 73–77). Commit 5466351 does not change the IDOR exposure — it was already present, already flagged, and the TODO comment is already in place.

The new `local_id` field does not introduce any new IDOR surface because:
1. A crafted `local_id` cannot be used to look up or overwrite visits it does not belong to, as long as the server scopes deduplication by doctor identity from the JWT.
2. The client generates a fresh UUID per visit session; it does not reuse or enumerate UUIDs.

**Verdict: No new attack surface introduced. The pre-existing `doctor_id` IDOR risk (HIGH-4) is unchanged and already documented. CLEAR for this change.**

---

### Q5. Is there any risk from `local_id` being stored in the sync queue payload — cross-doctor leakage?

Examining `syncQueue.ts` and `handleSave()` in `NewVisitScreen.tsx`:

- `clearDoctorSyncQueue(db, doctorId)` is called on logout, scoped by `doctor_id` column. This was added as a CRITICAL-2 fix in a prior security audit.
- The `entity_local_id` column in `sync_queue` holds the UUID.
- The payload JSON also carries `localId: visitLocalId` (the same UUID).
- The `doctor_id` column on every sync queue row ensures that on logout all rows for that doctor are purged before a new doctor can log in on the same device.

The `local_id` UUID itself contains no PII (established in Q2 above). Even if a different doctor were to somehow read a sync queue entry from a prior doctor (which would require a logout-without-clear scenario, already protected by `clearDoctorSyncQueue`), the UUID provides no information about the patient or the prior doctor.

**Verdict: No cross-doctor leakage risk from `local_id` in the sync queue. CLEAR.**

---

### Q6. Other concerns from reading the changed code

No additional concerns arise from commit 5466351. The change is minimal and well-contained:
- One interface field added (`localId: string` in `CreateVisitRequest`)
- One JSON key added to the POST body (`local_id: req.localId`)
- One argument threaded through from `handleSave()` (`localId: visitLocalId`)

The existing security envelope (JWT auth, IDOR warning comments, sync queue scoping, PII masking, consent re-read pattern) is fully intact. The change does not touch any storage layer, auth path, consent check, or PII field.

---

## Overall Verdict

**CLEAR**

Commit 5466351 is safe to proceed. The `local_id` addition:
- Uses a cryptographically secure UUID source
- Contains no PII
- Is not predictable or guessable
- Does not introduce any new attack surface beyond the pre-existing `doctor_id` IDOR risk already documented and flagged for the backend
- Does not create cross-doctor leakage in the sync queue

No fixes required. The pre-existing HIGH-4 (`doctor_id` IDOR) remains a backend implementation requirement and is unchanged by this commit.

---

## Checklist Coverage (targeted — only items in scope for this change)

| Check | Result |
|---|---|
| UUID generation uses CSPRNG | PASS — `expo-crypto` `randomUUID()` |
| No PII in `local_id` value | PASS — UUID v4 only |
| No predictability / guessability risk | PASS — 122-bit CSPRNG entropy |
| No new IDOR surface introduced | PASS — pre-existing HIGH-4 unchanged |
| Sync queue `local_id` does not leak cross-doctor | PASS — `clearDoctorSyncQueue()` on logout |
| No new console.log of patient data | PASS — no logging added |
| No Aadhaar or mobile number in changed code | PASS |
