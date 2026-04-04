import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../hooks/useApi'
import { ArrowLeft, Map, BarChart2, List, Trophy, Zap, Trash2 } from 'lucide-react'
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
  const qc = useQueryClient()
  const [tab, setTab] = useState<'overview' | 'map' | 'streams' | 'laps' | 'efforts'>('overview')
  const [mapResolution, setMapResolution] = useState<'downsampled' | 'full'>('downsampled')
  const [showAdvancedFit, setShowAdvancedFit] = useState(false)

  const api = useApi()

  const { data: act, isLoading } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => api.get(`/activities/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: mapData, isLoading: mapLoading, isError: mapError } = useQuery({
    queryKey: ['activity-map', id, mapResolution],
    queryFn: () => api.get(`/activities/${id}/streams`, {
      params: {
        streams: 'gps',
        gps_mode: mapResolution,
      },
    }).then(r => r.data as { gps: any[]; gps_meta?: { downsampled: boolean; total_points: number; returned_points: number } }),
    enabled: !!id && tab === 'map' && !!act?.has_gps,
  })

  const { data: chartStreams, isLoading: chartStreamsLoading } = useQuery({
    queryKey: ['activity-chart-streams', id],
    queryFn: () => api.get(`/activities/${id}/streams`, {
      params: { streams: 'hr,pace,power,elevation,sport' },
    }).then(r => r.data),
    enabled: !!id && tab === 'streams',
  })

  const { data: lapsData, isLoading: lapsLoading, isError: lapsError } = useQuery({
    queryKey: ['activity-laps', id],
    queryFn: () => api.get(`/activities/${id}/laps`).then(r => r.data as any[]),
    enabled: !!id && tab === 'laps',
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/activities/${id}`)
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['activities'] }),
        qc.invalidateQueries({ queryKey: ['activity', id] }),
        qc.invalidateQueries({ queryKey: ['activity-map', id] }),
        qc.invalidateQueries({ queryKey: ['activity-chart-streams', id] }),
        qc.invalidateQueries({ queryKey: ['activity-laps', id] }),
      ])
      navigate('/activities')
    },
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
  const pickleballDetails = act.sport_details?.pickleball
  const zones = {
    z1: act.hr_zone_1_seconds || 0,
    z2: act.hr_zone_2_seconds || 0,
    z3: act.hr_zone_3_seconds || 0,
    z4: act.hr_zone_4_seconds || 0,
    z5: act.hr_zone_5_seconds || 0,
  }
  const maxHr = settings.maxHr || 190
  const lthr = settings.lthr || maxHr * 0.85
  const zoneRanges = [
    { label: 'Z1', seconds: zones.z1, color: '#64748b', range: [0, lthr * 0.81] },
    { label: 'Z2', seconds: zones.z2, color: '#22c55e', range: [lthr * 0.81, lthr * 0.89] },
    { label: 'Z3', seconds: zones.z3, color: '#eab308', range: [lthr * 0.89, lthr * 0.93] },
    { label: 'Z4', seconds: zones.z4, color: '#f97316', range: [lthr * 0.93, lthr * 1.0] },
    { label: 'Z5', seconds: zones.z5, color: '#ef4444', range: [lthr * 1.0, lthr * 1.06] },
  ]

  function handleDelete() {
    if (!id || deleteMutation.isPending) return
    if (!window.confirm(`Delete "${act.name}"? This cannot be undone.`)) return
    deleteMutation.mutate()
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
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #ef444480',
            background: 'transparent',
            color: '#ef4444',
            fontSize: 12,
            fontWeight: 600,
            cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: deleteMutation.isPending ? 0.7 : 1,
          }}
        >
          {deleteMutation.isPending ? <Spinner size={14} /> : <Trash2 size={14} />}
          {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[
          { id: 'overview', label: 'Overview', icon: <BarChart2 size={13} /> },
          { id: 'map', label: 'Map', icon: <Map size={13} /> },
          { id: 'streams', label: 'Data', icon: <Zap size={13} /> },
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

          {pickleballDetails && (
            <Card>
              <SectionHeader title="Pickleball Summary" subtitle="Stroke metrics imported from Garmin FIT data" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <StatTile label="Total Strokes" value={pickleballDetails.total_strokes ?? '—'} color="#ec4899" />
                <StatTile label="Forehands" value={pickleballDetails.stroke_stats?.forehand?.count ?? '—'} />
                <StatTile label="Backhands" value={pickleballDetails.stroke_stats?.backhand?.count ?? '—'} />
                <StatTile
                  label="Other Strokes"
                  value={
                    (pickleballDetails.stroke_stats?.forehand_slice?.count || 0) +
                    (pickleballDetails.stroke_stats?.backhand_slice?.count || 0) +
                    (pickleballDetails.stroke_stats?.serve?.count || 0) || '—'
                  }
                />
              </div>
            </Card>
          )}

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
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              {zoneRanges.map((zone) => (
                <StatTile
                  key={zone.label}
                  size="sm"
                  label={zone.label}
                  value={formatDuration(zone.seconds as number)}
                  sub={`${Math.round(zone.range[0])}-${Math.round(zone.range[1])} bpm`}
                  color={zone.color}
                />
              ))}
            </div>
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
          {mapData?.gps?.length ? (
            <>
              <ActivityMap track={mapData.gps} height={520} tileUrl={settings.mapTileUrl} />
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {mapData.gps_meta?.downsampled
                    ? `Map downsampled for speed: showing ${mapData.gps_meta.returned_points.toLocaleString()} of ${mapData.gps_meta.total_points.toLocaleString()} GPS points.`
                    : `Showing full map resolution: ${mapData.gps_meta?.returned_points?.toLocaleString() || mapData.gps.length.toLocaleString()} GPS points.`}
                </div>
                <button
                  onClick={() => setMapResolution(r => r === 'downsampled' ? 'full' : 'downsampled')}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {mapResolution === 'downsampled' ? 'Render Full Track' : 'Use Faster Map'}
                </button>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>● Start</span>
                <span style={{ color: '#ef4444' }}>● End</span>
                <span>{mapData.gps.length.toLocaleString()} rendered points</span>
              </div>
            </>
          ) : mapLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} /></div>
          ) : mapError ? (
            <EmptyState icon="🗺️" message="Map data failed to load" />
          ) : act.has_gps ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} /></div>
          ) : (
            <EmptyState icon="🗺️" message="No GPS data for this activity" />
          )}
        </Card>
      )}

      {/* Streams tab */}
      {tab === 'streams' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {chartStreamsLoading ? (
            <Card><div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} /></div></Card>
          ) : null}
          {pickleballDetails ? (
            <Card>
              <SectionHeader title="Pickleball Metrics" subtitle="Stroke counts, winners, errors, and FIT power samples" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {[
                  ['Forehand', 'forehand'],
                  ['Backhand', 'backhand'],
                  ['Forehand Slice', 'forehand_slice'],
                  ['Backhand Slice', 'backhand_slice'],
                  ['Serve', 'serve'],
                ].map(([label, key]) => {
                  const stats = pickleballDetails.stroke_stats?.[key]
                  const power = pickleballDetails.power_summary?.[key]
                  return (
                    <div key={key} style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <StatTile size="sm" label="Count" value={stats?.count ?? '—'} />
                        <StatTile size="sm" label="Winners" value={stats?.winners ?? '—'} color="#22c55e" />
                        <StatTile size="sm" label="Errors" value={stats?.errors ?? '—'} color="#ef4444" />
                        <StatTile size="sm" label="Avg Power" value={power?.avg_power ? `${Math.round(power.avg_power)} W` : '—'} color="#f97316" />
                      </div>
                      {power?.max_power ? (
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                          Max power: {Math.round(power.max_power)} W · Samples: {power.samples}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </Card>
          ) : null}
          {pickleballDetails?.advanced_fit ? (
            <Card>
              <SectionHeader
                title="Advanced FIT Data"
                subtitle="Raw Garmin vendor fields from the FIT file. These are not decoded yet."
                action={
                  <button
                    onClick={() => setShowAdvancedFit(v => !v)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {showAdvancedFit ? 'Hide Raw Fields' : 'Show Raw Fields'}
                  </button>
                }
              />
              {showAdvancedFit ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Unknown Field Summary</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {Object.entries(pickleballDetails.advanced_fit.unknown_field_summary || {}).map(([msgName, fields]: any) => (
                        <div key={msgName} style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{msgName}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {Object.entries(fields).map(([fieldName, values]: any) => (
                              <div key={fieldName} style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>
                                <span style={{ color: 'var(--text-primary)' }}>{fieldName}</span>: {values.join(', ')}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Unknown Record Samples</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(pickleballDetails.advanced_fit.unknown_record_samples || []).map((sample: any, index: number) => (
                        <div key={index} style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                            {sample.timestamp || '—'} · HR {sample.heart_rate ?? '—'} · Speed {sample.enhanced_speed ?? '—'} · Distance {sample.distance ?? '—'}
                          </div>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {JSON.stringify(sample.unknowns, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Hidden by default because these are raw vendor-specific FIT fields and may not map cleanly to named pickleball metrics.
                </div>
              )}
            </Card>
          ) : null}
          {chartStreams?.hr?.length ? (
            <Card>
              <SectionHeader title="Heart Rate" subtitle={`Avg: ${act.avg_hr?.toFixed(0)} bpm · Max: ${act.max_hr?.toFixed(0)} bpm`} />
              <HRStreamChart data={chartStreams.hr} />
            </Card>
          ) : null}
          {chartStreams?.pace?.length ? (
            <Card>
              <SectionHeader title="Pace" />
              <PaceStreamChart data={chartStreams.pace} />
            </Card>
          ) : null}
          {chartStreams?.power?.length ? (
            <Card>
              <SectionHeader title="Power" subtitle={`NP: ${formatWatts(act.normalized_power_watts)} · FTP: ${settings.ftpWatts} W`} />
              <PowerStreamChart data={chartStreams.power} ftp={settings.ftpWatts} />
            </Card>
          ) : null}
          {chartStreams?.elevation?.length ? (
            <Card>
              <SectionHeader title="Elevation" subtitle={`Gain: ${elevation(act.elevation_gain_m)}`} />
              <ElevationStreamChart data={chartStreams.elevation} />
            </Card>
          ) : null}
          {!chartStreamsLoading && !chartStreams?.hr?.length && !chartStreams?.pace?.length && !chartStreams?.power?.length && (
            <EmptyState icon="📈" message="No stream data available for this activity" />
          )}
        </div>
      )}

      {/* Laps tab */}
      {tab === 'laps' && (
        <Card>
          {lapsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} /></div>
          ) : lapsError ? (
            <EmptyState icon="🔁" message="Lap data failed to load" />
          ) : lapsData?.length ? (
            <>
            {lapsData.some((lap: any) => lap.generated) ? (
              <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--text-muted)' }}>
                Mile splits were generated from GPS track data because the source file did not include explicit lap markers.
              </div>
            ) : null}
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
                  {lapsData.map((lap: any, i: number) => {
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
            </>
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
