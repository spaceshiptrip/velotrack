import { ReactNode, CSSProperties } from 'react'
import { clsx } from 'clsx'

// ── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode
  style?: CSSProperties
  className?: string
  padding?: number
  hover?: boolean
  onClick?: () => void
}

export function Card({ children, style, padding = 20, hover, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding,
        transition: hover ? 'all 0.15s' : undefined,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      onMouseEnter={hover ? (e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-dim)'
        ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'
      } : undefined}
      onMouseLeave={hover ? (e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)'
      } : undefined}
    >
      {children}
    </div>
  )
}

// ── Section header ──────────────────────────────────────────────────────────

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{title}</h2>
        {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── Stat tile ───────────────────────────────────────────────────────────────

interface StatTileProps {
  label: string
  value: string | number | null | undefined
  sub?: string
  color?: string
  icon?: ReactNode
  trend?: number  // positive = up, negative = down
  size?: 'sm' | 'md' | 'lg'
}

export function StatTile({ label, value, sub, color, icon, trend, size = 'md' }: StatTileProps) {
  const fontSize = size === 'lg' ? 28 : size === 'sm' ? 18 : 22
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: size === 'sm' ? '12px 14px' : '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
          {label}
        </span>
        {icon && <span style={{ color: color || 'var(--text-muted)' }}>{icon}</span>}
      </div>
      <div style={{ fontSize, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      {(sub || trend != null) && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
          {trend != null && (
            <span style={{ fontSize: 11, color: trend >= 0 ? 'var(--accent)' : 'var(--red)', fontWeight: 600 }}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Badge ───────────────────────────────────────────────────────────────────

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600,
      background: color ? `${color}22` : 'var(--accent-dim)',
      color: color || 'var(--accent)',
      border: `1px solid ${color ? `${color}44` : 'var(--border)'}`,
      letterSpacing: '0.02em',
    }}>
      {children}
    </span>
  )
}

// ── Pill select ─────────────────────────────────────────────────────────────

export function PillSelect<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px', background: 'var(--bg-base)', borderRadius: 8, border: '1px solid var(--border)' }}>
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)} style={{
          padding: '5px 12px', borderRadius: 5, border: 'none',
          background: value === opt.value ? 'var(--accent)' : 'transparent',
          color: value === opt.value ? '#000' : 'var(--text-secondary)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          letterSpacing: '0.02em',
        }}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Page header ─────────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={{
      padding: '24px 28px 0',
      marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', fontFamily: 'var(--font-display)' }}>
            {title}
          </h1>
          {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  )
}

// ── Loading spinner ─────────────────────────────────────────────────────────

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid var(--border)`,
      borderTopColor: 'var(--accent)',
      animation: 'spin 0.8s linear infinite',
    }} />
  )
}

// ── Empty state ─────────────────────────────────────────────────────────────

export function EmptyState({ icon, message, action }: { icon: string; message: string; action?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, marginBottom: action ? 16 : 0 }}>{message}</div>
      {action}
    </div>
  )
}

// ── Progress bar ────────────────────────────────────────────────────────────

export function ProgressBar({ value, max, color, height = 6, label }: {
  value: number; max: number; color?: string; height?: number; label?: string
}) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div>
      {label && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>}
      <div style={{ height, background: 'var(--bg-elevated)', borderRadius: height, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: color || 'var(--accent)',
          borderRadius: height,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// ── Divider ─────────────────────────────────────────────────────────────────

export function Divider({ margin = 16 }: { margin?: number }) {
  return <div style={{ height: 1, background: 'var(--border)', margin: `${margin}px 0` }} />
}

// ── HR Zone bar ─────────────────────────────────────────────────────────────

const ZONE_COLORS = ['#64748b', '#22c55e', '#eab308', '#f97316', '#ef4444']
const ZONE_LABELS = ['Z1 Recovery', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO₂max']

export function HRZoneBar({ zones }: { zones: { z1: number; z2: number; z3: number; z4: number; z5: number } }) {
  const total = Object.values(zones).reduce((a, b) => a + b, 0)
  if (total === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No HR zone data</div>
  const vals = [zones.z1, zones.z2, zones.z3, zones.z4, zones.z5]

  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1 }}>
        {vals.map((v, i) => (
          <div key={i} style={{
            flex: v, background: ZONE_COLORS[i], minWidth: v > 0 ? 2 : 0,
            transition: 'flex 0.4s ease',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {vals.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: ZONE_COLORS[i] }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {ZONE_LABELS[i]}: {total > 0 ? Math.round((v / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
