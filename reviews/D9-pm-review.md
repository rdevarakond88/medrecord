# PM REVIEW — Pre-Flight: D9 Consent Request Flow
_Date: 2026-05-09_

## PROCEED: Yes with changes

---

## CONCERNS

1. **API contracts are incomplete for D9** — The contracts document `POST /consent` (grant consent) but are missing two required endpoints: `POST /consent/request` (trigger SMS OTP to patient) and `POST /consent/verify-otp` (validate OTP and create grant). Without these, the backend builder has no contract to implement against. These must be added to `docs/api-contracts.md` in the Builder session before any wiring happens.

2. **Sub-flow A (push notification) is undeliverable in v1** — It requires the Patient app (P1–P5), which has not been started. D9 must be designed and built around Sub-flow B (SMS OTP hand-off) as the **primary and only flow for v1**. Sub-flow A should be acknowledged in the UI as "coming soon" at most — do not stub it with dead code that creates false expectations.

3. **The fallback path needs a first-class design state** — The consent spec says when there's no phone nearby, the doctor can still create a new visit (but can't see history). D9 must exit gracefully back to D3 in this case — it should not dead-end. Design this as an explicit "Skip for now" or "Patient not available" exit, not a back-button edge case.

4. **Physical hand-off is a real UX challenge** — The doctor hands their phone to the patient to enter an OTP. The OTP-entry state must be radically simpler than any other screen in the app: large digits, single action, no surrounding context that exposes other patient data. Design the OTP-entry state as if a low-literacy patient is reading it alone in a 10-second window.

---

## REGULATORY FLAGS

1. **DPDP compliance on consent audit** — Every consent grant must produce a `consent_audit_log` entry (see `consent-layer-spec.md`). The Security Agent must verify the audit log write occurs atomically with consent grant — treat this as CRITICAL, not MEDIUM.

2. **OTP is patient identity** — The 6-digit OTP proves the patient controls the registered mobile. Must be time-limited (10 minutes) and single-use, enforced server-side. Security Agent must confirm OTP expiry and invalidation after first use.

---

## MARKET REALITY NOTES

1. **Most v1 patients will not have the app** — Sub-flow B is the 95% case. Design D9 for Sub-flow B first. Sub-flow A is deferred to v2 (requires Patient app).

2. **SMS delivery is not guaranteed** — In rural/semi-urban India, SMS can take 30–90 seconds or fail entirely. D9 must show a "Resend" option after 30 seconds and a clear "SMS not received?" fallback path that exits to the "new visit only" state. A spinner with no exit will cause doctors to abandon the flow.

3. **This is the highest-value unlock in the product** — Consent is what turns MedRecord from a per-doctor notepad into a shared patient record system. The OTP hand-off may feel awkward at first; after two or three uses it becomes second nature. Get this right.

---

## SCREENS IN THIS FLOW

| Screen ID | Name | Notes |
|---|---|---|
| D9 | Consent Request (Sub-flow B: SMS OTP) | States: sending, waiting (with resend), OTP input, success, failure, patient-not-available fallback |

Sub-flow A (push notification) deferred to v2 — Patient app is a prerequisite.

---

## API GAPS (must be added to docs/api-contracts.md before wiring)

| Endpoint | Purpose |
|---|---|
| `POST /consent/request` | Trigger SMS OTP to patient's registered mobile. Request: `{ patient_id }`. Response: `{ request_id, expires_at }`. |
| `POST /consent/verify` | Validate OTP + create consent grant. Request: `{ request_id, otp, doctor_id, scope: "read_all" }`. Response: `{ consent_id, granted_at }`. |

Note: The existing `POST /consent` endpoint does not model the OTP verification step — it appears to be a direct grant endpoint. The Builder must decide whether to extend it or add new endpoints. Document the chosen shape in api-contracts.md before wiring.
