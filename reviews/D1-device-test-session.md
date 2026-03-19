# D1 Device Testing Session — Login / OTP
_Session date: 2026-03-17 (resumed 2026-03-18, resumed 2026-03-19)_
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
| 1 | First launch — no credentials, full OTP login flow | ✅ PASS | OTP sent, `000000` accepted, navigated to PatientSearch |
| 2 | Session restoration — returning user cold-start | ✅ PASS | Force-quit + reopen → landed directly on PatientSearch, no re-login |
| 3 | Manual "Verify OTP" tap + double-submit guard | ✅ PASS | Reinstalled Expo Go → session restored to PatientSearch (Keychain persists); no double-nav or crash |
| 4 | WhatsApp fallback after 45-second countdown | ✅ PASS | Countdown expired → WhatsApp button appeared → tapped → green banner "OTP sent to ...9999" → entered `000000` → landed on PatientSearch |
| 5 | Change number — state cleanup | ✅ PASS | Profile tab → Logout → returned to Login screen cleanly |

### Offline Scenarios

| # | Test | Status | Notes |
|---|---|---|---|
| 6 | No connectivity at phone entry — NetInfo pre-check | ✅ PASS | Airplane Mode on → entered `9999999999` → tapped Send OTP → red banner "no internet connection, please check and retry" |
| 7 | Connectivity drops between send and verify — M-1 regression | ✅ PASS | OTP sent with connectivity → Airplane Mode on → entered `000000` → red banner "no internet connection, please check and retry" — no crash |
| 8 | D1-SA2-H-1 regression — network error preserves refresh token | ⬜ SKIP | Could not complete — `9999999999` rate limited mid-test; alternative number showed NetInfo false-negative (BUG-D1-DT-4). Core assertion partially covered by test 7. |
| 9 | Expired/revoked refresh token | ⬜ SKIP | Requires test env with short TTL or server-side revocation |

### Error Scenarios

| # | Test | Status | Notes |
|---|---|---|---|
| 10 | Wrong OTP | ✅ PASS | Entered `111111` on a non-test number → red banner "incorrect OTP" |
| 11 | OTP expired (server returns OTP_EXPIRED) | ⬜ SKIP | Requires waiting 5+ min or test env with short OTP TTL |
| 12 | Three wrong attempts → TOO_MANY_ATTEMPTS | ❌ FAIL | BUG-D1-DT-3: after 3 wrong OTPs, app shows generic "incorrect OTP" banner instead of distinct TOO_MANY_ATTEMPTS message |
| 13 | Rate-limited send (429) | ⬜ SKIP | Requires 5+ sends; risky on real number |
| 14 | Invalid mobile prefix (0–5) | ✅ PASS | Input validation blocks entry of numbers starting with 0–5 at keyboard level |

### Cold-Start Edge Cases

| # | Test | Status | Notes |
|---|---|---|---|
| 15 | USER_PROFILE_KEY absent after upgrade | ⬜ SKIP | Requires manual SecureStore key deletion |
| 16 | Cold-start with no keys (fresh install / post-logout) | ✅ PASS | Covered by test 1 — app landed on Login screen after SecureStore cleared |

### State & Navigation Tests

| # | Test | Status | Notes |
|---|---|---|---|
| 17 | Double-tap "Resend OTP" — M-2 regression | ✅ PASS | Double-tapped Resend after countdown expired → only one green banner — double-tap guard working |
| 18 | App backgrounded during verify call | ⬜ PENDING | Could not run — `9999999999` rate limited; needs re-run in fresh session |
| 19 | App backgrounded during countdown | ⬜ PENDING | Could not run — `9999999999` rate limited; needs re-run in fresh session |
| 20 | Screen rotation during OTP entry | ✅ PASS | App does not rotate — locked to portrait orientation (intentional for medical app) |

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
| ✅ PASS | 11 |
| ❌ FAIL | 1 |
| ⬜ PENDING | 2 |
| ⏭ SKIP | 11 |

**Tests 1–8, 10, 14, 16, 17, 20 — resolved this session.** 1 FAIL (BUG-D1-DT-3). Tests 18 and 19 pending — need fresh session once `9999999999` rate limit clears.

---

## Bugs Found

| ID | Severity | File | Description |
|---|---|---|---|
| BUG-D1-DT-1 | **BLOCKER** | `src/api/auth.ts:20` | `BASE_URL` hardcoded to dead domain `api.medrecord.in` — must be `medrecord-api.onrender.com/v1`. All OTP calls fail. **FIXED 2026-03-18 — Builder Agent Step 9.** |
| BUG-D1-DT-2 | **BLOCKER** | `App.tsx` / no logout screen | No logout mechanism exists anywhere in the app. iOS Keychain persists SecureStore data across Expo Go reinstalls — there is no way to clear the session and reach the Login screen. Tests 4–8, 10, 12, 14, 17–20 cannot be run. **FIXED 2026-03-18 — Builder Agent Step 9.** |
| BUG-D1-DT-3 | **MEDIUM** | OTP verify error handling | After 3 wrong OTP attempts, app shows generic "incorrect OTP" banner instead of a distinct TOO_MANY_ATTEMPTS error message. User has no indication they are locked out or need to request a new OTP. Needs Builder fix. |
| BUG-D1-DT-4 | **LOW** | NetInfo pre-check | NetInfo pre-check intermittently reports no connectivity despite active internet connection. Seen twice during 2026-03-19 session — both times after transitioning from Airplane Mode back to connected. Likely a timing issue (NetInfo takes 2–3s to detect reconnection). |

---

## Session Notes

**2026-03-17 — Pre-test fix:** `pinnedFetch.ts` updated to fall back to standard `fetch` when
`react-native-ssl-pinning` native module is unavailable (Expo Go). Bundling error resolved.
Cert pinning remains deferred to EAS custom dev client (UE-6 — unchanged).

**2026-03-18 — Device test attempt:** Test 1 blocked immediately by BUG-D1-DT-1. Backend health
confirmed live (`/v1/health` → 200). `curl` against live backend with correct fields succeeds.
Root cause: `auth.ts` has its own `BASE_URL = 'https://api.medrecord.in/v1'` which was never
updated when `apiClient.ts` was fixed on 2026-03-18. All OTP tests blocked until Builder fixes
`auth.ts:20`. Device testing session suspended — resume after Builder fix.

**2026-03-19 — Session resumed after BUG-D1-DT-1 and BUG-D1-DT-2 fixes.** Tests 4–8, 10, 12,
14, 17–20 re-run. 11 tests now PASS. BUG-D1-DT-3 found (generic error on TOO_MANY_ATTEMPTS).
BUG-D1-DT-4 noted (NetInfo intermittent false-negative after Airplane Mode toggle). Tests 18
and 19 could not run due to rate limiting on `9999999999` — deferred to next session.
