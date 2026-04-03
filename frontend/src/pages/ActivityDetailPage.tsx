import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../hooks/useApi'
import { ArrowLeft, Map, BarChart2, List, Trophy, Zap } from 'lucide-react'
import { useAppStore, useUnits } from '../store'
import { Card, PageHeader, SectionHeader, StatTile, Badge, Spinner, HRZoneBar, PillSelect, Divider, EmptyState } from '../components/ui'
import { HRStreamChart, PaceStreamChart, PowerStreamChart, ElevationStreamChart, PowerCurveChart } from '../components/charts'
import { ActivityMap } from '../components/map'
import { formatDuration, formatDate, formatPace, formatWatts, activityIcon, activityLabel, activityColor, hrZoneColor, hrZoneName } from '../utils/format'

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { settings } = useAppStore()
  const { distance, elevation, speed, pace } = useUnits()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'overview' | 'map' | 'streams' | 'laps' | 'efforts'>('overview')

  const api = useApi()

  const { data: act, isLoading } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => api.get(`/activities/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: streams } = useQuery({
    queryKey: ['streams', id],
    queryFn: () => api.get(`/activities/${id}/streams`).then(r => r.data),
    enabled: !!id && (tab === 'streams' || tab === 'map'),
  })

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Spinner size={32} />
    </div>
  )

  if (!act) return (
    <div style={{ padding: 28 }}>
      <EmptyState icon="🔍" message="Activity not found" action={
        <button onClick={() => navigate('/activities')} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#000', fontWeight: 600, cursor: 'pointer' }}>
          Back to Activities
        </button>
      } />
    </div>
  )

  const typeColor = activityColor(act.activity_type)
  const zones = {
    z1: act.hr_zone_1_seconds || 0,
    z2: act.hr_zone_2_seconds || 0,
    z3: act.hr_zone_3_seconds || 0,
    z4: act.hr_zone_4_seconds || 0,
    z5: act.hr_zone_5_seconds || 0,
  }

  return (
    <div style={{ padding: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <button onClick={() => navigate('/activities')} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 24 }}>{activityIcon(act.activity_type)}</span>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {act.name}
            </h1>
            <Badge color={typeColor}>{activityLabel(act.activity_type)}</Badge>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {formatDate(act.start_time, 'datetime')} · {act.source?.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[
          { id: 'overview', label: 'Overview', icon: <BarChart2 size={13} /> },
          { id: 'map', label: 'Map', icon: <Map size={13} /> },
          { id: 'streams', label: 'Charts', icon: <Zap size={13} /> },
          { id: 'laps', label: 'Laps', icon: <List size={13} /> },
          { id: 'efforts', label: 'Best Efforts', icon: <Trophy size={13} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 14px', borderRadius: 7, border: '1px solid',
            borderColor: tab === t.id ? typeColor : 'var(--border)',
            background: tab === t.id ? `${typeColor}15` : 'transparent',
            color: tab === t.id ? typeColor : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Key metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatTile label="Distance" value={act.distance_meters ? distance(act.distance_meters) : '—'} />
            <StatTile label="Duration" value={formatDuration(act.duration_seconds)} />
            <StatTile label="Elevation" value={act.elevation_gain_m ? elevation(act.elevation_gain_m) : '—'} color="#a855f7" />
            <StatTile label="Calories" value={act.calories ? `${Math.round(act.calories)} kcal` : '—'} color="#f97316" />
          </div>

          {/* Pace / Speed / HR */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatTile label="Avg Pace" value={act.avg_pace_per_km ? pace(act.avg_pace_per_km) : speed(act.avg_speed_ms)} />
            <StatTile label="Avg HR" value={act.avg_hr ? `${Math.round(act.avg_hr)} bpm` : '—'} color="#ef4444" />
            <StatTile label="Max HR" value={act.max_hr ? `${Math.round(act.max_hr)} bpm` : '—'} color="#ef4444" />
            <StatTile label="Avg Cadence" value={act.avg_cadence ? `${Math.round(act.avg_cadence)} rpm` : '—'} />
          </div>

          {/* Power (if available) */}
          {(act.avg_power_watts || act.normalized_power_watts) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <StatTile label="Avg Power" value={formatWatts(act.avg_power_watts)} color="#f97316" />
              <StatTile label="NP (Normalized)" value={formatWatts(act.normalized_power_watts)} color="#f97316" />
              <StatTile label="Intensity Factor" value={act.intensity_factor?.toFixed(3) ?? '—'} />
              <StatTile label="TSS" value={act.tss?.toFixed(0) ?? '—'} color="#f97316" sub="Training Stress Score" />
            </div>
          )}

          {/* Analytics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatTile label="TRIMP" value={act.trimp?.toFixed(0) ?? '—'} sub="Training load score" />
            <StatTile label="Efficiency Factor" value={act.efficiency_factor?.toFixed(3) ?? '—'} />
            <StatTile label="Aerobic Decoupling" value={act.aerobic_decoupling != null ? `${act.aerobic_decoupling.toFixed(1)}%` : '—'} sub="< 5% = aerobic" color={act.aerobic_decoupling > 5 ? '#f97316' : 'var(--accent)'} />
            <StatTile label="Training Effect" value={act.aerobic_training_effect?.toFixed(1) ?? '—'} sub={`Anaerobic: ${act.anaerobic_training_effect?.toFixed(1) ?? '—'}`} color="var(--accent)" />
          </div>

          {/* Running dynamics */}
          {(act.avg_stride_length_m || act.avg_ground_contact_ms || act.avg_vertical_oscillation_cm) && (
            <Card>
              <SectionHeader title="Running Dynamics" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                <StatTile size="sm" label="Stride Length" value={act.avg_stride_length_m ? `${(act.avg_stride_length_m * 100).toFixed(0)} cm` : '—'} />
                <StatTile size="sm" label="Vert. Oscillation" value={act.avg_vertical_oscillation_cm ? `${act.avg_vertical_oscillation_cm.toFixed(1)} cm` : '—'} />
                <StatTile size="sm" label="Ground Contact" value={act.avg_ground_contact_ms ? `${Math.round(act.avg_ground_contact_ms)} ms` : '—'} />
                <StatTile size="sm" label="Vertical Ratio" value={act.avg_vertical_ratio ? `${act.avg_vertical_ratio.toFixed(1)}%` : '—'} />
                <StatTile size="sm" label="GCT Balance" value={act.avg_ground_contact_balance ? `${act.avg_ground_contact_balance.toFixed(1)}%` : '—'} />
              </div>
            </Card>
          )}

          {/* Swim metrics */}
          {(act.avg_swolf || act.avg_stroke_rate) && (
            <Card>
              <SectionHeader title="Swim Metrics" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <StatTile size="sm" label="SWOLF" value={act.avg_swolf?.toFixed(0) ?? '—'} />
                <StatTile size="sm" label="Stroke Rate" value={act.avg_stroke_rate ? `${act.avg_stroke_rate.toFixed(0)} /min` : '—'} />
                <StatTile size="sm" label="Stroke Type" value={act.stroke_type ?? '—'} />
                <StatTile size="sm" label="Pool Length" value={act.pool_length_m ? `${act.pool_length_m} m` : '—'} />
              </div>
            </Card>
          )}

          {/* HR zones */}
          <Card>
            <SectionHeader title="Heart Rate Zones" />
            <HRZoneBar zones={zones} />
          </Card>

          {/* Power curve (if available) */}
          {act.power_curve?.length > 0 && (
            <Card>
              <SectionHeader title="Power Curve (Mean Maximal Power)" />
              <PowerCurveChart data={act.power_curve} ftp={settings.ftpWatts} />
            </Card>
          )}
        </div>
      )}

      {/* Map tab */}
      {tab === 'map' && (
        <Card padding={12}>
          {act.gps_track?.length ? (
            <>
              <ActivityMap track={act.gps_track} height={520} tileUrl={settings.mapTileUrl} />
              <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>● Start</span>
                <span style={{ color: '#ef4444' }}>● End</span>
                <span>{act.gps_track.length.toLocaleString()} GPS points</span>
              </div>
            </>
          ) : (
            <EmptyState icon="🗺️" message="No GPS data for this activity" />
          )}
        </Card>
      )}

      {/* Streams tab */}
      {tab === 'streams' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {streams?.hr?.length ? (
            <Card>
              <SectionHeader title="Heart Rate" subtitle={`Avg: ${act.avg_hr?.toFixed(0)} bpm · Max: ${act.max_hr?.toFixed(0)} bpm`} />
              <HRStreamChart data={streams.hr} />
            </Card>
          ) : null}
          {streams?.pace?.length ? (
            <Card>
              <SectionHeader title="Pace" />
              <PaceStreamChart data={streams.pace} />
            </Card>
          ) : null}
          {streams?.power?.length ? (
            <Card>
              <SectionHeader title="Power" subtitle={`NP: ${formatWatts(act.normalized_power_watts)} · FTP: ${settings.ftpWatts} W`} />
              <PowerStreamChart data={streams.power} ftp={settings.ftpWatts} />
            </Card>
          ) : null}
          {streams?.elevation?.length ? (
            <Card>
              <SectionHeader title="Elevation" subtitle={`Gain: ${elevation(act.elevation_gain_m)}`} />
              <ElevationStreamChart data={streams.elevation} />
            </Card>
          ) : null}
          {!streams?.hr?.length && !streams?.pace?.length && !streams?.power?.length && (
            <EmptyState icon="📈" message="No stream data available for this activity" />
          )}
        </div>
      )}

      {/* Laps tab */}
      {tab === 'laps' && (
        <Card>
          {act.laps?.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Lap', 'Distance', 'Time', 'Pace', 'Avg HR', 'Max HR', 'Cadence', 'Power', 'Elev+'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Lap' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {act.laps.map((lap: any, i: number) => {
                    const lapPace = lap.distance_m && lap.time_s ? lap.time_s / (lap.distance_m / 1000) : null
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>{lap.lap_num || i + 1}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{lap.distance_m ? distance(lap.distance_m) : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDuration(lap.time_s)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{lapPace ? pace(lapPace) : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{lap.avg_hr ? `${Math.round(lap.avg_hr)}` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{lap.max_hr ? Math.round(lap.max_hr) : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{lap.avg_cadence ? Math.round(lap.avg_cadence) : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#f97316' }}>{lap.avg_power ? `${Math.round(lap.avg_power)} W` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#a855f7', fontFamily: 'var(--font-mono)' }}>{lap.elevation_gain ? elevation(lap.elevation_gain) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState icon="🔁" message="No lap data" />}
        </Card>
      )}

      {/* Best efforts tab */}
      {tab === 'efforts' && (
        <Card>
          {act.best_efforts?.length ? (
            <div>
              <SectionHeader title="Best Efforts" subtitle="Fastest times for standard distances in this activity" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {act.best_efforts.map((ef: any) => {
                  const d = ef.distance_m
                  const label = d >= 42195 ? 'Marathon' : d >= 21097 ? 'Half Marathon' : d >= 10000 ? '10K' : d >= 5000 ? '5K' : d >= 3218 ? '2 Mile' : d >= 1609 ? '1 Mile' : d >= 1000 ? '1K' : `${d}m`
                  return (
                    <div key={d} style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{formatDuration(ef.time_s)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{pace(ef.pace_s_per_km)} avg</div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : <EmptyState icon="🏆" message="No best efforts data (running activities with GPS only)" />}
        </Card>
      )}
    </div>
  )
}
