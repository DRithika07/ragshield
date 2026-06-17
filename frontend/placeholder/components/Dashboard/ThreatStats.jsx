/**
 * ThreatStats.jsx — Top-row KPI metric cards
 * ════════════════════════════════════════════
 * Four animated stat cards: Total Analyzed, Malicious,
 * Safe, and Detection Rate. Each card glows in its
 * severity colour and animates its number on mount.
 */

import React, { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ShieldAlert, ShieldCheck, Activity, Percent } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import useSentinelStore from '@/store/useSentinelStore.js'

const CARDS = [
  {
    key:     'total_analyzed',
    label:   'Total Analyzed',
    icon:    Activity,
    color:   '#00f5ff',
    variant: 'cyan',
    format:  (v) => v ?? 0,
  },
  {
    key:     'total_malicious',
    label:   'Threats Detected',
    icon:    ShieldAlert,
    color:   '#ff2244',
    variant: 'red',
    format:  (v) => v ?? 0,
  },
  {
    key:     'total_safe',
    label:   'Safe Requests',
    icon:    ShieldCheck,
    color:   '#00ff88',
    variant: 'green',
    format:  (v) => v ?? 0,
  },
  {
    key:     'detection_rate',
    label:   'Detection Rate',
    icon:    Percent,
    color:   '#b347ff',
    variant: 'purple',
    format:  (v, stats) => {
      if (!stats?.total_analyzed) return '0.0%'
      return ((stats.total_malicious / stats.total_analyzed) * 100).toFixed(1) + '%'
    },
    isComputed: true,
  },
]

function AnimatedNumber({ value, color }) {
  const ref      = useRef(null)
  const frameRef = useRef(null)

  useEffect(() => {
    if (typeof value !== 'number') return
    let start     = 0
    const end     = value
    const dur     = 900
    const startTs = performance.now()

    const step = (now) => {
      const elapsed  = now - startTs
      const progress = Math.min(elapsed / dur, 1)
      const eased    = 1 - Math.pow(1 - progress, 3)   // ease-out cubic
      const current  = Math.round(start + (end - start) * eased)
      if (ref.current) ref.current.textContent = current.toLocaleString()
      if (progress < 1) frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value])

  return (
    <span
      ref={ref}
      className="font-display text-3xl font-bold tabular-nums"
      style={{ color, textShadow: `0 0 16px ${color}60` }}
    >
      0
    </span>
  )
}

export default function ThreatStats() {
  const stats = useSentinelStore((s) => s.dashboardStats)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map((card, i) => {
        const Icon     = card.icon
        const rawValue = stats?.[card.key]
        const display  = card.isComputed
          ? card.format(rawValue, stats)
          : card.format(rawValue)
        const numValue = card.isComputed ? null : (rawValue ?? 0)

        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0  }}
            transition={{ duration: 0.4, delay: i * 0.08, ease: 'easeOut' }}
          >
            <GlassCard
              variant={card.variant}
              hover
              corners
              className="relative overflow-hidden"
            >
              {/* Background glow blob */}
              <div
                className="absolute -top-4 -right-4 w-20 h-20 rounded-full blur-2xl pointer-events-none"
                style={{ background: `${card.color}18` }}
              />

              <div className="flex items-start justify-between mb-3">
                {/* Icon */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${card.color}12`,
                    border:     `1px solid ${card.color}25`,
                  }}
                >
                  <Icon size={17} style={{ color: card.color }} strokeWidth={1.6} />
                </div>

                {/* Trend indicator dot */}
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1.5 animate-neon-pulse"
                  style={{ background: card.color, boxShadow: `0 0 5px ${card.color}` }}
                />
              </div>

              {/* Metric value */}
              <div className="mb-1">
                {card.isComputed
                  ? (
                    <span
                      className="font-display text-3xl font-bold"
                      style={{ color: card.color, textShadow: `0 0 16px ${card.color}60` }}
                    >
                      {display}
                    </span>
                  )
                  : <AnimatedNumber value={numValue} color={card.color} />
                }
              </div>

              {/* Label */}
              <p className="text-[11px] font-mono text-white/40 tracking-wider uppercase">
                {card.label}
              </p>

              {/* Bottom accent line */}
              <div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg,${card.color}50,transparent)` }}
              />
            </GlassCard>
          </motion.div>
        )
      })}
    </div>
  )
}
