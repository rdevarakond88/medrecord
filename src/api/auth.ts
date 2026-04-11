/**
 * Authentication API — D1 / P1 Login screen.
 *
 * Spec: docs/api-contracts.md — Auth Endpoints
 * Spec: docs/security-spec.md — Authentication, Transport Security, Rate Limiting
 *
 * F-6: All calls go through pinnedFetch (TLS cert pinning) — not bare fetch.
 *      This prevents MITM attacks on shared clinic WiFi.
 * F-10: No phone numbers, OTPs, user IDs, or JWT fragments in any console.log.
 *
 * Exports:
 *   sendOtp()          — POST /auth/send-otp
 *   verifyOtp()        — POST /auth/verify-otp
 *   refreshAccessToken() — POST /auth/refresh
 */

import { pinnedFetch } from './pinnedFetch';
import { ApiError } from './apiClient';

const BASE_URL = 'https://medrecord-api.onrender.com/v1';

// ─── Channel ─────────────────────────────────────────────────────────────────

export type OtpChannel = 'sms' | 'whatsapp';

// ─── Response shapes ─────────────────────────────────────────────────────────

export interface SendOtpResponse {
  otp_token:  string;
  expires_in: number;   // seconds until OTP expires (typically 300)
}

export interface VerifyOtpResponse {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  user: {
    id:        string;
    role:      'doctor' | 'patient';
    name:      string;
    clinic_id: string;
  };
}

export interface RefreshTokenResponse {
  access_token:   string;
  refresh_token?: string;   // server rotates refresh token on use (SW-H-2 pattern)
  expires_in:     number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse the RFC-7807 error body and throw an ApiError. */
function throwApiError(body: unknown, status: number): never {
  const err = (body as any)?.error ?? {};
  throw new ApiError(
    err.code    ?? 'SERVER_ERROR',
    err.message ?? 'An unexpected error occurred',
    status,
    err.field,
  );
}

// ─── API functions ───────────────────────────────────────────────────────────

/**
 * POST /auth/send-otp
 * Request an OTP to be delivered to the given mobile number.
 * Throws ApiError on server error; caller checks err.status === 429 for
 * the rate-limit case (5 requests per mobile per hour).
 *
 * @param mobileNumber  10-digit Indian mobile number (e.g. "9876543210")
 * @param channel       Delivery channel: 'sms' (default) or 'whatsapp'
 */
export async function sendOtp(
  mobileNumber: string,
  channel: OtpChannel = 'sms',
): Promise<SendOtpResponse> {
  const response = await pinnedFetch(`${BASE_URL}/auth/send-otp`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    // F-10: mobileNumber is not logged; it goes only in the request body
    body: JSON.stringify({ mobile_number: mobileNumber, role: 'doctor', channel }),
  });

  const body = await response.json();
  if (!response.ok) throwApiError(body, response.status);

  return body as SendOtpResponse;
}

/**
 * POST /auth/verify-otp
 * Exchange an OTP for a JWT access + refresh token pair.
 *
 * Throws ApiError with:
 *   code === 'OTP_EXPIRED'        — OTP has expired (5-minute window)
 *   code === 'WRONG_OTP'          — incorrect OTP entered
 *   code === 'TOO_MANY_ATTEMPTS'  — 3-attempt limit reached; OTP is invalidated
 *   status === 429                — rate limit (should not normally occur here)
 *
 * @param otpToken  Token returned by sendOtp (identifies the OTP session)
 * @param otp       6-digit code entered by the user
 */
export async function verifyOtp(
  otpToken: string,
  otp: string,
): Promise<VerifyOtpResponse> {
  const response = await pinnedFetch(`${BASE_URL}/auth/verify-otp`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    // F-10: otpToken and otp are NOT logged — they go only in the request body
    body: JSON.stringify({ otp_token: otpToken, otp }),
  });

  const body = await response.json();
  if (!response.ok) throwApiError(body, response.status);

  return body as VerifyOtpResponse;
}

/**
 * POST /auth/refresh
 * Exchange a refresh token for a new access token.
 * Called by App.tsx on cold-start and by the sync worker on 401.
 *
 * Throws ApiError on failure (expired/revoked refresh token → caller clears
 * SecureStore and navigates to Login).
 *
 * @param refreshToken  Value read from expo-secure-store REFRESH_TOKEN_KEY
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshTokenResponse> {
  const response = await pinnedFetch(`${BASE_URL}/auth/refresh`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    // F-10: refresh token not logged
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const body = await response.json();
  if (!response.ok) throwApiError(body, response.status);

  return body as RefreshTokenResponse;
}
