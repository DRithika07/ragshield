/**
 * LiveThreatFeed.jsx — Animated real-time threat stream
 * ═══════════════════════════════════════════════════════
 * Scrolling stream of the latest malicious detections.
 * New entries slide in from the top. Gives the SOC
 * a real-time data-stream aesthetic.
 * Filters logs to malicious only and auto-refreshes.
 */

import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radio, AlertTriangle } from 'lucide-react'
import useSentinelStore from '@/store/useSentinelStore.js'
import { fmtTruncate, fmtAttackType, getSeverityColor, fmtRelative } from '@/utils/formatters.js'

const ATTACK_CODES = {
  jailbreak:          'JB',
  prompt_injection:   'PI',
  role_hijacking:     'RH',
  data_extraction:    'DE',
  indirect_injection: 'II',
  safe:               'OK',
}

function FeedEntry({ log, index }) {
  const color = getSeverityColor(log.severity)
  const code  = ATTACK_CODES[log.attack_type] ?? '??'

  return (
    <motion.div
      initial={{ opacity: 0, x: -20, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0"
    >
      {/* Attack type code badge */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
        style={{
          background: `${color}10`,
          border:     `1px solid ${color}25`,
        }}
      >
        <span className="text-[10px] font-mono font-bold" style={{ color }}>
          {code}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        {/* Attack type + score */}
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className="text-[11px] font-semibold" style={{ color }}>
            {fmtAttackType(log.attack_type)}
          </span>
          <span className="text-[9px] font-mono text-white/25 flex-shrink-0">
            {fmtRelative(log.created_at)}
          </span>
        </div>

        {/* Prompt preview */}
        <p className="text-[10px] font-mono text-white/35 leading-snug truncate">
          {fmtTruncate(log.prompt_text, 70)}
        </p>

        {/* Severity + score bar */}
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width:      `${(log.fusion_score ?? 0) * 100}%`,
                background: color,
                boxShadow:  `0 0 3px ${color}`,
              }}
            />
          </div>
          <span className="text-[9px] font-mono flex-shrink-0" style={{ color }}>
            {((log.fusion_score ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default function LiveThreatFeed() {
  const logs      = useSentinelStore((s) => s.logs)
  const fetchLogs = useSentinelStore((s) => s.fetchLogs)
  const scrollRef = useRef(null)

  // Only show malicious detections
  const threats = logs.filter((l) => l.predicted_label === 1).slice(0, 12)

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchLogs({ page: 1, page_size: 50, is_malicious: true })
    const id = setInterval(
      () => fetchLogs({ page: 1, page_size: 50, is_malicious: true }),
      30_000
    )
    return () => clearInterval(id)
  }, [])

  // Scroll to top when new threats arrive
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [threats.length])

  return (
    <div
      className="rounded-panel border flex flex-col h-full"
      style={{
        background: 'rgba(6,13,26,0.7)',
        border:     '1px solid rgba(255,34,68,0.12)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Radio size={13} className="text-red-neon" />
          </motion.div>
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Threat Feed
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-red-neon"
            style={{ boxShadow: '0 0 4px #ff2244' }}
          />
          <span className="text-[9px] font-mono text-red-neon/70 tracking-widest">LIVE</span>
        </div>
      </div>

      {/* Feed entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-2">
        {threats.length === 0 ? (
          <NoThreats />
        ) : (
          <AnimatePresence initial={false}>
            {threats.map((log, i) => (
              <FeedEntry key={log.id} log={log} index={i} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer: threat count */}
      {threats.length > 0 && (
        <div className="px-4 py-2.5 border-t border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={10} className="text-red-neon/50" />
            <span className="text-[9px] font-mono text-white/20">
              {threats.length} active threat{threats.length !== 1 ? 's' : ''} in window
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function NoThreats() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
      <motion.div
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-8 h-8 rounded-full border border-green-neon/20 flex items-center justify-center"
      >
        <span className="text-green-neon text-xs">✓</span>
      </motion.div>
      <p className="text-[10px] font-mono text-white/15 tracking-widest text-center">
        No threats detected<br />System nominal
      </p>
    </div>
  )
}
