/**
 * Consent API — D9 Consent Request Flow.
 *
 * Spec: docs/api-contracts.md § Consent Endpoints
 * Spec: docs/consent-layer-spec.md § Flow 2 / Sub-flow B (SMS OTP)
 * Spec: docs/security-spec.md § Consent OTP Security
 *
 * Uses pinnedFetch directly (not apiFetch) because the consent endpoint error
 * bodies are non-standard. 400 carries `attempts_remaining` at the top level;
 * 429 carries `retry_after_seconds` — neither fits the RFC 7807 object shape
 * that apiFetch expects.
 *
 * F-10: No patient IDs, OTP tokens, or OTP values in console.log.
 */

import { pinnedFetch } from './pinnedFetch';
import { ApiError, API_BASE_URL } from './apiClient';

// ─── Response shapes ─────────────────────────────────────────────────────────

export interface ConsentRequestResponse {
  otp_token:  string;
  expires_in: number;   // seconds — 600 (10 min, PM confirmed 2026-05-09)
}

export interface ConsentVerifyOkResponse {
  consent_id: string;
  granted_at: string;
  scope:      string;
}

export type VerifyConsentResult =
  | { ok: true;  data: ConsentVerifyOkResponse }
  | { ok: false; reason: 'invalid_otp'; attemptsRemaining: number }
  | { ok: false; reason: 'exhausted' };

// ─── Custom error class for 429 ───────────────────────────────────────────────

export class ConsentRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('rate_limit_exhausted');
    this.name = 'ConsentRateLimitError';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAuthHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${token}`,
  };
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * POST /consent/request
 * Sends a 6-digit OTP SMS to the patient's registered mobile.
 * Returns an otp_token scoped to (doctor_id, patient_id) — pass to verifyConsent().
 *
 * Throws ConsentRateLimitError (status 429) — caller must show the rate-limit state
 * with retry_after_seconds so the doctor knows when to retry.
 * Throws ApiError on other server errors.
 */
export async function requestConsent(
  patientServerId: string,
  token: string,
): Promise<ConsentRequestResponse> {
  const response = await pinnedFetch(`${API_BASE_URL}/consent/request`, {
    method:  'POST',
    headers: buildAuthHeaders(token),
    // F-10: patient ID not logged
    body: JSON.stringify({ patient_id: patientServerId }),
  });

  const body = await response.json() as Record<string, unknown>;

  if (response.status === 429) {
    throw new ConsentRateLimitError((body.retry_after_seconds as number) ?? 3600);
  }

  if (!response.ok) {
    const err = body.error;
    throw new ApiError(
      typeof err === 'string' ? err : 'SERVER_ERROR',
      typeof err === 'string' ? err : 'An unexpected error occurred',
      response.status,
    );
  }

  return body as unknown as ConsentRequestResponse;
}

/**
 * POST /consent/verify
 * Submits the patient-entered OTP. Returns a discriminated union so the caller
 * handles all three outcomes without exception-based branching.
 *
 * Returns:
 *   { ok: true, data }                                      — consent granted
 *   { ok: false, reason: 'invalid_otp', attemptsRemaining } — wrong OTP, token still live
 *   { ok: false, reason: 'exhausted' }                      — expired or all 3 attempts used
 *
 * Throws ApiError on network / server error (500, etc.).
 */
export async function verifyConsent(
  otpToken: string,
  otp: string,
  token: string,
): Promise<VerifyConsentResult> {
  const response = await pinnedFetch(`${API_BASE_URL}/consent/verify`, {
    method:  'POST',
    headers: buildAuthHeaders(token),
    // F-10: otp_token and otp not logged
    body: JSON.stringify({ otp_token: otpToken, otp }),
  });

  const body = await response.json() as Record<string, unknown>;

  if (response.status === 200) {
    return { ok: true, data: body as unknown as ConsentVerifyOkResponse };
  }

  if (response.status === 400) {
    return {
      ok:                false,
      reason:            'invalid_otp',
      attemptsRemaining: (body.attempts_remaining as number) ?? 0,
    };
  }

  if (response.status === 410) {
    return { ok: false, reason: 'exhausted' };
  }

  // 401 / 403 / 500 — unexpected
  const err = body.error;
  throw new ApiError(
    typeof err === 'string' ? err : 'SERVER_ERROR',
    typeof err === 'string' ? err : 'An unexpected error occurred',
    response.status,
  );
}
