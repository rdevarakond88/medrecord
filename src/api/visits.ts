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

// ─────────────────────────────────────────────────────────────
// D6 — create a new visit
// ─────────────────────────────────────────────────────────────

export interface CreateVisitRequest {
  patientId:      string;  // server patient ID
  doctorId:       string;
  visitDate:      string;  // YYYY-MM-DD
  chiefComplaint: string | null;
  consentGranted: boolean;
}

export interface CreateVisitResponse {
  visitId:   string;
  createdAt: string;
}

/**
 * Create a new visit on the server.
 *
 * Always called AFTER the SQLite write in insertLocalVisit() — the local row
 * is the safety net if the network call fails. If offline or the server is
 * unreachable, the visit lives in visits_draft until the sync worker picks it up.
 *
 * Note: note_text is not included in this call — notes are records within a visit
 * and will be posted to POST /visits/:id/records once D4/D7 records endpoint is built.
 * The sync queue payload (enqueueOperation) carries note_text for the worker.
 *
 * POST /visits
 */
export async function createVisit(
  req: CreateVisitRequest,
  authToken: string,
): Promise<CreateVisitResponse> {
  return apiFetch<CreateVisitResponse>('/visits', authToken, {
    method: 'POST',
    body: JSON.stringify({
      patient_id:      req.patientId,
      doctor_id:       req.doctorId,
      visit_date:      req.visitDate,
      chief_complaint: req.chiefComplaint,
      consent_granted: req.consentGranted,
    }),
  });
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
