/**
 * Sidebar.jsx — Collapsible cyberpunk navigation
 * ═══════════════════════════════════════════════
 * Features:
 *   - Animated collapse/expand (260px ↔ 64px)
 *   - Active route highlighting with neon glow
 *   - Framer Motion hover effects on nav items
 *   - System status footer
 *   - Keyboard accessible
 */

import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Crosshair, GitBranch,
  Database, FileText, Shield,
  ChevronLeft, ChevronRight,
  Activity, Zap, Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import useSentinelStore from '@/store/useSentinelStore.js'

// ── Navigation items ───────────────────────────────────────────────
const NAV_ITEMS = [
  {
    to:    '/dashboard',
    icon:  LayoutDashboard,
    label: 'Dashboard',
    desc:  'Live threat monitor',
    color: '#00f5ff',
  },
  {
    to:    '/threat-analysis',
    icon:  Crosshair,
    label: 'Threat Analysis',
    desc:  'Analyze prompts',
    color: '#ff2244',
  },
  {
    to:    '/agents',
    icon:  GitBranch,
    label: 'Agent Workflow',
    desc:  'Pipeline visualizer',
    color: '#b347ff',
  },
  {
    to:    '/memory-poison',
    icon:  Database,
    label: 'Memory Poison',
    desc:  'RAG security scan',
    color: '#ffaa00',
  },
  {
    to:    '/reports',
    icon:  FileText,
    label: 'Reports',
    desc:  'Incident reports',
    color: '#00ff88',
  },
  {
    to:    '/demo',
    icon:  Sparkles,
    label: 'Agent Demo',
    desc:  'Ritz presents',
    color: '#ff6eb4',
  },
]

export default function Sidebar() {
  const collapsed        = useSentinelStore((s) => s.sidebarCollapsed)
  const toggleSidebar    = useSentinelStore((s) => s.toggleSidebar)
  const dashboardStats   = useSentinelStore((s) => s.dashboardStats)
  const location         = useLocation()

  const malicious = dashboardStats?.total_malicious ?? 0

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 260 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative flex flex-col flex-shrink-0 h-screen overflow-hidden z-40"
      style={{
        background: 'linear-gradient(180deg,#060d1a 0%,#020408 100%)',
        borderRight: '1px solid rgba(0,245,255,0.08)',
      }}
    >
      {/* ── Top glow accent ──────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(0,245,255,0.4),transparent)' }}
      />

      {/* ── Logo / Brand ─────────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center h-16 flex-shrink-0 border-b border-cyan-neon/8',
        collapsed ? 'justify-center px-0' : 'px-5 gap-3'
      )}>
        {/* Shield icon */}
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: 'rgba(0,245,255,0.08)',
            border: '1px solid rgba(0,245,255,0.25)',
            boxShadow: '0 0 12px rgba(0,245,255,0.15)',
          }}
        >
          <Shield size={16} className="text-cyan-neon" />
        </motion.div>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="font-display text-sm font-bold tracking-widest text-cyan-neon leading-none"
                style={{ textShadow: '0 0 10px rgba(0,245,255,0.4)' }}>
                SENTINEL
              </p>
              <p className="text-[9px] font-mono text-white/30 tracking-[0.25em] uppercase mt-0.5">
                RAG · SOC
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Navigation ───────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-1 px-2">

        {/* Section label */}
        <AnimatePresence>
          {!collapsed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[9px] font-mono text-white/20 tracking-[0.25em] uppercase px-3 py-2"
            >
              Navigation
            </motion.p>
          )}
        </AnimatePresence>

        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.to}
            item={item}
            collapsed={collapsed}
            isActive={location.pathname === item.to}
          />
        ))}
      </nav>

      {/* ── Threat counter badge ─────────────────────────────────── */}
      <AnimatePresence>
        {!collapsed && malicious > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-3 mb-3 p-3 rounded-lg border border-red-neon/20 bg-red-neon/5"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="status-dot danger" />
              <span className="text-[10px] font-mono text-red-neon/80 tracking-widest uppercase">
                Threats Detected
              </span>
            </div>
            <p className="text-2xl font-display font-bold text-red-neon"
              style={{ textShadow: '0 0 12px rgba(255,34,68,0.5)' }}>
              {malicious}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── System status footer ─────────────────────────────────── */}
      <div className={clsx(
        'border-t border-cyan-neon/8 py-3',
        collapsed ? 'px-2 items-center' : 'px-4',
        'flex flex-col gap-2'
      )}>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-1.5"
            >
              <StatusLine icon={Activity} label="API" status="online"  color="#00ff88" />
              <StatusLine icon={Zap}      label="Agents" status="ready" color="#b347ff" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapse toggle */}
        <motion.button
          onClick={toggleSidebar}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={clsx(
            'flex items-center gap-2 rounded-lg px-3 py-2 w-full',
            'text-white/30 hover:text-cyan-neon/70 transition-colors duration-200',
            'hover:bg-cyan-neon/5 border border-transparent hover:border-cyan-neon/10',
            collapsed && 'justify-center'
          )}
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <>
                <ChevronLeft size={14} />
                <span className="text-[10px] font-mono tracking-widest uppercase">Collapse</span>
              </>
          }
        </motion.button>
      </div>
    </motion.aside>
  )
}

// ── Individual nav item ────────────────────────────────────────────
function NavItem({ item, collapsed, isActive }) {
  const { to, icon: Icon, label, desc, color } = item

  return (
    <NavLink to={to} className="block">
      <motion.div
        whileHover={{ x: collapsed ? 0 : 3 }}
        transition={{ duration: 0.15 }}
        className={clsx(
          'relative flex items-center rounded-xl transition-all duration-200 group',
          collapsed ? 'justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2.5',
          isActive
            ? 'text-white'
            : 'text-white/40 hover:text-white/70'
        )}
        style={isActive ? {
          background: `${color}12`,
          border: `1px solid ${color}30`,
          boxShadow: `0 0 12px ${color}15`,
        } : {
          background: 'transparent',
          border: '1px solid transparent',
        }}
        title={collapsed ? label : undefined}
      >
        {/* Active left-edge accent bar */}
        {isActive && !collapsed && (
          <motion.div
            layoutId="nav-active-bar"
            className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
            style={{ background: color, boxShadow: `0 0 6px ${color}` }}
          />
        )}

        {/* Icon */}
        <div className="flex-shrink-0" style={isActive ? { color, filter: `drop-shadow(0 0 4px ${color})` } : {}}>
          <Icon size={collapsed ? 18 : 16} strokeWidth={isActive ? 2 : 1.5} />
        </div>

        {/* Label + desc */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <p className={clsx(
                'text-[13px] font-medium leading-none truncate',
                isActive ? 'text-white' : 'text-white/50 group-hover:text-white/75'
              )}>
                {label}
              </p>
              <p className="text-[10px] text-white/25 mt-0.5 truncate font-mono">
                {desc}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tooltip when collapsed */}
        {collapsed && (
          <div className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg z-50
            bg-bg-secondary border border-cyan-neon/20 text-white text-xs font-mono
            whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none
            transition-opacity duration-150 shadow-glass"
          >
            {label}
          </div>
        )}
      </motion.div>
    </NavLink>
  )
}

function StatusLine({ icon: Icon, label, status, color }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={10} style={{ color }} />
      <span className="text-[10px] font-mono text-white/30 flex-1">{label}</span>
      <span className="text-[10px] font-mono" style={{ color }}>{status}</span>
    </div>
  )
}
