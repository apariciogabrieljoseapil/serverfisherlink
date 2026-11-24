import { Router } from 'express';
import { supabase } from '../supabase.js';
import { manilaDayKey, monthYearLabel, must, STATUS_MESSAGES, wrap } from '../lib.js';

const router = Router();

// Supabase returns at most 1000 rows per request, so page through.
async function fetchStatusPackets() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await supabase.from('aprs_packets').select('sender,message,time_received')
      .in('message', STATUS_MESSAGES).order('time_received', { ascending: false }).range(from, from + 999));
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

async function buildRows() {
  const [packets, info] = await Promise.all([fetchStatusPackets(), supabase.from('information').select('callsign')]);
  const valid = new Set(must(info).map((r) => r.callsign));
  const latest = new Map(); // one count per sender / day / message
  for (const p of packets) {
    if (!valid.has(p.sender)) continue;
    const key = `${p.sender}|${manilaDayKey(p.time_received)}|${p.message}`;
    const ex = latest.get(key);
    if (!ex || new Date(p.time_received) > new Date(ex.time_received)) latest.set(key, p);
  }
  return [...latest.values()];
}

const counts = () => ({ sos_count: 0, safe_count: 0, help_count: 0, not_found_count: 0 });
function apply(t, m) {
  if (m === 'SOS') t.sos_count++;
  else if (m === 'Marked as Safe') t.safe_count++;
  else if (m === 'Help on the Way') t.help_count++;
  else if (m === 'Not Found') t.not_found_count++;
}

function group(rows, keyFn, seed) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const ex = map.get(k) || { ...seed(r), ...counts(), _t: 0 };
    apply(ex, r.message);
    ex._t = Math.max(ex._t, new Date(r.time_received).getTime());
    map.set(k, ex);
  }
  return [...map.values()];
}

router.get('/safe', wrap(async (_req, res) => {
  const rows = await buildRows();
  const report = group(rows, (r) => monthYearLabel(r.time_received), (r) => ({ month: monthYearLabel(r.time_received) }))
    .sort((a, b) => b._t - a._t).map(({ _t, ...r }) => r);
  res.json({ report });
}));

router.get('/sender', wrap(async (_req, res) => {
  const rows = await buildRows();
  const report = group(rows, (r) => `${monthYearLabel(r.time_received)}|${r.sender}`,
    (r) => ({ month: monthYearLabel(r.time_received), sender: r.sender }))
    .sort((a, b) => b._t - a._t || a.sender.localeCompare(b.sender)).map(({ _t, ...r }) => r);
  res.json({ report });
}));

export default router;
