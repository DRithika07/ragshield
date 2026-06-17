/**
 * NotificationCenter.jsx — Global toast notification system
 * ═══════════════════════════════════════════════════════════
 * Renders animated toast messages in the top-right corner.
 * Reads from the Zustand `activeAlert` slice and also manages
 * a local queue so multiple toasts can stack.
 *
 * Toast types:
 *   threat   — red, AlertTriangle icon, urgent pulse
 *   error    — red, XCircle icon
 *   success  — green, CheckCircle icon
 *   info     — cyan, Info icon
 *   warning  — amber, AlertCircle icon
 *
 * Auto-dismisses after 5 seconds.
 * User can manually dismiss with X button.
 */

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, CheckCircle, XCircle,
  Info, AlertCircle, X, Shield,
} from 'lucide-react'
import useSentinelStore from '@/store/useSentinelStore.js'

// ── Toast configuration ────────────────────────────────────────────
const TOAST_CONFIG = {
  threat: {
    icon:   AlertTriangle,
    color:  '#ff2244',
    bg:     'rgba(255,34,68,0.10)',
    border: 'rgba(255,34,68,0.35)',
    glow:   '0 0 20px rgba(255,34,68,0.15)',
    label:  'THREAT DETECTED',
    pulse:  true,
  },
  error: {
    icon:   XCircle,
    color:  '#ff2244',
    bg:     'rgba(255,34,68,0.08)',
    border: 'rgba(255,34,68,0.25)',
    glow:   '0 0 16px rgba(255,34,68,0.10)',
    label:  'ERROR',
    pulse:  false,
  },
  success: {
    icon:   CheckCircle,
    color:  '#00ff88',
    bg:     'rgba(0,255,136,0.08)',
    border: 'rgba(0,255,136,0.28)',
    glow:   '0 0 16px rgba(0,255,136,0.10)',
    label:  'SUCCESS',
    pulse:  false,
  },
  info: {
    icon:   Info,
    color:  '#00f5ff',
    bg:     'rgba(0,245,255,0.07)',
    border: 'rgba(0,245,255,0.22)',
    glow:   '0 0 16px rgba(0,245,255,0.08)',
    label:  'INFO',
    pulse:  false,
  },
  warning: {
    icon:   AlertCircle,
    color:  '#ffaa00',
    bg:     'rgba(255,170,0,0.08)',
    border: 'rgba(255,170,0,0.28)',
    glow:   '0 0 16px rgba(255,170,0,0.10)',
    label:  'WARNING',
    pulse:  false,
  },
}

// ── Toast item component ───────────────────────────────────────────
function ToastItem({ toast, onDismiss }) {
  const cfg   = TOAST_CONFIG[toast.type] ?? TOAST_CONFIG.info
  const Icon  = cfg.icon
  const timerRef = useRef(null)

  // Progress bar state
  const [progress, setProgress] = useState(100)
  const DURATION = 5000

  useEffect(() => {
    const start = Date.now()

    const tick = () => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100)
      setProgress(remaining)
      if (remaining > 0) {
        timerRef.current = requestAnimationFrame(tick)
      } else {
        onDismiss(toast.id)
      }
    }

    timerRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(timerRef.current)
  }, [toast.id, onDismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{ opacity: 0, x: 40, scale: 0.92, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="relative overflow-hidden rounded-xl w-80"
      style={{
        background:      cfg.bg,
        border:          `1px solid ${cfg.border}`,
        backdropFilter:  'blur(16px)',
        boxShadow:       `0 8px 32px rgba(0,0,0,0.4), ${cfg.glow}`,
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, ${cfg.color}80, transparent)` }}
      />

      <div className="p-4">
        <div className="flex items-start gap-3">

          {/* Icon */}
          <div
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
            style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}25` }}
          >
            <Icon
              size={15}
              style={{ color: cfg.color }}
              className={cfg.pulse ? 'animate-neon-pulse-fast' : ''}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span
                className="text-[9px] font-mono font-bold tracking-[0.2em]"
                style={{ color: cfg.color }}
              >
                {cfg.label}
              </span>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-white/25 hover:text-white/60 transition-colors flex-shrink-0"
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-[12px] text-white/75 font-mono leading-snug">
              {toast.message}
            </p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-white/5">
        <motion.div
          className="h-full"
          style={{
            width:      `${progress}%`,
            background: cfg.color,
            boxShadow:  `0 0 4px ${cfg.color}`,
          }}
          transition={{ duration: 0.05 }}
        />
      </div>
    </motion.div>
  )
}

// ── Notification Center (portal-rendered) ─────────────────────────
export default function NotificationCenter() {
  const activeAlert = useSentinelStore((s) => s.activeAlert)
  const clearAlert  = useSentinelStore((s) => s.clearAlert)

  // Local toast queue — multiple toasts can be displayed at once
  const [toasts, setToasts] = useState([])
  const seen = useRef(new Set())

  // Sync Zustand alert → local toast queue
  useEffect(() => {
    if (!activeAlert) return
    if (seen.current.has(activeAlert.id)) return

    seen.current.add(activeAlert.id)
    setToasts((prev) => [
      { ...activeAlert, timestamp: Date.now() },
      ...prev,
    ].slice(0, 5)) // max 5 toasts visible at once
  }, [activeAlert])

  const dismiss = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    if (activeAlert?.id === id) clearAlert()
  }

  // Portal ensures toasts render above all other UI layers
  return createPortal(
    <div
      className="fixed top-20 right-4 z-[9999] flex flex-col gap-3 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}
