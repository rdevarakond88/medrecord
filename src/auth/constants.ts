/**
 * Auth storage key constants.
 * Declared here so D1 (Login), the sync worker, and any future token-refresh
 * path all use the same key name when reading/writing expo-secure-store.
 *
 * Spec: docs/security-spec.md — Refresh token stored in device secure storage.
 * PM decision: reviews/sync-worker-pm-preflow.md — Open Questions → key name.
 */

/** Key used to store the JWT refresh token in expo-secure-store. */
export const REFRESH_TOKEN_KEY = 'medrecord_refresh_token';

/** Key used to store the JWT access token in expo-secure-store (optional cache). */
export const ACCESS_TOKEN_KEY = 'medrecord_access_token';
