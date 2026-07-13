-- Function to insert a sighting with PostGIS point
create or replace function insert_sighting(
  p_lat float,
  p_lng float,
  p_coyote_count int,
  p_spotted_at timestamptz
) returns void language plpgsql security definer as $$
begin
  insert into sightings (location, coyote_count, spotted_at)
  values (
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_coyote_count,
    p_spotted_at
  );
end;
$$;

-- Function to get recent sightings in Whitby bbox (last 7 days)
create or replace function get_recent_sightings()
returns table(lat float, lng float, count int, spotted_at timestamptz)
language sql security definer as $$
  select
    ST_Y(location::geometry) as lat,
    ST_X(location::geometry) as lng,
    coyote_count as count,
    spotted_at
  from sightings
  where
    spotted_at > now() - interval '7 days'
    and ST_Within(
      location::geometry,
      ST_MakeEnvelope(-79.20, 43.70, -78.70, 44.07, 4326)
    )
  order by spotted_at desc;
$$;
