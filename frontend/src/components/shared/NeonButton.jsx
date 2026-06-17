/**
 * NeonButton.jsx — Cyberpunk button system
 * ══════════════════════════════════════════
 * Props:
 *   variant  — 'cyan' | 'purple' | 'red' | 'green' | 'amber' | 'ghost'
 *   size     — 'xs' | 'sm' | 'md' | 'lg'
 *   icon     — Lucide icon component (rendered left of label)
 *   iconRight— Lucide icon component (rendered right of label)
 *   loading  — show spinner + disable
 *   disabled
 *   pulse    — animate-neon-pulse on the button
 *   full     — w-full
 */

import React from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'

const VARIANTS = {
  cyan: {
    base:   'bg-cyan-neon/8 border-cyan-neon/35 text-cyan-neon',
    hover:  'hover:bg-cyan-neon/15 hover:border-cyan-neon hover:shadow-neon-cyan',
    active: 'active:bg-cyan-neon/25',
    ring:   'focus-visible:ring-cyan-neon/40',
    loader: 'text-cyan-neon',
  },
  purple: {
    base:   'bg-purple-neon/8 border-purple-neon/35 text-purple-neon',
    hover:  'hover:bg-purple-neon/15 hover:border-purple-neon hover:shadow-neon-purple',
    active: 'active:bg-purple-neon/25',
    ring:   'focus-visible:ring-purple-neon/40',
    loader: 'text-purple-neon',
  },
  red: {
    base:   'bg-red-neon/8 border-red-neon/35 text-red-neon',
    hover:  'hover:bg-red-neon/15 hover:border-red-neon hover:shadow-neon-red',
    active: 'active:bg-red-neon/25',
    ring:   'focus-visible:ring-red-neon/40',
    loader: 'text-red-neon',
  },
  green: {
    base:   'bg-green-neon/8 border-green-neon/35 text-green-neon',
    hover:  'hover:bg-green-neon/15 hover:border-green-neon hover:shadow-neon-green',
    active: 'active:bg-green-neon/25',
    ring:   'focus-visible:ring-green-neon/40',
    loader: 'text-green-neon',
  },
  amber: {
    base:   'bg-amber-neon/8 border-amber-neon/35 text-amber-neon',
    hover:  'hover:bg-amber-neon/15 hover:border-amber-neon hover:shadow-neon-amber',
    active: 'active:bg-amber-neon/25',
    ring:   'focus-visible:ring-amber-neon/40',
    loader: 'text-amber-neon',
  },
  ghost: {
    base:   'bg-transparent border-white/10 text-white/50',
    hover:  'hover:bg-white/5 hover:border-white/25 hover:text-white/80',
    active: 'active:bg-white/10',
    ring:   'focus-visible:ring-white/20',
    loader: 'text-white/50',
  },
}

const SIZES = {
  xs: 'h-7  px-3   text-[11px] gap-1.5 rounded-md',
  sm: 'h-8  px-4   text-xs     gap-2   rounded-lg',
  md: 'h-9  px-5   text-[13px] gap-2   rounded-lg',
  lg: 'h-11 px-6   text-sm     gap-2.5 rounded-xl',
}

const ICON_SIZES = { xs: 12, sm: 13, md: 14, lg: 16 }

export default function NeonButton({
  children,
  variant   = 'cyan',
  size      = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading   = false,
  disabled  = false,
  pulse     = false,
  full      = false,
  className = '',
  onClick,
  type      = 'button',
  ...rest
}) {
  const v  = VARIANTS[variant] ?? VARIANTS.cyan
  const sz = SIZES[size] ?? SIZES.md
  const iconSz = ICON_SIZES[size] ?? 14

  const isDisabled = disabled || loading

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      whileTap={!isDisabled ? { scale: 0.96 } : undefined}
      whileHover={!isDisabled ? { y: -1 } : undefined}
      transition={{ duration: 0.15 }}
      className={clsx(
        // Base layout
        'relative inline-flex items-center justify-center font-mono font-medium',
        'border select-none outline-none',
        'transition-all duration-200',
        'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
        // Size
        sz,
        // Variant
        v.base,
        !isDisabled && v.hover,
        !isDisabled && v.active,
        v.ring,
        // States
        isDisabled && 'opacity-40 cursor-not-allowed',
        pulse && !isDisabled && 'animate-neon-pulse',
        full && 'w-full',
        className
      )}
      {...rest}
    >
      {/* Shimmer on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden">
        <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 50%, transparent 60%)',
          }}
        />
      </div>

      {/* Content */}
      {loading
        ? <Loader2 size={iconSz} className={clsx('animate-spin', v.loader)} />
        : Icon && <Icon size={iconSz} strokeWidth={1.8} />
      }

      {children && (
        <span className="relative tracking-wider uppercase text-[0.75em] font-semibold">
          {children}
        </span>
      )}

      {IconRight && !loading && (
        <IconRight size={iconSz} strokeWidth={1.8} />
      )}
    </motion.button>
  )
}
