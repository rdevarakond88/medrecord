# PM REVIEW — Pre-Launch Gate (Moment 3 v2)
_Generated: 2026-06-22 | Agent: PM Agent | Step: PM Moment 3 — Pre-Launch Gate_
_Delta since v1 review (2026-05-30): local backend migration complete. Render dependency removed. ngrok static domain wired._

---

## LAUNCH READY: Yes with conditions

Same standing condition as v1 review (cert pinning inactive — Expo Go only), plus one new infrastructure constraint: backend is local-only (WSL2), reachable only while `npm run demo` is running on the developer's machine.

---

## HIGHEST FIELD RISK

- **Backend is local-only (WSL2)** — The `npm run demo` setup means the backend goes offline when the developer's laptop is closed or sleeping. The ngrok static domain never expires, but the tunnel has nothing to point to if the process isn't running. For a demo or proof-of-concept where the developer is physically present and controls the machine: fine. For leaving the app with a clinic to use independently between sessions: the backend will be unreachable. Mitigation: run `npm run demo` before every session where the app will be used. If this moves toward any real pilot with independent users, the backend must move to always-on hosting (a free-tier cloud VM is sufficient).

- **Cert pinning inactive (unchanged from v1 review)** — `pinnedFetch` falls back to bare `fetch` in Expo Go. No MITM protection. Accepted for demo use with no real patient data.

---

## WOULD CAUSE UNINSTALL WITHIN WEEK 1

- Same as v1: consent OTP friction in D9 during a 4–7 minute consultation. Mitigation: solo-doctor pilot.
- **New (local backend):** App shows network errors if the developer's machine is not running. A doctor who tests the app on their own time and finds it broken will not give it a second chance. Pre-flight check (`npm run demo` + live curl) must be part of any handoff protocol before the app is shared.

---

## INFRASTRUCTURE CHECKLIST

- Backend deployed and reachable: **Yes — local WSL2 + ngrok static domain** (`https://lunchbox-saddled-relock.ngrok-free.dev/v1`). Reachable only while `npm run demo` is running on developer's machine.
- All screens device-tested against live backend: **Yes** — all 14 screens (D1–D9 + P1–P5). P3 + P5 re-verified against real API (Step 28b, 4/4 PASS). Integration testing complete: 6/7 PASS, 1 SKIP (documented).
- Cert pinning validated in EAS build: **No** — permanently skipped (Apple Developer Program not purchased). Expo Go only.
- Test credentials and onboarding flow for pilot clinic: **Yes** — Dr. Test Doctor / `9999999999`, patient Priya Sharma / `8888888888`, OTP bypass `000000`. OTP resend (30s cooldown) on D1 + P1. ✅

---

## REGULATORY FLAGS

- **DPDP Act 2023:** All screens handling patient data (D2–D9, P1–P5) have been security-audited. Consent is patient-controlled via P4. Data deletion policy is locked (PII erasure on request; 3yr anonymized clinical retention per MCI guidelines). No deletion UI in v1 — support escalation only. No real patient data should be collected while cert pinning is inactive.
- **ABDM:** No ABDM integration in v1. Architecture does not block future linkage — mobile number as primary key is compatible, and the visit-append model maps cleanly to ABDM's record structure. No action required before pilot.

---

## MARKET REALITY NOTES

- **Low-end Android + 4–7 minute consultation window:** Offline-first architecture handles this — all core flows (D6 new visit, D7 document scanner) work without connectivity and sync in background. Doctor does not wait for a network round-trip during consultation.
- **Intermittent connectivity in semi-urban areas:** Sync worker with retry, max_attempts guard, and failed-visit surfacing is in place. Local backend reduces latency vs. Render (no cold-start, no expiry). However, local backend availability depends on developer machine uptime — a clinic on poor connectivity that also loses backend access during a session has no fallback for D9 consent requests.
- **Staff turnover:** No account creation required for doctors (admin-provisioned). Patients log in via OTP only. No multi-step onboarding. Well-handled for new staff.
- **Doctor trust:** Product quality is not the risk. The risk is that a local backend requiring the developer's laptop to be on is fragile for independent validation. If a doctor tests it on their own time and finds it offline, trust is broken before any real session starts.

---

## DEFER TO V1.1 (do not delay demo/launch for these)

- Always-on cloud backend (free-tier VM) — required before real independent use, not required for developer-present demo
- EAS build + cert pinning (requires Apple Developer Program, $99/year)
- Doctor profile screen + account recovery UI
- Patient self-registration (no value before a doctor records a visit)
- Deletion UI (PII erasure — v1 decision: support escalation only)
- `logScanViewed` audit event (D8-SA-M1, DPDP compliance gap for full audit trail)
- Server-side visit pagination for high-volume patients
- D4-QA-M3 — soft-deleted notes reappear after server refresh (requires DELETE /records/:id backend endpoint)
- D3 patient name dimming on idle timeout (relevant for multi-desk/shared-space clinic)
