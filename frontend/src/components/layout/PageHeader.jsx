/**
 * PageHeader.jsx — Reusable page-level header
 * ════════════════════════════════════════════
 * Renders the title block + optional action buttons
 * at the top of every SOC page.
 *
 * Props:
 *   title       — main heading text
 *   subtitle    — secondary descriptor line
 *   icon        — Lucide icon component shown left of title
 *   iconColor   — neon colour for icon glow (CSS colour string)
 *   actions     — ReactNode — buttons / controls rendered on the right
 *   badge       — { label, variant } — small status badge next to title
 *   divider     — show bottom divider line (default true)
 *   className
 */

import React from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'

const BADGE_VARIANTS = {
  live:      { bg: 'rgba(0,255,136,0.1)',  border: 'rgba(0,255,136,0.3)',  color: '#00ff88', dot: true  },
  warning:   { bg: 'rgba(255,170,0,0.1)',  border: 'rgba(255,170,0,0.3)',  color: '#ffaa00', dot: false },
  critical:  { bg: 'rgba(255,34,68,0.12)', border: 'rgba(255,34,68,0.35)', color: '#ff2244', dot: true  },
  info:      { bg: 'rgba(0,245,255,0.08)', border: 'rgba(0,245,255,0.25)', color: '#00f5ff', dot: false },
  purple:    { bg: 'rgba(179,71,255,0.1)', border: 'rgba(179,71,255,0.3)', color: '#b347ff', dot: false },
}

export default function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconColor  = '#00f5ff',
  actions,
  badge,
  divider    = true,
  className  = '',
}) {
  const badgeCfg = badge ? (BADGE_VARIANTS[badge.variant] ?? BADGE_VARIANTS.info) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1,  y:  0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={clsx('mb-6', className)}
    >
      <div className="flex items-start justify-between gap-4">

        {/* ── Left: icon + title block ─────────────────────────── */}
        <div className="flex items-center gap-4 min-w-0">

          {/* Page icon */}
          {Icon && (
            <div
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: `${iconColor}10`,
                border: `1px solid ${iconColor}25`,
                boxShadow: `0 0 16px ${iconColor}15`,
              }}
            >
              <Icon size={20} style={{ color: iconColor, filter: `drop-shadow(0 0 4px ${iconColor})` }} strokeWidth={1.6} />
            </div>
          )}

          {/* Title + subtitle + badge */}
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1
                className="text-xl font-bold text-white tracking-tight leading-none"
                style={{ textShadow: '0 0 20px rgba(255,255,255,0.1)' }}
              >
                {title}
              </h1>

              {/* Status badge */}
              {badge && badgeCfg && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold tracking-widest uppercase flex-shrink-0"
                  style={{
                    background:  badgeCfg.bg,
                    border:      `1px solid ${badgeCfg.border}`,
                    color:       badgeCfg.color,
                  }}
                >
                  {badgeCfg.dot && (
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-neon-pulse"
                      style={{ background: badgeCfg.color }}
                    />
                  )}
                  {badge.label}
                </span>
              )}
            </div>

            {subtitle && (
              <p className="text-[12px] text-white/35 font-mono mt-1.5 leading-snug truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* ── Right: action buttons ────────────────────────────── */}
        {actions && (
          <div className="flex-shrink-0 flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Divider */}
      {divider && (
        <div
          className="mt-5 h-px w-full"
          style={{
            background:
              'linear-gradient(90deg, rgba(0,245,255,0.2) 0%, rgba(0,245,255,0.06) 40%, transparent 100%)',
          }}
        />
      )}
    </motion.div>
  )
}
