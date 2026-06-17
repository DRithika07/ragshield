/**
 * ThreatCard.jsx — Compact threat result card for lists/feeds
 * ════════════════════════════════════════════════════════════
 * Reusable card that shows a single detection result.
 * Used in RecentActivity and anywhere a compact
 * threat summary is needed.
 */

import React from 'react'
import { motion } from 'framer-motion'
import { Clock, Target, Cpu } from 'lucide-react'
import clsx from 'clsx'
import ThreatSeverityBadge, { SEVERITY_MAP } from './ThreatSeverityBadge.jsx'
import { fmtAttackType, fmtRelative, fmtTruncate } from '@/utils/formatters.js'

export default function ThreatCard({ result, index = 0, onClick, compact = false }) {
  if (!result) return null

  const data      = result.data ?? result
  const severity  = data.severity ?? 'NONE'
  const cfg       = SEVERITY_MAP[severity] ?? SEVERITY_MAP.NONE
  const isMal     = data.is_malicious || data.predicted_label === 1
  const fusionPct = Math.round((data.fusion_score ?? 0) * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0  }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: 'easeOut' }}
      onClick={onClick}
      className={clsx(
        'relative rounded-xl border overflow-hidden transition-all duration-200',
        onClick && 'cursor-pointer hover:scale-[1.01]',
        compact ? 'p-3' : 'p-4'
      )}
      style={{
        background:   `${cfg.color}06`,
        borderColor:  `${cfg.color}25`,
        boxShadow:    isMal ? `0 0 16px ${cfg.color}08` : 'none',
      }}
    >
      {/* Left severity bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5"
        style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
      />

      <div className="pl-2">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <ThreatSeverityBadge severity={severity} size="xs" />
          <div className="flex items-center gap-1 text-white/25 flex-shrink-0">
            <Clock size={9} />
            <span className="text-[9px] font-mono">{fmtRelative(data.detected_at ?? data.created_at)}</span>
          </div>
        </div>

        {/* Prompt preview */}
        <p className="text-[11px] font-mono text-white/55 leading-snug mb-2">
          {fmtTruncate(data.prompt_text, compact ? 60 : 100)}
        </p>

        {/* Bottom meta row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Target size={9} className="text-white/25" />
            <span className="text-[9px] font-mono text-white/40">
              {fmtAttackType(data.attack_type)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Cpu size={9} className="text-white/25" />
            <span className="text-[9px] font-mono" style={{ color: cfg.color }}>
              {fusionPct}%
            </span>
          </div>
          {/* Score bar */}
          <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden min-w-[40px]">
            <div
              className="h-full rounded-full"
              style={{ width: `${fusionPct}%`, background: cfg.color, boxShadow: `0 0 4px ${cfg.color}` }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
