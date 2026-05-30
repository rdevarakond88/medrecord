/**
 * Patient-facing routes — all require Patient JWT (role: "patient")
 *   GET    /patient/profile
 *   PATCH  /patient/profile
 *   GET    /patient/timeline
 *   GET    /patient/visits/:id
 *   GET    /patient/consents
 *   DELETE /patient/consents/:id
 *   GET    /patient/consent-requests
 *   POST   /patient/consent-requests/:id/respond
 *
 * Contract: docs/api-contracts.md — Patient App Endpoints
 * Security: patient_id always derived from JWT sub — never from request body/params alone
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma';
import { requirePatientAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { logAudit } from '../utils/audit';

const router = Router();

// All routes in this file require patient auth
router.use(requirePatientAuth);

// ─── GET /patient/profile ─────────────────────────────────────────────────────

router.get('/patient/profile', async (req, res) => {
  const patientId = req.auth!.sub;

  try {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
    });

    if (!patient) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      return;
    }

    await logAudit({
      event:     'patient.profile_accessed',
      actorId:   patientId,
      actorRole: 'patient',
      patientId,
      ipAddress: req.ip,
    });

    res.json({
      profile: {
        id:                 patient.id,
        name:               patient.name,
        mobile_number:      patient.mobileNumber,
        date_of_birth:      patient.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : null,
        preferred_language: patient.preferredLanguage ?? 'English',
      },
    });
  } catch (err) {
    console.error('[GET /patient/profile]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch profile' } });
  }
});

// ─── PATCH /patient/profile ───────────────────────────────────────────────────

const VALID_LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Bengali'] as const;

const updateProfileSchema = z.object({
  name:               z.string().min(1).max(255).optional(),
  date_of_birth:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_of_birth must be YYYY-MM-DD').optional(),
  preferred_language: z.enum(VALID_LANGUAGES).optional(),
}).refine((d) => d.name !== undefined || d.date_of_birth !== undefined || d.preferred_language !== undefined, {
  message: 'Provide at least one field to update',
});

// Mobile number is the patient's immutable primary key (locked decision, Step 28c).
// Guard runs BEFORE validate() so we see the raw body before Zod strips unknown fields.
router.patch('/patient/profile',
  (req, res, next) => {
    if (req.body && typeof req.body === 'object' && 'mobile_number' in req.body) {
      res.status(400).json({
        error: {
          code:    'MOBILE_IMMUTABLE',
          message: 'Mobile number cannot be changed. Contact support for account recovery.',
        },
      });
      return;
    }
    next();
  },
  validate(updateProfileSchema),
  async (req, res) => {
    const patientId = req.auth!.sub;
    const body      = req.body as z.infer<typeof updateProfileSchema>;

    try {
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, deletedAt: null },
      });
      if (!patient) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient not found' } });
        return;
      }

      const updated = await prisma.patient.update({
        where: { id: patientId },
        data: {
          ...(body.name               !== undefined ? { name: body.name }                                       : {}),
          ...(body.date_of_birth      !== undefined ? { dateOfBirth: new Date(body.date_of_birth) }             : {}),
          ...(body.preferred_language !== undefined ? { preferredLanguage: body.preferred_language }             : {}),
        },
      });

      await logAudit({
        event:     'patient.profile_updated',
        actorId:   patientId,
        actorRole: 'patient',
        patientId,
        ipAddress: req.ip,
      });

      res.json({
        profile: {
          id:                 updated.id,
          name:               updated.name,
          mobile_number:      updated.mobileNumber,
          date_of_birth:      updated.dateOfBirth ? updated.dateOfBirth.toISOString().split('T')[0] : null,
          preferred_language: updated.preferredLanguage ?? 'English',
        },
      });
    } catch (err) {
      console.error('[PATCH /patient/profile]', err);
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update profile' } });
    }
  },
);

// ─── GET /patient/timeline ────────────────────────────────────────────────────
// All visits for this patient, newest first.
// Records filtered to is_visible_to_patient = true.

router.get('/patient/timeline', async (req, res) => {
  const patientId = req.auth!.sub;

  try {
    const visits = await prisma.visit.findMany({
      where:   { patientId, deletedAt: null },
      orderBy: { visitDate: 'desc' },
      include: {
        doctor:  { select: { name: true } },
        clinic:  { select: { name: true } },
        records: {
          where:   { deletedAt: null, isVisibleToPatient: true },
          orderBy: { createdAt: 'asc' },
          select:  { id: true, type: true, contentText: true },
        },
      },
    });

    await logAudit({
      event:     'patient.timeline_accessed',
      actorId:   patientId,
      actorRole: 'patient',
      patientId,
      ipAddress: req.ip,
    });

    const result = visits.map((v) => ({
      id:          v.id,
      visit_date:  v.visitDate.toISOString().split('T')[0],
      doctor_name: v.doctor.name,
      clinic_name: v.clinic?.name ?? null,
      summary:     v.chiefComplaint ?? null,
      records:     v.records.map((r) => ({
        id:          r.id,
        type:        r.type,
        // First 100 chars of content_text as preview
        ...(r.type === 'note'
          ? { preview:     r.contentText ? r.contentText.slice(0, 100) : null }
          : { ocr_preview: r.contentText ? r.contentText.slice(0, 100) : null }),
      })),
    }));

    res.json({ visits: result });
  } catch (err) {
    console.error('[GET /patient/timeline]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch timeline' } });
  }
});

// ─── GET /patient/visits/:id ──────────────────────────────────────────────────
// Full visit detail with visible records.
// Security: visit.patient_id must equal JWT sub.

router.get('/patient/visits/:id', async (req, res) => {
  const patientId = req.auth!.sub;
  const visitId   = req.params.id;

  try {
    const visit = await prisma.visit.findFirst({
      where:   { id: visitId, deletedAt: null },
      include: {
        doctor:  { select: { name: true } },
        clinic:  { select: { name: true } },
        records: {
          where:   { deletedAt: null, isVisibleToPatient: true },
          orderBy: { createdAt: 'asc' },
          select:  { id: true, type: true, contentText: true, ocrStatus: true, createdAt: true },
        },
      },
    });

    if (!visit) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Visit not found' } });
      return;
    }

    // IDOR guard — visit must belong to this patient
    if (visit.patientId !== patientId) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }

    await logAudit({
      event:      'patient.visit_accessed',
      actorId:    patientId,
      actorRole:  'patient',
      resourceId: visitId,
      patientId,
      ipAddress:  req.ip,
    });

    res.json({
      visit: {
        id:          visit.id,
        visit_date:  visit.visitDate.toISOString().split('T')[0],
        doctor_name: visit.doctor.name,
        clinic_name: visit.clinic?.name ?? null,
        summary:     visit.chiefComplaint ?? null,
        records:     visit.records.map((r) => ({
          id:           r.id,
          type:         r.type,
          content_text: r.contentText ?? null,
          ocr_status:   r.type === 'scan' ? r.ocrStatus : null,
          created_at:   r.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    console.error('[GET /patient/visits/:id]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch visit' } });
  }
});

// ─── GET /patient/consents ────────────────────────────────────────────────────
// Active consent grants + pending async requests for this patient.

router.get('/patient/consents', async (req, res) => {
  const patientId = req.auth!.sub;

  try {
    const [activeConsents, pendingRequests] = await Promise.all([
      prisma.consent.findMany({
        where:   { patientId, revokedAt: null },
        orderBy: { grantedAt: 'desc' },
        include: {
          doctor: { select: { name: true } },
          clinic: { select: { name: true } },
        },
      }),
      prisma.consentPendingRequest.findMany({
        where:   { patientId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
        include: {
          doctor: {
            select: { name: true, clinic: { select: { name: true } } },
          },
        },
      }),
    ]);

    await logAudit({
      event:     'patient.consents_accessed',
      actorId:   patientId,
      actorRole: 'patient',
      patientId,
      ipAddress: req.ip,
    });

    res.json({
      active: activeConsents.map((c) => ({
        id:          c.id,
        doctor_name: c.doctor?.name ?? 'Unknown Doctor',
        clinic_name: c.clinic?.name ?? null,
        granted_at:  c.grantedAt.toISOString(),
      })),
      pending: pendingRequests.map((r) => ({
        id:           r.id,
        doctor_name:  r.doctor.name,
        clinic_name:  r.doctor.clinic?.name ?? null,
        requested_at: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[GET /patient/consents]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch consents' } });
  }
});

// ─── POST /patient/consent-requests/:id/respond ───────────────────────────────
// Patient approves or denies a pending consent request.

const respondSchema = z.object({
  action: z.enum(['approve', 'deny']),
});

router.post('/patient/consent-requests/:id/respond', validate(respondSchema), async (req, res) => {
  const patientId = req.auth!.sub;
  const requestId = req.params.id;
  const { action } = req.body as z.infer<typeof respondSchema>;

  try {
    const pendingReq = await prisma.consentPendingRequest.findUnique({
      where: { id: requestId },
    });

    if (!pendingReq || pendingReq.status !== 'pending') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Consent request not found or already actioned' } });
      return;
    }

    // IDOR guard — request must belong to this patient
    if (pendingReq.patientId !== patientId) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }

    const now = new Date();

    if (action === 'deny') {
      await prisma.consentPendingRequest.update({
        where: { id: requestId },
        data:  { status: 'denied', respondedAt: now },
      });

      await logAudit({
        event:     'consent.pending_denied',
        actorId:   patientId,
        actorRole: 'patient',
        patientId,
        ipAddress: req.ip,
        metadata:  { request_id: requestId, doctor_id: pendingReq.doctorId },
      });

      res.json({ denied: true });
      return;
    }

    // Approve — create Consent + mark request resolved
    const [consent] = await prisma.$transaction([
      prisma.consent.create({
        data: {
          patientId: patientId,
          doctorId:  pendingReq.doctorId,
          scope:     'read_all',
          grantedBy: 'patient',
          grantedAt: now,
        },
      }),
      prisma.consentPendingRequest.update({
        where: { id: requestId },
        data:  { status: 'approved', respondedAt: now },
      }),
    ]);

    await logAudit({
      event:      'consent.granted',
      actorId:    patientId,
      actorRole:  'patient',
      resourceId: consent.id,
      patientId,
      ipAddress:  req.ip,
      metadata:   { request_id: requestId, doctor_id: pendingReq.doctorId },
    });

    res.json({ consent_id: consent.id, granted_at: consent.grantedAt.toISOString() });
  } catch (err) {
    console.error('[POST /patient/consent-requests/:id/respond]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to process consent response' } });
  }
});

// ─── DELETE /patient/consents/:id ────────────────────────────────────────────
// Patient revokes an active consent grant.

router.delete('/patient/consents/:id', async (req, res) => {
  const patientId = req.auth!.sub;
  const consentId = req.params.id;

  try {
    const consent = await prisma.consent.findUnique({ where: { id: consentId } });

    if (!consent || consent.revokedAt) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Consent not found or already revoked' } });
      return;
    }

    // IDOR guard — consent must belong to this patient
    if (consent.patientId !== patientId) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
      return;
    }

    const revokedAt = new Date();

    // BUG-IT-4 fix: revoke ALL active consents for this doctor-patient pair, not just
    // the specific record by ID. Multiple consent records can co-exist (e.g. one seeded
    // at DB setup + one created via D9 OTP flow). Revoking only one leaves "ghost consent"
    // records that cause GET /patients/:id/visits to return consent_granted=true.
    await prisma.consent.updateMany({
      where: { patientId, doctorId: consent.doctorId, revokedAt: null },
      data:  { revokedAt },
    });

    await logAudit({
      event:      'consent.revoked',
      actorId:    patientId,
      actorRole:  'patient',
      resourceId: consentId,
      patientId,
      ipAddress:  req.ip,
    });

    res.json({ revoked_at: revokedAt.toISOString() });
  } catch (err) {
    console.error('[DELETE /patient/consents/:id]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to revoke consent' } });
  }
});

export default router;
