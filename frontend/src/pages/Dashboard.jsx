/**
 * Dashboard.jsx — Main SOC Dashboard page
 * ═════════════════════════════════════════
 * Grid layout:
 *
 *  Row 1: [KPI ×4                              ]  ThreatStats
 *  Row 2: [ThreatMonitor (wide)] [RiskMeter   ]
 *  Row 3: [AgentGrid      ] [RecentActivity   ]
 *  Row 4: [LiveThreatFeed ] [AttackBreakdown  ]
 */

import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { LayoutDashboard, RefreshCw } from 'lucide-react'

import AnimatedPanel           from '@/components/shared/AnimatedPanel.jsx'
import NeonButton              from '@/components/shared/NeonButton.jsx'
import PageHeader          from '@/components/layout/PageHeader.jsx'
import ThreatStats             from '@/components/dashboard/ThreatStats.jsx'
import ThreatMonitor           from '@/components/dashboard/ThreatMonitor.jsx'
import RiskScoreMeter          from '@/components/dashboard/RiskScoreMeter.jsx'
import AgentStatusGrid         from '@/components/dashboard/AgentStatusGrid.jsx'
import RecentActivity          from '@/components/dashboard/RecentActivity.jsx'
import LiveThreatFeed          from '@/components/dashboard/LiveThreatFeed.jsx'
import ThreatTypeBreakdown     from '@/components/dashboard/ThreatTypeBreakdown.jsx'
import useSentinelStore        from '@/store/useSentinelStore.js'

export default function Dashboard() {
  const fetchStats    = useSentinelStore((s) => s.fetchDashboardStats)
  const fetchTimeline = useSentinelStore((s) => s.fetchTimeline)
  const fetchLogs     = useSentinelStore((s) => s.fetchLogs)
  const isLoading     = useSentinelStore((s) => s.isLoading('dashboard'))
  const stats         = useSentinelStore((s) => s.dashboardStats)
  const lastRefreshed = useSentinelStore((s) => s.lastRefreshed)

  // Refresh all data every 90 seconds
  useEffect(() => {
    // immediately fetch data on mount
    
    fetchStats()
    fetchTimeline(24)
    fetchLogs({ page: 1, page_size: 50 })
  
    //then poll every 90 seconds
    const id = setInterval(() => {
      fetchStats()
      fetchTimeline(24)
      fetchLogs({ page: 1, page_size: 50 })
    }, 90_000)
    return () => clearInterval(id)
  }, [])

  const handleRefresh = () => {
    fetchStats()
    fetchTimeline(24)
    fetchLogs({ page: 1, page_size: 50 })
  }

  const critical = stats?.critical_count ?? 0

  return (
    <AnimatedPanel variant="page" className="min-h-full">

      {/* ── Page header ─────────────────────────────────────────── */}
      <PageHeader
        title="Security Operations Center"
        subtitle={`Last refreshed: ${lastRefreshed ? lastRefreshed.toLocaleTimeString() : 'Loading…'}`}
        icon={LayoutDashboard}
        iconColor="#00f5ff"
        badge={critical > 0
          ? { label: `${critical} Critical`, variant: 'critical' }
          : { label: 'Monitoring',           variant: 'live'     }
        }
        actions={
          <NeonButton
            variant="cyan"
            size="sm"
            icon={RefreshCw}
            onClick={handleRefresh}
            loading={isLoading}
          >
            Refresh
          </NeonButton>
        }
      />

      {/* ── Layout grid ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-5">

        {/* Row 1 — KPI cards */}
        <ThreatStats />

        {/* Row 2 — Timeline + Risk meter */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            style={{ minHeight: 260 }}
          >
            <ThreatMonitor />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.22 }}
            style={{ minHeight: 260 }}
          >
            <RiskScoreMeter />
          </motion.div>
        </div>

        {/* Row 3 — Agent grid + Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.28 }}
            style={{ minHeight: 280 }}
          >
            <AgentStatusGrid />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.33 }}
            style={{ minHeight: 280 }}
          >
            <RecentActivity />
          </motion.div>
        </div>

        {/* Row 4 — Live feed + Attack breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.38 }}
            style={{ minHeight: 260 }}
          >
            <LiveThreatFeed />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.43 }}
            style={{ minHeight: 260 }}
          >
            <ThreatTypeBreakdown />
          </motion.div>
        </div>

      </div>
    </AnimatedPanel>
  )
}
