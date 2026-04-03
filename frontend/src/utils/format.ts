// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatPace(secPerKm: number | null | undefined, unit = '/km'): string {
  if (!secPerKm) return '—'
  const min = Math.floor(secPerKm / 60)
  const sec = Math.round(secPerKm % 60)
  return `${min}:${sec.toString().padStart(2, '0')}${unit}`
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return '—'
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${Math.round(meters)} m`
}

export function formatDate(iso: string | null | undefined, format = 'short'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (format === 'short') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (format === 'long') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  if (format === 'time') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  if (format === 'datetime') return `${formatDate(iso, 'long')} ${formatDate(iso, 'time')}`
  return d.toLocaleDateString()
}

export function formatNumber(val: number | null | undefined, decimals = 0): string {
  if (val == null) return '—'
  return val.toFixed(decimals)
}

export function formatHR(bpm: number | null | undefined): string {
  if (!bpm) return '—'
  return `${Math.round(bpm)} bpm`
}

export function formatWatts(w: number | null | undefined): string {
  if (!w) return '—'
  return `${Math.round(w)} W`
}

export function formatWkg(w: number | null | undefined, kg: number | null | undefined): string {
  if (!w || !kg) return '—'
  return `${(w / kg).toFixed(2)} W/kg`
}

// ─── Activity types ───────────────────────────────────────────────────────────

export const ACTIVITY_ICONS: Record<string, string> = {
  running: '🏃',
  trail_running: '🏔️',
  cycling: '🚲',
  road_cycling: '🚲',
  mountain_biking: '🚵',
  gravel_cycling: '🚵',
  indoor_cycling: '🚴',
  swimming: '🏊',
  open_water_swimming: '🌊',
  hiking: '🥾',
  walking: '🚶',
  rowing: '🚣',
  kayaking: '🛶',
  skiing: '⛷️',
  snowboarding: '🏂',
  strength_training: '🏋️',
  crossfit: '💪',
  hiit: '⚡',
  yoga: '🧘',
  pilates: '🤸',
  pickleball: '🏓',
  tennis: '🎾',
  basketball: '🏀',
  soccer: '⚽',
  volleyball: '🏐',
  elliptical: '🔄',
  stair_climbing: '🪜',
  other: '🏅',
}

export const ACTIVITY_COLORS: Record<string, string> = {
  running: '#22c55e',
  trail_running: '#86efac',
  cycling: '#3b82f6',
  road_cycling: '#3b82f6',
  mountain_biking: '#1d4ed8',
  gravel_cycling: '#60a5fa',
  indoor_cycling: '#93c5fd',
  swimming: '#06b6d4',
  open_water_swimming: '#0891b2',
  hiking: '#f59e0b',
  walking: '#fbbf24',
  rowing: '#8b5cf6',
  strength_training: '#ef4444',
  crossfit: '#f97316',
  hiit: '#fb923c',
  pickleball: '#ec4899',
  tennis: '#a855f7',
  other: '#6b7280',
}

export function activityIcon(type: string): string {
  return ACTIVITY_ICONS[type] || '🏅'
}

export function activityColor(type: string): string {
  return ACTIVITY_COLORS[type] || '#6b7280'
}

export function activityLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── HR Zones ─────────────────────────────────────────────────────────────────

export function hrZoneColor(zone: number): string {
  return ['#64748b', '#22c55e', '#eab308', '#f97316', '#ef4444'][zone - 1] || '#6b7280'
}

export function hrZoneName(zone: number): string {
  return ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2max'][zone - 1] || `Zone ${zone}`
}

// ─── TSB status ───────────────────────────────────────────────────────────────

export function tsbStatus(tsb: number): { label: string; color: string } {
  if (tsb > 25) return { label: 'Very Fresh', color: '#22c55e' }
  if (tsb > 5) return { label: 'Fresh', color: '#86efac' }
  if (tsb > -10) return { label: 'Neutral', color: '#eab308' }
  if (tsb > -25) return { label: 'Tired', color: '#f97316' }
  return { label: 'Very Tired', color: '#ef4444' }
}

// ─── HRV status ──────────────────────────────────────────────────────────────

export function hrvStatusColor(status: string | null | undefined): string {
  if (!status) return '#6b7280'
  const s = status.toLowerCase()
  if (s.includes('balanced') || s.includes('good')) return '#22c55e'
  if (s.includes('low') || s.includes('attention')) return '#f97316'
  if (s.includes('poor')) return '#ef4444'
  return '#eab308'
}

// ─── Training readiness ───────────────────────────────────────────────────────

export function trainingReadinessColor(score: number | null | undefined): string {
  if (score == null) return '#6b7280'
  if (score >= 75) return '#22c55e'
  if (score >= 50) return '#eab308'
  if (score >= 25) return '#f97316'
  return '#ef4444'
}

// ─── Clamp / math ─────────────────────────────────────────────────────────────

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max)
}

export function round(val: number, decimals = 1): number {
  return Math.round(val * 10 ** decimals) / 10 ** decimals
}
