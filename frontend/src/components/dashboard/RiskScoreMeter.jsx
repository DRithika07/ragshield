/**
 * RiskScoreMeter.jsx — Circular SVG risk gauge
 * ═════════════════════════════════════════════
 * Animated circular gauge showing the average fusion
 * threat score. Colour shifts from green → amber → red
 * as risk increases. The needle animates on data update.
 */

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import useSentinelStore from '@/store/useSentinelStore.js'

// ── Gauge geometry ─────────────────────────────────────────────────
const CX      = 90
const CY      = 90
const RADIUS  = 72
const STROKE  = 8
const CIRCUM  = 2 * Math.PI * RADIUS
// Use 75% of the circumference (270° arc) for the gauge sweep
const ARC_PCT = 0.75
const ARC_LEN = CIRCUM * ARC_PCT

function scoreToColor(score) {
  if (score < 0.35) return '#00ff88'
  if (score < 0.55) return '#00f5ff'
  if (score < 0.70) return '#ffaa00'
  if (score < 0.85) return '#ff8800'
  return '#ff2244'
}

function scoreToLabel(score) {
  if (score < 0.35) return { text: 'LOW RISK',      color: '#00ff88' }
  if (score < 0.55) return { text: 'MODERATE',      color: '#00f5ff' }
  if (score < 0.70) return { text: 'ELEVATED',      color: '#ffaa00' }
  if (score < 0.85) return { text: 'HIGH RISK',     color: '#ff8800' }
  return               { text: 'CRITICAL',          color: '#ff2244' }
}

export default function RiskScoreMeter() {
  const stats = useSentinelStore((s) => s.dashboardStats)

  const score = stats?.avg_fusion_score ?? 0
  const color = scoreToColor(score)
  const label = scoreToLabel(score)

  // How much of the arc to fill
  const filled   = ARC_LEN * score
  const unfilled = ARC_LEN - filled

  // Rotate so arc starts at bottom-left (135° offset)
  const rotation = 135

  // Severity breakdown bars
  const sevBars = useMemo(() => [
    { key: 'critical_count', label: 'Critical', color: '#ff2244', value: stats?.critical_count ?? 0 },
    { key: 'high_count',     label: 'High',     color: '#ffaa00', value: stats?.high_count     ?? 0 },
    { key: 'medium_count',   label: 'Medium',   color: '#b347ff', value: stats?.medium_count   ?? 0 },
    { key: 'low_count',      label: 'Low',      color: '#00f5ff', value: stats?.low_count      ?? 0 },
  ], [stats])

  const maxCount = Math.max(...sevBars.map((b) => b.value), 1)

  return (
    <GlassCard corners className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-cyan-neon/60" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Risk Score
          </span>
        </div>
        <span
          className="text-[9px] font-mono px-2 py-1 rounded-full border tracking-widest"
          style={{
            color:       label.color,
            borderColor: `${label.color}40`,
            background:  `${label.color}10`,
          }}
        >
          {label.text}
        </span>
      </div>

      {/* SVG Gauge */}
      <div className="flex items-center justify-center mb-4">
        <div className="relative">
          <svg width={180} height={120} viewBox="0 0 180 120">
            {/* Track arc */}
            <circle
              cx={CX} cy={CY} r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={STROKE}
              strokeDasharray={`${ARC_LEN} ${CIRCUM - ARC_LEN}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              transform={`rotate(${rotation} ${CX} ${CY})`}
            />

            {/* Filled arc */}
            <motion.circle
              cx={CX} cy={CY} r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              transform={`rotate(${rotation} ${CX} ${CY})`}
              initial={{ strokeDasharray: `0 ${CIRCUM}` }}
              animate={{ strokeDasharray: `${filled} ${CIRCUM - filled}` }}
              transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 }}
              style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
            />

            {/* Center score */}
            <text
              x={CX} y={CY - 8}
              textAnchor="middle"
              fill={color}
              fontSize={26}
              fontFamily="Orbitron, sans-serif"
              fontWeight={700}
              style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
            >
              {Math.round(score * 100)}
            </text>
            <text
              x={CX} y={CY + 10}
              textAnchor="middle"
              fill="rgba(255,255,255,0.3)"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
              letterSpacing={2}
            >
              / 100
            </text>

            {/* Arc end labels */}
            <text x={18} y={114} fill="rgba(255,255,255,0.2)" fontSize={8} fontFamily="monospace">0</text>
            <text x={148} y={114} fill="rgba(255,255,255,0.2)" fontSize={8} fontFamily="monospace">100</text>
          </svg>

          {/* Glow underneath gauge */}
          <div
            className="absolute inset-0 rounded-full blur-3xl -z-10 opacity-20"
            style={{ background: color }}
          />
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="space-y-2 flex-1">
        <p className="text-[9px] font-mono text-white/25 tracking-[0.2em] uppercase mb-3">
          Severity Distribution
        </p>
        {sevBars.map((bar) => (
          <div key={bar.key} className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/35 w-14 flex-shrink-0">{bar.label}</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(bar.value / maxCount) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
                style={{
                  background:  bar.color,
                  boxShadow:   `0 0 4px ${bar.color}80`,
                }}
              />
            </div>
            <span
              className="text-[10px] font-mono w-6 text-right flex-shrink-0"
              style={{ color: bar.color }}
            >
              {bar.value}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
