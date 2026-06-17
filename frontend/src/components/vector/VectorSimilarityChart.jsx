import React, { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitCompare, Search, Zap } from 'lucide-react'

const THRESHOLD = 82

function getBarStyle(isPoison, score) {
  if (!isPoison)                  return { fill: 'rgba(0,255,136,0.45)', stroke: '#00ff88', glow: '#00ff88' }
  if (score >= THRESHOLD)         return { fill: 'rgba(255,34,68,0.50)',  stroke: '#ff2244', glow: '#ff2244' }
  return                                 { fill: 'rgba(255,170,0,0.45)',  stroke: '#ffaa00', glow: '#ffaa00' }
}

async function fetchSimilar(queryText) {
  try {
    const { default: api } = await import('@/services/api.js')
    const res = await api.post('/vectors/similar', {
      query_text: queryText,
      collection: 'rag_memory',
      top_k: 8,
    })
    return (res.results ?? []).map((r, i) => ({
      id:         r.doc_id ?? `doc-${i}`,
      label:      `Doc ${i + 1}`,
      score:      parseFloat(((r.similarity ?? 0) * 100).toFixed(1)),
      isPoison:   r.label === 1 || r.metadata?.poisoned === true,
      content:    r.content_preview ?? '',
      source:     r.metadata?.source ?? 'unknown',
    }))
  } catch (_) {
    return []
  }
}

function Tooltip({ bar }) {
  if (!bar) return null
  const s = getBarStyle(bar.isPoison, bar.score)
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full left-1/2 mb-2 z-50 rounded-xl border px-3 py-2.5 min-w-[190px] pointer-events-none"
      style={{
        transform:      'translateX(-50%)',
        background:     'rgba(6,13,26,0.97)',
        borderColor:    `${s.stroke}30`,
        backdropFilter: 'blur(16px)',
        boxShadow:      `0 8px 24px rgba(0,0,0,0.6), 0 0 16px ${s.glow}15`,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-mono font-bold tracking-widest uppercase"
          style={{ color: s.stroke }}>
          {bar.isPoison ? (bar.score >= THRESHOLD ? 'HIGH RISK' : 'SUSPICIOUS') : 'CLEAN'}
        </span>
        <span className="text-[12px] font-display font-bold" style={{ color: s.stroke }}>
          {bar.score}%
        </span>
      </div>
      <p className="text-[10px] font-mono text-white/50 leading-snug mb-1.5">
        {bar.content?.slice(0, 75)}{bar.content?.length > 75 ? '…' : ''}
      </p>
      <p className="text-[8px] font-mono text-white/20">src: {bar.source}</p>
    </motion.div>
  )
}

function Bar({ bar, index, maxH, onEnter, onLeave }) {
  const [hovered, setHovered] = useState(false)
  const s      = getBarStyle(bar.isPoison, bar.score)
  const barH   = Math.max((bar.score / 100) * maxH, 4)
  const isCrit = bar.isPoison && bar.score >= THRESHOLD

  const enter = () => { setHovered(true);  onEnter(bar) }
  const leave = () => { setHovered(false); onLeave() }

  return (
    <div className="relative flex flex-col items-center gap-1 flex-1"
      style={{ minWidth: 0 }}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {/* Tooltip anchor */}
      <AnimatePresence>
        {hovered && <Tooltip bar={bar} />}
      </AnimatePresence>

      {/* Score label */}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 + index * 0.06 }}
        className="text-[8px] font-mono font-bold tabular-nums"
        style={{ color: s.stroke }}
      >
        {bar.score}%
      </motion.span>

      {/* Bar track */}
      <div className="relative w-full flex items-end" style={{ height: maxH }}>
        {/* Threshold reference mark */}
        <div
          className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
          style={{
            bottom:      `${(THRESHOLD / 100) * maxH}px`,
            borderColor: 'rgba(255,34,68,0.20)',
          }}
        />

        <motion.div
          className="w-full rounded-t-md relative overflow-hidden cursor-pointer"
          initial={{ height: 0 }}
          animate={{ height: barH, scale: hovered ? 1.04 : 1 }}
          transition={{
            height: { duration: 0.6, delay: 0.1 + index * 0.07, ease: [0.25, 0.46, 0.45, 0.94] },
            scale:  { duration: 0.15 },
          }}
          style={{
            background:  s.fill,
            border:      `1px solid ${s.stroke}`,
            borderBottom:'none',
            boxShadow:   hovered ? `0 0 14px ${s.glow}70` : `0 0 6px ${s.glow}30`,
          }}
        >
          {/* Top sheen */}
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.12) 0%,transparent 40%)' }} />

          {/* Critical pulse overlay */}
          {isCrit && (
            <motion.div
              className="absolute inset-0"
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              style={{ background: `${s.glow}25` }}
            />
          )}
        </motion.div>
      </div>

      {/* X-axis label */}
      <span className="text-[8px] font-mono text-white/25 truncate w-full text-center">
        {bar.label}
      </span>
    </div>
  )
}

export default function VectorSimilarityChart() {
  const [query,   setQuery]   = useState('')
  const [bars,    setBars]    = useState([])
  const [loading, setLoading] = useState(false)
  const CHART_H = 180

  const run = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setBars([])
    const data = await fetchSimilar(query.trim())
    setBars(data)
    setLoading(false)
  }, [query])

  const poisoned = bars.filter((b) => b.isPoison).length
  const clean    = bars.length - poisoned

  return (
    <div className="glass-panel p-5 flex flex-col gap-4 corner-brackets"
      style={{ minHeight: 360 }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare size={14} className="text-cyan-neon/70" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Vector Similarity
          </span>
        </div>
        {bars.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono text-green-neon/60">● {clean} clean</span>
            {poisoned > 0 && (
              <span className="text-[9px] font-mono text-red-neon/70 animate-neon-pulse">
                ● {poisoned} suspicious
              </span>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="Query RAG memory for similar vectors…"
          className="input-cyber flex-1 text-[12px]"
          disabled={loading}
        />
        <button
          onClick={run}
          disabled={!query.trim() || loading}
          className="btn-cyber btn-cyber-cyan px-4 flex-shrink-0 disabled:opacity-40"
        >
          {loading
            ? <motion.span animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                style={{ display: 'inline-flex' }}>
                <Zap size={13} />
              </motion.span>
            : <Search size={13} />
          }
        </button>
      </div>

      {/* Chart */}
      <div className="flex-1 relative" style={{ minHeight: CHART_H + 24 }}>
        <AnimatePresence mode="wait">
          {bars.length === 0 ? (
            <motion.div key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            >
              <div className="flex items-end gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <motion.div key={i}
                    className="w-7 rounded-t-sm"
                    style={{
                      height: `${22 + Math.sin(i * 1.1) * 14 + 8}px`,
                      background: 'rgba(0,245,255,0.05)',
                      border: '1px solid rgba(0,245,255,0.07)',
                      borderBottom: 'none',
                    }}
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 2, delay: i * 0.15, repeat: Infinity }}
                  />
                ))}
              </div>
              <p className="text-[10px] font-mono text-white/15 tracking-widest">
                Enter a query to visualize similarity scores
              </p>
            </motion.div>
          ) : (
            <motion.div key="chart"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              {/* Y-axis grid */}
              <div className="absolute left-0 right-0 top-0 pointer-events-none"
                style={{ height: CHART_H }}>
                {[100, 80, 60, 40, 20].map((pct) => (
                  <div key={pct}
                    className="absolute left-0 right-0 flex items-center gap-1.5"
                    style={{ bottom: `${(pct / 100) * CHART_H - 6}px` }}
                  >
                    <span className="text-[7px] font-mono text-white/15 w-5 text-right flex-shrink-0">
                      {pct}
                    </span>
                    <div className="flex-1 border-t"
                      style={{
                        borderColor:
                          pct === 80 ? 'rgba(255,34,68,0.18)' : 'rgba(0,245,255,0.04)',
                        borderStyle: pct === 80 ? 'dashed' : 'solid',
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Bars */}
              <div className="absolute bottom-6 left-6 right-0 flex items-end gap-1.5"
                style={{ height: CHART_H }}>
                {bars.map((bar, i) => (
                  <Bar
                    key={bar.id}
                    bar={bar}
                    index={i}
                    maxH={CHART_H}
                    onEnter={() => {}}
                    onLeave={() => {}}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      {bars.length > 0 && (
        <div className="flex items-center gap-5 pt-3 border-t border-white/5 flex-wrap">
          {[
            { color: '#00ff88', label: 'Clean' },
            { color: '#ffaa00', label: 'Suspicious' },
            { color: '#ff2244', label: 'High Risk (≥82%)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm border"
                style={{ background: `${color}35`, borderColor: color }} />
              <span className="text-[9px] font-mono text-white/30">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-4 border-t border-dashed border-red-neon/40" />
            <span className="text-[9px] font-mono text-white/20">Block threshold</span>
          </div>
        </div>
      )}
    </div>
  )
}
