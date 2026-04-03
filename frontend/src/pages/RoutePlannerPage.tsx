import { useApi } from '../hooks/useApi'
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Trash2, Plus, Download, Save, Navigation, Wifi, WifiOff } from 'lucide-react'
import { useAppStore } from '../store'
import { Card, PageHeader, SectionHeader, Spinner, EmptyState, Badge } from '../components/ui'
import { RoutePlannerMap } from '../components/map'
import { formatDate } from '../utils/format'

const PROFILES = [
  { id: 'trekking', label: 'Touring / Trekking', icon: '🚲' },
  { id: 'fastbike', label: 'Road / Fast Bike', icon: '🏎️' },
  { id: 'hiking', label: 'Hiking / Trail', icon: '🥾' },
  { id: 'road', label: 'Road Safety', icon: '🛣️' },
]

export default function RoutePlannerPage() {
  const { settings } = useAppStore()
  const qc = useQueryClient()
  const [waypoints, setWaypoints] = useState<Array<{ lat: number; lon: number; name?: string }>>([])
  const [profile, setProfile] = useState('trekking')
  const [routeGeoJson, setRouteGeoJson] = useState<any>(null)
  const [routeName, setRouteName] = useState('')
  const [routeStats, setRouteStats] = useState<any>(null)

  const api = useApi()

  const { data: brouterStatus } = useQuery({
    queryKey: ['brouter-status'],
    queryFn: () => api.get('/routing/status').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  const { data: savedRoutes, isLoading: routesLoading } = useQuery({
    queryKey: ['saved-routes'],
    queryFn: () => api.get('/routing/saved').then(r => r.data),
  })

  const calcMutation = useMutation({
    mutationFn: (req: any) => api.post('/routing/calculate', req).then(r => r.data),
    onSuccess: (data) => {
      setRouteGeoJson(data)
      // Extract distance + elevation from GeoJSON properties
      const props = data?.features?.[0]?.properties
      if (props) {
        setRouteStats({
          distance_m: props['track-length'] || props.distance,
          elevation_gain: props['filtered ascend'] || props.ascend,
          elevation_loss: props['filtered descend'] || props.descend,
          time_min: props['total-time'] ? Math.round(props['total-time'] / 60) : null,
        })
      }
    },
  })

  const saveMutation = useMutation({
    mutationFn: (req: any) => api.post('/routing/saved', req).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-routes'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/routing/saved/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-routes'] }),
  })

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setWaypoints(prev => [...prev, { lat, lon, name: `WP ${prev.length + 1}` }])
  }, [])

  function calculate() {
    if (waypoints.length < 2) return
    calcMutation.mutate({ waypoints, profile, format: 'geojson' })
  }

  function clearRoute() {
    setWaypoints([])
    setRouteGeoJson(null)
    setRouteStats(null)
  }

  function removeWaypoint(i: number) {
    setWaypoints(prev => prev.filter((_, idx) => idx !== i))
    setRouteGeoJson(null)
    setRouteStats(null)
  }

  function downloadGpx() {
    if (!routeGeoJson) return
    calcMutation.mutate({ waypoints, profile, format: 'gpx' })
  }

  function saveRoute() {
    if (!routeGeoJson) return
    saveMutation.mutate({
      name: routeName || `Route ${new Date().toLocaleDateString()}`,
      profile,
      activity_type: profile === 'hiking' ? 'hiking' : 'cycling',
      track_geojson: routeGeoJson,
      waypoints,
      distance_meters: routeStats?.distance_m,
      elevation_gain_m: routeStats?.elevation_gain,
    })
  }

  return (
    <div style={{ padding: 28 }}>
      <PageHeader
        title="Route Planner"
        subtitle="Click the map to add waypoints · Powered by BRouter"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {brouterStatus?.online
              ? <><Wifi size={14} color="var(--accent)" /><span style={{ fontSize: 12, color: 'var(--accent)' }}>BRouter online</span></>
              : <><WifiOff size={14} color="var(--text-muted)" /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>BRouter offline</span></>}
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        {/* Controls panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Profile selector */}
          <Card>
            <SectionHeader title="Routing Profile" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PROFILES.map(p => (
                <button key={p.id} onClick={() => setProfile(p.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8, border: '1px solid',
                  borderColor: profile === p.id ? 'var(--accent)' : 'var(--border)',
                  background: profile === p.id ? 'var(--accent-dim)' : 'transparent',
                  color: profile === p.id ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s',
                }}>
                  <span>{p.icon}</span> {p.label}
                </button>
              ))}
            </div>
          </Card>

          {/* Waypoints */}
          <Card>
            <SectionHeader title={`Waypoints (${waypoints.length})`} subtitle="Click map to add · drag to reorder" />
            {waypoints.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                Click the map to add waypoints
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {waypoints.map((wp, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', background: 'var(--bg-elevated)', borderRadius: 7, border: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: i === 0 ? 'var(--accent)' : i === waypoints.length - 1 ? '#ef4444' : '#3b82f6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#000', flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {wp.lat.toFixed(5)}, {wp.lon.toFixed(5)}
                    </div>
                    <button onClick={() => removeWaypoint(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button onClick={calculate} disabled={waypoints.length < 2 || calcMutation.isPending} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px', borderRadius: 8, border: 'none',
                background: waypoints.length >= 2 ? 'var(--accent)' : 'var(--bg-elevated)',
                color: waypoints.length >= 2 ? '#000' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 700, cursor: waypoints.length >= 2 ? 'pointer' : 'not-allowed',
              }}>
                {calcMutation.isPending ? <Spinner size={14} /> : <Navigation size={13} />}
                Calculate
              </button>
              <button onClick={clearRoute} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                Clear
              </button>
            </div>
          </Card>

          {/* Route stats */}
          {routeStats && (
            <Card>
              <SectionHeader title="Route Stats" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Distance', value: routeStats.distance_m ? `${(routeStats.distance_m / 1000).toFixed(1)} km` : '—' },
                  { label: 'Elevation Gain', value: routeStats.elevation_gain ? `${Math.round(routeStats.elevation_gain)} m` : '—' },
                  { label: 'Elevation Loss', value: routeStats.elevation_loss ? `${Math.round(routeStats.elevation_loss)} m` : '—' },
                  { label: 'Est. Time', value: routeStats.time_min ? `${Math.round(routeStats.time_min)} min` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <input
                  value={routeName}
                  onChange={e => setRouteName(e.target.value)}
                  placeholder="Route name…"
                  style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                />
                <button onClick={saveRoute} disabled={saveMutation.isPending} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <Save size={13} />
                </button>
              </div>
              {saveMutation.isSuccess && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>✓ Route saved!</div>}
            </Card>
          )}

          {/* Saved routes */}
          <Card style={{ flex: 1 }}>
            <SectionHeader title="Saved Routes" />
            {routesLoading ? <Spinner /> : savedRoutes?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {savedRoutes.map((r: any) => (
                  <div key={r.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {r.distance_meters ? `${(r.distance_meters / 1000).toFixed(1)} km` : ''}
                          {r.elevation_gain_m ? ` · +${Math.round(r.elevation_gain_m)} m` : ''}
                          {' · '}{formatDate(r.created_at, 'short')}
                        </div>
                      </div>
                      <button onClick={() => deleteMutation.mutate(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="🗺️" message="No saved routes" />
            )}
          </Card>
        </div>

        {/* Map */}
        <Card padding={8}>
          {!brouterStatus?.online && (
            <div style={{ marginBottom: 8, padding: '8px 12px', background: '#f9731615', border: '1px solid #f9731640', borderRadius: 8, fontSize: 12, color: '#f97316' }}>
              ⚠️ BRouter offline. Start the brouter container or set a custom endpoint in Settings.
            </div>
          )}
          <RoutePlannerMap
            height={580}
            waypoints={waypoints}
            route={routeGeoJson}
            onMapClick={handleMapClick}
            tileUrl={settings.mapTileUrl}
          />
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            Click the map to place waypoints. Need 2+ waypoints to calculate a route.
            {brouterStatus?.endpoint && ` BRouter: ${brouterStatus.endpoint}`}
          </div>
        </Card>
      </div>
    </div>
  )
}
