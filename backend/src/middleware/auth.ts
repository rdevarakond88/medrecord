import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';

// Augment Express Request with auth payload
declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload & { sub: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.auth = payload as JwtPayload & { sub: string };
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token expired or invalid' } });
  }
}

export function requirePatientAuth(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.auth?.role !== 'patient') {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Patient access required' } });
      return;
    }
    next();
  });
}

export function requireDoctorAuth(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.auth?.role !== 'doctor') {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Doctor access required' } });
      return;
    }
    next();
  });
}
