/**
 * AgentWorkflow.jsx — LangGraph pipeline visualization page
 * ══════════════════════════════════════════════════════════
 *
 * Layout:
 *  ┌──────────────────────────────────────────────────┐
 *  │ PageHeader + MetricsPanel                        │
 *  ├──────────────────────────────────────────────────┤
 *  │ WorkflowGraph (full width SVG)                   │
 *  ├──────────────────────────────────────────────────┤
 *  │ AgentCards (2×2 grid)  │ ExecutionTimeline       │
 *  │                        │ WorkflowControls        │
 *  └──────────────────────────────────────────────────┘
 */

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { GitBranch, Zap } from 'lucide-react'
import AnimatedPanel        from '@/components/shared/AnimatedPanel.jsx'
import GlassCard            from '@/components/shared/GlassCard.jsx'
import PageHeader           from '@/components/layout/PageHeader.jsx'
import AgentCard            from '@/components/agents/AgentCard.jsx'
import AgentWorkflowGraph   from '@/components/agents/AgentWorkflowGraph.jsx'
import AgentExecutionTimeline from '@/components/agents/AgentExecutionTimeline.jsx'
import AgentMetricsPanel    from '@/components/agents/AgentMetricsPanel.jsx'
import WorkflowControls     from '@/components/agents/WorkflowControls.jsx'
import useSentinelStore, { AGENT_DEFINITIONS } from '@/store/useSentinelStore.js'

export default function AgentWorkflow() {
  const [selectedAgent, setSelectedAgent] = useState(null)

  const agentStatuses   = useSentinelStore((s) => s.agentStatuses)
  const agentSteps      = useSentinelStore((s) => s.agentSteps)
  const pipelineRunning = useSentinelStore((s) => s.pipelineRunning)

  const handleAgentClick = (id) => {
    setSelectedAgent((prev) => (prev === id ? null : id))
  }

  const anyActive = Object.values(agentStatuses).some((s) => s !== 'idle')

  return (
    <AnimatedPanel variant="page" className="min-h-full">

      {/* Page header */}
      <PageHeader
        title="Agent Workflow"
        subtitle="LangGraph multi-agent pipeline visualization"
        icon={GitBranch}
        iconColor="#b347ff"
        badge={
          pipelineRunning  ? { label: 'Pipeline Active', variant: 'info'   } :
          anyActive        ? { label: 'Last Run Ready',  variant: 'purple' } :
                             undefined
        }
      />

      {/* Metrics */}
      <div className="mb-5">
        <AgentMetricsPanel />
      </div>

      {/* Workflow graph */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mb-5"
      >
        <GlassCard corners padding="md">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={12} className="text-purple-neon/60" />
            <span className="text-[10px] font-mono text-white/40 tracking-widest uppercase">
              Pipeline Graph
            </span>
            <span className="text-[9px] font-mono text-white/20">· LangGraph State Machine</span>
          </div>
          <AgentWorkflowGraph
            onNodeClick={handleAgentClick}
            selectedNode={selectedAgent}
          />
        </GlassCard>
      </motion.div>

      {/* Agent cards + right column */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Agent cards 2×2 */}
        <motion.div
          className="lg:col-span-3"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {AGENT_DEFINITIONS.map((agent, i) => {
              const status = agentStatuses[agent.id] ?? 'idle'
              const step   = agentSteps.find(
                (s) => (s.agent_name?? s.agentName ?? '').toLowerCase().includes(agent.id)
              )
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  status={status}
                  step={step}
                  isActive={status === 'running'}
                  index={i}
                  onClick={() => handleAgentClick(agent.id)}
                  selected={selectedAgent === agent.id}
                />
              )
            })}
          </div>
        </motion.div>

        {/* Right: timeline + controls */}
        <motion.div
          className="lg:col-span-2 flex flex-col gap-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.28 }}
        >
          <WorkflowControls />
          <div className="flex-1">
            <AgentExecutionTimeline />
          </div>
        </motion.div>
      </div>
    </AnimatedPanel>
  )
}
