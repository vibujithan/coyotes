# Coyote Spotter — Design Spec

**Date:** 2026-07-07
**Scope:** MVP — Whitby, Ontario neighborhood

---

## Context

Residents of Whitby, Ontario want to track coyote activity in their neighbourhood. No good hyperlocal tool exists. This app lets anyone anonymously pin a coyote sighting on a map so the community can see activity patterns via a heatmap. Low friction (no account required), safe (anonymous), and actionable (last 7 days only).

---

## Architecture

```
Browser (mobile-first)
  └── Next.js App Router (Vercel)
        ├── / → Map page (Mapbox GL heatmap)
        ├── /report → Report form
        └── /api/sightings
              ├── GET → fetch last 7 days (PostGIS, Whitby bbox)
              └── POST → submit sighting (rate limit → insert)

Supabase (PostgreSQL + PostGIS)
  ├── sightings table
  └── rate_limits table

Mapbox GL JS
  └── HeatmapLayer weighted by coyote_count
```

No auth. No user accounts. All anonymous. Rate limiting enforced server-side only.

---

## Data Model

```sql
create table sightings (
  id            uuid primary key default gen_random_uuid(),
  location      geography(POINT, 4326) not null,
  coyote_count  int not null check (coyote_count between 1 and 20),
  spotted_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index on sightings using gist(location);
create index on sightings (spotted_at);

create table rate_limits (
  ip            text primary key,
  report_count  int not null default 1,
  window_start  timestamptz not null default now()
);
```

**Heatmap query:** sightings within Whitby bbox, `spotted_at > now() - interval '7 days'`, returns `{lat, lng, coyote_count}`.

**Rate limit logic:** on POST, upsert IP — reset if window expired (>12h), reject 429 if count ≥ 3, else increment. IP never returned to client.

**Whitby bounding box:** `43.80–43.97°N`, `78.85–79.05°W`

---

## UX — Two Screens

### `/` — Map screen
- Full-screen Mapbox map, centered on Whitby (`43.8975°N, 78.9429°W`), zoom 13
- Heatmap layer loads on mount from `GET /api/sightings`
- Floating "Report Sighting" button, bottom center
- "Last 7 days" label, top left

### `/report` — Report screen
- Step 1: Mapbox map — tap to drop pin OR "Use my location" (optional GPS)
- Step 2: Stepper — "How many coyotes? 1–10+"
- Submit → `POST /api/sightings` → success toast → redirect to `/`
- On 429: "You've reached the report limit. Try again in 12 hours."

Mobile-first: full-viewport map, large tap targets.

---

## Error Handling & Security

| Concern | Approach |
|---------|----------|
| Rate limiting | 3 reports per IP per 12h; 429 + `Retry-After` header |
| Input validation | Server-side: bbox check, count 1–20, reject 400 |
| Mapbox token | `NEXT_PUBLIC_MAPBOX_TOKEN`, restricted to prod domain |
| Supabase key | Service role key server-only, never client-exposed |
| RLS | `sightings`: public SELECT (last 7 days), no direct INSERT |

No file upload, no auth, no PII stored.

---

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14 App Router |
| Map | Mapbox GL JS + HeatmapLayer |
| Backend | Next.js API routes |
| Database | Supabase (PostgreSQL + PostGIS) |
| Deploy | Vercel + Supabase free tier |

---

## Verification

1. Submit sighting via `/report` — confirm pin drops, count saves, redirect to `/`
2. Submit 3 reports from same IP — confirm 4th returns 429
3. Submit pin outside Whitby bbox — confirm 400 rejection
4. Check heatmap at `/` — sighting appears, weighted by count
5. Insert row with `spotted_at = now() - interval '8 days'` — confirm it doesn't appear on heatmap
6. Check Supabase: all historical rows present regardless of heatmap filter
