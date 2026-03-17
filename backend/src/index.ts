import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import healthRouter  from './routes/health';
import authRouter    from './routes/auth';
import patientsRouter from './routes/patients';
import visitsRouter  from './routes/visits';
import recordsRouter from './routes/records';
import consentRouter from './routes/consent';
import syncRouter    from './routes/sync';

const app  = express();
const PORT = process.env.PORT ?? 3000;

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin:         process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods:        ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/v1', healthRouter);
app.use('/v1', authRouter);
app.use('/v1', patientsRouter);
app.use('/v1', visitsRouter);
app.use('/v1', recordsRouter);
app.use('/v1', consentRouter);
app.use('/v1', syncRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' } });
});

app.listen(PORT, () => {
  console.log(`MedRecord backend listening on port ${PORT}`);
  console.log(`Test OTP bypass: ${process.env.TEST_OTP_BYPASS === 'true' ? 'ON — use code 000000' : 'OFF'}`);
});
