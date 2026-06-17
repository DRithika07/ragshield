/**
 * SimilarPromptViewer.jsx — Top-k similar threat library matches
 * ══════════════════════════════════════════════════════════════
 * Renders the top_similar array from the classification result.
 * Each entry: prompt preview, similarity %, attack type, severity.
 * Data comes directly from classification.top_similar (ChromaDB hits).
 */

import React from 'react'
import { motion } from 'framer-motion'
import { Database, TrendingUp } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import ThreatSeverityBadge from './ThreatSeverityBadge.jsx'
import { fmtAttackType, fmtTruncate } from '@/utils/formatters.js'

function SimilarEntry({ entry, index }) {
  const similarity = entry.similarity ?? (1 - (entry.distance ?? 1))
  const pct        = Math.round(similarity * 100)
  const meta       = entry.metadata ?? {}
  const label      = meta.label ?? 0
  const attackType = meta.attack_type ?? 'unknown'
  const severity   = meta.severity    ?? (label === 1 ? 'MEDIUM' : 'NONE')
  const document   = entry.document   ?? entry.content_preview ?? ''

  // Similarity bar color: high sim to malicious = red, low = cyan
  const barColor = label === 1
    ? pct > 85 ? '#ff2244' : pct > 70 ? '#ffaa00' : '#b347ff'
    : '#00ff88'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1,  y:  0 }}
      transition={{ duration: 0.28, delay: index * 0.07, ease: 'easeOut' }}
      className="rounded-xl border p-3 mb-2 last:mb-0"
      style={{
        background:  label === 1 ? 'rgba(255,34,68,0.04)' : 'rgba(0,255,136,0.03)',
        borderColor: label === 1 ? 'rgba(255,34,68,0.15)' : 'rgba(0,255,136,0.12)',
      }}
    >
      {/* Top row: badge + similarity */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <ThreatSeverityBadge severity={severity} size="xs" pulse={false} />
        <div className="flex items-center gap-1.5">
          <TrendingUp size={9} style={{ color: barColor }} />
          <span className="text-[10px] font-mono font-bold" style={{ color: barColor }}>
            {pct}% match
          </span>
        </div>
      </div>

      {/* Prompt preview */}
      <p className="text-[11px] font-mono text-white/45 leading-snug mb-2">
        {fmtTruncate(document, 80)}
      </p>

      {/* Bottom: attack type + similarity bar */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-white/25 flex-shrink-0">
          {fmtAttackType(attackType)}
        </span>
        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, delay: index * 0.07 + 0.2, ease: 'easeOut' }}
            style={{ background: barColor, boxShadow: `0 0 4px ${barColor}80` }}
          />
        </div>
      </div>
    </motion.div>
  )
}

export default function SimilarPromptViewer({ result }) {
  if (!result) return null

  // top_similar lives in the classification object nested under data
  const data       = result.data ?? result ?? {}
  const clf        = data.classification ?? {}
  const topSimilar = clf.top_similar ?? result.top_similar ?? []

  return (
    <GlassCard corners className="flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database size={13} className="text-cyan-neon/50" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Similar Threats
          </span>
        </div>
        <span className="text-[9px] font-mono text-white/20">
          ChromaDB · top {topSimilar.length}
        </span>
      </div>

      {/* Entries */}
      <div className="overflow-y-auto max-h-64 pr-1">
        {topSimilar.length === 0 ? (
          <EmptyState />
        ) : (
          topSimilar.map((entry, i) => (
            <SimilarEntry key={i} entry={entry} index={i} />
          ))
        )}
      </div>
    </GlassCard>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-2">
      <div className="flex gap-1.5">
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            className="w-16 h-10 rounded-lg"
            style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.07)' }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.8, delay: i * 0.3, repeat: Infinity }}
          />
        ))}
      </div>
      <p className="text-[10px] font-mono text-white/15 tracking-widest text-center">
        Run analysis to see similar<br/>threats from the library
      </p>
    </div>
  )
}
