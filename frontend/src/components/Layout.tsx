import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Heart, TrendingUp, Map,
  Radio, Upload, Settings, Zap, ChevronRight, RefreshCw,
  Wifi, WifiOff,
} from 'lucide-react'
import { useAppStore } from '../store'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useState } from 'react'

const NAV = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/activities', icon: Activity,         label: 'Activities' },
  { to: '/health',     icon: Heart,            label: 'Health' },
  { to: '/training',   icon: TrendingUp,       label: 'Training Load' },
  { to: '/routes',     icon: Map,              label: 'Route Planner' },
  { to: '/live',       icon: Radio,            label: 'Live Tracking' },
  { to: '/upload',     icon: Upload,           label: 'Import' },
  { to: '/settings',  icon: Settings,         label: 'Settings' },
]

export default function Layout() {
  const { settings, isServerAvailable, setServerAvailable } = useAppStore()
  const [syncing, setSyncing] = useState(false)

  // Ping server health
  useQuery({
    queryKey: ['server-health'],
    queryFn: async () => {
      try {
        await axios.get(`${settings.apiUrl}/health`, { timeout: 3000 })
        setServerAvailable(true)
        return true
      } catch {
        setServerAvailable(false)
        return false
      }
    },
    refetchInterval: 30_000,
    staleTime: 0,
  })

  async function triggerSync() {
    if (!isServerAvailable) return
    setSyncing(true)
    try {
      await axios.post(`${settings.apiUrl}/api/v1/sync/trigger`, {
        start_date: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
      })
    } catch {}
    setTimeout(() => setSyncing(false), 2000)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--accent)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={18} color="#000" fill="#000" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>VeloTrack</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Self-Hosted</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2,
              fontSize: 13, fontWeight: 500, textDecoration: 'none',
              transition: 'all 0.15s',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              background: isActive ? 'var(--accent-dim)' : 'transparent',
              border: isActive ? '1px solid var(--accent-dim)' : '1px solid transparent',
            })}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          {/* Server status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {isServerAvailable
              ? <Wifi size={12} color="var(--accent)" />
              : <WifiOff size={12} color="var(--text-muted)" />}
            <span style={{ fontSize: 11, color: isServerAvailable ? 'var(--accent)' : 'var(--text-muted)' }}>
              {isServerAvailable ? 'Server connected' : settings.serverMode === 'local' ? 'Local mode' : 'Server offline'}
            </span>
          </div>
          {/* Sync button */}
          {isServerAvailable && (
            <button onClick={triggerSync} disabled={syncing} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '7px 0', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-secondary)', fontSize: 12,
              cursor: syncing ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
            }}>
              <RefreshCw size={12} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              {syncing ? 'Syncing…' : 'Sync Garmin'}
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <Outlet />
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        ::-webkit-scrollbar { width: 6px; height: 6px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px }
      `}</style>
    </div>
  )
}
