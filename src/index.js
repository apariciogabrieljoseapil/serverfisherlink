import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './auth.js';
import stations from './routes/stations.js';
import history from './routes/history.js';
import reports from './routes/reports.js';
import information from './routes/information.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true }));
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
app.listen(port, () => console.log(`FisherLink API on :${port}`));
