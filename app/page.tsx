'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import Link from 'next/link'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type Sighting = { lat: number; lng: number; count: number }

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    if (map.current || !mapContainer.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-78.9429, 43.8975],
      zoom: 13,
    })

    map.current.on('load', async () => {
      const res = await fetch('/api/sightings')
      const sightings: Sighting[] = await res.json()

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: sightings.map((s) => ({
          type: 'Feature',
          properties: { count: s.count },
          geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        })),
      }

      map.current!.addSource('sightings', { type: 'geojson', data: geojson })

      map.current!.addLayer({
        id: 'sightings-heat',
        type: 'heatmap',
        source: 'sightings',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'count'], 0, 0, 10, 1],
          'heatmap-radius': 30,
          'heatmap-opacity': 0.8,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, 'rgba(255,235,59,0.6)',
            0.6, 'rgba(255,152,0,0.8)',
            1, 'rgba(244,67,54,1)',
          ],
        },
      })
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  return (
    <div className="relative h-screen w-full">
      <div ref={mapContainer} className="h-full w-full" />

      {/* Last 7 days badge */}
      <div className="absolute top-4 left-4 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
        Last 7 days
      </div>

      {/* Report button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <Link
          href="/report"
          className="flex min-h-[44px] items-center rounded-full bg-amber-500 px-6 py-3 text-base font-semibold text-black shadow-lg active:bg-amber-600"
        >
          🐺 Report Sighting
        </Link>
      </div>
    </div>
  )
}
