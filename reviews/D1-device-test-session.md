# D1 Device Testing Session — Login / OTP
_Session date: 2026-03-17_
_Device: iPhone (Expo Go)_
_Tester: rdeva_
_Build: dev branch — all QA pre-v1 bugs closed (M-1, M-2, M-3 fixed 2026-03-16)_

**Note:** Cert pinning (test 25) is NOT testable in Expo Go — deferred to EAS custom dev client.
Tests 9, 15 require manual SecureStore manipulation — may need special tooling.
Tests 21–24 require querying SQLite audit_events table — skip for Expo Go device test; cover in integration test.

---

## Test Results

### Happy Path

| # | Test | Status | Notes |
|---|---|---|---|
| 1 | First launch — no credentials, full OTP login flow | ⬜ PENDING | |
| 2 | Session restoration — returning user cold-start | ⬜ PENDING | |
| 3 | Manual "Verify OTP" tap + double-submit guard | ⬜ PENDING | |
| 4 | WhatsApp fallback after 45-second countdown | ⬜ PENDING | |
| 5 | Change number — state cleanup | ⬜ PENDING | |

### Offline Scenarios

| # | Test | Status | Notes |
|---|---|---|---|
| 6 | No connectivity at phone entry — NetInfo pre-check | ⬜ PENDING | |
| 7 | Connectivity drops between send and verify — M-1 regression | ⬜ PENDING | Expected: distinct "No internet" message (bug fixed) |
| 8 | D1-SA2-H-1 regression — network error preserves refresh token | ⬜ PENDING | |
| 9 | Expired/revoked refresh token | ⬜ SKIP | Requires test env with short TTL or server-side revocation |

### Error Scenarios

| # | Test | Status | Notes |
|---|---|---|---|
| 10 | Wrong OTP | ⬜ PENDING | |
| 11 | OTP expired (server returns OTP_EXPIRED) | ⬜ SKIP | Requires waiting 5+ min or test env with short OTP TTL |
| 12 | Three wrong attempts → TOO_MANY_ATTEMPTS | ⬜ PENDING | |
| 13 | Rate-limited send (429) | ⬜ SKIP | Requires 5+ sends; risky on real number |
| 14 | Invalid mobile prefix (0–5) | ⬜ PENDING | |

### Cold-Start Edge Cases

| # | Test | Status | Notes |
|---|---|---|---|
| 15 | USER_PROFILE_KEY absent after upgrade | ⬜ SKIP | Requires manual SecureStore key deletion |
| 16 | Cold-start with no keys (fresh install / post-logout) | ⬜ PENDING | Covered by test 1 |

### State & Navigation Tests

| # | Test | Status | Notes |
|---|---|---|---|
| 17 | Double-tap "Resend OTP" — M-2 regression | ⬜ PENDING | Expected: second tap is no-op (bug fixed) |
| 18 | App backgrounded during verify call | ⬜ PENDING | |
| 19 | App backgrounded during countdown | ⬜ PENDING | |
| 20 | Screen rotation during OTP entry | ⬜ PENDING | |

### Audit Events (SQLite)

| # | Test | Status | Notes |
|---|---|---|---|
| 21 | login_success audit event (F-9) | ⬜ SKIP | SQLite not queryable in Expo Go |
| 22 | login_failure audit event (F-9) | ⬜ SKIP | SQLite not queryable in Expo Go |
| 23 | login_failure on network error (F-9) | ⬜ SKIP | SQLite not queryable in Expo Go |
| 24 | Cold-start audit gap (D1-SA2-M-1 — accepted) | ⬜ SKIP | SQLite not queryable in Expo Go |

### Cert Pinning

| # | Test | Status | Notes |
|---|---|---|---|
| 25 | Cert pinning — Expo Go | ⬜ SKIP | Not testable in Expo Go — deferred to EAS custom dev client |

---

## Summary

| Outcome | Count |
|---|---|
| ✅ PASS | 0 |
| ❌ FAIL | 0 |
| ⬜ PENDING | 13 |
| ⏭ SKIP | 9 |

**Runnable tests this session: 13** (tests 1–3, 4–8, 10, 12, 14, 17–20)

---

## Session Notes

**2026-03-17 — Pre-test fix:** `pinnedFetch.ts` updated to fall back to standard `fetch` when
`react-native-ssl-pinning` native module is unavailable (Expo Go). Bundling error resolved.
Cert pinning remains deferred to EAS custom dev client (UE-6 — unchanged).
