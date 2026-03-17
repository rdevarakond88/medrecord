/**
 * Certificate-pinned fetch wrapper for the MedRecord API.
 * Spec: docs/security-spec.md — Transport Security
 *
 * Uses react-native-ssl-pinning to prevent MITM attacks on shared clinic WiFi,
 * which is a real threat in Indian semi-urban clinics with shared routers.
 * Pins the leaf cert + one intermediate CA for api.medrecord.in (H-2 pre-merge fix).
 *
 * ── BEFORE DEPLOYMENT ───────────────────────────────────────────────────────
 * 1. Export the production certificate chain from api.medrecord.in:
 *      openssl s_client -connect api.medrecord.in:443 -showcerts < /dev/null
 *
 * 2. Save leaf cert + one intermediate to .cer (DER) files:
 *      openssl x509 -in leaf.pem    -outform DER -out api_medrecord_leaf.cer
 *      openssl x509 -in inter.pem   -outform DER -out api_medrecord_intermediate.cer
 *
 * 3. Bundle them in native assets:
 *      iOS:     ios/<AppName>/Assets/  (add both .cer files to Xcode target)
 *      Android: android/app/src/main/assets/
 *
 * 4. The API_CERT_NAMES array below references the filenames without the .cer extension.
 *    No code change needed after step 3 — just rebuild.
 *
 * ── EXPO GO COMPATIBILITY ───────────────────────────────────────────────────
 * react-native-ssl-pinning is a native module. It does NOT work in Expo Go.
 * Required build command: eas build --profile development  (custom dev client)
 *
 * ── INSTALLATION ────────────────────────────────────────────────────────────
 * npx expo install react-native-ssl-pinning
 * ────────────────────────────────────────────────────────────────────────────
 */

// react-native-ssl-pinning is a native module — not available in Expo Go.
// Fall back to standard fetch so device testing works in Expo Go.
// Cert pinning must be validated in an EAS custom dev client before production (UE-6).
let sslFetch: typeof fetch | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sslFetch = require('react-native-ssl-pinning').fetch;
} catch {
  // Expo Go — native module not bundled; pinnedFetch will use standard fetch below
}

// Certificate filenames (without .cer extension) bundled in native assets.
// Leaf cert: rotates with every TLS cert renewal (~90 days on Let's Encrypt, ~1 year otherwise).
// Intermediate: stable for the CA's intermediate lifetime (typically 5+ years).
// Pinning both provides a backup if the leaf is reissued between app releases.
const API_CERT_NAMES = [
  'api_medrecord_leaf',          // leaf cert for api.medrecord.in
  'api_medrecord_intermediate',  // intermediate CA — backup pin
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
 * Throws PinningError on TLS pin mismatch — caller (apiFetch) propagates
 * to React Query error state, triggering the existing 401 / error handling path.
 */
export async function pinnedFetch(
  url: string,
  init: PinnedRequestInit = {},
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  // Expo Go fallback — native module unavailable, use standard fetch (no cert pinning)
  if (!sslFetch) {
    const res = await fetch(url, {
      method:  init.method ?? 'GET',
      headers: init.headers ?? {},
      body:    init.body,
    });
    return {
      ok:     res.ok,
      status: res.status,
      json:   () => res.json(),
    };
  }

  const response = await (sslFetch as any)(url, {
    method:          init.method ?? 'GET',
    headers:         init.headers ?? {},
    body:            init.body,
    sslPinning:      { certs: API_CERT_NAMES },
    timeoutInterval: 15_000,
  });

  // react-native-ssl-pinning returns { status, bodyString, headers }
  // Cast to any because the library's type definitions are incomplete.
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
