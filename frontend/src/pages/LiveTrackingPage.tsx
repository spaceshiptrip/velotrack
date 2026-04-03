import { useApi } from '../hooks/useApi'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { Radio, Play, Square, MapPin, Share2, Copy, Check } from 'lucide-react'
import { useAppStore } from '../store'
import { Card, PageHeader, SectionHeader, StatTile, Badge, Spinner, EmptyState } from '../components/ui'
import { ActivityMap } from '../components/map'
import { formatDuration, activityLabel } from '../utils/format'

export default function LiveTrackingPage() {
  const { settings, isServerAvailable } = useAppStore()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [livePoints, setLivePoints] = useState<any[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [actType, setActType] = useState('running')
  const [copied, setCopied] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<number>()

  const api = useApi()

  const startMutation = useMutation({
    mutationFn: () => api.post('/tracking/sessions', { activity_type: actType }).then(r => r.data),
    onSuccess: (data) => {
      setSessionId(data.session_id)
      setShareToken(data.share_token)
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000) as unknown as number
      // Connect WebSocket for receiving own points
      connectWs(data.session_id)
    },
  })

  const endMutation = useMutation({
    mutationFn: () => api.post(`/tracking/sessions/${sessionId}/end`).then(r => r.data),
    onSuccess: () => {
      setSessionId(null)
      clearInterval(timerRef.current)
      if (wsRef.current) wsRef.current.close()
    },
  })

  function connectWs(sid: string) {
    const wsUrl = settings.apiUrl.replace('http', 'ws').replace('https', 'wss')
    const ws = new WebSocket(`${wsUrl}/ws/live/${sid}`)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'point') {
        setLivePoints(prev => [...prev, msg.data])
      }
    }
    wsRef.current = ws
  }

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  // Simulate getting GPS from browser (for demo)
  function sendCurrentLocation() {
    if (!sessionId) return
    navigator.geolocation?.getCurrentPosition(pos => {
      api.post(`/tracking/sessions/${sessionId}/points`, {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        ele: pos.coords.altitude,
        speed: pos.coords.speed,
        time: new Date().toISOString(),
      })
    })
  }

  const shareUrl = shareToken ? `${window.location.origin}/live/${shareToken}` : null

  function copyShare() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ padding: 28 }}>
      <PageHeader
        title="Live Tracking"
        subtitle="Real-time GPS tracking · Share your route live"
      />

      {!isServerAvailable && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: '#f9731615', border: '1px solid #f9731640', fontSize: 13, color: '#f97316' }}>
          ⚠️ Server not connected. Live tracking requires a backend server. Connect one in Settings.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <SectionHeader title="Session Controls" />

            {!sessionId ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Activity Type</label>
                  <select value={actType} onChange={e => setActType(e.target.value)} style={{
                    width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13,
                  }}>
                    {['running', 'cycling', 'hiking', 'walking', 'swimming', 'other'].map(t => (
                      <option key={t} value={t}>{activityLabel(t)}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => startMutation.mutate()}
                  disabled={!isServerAvailable || startMutation.isPending}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '11px', borderRadius: 8, border: 'none',
                    background: isServerAvailable ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: isServerAvailable ? '#000' : 'var(--text-muted)',
                    fontSize: 14, fontWeight: 700, cursor: isServerAvailable ? 'pointer' : 'not-allowed',
                  }}
                >
                  {startMutation.isPending ? <Spinner size={16} /> : <Play size={16} fill="currentColor" />}
                  Start Session
                </button>
              </>
            ) : (
              <>
                {/* Live stats */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  <StatTile size="sm" label="Elapsed" value={formatDuration(elapsed)} color="var(--accent)" />
                  <StatTile size="sm" label="Points" value={livePoints.length} />
                  {livePoints.length > 0 && (
                    <>
                      <StatTile size="sm" label="Lat" value={livePoints[livePoints.length - 1].lat?.toFixed(5)} />
                      <StatTile size="sm" label="Lon" value={livePoints[livePoints.length - 1].lon?.toFixed(5)} />
                    </>
                  )}
                </div>

                {/* Location send button (mobile) */}
                <button onClick={sendCurrentLocation} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '9px', marginBottom: 8, borderRadius: 8, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  <MapPin size={14} /> Send Location
                </button>

                <button
                  onClick={() => endMutation.mutate()}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '9px', borderRadius: 8, border: '1px solid #ef444440', background: '#ef444420',
                    color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  <Square size={14} fill="currentColor" /> End Session
                </button>
              </>
            )}
          </Card>

          {/* Share link */}
          {shareToken && (
            <Card>
              <SectionHeader title="Share Live" subtitle="Anyone with this link can follow along" />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, padding: '7px 10px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {shareUrl}
                </div>
                <button onClick={copyShare} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: copied ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </Card>
          )}

          {/* Garmin LiveTrack */}
          <Card>
            <SectionHeader title="Garmin LiveTrack" subtitle="Ingest from Garmin's official sharing link" />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Start a LiveTrack from the Garmin Connect app, then paste the sharing URL here to forward points to VeloTrack.
            </div>
            <input
              placeholder="https://share.garmin.com/..."
              style={{ marginTop: 10, width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
            />
            <button style={{ marginTop: 8, width: '100%', padding: '8px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
              Import LiveTrack
            </button>
          </Card>
        </div>

        {/* Map */}
        <Card padding={8}>
          {sessionId ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>LIVE</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{livePoints.length} points</span>
              </div>
              {livePoints.length > 0 ? (
                <ActivityMap
                  track={[]}
                  livePoints={livePoints}
                  height={520}
                  tileUrl={settings.mapTileUrl}
                  showMarkers={false}
                />
              ) : (
                <div style={{ height: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <Radio size={32} />
                  <div style={{ fontSize: 14 }}>Waiting for location data…</div>
                  <div style={{ fontSize: 12 }}>Click "Send Location" or enable auto-tracking</div>
                </div>
              )}
            </>
          ) : (
            <div style={{ height: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <Radio size={40} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>Start a session to begin tracking</div>
              <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 300 }}>
                Your GPS position will be displayed here in real time. Share the link for others to follow along.
              </div>
            </div>
          )}
        </Card>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  )
}
