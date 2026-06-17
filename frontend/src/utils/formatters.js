/**
 * formatters.js — Shared display utility functions
 * Used by components to format numbers, dates, scores, etc.
 */

import { formatDistanceToNow, format } from 'date-fns'

/** Format a 0-1 score as a percentage string */
export const fmtScore = (score) =>
  score != null ? `${(score * 100).toFixed(1)}%` : '—'

/** Format a 0-1 score as a 0-100 integer */
export const fmtScoreInt = (score) =>
  score != null ? Math.round(score * 100) : 0

/** Format ISO date as relative time ("3 minutes ago") */
export const fmtRelative = (dateStr) => {
  if (!dateStr) return '—'
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch { return '—' }
}

/** Format ISO date as readable timestamp */
export const fmtTimestamp = (dateStr) => {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'MMM dd, HH:mm:ss')
  } catch { return '—' }
}

/** Format attack type slug to display label */
export const fmtAttackType = (type) => {
  if (!type) return 'Unknown'
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Truncate text to maxLen chars */
export const fmtTruncate = (text, maxLen = 80) => {
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

/** Format large numbers with k/M suffix */
export const fmtNumber = (n) => {
  if (n == null) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/** Get severity color from SEVERITY_CONFIG */
export const getSeverityColor = (severity) => {
  const map = {
    CRITICAL: '#ff2244',
    HIGH:     '#ffaa00',
    MEDIUM:   '#b347ff',
    LOW:      '#00f5ff',
    NONE:     '#00ff88',
  }
  return map[severity] ?? '#666'
}

/** Get severity background */
export const getSeverityBg = (severity) => {
  const map = {
    CRITICAL: 'rgba(255,34,68,0.12)',
    HIGH:     'rgba(255,170,0,0.12)',
    MEDIUM:   'rgba(179,71,255,0.12)',
    LOW:      'rgba(0,245,255,0.10)',
    NONE:     'rgba(0,255,136,0.10)',
  }
  return map[severity] ?? 'rgba(255,255,255,0.05)'
}
