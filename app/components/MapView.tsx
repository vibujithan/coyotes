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

// Color by how many hours ago — uses case/coalesce to handle null/NaN safely
const COLOR_BY_AGE = (prop: string): mapboxgl.Expression => [
  'case',
  ['<', ['coalesce', ['get', prop], 999], 6],  '#dc2626',  // 0–6h: red
  ['<', ['coalesce', ['get', prop], 999], 24], '#f97316',  // 6–24h: orange
  ['<', ['coalesce', ['get', prop], 999], 72], '#f59e0b',  // 24–72h: amber
  '#ca8a04',                                               // 72h+: yellow
]

function formatHoursAgo(h: number): string {
  if (h < 1) return 'less than an hour ago'
  if (h < 2) return '1 hour ago'
  if (h < 24) return `${Math.floor(h)} hours ago`
  const d = Math.floor(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

function dotColor(h: number): string {
  if (h < 6) return 'rgba(220,38,38'
  if (h < 24) return 'rgba(249,115,22'
  if (h < 72) return 'rgba(245,158,11'
  return 'rgba(202,138,4'
}

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const animFrame = useRef<number | null>(null)
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

      // Restrict panning to reporting region
      instance.setMaxBounds([[-79.40, 43.55], [-78.50, 44.22]])

      // Gray mask outside reporting bbox
      instance.addSource('mask', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              // Outer ring: whole world
              [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]],
              // Inner hole: reporting area (Whitby + surroundings)
              [[-79.20, 43.70], [-79.20, 44.07], [-78.70, 44.07], [-78.70, 43.70], [-79.20, 43.70]],
            ],
          },
        },
      })
      instance.addLayer({
        id: 'mask-layer',
        type: 'fill',
        source: 'mask',
        paint: {
          'fill-color': '#94a3b8',
          'fill-opacity': 0.45,
        },
      })

      try {
        const res = await fetch('/api/sightings')
        if (!res.ok) return
        const sightings: Sighting[] = await res.json()

        const now = Date.now()
        const geojson: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: sightings.map((s) => {
            const ts = s.spotted_at ? new Date(s.spotted_at).getTime() : NaN
            const h = isNaN(ts) ? 168 : Math.max(0, (now - ts) / 3_600_000)
            return {
              type: 'Feature',
              properties: { count: s.count, h },
              geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
            }
          }),
        }

        instance.addSource('sightings', {
          type: 'geojson',
          data: geojson,
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 14,
          clusterProperties: {
            minH: ['min', ['get', 'h']],          // most recent sighting in cluster
            totalCount: ['+', ['get', 'count']],  // total coyotes
          },
        })

        // Pulse ring — unclustered only
        instance.addLayer({
          id: 'sightings-pulse',
          type: 'circle',
          source: 'sightings',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': 5,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': COLOR_BY_AGE('h'),
            'circle-stroke-width': 2,
          },
        })

        // Clustered dots — same size as single dots, color by most recent
        instance.addLayer({
          id: 'sightings-cluster',
          type: 'circle',
          source: 'sightings',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': COLOR_BY_AGE('minH'),
            'circle-radius': 5,
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1.5,
          },
        })

        // Unclustered single dot
        instance.addLayer({
          id: 'sightings-dots',
          type: 'circle',
          source: 'sightings',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': 5,
            'circle-color': COLOR_BY_AGE('h'),
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1.5,
          },
        })

        // Animate pulse ring
        let start: number | null = null
        function animatePulse(ts: number) {
          if (start === null) start = ts
          const t = ((ts - start) % 2000) / 2000
          const radius = 5 + t * 10   // 5→15px (small)
          const opacity = (1 - t).toFixed(2)
          if (instance.getLayer('sightings-pulse')) {
            instance.setPaintProperty('sightings-pulse', 'circle-radius', radius)
            instance.setPaintProperty('sightings-pulse', 'circle-stroke-width', (1 - t) * 2)
            // Keep color expression but override opacity via stroke-color alpha
            instance.setPaintProperty('sightings-pulse', 'circle-stroke-color', COLOR_BY_AGE('h'))
            instance.setPaintProperty('sightings-pulse', 'circle-stroke-opacity', parseFloat(opacity))
          }
          animFrame.current = requestAnimationFrame(animatePulse)
        }
        animFrame.current = requestAnimationFrame(animatePulse)

        // Popup — cluster click
        instance.on('click', 'sightings-cluster', (e) => {
          const features = instance.queryRenderedFeatures(e.point, { layers: ['sightings-cluster'] })
          if (!features.length) return
          const props = features[0].properties!
          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]
          const minH: number = props.minH ?? 0
          const totalCount: number = props.totalCount ?? 1
          const reporters: number = props.point_count ?? 1
          new mapboxgl.Popup({ closeButton: false })
            .setLngLat(coords)
            .setHTML(
              `<div style="font-size:14px;padding:4px 2px;line-height:1.7">
                🐺 <strong>${totalCount} coyote${totalCount !== 1 ? 's' : ''}</strong><br>
                🕐 ${formatHoursAgo(minH)}<br>
                👤 ${reporters === 1 ? '1 person reported' : `${reporters} people reported`}
              </div>`
            )
            .addTo(instance)
        })

        // Popup — single dot click
        instance.on('click', 'sightings-dots', (e) => {
          const features = instance.queryRenderedFeatures(e.point, { layers: ['sightings-dots'] })
          if (!features.length) return
          const props = features[0].properties!
          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]
          const h: number = props.h ?? 0
          const count: number = props.count ?? 1
          new mapboxgl.Popup({ closeButton: false })
            .setLngLat(coords)
            .setHTML(
              `<div style="font-size:14px;padding:4px 2px;line-height:1.7">
                🐺 <strong>${count} coyote${count !== 1 ? 's' : ''}</strong><br>
                🕐 ${formatHoursAgo(h)}<br>
                👤 1 person reported
              </div>`
            )
            .addTo(instance)
        })

        for (const layer of ['sightings-cluster', 'sightings-dots']) {
          instance.on('mouseenter', layer, () => { instance.getCanvas().style.cursor = 'pointer' })
          instance.on('mouseleave', layer, () => { instance.getCanvas().style.cursor = '' })
        }
      } catch {
        // silently fail
      }
    })

    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current)
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
