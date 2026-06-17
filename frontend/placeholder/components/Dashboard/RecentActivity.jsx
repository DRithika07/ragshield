/**
 * RecentActivity.jsx — Latest attack log entries
 * ════════════════════════════════════════════════
 * Shows the 8 most recent analyzed prompts from the
 * logs API. Each row shows severity badge, attack type,
 * truncated prompt, and relative timestamp.
 * Clicking a row expands the AI explanation inline.
 */

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, Clock, Terminal } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import useSentinelStore from '@/store/useSentinelStore.js'
import { fmtRelative, fmtTruncate, fmtAttackType, getSeverityColor, getSeverityBg } from '@/utils/formatters.js'

function SeverityBadge({ severity }) {
  const color = getSeverityColor(severity)
  const bg    = getSeverityBg(severity)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase flex-shrink-0"
      style={{ color, background: bg, border: `1px solid ${color}30` }}
    >
      {severity === 'NONE' ? 'SAFE' : severity}
    </span>
  )
}

function LogRow({ log, index }) {
  const [expanded, setExpanded] = useState(false)
  const isMal  = log.predicted_label === 1
  const sevClr = getSeverityColor(log.severity)

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="border-b border-white/5 last:border-0"
    >
      {/* Main row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 py-3 px-1 text-left hover:bg-white/3 rounded-lg transition-colors group"
      >
        {/* Left severity bar */}
        <div
          className="flex-shrink-0 w-0.5 self-stretch rounded-full mt-0.5"
          style={{ background: sevClr, boxShadow: `0 0 4px ${sevClr}60` }}
        />

        <div className="flex-1 min-w-0">
          {/* Top: severity + attack type + time */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <SeverityBadge severity={log.severity ?? 'NONE'} />
            <span className="text-[10px] font-mono text-white/40">
              {fmtAttackType(log.attack_type)}
            </span>
            <span className="ml-auto text-[9px] font-mono text-white/20 flex items-center gap-1 flex-shrink-0">
              <Clock size={8} />
              {fmtRelative(log.created_at)}
            </span>
          </div>

          {/* Prompt preview */}
          <p className="text-[11px] font-mono text-white/50 leading-snug truncate">
            {fmtTruncate(log.prompt_text, 90)}
          </p>

          {/* Score */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[9px] font-mono text-white/20">
              score: <span style={{ color: sevClr }}>{((log.fusion_score ?? 0) * 100).toFixed(0)}</span>
            </span>
          </div>
        </div>

        {/* Expand chevron */}
        <div className="flex-shrink-0 text-white/20 group-hover:text-white/40 transition-colors mt-1">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
      </button>

      {/* Expanded AI explanation */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="mx-3 mb-3 p-3 rounded-lg text-[11px] font-mono text-white/50 leading-relaxed"
              style={{
                background: 'rgba(6,13,26,0.6)',
                border: '1px solid rgba(0,245,255,0.08)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Terminal size={9} className="text-cyan-neon/40" />
                <span className="text-[9px] text-cyan-neon/40 tracking-widest uppercase">AI Explanation</span>
              </div>
              {log.ai_explanation
                ? log.ai_explanation
                : <span className="text-white/20 italic">No explanation available — run with agents enabled.</span>
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function RecentActivity() {
  const logs       = useSentinelStore((s) => s.logs)
  const logsLoading= useSentinelStore((s) => s.logsLoading)
  const fetchLogs  = useSentinelStore((s) => s.fetchLogs)

  const recent = logs.slice(0, 8)

  return (
    <GlassCard corners className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Terminal size={13} className="text-cyan-neon/50" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Recent Activity
          </span>
        </div>
        <button
          onClick={() => fetchLogs({ page: 1, page_size: 20 })}
          className="text-[9px] font-mono text-cyan-neon/30 hover:text-cyan-neon/60 tracking-widest transition-colors"
          disabled={logsLoading}
        >
          {logsLoading ? '...' : 'REFRESH'}
        </button>
      </div>

      {/* Log rows */}
      <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
        {recent.length === 0 ? (
          <EmptyState />
        ) : (
          recent.map((log, i) => (
            <LogRow key={log.id} log={log} index={i} />
          ))
        )}
      </div>
    </GlassCard>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          className="w-full h-10 rounded-lg"
          style={{ background: 'rgba(0,245,255,0.03)', border: '1px solid rgba(0,245,255,0.06)' }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
        />
      ))}
      <p className="text-[10px] font-mono text-white/15 tracking-widest mt-2">
        No activity logged yet
      </p>
    </div>
  )
}
