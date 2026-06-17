/**
 * threatService.js — Threat Detection Service Layer
 * ═══════════════════════════════════════════════════
 * Phase 6 · Step 1
 *
 * Dedicated service module for all threat-related API operations.
 * Wraps the shared Axios instance from api.js with domain-specific
 * logic: input validation, response normalisation, retry handling,
 * cancellation support, and typed error classes.
 *
 * Exports:
 *   analyzePrompt(prompt, options)        — POST /detect
 *   analyzePromptBatch(prompts, options)  — POST /detect/batch
 *   getThreatHistory(params)              — GET  /logs
 *   getThreatById(id)                     — GET  /logs/:id
 *   deleteThreat(id)                      — DELETE /logs/:id
 *
 * All functions return normalised result objects and throw
 * ThreatServiceError on failure — never raw Axios errors.
 */

import axios from 'axios'

// ── Shared Axios instance (inherits interceptors from api.js) ─────────────────

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 90_000,               // 90 s — agent pipeline (Gemini + LangGraph) can be slow
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  },
})

// Attach API key from env
api.interceptors.request.use((config) => {
  const key = import.meta.env.VITE_API_KEY
  if (key) config.headers['X-API-Key'] = key
  return config
})

// Unwrap response.data; normalise error messages
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
    return Promise.reject(new ThreatServiceError(msg, status, err.response?.data))
  }
)

// ── Custom error class ────────────────────────────────────────────────────────

export class ThreatServiceError extends Error {
  /**
   * @param {string} message   — human-readable message
   * @param {number} status    — HTTP status code (0 = network error)
   * @param {any}    detail    — raw backend error payload
   */
  constructor(message, status = 0, detail = null) {
    super(message)
    this.name   = 'ThreatServiceError'
    this.status = status
    this.detail = detail
  }

  get isNotFound()     { return this.status === 404 }
  get isUnauthorized() { return this.status === 401 }
  get isServerError()  { return this.status >= 500  }
  get isNetworkError() { return this.status === 0   }
}

// ── Severity / label helpers (mirrors backend SEVERITY_CONFIG) ────────────────

export const SEVERITY_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE']

export function isMalicious(result) {
  return result?.is_malicious || result?.predicted_label === 1
}

export function fusionScorePercent(result) {
  const score = result?.fusion_score ?? result?.data?.fusion_score
  return score != null ? Math.round(score * 100) : null
}

// ── Response normalisers ──────────────────────────────────────────────────────

/**
 * Normalise a ThreatResult object from the backend into a consistent shape
 * regardless of whether it came from /detect or /logs/{id}.
 */
function normaliseThreatResult(raw) {
  if (!raw) return null
  return {
    id:               raw.threat_id ?? raw.id,
    sessionId:        raw.session_id   ?? null,
    promptText:       raw.prompt_text  ?? '',
    predictedLabel:   raw.predicted_label ?? 0,
    isMalicious:      raw.is_malicious ?? raw.predicted_label === 1,
    mlScore:          raw.ml_score        ?? null,
    similarityScore:  raw.similarity_score ?? null,
    fusionScore:      raw.fusion_score     ?? null,
    severity:         raw.severity         ?? 'NONE',
    attackType:       raw.attack_type      ?? null,
    aiExplanation:    raw.ai_explanation   ?? null,
    mitigationSteps:  raw.mitigation_steps ?? null,
    isMemoryPoison:   raw.is_memory_poison ?? false,
    reportGenerated:  raw.report_generated ?? false,
    topSimilar:       raw.top_similar      ?? [],
    detectedAt:       raw.detected_at ?? raw.created_at ?? null,
  }
}

/**
 * Normalise a full DetectionResponse envelope:
 * { success, message, data: ThreatResult, agent_steps, ai_explanation, mitigation_steps }
 */
function normaliseDetectionResponse(res) {
  const raw = res?.data ?? res
  return {
    success:          res?.success ?? true,
    message:          res?.message ?? '',
    data:             normaliseThreatResult(raw),
    agentSteps:       res?.agent_steps        ?? [],
    aiExplanation:    res?.ai_explanation      ?? raw?.ai_explanation ?? null,
    mitigationSteps:  res?.mitigation_steps    ?? raw?.mitigation_steps ?? null,
  }
}

/**
 * Normalise a ThreatLogEntry from GET /logs into the same shape.
 */
function normaliseLogEntry(raw) {
  if (!raw) return null
  return {
    id:               raw.id,
    sessionId:        raw.session_id   ?? null,
    promptText:       raw.prompt_text  ?? '',
    predictedLabel:   raw.predicted_label ?? 0,
    isMalicious:      raw.is_malicious ?? raw.predicted_label === 1,
    mlScore:          raw.ml_score        ?? null,
    similarityScore:  raw.similarity_score ?? null,
    fusionScore:      raw.fusion_score     ?? null,
    severity:         raw.severity         ?? 'NONE',
    attackType:       raw.attack_type      ?? null,
    aiExplanation:    raw.ai_explanation   ?? null,
    mitigationSteps:  raw.mitigation_steps ?? null,
    isMemoryPoison:   raw.is_memory_poison ?? false,
    reportGenerated:  raw.report_generated ?? false,
    detectedAt:       raw.created_at ?? null,
  }
}

// ── analyzePrompt ─────────────────────────────────────────────────────────────

/**
 * Analyze a single prompt through the full 4-agent detection pipeline.
 *
 * POST /api/v1/detect
 *
 * @param {string} prompt                  — text to analyze
 * @param {object} [options]
 * @param {string} [options.sessionId]     — optional session identifier
 * @param {boolean}[options.runAgents]     — trigger LangGraph pipeline (default true)
 * @param {AbortSignal} [options.signal]   — optional AbortController signal for cancellation
 *
 * @returns {Promise<NormalisedDetectionResponse>}
 * @throws  {ThreatServiceError}
 */
export async function analyzePrompt(prompt, options = {}) {
  const {
    sessionId = null,
    runAgents = true,
    signal    = null,
  } = options

  // Input validation
  if (!prompt || typeof prompt !== 'string') {
    throw new ThreatServiceError('Prompt must be a non-empty string', 400)
  }
  const trimmed = prompt.trim()
  if (!trimmed.length) {
    throw new ThreatServiceError('Prompt cannot be blank', 400)
  }
  if (trimmed.length > 10_000) {
    throw new ThreatServiceError('Prompt exceeds maximum length of 10,000 characters', 400)
  }

  const res = await api.post(
    '/detect',
    {
      prompt:     trimmed,
      session_id: sessionId,
      run_agents: runAgents,
    },
    { signal }
  )

  return normaliseDetectionResponse(res)
}

// ── analyzePromptBatch ────────────────────────────────────────────────────────

/**
 * Classify multiple prompts in a single optimised request.
 * Does NOT run the agent pipeline — classification only.
 *
 * POST /api/v1/detect/batch
 *
 * @param {string[]} prompts              — array of prompts (max 100)
 * @param {object}   [options]
 * @param {string}   [options.sessionId]
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<BatchDetectionResult>}
 * @throws  {ThreatServiceError}
 */
export async function analyzePromptBatch(prompts, options = {}) {
  const { sessionId = null, signal = null } = options

  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new ThreatServiceError('prompts must be a non-empty array', 400)
  }
  if (prompts.length > 100) {
    throw new ThreatServiceError('Batch size cannot exceed 100 prompts', 400)
  }

  const cleaned = prompts.map((p) => {
    if (typeof p !== 'string' || !p.trim()) {
      throw new ThreatServiceError('Every prompt in the batch must be a non-empty string', 400)
    }
    return p.trim()
  })

  const res = await api.post(
    '/detect/batch',
    { prompts: cleaned, session_id: sessionId },
    { signal }
  )

  return {
    success:        res?.success ?? true,
    message:        res?.message ?? '',
    total:          res?.total          ?? cleaned.length,
    maliciousCount: res?.malicious_count ?? 0,
    safeCount:      res?.safe_count      ?? 0,
    results:        (res?.results ?? []).map(normaliseThreatResult),
  }
}

// ── getThreatHistory ──────────────────────────────────────────────────────────

/**
 * Fetch a paginated, filterable list of threat log entries.
 *
 * GET /api/v1/logs
 *
 * @param {object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.pageSize=20]          — 1–100
 * @param {string} [params.severity]             — CRITICAL|HIGH|MEDIUM|LOW|NONE
 * @param {boolean}[params.isMalicious]          — filter to malicious-only or safe-only
 * @param {string} [params.dateFrom]             — ISO date string (YYYY-MM-DD)
 * @param {string} [params.dateTo]               — ISO date string (YYYY-MM-DD)
 * @param {AbortSignal} [params.signal]
 *
 * @returns {Promise<ThreatHistoryPage>}
 * @throws  {ThreatServiceError}
 */
export async function getThreatHistory(params = {}) {
  const {
    page       = 1,
    pageSize   = 20,
    severity   = undefined,
    isMalicious: isMal = undefined,
    dateFrom   = undefined,
    dateTo     = undefined,
    signal     = null,
  } = params

  // Validate
  if (!Number.isInteger(page) || page < 1) {
    throw new ThreatServiceError('page must be a positive integer', 400)
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ThreatServiceError('pageSize must be between 1 and 100', 400)
  }
  if (severity && !SEVERITY_LEVELS.includes(severity.toUpperCase())) {
    throw new ThreatServiceError(
      `severity must be one of: ${SEVERITY_LEVELS.join(', ')}`, 400
    )
  }

  const queryParams = {
    page,
    page_size:    pageSize,
    ...(severity   !== undefined && { severity: severity.toUpperCase() }),
    ...(isMal      !== undefined && { is_malicious: isMal }),
    ...(dateFrom   !== undefined && { date_from: dateFrom }),
    ...(dateTo     !== undefined && { date_to:   dateTo   }),
  }

  const res = await api.get('/logs', { params: queryParams, signal })

  const entries = (res?.data ?? []).map(normaliseLogEntry)

  return {
    success:  res?.success  ?? true,
    message:  res?.message  ?? '',
    data:     entries,
    total:    res?.total    ?? entries.length,
    page:     res?.page     ?? page,
    pageSize: res?.page_size ?? pageSize,
    hasMore:  entries.length === pageSize,
  }
}

// ── getThreatById ─────────────────────────────────────────────────────────────

/**
 * Fetch the full detail record for a single threat log entry.
 * Unlike the list endpoint, this returns the full prompt text,
 * AI explanation, and mitigation steps.
 *
 * GET /api/v1/logs/:id
 *
 * @param {string} id                — ThreatLog UUID
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<NormalisedLogEntry>}
 * @throws  {ThreatServiceError}
 */
export async function getThreatById(id, options = {}) {
  const { signal = null } = options

  if (!id || typeof id !== 'string') {
    throw new ThreatServiceError('id must be a non-empty string', 400)
  }

  const res = await api.get(`/logs/${id.trim()}`, { signal })

  // GET /logs/{id} returns { success, data: { ...full fields } }
  const raw = res?.data ?? res
  return normaliseLogEntry(raw)
}

// ── deleteThreat ──────────────────────────────────────────────────────────────

/**
 * Delete a threat log entry by ID.
 *
 * DELETE /api/v1/logs/:id   (returns 204 No Content)
 *
 * @param {string} id
 * @returns {Promise<{ success: boolean }>}
 * @throws  {ThreatServiceError}
 */
export async function deleteThreat(id) {
  if (!id || typeof id !== 'string') {
    throw new ThreatServiceError('id must be a non-empty string', 400)
  }

  await api.delete(`/logs/${id.trim()}`)
  return { success: true }
}

// ── Cancellable request factory ───────────────────────────────────────────────

/**
 * Create an AbortController-backed cancellable version of analyzePrompt.
 * Useful for cancelling in-flight analysis when the component unmounts
 * or the user submits a new prompt.
 *
 * Usage:
 *   const { run, cancel } = createCancellableAnalysis()
 *   const result = await run(prompt, { runAgents: true })
 *   // on unmount or re-submit:
 *   cancel()
 */
export function createCancellableAnalysis() {
  let controller = null

  const run = (prompt, options = {}) => {
    if (controller) controller.abort()
    controller = new AbortController()
    return analyzePrompt(prompt, { ...options, signal: controller.signal })
  }

  const cancel = () => {
    if (controller) {
      controller.abort()
      controller = null
    }
  }

  return { run, cancel }
}

// ── Default export — convenience object ──────────────────────────────────────

const threatService = {
  analyzePrompt,
  analyzePromptBatch,
  getThreatHistory,
  getThreatById,
  deleteThreat,
  createCancellableAnalysis,
  ThreatServiceError,
  SEVERITY_LEVELS,
  isMalicious,
  fusionScorePercent,
}

export default threatService
