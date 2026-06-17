/**
 * AgentStatusGrid.jsx — Floating agent status cards
 * ══════════════════════════════════════════════════
 * Shows live status, activity pulse, and last execution
 * time for each of the 4 LangGraph agents.
 * Reads from Zustand agentStatuses + agentSteps.
 */

import React from 'react'
import { motion } from 'framer-motion'
import { Scan, Brain, Shield, FileText, Zap, Clock } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import useSentinelStore, { AGENT_DEFINITIONS } from '@/store/useSentinelStore.js'

const ICON_MAP = { Scan, Brain, Shield, FileText }

const STATUS_CONFIG = {
  idle:     { label: 'Idle',     color: 'rgba(255,255,255,0.25)', dot: 'rgba(255,255,255,0.2)',  pulse: false },
  running:  { label: 'Running',  color: '#00f5ff',               dot: '#00f5ff',               pulse: true  },
  complete: { label: 'Complete', color: '#00ff88',               dot: '#00ff88',               pulse: false },
  failed:   { label: 'Failed',   color: '#ff2244',               dot: '#ff2244',               pulse: false },
}

function AgentCard({ agent, status, step, index }) {
  const Icon   = ICON_MAP[agent.icon] ?? Zap
  const scfg   = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle
  const isRun  = status === 'running'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0  }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
    >
      <GlassCard
        className="relative overflow-hidden h-full"
        style={{
          borderColor: `${agent.color}${status === 'idle' ? '15' : '30'}`,
          boxShadow:   status !== 'idle' ? `0 0 20px ${agent.color}10` : 'none',
        }}
      >
        {/* Running animated border sweep */}
        {isRun && (
          <motion.div
            className="absolute inset-0 rounded-panel pointer-events-none"
            style={{
              background: `conic-gradient(from 0deg, transparent 0%, ${agent.color}30 25%, transparent 50%)`,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          />
        )}

        {/* Background glow */}
        <div
          className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-20 pointer-events-none"
          style={{ background: agent.color }}
        />

        <div className="relative z-10">
          {/* Top row: icon + status */}
          <div className="flex items-start justify-between mb-3">
            <motion.div
              animate={isRun ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: `${agent.color}12`,
                border:     `1px solid ${agent.color}25`,
                boxShadow:  isRun ? `0 0 12px ${agent.color}30` : 'none',
              }}
            >
              <Icon size={16} style={{ color: agent.color }} strokeWidth={1.6} />
            </motion.div>

            {/* Status dot */}
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${scfg.pulse ? 'animate-neon-pulse' : ''}`}
                style={{ background: scfg.dot, boxShadow: scfg.pulse ? `0 0 5px ${scfg.dot}` : 'none' }}
              />
              <span className="text-[9px] font-mono tracking-widest" style={{ color: scfg.color }}>
                {scfg.label}
              </span>
            </div>
          </div>

          {/* Agent name */}
          <p className="text-[13px] font-semibold text-white/80 mb-0.5 leading-tight">
            {agent.name}
          </p>
          <p className="text-[10px] font-mono text-white/25 leading-snug mb-3">
            {agent.description}
          </p>

          {/* Last execution */}
          {step && (
            <div className="pt-2.5 border-t border-white/5">
              {step.duration_ms && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock size={9} className="text-white/25" />
                  <span className="text-[9px] font-mono text-white/30">
                    {step.duration_ms}ms
                  </span>
                </div>
              )}
              {step.output_summary && (
                <p className="text-[9px] font-mono text-white/30 leading-snug truncate">
                  {step.output_summary}
                </p>
              )}
            </div>
          )}

          {/* Progress bar when running */}
          {isRun && (
            <div className="mt-3 h-0.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: agent.color }}
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  )
}

export default function AgentStatusGrid() {
  const agentStatuses = useSentinelStore((s) => s.agentStatuses)
  const agentSteps    = useSentinelStore((s) => s.agentSteps)
  const pipelineRunning = useSentinelStore((s) => s.pipelineRunning)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-purple-neon/60" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Agent Pipeline
          </span>
        </div>
        {pipelineRunning && (
          <motion.span
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="text-[9px] font-mono text-cyan-neon tracking-widest"
          >
            ● ACTIVE
          </motion.span>
        )}
      </div>

      {/* Agent cards grid */}
      <div className="grid grid-cols-2 gap-3 flex-1">
        {AGENT_DEFINITIONS.map((agent, i) => {
          const status = agentStatuses[agent.id] ?? 'idle'
          const step   = agentSteps.find(
            (s) => s.agent_name?.toLowerCase().includes(agent.id)
          )
          return (
            <AgentCard
              key={agent.id}
              agent={agent}
              status={status}
              step={step}
              index={i}
            />
          )
        })}
      </div>
    </div>
  )
}
