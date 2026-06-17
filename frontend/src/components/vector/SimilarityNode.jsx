import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, ShieldAlert, Zap, Database } from 'lucide-react'

/**
 * SimilarityNode.jsx
 * A single node card for use in cluster/graph visualizations.
 * Renders a document node with its similarity score, threat status,
 * animated glow ring, and expandable content preview.
 *
 * Props:
 *   id          — unique key
 *   label       — display label e.g. "Doc 3"
 *   score       — similarity 0–100 (number)
 *   isPoison    — boolean
 *   content     — document preview text
 *   source      — source identifier string
 *   size        — 'sm' | 'md' | 'lg'  (default 'md')
 *   active      — boolean — drives pulse animation
 *   selected    — boolean — selected state
 *   onClick     — click handler
 *   style       — override positioning in absolute layouts
 */

const SIZE_CFG = {
  sm: { outer: 48, inner: 36, iconSize: 12, fontSize: '8px',  ringOffset: 6  },
  md: { outer: 64, inner: 48, iconSize: 16, fontSize: '9px',  ringOffset: 8  },
  lg: { outer: 80, inner: 60, iconSize: 20, fontSize: '10px', ringOffset: 10 },
}

function nodeColors(isPoison, score) {
  if (!isPoison)           return { primary: '#00ff88', bg: 'rgba(0,255,136,0.10)',  border: 'rgba(0,255,136,0.35)' }
  if (score >= 82)         return { primary: '#ff2244', bg: 'rgba(255,34,68,0.14)',  border: 'rgba(255,34,68,0.55)' }
  return                          { primary: '#ffaa00', bg: 'rgba(255,170,0,0.12)',  border: 'rgba(255,170,0,0.40)' }
}

function ThreatLabel({ isPoison, score }) {
  if (!isPoison) return <span className="text-green-neon/70">CLEAN</span>
  if (score >= 82) return <span className="text-red-neon animate-neon-pulse">HIGH RISK</span>
  return <span className="text-amber-neon/80">SUSPICIOUS</span>
}

export default function SimilarityNode({
  id,
  label      = 'Doc',
  score      = 0,
  isPoison   = false,
  content    = '',
  source     = 'unknown',
  size       = 'md',
  active     = false,
  selected   = false,
  onClick,
  style      = {},
}) {
  const [hovered,  setHovered]  = useState(false)
  const [expanded, setExpanded] = useState(false)

  const cfg    = SIZE_CFG[size] ?? SIZE_CFG.md
  const colors = nodeColors(isPoison, score)
  const Icon   = isPoison ? ShieldAlert : ShieldCheck
  const isCrit = isPoison && score >= 82
  const showDetail = (hovered || selected) && !expanded

  const handleClick = () => {
    setExpanded((v) => !v)
    onClick?.({ id, label, score, isPoison, content, source })
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', ...style }}>

      {/* ── Node circle ────────────────────────────────────────── */}
      <motion.button
        onClick={handleClick}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        className="relative flex items-center justify-center rounded-full focus:outline-none"
        style={{
          width:        cfg.outer,
          height:       cfg.outer,
          background:   colors.bg,
          border:       `${selected ? 2 : 1.5}px solid ${colors.border}`,
          boxShadow:    (active || selected)
            ? `0 0 20px ${colors.primary}50, 0 0 40px ${colors.primary}20`
            : `0 0 8px ${colors.primary}20`,
          cursor:       'pointer',
          flexShrink:   0,
        }}
        animate={{
          scale: hovered ? 1.08 : 1,
          boxShadow: isCrit
            ? [
                `0 0 12px ${colors.primary}40`,
                `0 0 24px ${colors.primary}70`,
                `0 0 12px ${colors.primary}40`,
              ]
            : undefined,
        }}
        transition={{
          scale:    { duration: 0.15 },
          boxShadow:{ duration: 1, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        {/* Outer pulse ring (active state) */}
        {(active || selected) && (
          <motion.span
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: colors.primary }}
            animate={{ scale: [1, 1.45], opacity: [0.6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        {/* Secondary slow ring */}
        {active && (
          <motion.span
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: colors.primary }}
            animate={{ scale: [1, 1.7], opacity: [0.3, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
          />
        )}

        {/* Rotating sweep (critical nodes) */}
        {isCrit && (
          <motion.div
            className="absolute inset-0 rounded-full overflow-hidden"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 0deg, transparent 0%, ${colors.primary}30 25%, transparent 50%)`,
              }}
            />
          </motion.div>
        )}

        {/* Inner circle */}
        <div
          className="relative rounded-full flex items-center justify-center"
          style={{
            width:      cfg.inner,
            height:     cfg.inner,
            background: `${colors.primary}12`,
            border:     `1px solid ${colors.primary}25`,
          }}
        >
          <Icon
            size={cfg.iconSize}
            style={{
              color:  colors.primary,
              filter: `drop-shadow(0 0 4px ${colors.primary})`,
            }}
            strokeWidth={1.6}
          />
        </div>

        {/* Score badge */}
        <div
          className="absolute -bottom-1 left-1/2 px-1.5 py-px rounded-full font-mono font-bold tabular-nums"
          style={{
            transform:   'translateX(-50%)',
            fontSize:    cfg.fontSize,
            background:  colors.bg,
            border:      `1px solid ${colors.border}`,
            color:       colors.primary,
            whiteSpace:  'nowrap',
            backdropFilter: 'blur(8px)',
          }}
        >
          {score.toFixed(0)}%
        </div>
      </motion.button>

      {/* ── Hover tooltip ──────────────────────────────────────── */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            key="tip"
            initial={{ opacity: 0, y: 6, scale: 0.94 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{ opacity: 0, y: 4, scale: 0.94 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 rounded-xl border min-w-[180px] pointer-events-none"
            style={{
              top:            `calc(100% + ${cfg.ringOffset + 8}px)`,
              left:           '50%',
              transform:      'translateX(-50%)',
              background:     'rgba(6,13,26,0.97)',
              borderColor:    `${colors.primary}25`,
              backdropFilter: 'blur(16px)',
              boxShadow:      `0 8px 24px rgba(0,0,0,0.6), 0 0 12px ${colors.primary}15`,
              padding:        '10px 12px',
            }}
          >
            {/* Arrow */}
            <div
              className="absolute left-1/2 -top-1.5 w-2.5 h-2.5 rotate-45"
              style={{
                transform: 'translateX(-50%) rotate(45deg)',
                background: 'rgba(6,13,26,0.97)',
                borderTop: `1px solid ${colors.primary}25`,
                borderLeft: `1px solid ${colors.primary}25`,
              }}
            />

            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-[8px] font-mono font-bold tracking-[0.18em] uppercase"
                style={{ color: colors.primary }}
              >
                <ThreatLabel isPoison={isPoison} score={score} />
              </span>
              <span className="text-[9px] font-mono text-white/40 ml-3">{label}</span>
            </div>

            {content && (
              <p className="text-[10px] font-mono text-white/50 leading-snug mb-2">
                {content.slice(0, 80)}{content.length > 80 ? '…' : ''}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Database size={8} className="text-white/20" />
              <span className="text-[8px] font-mono text-white/25">{source}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Expanded content card ──────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute z-50 rounded-2xl border min-w-[220px] max-w-[280px]"
            style={{
              top:            `calc(100% + ${cfg.ringOffset + 10}px)`,
              left:           '50%',
              transform:      'translateX(-50%)',
              background:     'rgba(6,13,26,0.98)',
              borderColor:    `${colors.primary}30`,
              backdropFilter: 'blur(20px)',
              boxShadow:      `0 12px 40px rgba(0,0,0,0.7), 0 0 20px ${colors.primary}15`,
              padding:        '14px',
            }}
          >
            {/* Top accent */}
            <div
              className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
              style={{ background: `linear-gradient(90deg,transparent,${colors.primary}60,transparent)` }}
            />

            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[8px] font-mono tracking-[0.2em] uppercase mb-1"
                  style={{ color: colors.primary }}>
                  <ThreatLabel isPoison={isPoison} score={score} />
                </p>
                <p className="text-[11px] font-mono text-white/70 font-semibold">{label}</p>
              </div>
              {/* Similarity ring */}
              <svg width={40} height={40} viewBox="0 0 40 40">
                <circle cx={20} cy={20} r={16} fill="none"
                  stroke="rgba(255,255,255,0.05)" strokeWidth={3.5} />
                <motion.circle cx={20} cy={20} r={16} fill="none"
                  stroke={colors.primary} strokeWidth={3.5} strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 16}`}
                  initial={{ strokeDashoffset: 2 * Math.PI * 16 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 16 * (1 - score / 100) }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  transform="rotate(-90 20 20)"
                  style={{ filter: `drop-shadow(0 0 4px ${colors.primary}80)` }}
                />
                <text x={20} y={24} textAnchor="middle" fill={colors.primary}
                  fontSize={9} fontFamily="Orbitron,sans-serif" fontWeight={700}>
                  {score.toFixed(0)}
                </text>
              </svg>
            </div>

            {/* Content */}
            {content && (
              <div className="rounded-lg p-2.5 mb-3 border"
                style={{ background: `${colors.primary}06`, borderColor: `${colors.primary}12` }}>
                <p className="text-[10px] font-mono text-white/55 leading-relaxed">
                  {content.slice(0, 140)}{content.length > 140 ? '…' : ''}
                </p>
              </div>
            )}

            {/* Meta */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Database size={9} className="text-white/20" />
                <span className="text-[8px] font-mono text-white/30">{source}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
                className="text-[8px] font-mono text-white/20 hover:text-white/50 transition-colors"
              >
                CLOSE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
