import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout    from '@/layouts/MainLayout.jsx'
import LoadingScreen from '@/components/shared/LoadingScreen.jsx'

const Dashboard      = lazy(() => import('@/pages/Dashboard.jsx'))
const ThreatAnalysis = lazy(() => import('@/pages/ThreatAnalysis.jsx'))
const AgentWorkflow  = lazy(() => import('@/pages/AgentWorkflow.jsx'))
const MemoryPoison   = lazy(() => import('@/pages/MemoryPoison.jsx'))
const Reports        = lazy(() => import('@/pages/Reports.jsx'))
const AgentDemo      = lazy(() => import('@/pages/AgentDemo.jsx'))   // ← ADD THIS

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index                    element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"        element={<Dashboard />} />
          <Route path="/threat-analysis"  element={<ThreatAnalysis />} />
          <Route path="/agents"           element={<AgentWorkflow />} />
          <Route path="/memory-poison"    element={<MemoryPoison />} />
          <Route path="/reports"          element={<Reports />} />
          <Route path="/demo"             element={<AgentDemo />} />  {/* ← ADD THIS */}
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}