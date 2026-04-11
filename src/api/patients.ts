/**
 * Patient API functions.
 * Spec: docs/api-contracts.md — Patient Endpoints
 */

import { apiFetch, ApiError } from './apiClient';
export { ApiError };

export interface ApiPatient {
  id:              string;
  name:            string | null;
  mobile_number:   string;
  date_of_birth:   string | null;  // ISO date YYYY-MM-DD
  gender:          'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  consent_granted: boolean;
  last_visit_date: string | null;  // ISO date YYYY-MM-DD
}

// ─────────────────────────────────────────────────────────────
// D5 — create a new patient
// ─────────────────────────────────────────────────────────────

export interface CreatePatientRequest {
  localId:      string;
  mobileNumber: string;
  name:         string | null;
  dateOfBirth:  string | null;  // ISO YYYY-MM-DD
  gender:       string | null;
}

/**
 * Create a new patient on the server.
 *
 * Always called AFTER insertLocalPatient() + enqueueOperation() — the local
 * SQLite row is the safety net if the server call fails or the device goes
 * offline before the response arrives.
 *
 * Throws ApiError on failure. The caller handles:
 *   - 409 CONFLICT: patient already registered (race with another device)
 *   - Other errors: ignore and rely on the sync worker
 *
 * NOTE: server MUST derive doctor identity from JWT claim, not request body.
 * The doctor_id is intentionally not sent here — server should infer from token.
 *
 * POST /patients
 */
export async function createPatient(
  req: CreatePatientRequest,
  authToken: string,
): Promise<{ patient: ApiPatient }> {
  return apiFetch<{ patient: ApiPatient }>('/patients', authToken, {
    method: 'POST',
    body: JSON.stringify({
      local_id:      req.localId,
      mobile_number: req.mobileNumber,
      name:          req.name,
      date_of_birth: req.dateOfBirth,
      gender:        req.gender,
    }),
  });
}

// ─────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────

/**
 * Look up a patient by exact 10-digit mobile number.
 *
 * Returns the patient if found, or null for a clean 404.
 * Throws ApiError for any other failure (auth, network, server error).
 *
 * GET /patients/lookup?mobile=...
 * Requires: valid consent or doctor initiating first visit (handled server-side).
 */
export async function lookupPatient(
  mobile: string,
  authToken: string,
): Promise<ApiPatient | null> {
  try {
    const data = await apiFetch<{ patient: ApiPatient }>(
      `/patients/lookup?mobile=${encodeURIComponent(mobile)}`,
      authToken,
    );
    return data.patient;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'PATIENT_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}
