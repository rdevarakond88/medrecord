#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"

# Load backend env to get NGROK_DOMAIN
if [ -f "$BACKEND_DIR/.env" ]; then
  export $(grep -v '^#' "$BACKEND_DIR/.env" | xargs)
fi

if [ -z "$NGROK_DOMAIN" ] || [ "$NGROK_DOMAIN" = "PLACEHOLDER" ]; then
  echo "ERROR: Set NGROK_DOMAIN in backend/.env before running demo."
  echo "  1. Go to ngrok.com → Domains → New Domain (free, one per account)"
  echo "  2. Set NGROK_DOMAIN=your-domain.ngrok-free.app in backend/.env"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MedRecord Demo — starting all services"
echo "  Backend: https://$NGROK_DOMAIN"
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

# 4 — Open ngrok tunnel for backend (static domain, no expiry)
echo "[3/4] Opening backend ngrok tunnel (https://$NGROK_DOMAIN)..."
ngrok http --domain="$NGROK_DOMAIN" 3000 > /tmp/ngrok-backend.log 2>&1 &
NGROK_PID=$!

# Wait for backend to be reachable
printf "Waiting for backend"
for i in $(seq 1 15); do
  sleep 2
  if curl -s --max-time 3 "http://localhost:3000/v1/health" > /dev/null 2>&1; then
    printf "\n"
    echo "  Backend ready at http://localhost:3000"
    break
  fi
  printf "."
done

# 5 — Start Expo (existing start.sh behaviour: kills 8082, opens Expo tunnel)
echo "[4/4] Starting Expo..."
cd "$ROOT_DIR"
fuser -k 8082/tcp 2>/dev/null || true
bash scripts/start.sh

# Cleanup backend + ngrok on Ctrl-C / Expo exit
kill $BACKEND_PID $NGROK_PID 2>/dev/null || true
