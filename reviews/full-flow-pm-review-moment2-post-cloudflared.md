# PM REVIEW — Post-Flow: Complete Product (All Flows, Post-Cloudflared Migration)
_Generated: 2026-06-22 | Agent: PM Agent | Moment: 2 (Post-Flow Review)_
_Scope: Full flow D1→D2→D3→D5→D6 + D4/D7/D8/D9 + P1–P5. Triggered by: D1 device test
PASS via cloudflared tunnel (2026-06-22); auth.ts Render.com hardcoded URL fixed._

---

## OVERALL ASSESSMENT: Strong — demo-ready; one infrastructure condition before any independent use

All 14 screens are built, QA-reviewed, security-audited, and device-tested. The
auth.ts fix closes the last known bug (OTP calls were silently routing to the dead
Render.com server rather than the local backend). D1→D2→D3→D5→D6 full flow now
passes end-to-end on device through the cloudflared tunnel.

The flow holds together as a product. A doctor can log in, search a patient,
view history, create a new patient, and file a new visit — all against a live
backend, all verified on physical device.

---

## ADOPTION RISKS

**1. cloudflared dynamic URL — every session requires a fresh start sequence**
Unlike the previous ngrok static domain, cloudflared assigns a new `*.trycloudflare.com`
URL on every tunnel start. `start-demo.sh` sets `EXPO_PUBLIC_API_URL` at Metro
launch time, so the URL is baked in until Metro restarts. If the tunnel URL changes
mid-session (tunnel restart, machine sleep/wake), all API calls fail silently —
login works from local SQLite but OTP, patient lookup, and visit sync stop working.

For developer-present demos where `npm run demo` is run once and left stable: no
impact. For handing the app to anyone else: the tunnel URL must be shared, Metro
must be restarted with the new URL, and the app must be reloaded on device. This
is not a doctor-friendly handoff procedure.

Mitigation: for any session beyond developer-present demos, move to a cloudflared
named tunnel (static subdomain, free) or an always-on cloud VM.

**2. Backend is local-only — unreachable when the developer's machine is off**
Identical to the risk flagged in Moment 3 v2. No change. A doctor or patient who
picks up the app between sessions will find all network-dependent flows broken
(OTP, patient lookup, consent, sync). Offline-first architecture keeps D6 new
visit creation and local search functional, but login itself requires the backend.

Mitigation: always-on cloud backend required before any independent pilot use.

**3. No patient app discovery — unchanged**
After D9 consent OTP, there is no mechanism for the patient to receive the app
link automatically. Clinic staff must share it manually. Low priority for a
developer-only demo; relevant for any real pilot.

---

## REGULATORY OR TRUST RISKS

**1. Cert pinning inactive — unchanged from Moment 3 v2**
`pinnedFetch` falls back to bare `fetch` in Expo Go. TLS is active (cloudflared
provides proper HTTPS — this is why the ngrok switch was necessary: ngrok free tier
was serving a SafeBrowse interstitial that broke TLS). No MITM protection at the
app layer. Accepted for demo use with no real patient data.

No regression. cloudflared is a strict improvement over ngrok free tier for TLS
correctness.

**2. Moment 3 v2 infrastructure section is stale — should be noted**
The Moment 3 v2 review (also 2026-06-22, generated before the cloudflared
migration completed) lists `https://lunchbox-saddled-relock.ngrok-free.dev/v1` as
the backend URL. That URL is defunct. Anyone consulting Moment 3 v2 for the
backend address will get a dead endpoint. The accurate infrastructure record is in
this review and in `docs/project-state.md`.

**3. DPDP Act 2023 / ABDM — no change**
All consent, data handling, and audit events are unchanged. No regulatory regression
introduced by the cloudflared migration or the auth.ts fix.

---

## INFRASTRUCTURE READINESS

- **Backend:** LOCAL — WSL2 PostgreSQL 16 (`medrecord` DB). Start with `npm run demo`. cloudflared assigns a dynamic `*.trycloudflare.com` URL printed on startup; `start-demo.sh` sets `EXPO_PUBLIC_API_URL` automatically before Metro starts.
- **Device testing status:** COMPLETE — all 14 screens (D1–D9 + P1–P5). D1 OTP login PASS via cloudflared (2026-06-22). Integration testing COMPLETE (2026-05-27, 6/7 PASS, 1 SKIP documented). P3 + P5 re-verified against real API (2026-05-30, 4/4 PASS). Zero open bugs across all screens.
- **Auth.ts fix status:** COMPLETE — hardcoded `const BASE_URL = 'https://medrecord-api.onrender.com/v1'` removed. All four OTP functions (`sendOtp`, `verifyOtp`, `verifyPatientOtp`, `refreshAccessToken`) now use `API_BASE_URL` from `apiClient.ts`.
- **Plan to unblock for independent use:** Move backend to an always-on cloud VM (DigitalOcean $4/month droplet or Railway free tier). Configure a named cloudflared tunnel for a static HTTPS subdomain. This is the single action that makes the app usable beyond developer-controlled demos.

---

## ONE THING MOST LIKELY TO CAUSE LOW ADOPTION

The dynamic cloudflared URL requires a manual start sequence before every session
(`npm run demo`, wait for tunnel, Metro reflects new URL, reload app on device).
A doctor given the app to try independently cannot complete this sequence — they
have no way to know the backend URL has changed, Metro is showing the previous
URL, and all OTP calls fail silently with a network error. The app appears broken.

First impression is everything. An app that consistently works when the developer
is present but fails the moment a doctor tries it alone will not get a second
chance.

**The fix is one step:** always-on backend with a static URL.

---

## NEXT STEP OPTIONS

| Option | What it is | When to choose |
|---|---|---|
| **A — Close project** | Archive the repo; declare learning exercise complete | If no pilot or demo sessions are planned |
| **B — Moment 3 v3** | Update the infrastructure checklist (ngrok → cloudflared, dynamic URL); formally supersede Moment 3 v2 | If you want a clean paper trail before archiving |
| **C — Backend migration** | Move backend to always-on cloud (Railway, Render free tier, or $4 DigitalOcean droplet); configure named cloudflared tunnel | If any independent clinic use or demo without the developer present is planned |

For a learning exercise at this stage: **Option A or B** — project purpose is achieved.
For a clinic pilot with any independent users: **Option C first, then Option B**.
