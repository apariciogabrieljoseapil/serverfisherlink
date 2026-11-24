import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../auth.js';
import { HttpError, must, toStation, wrap } from '../lib.js';

const router = Router();

// --- simple in-memory cache (module level, above the route) ---
const CACHE_TTL_MS = 5000;
let cache = { payload: null, at: 0, inflight: null };

async function buildLatest() {
  const [latest, info] = await Promise.all([
    supabase.from('latest_stations').select('*')
      .order('time_received', { ascending: false }).limit(1000),
    supabase.from('information').select('*')
  ]);

  const byCallsign = new Map(must(info).map((r) => [r.callsign, r]));
  const rows = must(latest).filter((p) => byCallsign.has(p.sender)).slice(0, 100);
  const now = Date.now();

  return {
    stations: rows.map((p) => toStation(p, byCallsign.get(p.sender), now)),
    count: rows.length
  };
}

router.get('/latest', wrap(async (_req, res) => {
  // 1. Fresh enough? Skip Supabase entirely.
  if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) {
    return res.json(cache.payload);
  }

  try {
    // 2. Many simultaneous requests share ONE upstream call.
    cache.inflight ??= buildLatest().finally(() => { cache.inflight = null; });
    cache.payload = await cache.inflight;
    cache.at = Date.now();
    return res.json(cache.payload);
  } catch (err) {
    // 3. Supabase unreachable: serve the last good data instead of a 500.
    if (cache.payload) {
      res.set('X-Data-Stale', 'true');
      return res.json(cache.payload);
    }
    // Nothing cached yet (first request after server start)
    return res.status(502).json({ error: 'Database unreachable' });
  }
}));

router.get('/:sender/trail', wrap(async (req, res) => {
  const { sender } = req.params;
  const info = must(await supabase.from('information').select('id').eq('callsign', sender).maybeSingle());
  if (!info) return res.json({ sender, locations: [] });
  const packets = must(await supabase.from('aprs_packets').select('*').eq('sender', sender)
    .order('time_received', { ascending: false }).limit(20));
  res.json({
    sender,
    locations: packets.map((p) => ({
      sender: p.sender, latitude: p.latitude, longitude: p.longitude,
      time_received: p.time_received, message: p.message || '', place: p.place || ''
    }))
  });
}));

const ACTIONS = {
  safe:     { message: 'Marked as Safe',  patch: { sos_status: 0, help_status: 0, not_found_status: 0 }, relabel: false },
  help:     { message: 'Help on the Way', patch: { sos_status: 0, help_status: 1, not_found_status: 0 }, relabel: false },
  notfound: { message: 'Not Found',       patch: { sos_status: 0, help_status: 0, not_found_status: 1 }, relabel: true }
};

router.post('/:sender/:action', requireAdmin, wrap(async (req, res) => {
  const { sender, action } = req.params;
  const a = ACTIONS[action];
  if (!a) throw new HttpError(404, 'Unknown action.');

  const info = must(await supabase.from('information').select('uid').eq('callsign', sender).maybeSingle());
  if (!info) throw new HttpError(404, `Sender '${sender}' not found in information table.`);

  const last = must(await supabase.from('aprs_packets').select('*').eq('sender', sender)
    .order('time_received', { ascending: false }).limit(1).maybeSingle());
  if (!last) throw new HttpError(404, `No packet found for sender '${sender}'.`);

  if (a.relabel) {
    // "Not Found" relabels the latest packet (same behaviour as the Convex version)
    must(await supabase.from('aprs_packets').update({ message: a.message }).eq('uid', last.uid));
    must(await supabase.from('latest_stations').upsert({
      sender, latitude: last.latitude, longitude: last.longitude, time_received: last.time_received,
      message: a.message, place: last.place, battery_percentage: last.battery_percentage
    }, { onConflict: 'sender' }));
  } else {
    // the DB trigger refreshes latest_stations from this insert
    must(await supabase.from('aprs_packets').insert({
      sender, latitude: last.latitude, longitude: last.longitude,
      time_received: new Date().toISOString(), message: a.message,
      place: last.place, battery_percentage: last.battery_percentage
    }));
  }
  must(await supabase.from('information').update(a.patch).eq('uid', info.uid));
  res.json({ ok: true });
}));

export default router;
