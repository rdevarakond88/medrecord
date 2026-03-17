import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.errors[0];
      res.status(422).json({
        error: {
          code:    'VALIDATION_ERROR',
          message: first.message,
          field:   first.path.join('.'),
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const first = result.error.errors[0];
      res.status(422).json({
        error: {
          code:    'VALIDATION_ERROR',
          message: first.message,
          field:   first.path.join('.'),
        },
      });
      return;
    }
    next();
  };
}
