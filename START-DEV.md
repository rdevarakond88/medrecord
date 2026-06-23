# MedRecord — How to Run the App

## Demo command (primary — use this for demos)

```
npm run demo
```

Run this from the project root in WSL. Starts everything: PostgreSQL, backend server, backend ngrok tunnel, Expo tunnel.

After ~15 seconds the terminal prints an Expo URL. Paste it into Expo Go.

---

## Dev command (Expo only — no backend)

```
npm start
```

Use this for frontend-only work. Backend calls will fail.

---

## One-time setup (do this once before first `npm run demo`)

1. Run the database setup commands (only needed once):
   ```
   sudo -u postgres psql -c "CREATE DATABASE medrecord; CREATE USER medrecord_user WITH PASSWORD 'medrecord_local_2026'; GRANT ALL PRIVILEGES ON DATABASE medrecord TO medrecord_user;"
   sudo -u postgres psql medrecord -c "GRANT ALL ON SCHEMA public TO medrecord_user;"
   ```

2. Run migrations to create the schema:
   ```
   cd backend && npx prisma migrate deploy
   ```

3. Seed demo data:
   ```
   cd backend && npm run seed
   ```

4. Claim your free ngrok static domain at ngrok.com → Domains → New Domain.
   Then set it in `backend/.env`:
   ```
   NGROK_DOMAIN=your-domain.ngrok-free.app
   ```

5. Update `src/api/apiClient.ts` line 15 with your static domain:
   ```
   export const API_BASE_URL = 'https://your-domain.ngrok-free.app/v1';
   ```

After that, `npm run demo` is the only command you ever need.

---

## Login credentials

| Role | Mobile number | OTP code |
|---|---|---|
| Doctor | `9999999999` | `000000` |
| Patient (test) | `8888888888` | `000000` |

OTP bypass is active — type `000000` for any OTP prompt.

---

## If the Expo URL doesn't print

```
curl localhost:4040/api/tunnels
```

---

## What `npm run demo` starts

| Service | Where | Port |
|---|---|---|
| PostgreSQL | Local WSL2 | 5432 |
| Backend server | Local WSL2 | 3000 |
| Backend ngrok tunnel | Static domain (never changes) | → 3000 |
| Expo + Metro | Local WSL2 | 8082 |
| Expo ngrok tunnel | Dynamic URL each session | → 8082 |
