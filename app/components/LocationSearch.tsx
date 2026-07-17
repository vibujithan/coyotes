'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'

interface Result {
  id: string
  name: string
  lat: number
  lng: number
}

interface Props {
  mapInstance: mapboxgl.Map | null
  onSelect: (lat: number, lng: number) => void
}

export default function LocationSearch({ mapInstance, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }

    debounceRef.current = setTimeout(async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
        )
        url.searchParams.set('access_token', token!)
        url.searchParams.set('proximity', '-78.9429,43.8975')
        url.searchParams.set('bbox', '-79.20,43.70,-78.70,44.07')
        url.searchParams.set('types', 'address,place,poi,neighborhood')
        url.searchParams.set('country', 'ca')
        url.searchParams.set('limit', '5')

        const res = await fetch(url.toString())
        const data = await res.json()
        setResults(
          (data.features ?? []).map((f: { id: string; place_name: string; center: [number, number] }) => ({
            id: f.id,
            name: f.place_name,
            lat: f.center[1],
            lng: f.center[0],
          }))
        )
      } catch {
        setResults([])
      }
    }, 300)
  }, [query])

  // Dismiss on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setResults([])
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function handleSelect(r: Result) {
    if (mapInstance) mapInstance.flyTo({ center: [r.lng, r.lat], zoom: 15 })
    onSelect(r.lat, r.lng)
    setQuery('')
    setResults([])
  }

  return (
    <div
      ref={containerRef}
      className="absolute left-1/2 top-16 z-10 w-[90%] -translate-x-1/2"
    >
      <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-lg">
        <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address or landmark…"
          className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]) }} className="text-gray-400 hover:text-gray-600">
            ×
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-2xl bg-white shadow-xl">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 active:bg-gray-100"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M12 21c-4-4-7-7.5-7-11a7 7 0 0 1 14 0c0 3.5-3 7-7 11z" /><circle cx="12" cy="10" r="2" />
              </svg>
              <span className="text-gray-800 leading-snug">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
