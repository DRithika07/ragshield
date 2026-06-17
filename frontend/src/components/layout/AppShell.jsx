/**
 * AppShell.jsx — Main application wrapper
 * ════════════════════════════════════════
 * Composes Sidebar + TopNavbar + ContentContainer
 * into the full SOC shell.
 *
 * Responsibilities:
 *   - Renders the persistent chrome (sidebar, navbar)
 *   - Hosts the <Outlet /> for nested routes
 *   - Manages app-level loading state on initial boot
 *   - Mounts the NotificationCenter portal
 *   - Handles the animated route transitions via AnimatePresence
 *
 * This component is used by MainLayout.jsx and should
 * not contain any page-specific logic.
 */

import React, { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'

import Sidebar              from '@/components/shared/Sidebar.jsx'
import TopNavbar            from '@/components/shared/TopNavbar.jsx'
import LoadingScreen        from '@/components/shared/LoadingScreen.jsx'
import NotificationCenter   from './NotificationCenter.jsx'
import ContentContainer     from './ContentContainer.jsx'
import useSentinelStore     from '@/store/useSentinelStore.js'

// Boot sequence duration (ms) — shows LoadingScreen on first visit
const BOOT_DURATION = 2200

export default function AppShell() {
  const location  = useLocation()
  const [booting, setBooting] = useState(true)

  // Global store bootstrap
  const fetchStats    = useSentinelStore((s) => s.fetchDashboardStats)
  const fetchTimeline = useSentinelStore((s) => s.fetchTimeline)
  const fetchLogs     = useSentinelStore((s) => s.fetchLogs)
  const fetchReports  = useSentinelStore((s) => s.fetchReports)

  useEffect(() => {
    // Show boot screen briefly, then load initial data in parallel
    const timer = setTimeout(async () => {
      setBooting(false)
      // Fire all initial data fetches concurrently after boot
      await Promise.allSettled([
        fetchStats(),
        fetchTimeline(24),
        fetchLogs({ page: 1, page_size: 20 }),
        fetchReports(),
      ])
    }, BOOT_DURATION)

    return () => clearTimeout(timer)
  }, [])

  // ── Boot loading screen ────────────────────────────────────────
  if (booting) return <LoadingScreen />

  // ── Main shell ─────────────────────────────────────────────────
  return (
    <>
      {/*
        NotificationCenter renders via portal to document.body,
        sitting above all z-index layers.
      */}
      <NotificationCenter />

      {/* Full-screen flex layout */}
      <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">

        {/* ── Left: persistent sidebar ────────────────────────── */}
        <Sidebar />

        {/* ── Right: top nav + scrollable page content ────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Top navigation bar */}
          <TopNavbar />

          {/*
            AnimatePresence with mode="wait":
              The outgoing page completes its exit animation
              before the incoming page starts its entrance.
            key={location.pathname} triggers re-animation on route change.
          */}
          <AnimatePresence mode="wait" initial={false}>
            <ContentContainer key={location.pathname}>
              <Outlet />
            </ContentContainer>
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}
