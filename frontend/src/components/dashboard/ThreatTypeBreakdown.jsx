/**
 * ThreatTypeBreakdown.jsx — Attack category bar chart
 * ═════════════════════════════════════════════════════
 * Horizontal bar chart showing count per attack type.
 * Data derived from logs already in the Zustand store —
 * no extra API call needed.
 */

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { BarChart2 } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import useSentinelStore from '@/store/useSentinelStore.js'
import { fmtAttackType } from '@/utils/formatters.js'

const ATTACK_COLORS = {
  jailbreak:          '#ff2244',
  prompt_injection:   '#b347ff',
  role_hijacking:     '#ffaa00',
  data_extraction:    '#00f5ff',
  indirect_injection: '#00ff88',
  unknown:            'rgba(255,255,255,0.2)',
}

export default function ThreatTypeBreakdown() {
  const logs = useSentinelStore((s) => s.logs)

  // Count malicious logs by attack type
  const counts = useMemo(() => {
    const map = {}
    logs
      .filter((l) => l.predicted_label === 1)
      .forEach((l) => {
        const key = l.attack_type || 'unknown'
        map[key]  = (map[key] || 0) + 1
      })
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [logs])

  const maxCount = Math.max(...counts.map(([, v]) => v), 1)

  return (
    <GlassCard corners className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <BarChart2 size={13} className="text-purple-neon/60" />
        <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
          Attack Breakdown
        </span>
      </div>

      {/* Bars */}
      <div className="flex-1 flex flex-col justify-around gap-3">
        {counts.length === 0 ? (
          <EmptyBars />
        ) : (
          counts.map(([type, count], i) => {
            const color = ATTACK_COLORS[type] ?? ATTACK_COLORS.unknown
            const pct   = (count / maxCount) * 100

            return (
              <div key={type} className="flex items-center gap-3">
                {/* Label */}
                <div className="w-28 flex-shrink-0">
                  <p className="text-[10px] font-mono text-white/45 truncate">
                    {fmtAttackType(type)}
                  </p>
                </div>

                {/* Bar track */}
                <div className="flex-1 h-5 bg-white/4 rounded-md overflow-hidden relative">
                  <motion.div
                    className="h-full rounded-md"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, delay: i * 0.1, ease: 'easeOut' }}
                    style={{
                      background: `linear-gradient(90deg, ${color}30, ${color}60)`,
                      boxShadow:  `inset 0 0 8px ${color}20`,
                    }}
                  />
                  {/* Glow tip */}
                  <motion.div
                    className="absolute top-0 bottom-0 w-2 rounded-r-md"
                    initial={{ left: 0 }}
                    animate={{ left: `calc(${pct}% - 4px)` }}
                    transition={{ duration: 0.7, delay: i * 0.1, ease: 'easeOut' }}
                    style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                  />
                </div>

                {/* Count */}
                <span
                  className="text-[11px] font-mono font-bold w-6 text-right flex-shrink-0"
                  style={{ color }}
                >
                  {count}
                </span>
              </div>
            )
          })
        )}
      </div>
    </GlassCard>
  )
}

function EmptyBars() {
  return (
    <div className="flex flex-col gap-3">
      {['Jailbreak','Prompt Injection','Role Hijacking','Data Extraction'].map((label, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28">
            <p className="text-[10px] font-mono text-white/15 truncate">{label}</p>
          </div>
          <motion.div
            className="flex-1 h-5 rounded-md"
            style={{ background: 'rgba(0,245,255,0.03)', border: '1px solid rgba(0,245,255,0.06)' }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, delay: i * 0.2, repeat: Infinity }}
          />
          <span className="w-6 text-right text-[11px] font-mono text-white/15">0</span>
        </div>
      ))}
    </div>
  )
}
