/**
 * AgentExecutionTimeline.jsx — Sequential execution timeline
 * ══════════════════════════════════════════════════════════
 * Vertical timeline showing each agent step with timestamp,
 * duration, and output summary. Items reveal in sequence
 * with staggered animations as steps complete.
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Scan, Brain, Shield, FileText, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import useSentinelStore from '@/store/useSentinelStore.js'

const ICON_MAP = {
  DetectionAgent:  { icon: Scan,     color: '#00f5ff' },
  AnalysisAgent:   { icon: Brain,    color: '#b347ff' },
  MitigationAgent: { icon: Shield,   color: '#ffaa00' },
  ReportAgent:     { icon: FileText, color: '#00ff88' },
}

function getConfig(agentName) {
  for (const [key, val] of Object.entries(ICON_MAP)) {
    if (agentName?.includes(key.replace('Agent', ''))) return val
  }
  return { icon: Scan, color: '#00f5ff' }
}

function TimelineItem({ step, index, isLast }) {
  const cfg   = getConfig(step.agent_name)
  const Icon  = cfg.icon
  const isOk  = step.status === 'complete'
  const isFail= step.status === 'failed'
  const isRun = step.status === 'running'

  const StatusIcon = isOk ? CheckCircle : isFail ? XCircle : Loader2

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1,  x:   0 }}
      transition={{ duration: 0.35, delay: index * 0.12, ease: 'easeOut' }}
      className="flex gap-4"
    >
      {/* Left: icon + connector line */}
      <div className="flex flex-col items-center flex-shrink-0">
        {/* Node */}
        <motion.div
          className="w-9 h-9 rounded-xl flex items-center justify-center relative z-10"
          animate={isRun ? { boxShadow: [`0 0 0px ${cfg.color}00`, `0 0 16px ${cfg.color}60`, `0 0 0px ${cfg.color}00`] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{
            background: `${cfg.color}12`,
            border:     `1px solid ${cfg.color}${isOk ? '50' : '25'}`,
          }}
        >
          <Icon size={15} style={{ color: cfg.color }} strokeWidth={1.5}
            className={isRun ? 'animate-pulse' : ''} />
        </motion.div>

        {/* Connector line */}
        {!isLast && (
          <motion.div
            className="w-px flex-1 mt-1"
            initial={{ height: 0 }}
            animate={{ height: '100%' }}
            transition={{ duration: 0.4, delay: index * 0.12 + 0.2 }}
            style={{
              background: isOk
                ? `linear-gradient(180deg, ${cfg.color}50, ${cfg.color}10)`
                : 'rgba(255,255,255,0.06)',
              minHeight: 28,
            }}
          />
        )}
      </div>

      {/* Right: content */}
      <div className="flex-1 pb-5 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold" style={{ color: isOk ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}>
              {step.agent_name}
            </span>
            <StatusIcon
              size={11}
              style={{ color: isOk ? '#00ff88' : isFail ? '#ff2244' : '#00f5ff' }}
              className={isRun ? 'animate-spin' : ''}
            />
          </div>
          {step.duration_ms && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Clock size={9} className="text-white/20" />
              <span className="text-[9px] font-mono text-white/30">{step.duration_ms}ms</span>
            </div>
          )}
        </div>

        {/* Output summary */}
        <div
          className="rounded-lg px-3 py-2 border"
          style={{
            background:  `${cfg.color}04`,
            borderColor: `${cfg.color}12`,
          }}
        >
          <p className="text-[11px] font-mono text-white/50 leading-relaxed">
            {step.output_summary || 'Processing…'}
          </p>
        </div>

        {/* Duration bar */}
        {step.duration_ms && isOk && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((step.duration_ms / 3000) * 100, 100)}%` }}
                transition={{ duration: 0.6, delay: index * 0.12 + 0.3 }}
                style={{ background: cfg.color, boxShadow: `0 0 4px ${cfg.color}` }}
              />
            </div>
            <span className="text-[8px] font-mono text-white/15">
              {step.duration_ms < 1000 ? `${step.duration_ms}ms` : `${(step.duration_ms/1000).toFixed(1)}s`}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function AgentExecutionTimeline() {
  const agentSteps      = useSentinelStore((s) => s.agentSteps)
  const pipelineRunning = useSentinelStore((s) => s.pipelineRunning)
  const agentStatuses   = useSentinelStore((s) => s.agentStatuses)

  // Build display steps — merge completed steps with running status
  const displaySteps = agentSteps.length > 0
    ? agentSteps
    : Object.entries(agentStatuses)
        .filter(([, status]) => status !== 'idle')
        .map(([id, status]) => ({
          agent_name:     `${id.charAt(0).toUpperCase() + id.slice(1)}Agent`,
          status,
          output_summary: status === 'running' ? 'Processing…' : '',
          duration_ms:    null,
        }))

  return (
    <GlassCard corners className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 rounded-full bg-purple-neon/60" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Execution Timeline
          </span>
        </div>
        {pipelineRunning && (
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="text-[9px] font-mono text-cyan-neon tracking-widest"
          >
            ● RUNNING
          </motion.span>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        <AnimatePresence mode="popLayout">
          {displaySteps.length === 0 ? (
            <EmptyTimeline key="empty" />
          ) : (
            displaySteps.map((step, i) => (
              <TimelineItem
                key={step.agent_name + i}
                step={step}
                index={i}
                isLast={i === displaySteps.length - 1}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  )
}

function EmptyTimeline() {
  const steps = ['Detection Agent', 'Analysis Agent', 'Mitigation Agent', 'Report Agent']
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {steps.map((name, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="w-9 h-9 rounded-xl border border-white/5 bg-white/2 flex items-center justify-center">
              <span className="text-[9px] font-mono text-white/15">{i+1}</span>
            </div>
            {i < 3 && <div className="w-px flex-1 mt-1 bg-white/4" style={{ minHeight: 24 }} />}
          </div>
          <div className="flex-1 pb-4">
            <p className="text-[12px] font-mono text-white/20 mb-1">{name}</p>
            <div className="h-8 rounded-lg bg-white/3 border border-white/5" />
          </div>
        </div>
      ))}
      <p className="text-center text-[10px] font-mono text-white/15 pt-2 tracking-widest">
        Run a prompt to activate pipeline
      </p>
    </motion.div>
  )
}
