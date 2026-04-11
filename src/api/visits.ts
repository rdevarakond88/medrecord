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
  localId:        string;  // client-generated UUID — required for server-side idempotency (deduplication on retry)
  patientId:      string;  // server patient ID
  doctorId:       string;
  visitDate:      string;  // YYYY-MM-DD
  chiefComplaint: string | null;
  noteText:       string | null;  // doctor-typed note; sent on creation so note is not lost if device is wiped before sync
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
 * note_text is included so the note is server-persisted immediately on the online path
 * and is not dependent on the sync worker. The sync queue payload also carries note_text
 * as a safety net for the offline/retry path.
 *
 * POST /visits
 */
// TODO: server-side — derive doctorId from JWT, not request body. See HIGH-4 in D6 security audit.
export async function createVisit(
  req: CreateVisitRequest,
  authToken: string,
): Promise<CreateVisitResponse> {
  return apiFetch<CreateVisitResponse>('/visits', authToken, {
    method: 'POST',
    body: JSON.stringify({
      local_id:        req.localId,
      patient_id:      req.patientId,
      // SERVER MUST derive doctor identity from JWT claim,
      // not from this body value. Validate body doctor_id
      // matches token sub — reject with 403 if mismatch.
      // Risk: IDOR if server trusts body doctor_id blindly.
      doctor_id:       req.doctorId,
      visit_date:      req.visitDate,
      chief_complaint: req.chiefComplaint,
      note_text:       req.noteText ?? '',
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
