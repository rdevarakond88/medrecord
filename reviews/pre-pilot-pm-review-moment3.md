# PM REVIEW — Pre-Launch Gate (Moment 3)
_Generated: 2026-05-30 | Agent: PM Agent | Moment: 3 (Pre-Launch Gate)_
_Scope: Post-completion fixes — 20 commits since PR #5 (2026-05-16)_

---

## LAUNCH READY: Yes — with one standing condition (cert pinning, unchanged from Moment 2)

---

## WHAT IS IN THIS MERGE

**Functional fixes (material — these were bugs in main):**
- P3 (Visit Record Detail) + P5 (Patient Profile) wired to real API — both were running on mock data in main. Orange demo switcher buttons visible. Device-verified 4/4 PASS (Step 28b).
- Integration bugs BUG-IT-1 through BUG-IT-4 fixed and verified: doctor-created patients now reachable via OTP, visits appear in patient timeline, consent revoke in P4 propagates to D3, pinnedFetch Expo Go guard added.

**Pre-pilot requirements (all complete):**
- OTP resend with 30s cooldown — D1 + P1. If SMS doesn't arrive, user has a path.
- Backend mobile immutability guard — PATCH /patient/profile returns HTTP 400 MOBILE_IMMUTABLE. Security re-check passed (Step 28e, CLEAR TO MERGE).

**Docs only (no functional impact):**
- Mistakes 14–18 documented in LESSONS-AND-RUNBOOK.md.
- PM decisions for sign-up, deletion, recovery (Step 28c) locked.
- EAS build permanently closed (Step 26).

---

## HIGHEST FIELD RISK

**Cert pinning inactive — same as Moment 2, now formally accepted.**

All device testing and pilot deployment will use Expo Go. `pinnedFetch` silently falls back to bare `fetch` in Expo Go — no MITM protection on shared clinic WiFi.

This was flagged as a pre-pilot blocker in Moment 2. Since then: Apple Developer Program membership ($99/year) was explicitly declined. The project's purpose is learning agent orchestration, not a production App Store distribution. The risk is accepted and documented.

**Standing condition before real patient data:** Cert pinning must be validated in an EAS build before real patient records are created. For a practice run or demo with no real patient data, Expo Go is acceptable.

---

## WOULD CAUSE UNINSTALL WITHIN WEEK 1

Unchanged from Moment 2: consent OTP friction in D9 during a 4–7 minute consultation. Not introduced by this merge. Mitigation: solo-doctor clinic for first pilot.

---

## INFRASTRUCTURE CHECKLIST

- **Backend deployed and reachable:** Yes — `https://medrecord-api.onrender.com/v1`, HTTP 200 confirmed 2026-05-16. Cold-starts ~20–30s; use 60s timeout on pre-flight curl.
- **All screens device-tested against live backend:** Yes — all 14 screens (D1–D9 + P1–P5) device-tested. P3 + P5 re-verified against real API in Step 28b (4/4 PASS).
- **Integration scenarios verified:** 6/7 PASS, 1 SKIP (Scenario 5 — async deny path not reachable via synchronous D9 OTP, documented, not a blocker).
- **Cert pinning validated in EAS build:** No — permanently skipped. Expo Go only.
- **Test credentials:** Doctor `9999999999`, patient `8888888888`, OTP bypass `000000` ✅.
- **OTP resend on all OTP screens:** Yes — D1 + P1 both have 30s cooldown resend button ✅.

---

## DEFER TO V1.1 (do not delay launch for these)

- EAS build + cert pinning — requires Apple Developer Program ($99/year)
- Doctor profile screen + self-serve account recovery flow
- Patient self-registration (no value until doctor has recorded a visit)
- Deletion UI (PII erasure + anonymized clinical record retention)
- "Share app with patient via WhatsApp" on D9 post-consent screen
- `logScanViewed` audit event (D8-SA-M1, DPDP compliance gap)
- Server-side visit pagination for high-volume patients
- Soft-deleted notes reappear after server refresh (D4-QA-M3 — requires DELETE /records/:id backend)
- D3 patient name dimming on idle timeout (before multi-desk/shared-space clinic)

---

## MERGE RECOMMENDATION: PROCEED — merge dev → main

No new adoption risks, regulatory risks, or open bugs introduced since PR #5. The functional fixes (P3/P5 real API, integration bugs) make main materially more correct than before. Pre-pilot requirements are complete.

Create PR: dev → main.
