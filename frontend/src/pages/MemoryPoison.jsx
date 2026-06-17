/**
 * MemoryPoison.jsx — Memory Poisoning Visualization Page
 * ═══════════════════════════════════════════════════════
 * Phase 5 · Step 7
 *
 * Orchestrates all four memory-poisoning visualization components
 * into a single SOC page:
 *
 *  ┌────────────────────────────────────────────────────────────┐
 *  │  PageHeader  (Memory Poisoning · live badge)               │
 *  ├───────────────────────────────┬────────────────────────────┤
 *  │  DocumentInjectionPanel       │  PoisonedDocumentList      │
 *  │  (left col — inject + result) │  (right col — scan list)   │
 *  ├───────────────────────────────┴────────────────────────────┤
 *  │  VectorSimilarityChart  (full width)                       │
 *  ├────────────────────────────────────────────────────────────┤
 *  │  ThreatClusterGraph     (full width)                       │
 *  └────────────────────────────────────────────────────────────┘
 *
 * Quarantine events from PoisonedDocumentList are surfaced as a
 * transient toast notification at the top of the page.
 */

import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, ShieldAlert, CheckCircle2, X } from 'lucide-react'

import AnimatedPanel          from '@/components/shared/AnimatedPanel.jsx'
import PageHeader             from '@/components/layout/PageHeader.jsx'
import DocumentInjectionPanel from '@/components/vector/DocumentInjectionPanel.jsx'
import PoisonedDocumentList   from '@/components/vector/PoisonedDocumentList.jsx'
import VectorSimilarityChart  from '@/components/vector/VectorSimilarityChart.jsx'
import ThreatClusterGraph     from '@/components/vector/ThreatClusterGraph.jsx'

// ── Quarantine Toast ──────────────────────────────────────────────────────────

function QuarantineToast({ doc, onDismiss }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1,  y:   0, scale: 1    }}
      exit={{ opacity: 0, y: -10, scale: 0.96 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border mb-5"
      style={{
        background:  'rgba(255,34,68,0.08)',
        borderColor: 'rgba(255,34,68,0.25)',
        boxShadow:   '0 4px 24px rgba(255,34,68,0.10)',
      }}
    >
      <CheckCircle2 size={14} className="text-red-neon flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-mono text-white/60">
          Document quarantined:{' '}
          <span className="text-red-neon/80 font-bold truncate">
            {doc.doc_id}
          </span>
        </span>
      </div>
      <button
        onClick={onDismiss}
        className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0"
      >
        <X size={12} />
      </button>
    </motion.div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1,  y:  0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MemoryPoison() {
  const [toast, setToast] = useState(null)   // quarantined doc

  const handleQuarantine = useCallback((doc) => {
    setToast(doc)
    // auto-dismiss after 4 s
    setTimeout(() => setToast((prev) => (prev?.doc_id === doc.doc_id ? null : prev)), 4000)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  return (
    <AnimatedPanel variant="page" className="min-h-full">

      {/* ── Page header ─────────────────────────────────────────── */}
      <PageHeader
        title="Memory Poisoning"
        subtitle="Detect, visualize, and mitigate RAG memory poisoning attacks"
        icon={Brain}
        iconColor="#b347ff"
        badge={{ label: 'Live', variant: 'live' }}
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border"
            style={{
              background:  'rgba(179,71,255,0.06)',
              borderColor: 'rgba(179,71,255,0.20)',
            }}
          >
            <ShieldAlert size={11} style={{ color: '#b347ff' }} />
            <span className="text-[9px] font-mono text-purple-neon/70 tracking-widest">
              RAG MEMORY SHIELD
            </span>
          </div>
        }
      />

      {/* ── Quarantine toast ─────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <QuarantineToast key={toast.doc_id} doc={toast} onDismiss={dismissToast} />
        )}
      </AnimatePresence>

      {/* ── Row 1: Injection + Document list ────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">

        <Section delay={0.05}>
          <DocumentInjectionPanel />
        </Section>

        <Section delay={0.12}>
          <PoisonedDocumentList onQuarantine={handleQuarantine} />
        </Section>

      </div>

      {/* ── Row 2: Vector similarity chart ──────────────────────── */}
      <Section delay={0.20}>
        <div className="mb-5">
          <VectorSimilarityChart />
        </div>
      </Section>

      {/* ── Row 3: Cluster graph ─────────────────────────────────── */}
      <Section delay={0.28}>
        <ThreatClusterGraph />
      </Section>

    </AnimatedPanel>
  )
}
