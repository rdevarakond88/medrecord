/**
 * Visit routes — GET /patients/:id/visits, POST /visits, PATCH /visits/:id
 * Contract: docs/api-contracts.md — Visit Endpoints
 * Security: D3-H-1 (chief_complaint exclusion at SQL layer), D3-H-2 (consent in single round-trip)
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { logAudit } from '../utils/audit';

const router = Router();

// ─── GET /patients/:id/visits ─────────────────────────────────────────────────
// Returns visit history split by ownership + authoritative consent state.
// D3-H-1: chief_complaint excluded from other_doctor_visits when consent_granted=false
//         at the query/service layer — never relies on client suppression.

router.get('/patients/:id/visits', requireAuth, async (req, res) => {
  const doctorId  = req.auth!.sub;
  const patientId = req.params.id;

  try {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
    });
    if (!patient) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      return;
    }

    // D3-H-2: consent check in same round-trip
    const consent = await prisma.consent.findFirst({
      where: { patientId, doctorId, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    });
    const consentGranted = !!consent;
    const checkedAt      = new Date().toISOString();

    // My visits — always return full data
    const myVisitsRaw = await prisma.visit.findMany({
      where:   { patientId, doctorId, deletedAt: null },
      orderBy: { visitDate: 'desc' },
      include: { clinic: { select: { name: true } }, records: { where: { deletedAt: null }, select: { id: true } } },
    });

    // Other doctors' visits
    const otherVisitsRaw = await prisma.visit.findMany({
      where:   { patientId, NOT: { doctorId }, deletedAt: null },
      orderBy: { visitDate: 'desc' },
      include: { clinic: { select: { name: true } }, records: { where: { deletedAt: null }, select: { id: true } } },
    });

    const myVisits = myVisitsRaw.map((v) => ({
      id:              v.id,
      visit_date:      v.visitDate.toISOString().split('T')[0],
      chief_complaint: v.chiefComplaint,  // always present for own visits
      clinic_name:     v.clinic?.name ?? null,
      record_count:    v.records.length,
    }));

    // D3-H-1: exclude chief_complaint at this layer when consent_granted=false
    const otherVisits = otherVisitsRaw.map((v) => ({
      id:              v.id,
      visit_date:      v.visitDate.toISOString().split('T')[0],
      chief_complaint: consentGranted ? v.chiefComplaint : null,  // enforced here, not on client
      clinic_name:     v.clinic?.name ?? null,
      record_count:    v.records.length,
    }));

    await logAudit({
      event:     'visit.history_accessed',
      actorId:   doctorId,
      actorRole: 'doctor',
      patientId,
      ipAddress: req.ip,
    });

    res.json({
      my_visits:            myVisits,
      other_doctor_visits:  otherVisits,
      consent_granted:      consentGranted,
      checked_at:           checkedAt,
    });
  } catch (err) {
    console.error('[GET /patients/:id/visits]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch visits' } });
  }
});

// ─── POST /visits ─────────────────────────────────────────────────────────────

const createVisitSchema = z.object({
  local_id:        z.string().uuid('local_id must be a UUID'),
  patient_id:      z.string().uuid('patient_id must be a UUID'),
  doctor_id:       z.string().uuid('doctor_id must be a UUID'),
  visit_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'visit_date must be YYYY-MM-DD'),
  chief_complaint: z.string().optional(),
  note_text:       z.string().optional(),
  consent_granted: z.boolean().optional(),
});

router.post('/visits', requireAuth, validate(createVisitSchema), async (req, res) => {
  const doctorId = req.auth!.sub;
  const body     = req.body as z.infer<typeof createVisitSchema>;

  // IDOR check — doctor_id in body must match JWT sub (api-contracts.md)
  if (body.doctor_id !== doctorId) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'doctor_id does not match authenticated user' } });
    return;
  }

  try {
    // Idempotency — if local_id already exists, return existing record
    const existing = await prisma.visit.findFirst({
      where: { localId: body.local_id, deletedAt: null },
    });
    if (existing) {
      res.status(201).json({ visitId: existing.id, createdAt: existing.createdAt.toISOString() });
      return;
    }

    const patient = await prisma.patient.findFirst({
      where: { id: body.patient_id, deletedAt: null },
    });
    if (!patient) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      return;
    }

    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, deletedAt: null },
    });

    const visit = await prisma.visit.create({
      data: {
        localId:        body.local_id,
        patientId:      body.patient_id,
        doctorId,                          // always from JWT
        clinicId:       doctor?.clinicId ?? null,
        visitDate:      new Date(body.visit_date),
        chiefComplaint: body.chief_complaint,
        noteText:       body.note_text,
        consentGranted: body.consent_granted,
        openedAt:       new Date(),
        syncedAt:       new Date(),
      },
    });

    await logAudit({
      event:      'visit.created',
      actorId:    doctorId,
      actorRole:  'doctor',
      resourceId: visit.id,
      patientId:  body.patient_id,
      ipAddress:  req.ip,
    });

    res.status(201).json({ visitId: visit.id, createdAt: visit.createdAt.toISOString() });
  } catch (err) {
    console.error('[POST /visits]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create visit' } });
  }
});

// ─── PATCH /visits/:id ────────────────────────────────────────────────────────

const updateVisitSchema = z.object({
  status:          z.enum(['submitted']).optional(),
  chief_complaint: z.string().optional(),
}).refine((d) => d.status || d.chief_complaint, {
  message: 'Provide at least one field to update',
});

router.patch('/visits/:id', requireAuth, validate(updateVisitSchema), async (req, res) => {
  const doctorId = req.auth!.sub;
  const visitId  = req.params.id;
  const body     = req.body as z.infer<typeof updateVisitSchema>;

  try {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, deletedAt: null },
    });
    if (!visit) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Visit not found' } });
      return;
    }

    // Only the opening doctor may update
    if (visit.doctorId !== doctorId) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the opening doctor can update this visit' } });
      return;
    }

    const updated = await prisma.visit.update({
      where: { id: visitId },
      data: {
        ...(body.status          ? { status: body.status as any, submittedAt: new Date() } : {}),
        ...(body.chief_complaint ? { chiefComplaint: body.chief_complaint } : {}),
      },
    });

    await logAudit({
      event:      'visit.updated',
      actorId:    doctorId,
      actorRole:  'doctor',
      resourceId: visitId,
      patientId:  visit.patientId,
      ipAddress:  req.ip,
    });

    res.json({ visit: updated });
  } catch (err) {
    console.error('[PATCH /visits/:id]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update visit' } });
  }
});

export default router;
