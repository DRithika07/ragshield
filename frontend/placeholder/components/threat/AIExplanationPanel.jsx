/**
 * AIExplanationPanel.jsx — Gemini AI threat explanation viewer
 * ═════════════════════════════════════════════════════════════
 * Renders the ai_explanation from the backend with a
 * typewriter reveal effect. Shows attack technique,
 * security impact, and model attribution.
 */

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Sparkles, AlertTriangle, Eye } from 'lucide-react'
import GlassCard from '@/components/shared/GlassCard.jsx'
import { SEVERITY_MAP } from './ThreatSeverityBadge.jsx'
import { fmtAttackType } from '@/utils/formatters.js'

// Typewriter effect hook
function useTypewriter(text, speed = 18, enabled = true) {
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!text || !enabled) { setDisplayed(text ?? ''); return }
    setDisplayed('')
    indexRef.current = 0

    const tick = () => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1))
        indexRef.current++
        timerRef.current = setTimeout(tick, speed)
      }
    }
    timerRef.current = setTimeout(tick, 80)   // small initial delay
    return () => clearTimeout(timerRef.current)
  }, [text, enabled, speed])

  return displayed
}

function AttackTechniqueCard({ attackType, severity }) {
  const cfg = SEVERITY_MAP[severity] ?? SEVERITY_MAP.NONE

  const TECHNIQUES = {
    jailbreak: {
      technique: 'Instruction Override via Persona Manipulation',
      impact:    'Bypasses safety alignment — model follows attacker's instructions instead of operator's.',
    },
    prompt_injection: {
      technique: 'Adversarial Command Embedding',
      impact:    'Hijacks model instruction processing; can override system-level directives.',
    },
    role_hijacking: {
      technique: 'Identity Reassignment Attack',
      impact:    'Redefines model operational persona, bypassing established security boundaries.',
    },
    data_extraction: {
      technique: 'Knowledge Exfiltration via Prompt Engineering',
      impact:    'Attempts to elicit confidential training data, system prompts, or internal knowledge.',
    },
    indirect_injection: {
      technique: 'Indirect Injection via Retrieved Context',
      impact:    'Embeds adversarial instructions in documents retrieved by the RAG pipeline.',
    },
  }

  const info = TECHNIQUES[attackType] ?? {
    technique: 'Unknown Attack Vector',
    impact:    'Classified as adversarial based on semantic similarity to known attack patterns.',
  }

  return (
    <div
      className="rounded-xl p-4 mb-4 border"
      style={{
        background:  `${cfg.color}06`,
        borderColor: `${cfg.color}18`,
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Eye size={10} style={{ color: cfg.color }} />
            <span className="text-[9px] font-mono tracking-widest text-white/30 uppercase">Technique</span>
          </div>
          <p className="text-[11px] font-mono text-white/65 leading-snug">{info.technique}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={10} className="text-amber-neon/60" />
            <span className="text-[9px] font-mono tracking-widest text-white/30 uppercase">Security Impact</span>
          </div>
          <p className="text-[11px] font-mono text-white/65 leading-snug">{info.impact}</p>
        </div>
      </div>
    </div>
  )
}

export default function AIExplanationPanel({ result }) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (result?.ai_explanation) {
      const t = setTimeout(() => setRevealed(true), 300)
      return () => clearTimeout(t)
    }
    setRevealed(false)
  }, [result?.ai_explanation])

  const data        = result?.data ?? result ?? {}
  const explanation = result?.ai_explanation ?? data.ai_explanation
  const severity    = data.severity   ?? 'NONE'
  const attackType  = data.attack_type ?? 'unknown'
  const cfg         = SEVERITY_MAP[severity] ?? SEVERITY_MAP.NONE

  const displayedText = useTypewriter(explanation ?? '', 14, revealed)
  const isMal = data.is_malicious || data.predicted_label === 1

  if (!result) return null

  return (
    <GlassCard corners variant="purple" className="h-full flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Brain size={15} className="text-purple-neon" />
          </motion.div>
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            AI Analysis
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-purple-neon/20 bg-purple-neon/5">
          <Sparkles size={9} className="text-purple-neon/60" />
          <span className="text-[9px] font-mono text-purple-neon/60">Gemini 1.5 Flash</span>
        </div>
      </div>

      {/* Attack technique info */}
      {isMal && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <AttackTechniqueCard attackType={attackType} severity={severity} />
        </motion.div>
      )}

      {/* Explanation text */}
      <div
        className="flex-1 rounded-xl p-4 border min-h-[100px]"
        style={{
          background:  'rgba(6,13,26,0.6)',
          borderColor: 'rgba(179,71,255,0.12)',
        }}
      >
        <p className="text-[9px] font-mono text-purple-neon/40 tracking-widest uppercase mb-3">
          Threat Explanation
        </p>

        <AnimatePresence mode="wait">
          {!explanation ? (
            <motion.div
              key="no-explanation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              {/* Safe message */}
              {!isMal ? (
                <p className="text-[12px] font-mono text-green-neon/60 leading-relaxed">
                  ✓ This prompt was classified as safe. No adversarial patterns detected.
                </p>
              ) : (
                <p className="text-[12px] font-mono text-white/25 italic">
                  Gemini explanation not available — ensure GEMINI_API_KEY is configured and run_agents=true.
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="explanation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-[12px] font-mono text-white/70 leading-relaxed whitespace-pre-wrap">
                {displayedText}
                {/* Blinking cursor while typing */}
                {displayedText.length < (explanation?.length ?? 0) && (
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                    className="inline-block w-0.5 h-3 bg-purple-neon ml-0.5 align-middle"
                  />
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  )
}
