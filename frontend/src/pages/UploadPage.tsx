import { useEffect, useState, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Upload, CheckCircle, XCircle, ChevronRight, RefreshCw, AlertCircle, CalendarRange, History } from 'lucide-react'
import { useAppStore } from '../store'
import { Card, PageHeader, SectionHeader, StatTile, Spinner, EmptyState } from '../components/ui'
import { formatDuration, formatDate, activityIcon } from '../utils/format'

function getToken() {
  return localStorage.getItem('velotrack_token') || ''
}

export default function UploadPage() {
  const { settings, isServerAvailable } = useAppStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [results, setResults] = useState<Array<{ file: string; status: 'success' | 'error' | 'pending'; id?: number; error?: string }>>([])
  const [localAnalysis, setLocalAnalysis] = useState<any>(null)
  const [localAnalyzing, setLocalAnalyzing] = useState(false)
  const [syncMode, setSyncMode] = useState<'range' | 'backfill'>('range')
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [backfillDays, setBackfillDays] = useState('365')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastSyncStateRef = useRef<string | null>(null)

  const api = axios.create({
    baseURL: `${settings.apiUrl}/api/v1`,
    headers: { Authorization: `Bearer ${getToken()}` },
  })

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const out = []
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        const ext = file.name.split('.').pop()?.toLowerCase()
        const endpoint = ext === 'fit' ? '/upload/fit' : '/upload/gpx'
        try {
          const { data } = await api.post(endpoint, formData, {
            headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${getToken()}` },
          })
          out.push({ file: file.name, status: 'success' as const, id: data.id })
        } catch (e: any) {
          out.push({ file: file.name, status: 'error' as const, error: e.response?.data?.detail || e.message })
        }
      }
      return out
    },
    onSuccess: (data) => {
      setResults(data)
      qc.invalidateQueries({ queryKey: ['activities'] })
    },
  })

  const hasToken = !!getToken()
  const shouldPollSync = isServerAvailable && hasToken

  const { data: syncStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.get('/sync/status').then(r => r.data as { status: string; last_sync?: string | null; message?: string | null }),
    enabled: shouldPollSync,
    refetchInterval: (query) => query.state.data?.status === 'running' ? 3000 : 15000,
  })

  const rangeSyncMutation = useMutation({
    mutationFn: async () => {
      return api.post('/sync/trigger', { start_date: startDate, end_date: endDate })
    },
    onSuccess: (response) => {
      setSyncError(null)
      setSyncMessage(response.data?.message || 'Sync started')
    },
    onError: (e: any) => {
      setSyncError(e.response?.data?.detail || e.message || 'Sync failed')
    },
  })

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const days = Math.max(1, Number(backfillDays) || 365)
      return api.post(`/sync/backfill?days=${days}`)
    },
    onSuccess: (response) => {
      setSyncError(null)
      setSyncMessage(response.data?.message || 'Backfill started')
    },
    onError: (e: any) => {
      setSyncError(e.response?.data?.detail || e.message || 'Backfill failed')
    },
  })

  useEffect(() => {
    if (!syncStatus) return
    if (syncStatus.status === 'error') {
      setSyncError(syncStatus.message || 'Sync failed')
      lastSyncStateRef.current = syncStatus.status
      return
    }
    if (syncStatus.status === 'running') {
      setSyncError(null)
      setSyncMessage(syncStatus.message || 'Sync running…')
      lastSyncStateRef.current = syncStatus.status
      return
    }
    if (syncStatus.status === 'idle') {
      setSyncError(null)
      if (lastSyncStateRef.current === 'running' || lastSyncStateRef.current === 'error') {
        setSyncMessage(syncStatus.message || 'Sync complete')
        qc.invalidateQueries({ queryKey: ['activities'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      }
      lastSyncStateRef.current = syncStatus.status
    }
  }, [qc, syncStatus])

  async function analyzeLocal(file: File) {
    setLocalAnalyzing(true)
    setLocalAnalysis(null)
    try {
      const text = await file.text()
      const GpxParser = (await import('gpxparser')).default
      const gpx = new GpxParser()
      gpx.parse(text)
      const track = gpx.tracks[0]
      if (!track) throw new Error('No track found')
      const pts = track.points
      let dist = 0, gain = 0, loss = 0
      const hrVals: number[] = []
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i-1], p2 = pts[i]
        const R = 6371000
        const dLat = (p2.lat - p1.lat) * Math.PI / 180
        const dLon = (p2.lon - p1.lon) * Math.PI / 180
        const a = Math.sin(dLat/2)**2 + Math.cos(p1.lat*Math.PI/180)*Math.cos(p2.lat*Math.PI/180)*Math.sin(dLon/2)**2
        dist += 2 * R * Math.asin(Math.sqrt(a))
        const de = (p2.ele||0) - (p1.ele||0)
        if (de > 0) gain += de; else loss += Math.abs(de)
        if ((p2 as any).hr) hrVals.push((p2 as any).hr)
      }
      const start = pts[0]?.time
      const end = pts[pts.length-1]?.time
      const duration = start && end ? (new Date(end).getTime() - new Date(start).getTime()) / 1000 : null
      setLocalAnalysis({
        name: track.name || file.name.replace('.gpx',''),
        activity_type: 'other',
        start_time: start,
        duration_seconds: duration,
        distance_meters: dist,
        elevation_gain_m: gain,
        elevation_loss_m: loss,
        avg_hr: hrVals.length ? hrVals.reduce((a,b)=>a+b,0)/hrVals.length : null,
        gps_track: pts.map((p:any) => ({ lat: p.lat, lon: p.lon, ele: p.ele, time: p.time })),
      })
    } catch(e: any) {
      setResults([{ file: file.name, status: 'error', error: e.message }])
    }
    setLocalAnalyzing(false)
  }

  async function handleFiles(files: File[]) {
    const valid = files.filter(f => /\.(gpx|fit)$/i.test(f.name))
    if (!valid.length) return

    // If server not available or no token, do local analysis
    if (!isServerAvailable || !getToken()) {
      const gpxFiles = valid.filter(f => /\.gpx$/i.test(f.name))
      if (gpxFiles.length) await analyzeLocal(gpxFiles[0])
      return
    }

    setResults(valid.map(f => ({ file: f.name, status: 'pending' })))
    uploadMutation.mutate(valid)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }, [isServerAvailable])
  const syncPending = rangeSyncMutation.isPending || backfillMutation.isPending || syncStatus?.status === 'running'

  return (
    <div style={{ padding: 28 }}>
      <PageHeader title="Import Activities" subtitle="Upload GPX or FIT files" />

      {!isServerAvailable && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#eab30815', border: '1px solid #eab30840', fontSize: 13, color: '#eab308' }}>
          ⚡ Local mode — GPX files analyzed in browser only, not saved.
        </div>
      )}
      {isServerAvailable && !hasToken && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#ef444415', border: '1px solid #ef444440', fontSize: 13, color: '#ef4444' }}>
          ⚠️ Not signed in — go to Dashboard to sign in first, then upload will save activities.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12, padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'var(--accent-dim)' : 'var(--bg-card)', marginBottom: 20,
            }}
          >
            <input ref={fileInputRef} type="file" accept=".gpx,.fit" multiple onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)) }} style={{ display: 'none' }} />
            <Upload size={32} color={dragOver ? 'var(--accent)' : 'var(--text-muted)'} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Drop GPX or FIT files here</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>or click to browse</div>
          </div>

          {(results.length > 0 || uploadMutation.isPending) && (
            <Card style={{ marginBottom: 16 }}>
              <SectionHeader title="Import Results" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    {r.status === 'pending' ? <Spinner size={16} />
                      : r.status === 'success' ? <CheckCircle size={16} color="var(--accent)" />
                      : <XCircle size={16} color="var(--red)" />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{r.file}</div>
                      {r.error && <div style={{ fontSize: 11, color: 'var(--red)' }}>{r.error}</div>}
                    </div>
                    {r.id && (
                      <button onClick={() => navigate(`/activities/${r.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        View <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {results.filter(r => r.status === 'success').length > 0 && (
                <button onClick={() => navigate('/activities')} style={{ marginTop: 12, width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  View All Activities →
                </button>
              )}
            </Card>
          )}

          {localAnalyzing && (
            <Card style={{ textAlign: 'center', padding: 32 }}>
              <Spinner size={28} />
              <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 13 }}>Analyzing GPX…</div>
            </Card>
          )}

          {localAnalysis && (
            <Card>
              <SectionHeader title="GPX Analysis" subtitle="Local analysis — not saved" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>{activityIcon(localAnalysis.activity_type)}</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{localAnalysis.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(localAnalysis.start_time, 'long')}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <StatTile size="sm" label="Distance" value={localAnalysis.distance_meters ? `${(localAnalysis.distance_meters/1000).toFixed(2)} km` : '—'} />
                <StatTile size="sm" label="Duration" value={formatDuration(localAnalysis.duration_seconds)} />
                <StatTile size="sm" label="Elev Gain" value={localAnalysis.elevation_gain_m ? `${Math.round(localAnalysis.elevation_gain_m)} m` : '—'} color="#a855f7" />
                <StatTile size="sm" label="Avg HR" value={localAnalysis.avg_hr ? `${Math.round(localAnalysis.avg_hr)} bpm` : '—'} color="#ef4444" />
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 6 }}>
                📍 {localAnalysis.gps_track?.length?.toLocaleString()} GPS points · Local mode only
              </div>
            </Card>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <SectionHeader title="Formats" />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <div><strong style={{ color: 'var(--accent)' }}>.GPX</strong> — GPS Exchange Format. Export from Garmin Connect, Strava, Komoot.</div>
              <div style={{ marginTop: 8 }}><strong style={{ color: '#3b82f6' }}>.FIT</strong> — Native Garmin format, richest data (power, dynamics).</div>
            </div>
          </Card>

          <Card>
            <SectionHeader title="Garmin Sync" />
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
              Auto-sync from Garmin Connect runs every 30 min when credentials are configured.
            </div>
            {isServerAvailable && hasToken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${syncStatus?.status === 'error' ? '#ef444440' : syncStatus?.status === 'running' ? 'var(--accent-dim)' : 'var(--border)'}`,
                  background: syncStatus?.status === 'error' ? '#ef444415' : 'var(--bg-elevated)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {syncStatus?.status === 'error'
                      ? <AlertCircle size={14} color="#ef4444" />
                      : <RefreshCw size={14} style={{ animation: syncStatus?.status === 'running' ? 'spin 1s linear infinite' : 'none' }} color={syncStatus?.status === 'running' ? 'var(--accent)' : 'var(--text-muted)'} />}
                    <span style={{ fontSize: 12, fontWeight: 600, color: syncStatus?.status === 'error' ? '#ef4444' : 'var(--text-primary)' }}>
                      {syncStatus?.status === 'running' ? 'Sync in progress' : syncStatus?.status === 'error' ? 'Sync failed' : 'Sync idle'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: syncStatus?.status === 'error' ? '#fca5a5' : 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {syncError || syncMessage || syncStatus?.message || 'No sync activity yet.'}
                  </div>
                  {syncStatus?.last_sync && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                      Last completed: {formatDate(syncStatus.last_sync, 'datetime')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setSyncMode('range')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: syncMode === 'range' ? 'var(--accent)' : 'var(--border)',
                      background: syncMode === 'range' ? 'var(--accent-dim)' : 'transparent',
                      color: syncMode === 'range' ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <CalendarRange size={13} /> Date Range
                  </button>
                  <button
                    onClick={() => setSyncMode('backfill')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: syncMode === 'backfill' ? 'var(--accent)' : 'var(--border)',
                      background: syncMode === 'backfill' ? 'var(--accent-dim)' : 'transparent',
                      color: syncMode === 'backfill' ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <History size={13} /> Backfill
                  </button>
                </div>

                {syncMode === 'range' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Start</span>
                        <input
                          type="date"
                          value={startDate}
                          max={endDate}
                          onChange={e => setStartDate(e.target.value)}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12 }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>End</span>
                        <input
                          type="date"
                          value={endDate}
                          min={startDate}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={e => setEndDate(e.target.value)}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12 }}
                        />
                      </label>
                    </div>
                    <button
                      onClick={() => rangeSyncMutation.mutate()}
                      disabled={syncPending || !startDate || !endDate}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: syncPending ? 'not-allowed' : 'pointer', opacity: syncPending ? 0.7 : 1 }}
                    >
                      <RefreshCw size={14} style={{ animation: syncPending ? 'spin 1s linear infinite' : 'none' }} />
                      {syncPending ? 'Syncing…' : 'Sync Selected Range'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Backfill Days</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={backfillDays}
                        onChange={e => setBackfillDays(e.target.value)}
                        style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12 }}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[90, 365, 730].map(days => (
                        <button
                          key={days}
                          onClick={() => setBackfillDays(String(days))}
                          style={{
                            flex: 1,
                            padding: '7px 8px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: backfillDays === String(days) ? 'var(--accent-dim)' : 'transparent',
                            color: backfillDays === String(days) ? 'var(--accent)' : 'var(--text-secondary)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {days}d
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => backfillMutation.mutate()}
                      disabled={syncPending || !(Number(backfillDays) > 0)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: syncPending ? 'not-allowed' : 'pointer', opacity: syncPending ? 0.7 : 1 }}
                    >
                      <RefreshCw size={14} style={{ animation: syncPending ? 'spin 1s linear infinite' : 'none' }} />
                      {syncPending ? 'Backfilling…' : `Backfill ${Math.max(1, Number(backfillDays) || 365)} Days`}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sign in to enable sync.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
