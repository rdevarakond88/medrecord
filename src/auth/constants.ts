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

/**
 * NOT used for storage.
 * The JWT access token lives in Zustand in-memory only and is NEVER persisted
 * to SecureStore or AsyncStorage (security-spec.md §Authentication, F-2).
 * This constant is intentionally absent — do not add one here.
 *
 * If you need to read the current token, use:
 *   useAuthStore.getState().token   (inside React components / hooks)
 *   useAuthStore.getState().token   (outside React, e.g. API helpers)
 */

/**
 * Key used to store the serialised AuthUser profile in expo-secure-store.
 * Written at login alongside the refresh token; read on cold-start session
 * restoration so App.tsx can call setAuth() without a separate /me endpoint.
 */
export const USER_PROFILE_KEY = 'medrecord_user_profile';
