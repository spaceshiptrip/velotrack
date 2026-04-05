import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceLine, ComposedChart, Scatter, ScatterChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell, Legend,
} from 'recharts'
import { formatDate, formatDuration, formatPace } from '../../utils/format'

// ── Shared tooltip style ──────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 12, color: 'var(--text-primary)', padding: '8px 12px',
}
const LIGHT_TICK = { fill: '#cbd5e1', fontSize: 11 }
const LIGHT_AXIS = { tick: LIGHT_TICK, axisLine: false, tickLine: false }
const TOOLTIP_LABEL_STYLE = { color: '#e2e8f0' }
const TOOLTIP_ITEM_STYLE = { color: '#e2e8f0' }
const PICKLEBALL_STROKE_LABELS: Record<string, string> = {
  forehand: 'Forehand',
  backhand: 'Backhand',
  forehand_slice: 'Forehand Slice',
  backhand_slice: 'Backhand Slice',
  serve: 'Serve',
}

const GRID_PROPS = { strokeDasharray: '3 3', stroke: 'var(--border-subtle)', strokeOpacity: 0.6 }
const AXIS_PROPS = { tick: { fill: 'var(--text-muted)', fontSize: 11 }, axisLine: false, tickLine: false }

// ── Fitness / Fatigue chart (ATL / CTL / TSB) ─────────────────────────────────

export function FitnessChart({ data }: { data: Array<{ date: string; ctl: number; atl: number; tsb: number; tss?: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={(d) => formatDate(d, 'short')} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d) => formatDate(d as string, 'long')}
          formatter={(val: number, name: string) => [val.toFixed(1), { ctl: 'Fitness (CTL)', atl: 'Fatigue (ATL)', tsb: 'Form (TSB)', tss: 'TSS' }[name] || name]}
        />
        <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 2" />
        <Area type="monotone" dataKey="ctl" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} dot={false} name="ctl" />
        <Area type="monotone" dataKey="atl" stroke="#f97316" fill="#f9731610" strokeWidth={1.5} dot={false} name="atl" />
        <Line type="monotone" dataKey="tsb" stroke="#a855f7" strokeWidth={1.5} dot={false} name="tsb" />
        <Bar dataKey="tss" fill="#22c55e30" stroke="#22c55e60" strokeWidth={1} name="tss" barSize={4} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Weekly volume bar chart ───────────────────────────────────────────────────

export function WeeklyVolumeChart({ data, metric = 'distance_km' }: {
  data: Array<{ week: string; distance_km: number; duration_h: number; tss: number; elevation_m: number }>
  metric?: 'distance_km' | 'duration_h' | 'tss' | 'elevation_m'
}) {
  const colors = { distance_km: 'var(--accent)', duration_h: '#3b82f6', tss: '#f97316', elevation_m: '#a855f7' }
  const labels = { distance_km: 'Distance (km)', duration_h: 'Duration (h)', tss: 'TSS', elevation_m: 'Elevation (m)' }
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="week" {...AXIS_PROPS} tickFormatter={(d) => formatDate(d, 'short')} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v.toFixed(1), labels[metric]]} />
        <Bar dataKey={metric} fill={colors[metric]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── HR Stream chart ───────────────────────────────────────────────────────────

export function HRStreamChart({ data, zones }: {
  data: Array<{ t: number; hr: number }>
  zones?: { z1: number; z2: number; z3: number; z4: number; z5: number }
}) {
  if (!data?.length) return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No HR data</div>
  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="t" {...AXIS_PROPS} tickFormatter={(s) => formatDuration(s)} />
        <YAxis {...AXIS_PROPS} domain={['auto', 'auto']} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${Math.round(v)} bpm`, 'Heart Rate']} labelFormatter={(s) => `Time: ${formatDuration(Number(s))}`} />
        <defs>
          <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="hr" stroke="#ef4444" fill="url(#hrGrad)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Pace / Speed stream ───────────────────────────────────────────────────────

export function PaceStreamChart({ data }: { data: Array<{ t: number; pace: number }> }) {
  if (!data?.length) return null
  // Invert pace for display (lower = faster, but we want peaks to show fast)
  const inverted = data.map(d => ({ ...d, pace: d.pace }))
  return (
    <ResponsiveContainer width="100%" height={100}>
      <AreaChart data={inverted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="t" {...AXIS_PROPS} tickFormatter={(s) => formatDuration(s)} />
        <YAxis {...AXIS_PROPS} reversed tickFormatter={(v) => formatPace(v)} domain={['auto', 'auto']} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatPace(v), 'Pace']} labelFormatter={(s) => `Time: ${formatDuration(Number(s))}`} />
        <defs>
          <linearGradient id="paceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="pace" stroke="#22c55e" fill="url(#paceGrad)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Power stream ──────────────────────────────────────────────────────────────

export function PowerStreamChart({ data, ftp }: { data: Array<{ t: number; watts: number }>; ftp?: number }) {
  if (!data?.length) return null
  return (
    <ResponsiveContainer width="100%" height={100}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="t" {...AXIS_PROPS} tickFormatter={(s) => formatDuration(s)} />
        <YAxis {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${Math.round(v)} W`, 'Power']} labelFormatter={(s) => `Time: ${formatDuration(Number(s))}`} />
        {ftp && <ReferenceLine y={ftp} stroke="#f97316" strokeDasharray="4 2" label={{ value: `FTP ${ftp}W`, fill: '#f97316', fontSize: 10, position: 'right' }} />}
        <defs>
          <linearGradient id="powGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="watts" stroke="#f97316" fill="url(#powGrad)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Elevation stream ─────────────────────────────────────────────────────────

export function ElevationStreamChart({ data }: { data: Array<{ t: number; ele: number }> }) {
  if (!data?.length) return null
  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="t" {...AXIS_PROPS} tickFormatter={(s) => formatDuration(s)} />
        <YAxis {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${Math.round(v)} m`, 'Elevation']} />
        <defs>
          <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="ele" stroke="#a855f7" fill="url(#eleGrad)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Power curve (MMP) ────────────────────────────────────────────────────────

export function PowerCurveChart({ data, ftp }: { data: Array<{ duration_s: number; watts: number }>; ftp?: number }) {
  if (!data?.length) return null
  const formatted = data.map(d => ({ ...d, label: formatDuration(d.duration_s) }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={formatted} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${Math.round(v)} W`, 'MMP']} />
        {ftp && <ReferenceLine y={ftp} stroke="#f97316" strokeDasharray="4 2" />}
        <Line type="monotone" dataKey="watts" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── HRV trend ────────────────────────────────────────────────────────────────

export function HRVChart({ data }: { data: Array<{ date: string; last_night: number; weekly_avg: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={(d) => formatDate(d, 'short')} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDate(d as string, 'long')} />
        <Bar dataKey="last_night" fill="#22c55e40" stroke="#22c55e" strokeWidth={1} name="Last Night" barSize={6} />
        <Line type="monotone" dataKey="weekly_avg" stroke="#3b82f6" strokeWidth={2} dot={false} name="Weekly Avg" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Sleep breakdown chart ─────────────────────────────────────────────────────

export function SleepChart({ data }: { data: Array<{ date: string; duration_hours: number; deep_h: number; rem_h: number; light_h: number; score?: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={(d) => formatDate(d, 'short')} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} domain={[0, 10]} tickFormatter={(v) => `${v}h`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}h`]} labelFormatter={(d) => formatDate(d as string, 'long')} />
        <Bar dataKey="deep_h" stackId="a" fill="#1d4ed8" name="Deep" />
        <Bar dataKey="rem_h" stackId="a" fill="#7c3aed" name="REM" />
        <Bar dataKey="light_h" stackId="a" fill="#475569" name="Light" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Monthly summary bars ──────────────────────────────────────────────────────

export function MonthlyChart({ data }: { data: Array<{ month: number; distance_km: number; activities: number; elevation_m: number }> }) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const formatted = data.map(d => ({ ...d, name: MONTHS[d.month - 1] }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={formatted} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="name" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="distance_km" fill="var(--accent)" radius={[3, 3, 0, 0]} name="Distance (km)" />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Activity type donut ───────────────────────────────────────────────────────

import { PieChart, Pie } from 'recharts'
import { activityColor, activityLabel } from '../../utils/format'

export function ActivityTypePie({ data }: { data: Array<{ type: string; count: number }> }) {
  if (!data?.length) return null
  const pieData = data.map(d => ({ name: activityLabel(d.type), value: d.count, color: activityColor(d.type) }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ── Body battery ─────────────────────────────────────────────────────────────

export function BodyBatteryChart({ data }: { data: Array<{ date: string; highest: number; lowest: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={130}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={(d) => formatDate(d, 'short')} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} domain={[0, 100]} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDate(d as string, 'long')} />
        <Area type="monotone" dataKey="highest" fill="#22c55e20" stroke="transparent" />
        <Area type="monotone" dataKey="lowest" fill="var(--bg-card)" stroke="transparent" />
        <Line type="monotone" dataKey="highest" stroke="#22c55e" strokeWidth={1.5} dot={false} name="High" />
        <Line type="monotone" dataKey="lowest" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Low" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function PickleballStrokePowerChart({
  data,
  candidateThresholds,
}: {
  data: Record<string, Array<{ t: number; power: number }>>
  candidateThresholds?: Record<string, number | null>
}) {
  const strokeColors: Record<string, string> = {
    forehand: '#ec4899',
    backhand: '#3b82f6',
    forehand_slice: '#f97316',
    backhand_slice: '#14b8a6',
    serve: '#eab308',
  }
  const candidateColors: Record<string, string> = {
    forehand: '#eab308',
    backhand: '#22c55e',
  }

  const rows = Object.entries(data || {}).flatMap(([stroke, samples]) =>
    (samples || []).map((sample) => ({
      t: sample.t,
      watts: sample.power,
      stroke,
      strokeLabel: PICKLEBALL_STROKE_LABELS[stroke] || stroke,
      candidate: candidateThresholds?.[stroke] != null && sample.power <= (candidateThresholds[stroke] as number),
    }))
  ).sort((a, b) => a.t - b.t)

  if (!rows.length) return null

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          type="number"
          dataKey="t"
          {...LIGHT_AXIS}
          tickFormatter={(s) => formatDuration(Number(s))}
          name="Time"
        />
        <YAxis
          type="number"
          dataKey="watts"
          {...LIGHT_AXIS}
          tickFormatter={(v) => `${Math.round(Number(v))}`}
          name="Power"
        />
        <Tooltip
          cursor={{ strokeDasharray: '4 4' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          formatter={(_value: number, _name: string, item: any) => ([
            `${Math.round(item?.payload?.watts || 0)} W`,
            `${item?.payload?.strokeLabel || 'Stroke'}${item?.payload?.candidate ? ' Candidate Dink' : ''}`,
          ])}
          labelFormatter={(value) => `Time: ${formatDuration(Number(value))}`}
        />
        {Object.keys(strokeColors).map((strokeKey) => {
          const series = rows.filter(row => row.stroke === strokeKey && !row.candidate)
          if (!series.length) return null
          return (
            <Scatter
              key={strokeKey}
              name={PICKLEBALL_STROKE_LABELS[strokeKey] || strokeKey}
              data={series}
              fill={strokeColors[strokeKey]}
            />
          )
        })}
        {Object.keys(candidateColors).map((strokeKey) => {
          const series = rows.filter(row => row.stroke === strokeKey && row.candidate)
          if (!series.length) return null
          return (
            <Scatter
              key={`${strokeKey}-candidate`}
              name={`${PICKLEBALL_STROKE_LABELS[strokeKey] || strokeKey} Candidate Dink`}
              data={series}
              fill={candidateColors[strokeKey]}
            />
          )
        })}
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// ── Stress trend ─────────────────────────────────────────────────────────────

export function StressChart({ data }: { data: Array<{ date: string; avg_stress: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={110}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...AXIS_PROPS} tickFormatter={(d) => formatDate(d, 'short')} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} domain={[0, 100]} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [Math.round(v), 'Stress']} labelFormatter={(d) => formatDate(d as string, 'long')} />
        <defs>
          <linearGradient id="stressGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="avg_stress" stroke="#f97316" fill="url(#stressGrad)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
