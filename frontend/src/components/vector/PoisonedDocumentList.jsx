/**
 * PoisonedDocumentList.jsx — RAG Memory Poison Scanner
 * ═════════════════════════════════════════════════════
 * Fetches all documents from RAG memory (GET /rag/memory) and
 * triggers a full poison scan (POST /rag/scan).
 *
 * Features:
 *   • Memory overview: total / poisoned / flagged / clean counts
 *   • Scan trigger with animated progress indicator
 *   • Sortable, filterable document list (status: all | blocked | flagged | clean)
 *   • Per-row poison score bar + status badge
 *   • Expandable row for full content preview
 *   • Quarantine action (visual — emits callback for parent use)
 *   • Empty and loading states
 *
 * Data shapes (from backend response.py):
 *   RAGDocumentResult {
 *     doc_id, content_preview, source,
 *     is_poisoned, poison_score, poison_status,  // "blocked"|"flagged"|"clean"
 *     created_at
 *   }
 *   RAGScanResponse {
 *     total_documents, poisoned_count, flagged_count, clean_count,
 *     results: RAGDocumentResult[]
 *   }
 */

import React, { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { fmtTruncate, fmtRelative, fmtTimestamp } from '@/utils/formatters.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  blocked: {
    label:  'BLOCKED',
    color:  '#ff2244',
    bg:     'rgba(255,34,68,0.10)',
    border: 'rgba(255,34,68,0.25)',
    Icon:   ShieldOff,
  },
  flagged: {
    label:  'FLAGGED',
    color:  '#ffaa00',
    bg:     'rgba(255,170,0,0.10)',
    border: 'rgba(255,170,0,0.25)',
    Icon:   ShieldAlert,
  },
  clean: {
    label:  'CLEAN',
    color:  '#00ff88',
    bg:     'rgba(0,255,136,0.08)',
    border: 'rgba(0,255,136,0.20)',
    Icon:   ShieldCheck,
  },
}

const FILTER_TABS = [
  { key: 'all',     label: 'All'     },
  { key: 'blocked', label: 'Blocked' },
  { key: 'flagged', label: 'Flagged' },
  { key: 'clean',   label: 'Clean'   },
]

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGetMemory() {
  try {
    const { default: api } = await import('@/services/api.js')
    const res = await api.get('/rag/memory')
    // GET /rag/memory returns { success, total, documents: [...] }
    const docs = res.documents ?? res.results ?? []
    return docs.map((d) => ({
      doc_id:          d.doc_id ?? d.id ?? String(Math.random()),
      content_preview: d.content_preview ?? d.content ?? '',
      source:          d.source ?? 'unknown',
      is_poisoned:     d.is_poisoned ?? false,
      poison_score:    d.poison_score ?? null,
      poison_status:   d.poison_status ?? (d.is_poisoned ? 'flagged' : 'clean'),
      created_at:      d.created_at ?? null,
    }))
  } catch (_) {
    return []
  }
}

async function apiScan(threshold = 0.7) {
  try {
    const { default: api } = await import('@/services/api.js')
    const res = await api.post('/rag/scan', { similarity_threshold: threshold })
    return {
      total_documents: res.total_documents ?? 0,
      poisoned_count:  res.poisoned_count  ?? 0,
      flagged_count:   res.flagged_count   ?? 0,
      clean_count:     res.clean_count     ?? 0,
      results:         (res.results ?? []).map((d) => ({
        doc_id:          d.doc_id,
        content_preview: d.content_preview ?? '',
        source:          d.source ?? 'unknown',
        is_poisoned:     d.is_poisoned ?? false,
        poison_score:    d.poison_score ?? null,
        poison_status:   d.poison_status ?? 'clean',
        created_at:      d.created_at ?? null,
      })),
    }
  } catch (_) {
    return null
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ value, label, color, pulse = false }) {
  return (
    <div
      className="flex flex-col items-center px-4 py-2 rounded-xl border"
      style={{
        background:  `${color}08`,
        borderColor: `${color}20`,
        minWidth:    64,
      }}
    >
      <span
        className={`text-[18px] font-display font-bold tabular-nums leading-none mb-0.5 ${pulse ? 'animate-neon-pulse' : ''}`}
        style={{ color, textShadow: `0 0 12px ${color}60` }}
      >
        {value}
      </span>
      <span className="text-[8px] font-mono text-white/25 tracking-widest uppercase">
        {label}
      </span>
    </div>
  )
}

function PoisonScoreBar({ score }) {
  if (score == null) {
    return (
      <span className="text-[9px] font-mono text-white/20">—</span>
    )
  }
  const pct   = Math.round(score * 100)
  const color = pct >= 80 ? '#ff2244' : pct >= 50 ? '#ffaa00' : '#00ff88'

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            background: color,
            boxShadow:  `0 0 4px ${color}80`,
          }}
        />
      </div>
      <span
        className="text-[9px] font-mono font-bold tabular-nums w-8 text-right"
        style={{ color }}
      >
        {pct}%
      </span>
    </div>
  )
}

function StatusBadge({ status }) {
  const cfg  = STATUS_CFG[status] ?? STATUS_CFG.clean
  const Icon = cfg.Icon
  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border"
      style={{
        background:  cfg.bg,
        borderColor: cfg.border,
      }}
    >
      <Icon size={9} style={{ color: cfg.color }} strokeWidth={2} />
      <span
        className="text-[8px] font-mono font-bold tracking-widest"
        style={{ color: cfg.color }}
      >
        {cfg.label}
      </span>
    </div>
  )
}

function DocRow({ doc, index, onQuarantine }) {
  const [expanded, setExpanded] = useState(false)
  const cfg     = STATUS_CFG[doc.poison_status] ?? STATUS_CFG.clean
  const isBad   = doc.poison_status === 'blocked' || doc.poison_status === 'flagged'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1,  y:  0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: 'easeOut' }}
      className="rounded-xl border mb-2 last:mb-0 overflow-hidden"
      style={{
        background:  isBad ? `${cfg.color}05` : 'rgba(255,255,255,0.02)',
        borderColor: isBad ? `${cfg.color}20` : 'rgba(255,255,255,0.06)',
      }}
    >
      {/* ── Main row ── */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Status icon */}
        <div
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${cfg.color}12`, border: `1px solid ${cfg.color}25` }}
        >
          <cfg.Icon size={12} style={{ color: cfg.color }} strokeWidth={1.8} />
        </div>

        {/* Doc ID + source */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/70 font-semibold truncate">
              {doc.doc_id}
            </span>
            <StatusBadge status={doc.poison_status} />
          </div>
          <p className="text-[9px] font-mono text-white/30 truncate mt-0.5">
            {fmtTruncate(doc.content_preview, 60)}
          </p>
        </div>

        {/* Score bar */}
        <div className="hidden sm:block flex-shrink-0 w-28">
          <PoisonScoreBar score={doc.poison_score} />
        </div>

        {/* Timestamp */}
        <div className="hidden md:flex items-center gap-1 flex-shrink-0 w-20">
          <Clock size={8} className="text-white/15" />
          <span className="text-[8px] font-mono text-white/20 truncate">
            {doc.created_at ? fmtRelative(doc.created_at) : '—'}
          </span>
        </div>

        {/* Quarantine button (blocked/flagged only) */}
        {isBad && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuarantine(doc) }}
            className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border text-[8px] font-mono transition-all duration-200 hover:opacity-80"
            style={{
              background:  'rgba(255,34,68,0.08)',
              borderColor: 'rgba(255,34,68,0.25)',
              color:       '#ff2244',
            }}
            title="Quarantine document"
          >
            <Trash2 size={9} />
            <span className="hidden sm:inline">QUARANTINE</span>
          </button>
        )}

        {/* Expand chevron */}
        <div className="flex-shrink-0 text-white/20">
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </div>

      {/* ── Expanded content ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="px-3 pb-3 pt-0 border-t"
              style={{ borderColor: `${cfg.color}12` }}
            >
              {/* Content preview */}
              <div
                className="rounded-lg p-2.5 mt-2.5 mb-3 border"
                style={{
                  background:  'rgba(0,0,0,0.25)',
                  borderColor: 'rgba(255,255,255,0.05)',
                }}
              >
                <p className="text-[10px] font-mono text-white/55 leading-relaxed break-words">
                  {doc.content_preview || '— no preview available —'}
                </p>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Source',      value: doc.source },
                  { label: 'Poison Score',value: doc.poison_score != null ? `${Math.round(doc.poison_score * 100)}%` : '—' },
                  { label: 'Status',      value: doc.poison_status?.toUpperCase() ?? '—' },
                  { label: 'Ingested',    value: doc.created_at ? fmtTimestamp(doc.created_at) : '—' },
                ].map(({ label, value }) => (
                  <div key={label}
                    className="rounded-lg px-2.5 py-2 border"
                    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}
                  >
                    <p className="text-[7px] font-mono text-white/20 tracking-widest uppercase mb-0.5">
                      {label}
                    </p>
                    <p className="text-[10px] font-mono text-white/55 truncate">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function EmptyState({ filter }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <motion.div
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Database size={28} className="text-white/10" />
      </motion.div>
      <p className="text-[10px] font-mono text-white/15 tracking-widest text-center">
        {filter === 'all'
          ? 'No documents in RAG memory.\nLoad memory or run a scan.'
          : `No ${filter} documents found.`}
      </p>
    </div>
  )
}

function ScanProgress() {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="relative flex items-center justify-center">
        {/* Outer ring */}
        <motion.div
          className="absolute w-16 h-16 rounded-full border-2"
          style={{ borderColor: 'rgba(255,34,68,0.25)' }}
          animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.div
          className="w-10 h-10 rounded-full border-2 border-red-neon/40 flex items-center justify-center"
          style={{ background: 'rgba(255,34,68,0.08)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        >
          <ScanLine size={16} className="text-red-neon/70" />
        </motion.div>
      </div>
      <div className="text-center">
        <p className="text-[11px] font-mono text-white/40 tracking-widest">
          SCANNING MEMORY…
        </p>
        <motion.p
          className="text-[8px] font-mono text-white/15 mt-1"
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          Checking vector embeddings for anomalies
        </motion.p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PoisonedDocumentList({ onQuarantine }) {
  const [docs,       setDocs]       = useState([])
  const [scanStats,  setScanStats]  = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [scanning,   setScanning]   = useState(false)
  const [filter,     setFilter]     = useState('all')
  const [sortBy,     setSortBy]     = useState('score') // 'score' | 'time' | 'status'
  const [loaded,     setLoaded]     = useState(false)
  const [quarantined,setQuarantined]= useState(new Set())

  // ── Load memory ──────────────────────────────────────────────────────────
  const loadMemory = useCallback(async () => {
    setLoading(true)
    setLoaded(false)
    const data = await apiGetMemory()
    setDocs(data)
    setScanStats(null)
    setLoaded(true)
    setLoading(false)
  }, [])

  // ── Run scan ─────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setScanning(true)
    const result = await apiScan()
    if (result) {
      setDocs(result.results)
      setScanStats({
        total:    result.total_documents,
        poisoned: result.poisoned_count,
        flagged:  result.flagged_count,
        clean:    result.clean_count,
      })
    }
    setLoaded(true)
    setScanning(false)
  }, [])

  // ── Quarantine ───────────────────────────────────────────────────────────
  const handleQuarantine = useCallback((doc) => {
    setQuarantined((prev) => new Set([...prev, doc.doc_id]))
    onQuarantine?.(doc)
  }, [onQuarantine])

  // ── Derived list ─────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    let list = docs.filter((d) => !quarantined.has(d.doc_id))

    if (filter !== 'all') {
      list = list.filter((d) => d.poison_status === filter)
    }

    list = [...list].sort((a, b) => {
      if (sortBy === 'score') {
        return (b.poison_score ?? -1) - (a.poison_score ?? -1)
      }
      if (sortBy === 'time') {
        return (b.created_at ?? '') > (a.created_at ?? '') ? 1 : -1
      }
      // status: blocked > flagged > clean
      const order = { blocked: 0, flagged: 1, clean: 2 }
      return (order[a.poison_status] ?? 3) - (order[b.poison_status] ?? 3)
    })

    return list
  }, [docs, filter, sortBy, quarantined])

  // Summary counts from visible docs (or scan stats)
  const counts = useMemo(() => {
    if (scanStats) return scanStats
    const list = docs.filter((d) => !quarantined.has(d.doc_id))
    return {
      total:    list.length,
      poisoned: list.filter((d) => d.poison_status === 'blocked').length,
      flagged:  list.filter((d) => d.poison_status === 'flagged').length,
      clean:    list.filter((d) => d.poison_status === 'clean').length,
    }
  }, [docs, scanStats, quarantined])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="glass-panel p-5 flex flex-col gap-4 corner-brackets">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-cyan-neon/70" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Poisoned Documents
          </span>
          {quarantined.size > 0 && (
            <span className="text-[8px] font-mono text-red-neon/50">
              · {quarantined.size} quarantined
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={loadMemory}
            disabled={loading || scanning}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-mono transition-all duration-200 disabled:opacity-40"
            style={{
              background:  'rgba(0,245,255,0.06)',
              borderColor: 'rgba(0,245,255,0.20)',
              color:       '#00f5ff',
            }}
          >
            <motion.span
              animate={loading ? { rotate: 360 } : { rotate: 0 }}
              transition={loading
                ? { duration: 0.9, repeat: Infinity, ease: 'linear' }
                : { duration: 0 }}
              style={{ display: 'inline-flex' }}
            >
              <RefreshCw size={10} />
            </motion.span>
            LOAD
          </button>

          <button
            onClick={runScan}
            disabled={loading || scanning}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[9px] font-mono transition-all duration-200 disabled:opacity-40"
            style={{
              background:  scanning ? 'rgba(255,34,68,0.12)' : 'rgba(255,34,68,0.08)',
              borderColor: scanning ? 'rgba(255,34,68,0.40)' : 'rgba(255,34,68,0.22)',
              color:       '#ff2244',
            }}
          >
            <motion.span
              animate={scanning ? { opacity: [1, 0.4, 1] } : {}}
              transition={{ duration: 0.8, repeat: Infinity }}
              style={{ display: 'inline-flex' }}
            >
              <ScanLine size={10} />
            </motion.span>
            {scanning ? 'SCANNING…' : 'SCAN MEMORY'}
          </button>
        </div>
      </div>

      {/* ── Stats pills ─────────────────────────────────────────── */}
      {loaded && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 flex-wrap"
        >
          <StatPill value={counts.total}    label="Total"    color="#00f5ff" />
          <StatPill value={counts.poisoned} label="Blocked"  color="#ff2244" pulse={counts.poisoned > 0} />
          <StatPill value={counts.flagged}  label="Flagged"  color="#ffaa00" />
          <StatPill value={counts.clean}    label="Clean"    color="#00ff88" />
        </motion.div>
      )}

      {/* ── Toolbar: filter + sort ───────────────────────────────── */}
      {loaded && docs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-white/6 p-0.5 bg-white/2">
            {FILTER_TABS.map(({ key, label }) => {
              const active = filter === key
              const cfg    = STATUS_CFG[key]
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className="px-2.5 py-1 rounded-md text-[9px] font-mono tracking-wide transition-all duration-200"
                  style={{
                    background:  active ? (cfg ? `${cfg.color}12` : 'rgba(0,245,255,0.10)') : 'transparent',
                    color:       active ? (cfg ? cfg.color : '#00f5ff') : 'rgba(255,255,255,0.25)',
                    border:      active ? `1px solid ${cfg ? cfg.border : 'rgba(0,245,255,0.25)'}` : '1px solid transparent',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="flex-1" />

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono text-white/20">SORT</span>
            {[
              { key: 'score',  label: 'Score'  },
              { key: 'status', label: 'Status' },
              { key: 'time',   label: 'Time'   },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className="px-2 py-0.5 rounded border text-[8px] font-mono transition-all duration-200"
                style={{
                  background:  sortBy === key ? 'rgba(0,245,255,0.08)' : 'transparent',
                  borderColor: sortBy === key ? 'rgba(0,245,255,0.25)' : 'rgba(255,255,255,0.06)',
                  color:       sortBy === key ? '#00f5ff' : 'rgba(255,255,255,0.22)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Column headers ──────────────────────────────────────── */}
      {loaded && visible.length > 0 && (
        <div className="flex items-center gap-3 px-3 pb-1 border-b border-white/5">
          <div className="w-7 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[7px] font-mono text-white/20 tracking-widest uppercase">
              Document
            </span>
          </div>
          <div className="hidden sm:block w-28 flex-shrink-0">
            <span className="text-[7px] font-mono text-white/20 tracking-widest uppercase">
              Poison Score
            </span>
          </div>
          <div className="hidden md:block w-20 flex-shrink-0">
            <span className="text-[7px] font-mono text-white/20 tracking-widest uppercase">
              Ingested
            </span>
          </div>
          <div className="w-24 flex-shrink-0" />
          <div className="w-4 flex-shrink-0" />
        </div>
      )}

      {/* ── Content area ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto max-h-[480px] pr-0.5">
        <AnimatePresence mode="wait">
          {scanning ? (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ScanProgress />
            </motion.div>
          ) : !loaded ? (
            <motion.div key="unloaded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EmptyState filter="all" />
            </motion.div>
          ) : visible.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EmptyState filter={filter} />
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {visible.map((doc, i) => (
                <DocRow
                  key={doc.doc_id}
                  doc={doc}
                  index={i}
                  onQuarantine={handleQuarantine}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer note ─────────────────────────────────────────── */}
      {loaded && (
        <div className="flex items-center gap-1.5 pt-3 border-t border-white/5">
          <AlertTriangle size={9} className="text-amber-neon/30 flex-shrink-0" />
          <p className="text-[8px] font-mono text-white/15">
            Blocked documents were rejected at injection time.
            Flagged documents passed injection but were identified during scan.
          </p>
        </div>
      )}
    </div>
  )
}
