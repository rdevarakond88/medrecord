/**
 * Auth routes — POST /auth/send-otp, POST /auth/verify-otp, POST /auth/refresh
 * Contract: docs/api-contracts.md — Auth Endpoints
 * Security: docs/security-spec.md — Authentication, OTP Security
 */
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db/prisma';
import { validate } from '../middleware/validate';
import { otpSendLimiter, otpVerifyLimiter } from '../middleware/rateLimit';
import {
  generateOtp, generateOtpToken, hashOtp, checkOtp, hashRefreshToken,
} from '../utils/otp';
import { signAccessToken, getRefreshTokenExpiry } from '../utils/jwt';
import { logAudit } from '../utils/audit';

const router = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const sendOtpSchema = z.object({
  mobile_number: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'mobile_number must be 10 digits starting with 6–9'),
  role:    z.enum(['doctor', 'patient']),
  channel: z.enum(['sms', 'whatsapp']).optional().default('sms'),
});

const verifyOtpSchema = z.object({
  otp_token: z.string().min(1, 'otp_token is required'),
  otp:       z.string().regex(/^\d{6}$/, 'otp must be exactly 6 digits'),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token is required'),
});

// ─── POST /auth/send-otp ─────────────────────────────────────────────────────

router.post('/auth/send-otp', otpSendLimiter, validate(sendOtpSchema), async (req, res) => {
  const { mobile_number, role } = req.body as z.infer<typeof sendOtpSchema>;

  try {
    // Invalidate any existing active OTPs for this mobile
    await prisma.otpRequest.updateMany({
      where: {
        mobileNumber: mobile_number,
        usedAt:       null,
        expiresAt:    { gt: new Date() },
      },
      data: { expiresAt: new Date() },
    });

    const rawOtp    = generateOtp();
    const otpToken  = generateOtpToken();
    const otpHash   = await hashOtp(rawOtp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.otpRequest.create({
      data: { token: otpToken, mobileNumber: mobile_number, otpHash, role, expiresAt },
    });

    // OTP log — dev/bypass only; never logged in production
    if (process.env.NODE_ENV !== 'production' || process.env.TEST_OTP_BYPASS === 'true') {
      console.log(`[OTP-DEV] ${mobile_number}: ${rawOtp}  (token: ${otpToken})`);
    }
    if (process.env.TEST_OTP_BYPASS === 'true') {
      console.log(`[OTP] Test bypass is ON — you may also enter: 000000`);
    }

    await logAudit({
      event:    'auth.otp_sent',
      metadata: { mobile_number, role },
      ipAddress: req.ip,
    });

    res.json({ otp_token: otpToken, expires_in: 300 });
  } catch (err) {
    console.error('[send-otp]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to send OTP' } });
  }
});

// ─── POST /auth/verify-otp ───────────────────────────────────────────────────

router.post('/auth/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), async (req, res) => {
  const { otp_token, otp } = req.body as z.infer<typeof verifyOtpSchema>;

  try {
    const otpRecord = await prisma.otpRequest.findUnique({ where: { token: otp_token } });

    if (!otpRecord) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid OTP token' } });
      return;
    }
    if (otpRecord.usedAt) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'OTP already used' } });
      return;
    }
    if (otpRecord.expiresAt < new Date()) {
      res.status(401).json({ error: { code: 'OTP_EXPIRED', message: 'OTP expired. Request a new one.' } });
      return;
    }
    if (otpRecord.attempts >= 3) {
      res.status(401).json({
        error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many failed attempts. Request a new OTP.' },
      });
      return;
    }

    const valid = await checkOtp(otp, otpRecord.otpHash);

    if (!valid) {
      await prisma.otpRequest.update({
        where: { id: otpRecord.id },
        data:  { attempts: { increment: 1 } },
      });
      await logAudit({
        event:    'auth.otp_failed',
        metadata: { mobile_number: otpRecord.mobileNumber },
        ipAddress: req.ip,
        outcome:  'failure',
      });
      res.status(401).json({ error: { code: 'WRONG_OTP', message: 'Invalid OTP' } });
      return;
    }

    // Mark OTP as used immediately — prevents replay
    await prisma.otpRequest.update({
      where: { id: otpRecord.id },
      data:  { usedAt: new Date() },
    });

    // Route to doctor or patient based on OTP role
    if (otpRecord.role === 'patient') {
      const patient = await prisma.patient.findFirst({
        where: { mobileNumber: otpRecord.mobileNumber, deletedAt: null },
      });

      if (!patient) {
        await logAudit({
          event:    'auth.new_user',
          metadata: { mobile_number: otpRecord.mobileNumber, role: 'patient' },
          ipAddress: req.ip,
        });
        res.json({ status: 'new_user' });
        return;
      }

      const rawRefreshToken  = uuidv4();
      const refreshTokenHash = hashRefreshToken(rawRefreshToken);

      await prisma.patientRefreshToken.create({
        data: {
          patientId: patient.id,
          tokenHash: refreshTokenHash,
          expiresAt: getRefreshTokenExpiry(),
        },
      });

      const accessToken = signAccessToken({
        sub:       patient.id,
        role:      'patient',
        clinic_id: null,
        device_id: null,
      });

      await logAudit({
        event:     'auth.login',
        actorId:   patient.id,
        actorRole: 'patient',
        patientId: patient.id,
        ipAddress: req.ip,
      });

      res.json({
        access_token:  accessToken,
        refresh_token: rawRefreshToken,
        expires_in:    86400,
        user: {
          id:            patient.id,
          role:          'patient',
          name:          patient.name,
          mobile_number: patient.mobileNumber,
        },
      });
      return;
    }

    // Doctor flow
    const doctor = await prisma.doctor.findFirst({
      where: { mobileNumber: otpRecord.mobileNumber, deletedAt: null },
    });

    if (!doctor) {
      // New user — registration required (not yet implemented in v1)
      await logAudit({
        event:    'auth.new_user',
        metadata: { mobile_number: otpRecord.mobileNumber },
        ipAddress: req.ip,
      });
      res.json({ status: 'new_user' });
      return;
    }

    // Issue tokens
    const rawRefreshToken  = uuidv4();
    const refreshTokenHash = hashRefreshToken(rawRefreshToken);

    await prisma.refreshToken.create({
      data: {
        doctorId:  doctor.id,
        tokenHash: refreshTokenHash,
        expiresAt: getRefreshTokenExpiry(),
      },
    });

    const accessToken = signAccessToken({
      sub:       doctor.id,
      role:      'doctor',
      clinic_id: doctor.clinicId,
      device_id: null,
    });

    await logAudit({
      event:     'auth.login',
      actorId:   doctor.id,
      actorRole: 'doctor',
      ipAddress: req.ip,
    });

    res.json({
      access_token:  accessToken,
      refresh_token: rawRefreshToken,
      expires_in:    86400,
      user: {
        id:        doctor.id,
        role:      'doctor',
        name:      doctor.name,
        clinic_id: doctor.clinicId,
      },
    });
  } catch (err) {
    console.error('[verify-otp]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Authentication failed' } });
  }
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
// Rotates the refresh token on every use (security-spec.md SW-H-2)

router.post('/auth/refresh', validate(refreshSchema), async (req, res) => {
  const { refresh_token } = req.body as z.infer<typeof refreshSchema>;

  try {
    const tokenHash = hashRefreshToken(refresh_token);

    // Try doctor token first
    const doctorStored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { doctor: true },
    });

    if (doctorStored) {
      if (doctorStored.revokedAt || doctorStored.expiresAt < new Date()) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' } });
        return;
      }
      if (doctorStored.doctor.deletedAt) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Account not found' } });
        return;
      }

      await prisma.refreshToken.update({
        where: { id: doctorStored.id },
        data:  { revokedAt: new Date() },
      });

      const rawNewToken  = uuidv4();
      const newTokenHash = hashRefreshToken(rawNewToken);

      await prisma.refreshToken.create({
        data: {
          doctorId:  doctorStored.doctor.id,
          tokenHash: newTokenHash,
          expiresAt: getRefreshTokenExpiry(),
        },
      });

      const accessToken = signAccessToken({
        sub:       doctorStored.doctor.id,
        role:      'doctor',
        clinic_id: doctorStored.doctor.clinicId,
        device_id: null,
      });

      await logAudit({
        event:     'auth.token_refreshed',
        actorId:   doctorStored.doctor.id,
        actorRole: 'doctor',
        ipAddress: req.ip,
      });

      res.json({ access_token: accessToken, refresh_token: rawNewToken, expires_in: 86400 });
      return;
    }

    // Try patient token
    const patientStored = await prisma.patientRefreshToken.findUnique({
      where: { tokenHash },
      include: { patient: true },
    });

    if (!patientStored || patientStored.revokedAt || patientStored.expiresAt < new Date()) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' } });
      return;
    }
    if (patientStored.patient.deletedAt) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Account not found' } });
      return;
    }

    await prisma.patientRefreshToken.update({
      where: { id: patientStored.id },
      data:  { revokedAt: new Date() },
    });

    const rawNewToken  = uuidv4();
    const newTokenHash = hashRefreshToken(rawNewToken);

    await prisma.patientRefreshToken.create({
      data: {
        patientId: patientStored.patient.id,
        tokenHash: newTokenHash,
        expiresAt: getRefreshTokenExpiry(),
      },
    });

    const accessToken = signAccessToken({
      sub:       patientStored.patient.id,
      role:      'patient',
      clinic_id: null,
      device_id: null,
    });

    await logAudit({
      event:     'auth.token_refreshed',
      actorId:   patientStored.patient.id,
      actorRole: 'patient',
      patientId: patientStored.patient.id,
      ipAddress: req.ip,
    });

    res.json({ access_token: accessToken, refresh_token: rawNewToken, expires_in: 86400 });
  } catch (err) {
    console.error('[refresh]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Token refresh failed' } });
  }
});

export default router;
