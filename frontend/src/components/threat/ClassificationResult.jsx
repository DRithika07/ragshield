/**
 * ClassificationResult.jsx — Full score breakdown panel
 * ═══════════════════════════════════════════════════════
 * Shows: severity badge, fusion/ML/similarity scores,
 * attack type, and predicted label with animated bars.
 * Maps directly to the DetectionResponse schema.
 */

import React from 'react'
import { motion } from 'framer-motion'
import { Cpu, GitMerge, Search, Target, Hash } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import ThreatSeverityBadge, { SEVERITY_MAP } from './ThreatSeverityBadge.jsx'
import { fmtAttackType, fmtScore } from '@/utils/formatters.js'

function ScoreRow({ icon: Icon, label, value, color, delay = 0 }) {
  const pct = Math.round(value * 100)
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1,  x:  0  }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className="flex items-center gap-3"
    >
      <div className="flex items-center gap-2 w-36 flex-shrink-0">
        <Icon size={11} style={{ color }} />
        <span className="text-[11px] font-mono text-white/40">{label}</span>
      </div>
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, delay: delay + 0.1, ease: 'easeOut' }}
          style={{
            background: `linear-gradient(90deg, ${color}80, ${color})`,
            boxShadow:  `0 0 6px ${color}60`,
          }}
        />
      </div>
      <span className="text-[12px] font-mono font-bold w-12 text-right flex-shrink-0"
        style={{ color }}>
        {fmtScore(value)}
      </span>
    </motion.div>
  )
}

function MetaChip({ icon: Icon, label, value, color }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border"
      style={{ background: `${color}08`, borderColor: `${color}20` }}
    >
      <Icon size={12} style={{ color }} />
      <div>
        <p className="text-[9px] font-mono text-white/30 leading-none mb-0.5">{label}</p>
        <p className="text-[11px] font-mono font-semibold" style={{ color }}>{value}</p>
      </div>
    </div>
  )
}

export default function ClassificationResult({ result }) {
  if (!result) return null

  const data       = result.data ?? result
  const severity   = data.severity ?? 'NONE'
  const cfg        = SEVERITY_MAP[severity] ?? SEVERITY_MAP.NONE
  const isMal      = data.is_malicious || data.predicted_label === 1
  const fusionScore= data.fusion_score    ?? 0
  const mlScore    = data.ml_score        ?? 0
  const simScore   = data.similarity_score ?? 0
  const attackType = data.attack_type     ?? 'unknown'
  const threatId   = data.threat_id       ?? '—'

  return (
    <GlassCard
      corners
      className="overflow-hidden"
      style={{
        borderColor: `${cfg.color}25`,
        boxShadow:   `0 0 24px ${cfg.color}10`,
      }}
    >
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg,${cfg.color}60,transparent)` }}
      />

      {/* Header row */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[9px] font-mono text-white/30 tracking-[0.2em] uppercase mb-2">
            Classification Result
          </p>
          <ThreatSeverityBadge severity={severity} size="lg" pulse />
        </div>

        {/* Verdict circle */}
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate:   0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
          className="w-16 h-16 rounded-full flex flex-col items-center justify-center border-2"
          style={{
            borderColor: cfg.color,
            background:  `${cfg.color}10`,
            boxShadow:   `0 0 20px ${cfg.color}25`,
          }}
        >
          <span className="text-[10px] font-display font-bold" style={{ color: cfg.color }}>
            {Math.round(fusionScore * 100)}
          </span>
          <span className="text-[7px] font-mono text-white/30">SCORE</span>
        </motion.div>
      </div>

      {/* Meta chips */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <MetaChip icon={Target}   label="Attack Type"  value={fmtAttackType(attackType)} color={cfg.color} />
        <MetaChip icon={Hash}     label="Threat ID"    value={threatId.slice(0, 8) + '…'} color="rgba(0,245,255,0.6)" />
        <MetaChip icon={Cpu}      label="Predicted"    value={isMal ? 'MALICIOUS' : 'SAFE'} color={isMal ? '#ff2244' : '#00ff88'} />
        <MetaChip icon={GitMerge} label="Label"        value={`Class ${data.predicted_label ?? 0}`} color="rgba(179,71,255,0.8)" />
      </div>

      {/* Divider */}
      <div className="h-px bg-white/5 mb-5" />

      {/* Score breakdown */}
      <div className="space-y-3.5">
        <p className="text-[9px] font-mono text-white/25 tracking-[0.2em] uppercase mb-3">
          Score Breakdown
        </p>
        <ScoreRow
          icon={GitMerge} label="Fusion Score"
          value={fusionScore} color={cfg.color}   delay={0.15}
        />
        <ScoreRow
          icon={Cpu}      label="ML Classifier"
          value={mlScore}    color="#b347ff"       delay={0.22}
        />
        <ScoreRow
          icon={Search}   label="Vec Similarity"
          value={simScore}   color="#00f5ff"       delay={0.29}
        />
      </div>
    </GlassCard>
  )
}
