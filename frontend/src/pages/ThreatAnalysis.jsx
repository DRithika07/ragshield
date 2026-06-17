/**
 * ThreatAnalysis.jsx — Complete threat analysis page
 * ════════════════════════════════════════════════════
 *
 * Layout (two columns once result is available):
 *
 *  ┌─────────────────────────────────────────────────┐
 *  │              PageHeader                         │
 *  ├─────────────────┬───────────────────────────────┤
 *  │ PromptAnalyzer  │  (empty — pre-analysis)        │
 *  │                 ├───────────────────────────────┤
 *  │ [on result]     │ ClassificationResult           │
 *  │                 │ AIExplanationPanel             │
 *  │                 │ MitigationPanel                │
 *  │                 │ SimilarPromptViewer            │
 *  └─────────────────┴───────────────────────────────┘
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Crosshair, Sparkles, AlertCircle } from 'lucide-react'

import AnimatedPanel       from '@/components/shared/AnimatedPanel.jsx'
import PageHeader          from '@/components/layout/PageHeader.jsx'
import PromptAnalyzer      from '@/components/threat/PromptAnalyzer.jsx'
import ClassificationResult from '@/components/threat/ClassificationResult.jsx'
import AIExplanationPanel  from '@/components/threat/AIExplanationPanel.jsx'
import MitigationPanel     from '@/components/threat/MitigationPanel.jsx'
import SimilarPromptViewer from '@/components/threat/SimilarPromptViewer.jsx'
import ThreatSeverityBadge from '@/components/threat/ThreatSeverityBadge.jsx'
import useSentinelStore    from '@/store/useSentinelStore.js'

// Empty-state prompt while waiting for first analysis
function WaitingState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-full py-16 gap-5"
    >
      {/* Animated crosshair rings */}
      <div className="relative w-20 h-20">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-cyan-neon/20"
            animate={{ scale: [1, 1.4 + i * 0.3], opacity: [0.4, 0] }}
            transition={{ duration: 2, delay: i * 0.5, repeat: Infinity, ease: 'easeOut' }}
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <Crosshair size={28} className="text-cyan-neon/40" />
        </div>
      </div>

      <div className="text-center max-w-xs">
        <p className="text-[13px] font-mono text-white/30 mb-1 tracking-wide">
          Enter a prompt and click Analyze
        </p>
        <p className="text-[10px] font-mono text-white/15 leading-relaxed">
          The detection pipeline will classify the prompt, explain the threat,
          and generate mitigation recommendations.
        </p>
      </div>

      {/* Feature chips */}
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        {['ML Classification','Vector Similarity','Gemini Explanation','Mitigation Steps'].map((f) => (
          <span
            key={f}
            className="px-3 py-1 rounded-full text-[9px] font-mono text-white/20 border border-white/8"
          >
            {f}
          </span>
        ))}
      </div>
    </motion.div>
  )
}

// Critical threat alert banner
function ThreatAlert({ severity, attackType }) {
  if (!severity || severity === 'NONE') return null
  const isHigh = severity === 'HIGH' || severity === 'CRITICAL'
  if (!isHigh) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1,  y:  0 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl mb-5 border border-red-neon/30 bg-red-neon/8"
    >
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      >
        <AlertCircle size={16} className="text-red-neon flex-shrink-0" />
      </motion.div>
      <div className="flex-1">
        <p className="text-[11px] font-mono font-bold text-red-neon tracking-wide">
          {severity} SEVERITY THREAT DETECTED
        </p>
        <p className="text-[10px] font-mono text-white/40 mt-0.5">
          Immediate review and mitigation recommended.
        </p>
      </div>
      <ThreatSeverityBadge severity={severity} size="xs" />
    </motion.div>
  )
}

export default function ThreatAnalysis() {
  const currentDetection = useSentinelStore((s) => s.currentDetection)
  const analysisRunning  = useSentinelStore((s) => s.analysisRunning)
  const hasResult        = !!currentDetection

  const data     = currentDetection?.data ?? {}
  const severity = data.severity ?? 'NONE'
  const isMal    = data.is_malicious || data.predicted_label === 1

  return (
    <AnimatedPanel variant="page" className="min-h-full">

      {/* Page header */}
      <PageHeader
        title="Threat Analysis"
        subtitle="Submit a prompt to the 4-agent detection pipeline"
        icon={Crosshair}
        iconColor="#ff2244"
        badge={
          analysisRunning ? { label: 'Analyzing…', variant: 'info'    } :
          hasResult && isMal ? { label: severity,  variant: 'critical' } :
          hasResult          ? { label: 'Safe',    variant: 'live'     } :
          undefined
        }
      />

      {/* Critical alert banner */}
      {hasResult && (
        <ThreatAlert severity={severity} attackType={data.attack_type} />
      )}

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ── Left column: input ────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <PromptAnalyzer />

          {/* Show classification result below input on mobile */}
          {hasResult && (
            <div className="lg:hidden">
              <ClassificationResult result={currentDetection} />
            </div>
          )}
        </div>

        {/* ── Right column: results ─────────────────────────────── */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {!hasResult && !analysisRunning ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <WaitingState />
              </motion.div>
            ) : (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {/* Classification result — hidden on mobile (shown below input) */}
                <div className="hidden lg:block">
                  <ClassificationResult result={currentDetection} />
                </div>

                {/* AI Explanation */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y:  0 }}
                  transition={{ duration: 0.35, delay: 0.15 }}
                >
                  <AIExplanationPanel result={currentDetection} />
                </motion.div>

                {/* Mitigation */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y:  0 }}
                  transition={{ duration: 0.35, delay: 0.25 }}
                >
                  <MitigationPanel result={currentDetection} />
                </motion.div>

                {/* Similar prompts */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y:  0 }}
                  transition={{ duration: 0.35, delay: 0.35 }}
                >
                  <SimilarPromptViewer result={currentDetection} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AnimatedPanel>
  )
}
