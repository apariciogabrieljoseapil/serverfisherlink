import { Router } from 'express';
import { supabase } from '../supabase.js';
import {
  formatAppDateTime, formatLegacyDateTime, monthYearLabel, must,
  parseManila, STATUS_MESSAGES, wrap
} from '../lib.js';

const router = Router();

router.get('/:sender', wrap(async (req, res) => {
  const { sender } = req.params;
  const info = must(await supabase.from('information').select('*').eq('callsign', sender).maybeSingle());
  if (!info) return res.json({ sender, history: [] });

  let q = supabase.from('aprs_packets').select('*').eq('sender', sender);
  const start = parseManila(req.query.start_date);
  const end = parseManila(req.query.end_date);
  if (start) q = q.gte('time_received', start.toISOString());
  if (end) q = q.lte('time_received', end.toISOString());
  const packets = must(await q.order('time_received', { ascending: false }).limit(5000));

  res.json({
    sender,
    history: packets.map((p) => ({
      sender: p.sender, latitude: p.latitude, longitude: p.longitude,
      time_received: formatAppDateTime(p.time_received),
      message: p.message || '', place: p.place || '',
      battery_percentage: p.battery_percentage ?? null
    }))
  });
}));

router.get('/:sender/details', wrap(async (req, res) => {
  const packets = must(await supabase.from('aprs_packets').select('time_received,message')
    .eq('sender', req.params.sender).in('message', STATUS_MESSAGES)
    .order('time_received', { ascending: false }).limit(5000));
  res.json({
    details: packets
      .filter((p) => monthYearLabel(p.time_received) === req.query.month)
      .map((p) => ({ time_received: formatLegacyDateTime(p.time_received), message: p.message }))
  });
}));

export default router;
