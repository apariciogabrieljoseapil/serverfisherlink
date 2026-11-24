const MANILA_OFFSET = '+08:00';
const TZ = 'Asia/Manila';
export const STATUS_MESSAGES = ['SOS', 'Marked as Safe', 'Help on the Way', 'Not Found'];

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export function must({ data, error }) {
  //    console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
  //  console.log("KEY set?:", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
  console.error("Supabase error:", error?.cause?.code || error?.cause || error);
  if (error) throw new Error(error.message);
  return data;
}

function parts(date, options) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...options })
      .formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  );
}

export function parseManila(value) {
  if (!value) return null;
  const [d, t = '00:00:00'] = value.trim().split(' ');
  const date = new Date(`${d}T${t}${MANILA_OFFSET}`);
  return isNaN(date) ? null : date;
}

export function formatAppDateTime(value) {
  const p = parts(new Date(value), { year: 'numeric', month: 'long', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });
  return `${p.month} ${p.day}, ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

export function formatLegacyDateTime(value) {
  const p = parts(new Date(value), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.day}-${p.month}-${p.year} ${hour}:${p.minute}:${p.second}`;
}

export function monthYearLabel(value) {
  const p = parts(new Date(value), { year: 'numeric', month: 'long' });
  return `${p.month}-${p.year}`;
}

export function manilaDayKey(value) {
  const p = parts(new Date(value), { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

const num = (v, fallback = 0) => (typeof v === 'number' ? v : fallback);

export function statusPatchForMessage(message, info = {}) {
  const lower = (message || '').toLowerCase();
  const helpActive = num(info.help_status) === 1;
  if (lower.includes('sos')) {
    return helpActive
      ? { sos_status: num(info.sos_status), help_status: 1, not_found_status: 0 }
      : { sos_status: 1, help_status: 0, not_found_status: 0 };
  }
  if (lower.includes('help')) return { sos_status: 0, help_status: 1, not_found_status: 0 };
  if (lower.includes('safe')) return { sos_status: 0, help_status: 0, not_found_status: 0 };
  if (lower.includes('not found')) return { sos_status: 0, help_status: 0, not_found_status: 1 };
  return { sos_status: num(info.sos_status), help_status: num(info.help_status), not_found_status: num(info.not_found_status) };
}

export function toStation(packet, info, now) {
  const last = new Date(packet.time_received).getTime();
  const gap = (now - last) / 60000;
  return {
    sender: packet.sender,
    latitude: packet.latitude,
    longitude: packet.longitude,
    time_received: formatAppDateTime(packet.time_received),
    message: packet.message || '',
    place: packet.place || '',
    battery_percentage: packet.battery_percentage ?? null,
    name: info?.name || null,
    address: info?.address || null,
    phone_number: info?.phone_number || null,
    boat_color: info?.boat_color || null,
    engine_type: info?.engine_type || null,
    boat_length: info?.boat_length || null,
    last_packet_time: last,
    ...statusPatchForMessage(packet.message, info || {}),
    time_gap_minutes: gap,
    is_delayed: gap > 20
  };
}
