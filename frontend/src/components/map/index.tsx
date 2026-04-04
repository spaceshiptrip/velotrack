import { useEffect, useRef, CSSProperties } from 'react'

interface TrackPoint { lat: number; lon: number; ele?: number; hr?: number; time?: string }

interface ActivityMapProps {
  track: TrackPoint[]
  height?: number
  style?: CSSProperties
  tileUrl?: string
  showMarkers?: boolean
  livePoints?: TrackPoint[]
  renderMode?: 'path' | 'heatmap'
}

export function ActivityMap({ track, height = 300, style, tileUrl, showMarkers = true, livePoints, renderMode = 'path' }: ActivityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const polyRef = useRef<any>(null)
  const livePolyRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const heatLayerRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || !track?.length) return
    if (typeof window === 'undefined') return

    import('leaflet').then(async (leafletModule) => {
      const L = (leafletModule as any).default || leafletModule
      ;(window as any).L = L
      await import('leaflet.heat')
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      const map = L.map(containerRef.current!, { zoomControl: true, attributionControl: false })
      mapRef.current = map

      L.tileLayer(
        tileUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19 }
      ).addTo(map)

      const latlngs = track.map(p => [p.lat, p.lon] as [number, number])
      const bounds = L.latLngBounds(latlngs)
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] })
      }

      if (renderMode === 'heatmap') {
        heatLayerRef.current = (L as any).heatLayer(
          buildHeatPoints(track),
          {
            radius: 24,
            blur: 18,
            maxZoom: 19,
            minOpacity: 0.25,
            gradient: {
              0.2: '#2563eb',
              0.45: '#22c55e',
              0.7: '#eab308',
              0.88: '#f97316',
              1.0: '#d63f2a',
            },
          }
        ).addTo(map)
      } else {
        const poly = L.polyline(latlngs, { color: '#22c55e', weight: 3, opacity: 0.9 }).addTo(map)
        polyRef.current = poly
      }

      if (showMarkers && track.length > 1) {
        const start = track[0]
        const end = track[track.length - 1]
        const startIcon = L.divIcon({ html: '<div style="width:10px;height:10px;background:#22c55e;border:2px solid #fff;border-radius:50%;"></div>', iconSize: [10, 10], className: '' })
        const endIcon = L.divIcon({ html: '<div style="width:10px;height:10px;background:#ef4444;border:2px solid #fff;border-radius:50%;"></div>', iconSize: [10, 10], className: '' })
        L.marker([start.lat, start.lon], { icon: startIcon }).addTo(map)
        L.marker([end.lat, end.lon], { icon: endIcon }).addTo(map)
      }
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      heatLayerRef.current = null
    }
  }, [track, renderMode, tileUrl, showMarkers])

  useEffect(() => {
    if (!mapRef.current || !livePoints?.length) return
    import('leaflet').then((L) => {
      if (livePolyRef.current) {
        livePolyRef.current.remove()
      }
      const latlngs = livePoints.map(p => [p.lat, p.lon] as [number, number])
      const livePoly = L.polyline(latlngs, { color: '#f97316', weight: 3, dashArray: '6 4' }).addTo(mapRef.current)
      livePolyRef.current = livePoly

      const last = livePoints[livePoints.length - 1]
      if (markerRef.current) markerRef.current.remove()
      const icon = L.divIcon({ html: '<div style="width:14px;height:14px;background:#f97316;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px #f97316;"></div>', iconSize: [14, 14], className: '' })
      markerRef.current = L.marker([last.lat, last.lon], { icon }).addTo(mapRef.current)
      mapRef.current.panTo([last.lat, last.lon])
    })
  }, [livePoints])

  return (
    <div
      ref={containerRef}
      style={{
        height, width: '100%', borderRadius: 10,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        ...style,
      }}
    />
  )
}

function buildHeatPoints(track: TrackPoint[]) {
  if (!track.length) return []

  const cells = new Map<string, { latSum: number; lonSum: number; count: number }>()

  for (const point of track) {
    const key = heatCellKey(point.lat, point.lon)
    const cell = cells.get(key) || { latSum: 0, lonSum: 0, count: 0 }
    cell.latSum += point.lat
    cell.lonSum += point.lon
    cell.count += 1
    cells.set(key, cell)
  }

  const maxCount = Math.max(...Array.from(cells.values()).map(cell => cell.count), 1)

  return Array.from(cells.values())
    .map((cell) => {
      const intensity = Math.pow(cell.count / maxCount, 1.35)
      return [
        cell.latSum / cell.count,
        cell.lonSum / cell.count,
        Math.max(0.08, intensity),
      ]
    })
    .filter((point) => point[2] > 0)
}

function heatCellKey(lat: number, lon: number) {
  const metersPerDegreeLat = 111_320
  const metersPerDegreeLon = Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180))
  const cellSizeMeters = 8
  const latBucket = Math.round((lat * metersPerDegreeLat) / cellSizeMeters)
  const lonBucket = Math.round((lon * metersPerDegreeLon) / cellSizeMeters)
  return `${latBucket}:${lonBucket}`
}

interface RoutePlannerMapProps {
  height?: number
  waypoints: Array<{ lat: number; lon: number }>
  route?: any
  onMapClick?: (lat: number, lon: number) => void
  tileUrl?: string
}

export function RoutePlannerMap({ height = 500, waypoints, route, onMapClick, tileUrl }: RoutePlannerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const routeLayerRef = useRef<any>(null)
  const waypointLayersRef = useRef<any[]>([])

  useEffect(() => {
    if (!containerRef.current) return
    import('leaflet').then((L) => {
      if (mapRef.current) return

      const map = L.map(containerRef.current!, { zoomControl: true })
      mapRef.current = map

      L.tileLayer(tileUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      map.setView([49.2827, -123.1207], 11)

      if (onMapClick) {
        map.on('click', (e: any) => onMapClick(e.latlng.lat, e.latlng.lng))
      }
    })
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    import('leaflet').then((L) => {
      waypointLayersRef.current.forEach(m => m.remove())
      waypointLayersRef.current = []
      waypoints.forEach((wp, i) => {
        const icon = L.divIcon({
          html: `<div style="width:22px;height:22px;background:${i === 0 ? '#22c55e' : i === waypoints.length - 1 ? '#ef4444' : '#3b82f6'};border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">${i + 1}</div>`,
          iconSize: [22, 22], iconAnchor: [11, 11], className: '',
        })
        const marker = L.marker([wp.lat, wp.lon], { icon }).addTo(mapRef.current)
        waypointLayersRef.current.push(marker)
      })
      if (waypoints.length > 0) {
        const bounds = L.latLngBounds(waypoints.map(w => [w.lat, w.lon] as [number, number]))
        if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [30, 30] })
      }
    })
  }, [waypoints])

  useEffect(() => {
    if (!mapRef.current || !route) return
    import('leaflet').then((L) => {
      if (routeLayerRef.current) routeLayerRef.current.remove()
      routeLayerRef.current = L.geoJSON(route, {
        style: { color: '#3b82f6', weight: 4, opacity: 0.85 },
      }).addTo(mapRef.current)
      if (routeLayerRef.current.getBounds().isValid()) {
        mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [20, 20] })
      }
    })
  }, [route])

  return <div ref={containerRef} style={{ height, width: '100%', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }} />
}
