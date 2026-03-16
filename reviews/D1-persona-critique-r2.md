# Persona Critique R2 — Login / OTP Screen (D1 / P1)
_Re-evaluated: 2026-03-16 | Reviewer: Persona Critic Panel_
_Previous critique: reviews/D1-persona-critique.md (score 3.8/5 — Revise and re-evaluate)_

---

## Context

This is a focused re-evaluation against the 5 items fixed by the Builder between R1 and R2:

| Item | Fix applied | Code location |
|---|---|---|
| MF-1 — Silent OTP-send failure | `setSendError('send_failed')` in catch; error box rendered in `phone_entry` phase | L176–179, L269–275 |
| MF-2 — Auto-dismiss OTP-sent banner | Banner dismissed on first OTP keystroke (`onChangeText`); no setTimeout | L353–354; no auto-dismiss timer |
| MF-3 — Expired OTP + active countdown = dead end | `setCanResend(true)` called immediately on `OTP_EXPIRED`, timer cleared | L196–202 |
| SF-1 — No guidance before OTP step | `inputHint` text added: "We'll send a 6-digit code to this number." | L263–267 |
| SF-2 — Text sizes too small | `inputLabel` 14→16px; `errorText` 13→14px | L539, L632 |

Screen file reviewed: `src/screens/doctor/LoginScreen.tsx` (post-revision).

---

## DR. RAMAKANT SINHA (Reluctant Doctor)
**Score: 4/5** _(unchanged from R1)_

**Re-evaluation of R1 concerns:**
1. ✅ **Silent OTP-send failure (MF-1) — RESOLVED.** Error box now appears: "Couldn't send OTP. Please check your connection and try again." He can distinguish network failure from user error.
2. **Auto-submit on 6th digit — still present.** Not elevated to MUST FIX in R1; remains as-is. The Verify OTP button is also present as a visible fallback, so he is not forced to rely on auto-submit.
3. ✅ **Expired OTP + countdown lock (MF-3) — RESOLVED.** Resend unlocks immediately when OTP_EXPIRED error appears.

**Remaining friction:** Auto-submit still slightly startling first time. Acceptable — the Verify button makes the action model legible even without auto-submit.

**Verdict on R1 change requests:** Both actionable requests (MF-1, MF-3) are closed. Score holds at 4/5.

---

## DR. PRIYA NAIR (Tech-Savvy Doctor)
**Score: 4/5** _(unchanged from R1)_

**Re-evaluation:** No R1 concerns were in her lane — she had no issues with the original flow. The hint text and font size changes don't interfere with her experience. Biometric login and language selector remain nice-to-haves, not blockers.

**Verdict on R1 change requests:** Her requests were explicitly not blockers for the mockup review. Score unchanged.

---

## SUNITA (Balancer / Clinic Staff)
**Score: 4/5** _(unchanged from R1)_

**Re-evaluation of R1 concerns:**
1. ✅ **Silent OTP-send failure (MF-1) — RESOLVED.** She can now tell a confused doctor: "It says couldn't send OTP — check your connection." She has something to point at.
2. ✅ **Expired OTP + countdown (MF-3) — RESOLVED.** No more dead end where she has to explain why the Resend button is grey even after the OTP expired.

**Verdict on R1 change requests:** Both resolved. The practical workflow gaps she raised are closed. Score holds at 4/5.

---

## SHANTABAI (Elderly Patient)
**Score: 4/5** _(raised from 3/5 in R1)_

**Re-evaluation of R1 concerns — one by one:**

1. ✅ **No guidance sentence before Send OTP (SF-1) — RESOLVED.** "We'll send a 6-digit code to this number." now appears directly below the Mobile Number label. She no longer needs to guess what "Send OTP" means.

2. ✅ **Auto-dismiss OTP-sent banner in 4s (MF-2) — RESOLVED.** The banner now persists until she begins typing the OTP. She can read at her own pace and confirm: "yes, that's my number." The `setTimeout` auto-dismiss has been removed.

3. **Auto-submit on 6th digit — still present.** If she miskeys, the form submits before she reviews. This was raised in R1 but not elevated to MUST FIX. Mitigating factors: (a) the Verify OTP button is also present, (b) a wrong submission produces a clear red error box and she can retype, (c) the OTP field clears the error on her first keystroke so she can try again cleanly. The recovery path works; the surprise is the only remaining risk.

4. ✅ **Font sizes too small (SF-2) — RESOLVED.** `inputLabel` is now 16px (was 14px); `errorText` is now 14px (was 13px). These are at comfortable reading size for her basic Android. The OTP input remains 30px (very legible).

**Net change:** Three of four R1 concerns resolved. The one remaining item (auto-submit) has an acceptable recovery path and was not classified as MUST FIX. Shantabai moves from 3/5 → 4/5.

---

## ARJUN (Semi-Savvy Patient)
**Score: 4/5** _(unchanged from R1)_

**Re-evaluation:** No R1 concerns were blockers. The guidance hint is a small positive (more transparency about the OTP mechanism), but he didn't need it. Language selector remains a nice-to-have. No regressions introduced.

**Verdict on R1 change requests:** Language selector remains deferred. Score unchanged.

---

## ─────────────────────────────
## WEIGHTED AVERAGE: 4.0 / 5
_(4 + 4 + 4 + 4 + 4) ÷ 5 — above the 3.5 pass threshold_

| Persona | R1 Score | R2 Score | Delta |
|---|---|---|---|
| Dr. Ramakant Sinha (Reluctant Doctor) | 4/5 | 4/5 | — |
| Dr. Priya Nair (Tech-Savvy Doctor) | 4/5 | 4/5 | — |
| Sunita (Balancer / Staff) | 4/5 | 4/5 | — |
| Shantabai (Elderly Patient) | 3/5 | **4/5** | ▲ +1 |
| Arjun (Semi-Savvy Patient) | 4/5 | 4/5 | — |
| **Weighted Average** | **3.8** | **4.0** | **▲ +0.2** |

---

## MUST FIX
_None._ All three R1 MUST FIX items are closed.

| R1 Item | Status |
|---|---|
| MF-1 — Silent OTP-send failure | ✅ CLOSED (2026-03-16) |
| MF-2 — Auto-dismiss OTP-sent banner | ✅ CLOSED (2026-03-16) |
| MF-3 — Expired OTP + countdown lock | ✅ CLOSED (2026-03-16) |

---

## SHOULD FIX
_One item carries forward from R1:_

**SF-3 — Single OTP input vs. individual digit boxes**
The single field with letter-spacing is functional but the dominant Indian app pattern (PhonePe, bank apps) is individual boxes. Familiarity gap is minor; not a functional failure. Deferred to a future polish pass.
_Flagged by: Dr. Sinha, Shantabai (R1, unchanged)._

_Two R1 SHOULD FIX items are closed:_

| R1 Item | Status |
|---|---|
| SF-1 — No guidance before OTP step | ✅ CLOSED (2026-03-16) |
| SF-2 — Text sizes too small | ✅ CLOSED (2026-03-16) |

---

## NICE TO HAVE
_(Unchanged from R1 — no new items, no closed items)_

- **Language selector at login** — patients who prefer Hindi cannot set language before the OTP flow. Flagged by Arjun.
- **Biometric / remember-device for returning users** — expected by tech-savvy users for v1.1. Flagged by Dr. Nair.
- **Android SMS autofill (D1-M-1)** — tracked by Builder as TODO; no Expo managed-workflow solution as of 2026-03.

---

## BALANCER VERDICT: **Pass — Ship to Security Audit**

The revision pass successfully closed all three MUST FIX items and both actionable SHOULD FIX items. The critical improvement is Shantabai: her score rises from 3/5 to 4/5 because the two barriers that most affected her — the disappearing banner and the absence of guidance text — have been directly addressed. The weighted average moves from 3.8 to 4.0. No persona is below 4/5. The one remaining SHOULD FIX (SF-3, individual digit boxes) is a polish concern that does not cause functional failure for any persona. The screen is ready to proceed to the Security audit step.
