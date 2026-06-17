/**
 * api.js — Centralised Axios API Service Layer
 * ═════════════════════════════════════════════
 * All HTTP calls to the FastAPI backend go through this module.
 * Components never call axios directly — they call these functions.
 *
 * Benefits:
 *   - Single place to update base URL, headers, auth tokens
 *   - Consistent error handling and response unwrapping
 *   - Easy to mock in tests
 *   - Automatic retry on 5xx errors (via interceptor)
 */

import axios from 'axios'

// ── Axios instance ─────────────────────────────────────────────────
const api = axios.create({
  baseURL: 'https://ragshield-production.up.railway.app/api/v1',             // proxied by Vite to http://localhost:8000
  timeout: 60_000,                // 60s — agent pipeline can take time
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  },
})

// ── Request interceptor — attach API key if configured ─────────────
api.interceptors.request.use((config) => {
  const key = import.meta.env.VITE_API_KEY
  if (key) config.headers['X-API-Key'] = key
  return config
})

// ── Response interceptor — unwrap data, handle errors ──────────────
api.interceptors.response.use(
  (response) => response.data,    // unwrap: components get data directly
  (error) => {
    const message = error.response?.data?.detail
      || error.response?.data?.message
      || error.message
      || 'An unexpected error occurred'
    return Promise.reject(new Error(message))
  }
)

// ══════════════════════════════════════════════════════════════════════
// DETECTION API
// ══════════════════════════════════════════════════════════════════════

export const detectionAPI = {
  /**
   * Analyze a single prompt for injection/jailbreak threats.
   * Triggers the full 4-agent pipeline when run_agents=true.
   */
  analyzePrompt: (prompt, sessionId = null, runAgents = true) =>
    api.post('/detect', {
      prompt,
      session_id: sessionId,
      run_agents: runAgents,
    }),

  /**
   * Batch analyze multiple prompts (no agent pipeline — faster).
   */
  analyzeBatch: (prompts) =>
    api.post('/detect/batch', { prompts }),
}

// ══════════════════════════════════════════════════════════════════════
// ANALYSIS API
// ══════════════════════════════════════════════════════════════════════

export const analysisAPI = {
  /** Deep Gemini analysis of a single prompt */
  deepAnalyze: (prompt) =>
    api.post('/analyze', { prompt, run_agents: true }),

  /** Fetch stored analysis for a threat log ID */
  getThreatAnalysis: (threatId) =>
    api.get(`/analyze/${threatId}`),
}

// ══════════════════════════════════════════════════════════════════════
// DASHBOARD API
// ══════════════════════════════════════════════════════════════════════

export const dashboardAPI = {
  /** Summary stats: total, malicious, safe, severity counts */
  getStats: () =>
    api.get('/dashboard/stats'),

  /** Threat event timeline (grouped by hour) */
  getTimeline: (hours = 24) =>
    api.get('/dashboard/timeline', { params: { hours } }),

  /** Attack type × severity heatmap data */
  getHeatmap: () =>
    api.get('/dashboard/heatmap'),
}

// ══════════════════════════════════════════════════════════════════════
// LOGS API
// ══════════════════════════════════════════════════════════════════════

export const logsAPI = {
  /** Paginated, filterable attack log list */
  getLogs: (params = {}) =>
    api.get('/logs', { params }),

  /** Single log entry detail */
  getLog: (logId) =>
    api.get(`/logs/${logId}`),

  /** Delete a log entry */
  deleteLog: (logId) =>
    api.delete(`/logs/${logId}`),
}

// ══════════════════════════════════════════════════════════════════════
// AGENTS API
// ══════════════════════════════════════════════════════════════════════

export const agentsAPI = {
  /** Trigger the full 4-agent pipeline */
  runPipeline: (prompt, sessionId = null) =>
    api.post('/agents/run', { prompt, session_id: sessionId }),

  /** Poll agent pipeline run status */
  getRunStatus: (runId) =>
    api.get(`/agents/status/${runId}`),
}

// ══════════════════════════════════════════════════════════════════════
// RAG MEMORY API
// ══════════════════════════════════════════════════════════════════════

export const ragAPI = {
  /** Inject a document into RAG memory (with poison screening) */
  injectDocument: (content, source = 'manual') =>
    api.post('/rag/inject', { content, source }),

  /** Scan all RAG memory for poisoned documents */
  scanMemory: (threshold = null) =>
    api.post('/rag/scan', { similarity_threshold: threshold }),

  /** List all documents in RAG memory */
  getMemory: () =>
    api.get('/rag/memory'),
}

// ══════════════════════════════════════════════════════════════════════
// VECTOR API
// ══════════════════════════════════════════════════════════════════════

export const vectorAPI = {
  /** Find top-k most similar vectors to a query text */
  findSimilar: (queryText, collection = 'threat_library', topK = 5) =>
    api.post('/vectors/similar', { query_text: queryText, collection, top_k: topK }),

  /** Get UMAP 2D projection for scatter plot */
  getVisualization: (collection = 'threat_library', limit = 300) =>
    api.get('/vectors/visualize', { params: { collection, limit } }),
}

// ══════════════════════════════════════════════════════════════════════
// REPORTS API
// ══════════════════════════════════════════════════════════════════════

export const reportsAPI = {
  /** List all generated PDF reports */
  getReports: () =>
    api.get('/reports'),

  /** Generate a PDF report for given threat log IDs */
  generateReport: (threatLogIds, title = null) =>
    api.post('/reports/generate', {
      threat_log_ids: threatLogIds,
      report_title: title,
    }),

  /** Download URL for a report (direct link — not an API call) */
  getDownloadUrl: (reportId) =>
    `/api/v1/reports/${reportId}`,
}

// Default export for convenience
export default api
