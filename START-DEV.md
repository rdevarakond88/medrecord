# MedRecord — How to Run the App

## Command

```
npm start
```

Run this from the project root in WSL. That is the only command.

---

## What to do with the URL

After ~15 seconds the terminal prints a URL like:

```
exp://xxxx-anonymous-8082.exp.direct
```

1. Open **Expo Go** on iPhone
2. Tap **Enter URL manually**
3. Paste the URL
4. App loads

---

## Login credentials

| Role | Mobile number | OTP code |
|---|---|---|
| Doctor | `9999999999` | `000000` |
| Patient (test) | `8888888888` | `000000` |

OTP bypass is already active — type `000000` for any OTP prompt.

---

## If the URL doesn't print

Run this to check the tunnel:

```
curl localhost:4040/api/tunnels
```

Or scroll up in Metro output to find the URL manually.

---

## Note on the backend

The backend currently runs on Render (`medrecord-api.onrender.com`).
First request after idle may take 20–30 seconds (cold start) — this is normal.

A local backend setup is planned — see `plans/local-backend-demo-setup.md`.
After that setup is complete, the command will change to `npm run demo`
and this file will be updated.
