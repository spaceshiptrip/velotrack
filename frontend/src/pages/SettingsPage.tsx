import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { Save, CheckCircle, Wifi, WifiOff } from 'lucide-react'
import { useAppStore } from '../store'
import { Card, PageHeader, SectionHeader, Divider } from '../components/ui'
import { useApi } from '../hooks/useApi'

export default function SettingsPage() {
  const { settings, updateSettings, isServerAvailable, setServerAvailable } = useAppStore()
  const [local, setLocal] = useState({ ...settings })
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [profileResult, setProfileResult] = useState<string | null>(null)
  const api = useApi()

  const saveProfileMutation = useMutation({
    mutationFn: async () => api.put('/stats/athlete-profile', {
      ftp_watts: local.ftpWatts,
      max_hr: local.maxHr,
      resting_hr: local.restingHr,
      lthr: local.lthr,
    }).then(r => r.data),
    onSuccess: (data) => {
      setProfileResult(`Server athlete profile saved. Recomputed ${data.updated_activities} activities.`)
    },
    onError: (e: any) => {
      setProfileResult(`Server profile save failed: ${e.response?.data?.detail || e.message}`)
    },
  })

  function save() {
    updateSettings(local)
    setProfileResult(null)
    if (isServerAvailable) {
      saveProfileMutation.mutate()
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await (await import('axios')).default.get(`${local.apiUrl}/health`, { timeout: 4000 })
      setTestResult('✓ Connected — ' + (r.data?.version || 'OK'))
      setServerAvailable(true)
    } catch (e: any) {
      setTestResult('✗ ' + (e.message || 'Connection failed'))
      setServerAvailable(false)
    }
    setTesting(false)
  }

  return (
    <div style={{ padding: 28, maxWidth: 800 }}>
      <PageHeader title="Settings" subtitle="Configure your VeloTrack installation" />

      {/* Server connection */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Server Connection" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="API URL" description="Backend server URL. Leave empty for local-only GPX mode.">
            <input value={local.apiUrl} onChange={e => setLocal(s => ({ ...s, apiUrl: e.target.value }))} placeholder="http://localhost:8000" style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={testConnection} disabled={testing} style={{ ...btnStyle, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              {isServerAvailable && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)' }}><Wifi size={12} /> Connected</span>}
            </div>
            {testResult && (
              <div style={{ marginTop: 8, fontSize: 12, color: testResult.startsWith('✓') ? 'var(--accent)' : 'var(--red)', padding: '6px 10px', background: testResult.startsWith('✓') ? 'var(--accent-dim)' : '#ef444415', borderRadius: 6 }}>
                {testResult}
              </div>
            )}
          </Field>

          <Field label="Server Mode">
            <div style={{ display: 'flex', gap: 8 }}>
              {(['server', 'local'] as const).map(m => (
                <button key={m} onClick={() => setLocal(s => ({ ...s, serverMode: m }))} style={{
                  padding: '7px 16px', borderRadius: 7, border: '1px solid',
                  borderColor: local.serverMode === m ? 'var(--accent)' : 'var(--border)',
                  background: local.serverMode === m ? 'var(--accent-dim)' : 'transparent',
                  color: local.serverMode === m ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}>
                  {m === 'server' ? '🖥️ Server' : '📁 Local GPX only'}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      {/* Athlete profile */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Athlete Profile" subtitle="Used for TSS, zones, VO₂max calculations" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Max Heart Rate (bpm)">
            <input type="number" value={local.maxHr} onChange={e => setLocal(s => ({ ...s, maxHr: +e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="Resting Heart Rate (bpm)">
            <input type="number" value={local.restingHr} onChange={e => setLocal(s => ({ ...s, restingHr: +e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="FTP (watts)" description="Functional Threshold Power — cycling">
            <input type="number" value={local.ftpWatts} onChange={e => setLocal(s => ({ ...s, ftpWatts: +e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="LTHR (bpm)" description="Lactate Threshold Heart Rate">
            <input type="number" value={local.lthr} onChange={e => setLocal(s => ({ ...s, lthr: +e.target.value }))} style={inputStyle} />
          </Field>
        </div>
      </Card>

      {/* Units & Display */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Units & Display" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Measurement System">
            <div style={{ display: 'flex', gap: 8 }}>
              {(['metric', 'imperial'] as const).map(u => (
                <button key={u} onClick={() => setLocal(s => ({ ...s, units: u }))} style={{
                  padding: '7px 16px', borderRadius: 7, border: '1px solid',
                  borderColor: local.units === u ? 'var(--accent)' : 'var(--border)',
                  background: local.units === u ? 'var(--accent-dim)' : 'transparent',
                  color: local.units === u ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}>
                  {u === 'metric' ? '🌍 Metric (km, m)' : '🇺🇸 Imperial (mi, ft)'}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      {/* Map */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHeader title="Map" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Tile URL" description="XYZ tile URL. Default: OpenStreetMap">
            <input value={local.mapTileUrl} onChange={e => setLocal(s => ({ ...s, mapTileUrl: e.target.value }))} style={inputStyle} />
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' },
                { label: 'OSM Topo', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png' },
                { label: 'CartoDB Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
              ].map(({ label, url }) => (
                <button key={label} onClick={() => setLocal(s => ({ ...s, mapTileUrl: url }))} style={{ padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      {/* BRouter */}
      <Card style={{ marginBottom: 24 }}>
        <SectionHeader title="BRouter" subtitle="Route planning engine" />
        <Field label="BRouter Endpoint" description="Default: bundled Docker container on port 17777">
          <input value={local.brouterEndpoint} onChange={e => setLocal(s => ({ ...s, brouterEndpoint: e.target.value }))} placeholder="http://localhost:17777" style={inputStyle} />
        </Field>
      </Card>

      {/* Save */}
      <button onClick={save} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        {saved ? <CheckCircle size={16} /> : <Save size={16} />}
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
      {profileResult && (
        <div style={{ marginTop: 12, fontSize: 12, color: profileResult.startsWith('Server athlete profile saved') ? 'var(--accent)' : 'var(--red)' }}>
          {profileResult}
        </div>
      )}
    </div>
  )
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{label}</label>
      {description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{description}</div>}
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box' as const,
}

const btnStyle = {
  padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
}
