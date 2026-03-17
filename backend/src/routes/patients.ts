/**
 * Patient routes — GET /patients/lookup, POST /patients, GET /patients/:id
 * Contract: docs/api-contracts.md — Patient Endpoints
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { patientLookupLimiter } from '../middleware/rateLimit';
import { logAudit } from '../utils/audit';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function hasPatientAccess(doctorId: string, patientId: string): Promise<boolean> {
  // Access = doctor created the patient OR has an active consent grant
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null, createdBy: doctorId },
  });
  if (patient) return true;

  const consent = await prisma.consent.findFirst({
    where: { patientId, doctorId, revokedAt: null },
  });
  return !!consent;
}

async function getConsentState(doctorId: string, patientId: string) {
  const consent = await prisma.consent.findFirst({
    where: { patientId, doctorId, revokedAt: null },
    orderBy: { grantedAt: 'desc' },
  });
  return consent;
}

// ─── GET /patients/lookup ─────────────────────────────────────────────────────

const lookupSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'mobile must be 10 digits starting with 6–9'),
});

router.get(
  '/patients/lookup',
  requireAuth,
  patientLookupLimiter,
  validateQuery(lookupSchema),
  async (req, res) => {
    const doctorId   = req.auth!.sub;
    const mobile     = req.query.mobile as string;

    try {
      const patient = await prisma.patient.findFirst({
        where: { mobileNumber: mobile, deletedAt: null },
      });

      if (!patient) {
        res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'No patient found with this mobile number' } });
        return;
      }

      const consent      = await getConsentState(doctorId, patient.id);
      const lastVisit    = await prisma.visit.findFirst({
        where:   { patientId: patient.id, deletedAt: null },
        orderBy: { visitDate: 'desc' },
        select:  { visitDate: true },
      });

      await logAudit({
        event:     'patient.searched',
        actorId:   doctorId,
        actorRole: 'doctor',
        patientId: patient.id,
        ipAddress: req.ip,
      });

      res.json({
        patient: {
          id:              patient.id,
          name:            patient.name,
          mobile_number:   patient.mobileNumber,
          date_of_birth:   patient.dateOfBirth?.toISOString().split('T')[0] ?? null,
          gender:          patient.gender,
          consent_granted: !!consent,
          last_visit_date: lastVisit?.visitDate?.toISOString().split('T')[0] ?? null,
        },
      });
    } catch (err) {
      console.error('[patients/lookup]', err);
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Lookup failed' } });
    }
  },
);

// ─── POST /patients ───────────────────────────────────────────────────────────

const createPatientSchema = z.object({
  local_id:      z.string().uuid().optional(),
  mobile_number: z.string().regex(/^[6-9]\d{9}$/, 'mobile_number must be 10 digits starting with 6–9'),
  name:          z.string().max(255).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender:        z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
});

router.post('/patients', requireAuth, validate(createPatientSchema), async (req, res) => {
  const doctorId = req.auth!.sub;
  const body     = req.body as z.infer<typeof createPatientSchema>;

  try {
    const existing = await prisma.patient.findFirst({
      where: { mobileNumber: body.mobile_number, deletedAt: null },
    });
    if (existing) {
      res.status(409).json({ error: { code: 'CONFLICT', patient_id: existing.id } });
      return;
    }

    const patient = await prisma.patient.create({
      data: {
        localId:      body.local_id,
        mobileNumber: body.mobile_number,
        name:         body.name,
        dateOfBirth:  body.date_of_birth ? new Date(body.date_of_birth) : null,
        gender:       body.gender as any,
        createdBy:    doctorId, // always from JWT — never trust body
      },
    });

    await logAudit({
      event:     'patient.created',
      actorId:   doctorId,
      actorRole: 'doctor',
      patientId: patient.id,
      ipAddress: req.ip,
    });

    res.status(201).json({ patient });
  } catch (err) {
    console.error('[POST /patients]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create patient' } });
  }
});

// ─── GET /patients/:id ────────────────────────────────────────────────────────

router.get('/patients/:id', requireAuth, async (req, res) => {
  const doctorId  = req.auth!.sub;
  const patientId = req.params.id;

  try {
    if (!(await hasPatientAccess(doctorId, patientId))) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No access to this patient' } });
      return;
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
    });
    if (!patient) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      return;
    }

    const consent = await getConsentState(doctorId, patientId);

    await logAudit({
      event:     'patient.accessed',
      actorId:   doctorId,
      actorRole: 'doctor',
      patientId: patient.id,
      ipAddress: req.ip,
    });

    res.json({
      patient,
      consent: consent
        ? { granted_at: consent.grantedAt.toISOString(), scope: consent.scope }
        : null,
    });
  } catch (err) {
    console.error('[GET /patients/:id]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch patient' } });
  }
});

export default router;
