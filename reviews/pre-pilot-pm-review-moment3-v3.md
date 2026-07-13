# PM REVIEW — Pre-Launch Gate (Moment 3 v3) / Project-Closure Decision
_Generated: 2026-07-04 | Agent: PM Agent | Step: PM Moment 3 — Pre-Launch Gate_
_Delta since v2 review (2026-06-22): backend tunnel switched from cloudflared (dynamic URL, rejected — Backend Agent session 2026-07-04) back to the ngrok free static domain, with the `ngrok-skip-browser-warning` header fix applied (Builder session 2026-07-04) and verified end-to-end on a physical device (Device Tester session 2026-07-04, 1/1 PASS, 0 bugs)._

---

## LAUNCH READY: Yes with conditions

Same standing conditions as v1/v2 (cert pinning inactive — Expo Go only; backend is local-only). The one open item carried forward from v2 — the tunnel URL changing every session — is now closed: the ngrok free static domain never expires and has been verified on-device. Nothing else in the project is blocked. See RECOMMENDATION below for the closure question this session was routed to answer.

---

## HIGHEST FIELD RISK

- **Backend is local-only (WSL2, `npm run demo`)** — unchanged in kind from v2, but the URL-churn problem is resolved: the ngrok static domain (`lunchbox-saddled-relock.ngrok-free.dev`) never expires and was verified end-to-end on device today (doctor login, 0 bugs). The remaining risk is not the URL — it's that the backend only exists while the developer's laptop is running the demo script. That's a hosting decision, made deliberately three times over (Render abandoned for cost/cold-starts, a Cloudflare named tunnel rejected for its paid-domain requirement, ngrok chosen specifically to avoid both costs). Fine for developer-present demos and portfolio walkthroughs; not viable for leaving the app with a clinic to use unattended. Resolving it further means buying always-on hosting — a different project, not a bug fix.

---

## WOULD CAUSE UNINSTALL WITHIN WEEK 1

- D9 consent OTP friction during a 4–7 minute consultation — unchanged from v1/v2, never re-tested with a real (non-test) doctor or patient.
- App shows network errors if the developer's machine isn't running `npm run demo` — unchanged risk, but no longer compounded by a changing tunnel URL each session (fixed domain removes the "share a new QR code every time" failure mode).

---

## INFRASTRUCTURE CHECKLIST

- Backend deployed and reachable: **Yes** — local WSL2 + ngrok free static domain, verified end-to-end on a physical device 2026-07-04 (doctor login via Expo Go, 0 bugs, no `ERR_NGROK_6024`).
- All screens device-tested against live backend: **Yes** — all 14 screens (D1–D9, P1–P5) individually device-tested; full flow D1→D2→D3→D5→D6 re-verified 2026-06-22; D1 login re-verified against the new fixed tunnel 2026-07-04.
- Cert pinning validated in EAS build: **No** — permanently skipped (Step 26, 2026-05-17). Requires an Apple Developer Program membership ($99/yr) the owner chose not to purchase, since this project's purpose is learning agent orchestration, not App Store distribution.
- Test credentials and onboarding flow for pilot clinic: **Yes** — Dr. Test Doctor / `9999999999`, patient Priya Sharma / `8888888888`, OTP bypass `000000`, 30s resend cooldown on D1 + P1.

---

## REGULATORY FLAGS

- **DPDP Act 2023:** All 14 screens handling patient data have been security-audited — zero open CRITICAL/HIGH findings anywhere in the project. Consent is patient-controlled (P4), deletion policy is locked (PII erasure on request, 3yr anonymized retention per MCI guidelines), and no deletion UI exists in v1 by design (support escalation only). Cert pinning being inactive means real patient PII should never be entered — this has held throughout, since only seeded test accounts have been used.
- **ABDM:** No integration in v1, and none is architecturally blocked — mobile-number-as-primary-key and the append-only visit model both map cleanly to ABDM's structure if pursued later. No action required to close.

---

## MARKET REALITY NOTES

- **Low-end Android + 4–7 min consultation window:** Fully addressed by the offline-first architecture — D6 (new visit) and D7 (document scanner) never wait on a network round-trip. Validated by design and device testing, not by a real clinic (no real pilot occurred).
- **Intermittent connectivity in semi-urban areas:** The sync worker (retry, max_attempts guard, failed-visit surfacing) is device-verified and was the single hardest problem in the project — 13 device-test sessions on D3 alone before it held. This is the strongest engineering result to point to from this project.
- **High clinic staff turnover:** No self-serve doctor registration, OTP-only patient login — genuinely low-friction onboarding by design, though untested against a real new staff member.
- The project's remaining gaps are not capability gaps — every one of them (always-on hosting, EAS/cert pinning) is a cost decision the owner made deliberately and documented in the Decisions Made table.

---

## DEFER TO V1.1 (do not delay closure for these)

- Always-on cloud backend — required only if this moves toward a real independent clinic pilot; not required for the project's stated purpose (agent orchestration learning + portfolio artifact).
- EAS build + cert pinning (Apple Developer Program cost).
- Doctor profile screen + account recovery UI.
- Patient self-registration.
- Deletion UI (support-escalation only in v1, per locked decision).
- `logScanViewed` audit event (D8-SA-M1).
- Server-side visit pagination.
- D4-QA-M3 — soft-deleted notes reappear after server refresh (requires a `DELETE /records/:id` endpoint that was never built).
- D3 patient name dimming on idle timeout.

---

## RECOMMENDATION — project-closure decision

This session was routed here specifically to decide whether to close the project. The case for closing now:

- Zero open CRITICAL/HIGH findings anywhere in the codebase — everything of that severity was fixed and re-verified across five agent types.
- Every remaining open item is either accepted v2 debt (explicitly documented as "not fixed — accepted, project completed as a learning exercise" in Known Technical Debt) or a deliberate cost decision already recorded in the Decisions Made table (EAS/cert pinning, always-on hosting).
- The last genuinely open infrastructure question — the tunnel URL changing every session — was resolved and device-verified today.

There is nothing left within the project's actual purpose (agentic-workflow learning + a portfolio artifact demonstrating a full PM→Builder→Security→QA→Device Tester→Backend→Integration pipeline) that another session would meaningfully add. **Recommend closing the project as complete.** If a real clinic pilot is ever pursued, reopen at "always-on backend" — that is the one item that gates it, and it's a hosting decision, not further engineering.
