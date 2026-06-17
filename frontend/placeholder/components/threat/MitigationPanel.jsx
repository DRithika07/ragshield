/**
 * MitigationPanel.jsx — Ordered mitigation recommendations
 * ══════════════════════════════════════════════════════════
 * Reads mitigation_steps from the detection result and
 * renders them as an animated ordered checklist.
 * Each step reveals sequentially with stagger.
 */

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Check, ChevronDown, ChevronUp, Copy, CheckCheck } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import { SEVERITY_MAP } from './ThreatSeverityBadge.jsx'

// Parse mitigation_steps — backend may return string or array
function parseSteps(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  // If it's a stringified Python list e.g. "['Step 1...', 'Step 2...']"
  try {
    const parsed = JSON.parse(raw.replace(/'/g, '"'))
    if (Array.isArray(parsed)) return parsed
  } catch (_) { /* ignore */ }
  // Otherwise split on newlines / numbered list pattern
  return raw
    .split(/\n|(?=Step \d+:)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4)
}

function MitigationStep({ step, index, checked, onToggle }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1,  x:   0 }}
      transition={{ duration: 0.3, delay: index * 0.08, ease: 'easeOut' }}
      className="flex items-start gap-3 group"
    >
      {/* Step number / check */}
      <button
        onClick={() => onToggle(index)}
        className="flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center mt-0.5 transition-all duration-200"
        style={{
          borderColor: checked ? 'rgba(0,255,136,0.5)'  : 'rgba(0,245,255,0.2)',
          background:  checked ? 'rgba(0,255,136,0.12)' : 'transparent',
        }}
      >
        <AnimatePresence mode="wait">
          {checked ? (
            <motion.span key="check"
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              <Check size={11} className="text-green-neon" />
            </motion.span>
          ) : (
            <span key="num" className="text-[9px] font-mono text-cyan-neon/40">
              {index + 1}
            </span>
          )}
        </AnimatePresence>
      </button>

      {/* Step text */}
      <p className={`text-[12px] font-mono leading-relaxed transition-colors duration-200 ${
        checked ? 'text-white/25 line-through' : 'text-white/65 group-hover:text-white/80'
      }`}>
        {/* Strip "Step N: " prefix if present */}
        {step.replace(/^Step\s+\d+:\s*/i, '')}
      </p>
    </motion.div>
  )
}

export default function MitigationPanel({ result }) {
  const [checkedSteps, setCheckedSteps] = useState(new Set())
  const [copied,       setCopied]       = useState(false)
  const [expanded,     setExpanded]     = useState(true)

  if (!result) return null

  const data      = result.data ?? result ?? {}
  const severity  = data.severity ?? 'NONE'
  const cfg       = SEVERITY_MAP[severity] ?? SEVERITY_MAP.NONE
  const rawSteps  = result.mitigation_steps ?? data.mitigation_steps
  const steps     = parseSteps(rawSteps)
  const isMal     = data.is_malicious || data.predicted_label === 1

  const toggleStep = (i) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const copyAll = () => {
    navigator.clipboard.writeText(steps.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const doneCount = checkedSteps.size
  const progress  = steps.length ? (doneCount / steps.length) * 100 : 0

  return (
    <GlassCard corners variant="green" className="flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-green-neon/70" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Mitigation
          </span>
          {steps.length > 0 && (
            <span className="text-[9px] font-mono text-white/25">
              ({doneCount}/{steps.length} done)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {steps.length > 0 && (
            <button
              onClick={copyAll}
              className="flex items-center gap-1 text-[9px] font-mono text-white/25 hover:text-green-neon/60 transition-colors"
            >
              {copied ? <CheckCheck size={10} className="text-green-neon" /> : <Copy size={10} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-white/25 hover:text-white/50 transition-colors"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {steps.length > 0 && (
        <div className="mb-4">
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
              style={{
                background: `linear-gradient(90deg, #00ff8880, #00ff88)`,
                boxShadow:  '0 0 6px rgba(0,255,136,0.4)',
              }}
            />
          </div>
        </div>
      )}

      {/* Steps list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden space-y-3"
          >
            {steps.length === 0 ? (
              <div className="py-4 text-center">
                {!isMal ? (
                  <p className="text-[11px] font-mono text-green-neon/50">
                    ✓ No mitigation required — prompt is safe.
                  </p>
                ) : (
                  <p className="text-[11px] font-mono text-white/20 italic">
                    Mitigation steps will appear here when the agent pipeline runs.
                  </p>
                )}
              </div>
            ) : (
              steps.map((step, i) => (
                <MitigationStep
                  key={i}
                  step={step}
                  index={i}
                  checked={checkedSteps.has(i)}
                  onToggle={toggleStep}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}
