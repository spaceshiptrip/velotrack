import { useApi } from '../hooks/useApi'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useAppStore, useUnits } from '../store'
import { Card, PageHeader, SectionHeader, StatTile, PillSelect, Spinner, EmptyState, Divider } from '../components/ui'
import { HRVChart, SleepChart, BodyBatteryChart, StressChart } from '../components/charts'
import { formatDate, hrvStatusColor } from '../utils/format'

export default function HealthPage() {
  const { settings } = useAppStore()
  const [period, setPeriod] = useState<'14' | '30' | '60' | '90'>('30')
  const api = useApi()

  const { data: todayHealth } = useQuery({
    queryKey: ['health-today'],
    queryFn: () => api.get('/health-metrics/today').then(r => r.data),
  })

  const { data: hrv, isLoading: hrvLoading } = useQuery({
    queryKey: ['hrv', period],
    queryFn: () => api.get(`/health-metrics/hrv?days=${period}`).then(r => r.data),
  })

  const { data: sleep, isLoading: sleepLoading } = useQuery({
    queryKey: ['sleep', period],
    queryFn: () => api.get(`/health-metrics/sleep?days=${period}`).then(r => r.data),
  })

  const { data: bb } = useQuery({
    queryKey: ['body-battery', period],
    queryFn: () => api.get(`/health-metrics/body-battery?days=${period}`).then(r => r.data),
  })

  const { data: health } = useQuery({
    queryKey: ['health-range', period],
    queryFn: () => api.get(`/health-metrics?days=${period}`).then(r => r.data),
  })

  // Compute sleep averages
  const sleepAvgs = sleep?.length ? {
    avgDuration: sleep.reduce((s: number, d: any) => s + (d.duration_hours || 0), 0) / sleep.length,
    avgScore: sleep.filter((d: any) => d.score).reduce((s: number, d: any) => s + d.score, 0) / sleep.filter((d: any) => d.score).length,
    avgDeep: sleep.reduce((s: number, d: any) => s + (d.deep_h || 0), 0) / sleep.length,
    avgRem: sleep.reduce((s: number, d: any) => s + (d.rem_h || 0), 0) / sleep.length,
    avgSpo2: sleep.filter((d: any) => d.spo2).reduce((s: number, d: any) => s + d.spo2, 0) / (sleep.filter((d: any) => d.spo2).length || 1),
  } : null

  // HRV averages
  const hrvAvg = hrv?.filter((d: any) => d.last_night)
    .reduce((s: number, d: any) => s + d.last_night, 0) / (hrv?.filter((d: any) => d.last_night).length || 1)

  // Stress averages
  const avgStress = health?.filter((d: any) => d.avg_stress)
    .reduce((s: number, d: any) => s + d.avg_stress, 0) / (health?.filter((d: any) => d.avg_stress).length || 1)

  const T = todayHealth

  return (
    <div style={{ padding: 28 }}>
      <PageHeader
        title="Health Metrics"
        subtitle="Sleep · HRV · Stress · Body Battery · Steps"
        action={
          <PillSelect
            options={[{ value: '14', label: '2w' }, { value: '30', label: '1m' }, { value: '60', label: '2m' }, { value: '90', label: '3m' }]}
            value={period}
            onChange={(v) => setPeriod(v as any)}
          />
        }
      />

      {/* Today snapshot */}
      <section style={{ marginBottom: 24 }}>
        <SectionHeader title="Today's Overview" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <StatTile label="HRV" value={T?.hrv_last_night ? `${Math.round(T.hrv_last_night)} ms` : '—'} sub={T?.hrv_status} color={hrvStatusColor(T?.hrv_status)} />
          <StatTile label="Resting HR" value={T?.resting_hr ? `${Math.round(T.resting_hr)} bpm` : '—'} color="#ef4444" />
          <StatTile label="Sleep Score" value={T?.sleep_score ? Math.round(T.sleep_score) : '—'} color={T?.sleep_score >= 80 ? 'var(--accent)' : T?.sleep_score >= 60 ? '#eab308' : '#ef4444'} />
          <StatTile label="Body Battery" value={T?.body_battery_highest != null ? Math.round(T.body_battery_highest) : '—'} sub={`Low: ${T?.body_battery_lowest != null ? Math.round(T.body_battery_lowest) : '—'}`} color="#22c55e" />
          <StatTile label="Readiness" value={T?.training_readiness ? Math.round(T.training_readiness) : '—'} sub={T?.training_readiness_desc} color="var(--accent)" />
        </div>
      </section>

      {/* HRV */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionHeader title="Heart Rate Variability (HRV)" subtitle="Higher is generally better — track trends not absolute values" />
          {hrvLoading ? <Spinner /> : hrv?.length ? <HRVChart data={hrv} /> : <EmptyState icon="💓" message="No HRV data synced yet" />}
          {hrv?.length > 0 && (
            <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{period}d Average</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{isNaN(hrvAvg) ? '—' : `${hrvAvg.toFixed(0)} ms`}</div>
              </div>
              {T?.hrv_5min_high && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Last Night Range</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {T.hrv_5min_low?.toFixed(0)} – {T.hrv_5min_high?.toFixed(0)} ms
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader title="Stress" subtitle="0–25 low · 25–50 medium · 50–75 high" />
          {health?.length ? (
            <>
              <StressChart data={health.filter((d: any) => d.avg_stress != null).map((d: any) => ({ date: d.date, avg_stress: d.avg_stress }))} />
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Average Stress</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: avgStress > 50 ? '#ef4444' : avgStress > 25 ? '#f97316' : 'var(--accent)' }}>
                  {isNaN(avgStress) ? '—' : avgStress.toFixed(0)}
                </div>
              </div>
            </>
          ) : <EmptyState icon="😤" message="No stress data" />}
        </Card>
      </div>

      {/* Sleep */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Sleep Analysis" subtitle="Deep (navy) · REM (purple) · Light (gray)" />
        {sleepLoading ? <Spinner /> : sleep?.length ? (
          <>
            <SleepChart data={sleep} />
            {sleepAvgs && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 16 }}>
                <StatTile size="sm" label="Avg Duration" value={`${sleepAvgs.avgDuration.toFixed(1)}h`} color={sleepAvgs.avgDuration >= 7 ? 'var(--accent)' : '#f97316'} />
                <StatTile size="sm" label="Avg Score" value={sleepAvgs.avgScore ? Math.round(sleepAvgs.avgScore) : '—'} color={sleepAvgs.avgScore >= 80 ? 'var(--accent)' : '#eab308'} />
                <StatTile size="sm" label="Avg Deep" value={`${sleepAvgs.avgDeep.toFixed(1)}h`} color="#1d4ed8" />
                <StatTile size="sm" label="Avg REM" value={`${sleepAvgs.avgRem.toFixed(1)}h`} color="#7c3aed" />
                <StatTile size="sm" label="Avg SpO₂" value={sleepAvgs.avgSpo2 ? `${sleepAvgs.avgSpo2.toFixed(1)}%` : '—'} color={sleepAvgs.avgSpo2 >= 95 ? 'var(--accent)' : '#f97316'} />
              </div>
            )}
          </>
        ) : <EmptyState icon="😴" message="No sleep data synced yet" />}
      </Card>

      {/* Body Battery */}
      {bb?.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <SectionHeader title="Body Battery" subtitle="Daily high (green) and low (red) — indicates recovery quality" />
          <BodyBatteryChart data={bb} />
        </Card>
      )}

      {/* Steps & calories table */}
      {health?.length > 0 && (
        <Card>
          <SectionHeader title="Daily Metrics Log" />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Steps', 'Resting HR', 'HRV', 'Sleep', 'SpO₂', 'Readiness', 'Calories'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Date' ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...health].reverse().slice(0, 30).map((d: any) => (
                  <tr key={d.date} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{formatDate(d.date, 'long')}</td>
                    <Td mono>{d.steps?.toLocaleString() ?? '—'}</Td>
                    <Td mono color="#ef4444">{d.resting_hr ? `${Math.round(d.resting_hr)}` : '—'}</Td>
                    <Td mono color={hrvStatusColor(d.hrv_status)}>{d.hrv_last_night ? `${Math.round(d.hrv_last_night)}` : '—'}</Td>
                    <Td mono color={d.sleep_duration_h >= 7 ? 'var(--accent)' : d.sleep_duration_h > 0 ? '#f97316' : undefined}>{d.sleep_duration_h ? `${d.sleep_duration_h.toFixed(1)}h` : '—'}</Td>
                    <Td mono>{d.avg_spo2 ? `${d.avg_spo2.toFixed(1)}%` : '—'}</Td>
                    <Td mono color="var(--accent)">{d.training_readiness ? Math.round(d.training_readiness) : '—'}</Td>
                    <Td mono>{d.total_calories?.toLocaleString() ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function Td({ children, mono, color }: { children: React.ReactNode; mono?: boolean; color?: string }) {
  return (
    <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: 12, color: color || 'var(--text-secondary)' }}>
      {children}
    </td>
  )
}
