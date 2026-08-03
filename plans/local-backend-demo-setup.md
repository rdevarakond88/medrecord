# Local Backend Demo Setup — Plan

**Session date:** 2026-06-22
**Status:** PLANNED — not yet implemented

---

## Why we are doing this

The Render backend has two reliability problems that break demos:

1. **Cold-start delay** — Render's free tier puts the server to sleep when idle.
   First request takes 20–30 seconds. During an interview demo, this looks broken.

2. **90-day database expiry** — Render's free PostgreSQL database gets deleted
   after 90 days of inactivity. When it expires, the app cannot log in at all.
   Fixing it requires manual re-setup and reseeding data.

The goal is to never depend on Render again for demos. The app already works
offline-first (SQLite handles local data). The only thing that requires a live
backend is login (OTP) and the consent flow. Running the backend locally
eliminates both Render failure modes.

---

## What we are changing

| Before | After |
|---|---|
| API endpoint on Render (`medrecord-api.onrender.com`) | Local Node.js backend on laptop |
| PostgreSQL database on Render | Local PostgreSQL on laptop (WSL2) |
| Backend URL changes on expiry | Backend URL is permanent (ngrok static domain) |
| Cold-start delay on first request | Zero delay — always warm |
| 90-day expiry risk | Never expires |

**Nothing changes about the app itself.** OTP screen still shows. Demo credentials
still work (`000000`). All flows (create patient, consent request, patient side) work
the same way.

---

## What the demo setup looks like after implementation

**One-time setup** (done once, never again):
1. Install PostgreSQL locally in WSL2
2. Run Prisma migrations to create the local database schema
3. Seed demo data (realistic patients + visits) into the local database
4. Claim a free ngrok static domain for the backend (ngrok.com — 30 seconds)
5. Update `API_BASE_URL` in `src/api/apiClient.ts` to the static ngrok domain
6. Add `npm run demo` script that starts everything in one command

**Every demo after that:**
1. Open terminal → `npm run demo`
2. Wait ~15 seconds for everything to start
3. Copy the printed Expo URL → paste in Expo Go on iPhone
4. Done

---

## What `npm run demo` will do

In sequence:
1. Start local PostgreSQL (database)
2. Start local backend server (`backend/` directory)
3. Open ngrok tunnel for the backend (static domain — same URL every session)
4. Start Metro + Expo tunnel (existing `npm start` behavior)
5. Print the Expo Go URL clearly

---

## Demo credentials (unchanged)

| Role | Mobile | OTP |
|---|---|---|
| Doctor | `9999999999` | `000000` |
| Patient (test) | `8888888888` | `000000` |
| Any new patient created | whatever number you use | `000000` |

---

## Full demo flow that works

1. Log in as doctor → create new patient → send consent request
2. Log out → log in as patient (patient's mobile + `000000`) → see pending consent → approve
3. Log out → log in as doctor → patient's full record now accessible

All data created during a demo persists in local PostgreSQL. Next demo session,
the data is still there.

---

## Implementation steps (for the Builder Agent session)

When ready to implement, the Builder Agent session needs to:

1. Verify PostgreSQL is installed locally: `sudo apt install postgresql`
2. Configure PostgreSQL to start without password prompt
3. Run `npx prisma migrate deploy` in `backend/` against local DB
4. Run `npm run seed` in `backend/` for demo data
5. Claim ngrok static domain → update `.env` or hardcode in backend ngrok start command
6. Update `API_BASE_URL` in `src/api/apiClient.ts`
7. Write `scripts/start-demo.sh` that chains all four services
8. Add `"demo": "bash scripts/start-demo.sh"` to root `package.json`
9. Update `START-DEV.md` to reflect the new `npm run demo` command
