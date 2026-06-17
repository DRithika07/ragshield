/**
 * GlassCard.jsx — Core glassmorphism panel primitive
 * ════════════════════════════════════════════════════
 * The fundamental UI building block. Every panel, widget,
 * and card in the SOC is built on top of this component.
 *
 * Props:
 *   children     — content
 *   className    — additional Tailwind classes
 *   variant      — 'default' | 'cyan' | 'purple' | 'red' | 'green' | 'amber'
 *   hover        — enable hover glow effect
 *   glow         — always-on glow border
 *   corners      — show holographic corner brackets
 *   padding      — 'none' | 'sm' | 'md' | 'lg'
 *   onClick      — click handler
 */

import React from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'

const VARIANTS = {
  default: {
    bg:     'bg-bg-secondary/70',
    border: 'border-border-default',
    glow:   '',
    hover:  'hover:border-cyan-neon/30 hover:shadow-[0_0_20px_rgba(0,245,255,0.08)]',
  },
  cyan: {
    bg:     'bg-cyan-glow',
    border: 'border-cyan-neon/20',
    glow:   'shadow-neon-cyan',
    hover:  'hover:border-cyan-neon/50 hover:shadow-neon-cyan',
  },
  purple: {
    bg:     'bg-purple-glow',
    border: 'border-purple-neon/20',
    glow:   'shadow-neon-purple',
    hover:  'hover:border-purple-neon/50 hover:shadow-neon-purple',
  },
  red: {
    bg:     'bg-red-glow',
    border: 'border-red-neon/20',
    glow:   'shadow-neon-red',
    hover:  'hover:border-red-neon/50 hover:shadow-neon-red',
  },
  green: {
    bg:     'bg-green-glow',
    border: 'border-green-neon/20',
    glow:   'shadow-neon-green',
    hover:  'hover:border-green-neon/50 hover:shadow-neon-green',
  },
  amber: {
    bg:     'bg-amber-glow',
    border: 'border-amber-neon/20',
    glow:   'shadow-neon-amber',
    hover:  'hover:border-amber-neon/50 hover:shadow-neon-amber',
  },
}

const PADDING = {
  none: 'p-0',
  sm:   'p-3',
  md:   'p-5',
  lg:   'p-7',
}

export default function GlassCard({
  children,
  className = '',
  variant   = 'default',
  hover     = false,
  glow      = false,
  corners   = false,
  padding   = 'md',
  onClick,
  as        = 'div',
  ...rest
}) {
  const v = VARIANTS[variant] ?? VARIANTS.default

  const classes = clsx(
    // Base glass effect
    'relative rounded-panel border backdrop-blur-glass overflow-hidden',
    'bg-bg-secondary/70',
    'shadow-glass',
    'transition-all duration-400',
    // Variant styles
    v.border,
    glow && v.glow,
    hover && v.hover,
    hover && 'cursor-pointer',
    // Padding
    PADDING[padding] ?? PADDING.md,
    className
  )

  const Comp = motion[as] ?? motion.div

  return (
    <Comp
      className={classes}
      onClick={onClick}
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      {...rest}
    >
      {/* Scanline overlay — subtle holographic texture */}
      <div className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,245,255,0.008) 2px,rgba(0,245,255,0.008) 4px)',
        }}
      />

      {/* Top edge highlight — glass light refraction */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)' }}
      />

      {/* Corner bracket decorations */}
      {corners && <CornerBrackets variant={variant} />}

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </Comp>
  )
}

function CornerBrackets({ variant }) {
  const colorMap = {
    default: 'rgba(0,245,255,0.4)',
    cyan:    'rgba(0,245,255,0.7)',
    purple:  'rgba(179,71,255,0.7)',
    red:     'rgba(255,34,68,0.7)',
    green:   'rgba(0,255,136,0.7)',
    amber:   'rgba(255,170,0,0.7)',
  }
  const c = colorMap[variant] ?? colorMap.default

  const bracket = (pos) => {
    const isTop    = pos.includes('top')
    const isLeft   = pos.includes('left')
    return (
      <div
        key={pos}
        className="absolute w-4 h-4"
        style={{
          top:    isTop    ? -1 : 'auto',
          bottom: !isTop   ? -1 : 'auto',
          left:   isLeft   ? -1 : 'auto',
          right:  !isLeft  ? -1 : 'auto',
          borderColor: c,
          borderStyle: 'solid',
          borderWidth: 0,
          borderTopWidth:    isTop  ? 2 : 0,
          borderBottomWidth: !isTop ? 2 : 0,
          borderLeftWidth:   isLeft  ? 2 : 0,
          borderRightWidth:  !isLeft ? 2 : 0,
          borderRadius: isTop && isLeft   ? '4px 0 0 0'
                      : isTop && !isLeft  ? '0 4px 0 0'
                      : !isTop && isLeft  ? '0 0 0 4px'
                      :                    '0 0 4px 0',
        }}
      />
    )
  }

  return <>
    {['top-left','top-right','bottom-left','bottom-right'].map(bracket)}
  </>
}
