'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import Link from 'next/link'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type Sighting = { lat: number; lng: number; count: number }

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)

  useEffect(() => {
    if (map.current || !mapContainer.current) return

    const instance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-78.9429, 43.8975],
      zoom: 11,
    })
    map.current = instance

    instance.on('load', async () => {
      try {
        const res = await fetch('/api/sightings')
        if (!res.ok) return
        const sightings: Sighting[] = await res.json()

        const geojson: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: sightings.map((s) => ({
            type: 'Feature',
            properties: { count: s.count },
            geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
          })),
        }

        instance.addSource('sightings', { type: 'geojson', data: geojson })
        instance.addLayer({
          id: 'sightings-heat',
          type: 'heatmap',
          source: 'sightings',
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'count'], 0, 0, 10, 1],
            'heatmap-intensity': 3,
            'heatmap-radius': 20,
            'heatmap-opacity': 1,
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,    'rgba(0,0,0,0)',
              0.05, 'rgba(244,67,54,0.15)',
              0.3,  'rgba(244,67,54,0.6)',
              1,    'rgba(200,0,0,1)',
            ],
          },
        })
      } catch {
        // silently fail — heatmap just won't load
      }
    })

    return () => {
      instance.remove()
      map.current = null
    }
  }, [])

  return (
    <div className="relative h-screen w-full">
      <div ref={mapContainer} className="h-full w-full" />
      <div className="absolute top-4 left-4 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
        Last 7 days
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <Link
          href="/report"
          className="flex min-h-[44px] items-center rounded-full bg-amber-500 px-6 py-3 text-base font-semibold text-black shadow-lg active:bg-amber-600"
        >
          Report Sighting
        </Link>
      </div>
    </div>
  )
}
