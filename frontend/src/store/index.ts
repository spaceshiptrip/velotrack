import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Settings {
  apiUrl: string
  serverMode: 'server' | 'local'  // 'local' = GPX-only, no backend
  units: 'metric' | 'imperial'
  userId: number
  maxHr: number
  restingHr: number
  ftpWatts: number
  lthr: number
  mapTileUrl: string
  brouterEndpoint: string
  theme: 'dark' | 'light'
}

interface AppState {
  settings: Settings
  updateSettings: (s: Partial<Settings>) => void
  isServerAvailable: boolean
  setServerAvailable: (v: boolean) => void
}

const DEFAULT_SETTINGS: Settings = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  serverMode: import.meta.env.VITE_API_URL ? 'server' : 'local',
  units: 'metric',
  userId: 1,
  maxHr: 185,
  restingHr: 52,
  ftpWatts: 250,
  lthr: 158,
  mapTileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  brouterEndpoint: import.meta.env.VITE_BROUTER_ENDPOINT || 'http://localhost:17777',
  theme: 'dark',
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      updateSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),
      isServerAvailable: true,
      setServerAvailable: (v) => set({ isServerAvailable: v }),
    }),
    {
      name: 'velotrack-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
)

// ─── Unit helpers ─────────────────────────────────────────────────────────────

export function useUnits() {
  const units = useAppStore((s) => s.settings.units)

  return {
    units,
    distance: (meters: number | null | undefined) => {
      if (meters == null) return '—'
      if (units === 'imperial') return `${(meters / 1609.34).toFixed(2)} mi`
      if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
      return `${Math.round(meters)} m`
    },
    distanceVal: (meters: number, unit: 'km' | 'mi' = 'km') => {
      if (units === 'imperial') return meters / 1609.34
      return meters / 1000
    },
    distanceLabel: () => units === 'imperial' ? 'mi' : 'km',
    pace: (secPerKm: number | null | undefined) => {
      if (secPerKm == null) return '—'
      const s = units === 'imperial' ? secPerKm * 1.60934 : secPerKm
      const min = Math.floor(s / 60)
      const sec = Math.round(s % 60)
      const unit = units === 'imperial' ? '/mi' : '/km'
      return `${min}:${sec.toString().padStart(2, '0')}${unit}`
    },
    speed: (ms: number | null | undefined) => {
      if (ms == null) return '—'
      if (units === 'imperial') return `${(ms * 2.23694).toFixed(1)} mph`
      return `${(ms * 3.6).toFixed(1)} km/h`
    },
    elevation: (m: number | null | undefined) => {
      if (m == null) return '—'
      if (units === 'imperial') return `${Math.round(m * 3.28084)} ft`
      return `${Math.round(m)} m`
    },
    weight: (kg: number | null | undefined) => {
      if (kg == null) return '—'
      if (units === 'imperial') return `${(kg * 2.20462).toFixed(1)} lb`
      return `${kg.toFixed(1)} kg`
    },
    temperature: (c: number | null | undefined) => {
      if (c == null) return '—'
      if (units === 'imperial') return `${Math.round(c * 9/5 + 32)}°F`
      return `${Math.round(c)}°C`
    },
  }
}
