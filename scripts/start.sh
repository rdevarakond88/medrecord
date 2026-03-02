#!/bin/bash
expo start --tunnel --port 8082 &
EXPO_PID=$!

printf "Waiting for Expo Go URL"
for i in $(seq 1 30); do
  sleep 2
  URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | grep -o '"public_url": *"https://[^"]*"' \
    | grep -o 'https://[^"]*' \
    | head -1)
  if [ -n "$URL" ]; then
    EXP_URL="${URL/https:\/\//exp://}"
    printf "\n"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  OPEN IN EXPO GO — paste this URL:"
    echo "  $EXP_URL"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    break
  fi
  printf "."
done

if [ -z "$EXP_URL" ]; then
  printf "\n"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ERROR: Could not get Expo Go URL."
  echo "  Check ngrok is running: curl http://localhost:4040/api/tunnels"
  echo "  Or find the URL manually in Metro output above."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

wait $EXPO_PID
