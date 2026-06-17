/**
 * ReportGenerator.jsx — Incident Report Generator
 * ═════════════════════════════════════════════════
 * Phase 6 — Report Center
 *
 * Features:
 *   • Report type selector (single | batch | memory-poison | full-audit)
 *   • Date range picker to filter threat logs
 *   • Fetches matching threat log IDs from GET /logs
 *   • Generates PDF via POST /reports/generate
 *   • Lists previously generated reports (GET /reports)
 *   • PDF download via /api/v1/reports/{id}
 *   • Full loading, empty, error states
 *   • Cyberpunk SOC styling with GlassCard + NeonButton
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Download,
  RefreshCw,
  Calendar,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Shield,
  Database,
  Zap,
  ExternalLink,
} from 'lucide-react'

import GlassCard   from '@/components/shared/GlassCard.jsx'
import NeonButton  from '@/components/shared/NeonButton.jsx'
import { reportsAPI, logsAPI } from '@/services/api.js'
import { fmtTimestamp, fmtRelative } from '@/utils/formatters.js'

// ── Report type config ────────────────────────────────────────────────────────

const REPORT_TYPES = [
  {
    key:         'batch',
    label:       'Incident Summary',
    description: 'All threats in the selected date range',
    icon:        Layers,
    color:       '#00f5ff',
    filter:      {},
  },
  {
    key:         'single',
    label:       'Malicious Only',
    description: 'Confirmed malicious detections only',
    icon:        Shield,
    color:       '#ff2244',
    filter:      { is_malicious: true },
  },
  {
    key:         'memory_poison',
    label:       'Memory Poisoning',
    description: 'RAG memory poisoning attempts',
    icon:        Database,
    color:       '#b347ff',
    filter:      { is_memory_poison: true },
  },
  {
    key:         'full_audit',
    label:       'Full Audit',
    description: 'Complete log including safe prompts',
    icon:        FileText,
    color:       '#00ff88',
    filter:      {},
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoStr(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function fileSizeLabel(bytes) {
  if (!bytes) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeCard({ type, selected, onClick }) {
  const Icon = type.icon
  return (
    <motion.button
      onClick={() => onClick(type.key)}
      whileTap={{ scale: 0.97 }}
      className="relative w-full text-left rounded-xl border p-3 transition-all duration-200 focus:outline-none"
      style={{
        background:  selected ? `${type.color}0d` : 'rgba(255,255,255,0.02)',
        borderColor: selected ? `${type.color}40` : 'rgba(255,255,255,0.07)',
        boxShadow:   selected ? `0 0 16px ${type.color}12` : 'none',
      }}
    >
      {/* Selected indicator */}
      {selected && (
        <motion.div
          layoutId="type-pill"
          className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full"
          style={{ background: type.color, boxShadow: `0 0 6px ${type.color}` }}
        />
      )}

      <div className="flex items-start gap-2.5">
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
          style={{
            background: `${type.color}12`,
            border:     `1px solid ${type.color}25`,
          }}
        >
          <Icon size={14} style={{ color: type.color }} strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <p
            className="text-[11px] font-mono font-bold leading-none mb-1"
            style={{ color: selected ? type.color : 'rgba(255,255,255,0.60)' }}
          >
            {type.label}
          </p>
          <p className="text-[9px] font-mono text-white/25 leading-snug">
            {type.description}
          </p>
        </div>
      </div>
    </motion.button>
  )
}

function DateField({ label, value, onChange, max }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[8px] font-mono text-white/25 tracking-widest uppercase">
        {label}
      </span>
      <div className="relative">
        <Calendar
          size={11}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none"
        />
        <input
          type="date"
          value={value}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-7 pr-3 py-2 rounded-lg border text-[11px] font-mono text-white/70
                     bg-white/3 border-white/10 focus:border-cyan-neon/40 focus:outline-none
                     focus:bg-cyan-neon/5 transition-all duration-200"
          style={{ colorScheme: 'dark' }}
        />
      </div>
    </div>
  )
}

function ReportRow({ report, index }) {
  const downloadUrl = reportsAPI.getDownloadUrl(report.report_id)

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1,  x:  0 }}
      transition={{ duration: 0.22, delay: index * 0.05 }}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border mb-2 last:mb-0"
      style={{
        background:  'rgba(255,255,255,0.02)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.15)' }}
      >
        <FileText size={13} className="text-cyan-neon/60" strokeWidth={1.6} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono text-white/65 font-semibold truncate">
          {report.report_title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[8px] font-mono text-white/20">
            {report.report_type?.toUpperCase()}
          </span>
          <span className="text-white/10">·</span>
          <Clock size={8} className="text-white/15" />
          <span className="text-[8px] font-mono text-white/20">
            {report.created_at ? fmtRelative(report.created_at) : '—'}
          </span>
        </div>
      </div>

      {/* Download */}
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border
                   text-[9px] font-mono transition-all duration-200
                   hover:bg-cyan-neon/10 hover:border-cyan-neon/30 hover:text-cyan-neon"
        style={{
          background:  'rgba(0,245,255,0.04)',
          borderColor: 'rgba(0,245,255,0.15)',
          color:       'rgba(0,245,255,0.50)',
        }}
        title="Download PDF"
      >
        <Download size={10} />
        PDF
      </a>
    </motion.div>
  )
}

// ── Generate button loading animation ────────────────────────────────────────

function GeneratingOverlay() {
  const steps = [
    'Querying threat logs…',
    'Aggregating detections…',
    'Rendering PDF layout…',
    'Applying signatures…',
    'Finalizing report…',
  ]
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % steps.length), 900)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center gap-4 py-8"
    >
      {/* Animated radar ring */}
      <div className="relative w-16 h-16">
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: 'rgba(0,245,255,0.30)' }}
            animate={{ scale: [1, 1.6 + i * 0.3], opacity: [0.5, 0] }}
            transition={{
              duration: 1.4,
              delay:    i * 0.5,
              repeat:   Infinity,
              ease:     'easeOut',
            }}
          />
        ))}
        <motion.div
          className="absolute inset-0 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,245,255,0.07)', border: '1px solid rgba(0,245,255,0.25)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        >
          <Zap size={18} className="text-cyan-neon/70" />
        </motion.div>
      </div>

      {/* Scrolling step text */}
      <div className="h-5 overflow-hidden text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="text-[10px] font-mono text-cyan-neon/50 tracking-widest"
          >
            {steps[step]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg,#00f5ff,#b347ff)' }}
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  )
}

// ── Toast notification ────────────────────────────────────────────────────────

function Toast({ toast, onDismiss }) {
  const isError = toast.type === 'error'
  const color   = isError ? '#ff2244' : '#00ff88'
  const Icon    = isError ? AlertTriangle : CheckCircle2

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.97 }}
      animate={{ opacity: 1,  y:   0, scale: 1    }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3 px-4 py-3 rounded-xl border mb-4"
      style={{
        background:  `${color}08`,
        borderColor: `${color}25`,
        boxShadow:   `0 4px 20px ${color}10`,
      }}
    >
      <Icon size={13} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <p className="flex-1 text-[10px] font-mono text-white/60 leading-snug">
        {toast.message}
      </p>
      {toast.downloadUrl && (
        <a
          href={toast.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 flex items-center gap-1 text-[9px] font-mono transition-colors hover:opacity-80"
          style={{ color }}
        >
          <ExternalLink size={10} />
          DOWNLOAD
        </a>
      )}
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportGenerator() {
  const [reportType,  setReportType]  = useState('batch')
  const [dateFrom,    setDateFrom]    = useState(daysAgoStr(7))
  const [dateTo,      setDateTo]      = useState(todayStr())
  const [customTitle, setCustomTitle] = useState('')
  const [generating,  setGenerating]  = useState(false)
  const [reports,     setReports]     = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [toast,       setToast]       = useState(null)
  const toastTimer = useRef(null)

  const selectedType = REPORT_TYPES.find((t) => t.key === reportType)

  // ── Load existing reports ────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await reportsAPI.getReports()
      setReports(res.data ?? [])
    } catch (_) {
      setReports([])
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { loadReports() }, [loadReports])

  // ── Show toast helper ────────────────────────────────────────────────────
  const showToast = useCallback((type, message, downloadUrl = null) => {
    clearTimeout(toastTimer.current)
    setToast({ type, message, downloadUrl })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  // ── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      // 1. Fetch threat log IDs for the selected date range + type filter
      const params = {
        date_from: dateFrom,
        date_to:   dateTo,
        page_size: 500,
        ...(selectedType?.filter ?? {}),
      }
      const logsRes = await logsAPI.getLogs(params)
      const logs    = logsRes.data ?? logsRes.results ?? []

      if (!logs.length) {
        showToast('error', 'No threat logs found for the selected date range and report type.')
        return
      }

      const ids   = logs.map((l) => l.id)
      const title = customTitle.trim() ||
        `${selectedType?.label ?? 'Incident'} Report · ${dateFrom} → ${dateTo}`

      // 2. Generate PDF
      const res = await reportsAPI.generateReport(ids, title)
      const meta = res.data ?? {}

      showToast(
        'success',
        `Report generated: "${meta.report_title ?? title}" (${ids.length} events)`,
        reportsAPI.getDownloadUrl(meta.report_id),
      )

      // 3. Refresh list
      await loadReports()
    } catch (err) {
      showToast('error', err?.message ?? 'Failed to generate report. Please try again.')
    } finally {
      setGenerating(false)
    }
  }, [dateFrom, dateTo, reportType, customTitle, selectedType, loadReports, showToast])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Toast ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <Toast
            key="toast"
            toast={toast}
            onDismiss={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Main generator card ───────────────────────────────────── */}
      <GlassCard corners variant="cyan" padding="none">

        {/* Top accent bar */}
        <div
          className="h-px w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${selectedType?.color ?? '#00f5ff'}60, transparent)`,
          }}
        />

        <div className="p-5 space-y-5">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: `${selectedType?.color ?? '#00f5ff'}12`,
                border:     `1px solid ${selectedType?.color ?? '#00f5ff'}25`,
                boxShadow:  `0 0 14px ${selectedType?.color ?? '#00f5ff'}15`,
              }}
            >
              <FileText
                size={16}
                style={{ color: selectedType?.color ?? '#00f5ff' }}
                strokeWidth={1.6}
              />
            </div>
            <div>
              <h2 className="text-[13px] font-mono font-bold text-white/80 tracking-wide">
                Generate Incident Report
              </h2>
              <p className="text-[10px] font-mono text-white/25 mt-0.5">
                PDF · Signed · Exportable
              </p>
            </div>
          </div>

          {/* ── Report type grid ───────────────────────────────────── */}
          <div>
            <p className="text-[8px] font-mono text-white/20 tracking-widest uppercase mb-2.5">
              Report Type
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REPORT_TYPES.map((type) => (
                <TypeCard
                  key={type.key}
                  type={type}
                  selected={reportType === type.key}
                  onClick={setReportType}
                />
              ))}
            </div>
          </div>

          {/* ── Date range ────────────────────────────────────────── */}
          <div>
            <p className="text-[8px] font-mono text-white/20 tracking-widest uppercase mb-2.5">
              Date Range
            </p>
            <div className="grid grid-cols-2 gap-3">
              <DateField
                label="From"
                value={dateFrom}
                max={dateTo}
                onChange={setDateFrom}
              />
              <DateField
                label="To"
                value={dateTo}
                max={todayStr()}
                onChange={(v) => {
                  setDateTo(v)
                  if (v < dateFrom) setDateFrom(v)
                }}
              />
            </div>

            {/* Quick range pills */}
            <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
              {[
                { label: '24h',   days: 1  },
                { label: '7d',    days: 7  },
                { label: '30d',   days: 30 },
                { label: '90d',   days: 90 },
              ].map(({ label, days }) => (
                <button
                  key={label}
                  onClick={() => { setDateFrom(daysAgoStr(days)); setDateTo(todayStr()) }}
                  className="px-2.5 py-1 rounded-lg border text-[9px] font-mono transition-all duration-200
                             hover:bg-white/5 hover:border-white/20 hover:text-white/60"
                  style={{
                    background:  'rgba(255,255,255,0.02)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    color:       'rgba(255,255,255,0.30)',
                  }}
                >
                  {label}
                </button>
              ))}
              <span className="text-[8px] font-mono text-white/12 ml-1">
                {dateFrom} → {dateTo}
              </span>
            </div>
          </div>

          {/* ── Custom title ──────────────────────────────────────── */}
          <div>
            <p className="text-[8px] font-mono text-white/20 tracking-widest uppercase mb-2">
              Report Title <span className="text-white/12 normal-case">(optional)</span>
            </p>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={`${selectedType?.label ?? 'Incident'} Report · ${dateFrom} → ${dateTo}`}
              disabled={generating}
              className="w-full px-3 py-2 rounded-lg border text-[11px] font-mono text-white/65
                         placeholder:text-white/15 bg-white/3 border-white/10
                         focus:border-cyan-neon/40 focus:outline-none focus:bg-cyan-neon/5
                         transition-all duration-200 disabled:opacity-40"
            />
          </div>

          {/* ── Generate button ───────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {generating ? (
              <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <GeneratingOverlay />
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <NeonButton
                  variant="cyan"
                  size="lg"
                  icon={Zap}
                  full
                  onClick={handleGenerate}
                  disabled={!dateFrom || !dateTo}
                  pulse={false}
                >
                  Generate PDF Report
                </NeonButton>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </GlassCard>

      {/* ── Previous reports ──────────────────────────────────────── */}
      <GlassCard corners padding="none">
        <div className="p-5">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-white/30" />
              <span className="text-[11px] font-mono text-white/40 tracking-widest uppercase">
                Generated Reports
              </span>
              {reports.length > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[8px] font-mono font-bold"
                  style={{ background: 'rgba(0,245,255,0.10)', color: '#00f5ff', border: '1px solid rgba(0,245,255,0.20)' }}
                >
                  {reports.length}
                </span>
              )}
            </div>
            <button
              onClick={loadReports}
              disabled={loadingList}
              className="text-white/20 hover:text-white/50 transition-colors disabled:opacity-30"
              title="Refresh"
            >
              <motion.span
                animate={loadingList ? { rotate: 360 } : { rotate: 0 }}
                transition={loadingList ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : {}}
                style={{ display: 'inline-flex' }}
              >
                <RefreshCw size={12} />
              </motion.span>
            </button>
          </div>

          {/* List */}
          <AnimatePresence mode="wait">
            {loadingList ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-2 py-8">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <RefreshCw size={14} className="text-white/20" />
                </motion.div>
                <span className="text-[10px] font-mono text-white/15">Loading reports…</span>
              </motion.div>
            ) : reports.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center gap-3 py-10">
                <motion.div animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2.5, repeat: Infinity }}>
                  <FileText size={26} className="text-white/8" />
                </motion.div>
                <p className="text-[9px] font-mono text-white/15 tracking-widest text-center">
                  No reports generated yet.<br />Configure options above and click Generate.
                </p>
              </motion.div>
            ) : (
              <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="max-h-72 overflow-y-auto pr-0.5">
                {reports.map((r, i) => (
                  <ReportRow key={r.report_id} report={r} index={i} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </GlassCard>

    </div>
  )
}
