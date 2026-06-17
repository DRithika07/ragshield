import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Network, RefreshCw, ZoomIn, ZoomOut, Maximize2,
  Filter, Layers, ShieldAlert, ShieldCheck, Info,
} from 'lucide-react'
import SimilarityNode from './SimilarityNode.jsx'

// ── Constants ──────────────────────────────────────────────────────
const COLLECTIONS = ['threat_library', 'rag_memory', 'detection_history']
const POINT_R     = 5        // base dot radius
const PADDING     = 48       // canvas padding px
const ZOOM_MIN    = 0.4
const ZOOM_MAX    = 3.5
const ZOOM_STEP   = 0.25

// ── Severity palette ───────────────────────────────────────────────
const SEV_COLOR = {
  CRITICAL: '#ff2244',
  HIGH:     '#ffaa00',
  MEDIUM:   '#b347ff',
  LOW:      '#00f5ff',
  SAFE:     '#00ff88',
  default:  '#00f5ff',
}

function dotColor(pt) {
  if (pt.label === 0) return '#00ff88'
  return SEV_COLOR[pt.severity] ?? SEV_COLOR.default
}

// ── API fetch ──────────────────────────────────────────────────────
async function fetchVisualization(collection, limit) {
  try {
    const { default: api } = await import('@/services/api.js')
    const res = await api.get('/vectors/visualize', {
      params: { collection, limit },
    })
    return res.points ?? []
  } catch (_) {
    return []
  }
}

// ── Normalize UMAP coords → canvas pixel coords ───────────────────
function normalizePoints(points, width, height) {
  if (!points.length) return []
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const W = width  - PADDING * 2
  const H = height - PADDING * 2

  return points.map((p) => ({
    ...p,
    cx: PADDING + ((p.x - minX) / rangeX) * W,
    cy: PADDING + ((p.y - minY) / rangeY) * H,
  }))
}

// ── Tooltip on hover ───────────────────────────────────────────────
function PointTooltip({ pt, canvasRect, zoom, pan }) {
  if (!pt || !canvasRect) return null
  const color = dotColor(pt)
  const px = pt.cx * zoom + pan.x
  const py = pt.cy * zoom + pan.y

  return (
    <motion.div
      key={pt.id}
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1,    y: 0 }}
      exit={{ opacity: 0,   scale: 0.92, y: 4 }}
      transition={{ duration: 0.13 }}
      className="absolute z-50 rounded-xl border pointer-events-none"
      style={{
        left:           px + 12,
        top:            py - 10,
        background:     'rgba(6,13,26,0.97)',
        borderColor:    `${color}30`,
        backdropFilter: 'blur(18px)',
        boxShadow:      `0 8px 24px rgba(0,0,0,0.65), 0 0 14px ${color}18`,
        padding:        '9px 12px',
        minWidth:       '170px',
        maxWidth:       '220px',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[8px] font-mono font-bold tracking-widest uppercase"
          style={{ color }}
        >
          {pt.label === 0 ? 'CLEAN' : (pt.severity ?? 'THREAT')}
        </span>
        <span className="text-[8px] font-mono text-white/25">{pt.id?.slice(0, 8)}</span>
      </div>
      {pt.content_preview && (
        <p className="text-[10px] font-mono text-white/50 leading-snug">
          {pt.content_preview.slice(0, 80)}{pt.content_preview.length > 80 ? '…' : ''}
        </p>
      )}
    </motion.div>
  )
}

// ── Legend ─────────────────────────────────────────────────────────
function Legend({ counts }) {
  const entries = [
    { color: '#00ff88', label: 'Clean',    key: 'clean'    },
    { color: '#ffaa00', label: 'High',     key: 'high'     },
    { color: '#ff2244', label: 'Critical', key: 'critical' },
    { color: '#b347ff', label: 'Medium',   key: 'medium'   },
    { color: '#00f5ff', label: 'Low',      key: 'low'      },
  ]

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {entries.map(({ color, label, key }) => (
        counts[key] > 0 && (
          <div key={key} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full border"
              style={{ background: `${color}30`, borderColor: color, boxShadow: `0 0 5px ${color}60` }}
            />
            <span className="text-[9px] font-mono text-white/30">{label}</span>
            <span className="text-[9px] font-mono text-white/15">({counts[key]})</span>
          </div>
        )
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────
export default function ThreatClusterGraph() {
  const containerRef = useRef(null)
  const svgRef       = useRef(null)

  const [rawPoints,   setRawPoints]   = useState([])
  const [points,      setPoints]      = useState([])
  const [loading,     setLoading]     = useState(false)
  const [collection,  setCollection]  = useState('threat_library')
  const [limit,       setLimit]       = useState(300)
  const [filter,      setFilter]      = useState('all')   // 'all' | 'threat' | 'clean'
  const [zoom,        setZoom]        = useState(1)
  const [pan,         setPan]         = useState({ x: 0, y: 0 })
  const [hoveredPt,   setHoveredPt]   = useState(null)
  const [selectedPt,  setSelectedPt]  = useState(null)
  const [dimensions,  setDimensions]  = useState({ w: 600, h: 380 })
  const [isDragging,  setIsDragging]  = useState(false)
  const dragStart    = useRef(null)

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect
      setDimensions({ w: Math.max(width, 300), h: 380 })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Re-normalize when raw data or dimensions change
  useEffect(() => {
    setPoints(normalizePoints(rawPoints, dimensions.w, dimensions.h))
  }, [rawPoints, dimensions])

  // Fetch
  const load = useCallback(async () => {
    setLoading(true)
    setSelectedPt(null)
    setHoveredPt(null)
    const data = await fetchVisualization(collection, limit)
    setRawPoints(data)
    setLoading(false)
  }, [collection, limit])

  // Filter
  const visiblePoints = useMemo(() => {
    if (filter === 'threat') return points.filter((p) => p.label !== 0)
    if (filter === 'clean')  return points.filter((p) => p.label === 0)
    return points
  }, [points, filter])

  // Counts for legend
  const counts = useMemo(() => {
    const c = { clean: 0, critical: 0, high: 0, medium: 0, low: 0 }
    points.forEach((p) => {
      if (p.label === 0) { c.clean++; return }
      const s = (p.severity ?? '').toUpperCase()
      if (s === 'CRITICAL') c.critical++
      else if (s === 'HIGH') c.high++
      else if (s === 'MEDIUM') c.medium++
      else c.low++
    })
    return c
  }, [points])

  // ── Pan / drag ─────────────────────────────────────────────────
  const onMouseDown = (e) => {
    if (e.button !== 0) return
    setIsDragging(true)
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }
  const onMouseMove = useCallback((e) => {
    if (!isDragging || !dragStart.current) return
    setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y })
  }, [isDragging])
  const onMouseUp = () => { setIsDragging(false); dragStart.current = null }

  // ── Wheel zoom ─────────────────────────────────────────────────
  const onWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta)))
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const zoomIn  = () => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  // ── Point interaction ──────────────────────────────────────────
  const handlePointClick = (pt) => {
    setSelectedPt((prev) => prev?.id === pt.id ? null : pt)
  }

  // ── Convex-hull–style cluster blobs (background) ───────────────
  // Simple: draw an ellipse around each label cluster
  const clusterBlobs = useMemo(() => {
    if (!visiblePoints.length) return []
    const groups = {}
    visiblePoints.forEach((p) => {
      const key = p.label === 0 ? 'clean' : (p.severity ?? 'threat')
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    return Object.entries(groups).map(([key, pts]) => {
      if (pts.length < 3) return null
      const xs = pts.map((p) => p.cx)
      const ys = pts.map((p) => p.cy)
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length
      const cy = ys.reduce((a, b) => a + b, 0) / ys.length
      const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 14
      const ry = (Math.max(...ys) - Math.min(...ys)) / 2 + 14
      const color = key === 'clean' ? '#00ff88'
        : key === 'CRITICAL' ? '#ff2244'
        : key === 'HIGH'     ? '#ffaa00'
        : key === 'MEDIUM'   ? '#b347ff'
        : '#00f5ff'
      return { key, cx, cy, rx, ry, color }
    }).filter(Boolean)
  }, [visiblePoints])

  return (
    <div className="glass-panel p-5 flex flex-col gap-4 corner-brackets">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-cyan-neon/70" />
          <span className="text-[11px] font-mono text-white/50 tracking-widest uppercase">
            Threat Cluster Graph
          </span>
          {points.length > 0 && (
            <span className="text-[9px] font-mono text-white/20">
              {points.length} vectors
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Collection selector */}
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            disabled={loading}
            className="input-cyber text-[10px] py-1 px-2 h-7"
            style={{ minWidth: 130 }}
          >
            {COLLECTIONS.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>

          {/* Limit selector */}
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={loading}
            className="input-cyber text-[10px] py-1 px-2 h-7"
            style={{ minWidth: 70 }}
          >
            {[100, 200, 300, 500].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          {/* Filter toggle */}
          <div className="flex items-center gap-1 border border-white/10 rounded-lg overflow-hidden">
            {[
              { key: 'all',    label: 'All'    },
              { key: 'threat', label: 'Threats' },
              { key: 'clean',  label: 'Clean'   },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className="px-2 py-1 text-[9px] font-mono transition-colors"
                style={{
                  background: filter === key ? 'rgba(0,245,255,0.12)' : 'transparent',
                  color:      filter === key ? '#00f5ff' : 'rgba(255,255,255,0.25)',
                  borderRight: key !== 'clean' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Load button */}
          <button
            onClick={load}
            disabled={loading}
            className="btn-cyber btn-cyber-cyan h-7 px-3 text-[10px] font-mono flex items-center gap-1.5 disabled:opacity-40"
          >
            {loading ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                style={{ display: 'inline-flex' }}
              >
                <RefreshCw size={11} />
              </motion.span>
            ) : (
              <RefreshCw size={11} />
            )}
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden"
        style={{
          height:     dimensions.h,
          background: 'rgba(2,4,8,0.6)',
          border:     '1px solid rgba(0,245,255,0.07)',
          cursor:     isDragging ? 'grabbing' : 'grab',
        }}
      >
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-1">
          {[
            { icon: <ZoomIn size={11} />,    action: zoomIn,    title: 'Zoom in'  },
            { icon: <ZoomOut size={11} />,   action: zoomOut,   title: 'Zoom out' },
            { icon: <Maximize2 size={11} />, action: resetView, title: 'Reset'    },
          ].map(({ icon, action, title }) => (
            <button
              key={title}
              onClick={action}
              title={title}
              className="w-7 h-7 rounded-md border border-white/10 bg-bg-secondary/80 text-white/40
                         hover:text-cyan-neon/70 hover:border-cyan-neon/30 transition-colors
                         flex items-center justify-center"
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Zoom indicator */}
        {zoom !== 1 && (
          <div className="absolute bottom-3 right-3 z-10 text-[8px] font-mono text-white/20">
            {Math.round(zoom * 100)}%
          </div>
        )}

        {/* Empty / loading states */}
        <AnimatePresence>
          {!loading && points.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            >
              <motion.div
                animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.98, 1.02, 0.98] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <Network size={36} className="text-white/8" />
              </motion.div>
              <p className="text-[10px] font-mono text-white/15 tracking-widest">
                Select a collection and click Load
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SVG scatter plot */}
        {points.length > 0 && (
          <svg
            ref={svgRef}
            width={dimensions.w}
            height={dimensions.h}
            className="absolute inset-0 select-none"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => { onMouseUp(); setHoveredPt(null) }}
          >
            <defs>
              {/* Radial glow filter per color */}
              {['#00ff88', '#ff2244', '#ffaa00', '#b347ff', '#00f5ff'].map((c) => (
                <filter key={c} id={`glow-${c.slice(1)}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              ))}
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

              {/* Cluster blob backgrounds */}
              {clusterBlobs.map((b) => (
                <ellipse
                  key={b.key}
                  cx={b.cx} cy={b.cy}
                  rx={b.rx} ry={b.ry}
                  fill={`${b.color}06`}
                  stroke={`${b.color}14`}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
              ))}

              {/* Grid hint lines */}
              {[0.25, 0.5, 0.75].map((f) => (
                <React.Fragment key={f}>
                  <line
                    x1={dimensions.w * f} y1={PADDING}
                    x2={dimensions.w * f} y2={dimensions.h - PADDING}
                    stroke="rgba(0,245,255,0.025)" strokeWidth={1}
                  />
                  <line
                    x1={PADDING} y1={dimensions.h * f}
                    x2={dimensions.w - PADDING} y2={dimensions.h * f}
                    stroke="rgba(0,245,255,0.025)" strokeWidth={1}
                  />
                </React.Fragment>
              ))}

              {/* Points */}
              {visiblePoints.map((pt, i) => {
                const color    = dotColor(pt)
                const isHov    = hoveredPt?.id === pt.id
                const isSel    = selectedPt?.id === pt.id
                const isThreat = pt.label !== 0
                const r        = isSel ? POINT_R + 2.5 : isHov ? POINT_R + 1.5 : POINT_R

                return (
                  <motion.circle
                    key={pt.id}
                    cx={pt.cx}
                    cy={pt.cy}
                    r={r}
                    fill={`${color}${isSel || isHov ? 'cc' : '70'}`}
                    stroke={color}
                    strokeWidth={isSel ? 2 : isHov ? 1.5 : 0.8}
                    filter={isThreat ? `url(#glow-${color.slice(1)})` : undefined}
                    style={{ cursor: 'pointer' }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale:   1,
                      opacity: 1,
                      r,
                    }}
                    transition={{
                      delay:    Math.min(i * 0.003, 0.6),
                      duration: 0.3,
                    }}
                    onMouseEnter={() => setHoveredPt(pt)}
                    onMouseLeave={() => setHoveredPt(null)}
                    onClick={(e) => { e.stopPropagation(); handlePointClick(pt) }}
                  />
                )
              })}

              {/* Selection ring */}
              {selectedPt && (() => {
                const pt = visiblePoints.find((p) => p.id === selectedPt.id)
                if (!pt) return null
                const color = dotColor(pt)
                return (
                  <motion.circle
                    cx={pt.cx} cy={pt.cy}
                    r={POINT_R + 6}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                    style={{ transformOrigin: `${pt.cx}px ${pt.cy}px`, opacity: 0.7 }}
                  />
                )
              })()}
            </g>
          </svg>
        )}

        {/* Hover tooltip (in canvas overlay) */}
        <AnimatePresence>
          {hoveredPt && !selectedPt && (
            <PointTooltip
              pt={hoveredPt}
              zoom={zoom}
              pan={pan}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Selected node detail (SimilarityNode) ───────────────── */}
      <AnimatePresence>
        {selectedPt && (
          <motion.div
            key="selected-detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-xl border p-4 flex items-start gap-5"
              style={{
                background:  'rgba(6,13,26,0.6)',
                borderColor: `${dotColor(selectedPt)}20`,
              }}
            >
              {/* Node widget */}
              <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 72 }}>
                <SimilarityNode
                  id={selectedPt.id}
                  label={selectedPt.id?.slice(0, 6) ?? 'Node'}
                  score={selectedPt.label === 0 ? 0 : 85}
                  isPoison={selectedPt.label !== 0}
                  content={selectedPt.content_preview ?? ''}
                  source={collection}
                  size="md"
                  active
                  selected
                />
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[9px] font-mono font-bold tracking-widest uppercase"
                    style={{ color: dotColor(selectedPt) }}
                  >
                    {selectedPt.label === 0 ? 'CLEAN' : (selectedPt.severity ?? 'THREAT')}
                  </span>
                  <button
                    onClick={() => setSelectedPt(null)}
                    className="text-[8px] font-mono text-white/20 hover:text-white/50 transition-colors"
                  >
                    CLOSE
                  </button>
                </div>

                {selectedPt.content_preview && (
                  <p className="text-[11px] font-mono text-white/55 leading-relaxed mb-2">
                    {selectedPt.content_preview}
                  </p>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[8px] font-mono text-white/20">
                    id: {selectedPt.id?.slice(0, 12)}…
                  </span>
                  <span className="text-[8px] font-mono text-white/20">
                    src: {collection}
                  </span>
                  {selectedPt.severity && (
                    <span className="text-[8px] font-mono" style={{ color: dotColor(selectedPt) }}>
                      sev: {selectedPt.severity}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Footer: legend + info ────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-white/5">
        <Legend counts={counts} />
        <div className="flex items-center gap-1.5 text-white/15">
          <Info size={9} />
          <span className="text-[8px] font-mono">Scroll to zoom · drag to pan · click node to inspect</span>
        </div>
      </div>
    </div>
  )
}
