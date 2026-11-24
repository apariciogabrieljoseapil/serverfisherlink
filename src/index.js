import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './auth.js';
import stations from './routes/stations.js';
import history from './routes/history.js';
import reports from './routes/reports.js';
import information from './routes/information.js';

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

// Vercel preview URLs for this project, e.g.
// https://frontendfisherlink-9ws353y1l-apariciogabrieljoseapils-projects.vercel.app
const vercelPreview =
  /^https:\/\/frontendfisherlink-[a-z0-9]+-apariciogabrieljoseapils-projects\.vercel\.app$/;

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl, Postman, server-to-server
      if (
        allowedOrigins.length === 0 || // nothing configured: allow all (dev)
        allowedOrigins.includes(origin) ||
        vercelPreview.test(origin)
      ) {
        return cb(null, true);
      }
      console.warn('CORS blocked origin:', origin);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/stations', stations);
app.use('/api/history', history);
app.use('/api/reports', reports);
app.use('/api/information', information);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => console.log(`FisherLink API on :${port}`));