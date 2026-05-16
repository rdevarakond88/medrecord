/**
 * Consent routes
 *   GET  /patients/:id/consent/check
 *   POST /consent/request   — initiate OTP flow (fixes C-1: replaces old bypass endpoint)
 *   POST /consent/verify    — verify OTP and create consent grant
 *   DELETE /consent/:id     — revoke consent (patient-initiated)
 *
 * Contract: docs/api-contracts.md — Consent Endpoints
 * Security: docs/security-spec.md — Consent OTP Security
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { consentRequestLimiter, consentVerifyLimiter } from '../middleware/rateLimit';
import { generateOtp, generateOtpToken, hashOtp, checkOtp } from '../utils/otp';
import { logAudit } from '../utils/audit';

const router = Router();

const OTP_TTL_SECONDS = 600; // 10 minutes — confirmed in api-contracts.md
const MAX_ATTEMPTS    = 3;

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

// ─── POST /consent/request ────────────────────────────────────────────────────
// Rate limit applied AFTER requireAuth so keyGenerator has access to req.auth.sub.

const consentRequestSchema = z.object({
  patient_id: z.string().uuid('patient_id must be a valid UUID'),
});

router.post(
  '/consent/request',
  requireAuth,
  consentRequestLimiter,
  validate(consentRequestSchema),
  async (req, res) => {
    const doctorId  = req.auth!.sub;
    const patientId = (req.body as z.infer<typeof consentRequestSchema>).patient_id;

    try {
      // Fetch patient to get their mobile number for the OTP SMS
      const patient = await prisma.patient.findUnique({ where: { id: patientId } });
      if (!patient) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient not found' } });
        return;
      }

      // Invalidate any prior active consent OTPs for this (doctor, patient) pair
      await prisma.consentOtpRequest.updateMany({
        where: {
          doctorId,
          patientId,
          usedAt:    null,
          expiresAt: { gt: new Date() },
        },
        data: { expiresAt: new Date() },
      });

      const rawOtp    = generateOtp();
      const otpToken  = generateOtpToken();
      const otpHash   = await hashOtp(rawOtp);
      const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

      await prisma.consentOtpRequest.create({
        data: { token: otpToken, doctorId, patientId, otpHash, expiresAt },
      });

      // In test mode log OTP to console; in production send SMS
      if (process.env.TEST_OTP_BYPASS === 'true') {
        console.log(`[CONSENT OTP] patient=${patient.mobileNumber} otp=${rawOtp} token=${otpToken}`);
      } else {
        // TODO: wire real SMS provider (Twilio / AWS SNS / MSG91)
        console.log(`[SMS] Send OTP ${rawOtp} to ${patient.mobileNumber}`);
      }

      await logAudit({
        event:     'consent.otp_sent',
        actorId:   doctorId,
        actorRole: 'doctor',
        patientId,
        ipAddress: req.ip,
      });

      res.json({ otp_token: otpToken, expires_in: OTP_TTL_SECONDS });
    } catch (err) {
      console.error('[POST /consent/request]', err);
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to initiate consent request' } });
    }
  },
);

// ─── POST /consent/verify ─────────────────────────────────────────────────────

const consentVerifySchema = z.object({
  otp_token: z.string().min(1, 'otp_token is required'),
  otp:       z.string().regex(/^\d{6}$/, 'otp must be exactly 6 digits'),
});

router.post(
  '/consent/verify',
  requireAuth,
  consentVerifyLimiter,
  validate(consentVerifySchema),
  async (req, res) => {
    const doctorId = req.auth!.sub;
    const { otp_token, otp } = req.body as z.infer<typeof consentVerifySchema>;

    try {
      const record = await prisma.consentOtpRequest.findUnique({
        where: { token: otp_token },
      });

      // Token unknown, already used, or expired
      if (!record || record.usedAt || record.expiresAt <= new Date()) {
        res.status(410).json({ error: 'otp_expired_or_exhausted' });
        return;
      }

      // Token belongs to a different doctor — reject
      if (record.doctorId !== doctorId) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Token does not belong to this doctor' } });
        return;
      }

      // All attempts exhausted
      if (record.attempts >= MAX_ATTEMPTS) {
        res.status(410).json({ error: 'otp_expired_or_exhausted' });
        return;
      }

      const correct = await checkOtp(otp, record.otpHash);

      if (!correct) {
        const newAttempts = record.attempts + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          // Exhaust the token — treat it as used so no further attempts are possible
          await prisma.consentOtpRequest.update({
            where: { token: otp_token },
            data:  { attempts: newAttempts, usedAt: new Date() },
          });
          res.status(410).json({ error: 'otp_expired_or_exhausted' });
        } else {
          await prisma.consentOtpRequest.update({
            where: { token: otp_token },
            data:  { attempts: newAttempts },
          });
          res.status(400).json({
            error:             'invalid_otp',
            attempts_remaining: MAX_ATTEMPTS - newAttempts,
          });
        }
        return;
      }

      // OTP correct — create consent grant and purge the OTP token
      const [consent] = await prisma.$transaction([
        prisma.consent.create({
          data: {
            patientId: record.patientId,
            doctorId,
            scope:     'read_all',
            grantedBy: 'patient',
            grantedAt: new Date(),
          },
        }),
        prisma.consentOtpRequest.update({
          where: { token: otp_token },
          data:  { usedAt: new Date(), attempts: record.attempts + 1 },
        }),
      ]);

      await logAudit({
        event:     'consent.granted',
        actorId:   doctorId,
        actorRole: 'doctor',
        patientId: record.patientId,
        ipAddress: req.ip,
      });

      res.json({
        consent_id:  consent.id,
        granted_at:  consent.grantedAt.toISOString(),
        scope:       consent.scope,
      });
    } catch (err) {
      console.error('[POST /consent/verify]', err);
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to verify consent OTP' } });
    }
  },
);

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

// ─── POST /consent/pending-request ───────────────────────────────────────────
// Doctor creates an async consent request for a patient who has the Patient App
// (consent-layer-spec Flow 2A). No OTP — appears in patient's P4 screen.

const pendingRequestSchema = z.object({
  patient_id: z.string().uuid('patient_id must be a valid UUID'),
});

router.post(
  '/consent/pending-request',
  requireAuth,
  consentRequestLimiter,
  validate(pendingRequestSchema),
  async (req, res) => {
    const doctorId  = req.auth!.sub;
    const patientId = (req.body as z.infer<typeof pendingRequestSchema>).patient_id;

    try {
      const patient = await prisma.patient.findUnique({ where: { id: patientId } });
      if (!patient) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient not found' } });
        return;
      }

      // Reject if active consent already exists
      const activeConsent = await prisma.consent.findFirst({
        where: { patientId, doctorId, revokedAt: null },
      });
      if (activeConsent) {
        res.status(409).json({ error: { code: 'CONFLICT', message: 'Active consent already exists' } });
        return;
      }

      // Replace any prior unresponded pending request for this (doctor, patient) pair
      await prisma.consentPendingRequest.updateMany({
        where:  { doctorId, patientId, status: 'pending' },
        data:   { status: 'denied', respondedAt: new Date() }, // superseded by new request
      });

      const pendingReq = await prisma.consentPendingRequest.create({
        data: { doctorId, patientId },
      });

      await logAudit({
        event:     'consent.pending_request_created',
        actorId:   doctorId,
        actorRole: 'doctor',
        patientId,
        ipAddress: req.ip,
      });

      res.json({ request_id: pendingReq.id, created_at: pendingReq.createdAt.toISOString() });
    } catch (err) {
      console.error('[POST /consent/pending-request]', err);
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create consent request' } });
    }
  },
);

export default router;
