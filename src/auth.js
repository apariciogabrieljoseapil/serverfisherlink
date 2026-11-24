import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { supabase } from './supabase.js';
import { HttpError, must, wrap } from './lib.js';

const KEY = 'default';
const SESSION_MS = Number(process.env.SESSION_HOURS || 12) * 3600 * 1000;

async function ensureAdmin() {
  const existing = must(await supabase.from('admin_credentials').select('*').eq('key', KEY).maybeSingle());
  if (existing) return existing;
  return must(await supabase.from('admin_credentials').insert({
    key: KEY,
    username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
    password_hash: await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD || 'admin', 10)
  }).select().single());
}

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

async function findSession(token) {
  if (!token) return null;
  const s = must(await supabase.from('admin_sessions').select('*').eq('token', token).maybeSingle());
  if (!s) return null;
  if (Date.now() - new Date(s.created_at).getTime() > SESSION_MS) {
    await supabase.from('admin_sessions').delete().eq('token', token);
    return null;
  }
  return s;
}

export const requireAdmin = wrap(async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw new HttpError(401, 'Admin session is required.');
  if (!(await findSession(token))) throw new HttpError(401, 'Admin session is invalid. Please log in again.');
  req.adminToken = token;
  next();
});

async function newSession() {
  const token = crypto.randomBytes(24).toString('hex');
  must(await supabase.from('admin_sessions').insert({ token }));
  return token;
}

const router = Router();

router.get('/mode', wrap(async (_req, res) => {
  const c = await ensureAdmin();
  res.json({ adminConfigured: true, defaultAdminUsername: c.username });
}));

router.get('/session', wrap(async (req, res) => {
  const c = await ensureAdmin();
  const s = await findSession(bearer(req));
  res.json(s ? { valid: true, username: c.username } : { valid: false });
}));

router.post('/login', wrap(async (req, res) => {
  const c = await ensureAdmin();
  const { username = '', password = '' } = req.body || {};
  const ok = username.trim() === c.username && (await bcrypt.compare(password, c.password_hash));
  if (!ok) throw new HttpError(401, 'Incorrect admin username or password.');
  res.json({ token: await newSession(), username: c.username });
}));

router.post('/logout', wrap(async (req, res) => {
  const token = bearer(req);
  if (token) await supabase.from('admin_sessions').delete().eq('token', token);
  res.json({ ok: true });
}));

router.post('/credentials', requireAdmin, wrap(async (req, res) => {
  const c = await ensureAdmin();
  const { current_password, new_username = '', new_password = '' } = req.body || {};
  if (!(await bcrypt.compare(current_password || '', c.password_hash))) throw new HttpError(400, 'Current password is incorrect.');
  if (!new_username.trim() || !new_password.trim()) throw new HttpError(400, 'New username and new password are required.');
  must(await supabase.from('admin_credentials').update({
    username: new_username.trim(),
    password_hash: await bcrypt.hash(new_password.trim(), 10),
    updated_at: new Date().toISOString()
  }).eq('key', KEY));
  must(await supabase.from('admin_sessions').delete().neq('token', ''));
  res.json({ token: await newSession(), username: new_username.trim() });
}));

export default router;
