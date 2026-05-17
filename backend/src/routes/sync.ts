/**
 * Sync route — POST /sync
 * Contract: docs/api-contracts.md — Sync Endpoint
 * Processes a batch of offline operations in queued_at order.
 * One operation failing does NOT abort the batch.
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { syncLimiter } from '../middleware/rateLimit';
import { logAudit } from '../utils/audit';

const router = Router();

// ─── Payload schemas per entity type ─────────────────────────────────────────

const patientPayloadSchema = z.object({
  local_id:      z.string().uuid(),
  mobile_number: z.string().regex(/^[6-9]\d{9}$/),
  name:          z.string().optional(),
  date_of_birth: z.string().optional(),
  gender:        z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
});

// Separate schema for patient 'update' — includes server_id + doctor_id for IDOR check.
// For v1, only mobile_number updates are supported via sync (D3 mobile edit flow).
const patientUpdatePayloadSchema = z.object({
  local_id:      z.string().uuid(),
  server_id:     z.string().uuid().nullable().optional(),
  mobile_number: z.string().regex(/^[6-9]\d{9}$/),
  doctor_id:     z.string().uuid(),
  updated_at:    z.string(),
});

const visitPayloadSchema = z.object({
  local_id:        z.string().uuid(),
  patient_id:      z.string().uuid(),
  doctor_id:       z.string().uuid(),
  visit_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  chief_complaint: z.string().optional(),
  note_text:       z.string().optional(),
  consent_granted: z.boolean().optional(),
});

const auditEventPayloadSchema = z.object({
  event_type: z.string(),
  doctor_id:  z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  metadata:   z.record(z.unknown()).nullable().optional(),
  created_at: z.string(),
});

const operationSchema = z.object({
  operation:   z.enum(['create', 'update']),
  entity_type: z.enum(['patient', 'visit', 'audit_event']),
  local_id:    z.string().uuid(),
  payload:     z.record(z.unknown()),
  queued_at:   z.string(),
});

const syncBodySchema = z.object({
  operations: z.array(operationSchema),
});

type SyncResult = {
  local_id:  string;
  status:    'success' | 'conflict' | 'error';
  server_id?: string;
  message?:  string;
};

// ─── POST /sync ───────────────────────────────────────────────────────────────

router.post('/sync', requireAuth, syncLimiter, validate(syncBodySchema), async (req, res) => {
  const doctorId   = req.auth!.sub;
  const { operations } = req.body as z.infer<typeof syncBodySchema>;

  // Process in queued_at order
  const sorted = [...operations].sort(
    (a, b) => new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime(),
  );

  const results: SyncResult[] = [];

  for (const op of sorted) {
    try {
      if (op.entity_type === 'patient') {
        if (op.operation === 'update') {
          // ── Patient mobile update (D3 mobile edit flow) ──────────────────────
          const parsed = patientUpdatePayloadSchema.safeParse(op.payload);
          if (!parsed.success) {
            results.push({ local_id: op.local_id, status: 'error', message: parsed.error.errors[0]?.message });
            continue;
          }
          const p = parsed.data;

          // IDOR: the doctor in the payload must match the authenticated doctor
          if (p.doctor_id !== doctorId) {
            results.push({ local_id: op.local_id, status: 'error', message: 'doctor_id mismatch' });
            continue;
          }

          // Find patient by server_id (when already synced) or local_id (unsynced create + update in same batch)
          let patient = p.server_id
            ? await prisma.patient.findFirst({ where: { id: p.server_id, deletedAt: null } })
            : null;
          if (!patient) {
            patient = await prisma.patient.findFirst({ where: { localId: p.local_id, deletedAt: null } });
          }
          if (!patient) {
            results.push({ local_id: op.local_id, status: 'error', message: 'Patient not found' });
            continue;
          }

          // Ownership: only the doctor who registered this patient may update their mobile
          if (patient.createdBy !== doctorId) {
            results.push({ local_id: op.local_id, status: 'error', message: 'Not authorized to update this patient' });
            continue;
          }

          // Idempotency: already at the target value — succeed without a write
          if (patient.mobileNumber === p.mobile_number) {
            results.push({ local_id: op.local_id, status: 'success', server_id: patient.id });
            continue;
          }

          // UNIQUE conflict: new number must not belong to a different patient
          const mobileConflict = await prisma.patient.findFirst({
            where: { mobileNumber: p.mobile_number, deletedAt: null, id: { not: patient.id } },
          });
          if (mobileConflict) {
            results.push({ local_id: op.local_id, status: 'conflict', server_id: mobileConflict.id, message: 'Mobile number already registered to another patient' });
            continue;
          }

          await prisma.patient.update({
            where: { id: patient.id },
            data:  { mobileNumber: p.mobile_number },
          });

          // Audit — last 4 digits only; raw mobile never enters audit log (PII minimisation)
          await logAudit({
            event:     'patient.mobile_updated',
            actorId:   doctorId,
            actorRole: 'doctor',
            patientId: patient.id,
            ipAddress: req.ip,
            metadata:  { new_mobile_last4: p.mobile_number.slice(-4) },
          });

          results.push({ local_id: op.local_id, status: 'success', server_id: patient.id });

        } else {
          // ── Patient create ───────────────────────────────────────────────────
          const parsed = patientPayloadSchema.safeParse(op.payload);
          if (!parsed.success) {
            results.push({ local_id: op.local_id, status: 'error', message: parsed.error.errors[0]?.message });
            continue;
          }
          const p = parsed.data;

          const existing = await prisma.patient.findFirst({
            where: { mobileNumber: p.mobile_number, deletedAt: null },
          });
          if (existing) {
            results.push({ local_id: op.local_id, status: 'conflict', server_id: existing.id, message: 'Patient already registered' });
            continue;
          }

          const patient = await prisma.patient.create({
            data: {
              localId:      p.local_id,
              mobileNumber: p.mobile_number,
              name:         p.name,
              dateOfBirth:  p.date_of_birth ? new Date(p.date_of_birth) : null,
              gender:       p.gender as any,
              createdBy:    doctorId,
            },
          });
          results.push({ local_id: op.local_id, status: 'success', server_id: patient.id });
        }

      } else if (op.entity_type === 'visit') {
        const parsed = visitPayloadSchema.safeParse(op.payload);
        if (!parsed.success) {
          results.push({ local_id: op.local_id, status: 'error', message: parsed.error.errors[0]?.message });
          continue;
        }
        const v = parsed.data;

        // IDOR check — same as POST /visits
        if (v.doctor_id !== doctorId) {
          results.push({ local_id: op.local_id, status: 'error', message: 'doctor_id mismatch' });
          continue;
        }

        // Idempotency
        const existing = await prisma.visit.findFirst({ where: { localId: v.local_id, deletedAt: null } });
        if (existing) {
          results.push({ local_id: op.local_id, status: 'conflict', server_id: existing.id });
          continue;
        }

        const doctor = await prisma.doctor.findFirst({ where: { id: doctorId, deletedAt: null } });
        const visit  = await prisma.visit.create({
          data: {
            localId:        v.local_id,
            patientId:      v.patient_id,
            doctorId,
            clinicId:       doctor?.clinicId ?? null,
            visitDate:      new Date(v.visit_date),
            chiefComplaint: v.chief_complaint,
            noteText:       v.note_text,
            consentGranted: v.consent_granted,
            openedAt:       new Date(),
            syncedAt:       new Date(),
          },
        });
        results.push({ local_id: op.local_id, status: 'success', server_id: visit.id });

      } else if (op.entity_type === 'audit_event') {
        const parsed = auditEventPayloadSchema.safeParse(op.payload);
        if (!parsed.success) {
          results.push({ local_id: op.local_id, status: 'error', message: 'Invalid audit_event payload' });
          continue;
        }
        const a = parsed.data;

        await prisma.auditLog.create({
          data: {
            timestamp: new Date(a.created_at),
            event:     a.event_type,
            actorId:   a.doctor_id ?? doctorId,
            actorRole: 'doctor',
            patientId: a.patient_id,
            metadata:  a.metadata ? (a.metadata as import('@prisma/client').Prisma.InputJsonValue) : undefined,
            outcome:   'success',
          },
        });
        // No server_id returned for audit events (append-only)
        results.push({ local_id: op.local_id, status: 'success' });
      }
    } catch (err) {
      console.error(`[sync] Error processing ${op.entity_type} ${op.local_id}:`, err);
      results.push({ local_id: op.local_id, status: 'error', message: 'Server error processing operation' });
    }
  }

  await logAudit({
    event:     'sync.batch_processed',
    actorId:   doctorId,
    actorRole: 'doctor',
    ipAddress: req.ip,
    metadata:  { operation_count: sorted.length, result_summary: results.map((r) => r.status) },
  });

  res.json({ results });
});

export default router;
