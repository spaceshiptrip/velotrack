import axios from 'axios'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store'

export function getToken(): string {
  return localStorage.getItem('velotrack_token') || ''
}

export function createApi(apiUrl: string) {
  const instance = axios.create({
    baseURL: `${apiUrl}/api/v1`,
    timeout: 30000,
  })
  // Always inject latest token at request time
  instance.interceptors.request.use((config) => {
    const token = getToken()
    if (token) {
      config.headers = config.headers || {}
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  })
  return instance
}

export function useApi() {
  const apiUrl = useAppStore((s) => s.settings.apiUrl)
  return createApi(apiUrl)
}

export async function analyzeGpxLocally(content: string): Promise<any> {
  const GpxParser = (await import('gpxparser')).default
  const gpx = new GpxParser()
  gpx.parse(content)
  const track = gpx.tracks[0]
  if (!track) throw new Error('No track found in GPX')
  const points = track.points
  let totalDist = 0, elevGain = 0, elevLoss = 0
  const hrVals: number[] = []
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1], p2 = points[i]
    const R = 6371000
    const dLat = (p2.lat - p1.lat) * Math.PI / 180
    const dLon = (p2.lon - p1.lon) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(p1.lat*Math.PI/180)*Math.cos(p2.lat*Math.PI/180)*Math.sin(dLon/2)**2
    totalDist += 2 * R * Math.asin(Math.sqrt(a))
    const de = (p2.ele || 0) - (p1.ele || 0)
    if (de > 0) elevGain += de; else elevLoss += Math.abs(de)
    if ((p2 as any).hr) hrVals.push((p2 as any).hr)
  }
  const startTime = points[0]?.time
  const endTime = points[points.length - 1]?.time
  const duration = startTime && endTime
    ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000 : null
  return {
    name: track.name || 'GPX Activity', activity_type: 'other',
    start_time: startTime, duration_seconds: duration,
    distance_meters: totalDist, elevation_gain_m: elevGain, elevation_loss_m: elevLoss,
    avg_hr: hrVals.length ? hrVals.reduce((a,b)=>a+b,0)/hrVals.length : null,
    gps_track: points.map((p: any) => ({ lat: p.lat, lon: p.lon, ele: p.ele, time: p.time })),
    source: 'gpx_local',
  }
}
