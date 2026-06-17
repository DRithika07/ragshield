/**
 * AgentMetricsPanel.jsx — Pipeline execution metrics
 * ═══════════════════════════════════════════════════
 * Shows: total executions, avg response time,
 * success rate, active workflows.
 * Derives data from Zustand agentSteps + logs store.
 */

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Clock, CheckCircle, Activity } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import useSentinelStore from '@/store/useSentinelStore.js'

function MetricCell({ icon: Icon, label, value, unit, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1,  y:  0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center p-3 rounded-xl border text-center"
      style={{ background: `${color}06`, borderColor: `${color}18` }}
    >
      <Icon size={14} style={{ color }} className="mb-2" />
      <p className="font-display text-xl font-bold leading-none mb-1" style={{ color, textShadow: `0 0 12px ${color}60` }}>
        {value}
        {unit && <span className="text-[11px] font-mono ml-0.5 opacity-60">{unit}</span>}
      </p>
      <p className="text-[9px] font-mono text-white/30 tracking-wider leading-snug">{label}</p>
    </motion.div>
  )
}

export default function AgentMetricsPanel() {
  const agentSteps      = useSentinelStore((s) => s.agentSteps)
  const agentStatuses   = useSentinelStore((s) => s.agentStatuses)
  const pipelineRunning = useSentinelStore((s) => s.pipelineRunning)
  const logs            = useSentinelStore((s) => s.logs)

  const metrics = useMemo(() => {
    // Total pipeline executions = logs with detected threats that had agents run
    const totalExec = logs.filter((l) => l.is_malicious).length

    // Average duration from completed steps in current run
    const durSteps = agentSteps.filter((s) => s.duration_ms)
    const avgMs    = durSteps.length
      ? Math.round(durSteps.reduce((a, b) => a + (b.duration_ms ?? 0), 0) / durSteps.length)
      : 0

    // Success rate from current run steps
    const total    = agentSteps.length
    const succeded = agentSteps.filter((s) => s.status === 'complete').length
    const rate     = total > 0 ? Math.round((succeded / total) * 100) : 100

    // Active workflows
    const active = pipelineRunning ? 1 : 0

    return { totalExec, avgMs, rate, active }
  }, [agentSteps, logs, pipelineRunning])

  return (
    <GlassCard padding="sm">
      <div className="flex items-center gap-2 mb-3 px-1">
        <TrendingUp size={12} className="text-cyan-neon/50" />
        <span className="text-[10px] font-mono text-white/40 tracking-widest uppercase">Pipeline Metrics</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCell icon={Activity}     label="Total Runs"   value={metrics.totalExec} color="#00f5ff" delay={0}    />
        <MetricCell icon={Clock}        label="Avg Duration" value={metrics.avgMs || '—'} unit={metrics.avgMs ? 'ms' : ''} color="#b347ff" delay={0.08} />
        <MetricCell icon={CheckCircle}  label="Success Rate" value={`${metrics.rate}%`}  color="#00ff88" delay={0.16} />
        <MetricCell icon={TrendingUp}   label="Active"        value={metrics.active}      color="#ffaa00" delay={0.24} />
      </div>
    </GlassCard>
  )
}
