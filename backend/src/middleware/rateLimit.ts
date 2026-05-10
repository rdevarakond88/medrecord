import rateLimit from 'express-rate-limit';
import { Request } from 'express';

const jsonLimit = {
  handler: (_req: Request, res: any) => {
    res.status(429).json({
      error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Try again later.' },
    });
  },
};

// POST /auth/send-otp — 5 per mobile per hour (security-spec.md)
export const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.mobile_number ?? req.ip ?? 'unknown',
  ...jsonLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /auth/verify-otp — per-token limit enforced in route handler (3 attempts)
// This limiter adds a broad IP-level backstop
export const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip ?? 'unknown',
  ...jsonLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /patients/lookup — 60 per doctor per minute (security-spec.md)
export const patientLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => (req as any).auth?.sub ?? req.ip ?? 'unknown',
  ...jsonLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /sync — 10 per device per minute (security-spec.md)
export const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req as any).auth?.sub ?? req.ip ?? 'unknown',
  ...jsonLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /records/upload-url — 30 per doctor per minute (security-spec.md)
export const uploadUrlLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req as any).auth?.sub ?? req.ip ?? 'unknown',
  ...jsonLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /consent/request — 10 per (doctor_id, patient_id) per hour (api-contracts.md)
export const consentRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const doctorId  = (req as any).auth?.sub ?? 'unknown';
    const patientId = req.body?.patient_id    ?? 'unknown';
    return `${doctorId}:${patientId}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      error:                'rate_limit_exhausted',
      retry_after_seconds:  3600,
    });
  },
  standardHeaders: true,
  legacyHeaders:   false,
});

// POST /consent/verify — IP-level backstop; per-token attempt limit enforced in handler
export const consentVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip ?? 'unknown',
  ...jsonLimit,
  standardHeaders: true,
  legacyHeaders:   false,
});
