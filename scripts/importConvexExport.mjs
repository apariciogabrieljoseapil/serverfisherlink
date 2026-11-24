// Usage: node scripts/importConvexExport.mjs ./convex-export
// Reads <dir>/information/documents.jsonl and <dir>/aprs_packets/documents.jsonl
// (produced by `npx convex export --path backup.zip`, then unzipped) and loads them into Supabase.
// latest_stations is rebuilt automatically by the DB trigger.
import fs from 'node:fs';
import path from 'node:path';
import { supabase } from '../src/supabase.js';

const dir = process.argv[2];
if (!dir) { console.error('Pass the unzipped export folder.'); process.exit(1); }

const readJsonl = (table) =>
  fs.readFileSync(path.join(dir, table, 'documents.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

async function insertBatches(table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + size));
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`${table}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
}

const info = readJsonl('information').map((r) => ({
  id: r.id ?? null, name: r.name, callsign: String(r.callsign).trim().toUpperCase(), address: r.address,
  phone_number: r.phone_number ?? null, boat_color: r.boat_color ?? null, engine_type: r.engine_type ?? null,
  boat_length: r.boat_length ?? null, sos_status: r.sos_status ?? 0, help_status: r.help_status ?? 0,
  not_found_status: r.not_found_status ?? 0
}));
await insertBatches('information', info);

const packets = readJsonl('aprs_packets')
  .sort((a, b) => a.time_received - b.time_received)
  .map((r) => ({
    sender: r.sender, latitude: r.latitude, longitude: r.longitude,
    time_received: new Date(r.time_received).toISOString(), // Convex stored epoch milliseconds
    message: r.message ?? null, place: r.place ?? null, battery_percentage: r.battery_percentage ?? null
  }));
await insertBatches('aprs_packets', packets);
console.log('Done.');
