import { Router } from 'express';

const router = Router();

// GET /health — no auth required; device testing pre-flight depends on this
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
