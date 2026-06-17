/**
 * TopNavbar.jsx — SOC top navigation bar
 * ════════════════════════════════════════
 * Features:
 *   - Live clock (updates every second)
 *   - Real-time threat counter from Zustand store
 *   - System status indicators (API, ML, ChromaDB)
 *   - Current page breadcrumb
 *   - Refresh dashboard button
 *   - Alert toast display
 */

import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, Bell, AlertTriangle,
  CheckCircle, XCircle, X, Wifi,
} from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import useSentinelStore from '@/store/useSentinelStore.js'
import NeonButton from './NeonButton.jsx'

// ── Route → display name map ───────────────────────────────────────
const ROUTE_LABELS = {
  '/dashboard':       { label: 'Live Dashboard',    sub: 'Real-time threat monitoring' },
  '/threat-analysis': { label: 'Threat Analysis',   sub: 'Prompt injection detection'  },
  '/agents':          { label: 'Agent Workflow',     sub: 'Multi-agent pipeline'        },
  '/memory-poison':   { label: 'Memory Poisoning',  sub: 'RAG security scanner'        },
  '/reports':         { label: 'Incident Reports',  sub: 'PDF report management'       },
}

export default function TopNavbar() {
  const location       = useLocation()
  const [time, setTime]= useState(new Date())

  const dashboardStats  = useSentinelStore((s) => s.dashboardStats)
  const activeAlert     = useSentinelStore((s) => s.activeAlert)
  const clearAlert      = useSentinelStore((s) => s.clearAlert)
  const fetchDashboard  = useSentinelStore((s) => s.fetchDashboardStats)
  const fetchTimeline   = useSentinelStore((s) => s.fetchTimeline)
  const isLoading       = useSentinelStore((s) => s.isLoading('dashboard'))

  const route = ROUTE_LABELS[location.pathname] ?? { label: 'Sentinel-RAG', sub: 'AI Security Platform' }

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-fetch dashboard data on mount
  useEffect(() => {
    fetchDashboard()
    fetchTimeline(24)
  }, [])

  const handleRefresh = () => {
    fetchDashboard()
    fetchTimeline(24)
  }

  const critical = dashboardStats?.critical_count ?? 0
  const total    = dashboardStats?.total_analyzed ?? 0

  return (
    <>
      <header className="relative flex-shrink-0 h-14 flex items-center px-5 gap-4 z-30"
        style={{
          background: 'rgba(6,13,26,0.95)',
          borderBottom: '1px solid rgba(0,245,255,0.08)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Top edge accent */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg,transparent,rgba(0,245,255,0.2),transparent)' }}
        />

        {/* ── Page title ─────────────────────────────────────────── */}
        <div className="flex flex-col justify-center min-w-0">
          <h1 className="text-[13px] font-semibold text-white/90 leading-none truncate">
            {route.label}
          </h1>
          <p className="text-[10px] font-mono text-white/30 mt-0.5 truncate">
            {route.sub}
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ── System status pills ────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-2">
          <StatusPill label="API"     status="online"  color="#00ff88" />
          <StatusPill label="ML"      status="active"  color="#b347ff" />
          <StatusPill label="VDB"     status="ready"   color="#00f5ff" />
        </div>

        {/* ── Threat counter ─────────────────────────────────────── */}
        {total > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={clsx(
              'hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono',
              critical > 0
                ? 'border-red-neon/30 bg-red-neon/8 text-red-neon'
                : 'border-cyan-neon/20 bg-cyan-neon/5 text-cyan-neon/70'
            )}
          >
            {critical > 0
              ? <AlertTriangle size={11} className="animate-neon-pulse-fast" />
              : <Wifi size={11} />
            }
            <span className="text-[11px]">
              {critical > 0 ? `${critical} CRITICAL` : `${total} scanned`}
            </span>
          </motion.div>
        )}

        {/* ── Live clock ─────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col items-end">
          <span className="text-[13px] font-mono text-cyan-neon/80 tabular-nums leading-none"
            style={{ textShadow: '0 0 8px rgba(0,245,255,0.3)' }}>
            {format(time, 'HH:mm:ss')}
          </span>
          <span className="text-[9px] font-mono text-white/25 mt-0.5">
            {format(time, 'dd MMM yyyy')} UTC
          </span>
        </div>

        {/* ── Refresh button ─────────────────────────────────────── */}
        <NeonButton
          variant="ghost"
          size="xs"
          icon={RefreshCw}
          onClick={handleRefresh}
          loading={isLoading}
          className={clsx(isLoading && 'animate-spin')}
          title="Refresh dashboard"
        />

        {/* ── Notification bell ──────────────────────────────────── */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          className="relative w-8 h-8 rounded-lg flex items-center justify-center
            text-white/30 hover:text-cyan-neon/60 hover:bg-cyan-neon/5
            border border-transparent hover:border-cyan-neon/10
            transition-all duration-200"
        >
          <Bell size={14} />
          {critical > 0 && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-neon animate-neon-pulse-fast" />
          )}
        </motion.button>
      </header>

      {/* ── Alert Toast ─────────────────────────────────────────── */}
      <AnimatePresence>
        {activeAlert && (
          <AlertToast alert={activeAlert} onClose={clearAlert} />
        )}
      </AnimatePresence>
    </>
  )
}

// ── Status pill ────────────────────────────────────────────────────
function StatusPill({ label, status, color }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/6 bg-white/3">
      <span className="w-1.5 h-1.5 rounded-full animate-neon-pulse"
        style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
      <span className="text-[10px] font-mono text-white/40">{label}</span>
    </div>
  )
}

// ── Alert Toast ────────────────────────────────────────────────────
function AlertToast({ alert, onClose }) {
  const configs = {
    threat: { icon: AlertTriangle, color: '#ff2244', bg: 'rgba(255,34,68,0.1)',  border: 'rgba(255,34,68,0.3)'  },
    error:  { icon: XCircle,       color: '#ff2244', bg: 'rgba(255,34,68,0.08)', border: 'rgba(255,34,68,0.2)'  },
    success:{ icon: CheckCircle,   color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.25)' },
    info:   { icon: Bell,          color: '#00f5ff', bg: 'rgba(0,245,255,0.08)', border: 'rgba(0,245,255,0.2)'  },
  }

  const cfg  = configs[alert.type] ?? configs.info
  const Icon = cfg.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, x: '-50%' }}
      animate={{ opacity: 1, y: 0,   x: '-50%' }}
      exit={{ opacity: 0, y: -10, x: '-50%' }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed top-16 left-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        backdropFilter: 'blur(16px)',
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${cfg.color}20`,
        minWidth: 280,
        maxWidth: 440,
      }}
    >
      <Icon size={15} style={{ color: cfg.color, flexShrink: 0 }} />
      <p className="text-[12px] font-mono text-white/80 flex-1 leading-snug">
        {alert.message}
      </p>
      <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0">
        <X size={13} />
      </button>
    </motion.div>
  )
}
