-- Run in Supabase: SQL Editor > New query
create extension if not exists pgcrypto;

create table information (
  uid uuid primary key default gen_random_uuid(),
  id int,
  name text not null,
  callsign text not null unique,
  address text not null,
  phone_number text,
  boat_color text,
  engine_type text,
  boat_length numeric,
  sos_status int not null default 0,
  help_status int not null default 0,
  not_found_status int not null default 0
);

create table aprs_packets (
  uid bigint generated always as identity primary key,
  sender text not null,
  latitude double precision not null,
  longitude double precision not null,
  time_received timestamptz not null default now(),
  message text,
  place text,
  battery_percentage numeric
);
create index aprs_packets_sender_time on aprs_packets (sender, time_received desc);
create index aprs_packets_time on aprs_packets (time_received desc);

create table latest_stations (
  sender text primary key,
  latitude double precision not null,
  longitude double precision not null,
  time_received timestamptz not null,
  message text,
  place text,
  battery_percentage numeric
);

create table admin_credentials (
  key text primary key,
  username text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table admin_sessions (
  token text primary key,
  created_at timestamptz not null default now()
);

-- Keep latest_stations in sync whenever a packet is inserted
-- (your APRS listener only needs to INSERT into aprs_packets).
create or replace function upsert_latest_station() returns trigger language plpgsql as $$
begin
  insert into latest_stations (sender, latitude, longitude, time_received, message, place, battery_percentage)
  values (new.sender, new.latitude, new.longitude, new.time_received, new.message, new.place, new.battery_percentage)
  on conflict (sender) do update set
    latitude = excluded.latitude, longitude = excluded.longitude,
    time_received = excluded.time_received, message = excluded.message,
    place = excluded.place, battery_percentage = excluded.battery_percentage
  where excluded.time_received >= latest_stations.time_received;
  return new;
end $$;

create trigger aprs_packets_latest after insert on aprs_packets
for each row execute function upsert_latest_station();

-- Block the public anon key. Only the Node server (service_role key) can read/write.
alter table information enable row level security;
alter table aprs_packets enable row level security;
alter table latest_stations enable row level security;
alter table admin_credentials enable row level security;
alter table admin_sessions enable row level security;
