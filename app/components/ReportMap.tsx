'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { useRouter, useSearchParams } from 'next/navigation'
import LocationSearch from './LocationSearch'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type TimeAgo = 'now' | '1-3h' | '3-6h' | 'today' | 'yesterday' | 'last-week'

const TIME_OPTIONS: { label: string; value: TimeAgo }[] = [
  { label: 'Just now', value: 'now' },
  { label: '1–3 hours ago', value: '1-3h' },
  { label: '3–6 hours ago', value: '3-6h' },
  { label: 'Earlier today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last week', value: 'last-week' },
]

export default function ReportMap() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const marker = useRef<mapboxgl.Marker | null>(null)

  const initLat = parseFloat(searchParams.get('lat') ?? '') || 43.8975
  const initLng = parseFloat(searchParams.get('lng') ?? '') || -78.9429
  const initZoom = parseFloat(searchParams.get('zoom') ?? '') || 13

  const [step, setStep] = useState<1 | 2>(1)
  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [count, setCount] = useState(1)
  const [timeAgo, setTimeAgo] = useState<TimeAgo>('now')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (step !== 1 || map.current || !mapContainer.current) return

    const instance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [initLng, initLat],
      zoom: initZoom,
    })
    map.current = instance

    instance.on('load', () => {
      const hidePatterns = ['poi', 'transit', 'airport', 'building', 'bus']
      const roadPatterns = ['road-label', 'road-number', 'road-intersection', 'road-shield']
      instance.getStyle().layers.forEach((layer) => {
        if (hidePatterns.some((p) => layer.id.includes(p))) {
          instance.setLayoutProperty(layer.id, 'visibility', 'none')
        } else if (roadPatterns.some((p) => layer.id.includes(p))) {
          instance.setPaintProperty(layer.id, 'text-opacity', [
            'interpolate', ['linear'], ['zoom'],
            14, 0,
            16, 1,
          ])
          instance.setPaintProperty(layer.id, 'icon-opacity', [
            'interpolate', ['linear'], ['zoom'],
            14, 0,
            16, 1,
          ])
        }
      })
    })

    instance.on('click', (e) => {
      const { lat, lng } = e.lngLat
      setPinCoords({ lat, lng })
      if (marker.current) {
        marker.current.setLngLat([lng, lat])
      } else {
        marker.current = new mapboxgl.Marker({ color: '#f59e0b' })
          .setLngLat([lng, lat])
          .addTo(instance)
      }
    })

    return () => {
      instance.remove()
      map.current = null
    }
  }, [step])

  function handleUseMyLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lng } = pos.coords
      setPinCoords({ lat, lng })
      map.current?.flyTo({ center: [lng, lat], zoom: 15 })
      if (marker.current) {
        marker.current.setLngLat([lng, lat])
      } else if (map.current) {
        marker.current = new mapboxgl.Marker({ color: '#f59e0b' })
          .setLngLat([lng, lat])
          .addTo(map.current)
      }
    })
  }

  async function handleSubmit() {
    if (!pinCoords) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/sightings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: pinCoords.lat,
          lng: pinCoords.lng,
          coyote_count: count,
          time_ago: timeAgo,
        }),
      })

      if (res.status === 201) {
        setError(null)
        router.push('/')
        return
      }
      if (res.status === 429) {
        setError('Limit reached. Try again in 12 hours.')
        return
      }
      if (res.status === 400) {
        setError('Invalid location or count.')
        return
      }
      setError('Something went wrong. Please try again.')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 2) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-zinc-900 text-white">
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <button
            onClick={() => setStep(1)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-zinc-400 hover:text-white"
          >
            ←
          </button>
          <h1 className="text-lg font-semibold">Report Sighting</h1>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          {/* Coyote count stepper */}
          <div>
            <p className="mb-3 text-sm font-medium text-zinc-400">How many coyotes?</p>
            <div className="flex items-center gap-6">
              <button
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-xl font-bold"
              >
                −
              </button>
              <span className="min-w-[3rem] text-center text-3xl font-bold">
                {count === 10 ? '10+' : count}
              </span>
              <button
                onClick={() => setCount((c) => Math.min(10, c + 1))}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-xl font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Time ago dropdown */}
          <div>
            <label htmlFor="time-ago" className="mb-2 block text-sm font-medium text-zinc-400">
              When did you see them?
            </label>
            <select
              id="time-ago"
              value={timeAgo}
              onChange={(e) => setTimeAgo(e.target.value as TimeAgo)}
              className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Error message */}
          {error && (
            <p className="rounded-xl bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex min-h-[44px] items-center justify-center rounded-full bg-amber-500 px-6 py-3 text-base font-semibold text-black disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Sighting'}
          </button>
        </div>
      </div>
    )
  }

  // Step 1 — Location
  return (
    <div className="relative h-[100dvh] w-full">
      <div ref={mapContainer} className="h-full w-full" />

      {/* Header */}
      <div className="absolute left-0 right-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 py-4">
        <button
          onClick={() => router.back()}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold text-white">Tap to place pin</h1>
      </div>

      {/* Location search */}
      <LocationSearch
        mapInstance={map.current}
        onSelect={(lat, lng) => {
          setPinCoords({ lat, lng })
          map.current?.flyTo({ center: [lng, lat], zoom: 15 })
          if (marker.current) {
            marker.current.setLngLat([lng, lat])
          } else if (map.current) {
            marker.current = new mapboxgl.Marker({ color: '#f59e0b' })
              .setLngLat([lng, lat])
              .addTo(map.current)
          }
        }}
        onLocate={handleUseMyLocation}
      />

      {/* Bottom controls */}
      <div className="absolute bottom-8 left-4 right-4 flex flex-col gap-3">
        <button
          onClick={() => setStep(2)}
          disabled={!pinCoords}
          className="flex min-h-[44px] items-center justify-center rounded-full bg-amber-500 px-6 py-3 text-base font-semibold text-black disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
