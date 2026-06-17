/**
 * useSentinelStore.js — Global Zustand State Store
 * ══════════════════════════════════════════════════
 * Single source of truth for all application state.
 * Components subscribe to only the slices they need —
 * no unnecessary re-renders.
 *
 * Store slices:
 *   dashboard   — stats, timeline, heatmap
 *   detection   — current analysis result, history
 *   agents      — agent pipeline status and steps
 *   logs        — attack log entries
 *   reports     — generated PDF reports
 *   ui          — loading states, alerts, sidebar
 */

import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import {
  dashboardAPI, logsAPI, reportsAPI,
  detectionAPI, agentsAPI,
} from '@/services/api.js'

// ── Severity colour mapping (used throughout UI) ───────────────────
export const SEVERITY_CONFIG = {
  CRITICAL: { color: '#ff2244', bg: 'rgba(255,34,68,0.12)',  border: 'rgba(255,34,68,0.4)',  label: 'CRITICAL' },
  HIGH:     { color: '#ffaa00', bg: 'rgba(255,170,0,0.12)', border: 'rgba(255,170,0,0.4)',  label: 'HIGH'     },
  MEDIUM:   { color: '#b347ff', bg: 'rgba(179,71,255,0.12)',border: 'rgba(179,71,255,0.4)', label: 'MEDIUM'   },
  LOW:      { color: '#00f5ff', bg: 'rgba(0,245,255,0.10)', border: 'rgba(0,245,255,0.35)', label: 'LOW'      },
  NONE:     { color: '#00ff88', bg: 'rgba(0,255,136,0.10)', border: 'rgba(0,255,136,0.35)', label: 'SAFE'     },
}

// ── Agent definitions ─────────────────────────────────────────────
export const AGENT_DEFINITIONS = [
  {
    id: 'detection',
    name: 'Detection Agent',
    description: 'Embeds prompt & runs ML + vector similarity classification',
    color: '#00f5ff',
    icon: 'Scan',
  },
  {
    id: 'analysis',
    name: 'Analysis Agent',
    description: 'Calls Gemini API to generate threat explanation and narrative',
    color: '#b347ff',
    icon: 'Brain',
  },
  {
    id: 'mitigation',
    name: 'Mitigation Agent',
    description: 'Generates ordered countermeasures per attack type and severity',
    color: '#ffaa00',
    icon: 'Shield',
  },
  {
    id: 'report',
    name: 'Report Agent',
    description: 'Compiles findings and generates PDF incident report',
    color: '#00ff88',
    icon: 'FileText',
  },
]

const useSentinelStore = create(
  devtools(
    subscribeWithSelector((set, get) => ({

      // ════════════════════════════════════════════════════════════
      // UI STATE
      // ════════════════════════════════════════════════════════════
      sidebarCollapsed: false,
      activeAlert: null,          // { type, message, id }
      loadingStates: {},          // { [key]: boolean }

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setLoading: (key, value) =>
        set((s) => ({ loadingStates: { ...s.loadingStates, [key]: value } })),

      isLoading: (key) => get().loadingStates[key] ?? false,

      showAlert: (type, message) => {
        const id = Date.now()
        set({ activeAlert: { type, message, id } })
        setTimeout(() => {
          if (get().activeAlert?.id === id) set({ activeAlert: null })
        }, 5000)
      },

      clearAlert: () => set({ activeAlert: null }),

      // ════════════════════════════════════════════════════════════
      // DASHBOARD SLICE
      // ════════════════════════════════════════════════════════════
      dashboardStats: null,
      dashboardTimeline: [],
      dashboardHeatmap: [],
      lastRefreshed: null,

      fetchDashboardStats: async () => {
        set((s) => ({ loadingStates: { ...s.loadingStates, dashboard: true } }))
        try {
          const res = await dashboardAPI.getStats()
          set({ dashboardStats: res.data, lastRefreshed: new Date() })
        } catch (err) {
          get().showAlert('error', `Dashboard error: ${err.message}`)
        } finally {
          set((s) => ({ loadingStates: { ...s.loadingStates, dashboard: false } }))
        }
      },

      fetchTimeline: async (hours = 24) => {
        try {
          const res = await dashboardAPI.getTimeline(hours)
          set({ dashboardTimeline: res.data || [] })
        } catch (err) {
          console.error('Timeline fetch failed:', err)
        }
      },

      fetchHeatmap: async () => {
        try {
          const res = await dashboardAPI.getHeatmap()
          set({ dashboardHeatmap: res.data || [] })
        } catch (err) {
          console.error('Heatmap fetch failed:', err)
        }
      },

      // ════════════════════════════════════════════════════════════
      // DETECTION SLICE
      // ════════════════════════════════════════════════════════════
      currentDetection: null,     // latest detection result
      detectionHistory: [],       // last 50 detections this session
      analysisRunning: false,

      analyzePrompt: async (prompt, runAgents = true) => {
        set({ analysisRunning: true, currentDetection: null })
        try {
          const result = await detectionAPI.analyzePrompt(prompt, null, runAgents)

          // Update current detection
          set({ currentDetection: result })

          // Prepend to session history (keep last 50)
          set((s) => ({
            detectionHistory: [result, ...s.detectionHistory].slice(0, 50),
          }))

          // Update agent steps if pipeline ran
          if (result.agent_steps?.length) {
            set({ agentSteps: result.agent_steps, lastRunId: result.data?.threat_id })
          }

          // Show alert for high-severity threats
          const sev = result.data?.severity
          if (sev === 'CRITICAL' || sev === 'HIGH') {
            get().showAlert('threat', `${sev} threat detected: ${result.data?.attack_type}`)
          }

          return result
        } catch (err) {
          get().showAlert('error', `Analysis failed: ${err.message}`)
          throw err
        } finally {
          set({ analysisRunning: false })
        }
      },

      clearDetection: () => set({ currentDetection: null }),

      // ════════════════════════════════════════════════════════════
      // AGENTS SLICE
      // ════════════════════════════════════════════════════════════
      agentSteps: [],             // steps from last pipeline run
      agentStatuses: {            // live status per agent
        detection:  'idle',
        analysis:   'idle',
        mitigation: 'idle',
        report:     'idle',
      },
      lastRunId: null,
      pipelineRunning: false,

      runAgentPipeline: async (prompt) => {
        set({
          pipelineRunning: true,
          agentSteps: [],
          agentStatuses: { detection: 'running', analysis: 'idle', mitigation: 'idle', report: 'idle' },
        })

        try {
          // Simulate progressive agent status updates
          const updateAgent = (agent, status) =>
            set((s) => ({ agentStatuses: { ...s.agentStatuses, [agent]: status } }))

          const result = await agentsAPI.runPipeline(prompt)

          // Parse agent steps and update statuses
          const steps = result.agent_steps || []
          steps.forEach((step) => {
            const agentKey = step.agent_name?.toLowerCase().replace('agent', '').trim()
            if (agentKey) updateAgent(agentKey, step.status)
          })

          set({
            agentSteps: steps,
            lastRunId: result.run_id,
            pipelineRunning: false,
            agentStatuses: { detection: 'complete', analysis: 'complete', mitigation: 'complete', report: 'complete' },
          })

          return result
        } catch (err) {
          set({
            pipelineRunning: false,
            agentStatuses: { detection: 'failed', analysis: 'failed', mitigation: 'failed', report: 'failed' },
          })
          get().showAlert('error', `Pipeline failed: ${err.message}`)
          throw err
        }
      },

      resetAgents: () =>
        set({
          agentSteps: [],
          agentStatuses: { detection: 'idle', analysis: 'idle', mitigation: 'idle', report: 'idle' },
          pipelineRunning: false,
          lastRunId: null,
        }),

      // ════════════════════════════════════════════════════════════
      // LOGS SLICE
      // ════════════════════════════════════════════════════════════
      logs: [],
      logsMeta: { total: 0, page: 1, page_size: 20 },
      logsLoading: false,

      fetchLogs: async (params = {}) => {
        set({ logsLoading: true })
        try {
          const res = await logsAPI.getLogs(params)
          set({
            logs: res.data || [],
            logsMeta: { total: res.total, page: res.page, page_size: res.page_size },
          })
        } catch (err) {
          get().showAlert('error', `Failed to load logs: ${err.message}`)
        } finally {
          set({ logsLoading: false })
        }
      },

      // ════════════════════════════════════════════════════════════
      // REPORTS SLICE
      // ════════════════════════════════════════════════════════════
      reports: [],
      reportsLoading: false,

      fetchReports: async () => {
        set({ reportsLoading: true })
        try {
          const res = await reportsAPI.getReports()
          set({ reports: res.data || [] })
        } catch (err) {
          get().showAlert('error', `Failed to load reports: ${err.message}`)
        } finally {
          set({ reportsLoading: false })
        }
      },

      generateReport: async (threatLogIds, title) => {
        set((s) => ({ loadingStates: { ...s.loadingStates, reportGen: true } }))
        try {
          const res = await reportsAPI.generateReport(threatLogIds, title)
          // Prepend new report to list
          set((s) => ({ reports: [res.data, ...s.reports] }))
          get().showAlert('success', 'PDF incident report generated successfully')
          return res
        } catch (err) {
          get().showAlert('error', `Report generation failed: ${err.message}`)
          throw err
        } finally {
          set((s) => ({ loadingStates: { ...s.loadingStates, reportGen: false } }))
        }
      },
    })),
    { name: 'SentinelRAG' }    // DevTools label
  )
)

export default useSentinelStore
