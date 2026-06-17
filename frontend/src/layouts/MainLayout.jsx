/**
 * MainLayout.jsx — Top-level layout route component
 * ════════════════════════════════════════════════════
 * This is the component mounted at the root route.
 * React Router renders child routes into AppShell's <Outlet />.
 *
 * Route structure:
 *
 *   <Route element={<MainLayout />}>          ← this file
 *     <Route path="/dashboard"      element={<Dashboard />} />
 *     <Route path="/threat-analysis"element={<ThreatAnalysis />} />
 *     <Route path="/agents"         element={<AgentWorkflow />} />
 *     <Route path="/memory-poison"  element={<MemoryPoison />} />
 *     <Route path="/reports"        element={<Reports />} />
 *   </Route>
 *
 * Keeping MainLayout as a thin wrapper around AppShell
 * makes it easy to add future layout variants
 * (e.g. a FullscreenLayout for a map view, a PrintLayout
 * for reports) without touching AppShell's internals.
 */

import React from 'react'
import AppShell from '@/components/layout/AppShell.jsx'

export default function MainLayout() {
  return <AppShell />
}
