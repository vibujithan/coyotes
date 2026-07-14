import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

const WHITBY_BBOX = {
  minLat: 43.70,
  maxLat: 44.07,
  minLng: -79.20,
  maxLng: -78.70,
}

const TIME_AGO_OFFSETS: Record<string, number> = {
  'now': 0,
  '1-3h': 2 * 60,
  '3-6h': 270,
  'today': 8 * 60,
  'yesterday': 24 * 60,
  'last-week': 5 * 24 * 60,
}

function isInWhitby(lat: number, lng: number): boolean {
  return (
    lat >= WHITBY_BBOX.minLat &&
    lat <= WHITBY_BBOX.maxLat &&
    lng >= WHITBY_BBOX.minLng &&
    lng <= WHITBY_BBOX.maxLng
  )
}

export async function GET() {
  const { data, error } = await supabaseAdmin.rpc('get_recent_sightings')

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sightings' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)

  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { lat, lng, coyote_count, time_ago } = body

  // Validate inputs
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !isInWhitby(lat, lng)
  ) {
    return NextResponse.json({ error: 'Location outside Whitby' }, { status: 400 })
  }

  if (
    typeof coyote_count !== 'number' ||
    !Number.isInteger(coyote_count) ||
    coyote_count < 1 ||
    coyote_count > 20
  ) {
    return NextResponse.json({ error: 'Invalid coyote count' }, { status: 400 })
  }

  if (!(time_ago in TIME_AGO_OFFSETS)) {
    return NextResponse.json({ error: 'Invalid time_ago value' }, { status: 400 })
  }

  // Compute spotted_at
  const offsetMinutes = TIME_AGO_OFFSETS[time_ago]
  const spottedAt = new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString()

  // Rate limit check
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
  const windowStart = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

  const { data: rateData, error: rateError } = await supabaseAdmin
    .from('rate_limits')
    .select('report_count, window_start')
    .eq('ip', ip)
    .maybeSingle()

  if (rateError) {
return NextResponse.json({ error: 'Rate limit check failed' }, { status: 500 })
  }

  if (rateData && rateData.window_start > windowStart && rateData.report_count >= 3) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': '43200' },
      }
    )
  }

  // Upsert rate limit
  const newCount =
    rateData && rateData.window_start > windowStart ? rateData.report_count + 1 : 1

  const { error: upsertError } = await supabaseAdmin.from('rate_limits').upsert({
    ip,
    report_count: newCount,
    window_start: rateData && rateData.window_start > windowStart
      ? rateData.window_start
      : new Date().toISOString(),
  })

  if (upsertError) {
    return NextResponse.json({ error: 'Rate limit update failed' }, { status: 500 })
  }

  // Insert sighting using PostGIS ST_MakePoint
  const { error: insertError } = await supabaseAdmin.rpc('insert_sighting', {
    p_lat: lat,
    p_lng: lng,
    p_coyote_count: coyote_count,
    p_spotted_at: spottedAt,
  })

  if (insertError) {
    return NextResponse.json({ error: 'Failed to save sighting' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
