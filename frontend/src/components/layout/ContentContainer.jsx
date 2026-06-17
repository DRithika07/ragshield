/**
 * ContentContainer.jsx — Page content area wrapper
 * ══════════════════════════════════════════════════
 * Enforces consistent padding, max-width, and scroll
 * behaviour across every page in the SOC.
 *
 * Props:
 *   children
 *   className   — additional classes
 *   maxWidth    — 'full' | 'xl' | '2xl' (default 'full')
 *   noPadding   — strip default padding (for edge-to-edge layouts)
 *   scrollable  — override scroll behaviour (default true)
 */

import React from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'

const MAX_WIDTHS = {
  full: 'max-w-none',
  xl:   'max-w-7xl mx-auto',
  '2xl':'max-w-screen-2xl mx-auto',
}

// Page entrance animation — consistent across all routes
const pageVariants = {
  initial:  { opacity: 0, y: 14 },
  animate:  { opacity: 1, y: 0  },
  exit:     { opacity: 0, y: -6 },
}

const pageTransition = {
  duration: 0.32,
  ease: [0.25, 0.46, 0.45, 0.94],
}

export default function ContentContainer({
  children,
  className  = '',
  maxWidth   = 'full',
  noPadding  = false,
  scrollable = true,
}) {
  return (
    <motion.div
      key={window.location.pathname}   // re-animate on every route change
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className={clsx(
        'flex-1 w-full',
        scrollable && 'overflow-y-auto overflow-x-hidden',
        !noPadding && 'p-5 md:p-6',
        MAX_WIDTHS[maxWidth] ?? MAX_WIDTHS.full,
        className
      )}
    >
      {/* Ambient hero glow at the top of every page */}
      <div
        className="pointer-events-none fixed top-0 left-0 right-0 h-64 z-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% -20%, rgba(0,245,255,0.07) 0%, transparent 65%)',
        }}
      />

      {/* Content sits above the ambient glow */}
      <div className="relative z-10 h-full">
        {children}
      </div>
    </motion.div>
  )
}
