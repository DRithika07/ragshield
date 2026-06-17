/**
 * agentService.js — Agent Pipeline Service Layer
 * ════════════════════════════════════════════════
 * Phase 6 · Step 2
 *
 * Dedicated service module for all agent-pipeline–related API operations.
 * Wraps the shared Axios instance with domain-specific logic:
 *   – input validation before the request leaves the browser
 *   – response normalisation into a consistent camelCase shape
 *   – typed AgentServiceError class (mirrors ThreatServiceError)
 *   – cancellation support via AbortController
 *   – SSE streaming helper for GET /agents/logs
 *   – workflow history with in-memory session cache
 *
 * Exports (named):
 *   runAgentPipeline(prompt, options)    — POST /agents/run
 *   getAgentStatus(runId, options)       — GET  /agents/status/:id
 *   getWorkflowHistory(params)           — GET  /logs  (agent-relevant entries)
 *   streamAgentLogs(onEvent, onDone)     — GET  /agents/logs  (SSE)
 *   createCancellablePipeline()          — factory: cancellable runAgentPipeline
 *   AgentServiceError                    — custom error class
 *   AGENT_STATUS, PIPELINE_STAGES        — constants
 *
 * Default export: convenience object containing all functions.
 */

import axios from 'axios'

// ── Shared Axios instance ─────────────────────────────────────────────────────
// Mirrors api.js but with its own interceptor chain so agentService
// can be used standalone without importing the root api module.

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 120_000,              // 2 min — LangGraph + Gemini pipeline can be slow
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  },
})

// Attach API key from Vite env
api.interceptors.request.use((config) => {
  const key = import.meta.env.VITE_API_KEY
  if (key) config.headers['X-API-Key'] = key
  return config
})

// Unwrap response.data; normalise errors → AgentServiceError
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (axios.isCancel(err)) return Promise.reject(err)
    const msg =
      err.response?.data?.detail  ||
      err.response?.data?.message ||
      err.message                 ||
      'An unexpected error occurred'
    const status = err.response?.status ?? 0
    return Promise.reject(new AgentServiceError(msg, status, err.response?.data))
  }
)

// ── Constants ─────────────────────────────────────────────────────────────────

/** Possible values for a single agent's status field. */
export const AGENT_STATUS = Object.freeze({
  IDLE:     'idle',
  RUNNING:  'running',
  COMPLETE: 'complete',
  FAILED:   'failed',
  SKIPPED:  'skipped',
})

/** Canonical ordered stages in the LangGraph pipeline. */
export const PIPELINE_STAGES = Object.freeze([
  { id: 'detection',  name: 'Detection Agent',   color: '#00f5ff' },
  { id: 'analysis',   name: 'Analysis Agent',    color: '#b347ff' },
  { id: 'mitigation', name: 'Mitigation Agent',  color: '#ffaa00' },
  { id: 'report',     name: 'Report Agent',      color: '#00ff88' },
])

// ── Custom error class ────────────────────────────────────────────────────────

/**
 * Typed error thrown by every agentService function on failure.
 * Consumers can inspect `.status`, `.isNotFound`, `.isServerError`, etc.
 */
export class AgentServiceError extends Error {
  /**
   * @param {string} message  — human-readable message
   * @param {number} status   — HTTP status code (0 = network / timeout)
   * @param {any}    detail   — raw backend error payload
   */
  constructor(message, status = 0, detail = null) {
    super(message)
    this.name   = 'AgentServiceError'
    this.status = status
    this.detail = detail
  }

  get isNotFound()     { return this.status === 404 }
  get isUnauthorized() { return this.status === 401 }
  get isServerError()  { return this.status >= 500  }
  get isNetworkError() { return this.status === 0   }
  get isTimeout()      { return this.message?.toLowerCase().includes('timeout') }
}

// ── In-memory workflow history cache ─────────────────────────────────────────
// Stores the last MAX_HISTORY pipeline runs for this browser session.
// Persisted across component mounts without a backend round-trip.

const MAX_HISTORY = 50
const _sessionHistory = []   // { runId, startedAt, completedAt, result }[]

function _pushHistory(entry) {
  _sessionHistory.unshift(entry)
  if (_sessionHistory.length > MAX_HISTORY) _sessionHistory.pop()
}

// ── Response normalisers ──────────────────────────────────────────────────────

/**
 * Normalise one AgentStep backend object into a consistent camelCase shape.
 *
 * Backend schema (response.py → AgentStep):
 *   agent_name, status, output_summary, duration_ms
 */
function normaliseAgentStep(raw) {
  if (!raw) return null
  return {
    agentName:     raw.agent_name      ?? '',
    agentId:       _agentNameToId(raw.agent_name),
    status:        raw.status          ?? AGENT_STATUS.IDLE,
    outputSummary: raw.output_summary  ?? '',
    durationMs:    raw.duration_ms     ?? null,
  }
}

/**
 * Normalise the ThreatResult embedded inside AgentRunResponse.
 *
 * Backend schema (response.py → ThreatResult):
 *   threat_id, prompt_text, predicted_label, is_malicious,
 *   ml_score, similarity_score, fusion_score, severity,
 *   attack_type, detected_at
 */
function normaliseThreatResult(raw) {
  if (!raw) return null
  return {
    threatId:        raw.threat_id        ?? raw.id ?? '',
    promptText:      raw.prompt_text      ?? '',
    predictedLabel:  raw.predicted_label  ?? 0,
    isMalicious:     raw.is_malicious     ?? raw.predicted_label === 1,
    mlScore:         raw.ml_score         ?? null,
    similarityScore: raw.similarity_score ?? null,
    fusionScore:     raw.fusion_score     ?? null,
    severity:        raw.severity         ?? 'NONE',
    attackType:      raw.attack_type      ?? null,
    detectedAt:      raw.detected_at      ?? null,
  }
}

/**
 * Normalise the full AgentRunResponse envelope.
 *
 * Backend schema (response.py → AgentRunResponse):
 *   success, message, run_id, threat_result, agent_steps,
 *   ai_explanation, mitigation_steps, report_id
 */
function normaliseRunResponse(res) {
  const steps = (res?.agent_steps ?? []).map(normaliseAgentStep).filter(Boolean)

  return {
    success:          res?.success          ?? true,
    message:          res?.message          ?? '',
    runId:            res?.run_id           ?? null,
    threatResult:     normaliseThreatResult(res?.threat_result),
    agentSteps:       steps,
    agentStatuses:    _stepsToStatuses(steps),
    aiExplanation:    res?.ai_explanation   ?? null,
    mitigationSteps:  res?.mitigation_steps ?? null,
    reportId:         res?.report_id        ?? null,
  }
}

/**
 * Normalise the GET /agents/status/:run_id response.
 *
 * Backend (agents.py):
 *   { success, run_id, status, threat_id, completed_at }
 */
function normaliseStatusResponse(res) {
  return {
    success:     res?.success      ?? true,
    runId:       res?.run_id       ?? '',
    status:      res?.status       ?? AGENT_STATUS.IDLE,
    threatId:    res?.threat_id    ?? null,
    completedAt: res?.completed_at ?? null,
    isComplete:  res?.status === 'complete',
    isFailed:    res?.status === 'failed',
  }
}

/**
 * Normalise a ThreatLogEntry from GET /logs for the workflow history view.
 * We surface only the fields relevant to agent-pipeline context.
 */
function normaliseHistoryEntry(raw) {
  if (!raw) return null
  return {
    id:              raw.id              ?? '',
    sessionId:       raw.session_id      ?? null,
    promptText:      raw.prompt_text     ?? '',
    isMalicious:     raw.is_malicious    ?? raw.predicted_label === 1,
    fusionScore:     raw.fusion_score    ?? null,
    severity:        raw.severity        ?? 'NONE',
    attackType:      raw.attack_type     ?? null,
    isMemoryPoison:  raw.is_memory_poison ?? false,
    reportGenerated: raw.report_generated ?? false,
    detectedAt:      raw.created_at      ?? null,
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Convert agent_name string → a short id key matching PIPELINE_STAGES. */
function _agentNameToId(name = '') {
  const lower = name.toLowerCase()
  if (lower.includes('detection'))  return 'detection'
  if (lower.includes('analysis'))   return 'analysis'
  if (lower.includes('mitigation')) return 'mitigation'
  if (lower.includes('report'))     return 'report'
  return lower.replace(/\s+/g, '_')
}

/** Build agentStatuses map { detection, analysis, mitigation, report } from steps. */
function _stepsToStatuses(steps) {
  const base = {
    detection:  AGENT_STATUS.IDLE,
    analysis:   AGENT_STATUS.IDLE,
    mitigation: AGENT_STATUS.IDLE,
    report:     AGENT_STATUS.IDLE,
  }
  steps.forEach((step) => {
    if (step.agentId in base) base[step.agentId] = step.status
  })
  return base
}

/** Basic prompt validation shared by runAgentPipeline and related callers. */
function _validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new AgentServiceError('prompt must be a non-empty string', 400)
  }
  const trimmed = prompt.trim()
  if (!trimmed.length) {
    throw new AgentServiceError('prompt cannot be blank', 400)
  }
  if (trimmed.length > 8192) {
    throw new AgentServiceError(
      'prompt exceeds maximum length of 8,192 characters', 400
    )
  }
  return trimmed
}

// ── runAgentPipeline ──────────────────────────────────────────────────────────

/**
 * Trigger the full 4-agent LangGraph pipeline for a given prompt.
 *
 * POST /api/v1/agents/run
 *
 * Runs: Detection → Analysis → Mitigation → Report
 *
 * @param {string}   prompt
 * @param {object}   [options]
 * @param {string}   [options.sessionId]      — optional client session UUID
 * @param {string[]} [options.includeAgents]  — subset of agents to activate
 *                                              default: all four
 * @param {AbortSignal} [options.signal]      — AbortController signal
 *
 * @returns {Promise<NormalisedRunResponse>}
 * @throws  {AgentServiceError}
 */
export async function runAgentPipeline(prompt, options = {}) {
  const {
    sessionId      = null,
    includeAgents  = ['detection', 'analysis', 'mitigation', 'report'],
    signal         = null,
  } = options

  const trimmed = _validatePrompt(prompt)

  if (!Array.isArray(includeAgents) || includeAgents.length === 0) {
    throw new AgentServiceError('includeAgents must be a non-empty array', 400)
  }

  const startedAt = new Date().toISOString()

  const res = await api.post(
    '/agents/run',
    {
      prompt:          trimmed,
      session_id:      sessionId,
      include_agents:  includeAgents,
    },
    { signal }
  )

  const normalised = normaliseRunResponse(res)

  // Cache in session history
  _pushHistory({
    runId:       normalised.runId,
    startedAt,
    completedAt: new Date().toISOString(),
    prompt:      trimmed,
    severity:    normalised.threatResult?.severity ?? 'NONE',
    isMalicious: normalised.threatResult?.isMalicious ?? false,
    agentSteps:  normalised.agentSteps,
    reportId:    normalised.reportId,
  })

  return normalised
}

// ── getAgentStatus ────────────────────────────────────────────────────────────

/**
 * Poll the status of a previously triggered pipeline run.
 *
 * GET /api/v1/agents/status/:run_id
 *
 * The backend stores runs in-memory (Redis in production).
 * Returns 404 if the run_id is unknown or expired.
 *
 * @param {string}  runId               — UUID returned by runAgentPipeline
 * @param {object}  [options]
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<NormalisedStatusResponse>}
 * @throws  {AgentServiceError}
 */
export async function getAgentStatus(runId, options = {}) {
  const { signal = null } = options

  if (!runId || typeof runId !== 'string') {
    throw new AgentServiceError('runId must be a non-empty string', 400)
  }

  const res = await api.get(`/agents/status/${runId.trim()}`, { signal })
  return normaliseStatusResponse(res)
}

// ── getWorkflowHistory ────────────────────────────────────────────────────────

/**
 * Retrieve paginated workflow history.
 *
 * Strategy (two sources, merged):
 *   1. In-memory session cache (_sessionHistory) — instant, no backend call.
 *   2. GET /api/v1/logs — persisted DB records from all sessions.
 *
 * When `source` is 'session'  → returns session cache only (no network call).
 * When `source` is 'db'       → returns DB logs only.
 * When `source` is 'all'      → merges both, deduplicates by id/runId, sorts by date.
 *
 * @param {object}  [params]
 * @param {string}  [params.source='all']       — 'session' | 'db' | 'all'
 * @param {number}  [params.page=1]
 * @param {number}  [params.pageSize=20]        — 1–100
 * @param {string}  [params.severity]           — CRITICAL | HIGH | MEDIUM | LOW | NONE
 * @param {boolean} [params.isMalicious]        — filter by threat outcome
 * @param {string}  [params.dateFrom]           — ISO date (YYYY-MM-DD)
 * @param {string}  [params.dateTo]             — ISO date (YYYY-MM-DD)
 * @param {AbortSignal} [params.signal]
 *
 * @returns {Promise<WorkflowHistoryPage>}
 * @throws  {AgentServiceError}
 */
export async function getWorkflowHistory(params = {}) {
  const {
    source    = 'all',
    page      = 1,
    pageSize  = 20,
    severity  = undefined,
    isMalicious: isMal = undefined,
    dateFrom  = undefined,
    dateTo    = undefined,
    signal    = null,
  } = params

  // Validate
  if (!['session', 'db', 'all'].includes(source)) {
    throw new AgentServiceError("source must be 'session', 'db', or 'all'", 400)
  }
  if (!Number.isInteger(page) || page < 1) {
    throw new AgentServiceError('page must be a positive integer', 400)
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new AgentServiceError('pageSize must be between 1 and 100', 400)
  }

  // ── Session cache ──────────────────────────────────────────────────
  let sessionEntries = []
  if (source === 'session' || source === 'all') {
    sessionEntries = _sessionHistory.map((h) => ({
      id:              h.runId,
      sessionId:       null,
      promptText:      h.prompt,
      isMalicious:     h.isMalicious,
      fusionScore:     null,
      severity:        h.severity,
      attackType:      null,
      isMemoryPoison:  false,
      reportGenerated: !!h.reportId,
      detectedAt:      h.completedAt,
      _source:         'session',
    }))
  }

  // ── DB logs ────────────────────────────────────────────────────────
  let dbEntries = []
  let dbTotal   = 0
  let dbPage    = 1

  if (source === 'db' || source === 'all') {
    try {
      const queryParams = {
        page,
        page_size:   pageSize,
        ...(severity  !== undefined && { severity:     severity.toUpperCase() }),
        ...(isMal     !== undefined && { is_malicious: isMal }),
        ...(dateFrom  !== undefined && { date_from:    dateFrom }),
        ...(dateTo    !== undefined && { date_to:      dateTo   }),
      }

      const res = await api.get('/logs', { params: queryParams, signal })
      dbEntries = (res?.data ?? []).map(normaliseHistoryEntry).filter(Boolean)
      dbEntries = dbEntries.map((e) => ({ ...e, _source: 'db' }))
      dbTotal   = res?.total    ?? dbEntries.length
      dbPage    = res?.page     ?? page
    } catch (err) {
      // DB fetch failure should not silently swallow session data;
      // rethrow only when db is the exclusive source
      if (source === 'db') throw err
      console.warn('[agentService] DB log fetch failed — returning session only:', err.message)
    }
  }

  // ── Merge & deduplicate ────────────────────────────────────────────
  let merged = []
  if (source === 'session') {
    merged = sessionEntries
  } else if (source === 'db') {
    merged = dbEntries
  } else {
    // Prefer DB entries; fill in session-only entries not yet in DB
    const dbIds = new Set(dbEntries.map((e) => e.id))
    const sessionOnly = sessionEntries.filter((e) => !dbIds.has(e.id))
    merged = [...dbEntries, ...sessionOnly]
    // Sort descending by date
    merged.sort((a, b) => {
      const ta = a.detectedAt ? new Date(a.detectedAt).getTime() : 0
      const tb = b.detectedAt ? new Date(b.detectedAt).getTime() : 0
      return tb - ta
    })
  }

  // Apply client-side severity / isMalicious filters to session entries
  if (source !== 'db') {
    if (severity !== undefined) {
      merged = merged.filter(
        (e) => e._source === 'db' || e.severity === severity.toUpperCase()
      )
    }
    if (isMal !== undefined) {
      merged = merged.filter(
        (e) => e._source === 'db' || e.isMalicious === isMal
      )
    }
  }

  // Paginate merged result when source==='all' or source==='session'
  const total = source === 'db' ? dbTotal : merged.length
  const start = source === 'db' ? 0       : (page - 1) * pageSize
  const slice = source === 'db' ? merged  : merged.slice(start, start + pageSize)

  return {
    success:  true,
    data:     slice,
    total,
    page:     source === 'db' ? dbPage : page,
    pageSize,
    hasMore:  (page - 1) * pageSize + slice.length < total,
    source,
  }
}

// ── streamAgentLogs (SSE) ─────────────────────────────────────────────────────

/**
 * Open a Server-Sent Events connection to GET /api/v1/agents/logs
 * and stream live agent thought logs to the caller.
 *
 * The SSE endpoint emits JSON objects:
 *   { agent: string, status: string, message: string }
 *
 * @param {function(AgentLogEvent): void} onEvent  — called for each SSE event
 * @param {function(): void}              [onDone]  — called when stream closes
 * @param {function(Error): void}         [onError] — called on EventSource error
 *
 * @returns {{ close: function }} — call close() to disconnect
 */
export function streamAgentLogs(onEvent, onDone = null, onError = null) {
  const apiKey  = import.meta.env.VITE_API_KEY ?? ''
  const url     = apiKey
    ? `/api/v1/agents/logs?api_key=${encodeURIComponent(apiKey)}`
    : '/api/v1/agents/logs'

  const source = new EventSource(url)

  source.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data)
      onEvent({
        agentName: parsed.agent   ?? '',
        agentId:   _agentNameToId(parsed.agent ?? ''),
        status:    parsed.status  ?? AGENT_STATUS.RUNNING,
        message:   parsed.message ?? '',
        timestamp: new Date().toISOString(),
      })
    } catch {
      // Non-JSON keepalive or comment — safe to ignore
    }
  }

  source.onerror = (e) => {
    if (source.readyState === EventSource.CLOSED) {
      onDone?.()
    } else {
      const err = new AgentServiceError(
        'SSE connection error — agent log stream interrupted', 0
      )
      onError?.(err)
    }
    source.close()
  }

  return {
    close: () => source.close(),
  }
}

// ── Polling helper ────────────────────────────────────────────────────────────

/**
 * Poll getAgentStatus every `intervalMs` milliseconds until the run
 * reaches a terminal state (complete | failed) or `timeoutMs` elapses.
 *
 * @param {string}   runId
 * @param {object}   [options]
 * @param {number}   [options.intervalMs=1500]   — polling interval
 * @param {number}   [options.timeoutMs=120000]  — max wait time
 * @param {function(NormalisedStatusResponse): void} [options.onPoll] — called each poll
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<NormalisedStatusResponse>}  — resolves on terminal state
 * @throws  {AgentServiceError}                  — on timeout or network error
 */
export async function pollUntilComplete(runId, options = {}) {
  const {
    intervalMs = 1500,
    timeoutMs  = 120_000,
    onPoll     = null,
    signal     = null,
  } = options

  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new AgentServiceError('Polling aborted by caller', 0)
    }

    const status = await getAgentStatus(runId, { signal })
    onPoll?.(status)

    if (status.isComplete || status.isFailed) return status

    // Wait intervalMs before next poll
    await new Promise((resolve, reject) => {
      const tid = setTimeout(resolve, intervalMs)
      signal?.addEventListener('abort', () => {
        clearTimeout(tid)
        reject(new AgentServiceError('Polling aborted by caller', 0))
      }, { once: true })
    })
  }

  throw new AgentServiceError(
    `Agent pipeline status polling timed out after ${timeoutMs / 1000}s`, 408
  )
}

// ── Cancellable pipeline factory ──────────────────────────────────────────────

/**
 * Create a cancellable wrapper around runAgentPipeline.
 * Automatically aborts any in-flight request when run() is called again
 * or when cancel() is called explicitly.
 *
 * Usage:
 *   const { run, cancel } = createCancellablePipeline()
 *
 *   // In a component submit handler:
 *   const result = await run(prompt, { includeAgents: ['detection'] })
 *
 *   // On unmount or re-submit:
 *   cancel()
 *
 * @returns {{ run: function, cancel: function }}
 */
export function createCancellablePipeline() {
  let controller = null

  const run = (prompt, options = {}) => {
    if (controller) controller.abort()
    controller = new AbortController()
    return runAgentPipeline(prompt, { ...options, signal: controller.signal })
  }

  const cancel = () => {
    if (controller) {
      controller.abort()
      controller = null
    }
  }

  return { run, cancel }
}

// ── Session history accessors ─────────────────────────────────────────────────

/**
 * Return the raw in-memory session history array (read-only).
 * Useful for summary counts in header badges etc.
 *
 * @returns {SessionHistoryEntry[]}
 */
export function getSessionHistory() {
  return [..._sessionHistory]
}

/**
 * Clear the in-memory session history.
 * Does NOT affect the backend database.
 */
export function clearSessionHistory() {
  _sessionHistory.length = 0
}

// ── Default export — convenience object ──────────────────────────────────────

const agentService = {
  // Core functions
  runAgentPipeline,
  getAgentStatus,
  getWorkflowHistory,
  streamAgentLogs,
  pollUntilComplete,

  // Factories
  createCancellablePipeline,

  // Session cache
  getSessionHistory,
  clearSessionHistory,

  // Error class
  AgentServiceError,

  // Constants
  AGENT_STATUS,
  PIPELINE_STAGES,
}

export default agentService
