/**
 * Visit API functions — D3 Patient Detail / History (live screen)
 * Spec: docs/api-contracts.md — Visit Endpoints
 *
 * GET /patients/:serverId/visits returns two visit lists in one round-trip:
 *   my_visits:           visits the current doctor created; always returned with full data
 *   other_doctor_visits: consent-gated; chief_complaint excluded at the query layer
 *                        when consent_granted=false (build constraint D3-H-1)
 *
 * The response also carries the authoritative consent_granted flag and a checked_at
 * timestamp so that D3 can gate its display without a separate consent call (D3-H-2).
 */

import { apiFetch } from './apiClient';

export interface ApiVisit {
  id:              string;
  visit_date:      string;         // server-assigned UTC ISO — never client-generated (QA E-6)
  chief_complaint: string | null;  // null for otherDoctorVisits when consent absent
  clinic_name:     string;
  record_count:    number;
}

export interface ApiVisitsResponse {
  my_visits:           ApiVisit[];
  other_doctor_visits: ApiVisit[];
  consent_granted:     boolean;   // authoritative consent state — the gate for D3 display
  checked_at:          string;    // server UTC ISO; surfaced in offline banner (QA M-6)
}

/**
 * Fetch the patient's visit history and current consent status.
 *
 * Single round-trip combining consent re-verification with visit retrieval.
 * The server excludes chief_complaint from other_doctor_visits at the SQL query
 * layer when consent_granted=false — not relying on client-side suppression alone
 * (build constraint D3-H-1).
 *
 * GET /patients/:serverId/visits
 */
export async function getPatientVisits(
  patientServerId: string,
  authToken: string,
): Promise<ApiVisitsResponse> {
  return apiFetch<ApiVisitsResponse>(
    `/patients/${encodeURIComponent(patientServerId)}/visits`,
    authToken,
  );
}
