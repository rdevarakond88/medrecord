#!/bin/bash
# Expo --tunnel uses Expo's own infrastructure (not ngrok).
# The exp:// URL appears directly in Metro output below.
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Expo Go URL will appear in Metro output"
echo "  (look for the QR code or exp:// line)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
expo start --tunnel --port 8082 --clear "$@"
