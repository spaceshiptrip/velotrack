import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useAppStore } from '../store'
import { ActivityMap } from '../components/map'
import { formatDuration, activityIcon, activityLabel } from '../utils/format'

export default function WatchLivePage() {
  const { token } = useParams<{ token: string }>()
  const { settings } = useAppStore()
  const [livePoints, setLivePoints] = useState<any[]>([])
  const [elapsed, setElapsed] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<number>()

  const api = axios.create({ baseURL: `${settings.apiUrl}/api/v1` })

  const { data: session, isLoading } = useQuery({
    queryKey: ['live-session', token],
    queryFn: () => api.get(`/tracking/live/${token}`).then(r => r.data),
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (!session) return
    if (session.track_points?.length) setLivePoints(session.track_points)

    if (session.is_active && session.id) {
      const wsUrl = settings.apiUrl.replace('http', 'ws').replace('https', 'wss')
      if (wsRef.current) wsRef.current.close()
      const ws = new WebSocket(`${wsUrl}/ws/live/${session.id}`)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'point') setLivePoints(prev => [...prev, msg.data])
      }
      wsRef.current = ws

      // Timer
      const start = new Date(session.started_at).getTime()
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000))
      }, 1000) as unknown as number
    }

    return () => {
      if (wsRef.current) wsRef.current.close()
      clearInterval(timerRef.current)
    }
  }, [session?.id])

  const last = livePoints[livePoints.length - 1]
  const isEmpty = !livePoints.length

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          ⚡
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>VeloTrack Live</div>
          {session && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{session.name}</div>}
        </div>
        {session?.is_active && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>LIVE</span>
          </div>
        )}
        {session && !session.is_active && (
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>Session ended</div>
        )}
      </div>

      {/* Stats bar */}
      {session && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          {[
            { label: 'Activity', value: `${activityIcon(session.activity_type)} ${activityLabel(session.activity_type)}` },
            { label: 'Elapsed', value: session.is_active ? formatDuration(elapsed) : formatDuration(session.ended_at ? (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000 : 0) },
            { label: 'Points', value: livePoints.length },
            last?.hr && { label: 'HR', value: `${Math.round(last.hr)} bpm`, color: '#ef4444' },
            last?.speed && { label: 'Speed', value: `${(last.speed * 3.6).toFixed(1)} km/h`, color: 'var(--accent)' },
          ].filter(Boolean).map((stat: any) => (
            <div key={stat.label} style={{ flex: 1, padding: '10px 16px', borderRight: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{stat.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stat.color || 'var(--text-primary)' }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Map */}
      <div style={{ flex: 1, padding: 0 }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-muted)' }}>
            Loading session…
          </div>
        ) : !session ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
            <span style={{ fontSize: 36 }}>🔍</span>
            <div>Live session not found or has expired.</div>
          </div>
        ) : isEmpty ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36 }}>📍</div>
            <div>Waiting for location data…</div>
          </div>
        ) : (
          <ActivityMap
            track={[]}
            livePoints={livePoints}
            height={window.innerHeight - 180}
            tileUrl={settings.mapTileUrl}
            showMarkers={false}
          />
        )}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  )
}
