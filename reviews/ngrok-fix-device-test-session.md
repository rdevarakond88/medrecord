# Device Test — ngrok Free Static Domain Fix (Doctor Login)
_Session date: 2026-07-04_
_Device: iPhone (Expo Go)_
_Tester: rdeva_
_Build: dev branch — commit 5572d95 (ngrok-skip-browser-warning header in pinnedFetch.ts), commit 6a19a8f (start-demo.sh tunnel switch)_

**Scope:** Targeted infra-fix verification, not a full QA test plan run. Confirms the ngrok free-tier browser-warning interstitial (`ERR_NGROK_6024`) fix works end-to-end on a physical device, not just via curl.

---

## Infrastructure Pre-flight

| Check | Result |
|---|---|
| Backend Status (docs/project-state.md) | LOCAL/ngrok fixed domain — confirmed |
| Live curl through tunnel | 200 OK |
| Test credentials | Doctor `9999999999` confirmed |
| OTP bypass | `000000` confirmed with user |

All 4 checks PASSED.

---

## Test Results

| # | Test | Status | Notes |
|---|---|---|---|
| 1 | Doctor login via Expo Go over ngrok fixed domain (`ngrok-skip-browser-warning` header) | ✅ PASS | Logged in with `9999999999` + OTP `000000`; landed on Patient Search (D2) screen. No `ERR_NGROK_6024` interstitial encountered. |

---

## Bug Log

No bugs found.

---

## Session-End Checklist

1. **Bug count:** No bugs found.
2. **Builder handoff decision:** No Builder session needed — clear to merge.
3. **SESSION COMPLETE — Next: PM Agent — Moment 3 v3 / project-closure decision**
