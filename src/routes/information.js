import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';
import { HttpError, must, wrap } from '../lib.js';

const router = Router();
const out = ({ uid, ...r }) => ({ _id: uid, ...r });
const blank = (v) => (v === '' || v === undefined ? null : v);

function clean(body) {
  const b = body || {};
  const row = {
    id: b.id === '' || b.id == null ? null : Number(b.id),
    name: String(b.name || '').trim(),
    callsign: String(b.callsign || '').trim().toUpperCase(),
    address: String(b.address || '').trim(),
    phone_number: blank(b.phone_number),
    boat_color: blank(b.boat_color),
    engine_type: blank(b.engine_type),
    boat_length: b.boat_length === '' || b.boat_length == null ? null : Number(b.boat_length)
  };
  if (!row.name || !row.callsign || !row.address) throw new HttpError(400, 'Name, callsign, and address are required.');
  return row;
}

async function assertUnique(callsign, exceptUid) {
  const rows = must(await supabase.from('information').select('uid').eq('callsign', callsign));
  if (rows.some((r) => r.uid !== exceptUid)) {
    throw new HttpError(409, `Callsign '${callsign}' is already assigned to another fisherman.`);
  }
}

router.get('/', wrap(async (_req, res) => {
  const rows = must(await supabase.from('information').select('*').order('id', { ascending: true, nullsFirst: false }));
  res.json({ info: rows.map(out) });
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
  const row = clean(req.body);
  await assertUnique(row.callsign);
  must(await supabase.from('information').insert(row));
  res.json({ ok: true });
}));

router.put('/:uid', requireAdmin, wrap(async (req, res) => {
  const row = clean(req.body);
  await assertUnique(row.callsign, req.params.uid);
  must(await supabase.from('information').update(row).eq('uid', req.params.uid));
  res.json({ ok: true });
}));

router.delete('/:uid', requireAdmin, wrap(async (req, res) => {
  must(await supabase.from('information').delete().eq('uid', req.params.uid));
  res.json({ ok: true });
}));

export default router;
