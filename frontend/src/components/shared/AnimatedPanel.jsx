/**
 * AnimatedPanel.jsx — Framer Motion page/section wrapper
 * ════════════════════════════════════════════════════════
 * Wraps any content with entrance animations.
 * Used at the page level (full page fade+slide) and at
 * the section level (staggered children).
 *
 * Props:
 *   variant   — 'page' | 'section' | 'card' | 'fade' | 'slide-up' | 'slide-right'
 *   delay     — animation delay in seconds
 *   duration  — animation duration in seconds
 *   stagger   — stagger children (seconds between each child)
 *   className
 *   children
 */

import React from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'

// ── Preset animation variants ──────────────────────────────────────
const PRESETS = {
  page: {
    initial:  { opacity: 0, y: 16 },
    animate:  { opacity: 1, y: 0  },
    exit:     { opacity: 0, y: -8 },
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  section: {
    initial:  { opacity: 0, y: 12 },
    animate:  { opacity: 1, y: 0  },
    exit:     { opacity: 0 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  card: {
    initial:  { opacity: 0, scale: 0.97, y: 8 },
    animate:  { opacity: 1, scale: 1,    y: 0 },
    exit:     { opacity: 0, scale: 0.97 },
    transition: { duration: 0.25, ease: 'easeOut' },
  },
  fade: {
    initial:  { opacity: 0 },
    animate:  { opacity: 1 },
    exit:     { opacity: 0 },
    transition: { duration: 0.25 },
  },
  'slide-up': {
    initial:  { opacity: 0, y: 24 },
    animate:  { opacity: 1, y: 0  },
    exit:     { opacity: 0, y: 8  },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  'slide-right': {
    initial:  { opacity: 0, x: -20 },
    animate:  { opacity: 1, x: 0   },
    exit:     { opacity: 0, x: -10 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
}

// ── Stagger container variant ──────────────────────────────────────
const makeStagger = (stagger) => ({
  hidden:  { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: stagger, delayChildren: 0.05 },
  },
})

const staggerChild = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.28, ease: 'easeOut' } },
}

// ── Component ──────────────────────────────────────────────────────
export default function AnimatedPanel({
  children,
  variant   = 'section',
  delay     = 0,
  duration,
  stagger,
  className = '',
  ...rest
}) {
  // Stagger container mode
  if (stagger) {
    return (
      <motion.div
        variants={makeStagger(stagger)}
        initial="hidden"
        animate="show"
        className={className}
        {...rest}
      >
        {React.Children.map(children, (child, i) =>
          child ? (
            <motion.div key={i} variants={staggerChild}>
              {child}
            </motion.div>
          ) : null
        )}
      </motion.div>
    )
  }

  const preset = PRESETS[variant] ?? PRESETS.section
  const transition = {
    ...preset.transition,
    ...(duration ? { duration } : {}),
    delay,
  }

  return (
    <motion.div
      initial={preset.initial}
      animate={preset.animate}
      exit={preset.exit}
      transition={transition}
      className={clsx(className)}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

// ── Named export for stagger children ─────────────────────────────
// Usage: wrap individual children with <StaggerItem> inside a
//        <AnimatedPanel stagger={0.07}> parent
export function StaggerItem({ children, className = '' }) {
  return (
    <motion.div variants={staggerChild} className={className}>
      {children}
    </motion.div>
  )
}
