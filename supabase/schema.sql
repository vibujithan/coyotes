-- Enable PostGIS extension
create extension if not exists postgis;

-- Sightings table
create table sightings (
  id            uuid primary key default gen_random_uuid(),
  location      geography(POINT, 4326) not null,
  coyote_count  int not null check (coyote_count between 1 and 20),
  spotted_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index on sightings using gist(location);
create index on sightings (spotted_at);

-- Rate limits table
create table rate_limits (
  ip            text primary key,
  report_count  int not null default 1,
  window_start  timestamptz not null default now()
);

-- RLS: allow public read of recent sightings only
alter table sightings enable row level security;

create policy "public read last 7 days"
  on sightings for select
  using (spotted_at > now() - interval '7 days');

-- Deny all direct access to rate_limits; only service role can touch it
alter table rate_limits enable row level security;
