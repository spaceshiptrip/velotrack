import { useApi } from '../hooks/useApi'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useAppStore, useUnits } from '../store'
import { Card, PageHeader, SectionHeader, StatTile, PillSelect, Spinner, EmptyState, ProgressBar } from '../components/ui'
import { FitnessChart, WeeklyVolumeChart, MonthlyChart } from '../components/charts'
import { tsbStatus, formatDate } from '../utils/format'

export default function TrainingLoadPage() {
  const { settings } = useAppStore()
  const [period, setPeriod] = useState<'90' | '180' | '365'>('180')
  const api = useApi()

  const { data: fitnessCurve, isLoading } = useQuery({
    queryKey: ['fitness-curve', period],
    queryFn: () => api.get(`/stats/fitness-curve?days=${period}`).then(r => r.data),
  })

  const { data: trainingLoad } = useQuery({
    queryKey: ['training-load'],
    queryFn: () => api.get('/stats/training-load').then(r => r.data),
  })

  const { data: weekly } = useQuery({
    queryKey: ['weekly-load'],
    queryFn: () => api.get('/stats/weekly-load?weeks=16').then(r => r.data),
  })

  const { data: monthly } = useQuery({
    queryKey: ['monthly-summary'],
    queryFn: () => api.get(`/stats/monthly-summary`).then(r => r.data),
  })

  const { data: hrZones } = useQuery({
    queryKey: ['hr-zones'],
    queryFn: () => api.get('/stats/hr-zones-breakdown?days=30').then(r => r.data),
  })

  const { data: prs } = useQuery({
    queryKey: ['prs'],
    queryFn: () => api.get('/stats/personal-records?activity_type=running').then(r => r.data),
  })

  const last = fitnessCurve?.length ? fitnessCurve[fitnessCurve.length - 1] : null
  const tsb = last?.tsb
  const tsbInfo = tsb != null ? tsbStatus(tsb) : null
  const [volMetric, setVolMetric] = useState<'distance_km' | 'duration_h' | 'tss'>('tss')

  const acwr = trainingLoad?.acwr

  return (
    <div style={{ padding: 28 }}>
      <PageHeader
        title="Training Load"
        subtitle="Fitness · Fatigue · Form · Monotony · ACWR"
        action={
          <PillSelect
            options={[{ value: '90', label: '3m' }, { value: '180', label: '6m' }, { value: '365', label: '1y' }]}
            value={period}
            onChange={(v) => setPeriod(v as any)}
          />
        }
      />

      {/* Current state KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatTile
          label="Fitness (CTL)"
          value={last?.ctl?.toFixed(1) ?? '—'}
          sub="Chronic Training Load"
          color="#3b82f6"
          icon={<span style={{ fontSize: 14 }}>📈</span>}
        />
        <StatTile
          label="Fatigue (ATL)"
          value={last?.atl?.toFixed(1) ?? '—'}
          sub="Acute Training Load"
          color="#f97316"
          icon={<span style={{ fontSize: 14 }}>🔥</span>}
        />
        <StatTile
          label="Form (TSB)"
          value={tsb != null ? tsb.toFixed(1) : '—'}
          sub={tsbInfo?.label}
          color={tsbInfo?.color}
          icon={<span style={{ fontSize: 14 }}>⚖️</span>}
        />
        <StatTile
          label="ACWR"
          value={acwr != null ? acwr.toFixed(2) : '—'}
          sub={acwr ? (acwr < 0.8 ? 'Detraining' : acwr < 1.3 ? '✓ Safe zone' : acwr < 1.5 ? '⚠ Caution' : '🔴 Danger') : undefined}
          color={acwr ? (acwr >= 1.5 ? '#ef4444' : acwr >= 1.3 ? '#f97316' : 'var(--accent)') : undefined}
          icon={<span style={{ fontSize: 14 }}>📊</span>}
        />
        <StatTile
          label="Monotony"
          value={trainingLoad?.monotony?.toFixed(2) ?? '—'}
          sub={trainingLoad?.monotony ? (trainingLoad.monotony > 2 ? '⚠ High' : '✓ Good') : undefined}
          color={trainingLoad?.monotony > 2 ? '#f97316' : 'var(--accent)'}
          icon={<span style={{ fontSize: 14 }}>🎯</span>}
        />
      </div>

      {/* TSB guidance */}
      {tsbInfo && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 10,
          background: `${tsbInfo.color}15`, border: `1px solid ${tsbInfo.color}40`,
          fontSize: 13, color: tsbInfo.color, display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: 18 }}>
            {tsb > 25 ? '🟢' : tsb > 5 ? '🟡' : tsb > -10 ? '🟠' : tsb > -25 ? '🔴' : '💀'}
          </span>
          <div>
            <strong>{tsbInfo.label}</strong> — Form TSB: {tsb?.toFixed(1)}.
            {tsb > 25 && ' Peak form — race or test fitness.'}
            {tsb > 5 && tsb <= 25 && ' Good form — ready for quality sessions.'}
            {tsb > -10 && tsb <= 5 && ' Balanced — maintain consistent training.'}
            {tsb > -25 && tsb <= -10 && ' Tired — reduce load, focus on recovery.'}
            {tsb <= -25 && ' Overreached — rest is required.'}
          </div>
        </div>
      )}

      {/* ACWR guidance */}
      {acwr != null && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 10,
          background: acwr >= 1.5 ? '#ef444415' : acwr >= 1.3 ? '#f9731615' : 'var(--accent-dim)',
          border: `1px solid ${acwr >= 1.5 ? '#ef444440' : acwr >= 1.3 ? '#f9731640' : 'var(--border)'}`,
          fontSize: 13,
          color: acwr >= 1.5 ? '#ef4444' : acwr >= 1.3 ? '#f97316' : 'var(--text-secondary)',
        }}>
          <strong>Acute:Chronic Workload Ratio (ACWR): {acwr.toFixed(2)}</strong>
          {acwr < 0.8 && ' — Very low load. Risk of detraining.'}
          {acwr >= 0.8 && acwr < 1.3 && ' — Safe zone. Good fitness building rate.'}
          {acwr >= 1.3 && acwr < 1.5 && ' — Caution zone. Injury risk elevated. Monitor recovery.'}
          {acwr >= 1.5 && ' — Danger zone! Significantly elevated injury risk. Reduce load immediately.'}
        </div>
      )}

      {/* Fitness curve */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <SectionHeader
            title="Fitness · Fatigue · Form"
            subtitle="CTL (blue fitness) · ATL (orange fatigue) · TSB (purple form) · TSS bars"
          />
        </div>
        {isLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
          : fitnessCurve?.length ? <FitnessChart data={fitnessCurve} />
          : <EmptyState icon="📈" message="Sync activities to build fitness curve" />}
      </Card>

      {/* Weekly + Monthly */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <SectionHeader title="Weekly Load" />
            <PillSelect
              options={[{ value: 'tss', label: 'TSS' }, { value: 'distance_km', label: 'Dist' }, { value: 'duration_h', label: 'Time' }]}
              value={volMetric}
              onChange={(v) => setVolMetric(v as any)}
            />
          </div>
          {weekly?.length ? <WeeklyVolumeChart data={weekly} metric={volMetric} /> : <EmptyState icon="📅" message="No data" />}
        </Card>
        <Card>
          <SectionHeader title="Monthly Distance" subtitle={`${new Date().getFullYear()}`} />
          {monthly?.length ? <MonthlyChart data={monthly} /> : <EmptyState icon="🗓️" message="No data" />}
        </Card>
      </div>

      {/* HR Zones breakdown */}
      {hrZones && Object.values(hrZones).some((v: any) => v > 0) && (
        <Card style={{ marginBottom: 16 }}>
          <SectionHeader title="HR Zone Distribution" subtitle="Last 30 days · minutes per zone" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(hrZones).map(([zone, minutes]: any, i) => {
              const total = Object.values(hrZones).reduce((a: number, b: any) => a + b, 0) as number
              const colors = ['#64748b', '#22c55e', '#eab308', '#f97316', '#ef4444']
              const labels = ['Z1 Recovery', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO₂max']
              return (
                <div key={zone} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{labels[i]}</div>
                  <ProgressBar value={minutes} max={total || 1} color={colors[i]} height={8} />
                  <div style={{ width: 70, textAlign: 'right', fontSize: 12, fontFamily: 'var(--font-mono)', color: colors[i], flexShrink: 0 }}>
                    {Math.round(minutes)} min
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Personal records */}
      {prs && Object.keys(prs).some(k => prs[k]) && (
        <Card>
          <SectionHeader title="Personal Records" subtitle="All-time bests · Running" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { key: 'longest_distance', label: 'Longest Run', icon: '📏' },
              { key: 'longest_duration', label: 'Longest Duration', icon: '⏱️' },
              { key: 'most_elevation', label: 'Most Elevation', icon: '⛰️' },
              { key: 'fastest_pace', label: 'Fastest Pace', icon: '⚡' },
              { key: 'most_calories', label: 'Most Calories', icon: '🔥' },
              { key: 'best_tss', label: 'Highest TSS', icon: '💥' },
            ].filter(({ key }) => prs[key]).map(({ key, label, icon }) => {
              const pr = prs[key]
              return (
                <div key={key} style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                    {pr.value != null ? (
                      key === 'longest_distance' ? `${(pr.value / 1000).toFixed(1)} km`
                      : key === 'longest_duration' ? `${Math.round(pr.value / 3600)}h ${Math.round((pr.value % 3600) / 60)}m`
                      : key === 'most_elevation' ? `${Math.round(pr.value)} m`
                      : key === 'fastest_pace' ? `${Math.floor(pr.value / 60)}:${String(Math.round(pr.value % 60)).padStart(2, '0')} /km`
                      : key === 'most_calories' ? `${Math.round(pr.value)} kcal`
                      : pr.value.toFixed(0)
                    ) : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pr.activity_name} · {pr.date ? formatDate(pr.date, 'short') : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
