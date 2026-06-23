#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"

# Load backend env (for DB credentials etc — NGROK_DOMAIN no longer needed)
if [ -f "$BACKEND_DIR/.env" ]; then
  export $(grep -v '^#' "$BACKEND_DIR/.env" | xargs)
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MedRecord Demo — starting all services"
echo "  Backend tunnel: cloudflared (URL assigned at startup)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1 — Start PostgreSQL (already running on WSL2; no-op if already up)
sudo service postgresql start 2>/dev/null || true

# 2 — Build backend if dist/ is missing or stale
cd "$BACKEND_DIR"
if [ ! -f dist/src/index.js ] || [ src/index.ts -nt dist/src/index.js ]; then
  echo "[1/4] Building backend..."
  npm run build
fi

# 3 — Start backend server in background
echo "[2/4] Starting backend server..."
node dist/src/index.js &
BACKEND_PID=$!

# 4 — Open cloudflared tunnel for backend (no interstitial, proper HTTPS)
echo "[3/4] Opening backend tunnel (cloudflared)..."
"$SCRIPT_DIR/cloudflared" tunnel --url http://localhost:3000 --no-autoupdate \
  > /tmp/cloudflared-backend.log 2>&1 &
TUNNEL_PID=$!

# Wait for backend to be reachable locally and for cloudflared URL
printf "Waiting for backend + tunnel"
TUNNEL_URL=""
for i in $(seq 1 20); do
  sleep 2
  if [ -z "$TUNNEL_URL" ]; then
    TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared-backend.log 2>/dev/null | head -1)
  fi
  if curl -s --max-time 3 "http://localhost:3000/v1/health" > /dev/null 2>&1 && [ -n "$TUNNEL_URL" ]; then
    printf "\n"
    echo "  Backend ready at http://localhost:3000"
    echo "  Tunnel URL: $TUNNEL_URL"
    break
  fi
  printf "."
done

if [ -z "$TUNNEL_URL" ]; then
  printf "\n"
  echo "ERROR: Could not get cloudflared tunnel URL."
  echo "  Check log: cat /tmp/cloudflared-backend.log"
  kill $BACKEND_PID $TUNNEL_PID 2>/dev/null || true
  exit 1
fi

export EXPO_PUBLIC_API_URL="$TUNNEL_URL/v1"
echo "  API URL baked into Metro bundle: $EXPO_PUBLIC_API_URL"

# 5 — Start Expo (kills 8082, opens Expo tunnel, Metro picks up EXPO_PUBLIC_API_URL)
echo "[4/4] Starting Expo..."
cd "$ROOT_DIR"
fuser -k 8082/tcp 2>/dev/null || true
bash scripts/start.sh

# Cleanup backend + tunnel on Ctrl-C / Expo exit
kill $BACKEND_PID $TUNNEL_PID 2>/dev/null || true
