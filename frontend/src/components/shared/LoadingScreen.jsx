/**
 * LoadingScreen.jsx — Futuristic full-screen loading state
 *══════════════════════════════════════════════════════════
 * Shown by React Suspense while lazy page chunks load.
 * Also used manually during heavy operations.
 *
 * Features:
 *   - Animated radar sweep
 *   - Scanning text with typewriter effect
 *   - Orbiting particle ring
 *   - System boot log lines
 */

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield } from 'lucide-react'

const BOOT_LINES = [
  'Initializing Sentinel-RAG Security Core...',
  'Loading threat detection models...',
  'Connecting to ChromaDB vector store...',
  'Activating agent orchestration layer...',
  'Establishing secure API connection...',
  'System ready.',
]

export default function LoadingScreen({ message = 'Initializing SOC Systems' }) {
  const [lineIndex, setLineIndex] = useState(0)
  const [progress,  setProgress]  = useState(0)

  useEffect(() => {
    // Cycle through boot log lines
    const lineTimer = setInterval(() => {
      setLineIndex((i) => (i + 1) % BOOT_LINES.length)
    }, 600)

    // Animate progress bar
    const progTimer = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 12, 95))
    }, 300)

    return () => { clearInterval(lineTimer); clearInterval(progTimer) }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-primary overflow-hidden">

      {/* Background grid */}
      <div className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,245,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,0.04) 1px,transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%,rgba(0,245,255,0.06) 0%,transparent 65%)' }}
      />

      {/* ── Radar ring ─────────────────────────────────────────── */}
      <div className="relative mb-10">
        {/* Outer static ring */}
        <div className="w-32 h-32 rounded-full border border-cyan-neon/10 flex items-center justify-center">
          {/* Mid ring */}
          <div className="w-24 h-24 rounded-full border border-cyan-neon/20 flex items-center justify-center">
            {/* Inner ring */}
            <div className="w-16 h-16 rounded-full border border-cyan-neon/30 flex items-center justify-center">

              {/* Core shield */}
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-10 h-10 rounded-full bg-cyan-neon/10 flex items-center justify-center"
                style={{ boxShadow: '0 0 20px rgba(0,245,255,0.3)' }}
              >
                <Shield size={20} className="text-cyan-neon" />
              </motion.div>
            </div>
          </div>
        </div>

        {/* Radar sweep arm */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full overflow-hidden"
        >
          <div className="w-1/2 h-full absolute right-0 origin-left"
            style={{
              background: 'conic-gradient(from 0deg,transparent 0%,rgba(0,245,255,0.15) 100%)',
            }}
          />
          {/* Sweep tip dot */}
          <div className="absolute top-1/2 right-0 w-1.5 h-1.5 -mt-0.75 -mr-0.75 rounded-full bg-cyan-neon"
            style={{ boxShadow: '0 0 8px rgba(0,245,255,0.9)' }}
          />
        </motion.div>

        {/* Orbiting particles */}
        {[0, 60, 120, 180, 240, 300].map((deg, i) => (
          <motion.div
            key={i}
            animate={{ rotate: 360 }}
            transition={{ duration: 4 + i * 0.3, repeat: Infinity, ease: 'linear', delay: i * 0.15 }}
            className="absolute inset-0"
            style={{ transformOrigin: '50% 50%' }}
          >
            <div
              className="w-1 h-1 rounded-full bg-cyan-neon/60 absolute"
              style={{
                top: '50%', left: '50%',
                transform: `rotate(${deg}deg) translateX(60px) translate(-50%,-50%)`,
              }}
            />
          </motion.div>
        ))}
      </div>

      {/* ── Title ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-center mb-8"
      >
        <h1 className="font-display text-2xl font-bold tracking-widest text-cyan-neon mb-1"
          style={{ textShadow: '0 0 20px rgba(0,245,255,0.5)' }}>
          SENTINEL-RAG
        </h1>
        <p className="text-white/30 text-xs font-mono tracking-[0.3em] uppercase">
          AI Security Operations Center
        </p>
      </motion.div>

      {/* ── Progress bar ────────────────────────────────────────── */}
      <div className="w-64 mb-5">
        <div className="flex justify-between mb-1.5">
          <span className="text-[10px] font-mono text-cyan-neon/50 tracking-widest uppercase">Loading</span>
          <span className="text-[10px] font-mono text-cyan-neon/70">{Math.round(progress)}%</span>
        </div>
        <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg,rgba(0,245,255,0.6),#00f5ff)',
              boxShadow: '0 0 8px rgba(0,245,255,0.6)',
            }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* ── Boot log ────────────────────────────────────────────── */}
      <div className="h-6 flex items-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={lineIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-[11px] font-mono text-cyan-neon/40 tracking-wide"
          >
            <span className="text-cyan-neon/60 mr-2">›</span>
            {BOOT_LINES[lineIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* ── Corner decorations ──────────────────────────────────── */}
      {[
        'top-4 left-4 border-t-2 border-l-2 rounded-tl-lg',
        'top-4 right-4 border-t-2 border-r-2 rounded-tr-lg',
        'bottom-4 left-4 border-b-2 border-l-2 rounded-bl-lg',
        'bottom-4 right-4 border-b-2 border-r-2 rounded-br-lg',
      ].map((cls, i) => (
        <div key={i} className={`absolute w-8 h-8 border-cyan-neon/25 ${cls}`} />
      ))}
    </div>
  )
}
