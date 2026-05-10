# PM Decision — D9 Consent OTP Expiry
**Date:** 2026-05-09
**Type:** Mid-flow PM consultation (unblock QA Agent Step 7)
**Question:** Should consent OTPs expire in 10 minutes or 5 minutes?

---

## Decision

**Consent OTP expiry: 10 minutes. Confirmed.**

Auth OTPs (login) expire in 5 minutes. Consent OTPs are a different type and warrant a longer window.

## Rationale

Consent OTPs are an in-person, synchronous flow — doctor and patient are physically co-located. The full sequence from "doctor taps Request Access" to "patient enters OTP" involves:

1. Server sends SMS to patient's mobile
2. SMS delivery (1–3 min delay common in rural/low-signal areas)
3. Patient locates their phone
4. Patient reads 6 digits aloud or types them on the doctor's device

In a real semi-urban clinic, 5 minutes is unreliably short. A cold-start SMS delivery plus a low-tech-literacy patient finding and reading the SMS can consume 3–4 minutes before the doctor even starts entering the code. Failed consent requests due to expiry — not wrong code — will erode trust and cause the flow to be abandoned.

The security downside of 10 minutes is minimal:
- OTP is delivered to the patient's registered mobile (not guessable by a third party)
- Both parties are physically present — no window for remote interception
- 3-attempt limit and rate limit (10 requests/hour per doctor+patient pair) are unchanged
- OTP is bcrypt-hashed server-side and purged on successful verify

## Contrast With Auth OTPs

Auth OTPs (5 min): The doctor requests the OTP for themselves and is already at their device, ready to act within seconds. A shorter window is appropriate.

Consent OTPs (10 min): A second person (the patient) must receive, locate, and relay the code. The additional 5 minutes accommodates real-world conditions without meaningfully expanding the attack surface.

## Changes Made

1. `docs/security-spec.md` — Added §Consent OTP Security subsection with 10-minute expiry and rationale. Closes H-2.
2. `docs/api-contracts.md` — `expires_in: 600` comment updated from NOTE/placeholder to confirmed value.
3. `mockups/D9ConsentRequestScreen.tsx` — Failure state (Variant 6) already reads "codes are valid for 10 minutes." No change required.

## Next Step

QA Agent — Step 7 — D9 Consent Request Flow. H-2 is now closed. H-3 (no rate-limit exhaustion UI state) remains open — QA Agent should include test cases for rate-limit exhaustion and confirm whether a UI state is needed or whether an error toast is acceptable for v1.
