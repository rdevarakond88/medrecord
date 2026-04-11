/**
 * Record routes — GET /visits/:id/records, POST /records, GET /records/upload-url
 * Contract: docs/api-contracts.md — Record Endpoints
 * Note: S3 presigned URL generation requires AWS credentials. Returns 501 until configured.
 */
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { uploadUrlLimiter } from '../middleware/rateLimit';
import { logAudit } from '../utils/audit';

const router = Router();

// ─── GET /visits/:id/records ──────────────────────────────────────────────────

router.get('/visits/:id/records', requireAuth, async (req, res) => {
  const doctorId = req.auth!.sub;
  const visitId  = req.params.id;

  try {
    const visit = await prisma.visit.findFirst({ where: { id: visitId, deletedAt: null } });
    if (!visit) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Visit not found' } });
      return;
    }

    // Doctor must either own the visit or have consent for the patient
    const hasConsent = await prisma.consent.findFirst({
      where: { patientId: visit.patientId, doctorId, revokedAt: null },
    });
    if (visit.doctorId !== doctorId && !hasConsent) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No access to this visit' } });
      return;
    }

    const records = await prisma.record.findMany({
      where:   { visitId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    await logAudit({
      event:      'record.accessed',
      actorId:    doctorId,
      actorRole:  'doctor',
      resourceId: visitId,
      patientId:  visit.patientId,
      ipAddress:  req.ip,
    });

    res.json({
      records: records.map((r) => ({
        id:                    r.id,
        type:                  r.type,
        content_text:          r.contentText,
        image_url:             r.imageUrl,
        image_thumbnail_url:   null, // thumbnails not yet generated
        ocr_status:            r.ocrStatus,
        created_by:            { id: r.createdBy.id, name: r.createdBy.name },
        created_at:            r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[GET /visits/:id/records]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch records' } });
  }
});

// ─── POST /records ────────────────────────────────────────────────────────────

const createRecordSchema = z.object({
  local_id:     z.string().uuid('local_id must be a UUID'),
  visit_id:     z.string().uuid('visit_id must be a UUID'),
  type:         z.enum(['scan', 'note', 'diagnosis', 'medication', 'lab_result']),
  content_text: z.string().optional(),
  image_s3_key: z.string().optional(),
});

router.post('/records', requireAuth, validate(createRecordSchema), async (req, res) => {
  const doctorId = req.auth!.sub;
  const body     = req.body as z.infer<typeof createRecordSchema>;

  try {
    const visit = await prisma.visit.findFirst({ where: { id: body.visit_id, deletedAt: null } });
    if (!visit) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Visit not found' } });
      return;
    }

    // Only the opening doctor can add records (or extend this for clinic staff later)
    if (visit.doctorId !== doctorId) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the opening doctor can add records' } });
      return;
    }

    // Idempotency
    const existing = await prisma.record.findFirst({ where: { localId: body.local_id, deletedAt: null } });
    if (existing) {
      res.status(201).json({ record: existing });
      return;
    }

    const record = await prisma.record.create({
      data: {
        localId:     body.local_id,
        visitId:     body.visit_id,
        createdById: doctorId,
        type:        body.type as any,
        contentText: body.content_text,
        imageUrl:    body.image_s3_key
          ? `https://${process.env.S3_BUCKET}.s3.ap-south-1.amazonaws.com/${body.image_s3_key}`
          : null,
        ocrStatus:   body.image_s3_key ? 'pending' : 'skipped',
        syncedAt:    new Date(),
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    await logAudit({
      event:      'record.created',
      actorId:    doctorId,
      actorRole:  'doctor',
      resourceId: record.id,
      patientId:  visit.patientId,
      ipAddress:  req.ip,
    });

    res.status(201).json({
      record: {
        id:                  record.id,
        type:                record.type,
        content_text:        record.contentText,
        image_url:           record.imageUrl,
        image_thumbnail_url: null,
        ocr_status:          record.ocrStatus,
        created_by:          { id: record.createdBy.id, name: record.createdBy.name },
        created_at:          record.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[POST /records]', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create record' } });
  }
});

// ─── GET /records/upload-url ──────────────────────────────────────────────────
// Returns 501 until S3 credentials are configured (AWS_ACCESS_KEY_ID etc.)

const uploadUrlQuerySchema = z.object({
  content_type: z.string().min(1),
  visit_id:     z.string().uuid(),
});

router.get(
  '/records/upload-url',
  requireAuth,
  uploadUrlLimiter,
  validateQuery(uploadUrlQuerySchema),
  async (_req, res) => {
    if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
      res.status(501).json({
        error: {
          code:    'NOT_IMPLEMENTED',
          message: 'S3 not configured. Set S3_BUCKET and AWS credentials to enable scan uploads.',
        },
      });
      return;
    }

    // TODO: Generate presigned URL when S3 is configured
    res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Not yet implemented' } });
  },
);

export default router;
