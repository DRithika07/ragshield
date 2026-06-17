/**
 * DocumentInjectionPanel.jsx — RAG Memory Injection Interface
 * ═══════════════════════════════════════════════════════════
 * Phase 5 · Step 7 — Memory Poisoning Visualization
 *
 * Allows operators to inject documents into RAG memory with live
 * poison screening, threat classification, and injection history.
 * Connects to /rag/inject, /rag/scan, and /rag/memory endpoints.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  Syringe,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Trash2,
  RefreshCw,
  Database,
  Zap,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  ScanLine,
  FlaskConical,
} from 'lucide-react'
import { ragAPI } from '@/services/api.js'

// ── Threat classification helpers ──────────────────────────────────

function getThreatMeta(label, score) {
  if (label === 'clean' || label === 0 || label === false) {
    return {
      color:  '#00ff88',
      bg:     'rgba(0,255,136,0.10)',
      border: 'rgba(0,255,136,0.30)',
      label:  'CLEAN',
      icon:   ShieldCheck,
    }
  }
  if ((score ?? 0) >= 28) {
    return {
      color:  '#ff2244',
      bg:     'rgba(255,34,68,0.12)',
      border: 'rgba(255,34,68,0.45)',
      label:  'HIGH RISK',
      icon:   ShieldAlert,
    }
  }
  return {
    color:  '#ffaa00',
    bg:     'rgba(255,170,0,0.11)',
    border: 'rgba(255,170,0,0.38)',
    label:  'SUSPICIOUS',
    icon:   AlertTriangle,
  }
}

// ── Pill badge ────────────────────────────────────────────────────

function ThreatBadge({ label, score, poisoned }) {
  const meta = getThreatMeta(poisoned ? 'poison' : 'clean', score)
  const Icon = meta.icon
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono font-bold tracking-widest uppercase"
      style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
    >
      <Icon size={9} strokeWidth={2.2} />
      {meta.label}
    </span>
  )
}

// ── Single injection history row ──────────────────────────────────

function HistoryRow({ entry, onExpand, expanded }) {
  const meta = getThreatMeta(entry.poisoned ? 'poison' : 'clean', entry.score)
  const Icon = meta.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: meta.border, background: meta.bg }}
    >
      {/* Row header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
        onClick={onExpand}
      >
        {/* Status icon */}
        <div
          className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}
        >
          <Icon size={11} strokeWidth={2} style={{ color: meta.color }} />
        </div>

        {/* Content preview */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-white/70 truncate leading-tight">
            {entry.content?.slice(0, 80)}{entry.content?.length > 80 ? '…' : ''}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[8px] font-mono text-white/25">{entry.source ?? 'manual'}</span>
            <span className="text-white/15 text-[8px]">·</span>
            <span className="text-[8px] font-mono text-white/25">{entry.timestamp}</span>
          </div>
        </div>

        {/* Score + badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {entry.score != null && (
            <span
              className="text-[10px] font-mono font-bold tabular-nums"
              style={{ color: meta.color }}
            >
              {entry.score.toFixed(1)}%
            </span>
          )}
          <ThreatBadge poisoned={entry.poisoned} score={entry.score} />
          <div className="ml-1 text-white/20">
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t px-3 py-2.5"
            style={{ borderColor: `${meta.color}20` }}
          >
            <p className="text-[10px] font-mono text-white/50 leading-relaxed whitespace-pre-wrap">
              {entry.content}
            </p>
            {entry.threat_type && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[8px] font-mono text-white/25 uppercase tracking-widest">
                  Threat Type:
                </span>
                <span className="text-[9px] font-mono" style={{ color: meta.color }}>
                  {entry.threat_type}
                </span>
              </div>
            )}
            {entry.doc_id && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[8px] font-mono text-white/25 uppercase tracking-widest">
                  Doc ID:
                </span>
                <span className="text-[8px] font-mono text-white/30">{entry.doc_id}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Memory document row ───────────────────────────────────────────

function MemoryDocRow({ doc, index }) {
  const meta = getThreatMeta(doc.poisoned ? 'poison' : 'clean', doc.score)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg border"
      style={{ borderColor: `${meta.color}20`, background: `${meta.color}06` }}
    >
      <div
        className="flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center"
        style={{ background: `${meta.color}15` }}
      >
        <FileText size={10} style={{ color: meta.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono text-white/60 leading-snug truncate">
          {doc.content_preview ?? doc.content?.slice(0, 70)}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[8px] font-mono text-white/20">{doc.source ?? 'unknown'}</span>
          {doc.doc_id && (
            <>
              <span className="text-white/10 text-[8px]">·</span>
              <span className="text-[8px] font-mono text-white/15 truncate max-w-[120px]">
                {doc.doc_id}
              </span>
            </>
          )}
        </div>
      </div>
      <ThreatBadge poisoned={doc.poisoned} score={doc.score ?? 0} />
    </motion.div>
  )
}

// ── Status toast ─────────────────────────────────────────────────

function StatusToast({ status }) {
  if (!status) return null

  const cfg = {
    success: { color: '#00ff88', Icon: CheckCircle2, bg: 'rgba(0,255,136,0.08)' },
    error:   { color: '#ff2244', Icon: XCircle,      bg: 'rgba(255,34,68,0.08)' },
    warning: { color: '#ffaa00', Icon: AlertTriangle, bg: 'rgba(255,170,0,0.08)' },
    info:    { color: '#00f5ff', Icon: Info,          bg: 'rgba(0,245,255,0.08)' },
  }[status.type] ?? { color: '#00f5ff', Icon: Info, bg: 'rgba(0,245,255,0.08)' }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={   { opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-[11px] font-mono"
      style={{ background: cfg.bg, borderColor: `${cfg.color}30`, color: cfg.color }}
    >
      <cfg.Icon size={13} strokeWidth={2} />
      <span>{status.message}</span>
    </motion.div>
  )
}

// ── Scan summary bar ──────────────────────────────────────────────

function ScanSummary({ result }) {
  if (!result) return null
  const { total, poisoned, clean, scan_time_ms } = result

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-lg border border-cyan-neon/15 bg-cyan-neon/5 p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-mono text-cyan-neon/60 tracking-widest uppercase">
          Memory Scan Complete
        </span>
        {scan_time_ms != null && (
          <span className="text-[8px] font-mono text-white/20">{scan_time_ms}ms</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-[18px] font-display font-bold text-white/70 tabular-nums leading-none">
            {total ?? 0}
          </p>
          <p className="text-[8px] font-mono text-white/25 mt-0.5">TOTAL</p>
        </div>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/5">
          {total > 0 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${((poisoned ?? 0) / total) * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg,#ffaa00,#ff2244)' }}
            />
          )}
        </div>
        <div className="text-center">
          <p className="text-[18px] font-display font-bold tabular-nums leading-none"
            style={{ color: (poisoned ?? 0) > 0 ? '#ff2244' : '#00ff88' }}>
            {poisoned ?? 0}
          </p>
          <p className="text-[8px] font-mono text-white/25 mt-0.5">POISONED</p>
        </div>
        <div className="text-center">
          <p className="text-[18px] font-display font-bold text-green-neon tabular-nums leading-none">
            {clean ?? (total ?? 0) - (poisoned ?? 0)}
          </p>
          <p className="text-[8px] font-mono text-white/25 mt-0.5">CLEAN</p>
        </div>
      </div>
    </motion.div>
  )
}

// ── Tab button helper ─────────────────────────────────────────────

function TabBtn({ active, onClick, children, count }) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono font-semibold tracking-widest uppercase transition-all duration-200"
      style={{
        color:        active ? '#00f5ff'             : 'rgba(255,255,255,0.25)',
        borderBottom: active ? '1.5px solid #00f5ff' : '1.5px solid transparent',
      }}
    >
      {children}
      {count != null && count > 0 && (
        <span
          className="px-1 py-0.5 rounded text-[7px] font-bold tabular-nums"
          style={{
            background: active ? 'rgba(0,245,255,0.15)' : 'rgba(255,255,255,0.06)',
            color:      active ? '#00f5ff'               : 'rgba(255,255,255,0.25)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

// ── Animated scanning lines overlay ──────────────────────────────

function ScanOverlay({ active }) {
  if (!active) return null
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-[inherit]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Moving scan line */}
      <motion.div
        className="absolute left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(0,245,255,0.6),transparent)' }}
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
      />
      {/* Corner pulsing brackets */}
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => {
        const isTop  = pos.includes('top')
        const isLeft = pos.includes('left')
        return (
          <motion.div
            key={pos}
            className="absolute w-5 h-5"
            style={{
              top:              isTop    ? 4 : 'auto',
              bottom:           !isTop   ? 4 : 'auto',
              left:             isLeft   ? 4 : 'auto',
              right:            !isLeft  ? 4 : 'auto',
              borderColor:      'rgba(0,245,255,0.6)',
              borderStyle:      'solid',
              borderWidth:      0,
              borderTopWidth:    isTop  ? 2 : 0,
              borderBottomWidth: !isTop ? 2 : 0,
              borderLeftWidth:   isLeft  ? 2 : 0,
              borderRightWidth:  !isLeft ? 2 : 0,
            }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )
      })}
      {/* Dim overlay */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,245,255,0.03)' }} />
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

export default function DocumentInjectionPanel() {
  // ── Input state ──────────────────────────────────────────────
  const [content,  setContent]  = useState('')
  const [source,   setSource]   = useState('manual')
  const [charCount, setCharCount] = useState(0)

  // ── Operation state ──────────────────────────────────────────
  const [injecting, setInjecting] = useState(false)
  const [scanning,  setScanning]  = useState(false)
  const [loadingMem, setLoadingMem] = useState(false)

  // ── Results ──────────────────────────────────────────────────
  const [status,     setStatus]     = useState(null)   // { type, message }
  const [scanResult, setScanResult] = useState(null)
  const [history,    setHistory]    = useState([])
  const [memory,     setMemory]     = useState([])
  const [expandedId, setExpandedId] = useState(null)

  // ── Tab state ─────────────────────────────────────────────────
  const [tab, setTab] = useState('inject')  // 'inject' | 'history' | 'memory'

  const textareaRef = useRef(null)
  const statusTimer = useRef(null)

  // ── Helpers ───────────────────────────────────────────────────

  const showStatus = useCallback((type, message, duration = 5000) => {
    if (statusTimer.current) clearTimeout(statusTimer.current)
    setStatus({ type, message })
    statusTimer.current = setTimeout(() => setStatus(null), duration)
  }, [])

  const now = () =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // ── Inject document ───────────────────────────────────────────

  const handleInject = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed) return

    setInjecting(true)
    setStatus(null)

    try {
      const res = await ragAPI.injectDocument(trimmed, source || 'manual')
      const data = res ?? {}

      const entry = {
        id:          Date.now(),
        content:     trimmed,
        source:      source || 'manual',
        timestamp:   now(),
        poisoned:    data.is_blocked || data.is_flagged || false,
        score:       data.poison_score != null
                      ? parseFloat((data.poison_score * 100).toFixed(1))
                      : null,
        threat_type: data.poison_status ?? null,
        doc_id:      data.doc_id ?? null,
    }
      

      setHistory((prev) => [entry, ...prev.slice(0, 49)])

      if (data.is_blocked) {
        showStatus(
          'error',
         `🚫 Document BLOCKED — poison score ${entry.score ?? '—'}% exceeds threshold`,
      )
    } else if (data.is_flagged) {
      showStatus(
        'warning',
        `⚠ Document FLAGGED — suspicious content (${entry.score ?? '—'}% similarity) stored with warning`,
    )
      setContent('')
      setCharCount(0)
    } else {
      showStatus('success', `Document injected successfully into RAG memory`)
      setContent('')
      setCharCount(0)
    }

      setTab('history')
    } catch (err) {
      showStatus('error', `Injection failed: ${err?.response?.data?.detail ?? err?.message ?? 'Network error'}`)
    } finally {
      setInjecting(false)
    }
  }, [content, source, showStatus])

  // ── Scan memory ───────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    setScanning(true)
    setScanResult(null)
    setStatus(null)

    try {
      const res  = await ragAPI.scanMemory()
      const data = res ?? {}
      setScanResult({
        total:       data.total_documents ?? 0,
        poisoned:    data.poisoned_count  ?? 0,
        clean:       data.clean_count     ?? 0,
        scan_time_ms: data.scan_time_ms   ?? null,
      })
      showStatus(
        data.poisoned_count > 0 ? 'warning' : 'success',
        data.poisoned_count > 0
          ? `Scan complete — ${data.poisoned_count} poisoned document(s) detected`
          : 'Scan complete — memory is clean',
      )
    } catch (err) {
      showStatus('error', `Scan failed: ${err?.response?.data?.detail ?? err?.message ?? 'Network error'}`)
    } finally {
      setScanning(false)
    }
  }, [showStatus])

  // ── Load memory ───────────────────────────────────────────────

  const handleLoadMemory = useCallback(async () => {
    setLoadingMem(true)
    setStatus(null)

    try {
      const res  = await ragAPI.getMemory()
      const docs = (res?.documents ?? res ?? []).map((d, i) => ({
        id:              d.doc_id ?? `doc-${i}`,
        content_preview: d.content_preview ?? d.content?.slice(0, 80),
        content:         d.content,
        source:          d.source ?? d.metadata?.source ?? 'unknown',
        doc_id:          d.doc_id,
        poisoned:        d.label === 1 || d.metadata?.poisoned === true || d.poisoned === true,
        score:           d.similarity_score != null
                           ? parseFloat((d.similarity_score * 100).toFixed(1))
                           : null,
      }))
      setMemory(docs)
      setTab('memory')
      showStatus('info', `Loaded ${docs.length} document(s) from RAG memory`)
    } catch (err) {
      showStatus('error', `Failed to load memory: ${err?.response?.data?.detail ?? err?.message ?? 'Network error'}`)
    } finally {
      setLoadingMem(false)
    }
  }, [showStatus])

  // ── Textarea change ───────────────────────────────────────────

  const handleContentChange = (e) => {
    setContent(e.target.value)
    setCharCount(e.target.value.length)
  }

  // ── Cleanup ───────────────────────────────────────────────────

  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current) }, [])

  // ── Derived counts ────────────────────────────────────────────

  const historyPoisoned = history.filter((h) => h.poisoned).length
  const memoryPoisoned  = memory.filter((m) => m.poisoned).length

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="glass-panel corner-brackets flex flex-col gap-0 overflow-hidden"
      style={{ minHeight: 520 }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          {/* Icon cluster */}
          <div className="relative">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(179,71,255,0.12)', border: '1px solid rgba(179,71,255,0.30)' }}
            >
              <Syringe size={15} strokeWidth={1.8} style={{ color: '#b347ff' }} />
            </div>
            {/* Pulse ring for active injections */}
            <AnimatePresence>
              {injecting && (
                <motion.div
                  className="absolute inset-0 rounded-lg"
                  style={{ border: '1px solid rgba(179,71,255,0.6)' }}
                  animate={{ opacity: [1, 0], scale: [1, 1.5] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  exit={{ opacity: 0 }}
                />
              )}
            </AnimatePresence>
          </div>

          <div>
            <h3 className="text-[12px] font-display font-bold text-white/80 tracking-wider uppercase leading-none">
              Document Injection
            </h3>
            <p className="text-[9px] font-mono text-white/25 mt-0.5 tracking-widest">
              RAG MEMORY POISONING INTERFACE
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Scan memory */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ y: -1 }}
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200 disabled:opacity-40"
            style={{
              background:   'rgba(0,245,255,0.06)',
              borderColor:  'rgba(0,245,255,0.25)',
              color:        '#00f5ff',
            }}
          >
            {scanning
              ? <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-flex' }}>
                  <RefreshCw size={11} />
                </motion.span>
              : <ScanLine size={11} />
            }
            Scan
          </motion.button>

          {/* Load memory */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ y: -1 }}
            onClick={handleLoadMemory}
            disabled={loadingMem}
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200 disabled:opacity-40"
            style={{
              background:  'rgba(255,170,0,0.06)',
              borderColor: 'rgba(255,170,0,0.25)',
              color:       '#ffaa00',
            }}
          >
            {loadingMem
              ? <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-flex' }}>
                  <RefreshCw size={11} />
                </motion.span>
              : <Database size={11} />
            }
            Memory
          </motion.button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-white/5 px-2">
        <TabBtn active={tab === 'inject'}  onClick={() => setTab('inject')}>
          <FlaskConical size={10} /> Inject
        </TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')} count={history.length}>
          <Clock size={10} /> History
          {historyPoisoned > 0 && (
            <span className="ml-0.5 text-[7px] font-bold text-red-neon animate-neon-pulse">
              {historyPoisoned}✕
            </span>
          )}
        </TabBtn>
        <TabBtn active={tab === 'memory'}  onClick={() => setTab('memory')} count={memory.length}>
          <Eye size={10} /> Memory
          {memoryPoisoned > 0 && (
            <span className="ml-0.5 text-[7px] font-bold text-amber-neon">
              {memoryPoisoned}✕
            </span>
          )}
        </TabBtn>
      </div>

      {/* ── Status toast ───────────────────────────────────────── */}
      <div className="px-5 pt-3">
        <AnimatePresence mode="wait">
          {status && <StatusToast key={status.message} status={status} />}
        </AnimatePresence>
      </div>

      {/* ── Scan summary (always visible when present) ──────────── */}
      {scanResult && (
        <div className="px-5 pt-3">
          <ScanSummary result={scanResult} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: INJECT
      ══════════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {tab === 'inject' && (
          <motion.div
            key="inject"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-4 px-5 py-4"
          >
            {/* Source selector */}
            <div className="flex items-center gap-3">
              <label className="text-[9px] font-mono text-white/30 tracking-widest uppercase flex-shrink-0">
                Source Tag
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {['manual', 'file', 'api', 'test', 'adversarial'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className="px-2 py-0.5 rounded-md text-[9px] font-mono font-semibold uppercase tracking-wider border transition-all duration-150"
                    style={{
                      background:  source === s ? 'rgba(179,71,255,0.15)' : 'rgba(255,255,255,0.03)',
                      borderColor: source === s ? 'rgba(179,71,255,0.50)' : 'rgba(255,255,255,0.08)',
                      color:       source === s ? '#b347ff'                : 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea with scanning overlay */}
            <div className="relative flex-1" style={{ minHeight: 160 }}>
              <AnimatePresence>
                <ScanOverlay active={injecting} />
              </AnimatePresence>

              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                disabled={injecting}
                placeholder="Paste document content to inject into RAG memory…&#10;&#10;Sentinel will screen this document for memory poisoning, prompt injection, jailbreak, and role-hijacking patterns before committing it to the vector store."
                className="w-full h-full resize-none rounded-xl border text-[11px] font-mono text-white/70 leading-relaxed placeholder:text-white/15 outline-none transition-all duration-200 disabled:opacity-50"
                style={{
                  minHeight:       160,
                  background:      'rgba(6,13,26,0.6)',
                  borderColor:     content ? 'rgba(179,71,255,0.25)' : 'rgba(255,255,255,0.07)',
                  padding:         '12px 14px',
                  backdropFilter:  'blur(8px)',
                  caretColor:      '#b347ff',
                  boxShadow:       content ? 'inset 0 0 20px rgba(179,71,255,0.04)' : 'none',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(179,71,255,0.45)')}
                onBlur={(e)  => (e.target.style.borderColor = content ? 'rgba(179,71,255,0.25)' : 'rgba(255,255,255,0.07)')}
              />

              {/* Char counter */}
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                <span
                  className="text-[8px] font-mono tabular-nums"
                  style={{ color: charCount > 4000 ? '#ff2244' : 'rgba(255,255,255,0.15)' }}
                >
                  {charCount.toLocaleString()} chars
                </span>
              </div>
            </div>

            {/* Inject button row */}
            <div className="flex items-center gap-3">
              {/* Clear */}
              {content && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setContent(''); setCharCount(0) }}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-lg border text-[10px] font-mono uppercase tracking-wider transition-all duration-200"
                  style={{
                    background:  'rgba(255,255,255,0.03)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    color:       'rgba(255,255,255,0.25)',
                  }}
                >
                  <Trash2 size={11} />
                  Clear
                </motion.button>
              )}

              {/* Primary inject button */}
              <motion.button
                whileTap={!injecting && content.trim() ? { scale: 0.97 } : undefined}
                whileHover={!injecting && content.trim() ? { y: -2 } : undefined}
                onClick={handleInject}
                disabled={injecting || !content.trim()}
                className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl border text-[11px] font-mono font-bold uppercase tracking-widest transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed"
                style={{
                  background:  injecting
                    ? 'rgba(179,71,255,0.06)'
                    : content.trim()
                      ? 'rgba(179,71,255,0.12)'
                      : 'rgba(179,71,255,0.04)',
                  borderColor: content.trim()
                    ? 'rgba(179,71,255,0.50)'
                    : 'rgba(179,71,255,0.15)',
                  color:       '#b347ff',
                  boxShadow:   content.trim() && !injecting
                    ? '0 0 20px rgba(179,71,255,0.12)'
                    : 'none',
                }}
              >
                {injecting ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                      style={{ display: 'inline-flex' }}
                    >
                      <Zap size={13} />
                    </motion.span>
                    Screening &amp; Injecting…
                  </>
                ) : (
                  <>
                    <Syringe size={13} />
                    Inject into RAG Memory
                  </>
                )}
              </motion.button>
            </div>

            {/* Info note */}
            <p className="text-[8px] font-mono text-white/15 leading-relaxed text-center">
              Documents are screened by Sentinel's ML classifier and vector similarity engine
              before committing to the ChromaDB vector store. Poisoned content is blocked.
            </p>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: HISTORY
        ════════════════════════════════════════════════════════ */}
        {tab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-3 px-5 py-4"
          >
            {history.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.10)' }}
                >
                  <Clock size={20} strokeWidth={1.2} className="text-cyan-neon/25" />
                </div>
                <p className="text-[9px] font-mono text-white/15 tracking-widest">
                  NO INJECTION HISTORY
                </p>
              </div>
            ) : (
              <>
                {/* Summary strip */}
                <div className="flex items-center gap-4 px-1">
                  <span className="text-[9px] font-mono text-white/25">
                    {history.length} injection{history.length !== 1 ? 's' : ''}
                  </span>
                  {historyPoisoned > 0 && (
                    <span className="text-[9px] font-mono text-red-neon/70 animate-neon-pulse">
                      ● {historyPoisoned} blocked
                    </span>
                  )}
                  <span className="text-[9px] font-mono text-green-neon/50">
                    ● {history.length - historyPoisoned} injected
                  </span>
                  <button
                    onClick={() => setHistory([])}
                    className="ml-auto text-[8px] font-mono text-white/15 hover:text-red-neon/60 transition-colors duration-200 flex items-center gap-1"
                  >
                    <Trash2 size={9} /> Clear
                  </button>
                </div>

                {/* Scrollable list */}
                <div className="flex flex-col gap-1.5 overflow-y-auto pr-0.5"
                  style={{ maxHeight: 340 }}>
                  <AnimatePresence initial={false}>
                    {history.map((entry) => (
                      <HistoryRow
                        key={entry.id}
                        entry={entry}
                        expanded={expandedId === entry.id}
                        onExpand={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: MEMORY
        ════════════════════════════════════════════════════════ */}
        {tab === 'memory' && (
          <motion.div
            key="memory"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col gap-3 px-5 py-4"
          >
            {memory.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.10)' }}
                >
                  <Database size={20} strokeWidth={1.2} className="text-amber-neon/25" />
                </div>
                <p className="text-[9px] font-mono text-white/15 tracking-widest">
                  RAG MEMORY NOT LOADED
                </p>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleLoadMemory}
                  disabled={loadingMem}
                  className="flex items-center gap-1.5 px-4 h-8 rounded-lg border text-[10px] font-mono uppercase tracking-wider transition-all duration-200 disabled:opacity-40"
                  style={{
                    background:  'rgba(255,170,0,0.08)',
                    borderColor: 'rgba(255,170,0,0.30)',
                    color:       '#ffaa00',
                  }}
                >
                  <Database size={11} /> Load Memory
                </motion.button>
              </div>
            ) : (
              <>
                {/* Header row */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-mono text-white/25">
                      {memory.length} document{memory.length !== 1 ? 's' : ''}
                    </span>
                    {memoryPoisoned > 0 && (
                      <span className="text-[9px] font-mono text-amber-neon/70">
                        ● {memoryPoisoned} flagged
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleLoadMemory}
                    disabled={loadingMem}
                    className="flex items-center gap-1 text-[8px] font-mono text-white/20 hover:text-cyan-neon/60 transition-colors duration-200 disabled:opacity-40"
                  >
                    <RefreshCw size={9} /> Refresh
                  </button>
                </div>

                {/* Document list */}
                <div className="flex flex-col gap-1.5 overflow-y-auto pr-0.5"
                  style={{ maxHeight: 320 }}>
                  {memory.map((doc, i) => (
                    <MemoryDocRow key={doc.id ?? i} doc={doc} index={i} />
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer status bar ──────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-t border-white/5">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: injecting || scanning
                ? '#b347ff'
                : '#00ff88',
              boxShadow: injecting || scanning
                ? '0 0 6px rgba(179,71,255,0.8)'
                : '0 0 6px rgba(0,255,136,0.6)',
            }}
          />
          <span className="text-[8px] font-mono text-white/20 tracking-widest uppercase">
            {injecting ? 'Injecting…' : scanning ? 'Scanning…' : loadingMem ? 'Loading…' : 'Sentinel Ready'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[8px] font-mono text-white/12">
            CHROMA · RAG MEMORY
          </span>
          {history.length > 0 && (
            <span className="text-[8px] font-mono text-white/15 tabular-nums">
              {history.length} ops
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
