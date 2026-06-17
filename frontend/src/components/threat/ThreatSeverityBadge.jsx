/**
 * ThreatSeverityBadge.jsx — Reusable severity indicator
 * ═══════════════════════════════════════════════════════
 * Props:
 *   severity  — 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 *   size      — 'xs' | 'sm' | 'md' | 'lg'
 *   pulse     — animate glow on CRITICAL/HIGH
 *   showIcon  — prepend status dot
 *   className
 */

import React from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, ShieldAlert, Shield, Zap } from 'lucide-react'
import clsx from 'clsx'

export const SEVERITY_MAP = {
  NONE:     { label: 'SAFE',     color: '#00ff88', bg: 'rgba(0,255,136,0.10)', border: 'rgba(0,255,136,0.30)', icon: ShieldCheck, pulse: false },
  LOW:      { label: 'LOW',      color: '#facc15', bg: 'rgba(250,204,21,0.10)', border: 'rgba(250,204,21,0.30)', icon: Shield,      pulse: false },
  MEDIUM:   { label: 'MEDIUM',   color: '#f97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.30)', icon: ShieldAlert, pulse: false },
  HIGH:     { label: 'HIGH',     color: '#ff2244', bg: 'rgba(255,34,68,0.12)',  border: 'rgba(255,34,68,0.35)',  icon: ShieldAlert, pulse: true  },
  CRITICAL: { label: 'CRITICAL', color: '#ff2244', bg: 'rgba(255,34,68,0.18)',  border: 'rgba(255,34,68,0.55)',  icon: Zap,         pulse: true  },
}

const SIZES = {
  xs: { text: 'text-[9px]',  px: 'px-2 py-0.5',  icon: 9,  gap: 'gap-1'   },
  sm: { text: 'text-[10px]', px: 'px-2.5 py-1',  icon: 10, gap: 'gap-1.5' },
  md: { text: 'text-[11px]', px: 'px-3 py-1.5',  icon: 11, gap: 'gap-1.5' },
  lg: { text: 'text-[13px]', px: 'px-4 py-2',    icon: 13, gap: 'gap-2'   },
}

export default function ThreatSeverityBadge({
  severity  = 'NONE',
  size      = 'sm',
  pulse     = true,
  showIcon  = true,
  className = '',
}) {
  const cfg = SEVERITY_MAP[severity] ?? SEVERITY_MAP.NONE
  const sz  = SIZES[size] ?? SIZES.sm
  const Icon = cfg.icon
  const doPulse = pulse && cfg.pulse

  return (
    <motion.span
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1,    opacity: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={clsx(
        'inline-flex items-center rounded-lg font-mono font-bold tracking-widest uppercase select-none flex-shrink-0',
        sz.px, sz.text, sz.gap,
        doPulse && 'animate-neon-pulse',
        className
      )}
      style={{
        color:       cfg.color,
        background:  cfg.bg,
        border:      `1px solid ${cfg.border}`,
        boxShadow:   doPulse ? `0 0 12px ${cfg.color}30` : 'none',
      }}
    >
      {showIcon && (
        <Icon size={sz.icon} strokeWidth={2} style={{ flexShrink: 0 }} />
      )}
      {cfg.label}
    </motion.span>
  )
}
