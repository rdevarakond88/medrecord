# PM REVIEW — Post-Flow: Doctor Visit Flow (D2, D3, D6, D7)

**Date:** 2026-03-28
**Agent:** PM Agent — Moment 2 v2 (updated post-flow review)
**Scope:** Status update from 2026-03-13 v1 review. D6 device testing now complete. Sync worker shipped and security-hardened. D1 QA complete.

---

## OVERALL ASSESSMENT: Needs work — specifically D3 device testing and D1 device testing before any pilot

Significant progress since the 2026-03-13 review. D6 and D7 are both device tested with zero open blocking bugs — clear to merge to main now. Sync worker is built and all three HIGH security findings are closed. D1 auth is built and QA-reviewed. The structural foundation is sound. What remains is two device testing sessions (D3, D1) and three screens that complete the core loop (D5, D4, D9).

---

## MERGE READINESS (immediate question)

| Screen | Device Tested | Open Blockers | Merge to main |
|---|---|---|---|
| D7 — Document Scanner | Yes (2026-03-06) | 3 LOW (defer to v1.1) | **CLEAR** |
| D6 — New Visit | Yes (2026-03-28, 0 bugs) | SW-M-2 (sync worker, low risk) | **CLEAR** |
| D2 — Patient Search | Yes (2026-02-22) | Several MEDIUM (debt only) | **CLEAR** |
| D3 — Patient Detail | **NO** | No device testing done | **BLOCKED — must device test first** |
| D1 — Login / OTP | **NO** | No device testing done | **BLOCKED — must device test first** |

D7, D6, D2 can be merged to main now. D3 and D1 must be device tested before their merge.

---

## ADOPTION RISKS

**1. D3 has never been device tested.**
This is the most consent-sensitive screen in the flow — it enforces the two-list API, consent gating, loading skeleton, offline fallback, and the `useFocusEffect` on D9 return. All of that is unverified on a real device. A consent-gate failure in the field (wrong visits shown) is a data breach, not a UX bug. Fix: D3 device testing is the next mandatory session.

**2. D1 device testing still pending.**
The OTP auth screen is built and QA-reviewed. But actual SMS delivery, the bypass-code path, and the navigation-to-D2 handoff have not been confirmed on a real device against the live backend. Without this, any pilot is running on fake tokens — not a trustworthy state. Fix: D1 device testing immediately after D3.

**3. New patient flow still broken.**
"Add New Patient" from D2 hits a stub. D5 is required before any clinic pilot with real new-patient volume. Minimum viable D5: mobile + name only, Aadhaar optional with hash-at-boundary. Fix: build D5 after D1 and D3 device testing are done.

**4. Visit content still inaccessible from D3.**
"View Full Visit" is a disabled stub. A doctor who opens D3 expecting to read a prior visit note hits a dead end. This undermines the core value proposition — history is listed but not readable. Fix: D4 is required before pilot credibility.

---

## REGULATORY OR TRUST RISKS

**1. SW-M-2: `hasResetInProgress` not reset on doctor change.**
If Doctor A logs out and Doctor B logs in within the same app process lifetime, the startup cleanup that resets orphaned `in_progress` sync entries does not run for Doctor B's first sync session. Low probability but non-zero on a shared clinic device. If a visit is stuck `in_progress` from Doctor A's unfinished sync, Doctor B's data silently skips retrying those items. Not a data breach, but a silent sync failure on a shared device — the scenario this app is built for. Fix before pilot.

**2. D7 LOW-1: `queueOcrAsync` receives absolutePath.**
When OCR is wired in v2, this is a path-drift landmine — developer may bypass `resolveScanPath()`. No action required before v1 launch, but document it clearly before the OCR sprint begins.

**3. D2 MEDIUM: Full mobile numbers displayed in PatientRow.**
PII visible to bystanders in shared clinic spaces. This has been open since the persona critique. Acceptable for dev testing; not acceptable for a real clinic pilot. Fix before pilot.

---

## INFRASTRUCTURE READINESS

- **Backend:** Deployed at `https://medrecord-api.onrender.com/v1` — health check returns 200 ✅
- **Sync worker:** Built and security-hardened (all 3 HIGH findings closed). SW-M-2 and SW-L-2 remain open (medium/low priority).
- **Device testing status:**
  - D6: COMPLETE ✅ — zero bugs
  - D7: COMPLETE ✅ — zero bugs
  - D2: COMPLETE ✅ (2026-02-22)
  - D3: **NOT DONE — BLOCKED for merge**
  - D1: **NOT DONE — BLOCKED for merge**
- **Next device testing sessions required:** D3 first (consent-sensitive), then D1 (auth path)

---

## ONE THING MOST LIKELY TO CAUSE LOW ADOPTION

**D3 unverified on device.** The consent-gating logic in D3 is the most complex piece of the app — server-side two-list API, loading skeleton, offline fallback with SQLite, `useFocusEffect` on D9 return. It has passed security audit and QA test plan but has never been run on a real device against the live backend. A single consent-gate failure during a clinic pilot — a doctor seeing another doctor's chief complaints — ends the pilot. Verify it before any real data touches the app.

---

## RECOMMENDED NEXT SESSION ORDER

| Priority | Session | Reason |
|---|---|---|
| 1 | D3 device testing (Step 8) | Consent screen unverified — highest risk |
| 2 | D1 device testing (Step 8) | OTP auth unverified — pilot requires real auth |
| 3 | D5 build (Steps 2–10) | New patient flow broken; needed for any pilot |
| 4 | D4 build (Steps 2–10) | Visit detail — unlocks D3's core value |
| 5 | D9 build (Steps 2–10) | Consent request — unlocks multi-doctor use |
| — | Merge D6 + D7 + D2 to main | All three clear now; do not wait |
