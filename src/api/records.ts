/**
 * Record API functions — D4 Visit Detail (live screen)
 * Spec: docs/api-contracts.md — Record Endpoints
 *
 * GET /visits/:id/records — fetch all records for a visit
 * POST /records           — create a new note record
 * PATCH /visits/:id       — finish (submit) a visit
 *
 * Note: PATCH /records/:id (note edit) and DELETE /records/:id (note delete)
 * are documented in api-contracts.md as required backend endpoints but are
 * not yet implemented server-side for v1. Note edits are local-only until
 * the backend supports them. Note deletes are local soft-deletes only
 * (server is append-only per data model decision in project-state.md).
 */

import { apiFetch } from './apiClient';

export interface ApiRecord {
  id:                  string;
  type:                'note' | 'scan';
  content_text:        string | null;  // note text or OCR text; null if not available
  image_url:           string | null;  // S3 URL — null until S3 storage implemented (v2)
  image_thumbnail_url: string | null;  // S3 thumbnail — null until v2
  ocr_status:          string | null;  // null for notes; 'success'|'pending'|'failed'|'skipped' for scans
  created_by:          { id: string; name: string } | null;
  created_at:          string;         // ISO 8601 UTC
}

export interface ApiRecordsResponse {
  records: ApiRecord[];
}

/**
 * Fetch all records for a visit.
 * Called by D4 on mount and on focus to populate the records list.
 * Offline fallback: caller reads from SQLite visit_records table.
 *
 * GET /visits/:id/records
 */
export async function getVisitRecords(
  visitId: string,
  authToken: string,
): Promise<ApiRecordsResponse> {
  return apiFetch<ApiRecordsResponse>(
    `/visits/${encodeURIComponent(visitId)}/records`,
    authToken,
  );
}

/**
 * Create a typed note record attached to a visit.
 * Offline path: caller writes to visit_records (sync_status='pending') and enqueues.
 *
 * POST /records
 */
export async function createNote(
  localId: string,
  visitId: string,
  text: string,
  authToken: string,
): Promise<{ record: ApiRecord }> {
  return apiFetch<{ record: ApiRecord }>('/records', authToken, {
    method: 'POST',
    body: JSON.stringify({
      local_id:     localId,
      visit_id:     visitId,
      type:         'note',
      content_text: text,
    }),
  });
}

/**
 * Submit / close a visit. After this, no more records can be added.
 * Only the opening doctor can finish a visit.
 *
 * PATCH /visits/:id
 */
export async function finishVisit(
  visitId: string,
  authToken: string,
): Promise<void> {
  await apiFetch<unknown>(`/visits/${encodeURIComponent(visitId)}`, authToken, {
    method: 'PATCH',
    body:   JSON.stringify({ status: 'submitted' }),
  });
}
