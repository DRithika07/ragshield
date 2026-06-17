/**
 * AgentWorkflowGraph.jsx — SVG pipeline flow visualization
 *══════════════════════════════════════════════════════════
 * Renders the 4-agent pipeline as an animated SVG graph.
 * Nodes light up as each agent activates.
 * Animated data-flow particles travel along edges.
 * Adapts to both vertical (mobile) and horizontal (desktop) layouts.
 */

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Scan, Brain, Shield, FileText, User, CheckSquare } from 'lucide-react'
import useSentinelStore, { AGENT_DEFINITIONS } from '@/store/useSentinelStore.js'

const ICON_MAP = { Scan, Brain, Shield, FileText }

// Pipeline nodes including source (User Prompt) and sink (Final Response)
const PIPELINE_NODES = [
  { id: 'input',     label: 'User Prompt',     sublabel: 'Raw input',           color: '#00f5ff', icon: User,        isEndpoint: true  },
  { id: 'detection', label: 'Detection Agent', sublabel: 'ML + Vector search',  color: '#00f5ff', icon: Scan,        isAgent: true     },
  { id: 'analysis',  label: 'Analysis Agent',  sublabel: 'Gemini explanation',  color: '#b347ff', icon: Brain,       isAgent: true     },
  { id: 'mitigation',label: 'Mitigation Agent',sublabel: 'Countermeasures',     color: '#ffaa00', icon: Shield,      isAgent: true     },
  { id: 'report',    label: 'Report Agent',    sublabel: 'PDF generation',      color: '#00ff88', icon: FileText,    isAgent: true     },
  { id: 'output',    label: 'Final Response',  sublabel: 'Threat assessment',   color: '#00ff88', icon: CheckSquare, isEndpoint: true  },
]

const NODE_STATUS = (agentStatuses, id) => {
  if (id === 'input')  return 'complete'
  if (id === 'output') return agentStatuses.report === 'complete' ? 'complete' : 'idle'
  return agentStatuses[id] ?? 'idle'
}

const STATUS_COLOR = {
  idle:     'rgba(255,255,255,0.12)',
  running:  '#00f5ff',
  complete: '#00ff88',
  failed:   '#ff2244',
}

// Animated particle along a straight path
function FlowParticle({ x1, y1, x2, y2, color, delay = 0, active = false }) {
  if (!active) return null
  return (
    <motion.circle r={3} fill={color}
      style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      initial={{ cx: x1, cy: y1, opacity: 0 }}
      animate={{ cx: [x1, x2], cy: [y1, y2], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.4, delay, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.4 }}
    />
  )
}

// Single pipeline node rendered in SVG via foreignObject
function PipelineNode({ node, cx, cy, status, r = 36, onClick, selected }) {
  const color   = STATUS_COLOR[status] ?? STATUS_COLOR.idle
  const Icon    = ICON_MAP[node.icon] ?? node.icon
  const isRun   = status === 'running'

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Glow ring for active nodes */}
      {status !== 'idle' && (
        <motion.circle cx={cx} cy={cy} r={r + 10} fill="none"
          stroke={color} strokeWidth={1} strokeOpacity={0.3}
          animate={isRun ? { r: [r+10, r+20], opacity: [0.4, 0] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Running sweep */}
      {isRun && (
        <motion.circle cx={cx} cy={cy} r={r + 4} fill="none"
          stroke={color} strokeWidth={2} strokeDasharray={`${(r+4)*2*Math.PI*0.25} ${(r+4)*2*Math.PI*0.75}`}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
      )}

      {/* Node circle */}
      <motion.circle
        cx={cx} cy={cy} r={r}
        fill={`${node.color}10`}
        stroke={color}
        strokeWidth={selected ? 2 : 1.5}
        animate={status !== 'idle' ? { stroke: color } : {}}
        style={{ filter: status !== 'idle' ? `drop-shadow(0 0 8px ${color}60)` : 'none' }}
      />

      {/* Icon via foreignObject */}
      <foreignObject x={cx - 14} y={cy - 14} width={28} height={28} style={{ overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
          {Icon && <Icon size={20} color={color} strokeWidth={1.5} />}
        </div>
      </foreignObject>

      {/* Label below */}
      <text x={cx} y={cy + r + 16} textAnchor="middle"
        fill="rgba(255,255,255,0.7)" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={500}>
        {node.label}
      </text>
      <text x={cx} y={cy + r + 29} textAnchor="middle"
        fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily="JetBrains Mono, monospace">
        {node.sublabel}
      </text>
    </g>
  )
}

export default function AgentWorkflowGraph({ onNodeClick, selectedNode }) {
  const agentStatuses = useSentinelStore((s) => s.agentStatuses)
  const pipelineRunning = useSentinelStore((s) => s.pipelineRunning)

  // Layout: evenly space nodes horizontally inside 900×180 viewBox
  const VW = 900; const VH = 220
  const NODE_Y = VH / 2 - 20
  const nodeXs = PIPELINE_NODES.map((_, i) => 60 + i * ((VW - 120) / (PIPELINE_NODES.length - 1)))

  // Edge list
  const edges = PIPELINE_NODES.slice(0, -1).map((n, i) => ({
    id:    `${n.id}-${PIPELINE_NODES[i+1].id}`,
    x1:    nodeXs[i] + 36,
    y1:    NODE_Y,
    x2:    nodeXs[i+1] - 36,
    y2:    NODE_Y,
    color: PIPELINE_NODES[i+1].color,
    fromStatus: NODE_STATUS(agentStatuses, n.id),
    toStatus:   NODE_STATUS(agentStatuses, PIPELINE_NODES[i+1].id),
  }))

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        style={{ minWidth: 560, maxHeight: 230 }}
      >
        {/* Background grid */}
        <defs>
          <pattern id="wf-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,245,255,0.03)" strokeWidth="0.5"/>
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect width={VW} height={VH} fill="url(#wf-grid)" />

        {/* Edges */}
        {edges.map((edge, i) => {
          const isActive = edge.fromStatus === 'complete' || edge.fromStatus === 'running'
          const edgeColor = isActive ? edge.color : 'rgba(255,255,255,0.07)'
          return (
            <g key={edge.id}>
              {/* Static line */}
              <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                stroke={edgeColor} strokeWidth={isActive ? 1.5 : 1}
                strokeDasharray={isActive ? 'none' : '4 4'}
                style={{ filter: isActive ? `drop-shadow(0 0 3px ${edge.color}60)` : 'none' }}
              />
              {/* Flow particles */}
              {[0, 0.5, 1.0].map((d, pi) => (
                <FlowParticle key={pi}
                  x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                  color={edge.color} delay={d} active={isActive}
                />
              ))}
            </g>
          )
        })}

        {/* Nodes */}
        {PIPELINE_NODES.map((node, i) => (
          <PipelineNode key={node.id}
            node={node}
            cx={nodeXs[i]} cy={NODE_Y}
            status={NODE_STATUS(agentStatuses, node.id)}
            r={node.isEndpoint ? 28 : 36}
            onClick={() => onNodeClick?.(node.id)}
            selected={selectedNode === node.id}
          />
        ))}
      </svg>

      {/* Pipeline running label */}
      <AnimatePresence>
        {pipelineRunning && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)' }}
          >
            <motion.span className="w-1.5 h-1.5 rounded-full bg-cyan-neon"
              animate={{ opacity: [1,0.3,1] }} transition={{ duration: 0.8, repeat: Infinity }}
            />
            <span className="text-[9px] font-mono text-cyan-neon/70 tracking-widest">PIPELINE ACTIVE</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
