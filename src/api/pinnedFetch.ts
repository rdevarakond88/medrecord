/**
 * Certificate-pinned fetch wrapper for the MedRecord API.
 * Spec: docs/security-spec.md — Transport Security
 *
 * Pins the Google Trust Services WE1 intermediate CA cert, which signs
 * Render.com's TLS chain for medrecord-api.onrender.com. Pinning the
 * intermediate (not the leaf) avoids breakage on Render's 90-day
 * Let's Encrypt leaf rotations. The WE1 cert is valid until Feb 20, 2029.
 *
 * ── CERT ROTATION CHECKLIST ─────────────────────────────────────────────────
 * Run this check when either of these events happen:
 *   • You receive a TLS handshake failure in production (cert mismatch)
 *   • The WE1 cert expiry date (2029-02-20) is within 90 days
 *
 * To re-extract the intermediate CA:
 *   openssl s_client -connect medrecord-api.onrender.com:443 -showcerts < /dev/null 2>/dev/null \
 *     | awk 'BEGIN{p=0} /-----BEGIN CERTIFICATE-----/{p++} p==2{print} /-----END CERTIFICATE-----/ && p==2{p=0}' \
 *     > /tmp/intermediate.pem
 *   openssl x509 -in /tmp/intermediate.pem -outform DER -out assets/certs/api_medrecord_intermediate.cer
 *   openssl x509 -in assets/certs/api_medrecord_intermediate.cer -inform DER -noout -subject -dates
 *
 * Then rebuild via EAS: eas build --profile preview --platform ios
 *
 * ── CERT BUNDLING ───────────────────────────────────────────────────────────
 * The DER-format cert lives in assets/certs/api_medrecord_intermediate.cer.
 * plugins/withSslPinning.js copies it to native directories during EAS prebuild:
 *   iOS:     ios/MedRecord/api_medrecord_intermediate.cer
 *   Android: android/app/src/main/assets/api_medrecord_intermediate.cer
 *
 * ── EXPO GO COMPATIBILITY ───────────────────────────────────────────────────
 * react-native-ssl-pinning is a native module — not available in Expo Go.
 * The try/catch below falls back to standard fetch (no cert pinning) in Expo Go.
 * Cert pinning is only active in EAS builds (development client or production).
 * ────────────────────────────────────────────────────────────────────────────
 */

// react-native-ssl-pinning is a native module — not available in Expo Go.
// Falls back to standard fetch so Expo Go device testing still works.
//
// BUG-IT-PRE-1 fix: require() does NOT throw in Expo Go because the `q` npm
// dependency is installed, so the JS module loads. But NativeModules.RNSslPinning
// is null in Expo Go (the native side was never compiled in), causing a crash
// when sslFetch() is called. Guard on the native module presence first.
import { NativeModules } from 'react-native';

let sslFetch: typeof fetch | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (NativeModules.RNSslPinning) {
    sslFetch = require('react-native-ssl-pinning').fetch;
  }
} catch {
  // Require failed (e.g. module stripped from bundle) — use standard fetch below
}

// The intermediate CA cert filename (without .cer extension).
// This file is bundled in native assets by plugins/withSslPinning.js.
// Pinning the intermediate avoids breakage on Render's 90-day leaf rotations.
const API_CERT_NAMES = [
  'api_medrecord_intermediate', // Google Trust Services WE1 — valid until 2029-02-20
];

export interface PinnedRequestInit {
  method?:  string;
  headers?: Record<string, string>;
  body?:    string;
}

/**
 * Drop-in replacement for fetch() that enforces certificate pinning.
 * Returns an object with .ok, .status, and .json() matching the subset
 * of the fetch Response interface that apiFetch() relies on.
 *
 * Throws on TLS pin mismatch — caller (apiFetch) propagates to React Query
 * error state, triggering the existing error handling path.
 */
export async function pinnedFetch(
  url: string,
  init: PinnedRequestInit = {},
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  // Backend is tunneled through ngrok's free static domain, which serves a
  // browser-warning interstitial (ERR_NGROK_6024) instead of the real response
  // when it detects a browser-like User-Agent — this header bypasses it.
  const headers = { 'ngrok-skip-browser-warning': 'true', ...(init.headers ?? {}) };

  // Expo Go fallback — native module unavailable, use standard fetch (no cert pinning).
  // 30-second AbortController timeout prevents hangs on Render.com cold-starts.
  // AbortError is treated as a transient failure by the sync worker → reset to 'pending'.
  if (!sslFetch) {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, {
        method:  init.method ?? 'GET',
        headers,
        body:    init.body,
        signal:  controller.signal,
      });
      return {
        ok:     res.ok,
        status: res.status,
        json:   () => res.json(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const response = await (sslFetch as any)(url, {
    method:          init.method ?? 'GET',
    headers,
    body:            init.body,
    sslPinning:      { certs: API_CERT_NAMES },
    timeoutInterval: 30_000,
  });

  // react-native-ssl-pinning returns { status, bodyString, headers }
  const bodyString: string = (response as any).bodyString ?? '';

  return {
    ok:     response.status >= 200 && response.status < 300,
    status: response.status,
    json:   () => {
      try {
        return Promise.resolve(JSON.parse(bodyString));
      } catch {
        return Promise.resolve(null);
      }
    },
  };
}
