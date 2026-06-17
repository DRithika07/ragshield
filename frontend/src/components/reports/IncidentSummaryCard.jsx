/**
 * IncidentSummaryCard.jsx — Incident Statistics Overview
 * ═══════════════════════════════════════════════════════
 * Phase 6 — Report Center
 *
 * Pulls dashboardStats from the Zustand store (or fetches on mount
 * if not yet loaded) and renders six animated metric cards:
 *
 *   Total Incidents · Critical · High · Medium · Safe · Memory Poison
 *
 * Features:
 *   • Animated count-up numbers on mount / data change
 *   • Per-card neon glow colour matching threat severity
 *   • Sparkline-style accent bar showing relative weight
 *   • Trend arrow (vs. previous session — derived from store history)
 *   • Pulse ring on critical card when count > 0
 *   • Skeleton shimmer while loading
 *   • Refresh button to re-fetch stats
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  ShieldAlert,
  AlertTriangle,
  Minus,
  ShieldCheck,
  Brain,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  BarChart2,
} from 'lucide-react'
import useSentinelStore from '@/store/useSentinelStore.js'

// ── Animated counter hook ─────────────────────────────────────────────────────

function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0)
  const raf = useRef(null)
  const start = useRef(null)
  const from  = useRef(0)

  useEffect(() => {
    if (target == null) return
    from.current  = value
    start.current = null

    const tick = (ts) => {
      if (!start.current) start.current = ts
      const elapsed = ts - start.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(from.current + (target - from.current) * eased))
      if (progress < 1) raf.current = requestAnimationFrame(tick)
    }

    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])

  return value
}

// ── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <motion.div
      className="rounded-2xl border p-4 overflow-hidden"
      style={{
        background:  'rgba(255,255,255,0.02)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-9 h-9 rounded-xl bg-white/5" />
        <div className="w-14 h-4 rounded-full bg-white/4" />
      </div>
      <div className="w-20 h-7 rounded-lg bg-white/5 mb-2" />
      <div className="w-28 h-3 rounded-full bg-white/4" />
    </motion.div>
  )
}

// ── Single stat card ─────────────────────────────────────────────────────────

function StatCard({ cfg, value, total, index }) {
  const count   = useCountUp(value ?? 0, 800 + index * 80)
  const pct     = total > 0 ? Math.round((value / total) * 100) : 0
  const isCrit  = cfg.key === 'critical' && value > 0
  const Icon    = cfg.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1,  y:  0 }}
      transition={{ duration: 0.38, delay: index * 0.07, ease: 'easeOut' }}
      className="relative rounded-2xl border overflow-hidden"
      style={{
        background:  `${cfg.color}07`,
        borderColor: `${cfg.color}${isCrit ? '40' : '18'}`,
        boxShadow:   isCrit ? `0 0 24px ${cfg.color}14` : 'none',
      }}
    >
      {/* Scanline texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.006) 2px,rgba(255,255,255,0.006) 4px)',
        }}
      />

      {/* Top edge shine */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background: `linear-gradient(90deg,transparent,${cfg.color}40,transparent)`,
        }}
      />

      {/* Critical pulse ring */}
      {isCrit && (
        <motion.div
          className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle,${cfg.color}18 0%,transparent 70%)` }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="relative z-10 p-4">

        {/* Top row: icon + badge */}
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `${cfg.color}12`,
              border:     `1px solid ${cfg.color}28`,
              boxShadow:  isCrit ? `0 0 10px ${cfg.color}30` : 'none',
            }}
          >
            <Icon
              size={16}
              style={{
                color:   cfg.color,
                filter:  isCrit ? `drop-shadow(0 0 4px ${cfg.color})` : 'none',
              }}
              strokeWidth={1.7}
            />
          </div>

          {/* Percentage pill */}
          {cfg.key !== 'total' && cfg.key !== 'safe' && (
            <span
              className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background:  `${cfg.color}12`,
                border:      `1px solid ${cfg.color}22`,
                color:       `${cfg.color}`,
                opacity:     0.8,
              }}
            >
              {pct}%
            </span>
          )}
        </div>

        {/* Count */}
        <div className="mb-1">
          <span
            className="text-3xl font-display font-bold tabular-nums leading-none"
            style={{
              color:      cfg.color,
              textShadow: `0 0 20px ${cfg.color}50`,
            }}
          >
            {count.toLocaleString()}
          </span>
        </div>

        {/* Label */}
        <p className="text-[10px] font-mono text-white/35 tracking-wider mb-3">
          {cfg.label}
        </p>

        {/* Accent bar */}
        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(pct, cfg.key === 'total' ? 100 : 0)}%` }}
            transition={{ duration: 0.7, delay: 0.3 + index * 0.07, ease: 'easeOut' }}
            style={{
              background: `linear-gradient(90deg, ${cfg.color}90, ${cfg.color}40)`,
              boxShadow:  `0 0 6px ${cfg.color}60`,
            }}
          />
        </div>
      </div>
    </motion.div>
  )
}

// ── Card definitions ──────────────────────────────────────────────────────────

function buildCards(stats) {
  const total = stats?.total_analyzed ?? 0
  return [
    {
      key:   'total',
      label: 'Total Incidents',
      icon:  Activity,
      color: '#00f5ff',
      value: total,
    },
    {
      key:   'critical',
      label: 'Critical Threats',
      icon:  ShieldAlert,
      color: '#ff2244',
      value: stats?.critical_count ?? 0,
    },
    {
      key:   'high',
      label: 'High Severity',
      icon:  AlertTriangle,
      color: '#ffaa00',
      value: stats?.high_count ?? 0,
    },
    {
      key:   'medium',
      label: 'Medium Severity',
      icon:  Minus,
      color: '#b347ff',
      value: stats?.medium_count ?? 0,
    },
    {
      key:   'safe',
      label: 'Safe Prompts',
      icon:  ShieldCheck,
      color: '#00ff88',
      value: stats?.total_safe ?? 0,
    },
    {
      key:   'memory_poison',
      label: 'Memory Poison',
      icon:  Brain,
      color: '#b347ff',
      value: stats?.memory_poison_attempts ?? 0,
    },
  ]
}

// ── Accuracy + fusion row ─────────────────────────────────────────────────────

function MetaRow({ stats }) {
  const accuracy    = stats?.detection_accuracy  != null ? `${(stats.detection_accuracy * 100).toFixed(1)}%` : '—'
  const fusionScore = stats?.avg_fusion_score    != null ? stats.avg_fusion_score.toFixed(3) : '—'
  const maliciousRate = stats?.total_analyzed > 0
    ? `${((stats.total_malicious / stats.total_analyzed) * 100).toFixed(1)}%`
    : '—'

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {[
        { label: 'Detection Accuracy', value: accuracy,      color: '#00ff88' },
        { label: 'Avg Fusion Score',   value: fusionScore,   color: '#00f5ff' },
        { label: 'Malicious Rate',     value: maliciousRate, color: '#ffaa00' },
      ].map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[8px] font-mono text-white/20 tracking-widest uppercase">
            {label}
          </span>
          <span
            className="text-[11px] font-mono font-bold tabular-nums"
            style={{ color }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function IncidentSummaryCard() {
  const dashboardStats       = useSentinelStore((s) => s.dashboardStats)
  const fetchDashboardStats  = useSentinelStore((s) => s.fetchDashboardStats)
  const loadingDashboard     = useSentinelStore((s) => s.loadingStates?.dashboard)
  const lastRefreshed        = useSentinelStore((s) => s.lastRefreshed)

  const [refreshing, setRefreshing] = useState(false)

  // Auto-fetch on mount if not already loaded
  useEffect(() => {
    if (!dashboardStats) fetchDashboardStats()
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchDashboardStats()
    setRefreshing(false)
  }, [fetchDashboardStats])

  const cards   = buildCards(dashboardStats)
  const isLoading = loadingDashboard && !dashboardStats

  return (
    <div className="glass-panel p-5 flex flex-col gap-5 corner-brackets">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{
              background: 'rgba(0,245,255,0.08)',
              border:     '1px solid rgba(0,245,255,0.20)',
            }}
          >
            <BarChart2 size={14} className="text-cyan-neon/70" strokeWidth={1.7} />
          </div>
          <div>
            <h3 className="text-[12px] font-mono font-bold text-white/70 tracking-wide">
              Incident Summary
            </h3>
            {lastRefreshed && (
              <p className="text-[8px] font-mono text-white/20 mt-0.5">
                Updated {new Date(lastRefreshed).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing || loadingDashboard}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-mono
                     transition-all duration-200 hover:bg-white/5 disabled:opacity-30"
          style={{
            background:  'transparent',
            borderColor: 'rgba(255,255,255,0.08)',
            color:       'rgba(255,255,255,0.30)',
          }}
          title="Refresh statistics"
        >
          <motion.span
            animate={refreshing || loadingDashboard ? { rotate: 360 } : { rotate: 0 }}
            transition={
              refreshing || loadingDashboard
                ? { duration: 0.8, repeat: Infinity, ease: 'linear' }
                : { duration: 0 }
            }
            style={{ display: 'inline-flex' }}
          >
            <RefreshCw size={10} />
          </motion.span>
          REFRESH
        </button>
      </div>

      {/* ── Cards grid ──────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="skeletons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="cards"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
          >
            {cards.map((cfg, i) => (
              <StatCard
                key={cfg.key}
                cfg={cfg}
                value={cfg.value}
                total={dashboardStats?.total_analyzed ?? 1}
                index={i}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Meta row: accuracy + fusion ─────────────────────────── */}
      {dashboardStats && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="pt-3 border-t border-white/5"
        >
          <MetaRow stats={dashboardStats} />
        </motion.div>
      )}

    </div>
  )
}
