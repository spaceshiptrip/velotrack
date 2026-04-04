import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useUnits } from '../store'
import { Card, PageHeader, Spinner, EmptyState } from '../components/ui'
import { formatDuration, formatDate, formatPace, activityIcon, activityLabel, activityColor } from '../utils/format'

const TYPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'running', label: '🏃 Run' },
  { value: 'trail_running', label: '🏔️ Trail' },
  { value: 'cycling', label: '🚲 Bike' },
  { value: 'swimming', label: '🏊 Swim' },
  { value: 'hiking', label: '🥾 Hike' },
  { value: 'strength_training', label: '🏋️ Strength' },
  { value: 'hiit', label: '⚡ HIIT' },
  { value: 'pickleball', label: '🏓 Pickle' },
]

const PER_PAGE = 25

export default function ActivitiesPage() {
  const api = useApi()
  const qc = useQueryClient()
  const { distance, elevation, pace, speed } = useUnits()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['activities', page, typeFilter, search],
    queryFn: () => api.get('/activities', {
      params: { page, per_page: PER_PAGE, activity_type: typeFilter || undefined, search: search || undefined }
    }).then(r => r.data),
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: async (activityId: number) => {
      await api.delete(`/activities/${activityId}`)
    },
    onSuccess: async (_, activityId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['activities'] }),
        qc.invalidateQueries({ queryKey: ['activity', String(activityId)] }),
        qc.invalidateQueries({ queryKey: ['streams', String(activityId)] }),
      ])
    },
  })

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1

  function handleDelete(activityId: number, activityName: string) {
    if (deleteMutation.isPending) return
    if (!window.confirm(`Delete "${activityName}"? This cannot be undone.`)) return
    deleteMutation.mutate(activityId)
  }

  return (
    <div style={{ padding: 28 }}>
      <PageHeader title="Activities" subtitle={data ? `${data.total?.toLocaleString()} total` : ''} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '0 0 240px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (setSearch(searchInput), setPage(1))}
            placeholder="Search…"
            style={{ width: '100%', padding: '8px 10px 8px 32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TYPE_FILTERS.map(f => (
            <button key={f.value} onClick={() => { setTypeFilter(f.value); setPage(1) }} style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid',
              borderColor: typeFilter === f.value ? 'var(--accent)' : 'var(--border)',
              background: typeFilter === f.value ? 'var(--accent-dim)' : 'transparent',
              color: typeFilter === f.value ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      <Card padding={0}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : !data?.activities?.length ? (
          <EmptyState icon="🏃" message="No activities yet — upload a GPX or sync Garmin" action={
            <button onClick={() => navigate('/upload')} style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#000', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              Import Activities
            </button>
          } />
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Activity', 'Date', 'Distance', 'Time', 'Pace', 'HR', 'Elev+', 'TSS', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Activity' ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.activities.map((act: any) => (
                  <tr key={act.id} onClick={() => navigate(`/activities/${act.id}`)}
                    style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, background: `${activityColor(act.activity_type)}20`, border: `1px solid ${activityColor(act.activity_type)}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
                          {activityIcon(act.activity_type)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activityLabel(act.activity_type)}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(act.start_time, 'long')}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{act.distance_meters ? distance(act.distance_meters) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{formatDuration(act.duration_seconds)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>{act.avg_pace_per_km ? pace(act.avg_pace_per_km) : act.avg_speed_ms ? speed(act.avg_speed_ms) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#ef4444' }}>{act.avg_hr ? `${Math.round(act.avg_hr)}` : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#a855f7' }}>{act.elevation_gain_m ? elevation(act.elevation_gain_m) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: '#f97316' }}>{act.tss ? act.tss.toFixed(0) : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(act.id, act.name)
                        }}
                        disabled={deleteMutation.isPending}
                        aria-label={`Delete ${act.name}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          border: '1px solid #ef444440',
                          background: 'transparent',
                          color: '#ef4444',
                          cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
                          opacity: deleteMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        {deleteMutation.isPending ? <Spinner size={14} /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: page===1 ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: page===1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}><ChevronLeft size={14} /></button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: page===totalPages ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: page===totalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
