/**
 * AgentCard.jsx — Individual agent status card
 * ══════════════════════════════════════════════
 * Floating glassmorphism card for one agent node.
 * Shows: name, status, execution time, description,
 * animated activity ring, and last output summary.
 *
 * Props:
 *   agent      — AGENT_DEFINITIONS entry
 *   status     — 'idle' | 'running' | 'complete' | 'failed'
 *   step       — matching agentSteps entry (has output_summary, duration_ms)
 *   isActive   — currently executing (drives animations)
 *   index      — card index for stagger delay
 *   onClick    — expand detail view
 *   selected   — this card is selected/expanded
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scan, Brain, Shield, FileText,
  Clock, CheckCircle, XCircle, Loader2,
  Zap, ChevronDown, ChevronUp,
} from 'lucide-react'
import clsx from 'clsx'

const ICON_MAP  = { Scan, Brain, Shield, FileText }

const STATUS_CFG = {
  idle:     { label: 'Idle',      color: 'rgba(255,255,255,0.2)',  ring: 'rgba(255,255,255,0.06)', icon: null,         bg: 'rgba(255,255,255,0.02)' },
  running:  { label: 'Running',   color: '#00f5ff',               ring: 'rgba(0,245,255,0.15)',   icon: Loader2,      bg: 'rgba(0,245,255,0.04)'   },
  complete: { label: 'Complete',  color: '#00ff88',               ring: 'rgba(0,255,136,0.15)',   icon: CheckCircle,  bg: 'rgba(0,255,136,0.04)'   },
  failed:   { label: 'Failed',    color: '#ff2244',               ring: 'rgba(255,34,68,0.15)',   icon: XCircle,      bg: 'rgba(255,34,68,0.04)'   },
}

export default function AgentCard({
  agent, status = 'idle', step, isActive = false,
  index = 0, onClick, selected = false,
}) {
  const Icon    = ICON_MAP[agent.icon] ?? Zap
  const scfg    = STATUS_CFG[status]  ?? STATUS_CFG.idle
  const SIcon   = scfg.icon
  const isRun   = status === 'running'
  const isDone  = status === 'complete'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1,  y:  0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
      onClick={onClick}
      className={clsx('relative rounded-2xl border overflow-hidden cursor-pointer transition-all duration-300', selected && 'ring-1')}
      style={{
        background:   `${agent.color}05`,
        borderColor:  status === 'idle' ? 'rgba(255,255,255,0.06)' : `${agent.color}30`,
        boxShadow:    status !== 'idle' ? `0 0 24px ${agent.color}12` : '0 4px 24px rgba(0,0,0,0.4)',
        ringColor:    agent.color,
        backdropFilter: 'blur(16px)',
      }}
      whileHover={{ y: -3, boxShadow: `0 8px 32px ${agent.color}18` }}
    >
      {/* Running sweep animation */}
      {isRun && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `conic-gradient(from 0deg, transparent 0%, ${agent.color}20 20%, transparent 40%)`,
            borderRadius: 'inherit',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* Completion flash */}
      {isDone && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0   }}
          transition={{ duration: 0.8 }}
          style={{ background: `${agent.color}15` }}
        />
      )}

      {/* Top edge accent */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${agent.color}${status==='idle'?'20':'60'},transparent)` }}
      />

      <div className="p-4 relative z-10">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          {/* Agent icon with activity ring */}
          <div className="relative">
            <motion.div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              animate={isRun ? { boxShadow: [`0 0 0px ${agent.color}00`, `0 0 16px ${agent.color}60`, `0 0 0px ${agent.color}00`] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{
                background: `${agent.color}12`,
                border:     `1px solid ${agent.color}${status==='idle'?'20':'40'}`,
              }}
            >
              <Icon size={18} style={{ color: agent.color, filter: status!=='idle' ? `drop-shadow(0 0 4px ${agent.color})` : 'none' }} strokeWidth={1.5} />
            </motion.div>
            {/* Orbiting dot when running */}
            {isRun && (
              <motion.div
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2"
                style={{ background: agent.color, borderColor: '#020408', boxShadow: `0 0 8px ${agent.color}` }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border"
            style={{ background: scfg.bg, borderColor: `${scfg.color}30` }}>
            {SIcon && (
              <SIcon size={9} style={{ color: scfg.color }} className={isRun ? 'animate-spin' : ''} />
            )}
            {!SIcon && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: scfg.color }} />
            )}
            <span className="text-[9px] font-mono tracking-widest" style={{ color: scfg.color }}>
              {scfg.label}
            </span>
          </div>
        </div>

        {/* Agent name + description */}
        <p className="text-[13px] font-semibold text-white/85 mb-0.5 leading-snug">
          {agent.name}
        </p>
        <p className="text-[10px] font-mono text-white/25 leading-snug mb-3">
          {agent.description}
        </p>

        {/* Metrics row */}
        {step && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-3 border-t border-white/5 flex items-center gap-3"
          >
            {step.duration_ms && (
              <div className="flex items-center gap-1">
                <Clock size={9} className="text-white/25" />
                <span className="text-[9px] font-mono text-white/35">{step.duration_ms}ms</span>
              </div>
            )}
            <CheckCircle size={9} className="text-green-neon/40" />
            <span className="text-[9px] font-mono text-white/25 truncate flex-1">
              {step.output_summary?.slice(0, 40) ?? 'Completed'}
            </span>
          </motion.div>
        )}

        {/* Expand indicator */}
        <div className="absolute bottom-3 right-3 text-white/15">
          {selected ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </div>

      {/* Expanded detail panel */}
      <AnimatePresence>
        {selected && step && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="px-4 py-3 space-y-2">
              <p className="text-[9px] font-mono text-white/25 tracking-widest uppercase mb-2">Output</p>
              <p className="text-[11px] font-mono text-white/55 leading-relaxed">
                {step.output_summary ?? '—'}
              </p>
              {step.duration_ms && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((step.duration_ms / 3000) * 100, 100)}%` }}
                      transition={{ duration: 0.5 }}
                      style={{ background: agent.color }}
                    />
                  </div>
                  <span className="text-[9px] font-mono" style={{ color: agent.color }}>
                    {step.duration_ms}ms
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
