import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Activity, TrendingUp, Zap, Flame, Mountain, Clock, Heart } from 'lucide-react'
import { useAppStore, useUnits } from '../store'
import { Card, StatTile, PageHeader, SectionHeader, PillSelect, Spinner, EmptyState, HRZoneBar } from '../components/ui'
import { FitnessChart, WeeklyVolumeChart, ActivityTypePie, HRVChart, SleepChart, BodyBatteryChart } from '../components/charts'
import { formatDuration, formatDate, formatPace, activityIcon, activityLabel, activityColor, tsbStatus, hrvStatusColor, trainingReadinessColor } from '../utils/format'

// ── Simple login/register modal ───────────────────────────────────────────────

function AuthModal({ apiUrl, onSuccess }: { apiUrl: string; onSuccess: (token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const api = axios.create({ baseURL: `${apiUrl}/api/v1` })

  const mutation = useMutation({
    mutationFn: async () => {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      if (mode === 'login') {
        const form = new FormData()
        form.append('username', email)
        form.append('password', password)
        const { data } = await api.post(endpoint, form)
        return data
      } else {
        const { data } = await api.post(endpoint, { email, password })
        return data
      }
    },
    onSuccess: (data) => onSuccess(data.access_token),
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed — check credentials'),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, width: 360 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>VeloTrack — Self-Hosted Dashboard</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && mutation.mutate()}
            style={inputStyle}
          />
          {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px', background: '#ef444415', borderRadius: 6 }}>{error}</div>}
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !email || !password}
            style={{ padding: '11px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {mutation.isPending ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
          <button
            onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: 4 }}
          >
            {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', width: '100%',
} as const

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { settings, isServerAvailable } = useAppStore()
  const { distance, elevation, pace } = useUnits()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'7' | '30' | '90' | '365'>('30')
  const [volMetric, setVolMetric] = useState<'distance_km' | 'duration_h' | 'tss'>('distance_km')
  const [token, setToken] = useState(() => localStorage.getItem('velotrack_token') || '')
  const [showAuth, setShowAuth] = useState(false)

  const api = axios.create({
    baseURL: `${settings.apiUrl}/api/v1`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  function handleToken(t: string) {
    localStorage.setItem('velotrack_token', t)
    setToken(t)
    setShowAuth(false)
  }

  const { data: dashboard, isLoading, error: dashError } = useQuery({
    queryKey: ['dashboard', period, token],
    queryFn: () => api.get(`/stats/dashboard?days=${period}`).then(r => r.data),
    enabled: isServerAvailable && !!token,
    staleTime: 60_000,
    retry: false,
  })

  const { data: recentActs } = useQuery({
    queryKey: ['recent-activities', token],
    queryFn: () => api.get('/activities/recent?limit=6').then(r => r.data),
    enabled: isServerAvailable && !!token,
    retry: false,
  })

  const { data: hrv } = useQuery({
    queryKey: ['hrv', 60, token],
    queryFn: () => api.get('/health-metrics/hrv?days=60').then(r => r.data),
    enabled: isServerAvailable && !!token,
  })

  const { data: sleep } = useQuery({
    queryKey: ['sleep', 30, token],
    queryFn: () => api.get('/health-metrics/sleep?days=30').then(r => r.data),
    enabled: isServerAvailable && !!token,
  })

  const { data: bodyBattery } = useQuery({
    queryKey: ['body-battery', 14, token],
    queryFn: () => api.get('/health-metrics/body-battery?days=14').then(r => r.data),
    enabled: isServerAvailable && !!token,
  })

  const { data: todayHealth } = useQuery({
    queryKey: ['health-today', token],
    queryFn: () => api.get('/health-metrics/today').then(r => r.data),
    enabled: isServerAvailable && !!token,
  })

  // 401 = need to login
  const needs401 = (dashError as any)?.response?.status === 401

  if (!isServerAvailable) {
    return (
      <div style={{ padding: 28 }}>
        <PageHeader title="Dashboard" subtitle="VeloTrack — Self-Hosted Activity Analytics" />
        <Card style={{ marginTop: 24 }}>
          <EmptyState icon="🔌" message="Server not connected. Set your API URL in Settings." action={
            <button onClick={() => navigate('/settings')} style={accentBtn}>Go to Settings</button>
          } />
        </Card>
      </div>
    )
  }

  if (!token || needs401 || showAuth) {
    return (
      <>
        <div style={{ padding: 28 }}>
          <PageHeader title="Dashboard" />
          <Card>
            <EmptyState icon="🔐" message="Sign in to view your dashboard." action={
              <button onClick={() => setShowAuth(true)} style={accentBtn}>Sign In / Register</button>
            } />
          </Card>
        </div>
        {(showAuth || !token || needs401) && (
          <AuthModal apiUrl={settings.apiUrl} onSuccess={handleToken} />
        )}
      </>
    )
  }

  const D = dashboard

  return (
    <div style={{ padding: 28 }}>
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <PillSelect
              options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: '365', label: '1y' }]}
              value={period}
              onChange={(v) => setPeriod(v as any)}
            />
            <button onClick={() => { localStorage.removeItem('velotrack_token'); setToken('') }}
              style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        }
      />

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={28} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Today's vitals */}
          {todayHealth && Object.keys(todayHealth).length > 0 && (
            <section>
              <SectionHeader title="Today" />
              <div style={grid(4)}>
                <StatTile label="Training Readiness" value={todayHealth?.training_readiness ? `${Math.round(todayHealth.training_readiness)}` : '—'} sub={todayHealth?.training_readiness_desc} color={trainingReadinessColor(todayHealth?.training_readiness)} icon={<Zap size={14} />} />
                <StatTile label="HRV Last Night" value={todayHealth?.hrv_last_night ? `${Math.round(todayHealth.hrv_last_night)} ms` : '—'} sub={todayHealth?.hrv_status} color={hrvStatusColor(todayHealth?.hrv_status)} icon={<Heart size={14} />} />
                <StatTile label="Resting HR" value={todayHealth?.resting_hr ? `${Math.round(todayHealth.resting_hr)} bpm` : '—'} icon={<Heart size={14} />} />
                <StatTile label="Body Battery" value={todayHealth?.body_battery_highest != null ? `${Math.round(todayHealth.body_battery_highest)}` : '—'} sub={`Low: ${todayHealth?.body_battery_lowest != null ? Math.round(todayHealth.body_battery_lowest) : '—'}`} color="#22c55e" icon={<Zap size={14} />} />
              </div>
            </section>
          )}

          {/* Period stats */}
          {D?.totals && (
            <section>
              <SectionHeader title={`Last ${period} Days`} />
              <div style={grid(5)}>
                <StatTile label="Activities" value={D.totals.activities ?? 0} icon={<Activity size={14} />} color="var(--accent)" />
                <StatTile label="Distance" value={distance((D.totals.distance_km ?? 0) * 1000)} icon={<TrendingUp size={14} />} />
                <StatTile label="Duration" value={formatDuration((D.totals.duration_hours ?? 0) * 3600)} icon={<Clock size={14} />} />
                <StatTile label="Elevation" value={elevation(D.totals.elevation_gain_m ?? 0)} icon={<Mountain size={14} />} color="#a855f7" />
                <StatTile label="Total TSS" value={D.totals.tss?.toFixed(0) ?? '0'} sub="Training Stress" icon={<Flame size={14} />} color="#f97316" />
              </div>
            </section>
          )}

          {/* Fitness curve */}
          {D?.fitness_curve?.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
              <Card>
                <SectionHeader title="Fitness · Fatigue · Form" subtitle="CTL (blue) · ATL (orange) · TSB (purple)" />
                <FitnessChart data={D.fitness_curve} />
                {D.athlete && (
                  <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
                    {[
                      { label: 'Fitness (CTL)', value: D.athlete.ctl?.toFixed(1), color: '#3b82f6' },
                      { label: 'Fatigue (ATL)', value: D.athlete.atl?.toFixed(1), color: '#f97316' },
                      { label: 'Form (TSB)', value: D.athlete.tsb?.toFixed(1), color: '#a855f7', status: D.athlete.tsb != null ? tsbStatus(D.athlete.tsb) : null },
                    ].map(({ label, value, color, status }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color, lineHeight: 1.1 }}>
                          {value ?? '—'}
                          {status && <span style={{ fontSize: 11, color: status.color, marginLeft: 6 }}>{status.label}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <SectionHeader title="Weekly Volume" />
                  <PillSelect options={[{ value: 'distance_km', label: 'Dist' }, { value: 'duration_h', label: 'Time' }, { value: 'tss', label: 'TSS' }]} value={volMetric} onChange={(v) => setVolMetric(v as any)} />
                </div>
                <WeeklyVolumeChart data={D.weekly_volumes ?? []} metric={volMetric} />
              </Card>
            </div>
          )}

          {/* Activity mix */}
          {D?.by_type && Object.keys(D.by_type).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16 }}>
              <Card>
                <SectionHeader title="Activity Mix" />
                <ActivityTypePie data={Object.entries(D.by_type).map(([type, v]: any) => ({ type, count: v.count }))} />
                {Object.entries(D.by_type as Record<string, any>).map(([type, v]) => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{activityIcon(type)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{activityLabel(type)}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{v.count} · {v.distance_km?.toFixed(0)} km</span>
                  </div>
                ))}
              </Card>
              <Card>
                <SectionHeader title="HRV Trend" />
                {hrv?.length ? <HRVChart data={hrv} /> : <EmptyState icon="💓" message="No HRV data yet — sync Garmin" />}
              </Card>
            </div>
          )}

          {/* Sleep */}
          {sleep?.length > 0 && (
            <Card>
              <SectionHeader title="Sleep" subtitle="Deep (navy) · REM (purple) · Light (gray)" />
              <SleepChart data={sleep.slice(-30)} />
            </Card>
          )}

          {/* Body battery */}
          {bodyBattery?.length > 0 && (
            <Card>
              <SectionHeader title="Body Battery" />
              <BodyBatteryChart data={bodyBattery} />
            </Card>
          )}

          {/* Recent activities */}
          <Card>
            <SectionHeader title="Recent Activities" action={
              <button onClick={() => navigate('/activities')} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
            } />
            {recentActs?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentActs.map((act: any) => <ActivityRow key={act.id} act={act} onClick={() => navigate(`/activities/${act.id}`)} />)}
              </div>
            ) : (
              <EmptyState icon="🏃" message="No activities yet. Upload a GPX or sync Garmin." action={
                <button onClick={() => navigate('/upload')} style={accentBtn}>Upload File</button>
              } />
            )}
          </Card>

        </div>
      )}
    </div>
  )
}

function ActivityRow({ act, onClick }: { act: any; onClick: () => void }) {
  const { distance, elevation, pace } = useUnits()
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${activityColor(act.activity_type)}22`, border: `1px solid ${activityColor(act.activity_type)}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
        {activityIcon(act.activity_type)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(act.start_time, 'long')}</div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
        {[
          { v: act.distance_meters ? distance(act.distance_meters) : null, label: 'dist' },
          { v: formatDuration(act.duration_seconds), label: 'time' },
          { v: act.avg_pace_per_km ? pace(act.avg_pace_per_km) : null, label: 'pace' },
          { v: act.elevation_gain_m ? elevation(act.elevation_gain_m) : null, label: 'elev' },
        ].filter(x => x.v && x.v !== '—').map(({ v, label }) => (
          <div key={label} style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{v}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function grid(cols: number) {
  return { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 } as const
}

const accentBtn = {
  padding: '8px 16px', borderRadius: 6, border: 'none',
  background: 'var(--accent)', color: '#000', fontSize: 12, fontWeight: 600, cursor: 'pointer',
} as const
