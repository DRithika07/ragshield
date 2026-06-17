/**
 * ReportHistory.jsx — Generated Report History
 * ══════════════════════════════════════════════
 * Phase 6 — Report Center
 *
 * Features:
 *   • Reads reports[] + reportsLoading from Zustand store
 *   • Auto-fetches on mount if list is empty
 *   • Search by title or file name (debounced)
 *   • Filter by report type: all | single | batch | memory_poison | full_audit
 *   • Sort by date (newest / oldest)
 *   • Status badge per report type
 *   • Download PDF button (direct link to /api/v1/reports/{id})
 *   • Animated list entrance, staggered rows
 *   • Skeleton shimmer while loading
 *   • Empty state with helpful prompt
 */

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  Download,
  Search,
  RefreshCw,
  Clock,
  Layers,
  Shield,
  Database,
  FileBarChart2,
  ChevronDown,
  X,
  SortAsc,
  SortDesc,
} from 'lucide-react'

import useSentinelStore from '@/store/useSentinelStore.js'
import { reportsAPI }   from '@/services/api.js'
import { fmtRelative, fmtTimestamp } from '@/utils/formatters.js'

// ── Report-type config ────────────────────────────────────────────────────────

const TYPE_CFG = {
  single: {
    label: 'Malicious Only',
    color: '#ff2244',
    bg:    'rgba(255,34,68,0.10)',
    border:'rgba(255,34,68,0.25)',
    Icon:  Shield,
  },
  batch: {
    label: 'Incident Summary',
    color: '#00f5ff',
    bg:    'rgba(0,245,255,0.08)',
    border:'rgba(0,245,255,0.22)',
    Icon:  Layers,
  },
  memory_poison: {
    label: 'Memory Poisoning',
    color: '#b347ff',
    bg:    'rgba(179,71,255,0.10)',
    border:'rgba(179,71,255,0.25)',
    Icon:  Database,
  },
  full_audit: {
    label: 'Full Audit',
    color: '#00ff88',
    bg:    'rgba(0,255,136,0.08)',
    border:'rgba(0,255,136,0.20)',
    Icon:  FileBarChart2,
  },
}

const DEFAULT_TYPE = {
  label: 'Report',
  color: '#00f5ff',
  bg:    'rgba(0,245,255,0.06)',
  border:'rgba(0,245,255,0.15)',
  Icon:  FileText,
}

function typeCfg(key) {
  return TYPE_CFG[key] ?? DEFAULT_TYPE
}

// Filter tab keys
const FILTER_TABS = [
  { key: 'all',          label: 'All'        },
  { key: 'batch',        label: 'Summary'    },
  { key: 'single',       label: 'Malicious'  },
  { key: 'memory_poison',label: 'Mem Poison' },
  { key: 'full_audit',   label: 'Full Audit' },
]

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce(value, delay = 280) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

// ── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ i }) {
  return (
    <motion.div
      className="flex items-center gap-3 px-4 py-3 rounded-xl border mb-2"
      style={{
        background:  'rgba(255,255,255,0.02)',
        borderColor: 'rgba(255,255,255,0.05)',
      }}
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.5, delay: i * 0.1, repeat: Infinity }}
    >
      <div className="w-9 h-9 rounded-xl bg-white/5 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="w-48 h-3 rounded-full bg-white/5" />
        <div className="w-28 h-2 rounded-full bg-white/3" />
      </div>
      <div className="w-16 h-6 rounded-lg bg-white/4 flex-shrink-0" />
      <div className="w-20 h-7 rounded-lg bg-white/4 flex-shrink-0" />
    </motion.div>
  )
}

// ── Report row ────────────────────────────────────────────────────────────────

function ReportRow({ report, index }) {
  const cfg         = typeCfg(report.report_type)
  const Icon        = cfg.Icon
  const downloadUrl = reportsAPI.getDownloadUrl(report.report_id)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1,  y:  0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.24, delay: index * 0.04, ease: 'easeOut' }}
      className="group flex items-center gap-3 px-4 py-3 rounded-xl border mb-2 last:mb-0
                 transition-all duration-200 hover:border-white/12 hover:bg-white/2"
      style={{
        background:  'rgba(255,255,255,0.015)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      {/* Type icon */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
        style={{
          background: cfg.bg,
          border:     `1px solid ${cfg.border}`,
        }}
      >
        <Icon size={14} style={{ color: cfg.color }} strokeWidth={1.7} />
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono font-semibold text-white/65 truncate leading-none mb-1">
          {report.report_title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type badge */}
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[7px] font-mono font-bold tracking-widest uppercase"
            style={{
              background:  cfg.bg,
              border:      `1px solid ${cfg.border}`,
              color:       cfg.color,
            }}
          >
            {cfg.label}
          </span>

          {/* Filename */}
          <span className="text-[8px] font-mono text-white/20 truncate hidden sm:block">
            {report.file_name}
          </span>

          {/* Timestamp */}
          <div className="flex items-center gap-1">
            <Clock size={8} className="text-white/15 flex-shrink-0" />
            <span className="text-[8px] font-mono text-white/20">
              {report.created_at ? fmtRelative(report.created_at) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Full timestamp (md+) */}
      <div className="hidden lg:block flex-shrink-0 text-right">
        <p className="text-[8px] font-mono text-white/20">
          {report.created_at ? fmtTimestamp(report.created_at) : '—'}
        </p>
      </div>

      {/* Download button */}
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border
                   text-[9px] font-mono transition-all duration-200
                   hover:shadow-[0_0_12px_rgba(0,245,255,0.20)]"
        style={{
          background:  'rgba(0,245,255,0.05)',
          borderColor: 'rgba(0,245,255,0.18)',
          color:       'rgba(0,245,255,0.60)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background  = 'rgba(0,245,255,0.12)'
          e.currentTarget.style.borderColor = 'rgba(0,245,255,0.40)'
          e.currentTarget.style.color       = '#00f5ff'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background  = 'rgba(0,245,255,0.05)'
          e.currentTarget.style.borderColor = 'rgba(0,245,255,0.18)'
          e.currentTarget.style.color       = 'rgba(0,245,255,0.60)'
        }}
        title={`Download ${report.file_name}`}
      >
        <Download size={11} />
        <span>PDF</span>
      </a>
    </motion.div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ isFiltered }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center gap-4 py-14"
    >
      <motion.div
        animate={{ opacity: [0.15, 0.40, 0.15] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      >
        <FileText size={32} className="text-white/10" />
      </motion.div>
      <div className="text-center">
        <p className="text-[11px] font-mono text-white/20 tracking-wide mb-1">
          {isFiltered ? 'No reports match your search' : 'No reports generated yet'}
        </p>
        <p className="text-[9px] font-mono text-white/12">
          {isFiltered
            ? 'Try a different keyword or filter'
            : 'Use the Report Generator above to create your first PDF report'}
        </p>
      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportHistory() {
  const reports       = useSentinelStore((s) => s.reports)
  const reportsLoading= useSentinelStore((s) => s.reportsLoading)
  const fetchReports  = useSentinelStore((s) => s.fetchReports)

  const [query,    setQuery]    = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortDesc, setSortDesc] = useState(true)
  const [showFilter, setShowFilter] = useState(false)
  const inputRef = useRef(null)

  const debouncedQuery = useDebounce(query)

  // Auto-fetch on mount
  useEffect(() => {
    if (!reports.length && !reportsLoading) fetchReports()
  }, [])

  // Filtered + sorted list
  const visible = useMemo(() => {
    let list = [...reports]

    if (typeFilter !== 'all') {
      list = list.filter((r) => r.report_type === typeFilter)
    }

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase()
      list = list.filter(
        (r) =>
          r.report_title?.toLowerCase().includes(q) ||
          r.file_name?.toLowerCase().includes(q)
      )
    }

    list.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return sortDesc ? tb - ta : ta - tb
    })

    return list
  }, [reports, typeFilter, debouncedQuery, sortDesc])

  const isFiltered  = typeFilter !== 'all' || debouncedQuery.trim().length > 0
  const activeType  = FILTER_TABS.find((t) => t.key === typeFilter)

  const clearSearch = useCallback(() => {
    setQuery('')
    inputRef.current?.focus()
  }, [])

  return (
    <div className="glass-panel p-5 flex flex-col gap-4 corner-brackets">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(0,245,255,0.08)',
              border:     '1px solid rgba(0,245,255,0.18)',
            }}
          >
            <Clock size={13} className="text-cyan-neon/60" strokeWidth={1.7} />
          </div>
          <div>
            <h3 className="text-[12px] font-mono font-bold text-white/70 tracking-wide">
              Report History
            </h3>
            <p className="text-[8px] font-mono text-white/20 mt-0.5">
              {reports.length} report{reports.length !== 1 ? 's' : ''} generated
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort toggle */}
          <button
            onClick={() => setSortDesc((v) => !v)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[8px] font-mono
                       transition-all duration-200 hover:bg-white/5"
            style={{
              background:  'transparent',
              borderColor: 'rgba(255,255,255,0.08)',
              color:       'rgba(255,255,255,0.28)',
            }}
            title={sortDesc ? 'Newest first' : 'Oldest first'}
          >
            {sortDesc
              ? <SortDesc size={11} />
              : <SortAsc  size={11} />
            }
            <span className="hidden sm:inline">{sortDesc ? 'Newest' : 'Oldest'}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={fetchReports}
            disabled={reportsLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-mono
                       transition-all duration-200 hover:bg-white/5 disabled:opacity-30"
            style={{
              background:  'transparent',
              borderColor: 'rgba(255,255,255,0.08)',
              color:       'rgba(255,255,255,0.28)',
            }}
          >
            <motion.span
              animate={reportsLoading ? { rotate: 360 } : { rotate: 0 }}
              transition={
                reportsLoading
                  ? { duration: 0.8, repeat: Infinity, ease: 'linear' }
                  : { duration: 0 }
              }
              style={{ display: 'inline-flex' }}
            >
              <RefreshCw size={11} />
            </motion.span>
            <span className="hidden sm:inline">REFRESH</span>
          </button>
        </div>
      </div>

      {/* ── Search bar ──────────────────────────────────────────── */}
      <div className="relative">
        <Search
          size={12}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or filename…"
          className="w-full pl-8 pr-8 py-2 rounded-xl border text-[11px] font-mono text-white/65
                     placeholder:text-white/15 bg-white/3 border-white/8
                     focus:border-cyan-neon/35 focus:outline-none focus:bg-cyan-neon/4
                     transition-all duration-200"
        />
        <AnimatePresence>
          {query && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
            >
              <X size={12} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Filter tabs ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-xl border border-white/6 p-1 bg-white/2 overflow-x-auto">
        {FILTER_TABS.map(({ key, label }) => {
          const active = typeFilter === key
          const cfg    = TYPE_CFG[key]
          return (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-mono tracking-wide
                         transition-all duration-200 whitespace-nowrap"
              style={{
                background:  active ? (cfg ? `${cfg.color}10` : 'rgba(0,245,255,0.10)') : 'transparent',
                color:       active ? (cfg ? cfg.color : '#00f5ff') : 'rgba(255,255,255,0.28)',
                border:      active
                  ? `1px solid ${cfg ? cfg.border : 'rgba(0,245,255,0.25)'}`
                  : '1px solid transparent',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Result count ────────────────────────────────────────── */}
      {!reportsLoading && (isFiltered || reports.length > 0) && (
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-mono text-white/18">
            {visible.length} of {reports.length} report{reports.length !== 1 ? 's' : ''}
            {isFiltered && (
              <button
                onClick={() => { setQuery(''); setTypeFilter('all') }}
                className="ml-2 text-cyan-neon/40 hover:text-cyan-neon/70 transition-colors"
              >
                Clear filters
              </button>
            )}
          </span>
        </div>
      )}

      {/* ── List ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto max-h-[520px] pr-0.5">
        <AnimatePresence mode="wait">
          {reportsLoading ? (
            <motion.div key="skeletons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} i={i} />
              ))}
            </motion.div>
          ) : visible.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EmptyState isFiltered={isFiltered} />
            </motion.div>
          ) : (
            <motion.div key={`list-${typeFilter}-${sortDesc}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {visible.map((report, i) => (
                <ReportRow key={report.report_id} report={report} index={i} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer legend ───────────────────────────────────────── */}
      {reports.length > 0 && (
        <div className="flex items-center gap-4 pt-3 border-t border-white/5 flex-wrap">
          {Object.entries(TYPE_CFG).map(([key, cfg]) => {
            const count = reports.filter((r) => r.report_type === key).length
            if (!count) return null
            return (
              <div key={key} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: cfg.color, boxShadow: `0 0 4px ${cfg.color}80` }}
                />
                <span className="text-[8px] font-mono text-white/25">
                  {cfg.label} ({count})
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
