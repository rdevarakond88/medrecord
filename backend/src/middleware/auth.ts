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
