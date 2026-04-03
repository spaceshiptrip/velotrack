import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

// Pages
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import ActivitiesPage from './pages/ActivitiesPage'
import ActivityDetailPage from './pages/ActivityDetailPage'
import HealthPage from './pages/HealthPage'
import TrainingLoadPage from './pages/TrainingLoadPage'
import RoutePlannerPage from './pages/RoutePlannerPage'
import LiveTrackingPage from './pages/LiveTrackingPage'
import WatchLivePage from './pages/WatchLivePage'
import SettingsPage from './pages/SettingsPage'
import UploadPage from './pages/UploadPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public live-watch page (no nav) */}
          <Route path="/live/:token" element={<WatchLivePage />} />

          {/* Main app with sidebar */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="activities" element={<ActivitiesPage />} />
            <Route path="activities/:id" element={<ActivityDetailPage />} />
            <Route path="health" element={<HealthPage />} />
            <Route path="training" element={<TrainingLoadPage />} />
            <Route path="routes" element={<RoutePlannerPage />} />
            <Route path="live" element={<LiveTrackingPage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
