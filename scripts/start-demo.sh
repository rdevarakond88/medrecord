#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"

# Load backend env (for DB credentials + NGROK_DOMAIN)
if [ -f "$BACKEND_DIR/.env" ]; then
  export $(grep -v '^#' "$BACKEND_DIR/.env" | xargs)
fi

if [ -z "$NGROK_DOMAIN" ]; then
  echo "ERROR: NGROK_DOMAIN not set in backend/.env"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MedRecord Demo — starting all services"
echo "  Backend tunnel: ngrok static domain ($NGROK_DOMAIN)"
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

# 4 — Open ngrok tunnel for backend on the free static domain (fixed hostname,
# same URL every session — requires the ngrok-skip-browser-warning header on
# every API request to bypass the free-tier interstitial; see src/api/apiClient.ts)
echo "[3/4] Opening backend tunnel (ngrok static domain)..."
NGROK_BIN="$ROOT_DIR/node_modules/@expo/ngrok-bin-linux-x64/ngrok"
"$NGROK_BIN" http --url="$NGROK_DOMAIN" 3000 --log=stdout \
  > /tmp/ngrok-backend.log 2>&1 &
TUNNEL_PID=$!

TUNNEL_URL="https://$NGROK_DOMAIN"

# Wait for backend to be reachable locally and for the tunnel to come up
printf "Waiting for backend + tunnel"
TUNNEL_UP=""
for i in $(seq 1 20); do
  sleep 2
  if [ -z "$TUNNEL_UP" ] && grep -q "started tunnel" /tmp/ngrok-backend.log 2>/dev/null; then
    TUNNEL_UP=1
  fi
  if curl -s --max-time 3 "http://localhost:3000/v1/health" > /dev/null 2>&1 && [ -n "$TUNNEL_UP" ]; then
    printf "\n"
    echo "  Backend ready at http://localhost:3000"
    echo "  Tunnel URL: $TUNNEL_URL"
    break
  fi
  printf "."
done

if [ -z "$TUNNEL_UP" ]; then
  printf "\n"
  echo "ERROR: ngrok tunnel did not come up."
  echo "  Check log: cat /tmp/ngrok-backend.log"
  kill $BACKEND_PID $TUNNEL_PID 2>/dev/null || true
  exit 1
fi

export EXPO_PUBLIC_API_URL="$TUNNEL_URL/v1"
echo "  API URL baked into Metro bundle: $EXPO_PUBLIC_API_URL"

# 5 — Start Expo (kills 8082, opens Expo tunnel, Metro picks up EXPO_PUBLIC_API_URL)
echo "[4/4] Starting Expo..."
cd "$ROOT_DIR"
fuser -k 8082/tcp 2>/dev/null || true
# Wipe Metro's transform cache — its cache key does not include EXPO_PUBLIC_* values,
# so a stale cache from a prior session will bake in the old cloudflared URL.
rm -rf /tmp/metro-cache
bash scripts/start.sh

# Cleanup backend + tunnel on Ctrl-C / Expo exit
kill $BACKEND_PID $TUNNEL_PID 2>/dev/null || true
