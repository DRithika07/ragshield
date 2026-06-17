/**
 * Reports.jsx — Report Center Page
 * ══════════════════════════════════
 * Phase 6
 *
 * Orchestrates all three report components into a single SOC page:
 *
 *  ┌────────────────────────────────────────────────────────────┐
 *  │  PageHeader  (Report Center · PDF export badge)            │
 *  ├────────────────────────────────────────────────────────────┤
 *  │  IncidentSummaryCard  (full width — animated stat cards)   │
 *  ├───────────────────────────────┬────────────────────────────┤
 *  │  ReportGenerator              │  ReportHistory             │
 *  │  (left col — generate PDF)    │  (right col — history)     │
 *  └───────────────────────────────┴────────────────────────────┘
 */

import React from 'react'
import { motion } from 'framer-motion'
import { FileBarChart2, Download } from 'lucide-react'

import AnimatedPanel       from '@/components/shared/AnimatedPanel.jsx'
import PageHeader          from '@/components/layout/PageHeader.jsx'
import IncidentSummaryCard from '@/components/reports/IncidentSummaryCard.jsx'
import ReportGenerator     from '@/components/reports/ReportGenerator.jsx'
import ReportHistory       from '@/components/reports/ReportHistory.jsx'

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

export default function Reports() {
  return (
    <AnimatedPanel variant="page" className="min-h-full">

      {/* ── Page header ─────────────────────────────────────────── */}
      <PageHeader
        title="Report Center"
        subtitle="Generate, export, and review PDF incident reports"
        icon={FileBarChart2}
        iconColor="#00f5ff"
        badge={{ label: 'PDF Export', variant: 'info' }}
        actions={
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border"
            style={{
              background:  'rgba(0,245,255,0.06)',
              borderColor: 'rgba(0,245,255,0.18)',
            }}
          >
            <Download size={11} className="text-cyan-neon/60" />
            <span className="text-[9px] font-mono text-cyan-neon/60 tracking-widest">
              SIGNED · EXPORTABLE
            </span>
          </div>
        }
      />

      {/* ── Row 1: Incident summary stats ───────────────────────── */}
      <Section delay={0.05}>
        <div className="mb-5">
          <IncidentSummaryCard />
        </div>
      </Section>

      {/* ── Row 2: Generator + History ──────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Section delay={0.14}>
          <ReportGenerator />
        </Section>
        <Section delay={0.22}>
          <ReportHistory />
        </Section>
      </div>

    </AnimatedPanel>
  )
}
