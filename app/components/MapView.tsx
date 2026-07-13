'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import Link from 'next/link'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

type Sighting = { lat: number; lng: number; count: number; spotted_at: string }

const ANIMALS = [
  { name: 'Coyote', emoji: '🐺', active: true, href: '/report' },
  { name: 'Bear', emoji: '🐻', active: false },
  { name: 'Moose', emoji: '🦌', active: false },
  { name: 'Bobcat', emoji: '🐱', active: false },
]

function hoursAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'less than an hour ago'
  if (h === 1) return '1 hour ago'
  if (h < 24) return `${h} hours ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (map.current || !mapContainer.current) return

    const instance = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-78.9429, 43.8975],
      zoom: 11,
    })
    map.current = instance

    instance.on('load', async () => {
      // Hide POI, transit, building clutter
      const hidePatterns = ['poi', 'transit', 'airport', 'building', 'bus']
      const roadPatterns = ['road-label', 'road-number', 'road-intersection', 'road-shield']
      instance.getStyle().layers.forEach((layer) => {
        if (hidePatterns.some((p) => layer.id.includes(p))) {
          instance.setLayoutProperty(layer.id, 'visibility', 'none')
        } else if (roadPatterns.some((p) => layer.id.includes(p))) {
          instance.setPaintProperty(layer.id, 'text-opacity', [
            'interpolate', ['linear'], ['zoom'], 14, 0, 16, 1,
          ])
          instance.setPaintProperty(layer.id, 'icon-opacity', [
            'interpolate', ['linear'], ['zoom'], 14, 0, 16, 1,
          ])
        }
      })

      try {
        const res = await fetch('/api/sightings')
        if (!res.ok) return
        const sightings: Sighting[] = await res.json()

        const geojson: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: sightings.map((s) => ({
            type: 'Feature',
            properties: { count: s.count, spotted_at: s.spotted_at },
            geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
          })),
        }

        instance.addSource('sightings', { type: 'geojson', data: geojson })

        // Heatmap layer
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
              'interpolate', ['linear'], ['heatmap-density'],
              0,    'rgba(0,0,0,0)',
              0.05, 'rgba(244,67,54,0.15)',
              0.3,  'rgba(244,67,54,0.6)',
              1,    'rgba(200,0,0,1)',
            ],
          },
        })

        // Invisible click-target dots
        instance.addLayer({
          id: 'sightings-dots',
          type: 'circle',
          source: 'sightings',
          paint: {
            'circle-radius': 18,
            'circle-color': 'rgba(0,0,0,0)',
          },
        })

        // Click handler
        instance.on('click', 'sightings-dots', (e) => {
          const features = instance.queryRenderedFeatures(e.point, { layers: ['sightings-dots'] })
          if (!features.length) return

          // Aggregate nearby sightings
          const count = features.length
          const totalCoyotes = features.reduce((sum, f) => sum + ((f.properties?.count as number) ?? 1), 0)
          const mostRecent = features[0].properties?.spotted_at as string

          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]

          new mapboxgl.Popup({ closeButton: false, className: 'sighting-popup' })
            .setLngLat(coords)
            .setHTML(
              `<div style="font-size:14px;padding:4px 2px;line-height:1.6">
                🐺 <strong>${totalCoyotes} coyote${totalCoyotes !== 1 ? 's' : ''}</strong><br>
                🕐 ${hoursAgo(mostRecent)}<br>
                👤 ${count === 1 ? '1 person reported' : `${count} people reported`}
              </div>`
            )
            .addTo(instance)
        })

        instance.on('mouseenter', 'sightings-dots', () => {
          instance.getCanvas().style.cursor = 'pointer'
        })
        instance.on('mouseleave', 'sightings-dots', () => {
          instance.getCanvas().style.cursor = ''
        })
      } catch {
        // silently fail
      }
    })

    return () => {
      instance.remove()
      map.current = null
    }
  }, [])

  return (
    <div className="relative h-[100dvh] w-full">
      <div ref={mapContainer} className="h-full w-full" />

      <div className="absolute top-4 left-4 rounded-full bg-white px-3 py-1 text-sm font-medium text-gray-700 shadow-md">
        Last 7 days
      </div>

      {/* FAB */}
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="absolute bottom-8 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-3xl text-white shadow-xl active:bg-red-600"
        aria-label="Report sighting"
      >
        {menuOpen ? '×' : '+'}
      </button>

      {/* Animal picker sheet */}
      {menuOpen && (
        <>
          <div className="absolute inset-0 bg-black/20" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-28 right-4 w-52 overflow-hidden rounded-2xl bg-white shadow-2xl">
            <p className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Report sighting
            </p>
            {ANIMALS.map((a) =>
              a.active ? (
                <Link
                  key={a.name}
                  href={a.href!}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 active:bg-gray-100"
                >
                  <span className="text-xl">{a.emoji}</span>
                  {a.name}
                </Link>
              ) : (
                <div key={a.name} className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300">
                  <span className="text-xl opacity-40">{a.emoji}</span>
                  {a.name}
                  <span className="ml-auto text-xs">Soon</span>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}
