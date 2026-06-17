/**
 * ThreatMonitor.jsx — Live timeline chart
 * ════════════════════════════════════════
 * Recharts AreaChart showing malicious vs safe prompts
 * over the last 24 hours, grouped by hour bucket.
 * Auto-refreshes every 60 seconds.
 */

import React, { useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { motion } from 'framer-motion'
import { Activity, RefreshCw } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import GlassCard from '@/components/shared/GlassCard.jsx'
import useSentinelStore from '@/store/useSentinelStore.js'

// ── Custom tooltip ─────────────────────────────────────────────────
function CyberTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-panel px-3 py-2.5 text-xs font-mono min-w-[140px]">
      <p className="text-white/40 mb-2 text-[10px] tracking-wide">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-4 mb-1">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-white/70 font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function ThreatMonitor() {
  const timeline    = useSentinelStore((s) => s.dashboardTimeline)
  const fetchTimeline = useSentinelStore((s) => s.fetchTimeline)
  const isLoading   = useSentinelStore((s) => s.isLoading('dashboard'))

  // Auto-refresh every 60 seconds
  useEffect(() => {
    fetchTimeline(24)
    const id = setInterval(() => fetchTimeline(24), 60_000)
    return () => clearInterval(id)
  }, [])

  // Format timeline data for Recharts
  const chartData = timeline.map((point) => ({
    time:      point.timestamp
      ? format(parseISO(point.timestamp), 'HH:mm')
      : '--',
    Malicious: point.malicious_count ?? 0,
    Safe:      point.safe_count ?? 0,
    Critical:  point.critical_count ?? 0,
  }))

  const hasDdata = chartData.length > 0

  return (
    <GlassCard corners className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-cyan-neon/60" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Live Threat Monitor
          </span>
          <span className="text-[9px] font-mono text-white/20">· 24h window</span>
        </div>

        <motion.button
          onClick={() => fetchTimeline(24)}
          whileTap={{ scale: 0.9 }}
          className="text-white/20 hover:text-cyan-neon/50 transition-colors"
          disabled={isLoading}
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </motion.button>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {!hasDdata ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradMal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#ff2244" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ff2244" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradSafe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#00ff88" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradCrit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#ff2244" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#ff2244" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(0,245,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{ fill: 'rgba(0,245,255,0.35)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'rgba(0,245,255,0.35)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CyberTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono', paddingTop: 12 }}
                iconType="circle"
                iconSize={6}
              />

              <Area
                type="monotone"
                dataKey="Safe"
                stroke="#00ff88"
                strokeWidth={1.5}
                fill="url(#gradSafe)"
              />
              <Area
                type="monotone"
                dataKey="Malicious"
                stroke="#ff2244"
                strokeWidth={1.5}
                fill="url(#gradMal)"
              />
              <Area
                type="monotone"
                dataKey="Critical"
                stroke="#ff2244"
                strokeWidth={2}
                fill="url(#gradCrit)"
                strokeDasharray="4 2"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </GlassCard>
  )
}

function EmptyChart() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <div className="flex gap-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            className="w-2.5 rounded-t-sm"
            style={{ background: 'rgba(0,245,255,0.08)', height: `${20 + Math.random() * 40}px` }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 1.5, delay: i * 0.1, repeat: Infinity }}
          />
        ))}
      </div>
      <p className="text-[11px] font-mono text-white/20 tracking-widest">
        Awaiting detection events…
      </p>
    </div>
  )
}
