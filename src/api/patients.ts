/**
 * Patient API functions.
 * Spec: docs/api-contracts.md — Patient Endpoints
 */

import { apiFetch, ApiError } from './apiClient';

export interface ApiPatient {
  id:              string;
  name:            string | null;
  mobile_number:   string;
  date_of_birth:   string | null;  // ISO date YYYY-MM-DD
  gender:          'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  consent_granted: boolean;
  last_visit_date: string | null;  // ISO date YYYY-MM-DD
}

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
