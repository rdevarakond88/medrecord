/**
 * Consent routes — GET /patients/:id/consent/check, POST /consent, DELETE /consent/:id
 * Contract: docs/api-contracts.md — Consent Endpoints
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { consentLimiter } from '../middleware/rateLimit';
import { logAudit } from '../utils/audit';

const router = Router();

// ─── GET /patients/:id/consent/check ─────────────────────────────────────────

router.get('/patients/:id/consent/check', requireAuth, async (req, res) => {
  const doctorId  = req.auth!.sub;
  const patientId = req.params.id;

  try {
    const consent = await prisma.consent.findFirst({
      where:   { patientId, doctorId, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    });

    await logAudit({
      event:     'consent.checked',
      actorId:   doctorId,
      actorRole: 'doctor',
      patientId,
      ipAddress: req.ip,
    });

    if (!consent) {
      res.json({ has_consent: false, scope: null, granted_at: null });
      return;
    }

    res.json({
      has_consent: true,
      scope:       consent.scope,
      granted_at:  consent.grantedAt.toISOString(),
    });
  } catch (err) {
    console.error('[GET /patients/:id/consent/check]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Consent check failed' } });
  }
});

// ─── POST /consent ────────────────────────────────────────────────────────────

const createConsentSchema = z.object({
  patient_id:  z.string().uuid(),
  doctor_id:   z.string().uuid().optional(),
  clinic_id:   z.string().uuid().optional(),
  scope:       z.enum(['read_all', 'read_from_date', 'read_new_only']).optional().default('read_all'),
  granted_by:  z.enum(['patient', 'proxy']),
});

router.post('/consent', requireAuth, consentLimiter, validate(createConsentSchema), async (req, res) => {
  const doctorId = req.auth!.sub;
  const body     = req.body as z.infer<typeof createConsentSchema>;

  try {
    const consent = await prisma.consent.create({
      data: {
        patientId:  body.patient_id,
        doctorId:   body.doctor_id ?? doctorId,
        clinicId:   body.clinic_id,
        scope:      body.scope as any,
        grantedBy:  body.granted_by as any,
        grantedAt:  new Date(),
      },
    });

    await logAudit({
      event:     'consent.granted',
      actorId:   doctorId,
      actorRole: 'doctor',
      patientId: body.patient_id,
      ipAddress: req.ip,
    });

    res.status(201).json({ consent });
  } catch (err) {
    console.error('[POST /consent]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to grant consent' } });
  }
});

// ─── DELETE /consent/:id ──────────────────────────────────────────────────────

router.delete('/consent/:id', requireAuth, async (req, res) => {
  const consentId = req.params.id;

  try {
    const consent = await prisma.consent.findUnique({ where: { id: consentId } });
    if (!consent || consent.revokedAt) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Consent not found or already revoked' } });
      return;
    }

    const revokedAt = new Date();
    await prisma.consent.update({
      where: { id: consentId },
      data:  { revokedAt },
    });

    await logAudit({
      event:     'consent.revoked',
      actorId:   req.auth!.sub,
      actorRole: 'doctor',
      patientId: consent.patientId,
      ipAddress: req.ip,
    });

    res.json({ revoked_at: revokedAt.toISOString() });
  } catch (err) {
    console.error('[DELETE /consent/:id]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to revoke consent' } });
  }
});

export default router;
