/**
 * memoryService.js — RAG Memory Service Layer
 * ═════════════════════════════════════════════
 * Phase 6 · Step 3
 *
 * Dedicated service module for all RAG-memory–related API operations.
 * Wraps the shared Axios instance with domain-specific logic:
 *   – input validation before the request leaves the browser
 *   – response normalisation into a consistent camelCase shape
 *   – typed MemoryServiceError class (mirrors ThreatServiceError / AgentServiceError)
 *   – in-memory session stats cache (avoids redundant GET /rag/memory calls)
 *   – cancellation support via AbortController
 *
 * Backend routes consumed (rag.py):
 *   POST /api/v1/rag/inject   — inject document with poison screening
 *   POST /api/v1/rag/scan     — full memory scan for poisoned docs
 *   GET  /api/v1/rag/memory   — list all documents in vector store
 *
 * Exports (named):
 *   injectDocument(content, source, options)     — POST /rag/inject
 *   scanMemory(options)                          — POST /rag/scan
 *   getMemoryStats(options)                      — GET  /rag/memory → derived stats
 *   getPoisonedDocuments(options)                — GET  /rag/memory → poisoned subset
 *   getAllDocuments(options)                      — GET  /rag/memory → full list
 *   createCancellableInjection()                 — factory: cancellable injectDocument
 *   MemoryServiceError                           — custom error class
 *   POISON_STATUS, ACTION_TAKEN                  — constants
 *
 * Default export: convenience object containing all functions.
 */

import axios from 'axios'

// ── Shared Axios instance ─────────────────────────────────────────────────────

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 90_000,              // 90s — scan can be slow on large collections
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

// Unwrap response.data; normalise errors → MemoryServiceError
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
    return Promise.reject(new MemoryServiceError(msg, status, err.response?.data))
  }
)

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Poison status values returned by the backend for each document.
 * Maps to RAGDocumentResult.poison_status in response.py.
 */
export const POISON_STATUS = Object.freeze({
  BLOCKED:  'blocked',   // rejected at injection time — high poison score
  FLAGGED:  'flagged',   // passed injection but anomalous — found during scan
  CLEAN:    'clean',     // no poison signal detected
})

/**
 * Action values returned by POST /rag/inject.
 * Maps to RAGInjectResponse.action_taken in response.py.
 */
export const ACTION_TAKEN = Object.freeze({
  BLOCKED: 'blocked',   // document blocked — not stored
  FLAGGED: 'flagged',   // document stored with warning flag
  STORED:  'stored',    // document stored clean
})

// Threshold above which a document is considered high-risk (0–1 scale)
const HIGH_RISK_THRESHOLD = 0.80

// ── Custom error class ────────────────────────────────────────────────────────

/**
 * Typed error thrown by every memoryService function on failure.
 * Consumers can branch on `.isNotFound`, `.isServerError`, etc.
 */
export class MemoryServiceError extends Error {
  /**
   * @param {string} message  — human-readable description
   * @param {number} status   — HTTP status code (0 = network / timeout)
   * @param {any}    detail   — raw backend error payload
   */
  constructor(message, status = 0, detail = null) {
    super(message)
    this.name   = 'MemoryServiceError'
    this.status = status
    this.detail = detail
  }

  get isNotFound()     { return this.status === 404 }
  get isUnauthorized() { return this.status === 401 }
  get isServerError()  { return this.status >= 500  }
  get isNetworkError() { return this.status === 0   }
  get isTimeout()      { return this.message?.toLowerCase().includes('timeout') }
}

// ── In-memory session cache ───────────────────────────────────────────────────
// Stores the last fetchMemory result so getMemoryStats / getPoisonedDocuments
// can answer from cache without a redundant network call if data is fresh.

const _cache = {
  documents:   null,          // NormalisedDocument[] | null
  fetchedAt:   null,          // Date | null
  scanResult:  null,          // NormalisedScanResult | null
  scannedAt:   null,          // Date | null
}

const CACHE_TTL_MS = 60_000   // 60s — stale after this

function _cacheIsValid() {
  return (
    _cache.documents !== null &&
    _cache.fetchedAt !== null &&
    Date.now() - _cache.fetchedAt.getTime() < CACHE_TTL_MS
  )
}

function _invalidateCache() {
  _cache.documents  = null
  _cache.fetchedAt  = null
  _cache.scanResult = null
  _cache.scannedAt  = null
}

// ── Response normalisers ──────────────────────────────────────────────────────

/**
 * Normalise one RAGDocumentResult from the backend.
 *
 * Backend schema (response.py → RAGDocumentResult):
 *   doc_id, content_preview, source,
 *   is_poisoned, poison_score, poison_status,
 *   created_at
 *
 * Also handles the looser shape returned by GET /rag/memory
 * (which may contain raw document metadata from ChromaDB).
 */
function normaliseDocument(raw, index = 0) {
  if (!raw) return null

  const docId          = raw.doc_id ?? raw.id ?? `doc-${index}`
  const contentPreview = raw.content_preview ?? raw.content ?? ''
  const source         = raw.source ?? raw.metadata?.source ?? 'unknown'
  const poisonScore    = raw.poison_score ?? raw.similarity_score ?? null
  const isPoisoned     = raw.is_poisoned
    ?? raw.metadata?.poisoned
    ?? raw.label === 1
    ?? false
  const poisonStatus   = raw.poison_status
    ?? (raw.is_blocked ? POISON_STATUS.BLOCKED
      : isPoisoned     ? POISON_STATUS.FLAGGED
      :                  POISON_STATUS.CLEAN)

  return {
    docId,
    contentPreview,
    source,
    isPoisoned,
    poisonScore,
    poisonScorePercent: poisonScore != null
      ? parseFloat((poisonScore * 100).toFixed(1))
      : null,
    poisonStatus,
    isHighRisk: isPoisoned && (poisonScore ?? 0) >= HIGH_RISK_THRESHOLD,
    createdAt:  raw.created_at ?? null,
  }
}

/**
 * Normalise the RAGInjectResponse envelope.
 *
 * Backend schema (response.py → RAGInjectResponse):
 *   success, message, doc_id, is_blocked, is_flagged,
 *   poison_score, action_taken
 */
function normaliseInjectResponse(res) {
  const poisonScore = res?.poison_score ?? null

  return {
    success:           res?.success       ?? true,
    message:           res?.message       ?? '',
    docId:             res?.doc_id        ?? null,
    isBlocked:         res?.is_blocked    ?? false,
    isFlagged:         res?.is_flagged    ?? false,
    poisonScore,
    poisonScorePercent: poisonScore != null
      ? parseFloat((poisonScore * 100).toFixed(1))
      : null,
    actionTaken:       res?.action_taken  ?? ACTION_TAKEN.STORED,
    isStored:          res?.action_taken === ACTION_TAKEN.STORED,
    isHighRisk:        (poisonScore ?? 0) >= HIGH_RISK_THRESHOLD,
  }
}

/**
 * Normalise the RAGScanResponse envelope.
 *
 * Backend schema (response.py → RAGScanResponse):
 *   success, message,
 *   total_documents, poisoned_count, flagged_count, clean_count,
 *   results: RAGDocumentResult[]
 */
function normaliseScanResponse(res) {
  const total    = res?.total_documents ?? 0
  const poisoned = res?.poisoned_count  ?? 0
  const flagged  = res?.flagged_count   ?? 0
  const clean    = res?.clean_count     ?? (total - poisoned - flagged)
  const docs     = (res?.results ?? []).map(normaliseDocument)

  return {
    success:        res?.success ?? true,
    message:        res?.message ?? '',
    totalDocuments: total,
    poisonedCount:  poisoned,
    flaggedCount:   flagged,
    cleanCount:     clean,
    // Derived
    threatRate:     total > 0 ? parseFloat(((poisoned + flagged) / total * 100).toFixed(1)) : 0,
    isClean:        poisoned === 0 && flagged === 0,
    results:        docs,
  }
}

/**
 * Normalise the GET /rag/memory response.
 *
 * Backend returns: { success, total, documents: [...] }
 * Shape is looser than RAGDocumentResult — raw ChromaDB metadata.
 */
function normaliseMemoryResponse(res) {
  const raw  = Array.isArray(res)
    ? res
    : (res?.documents ?? res?.results ?? [])

  const docs = raw.map((d, i) => normaliseDocument(d, i))

  return {
    success: res?.success ?? true,
    total:   res?.total   ?? docs.length,
    documents: docs,
  }
}

/**
 * Derive memory stats from a normalised document list.
 * Used by both getMemoryStats() and after a fresh memory fetch.
 */
function deriveStats(documents) {
  const total    = documents.length
  const blocked  = documents.filter((d) => d.poisonStatus === POISON_STATUS.BLOCKED).length
  const flagged  = documents.filter((d) => d.poisonStatus === POISON_STATUS.FLAGGED).length
  const clean    = documents.filter((d) => d.poisonStatus === POISON_STATUS.CLEAN).length
  const highRisk = documents.filter((d) => d.isHighRisk).length

  const scores      = documents.map((d) => d.poisonScore).filter((s) => s != null)
  const avgScore    = scores.length
    ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length * 100).toFixed(1))
    : null
  const maxScore    = scores.length
    ? parseFloat((Math.max(...scores) * 100).toFixed(1))
    : null

  return {
    total,
    blockedCount:  blocked,
    flaggedCount:  flagged,
    cleanCount:    clean,
    highRiskCount: highRisk,
    threatRate:    total > 0
      ? parseFloat(((blocked + flagged) / total * 100).toFixed(1))
      : 0,
    avgPoisonScorePercent: avgScore,
    maxPoisonScorePercent: maxScore,
    isClean:       blocked === 0 && flagged === 0,
    memorySafe:    blocked === 0,
  }
}

// ── Private: fetch & cache raw memory documents ───────────────────────────────

async function _fetchAndCacheMemory(signal = null) {
  const res  = await api.get('/rag/memory', { signal })
  const norm = normaliseMemoryResponse(res)
  _cache.documents = norm.documents
  _cache.fetchedAt = new Date()
  return norm
}

// ── injectDocument ────────────────────────────────────────────────────────────

/**
 * Inject a document into RAG memory, screening it for memory poisoning.
 *
 * POST /api/v1/rag/inject
 *
 * Sentinel runs the document through ML classification + vector similarity
 * before committing it to the ChromaDB vector store. If the document is
 * classified as a poisoning attempt it is blocked and never stored.
 *
 * @param {string}  content           — document text to inject (1–16 384 chars)
 * @param {string}  [source]          — source tag e.g. 'manual' | 'api' | 'file'
 * @param {object}  [options]
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<NormalisedInjectResponse>}
 * @throws  {MemoryServiceError}
 */
export async function injectDocument(content, source = 'manual', options = {}) {
  const { signal = null } = options

  // Input validation
  if (!content || typeof content !== 'string') {
    throw new MemoryServiceError('content must be a non-empty string', 400)
  }
  const trimmed = content.trim()
  if (!trimmed.length) {
    throw new MemoryServiceError('content cannot be blank', 400)
  }
  if (trimmed.length > 16_384) {
    throw new MemoryServiceError(
      'content exceeds maximum length of 16,384 characters', 400
    )
  }
  if (source && typeof source !== 'string') {
    throw new MemoryServiceError('source must be a string', 400)
  }

  const res = await api.post(
    '/rag/inject',
    {
      content: trimmed,
      source:  (source ?? 'manual').trim() || 'manual',
    },
    { signal }
  )

  // A successful injection invalidates the memory cache
  _invalidateCache()

  return normaliseInjectResponse(res)
}

// ── scanMemory ────────────────────────────────────────────────────────────────

/**
 * Trigger a full scan of RAG memory for poisoned documents.
 *
 * POST /api/v1/rag/scan
 *
 * The backend retrieves every document from the ChromaDB collection,
 * embeds them, and checks each against the threat library using
 * cosine similarity. Results include a per-document poison_status
 * and poison_score.
 *
 * @param {object}  [options]
 * @param {number}  [options.similarityThreshold]  — override default threshold (0.0–1.0)
 * @param {string}  [options.collectionName]        — ChromaDB collection to scan
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<NormalisedScanResult>}
 * @throws  {MemoryServiceError}
 */
export async function scanMemory(options = {}) {
  const {
    similarityThreshold = null,
    collectionName      = null,
    signal              = null,
  } = options

  if (
    similarityThreshold !== null &&
    (typeof similarityThreshold !== 'number' ||
      similarityThreshold < 0 ||
      similarityThreshold > 1)
  ) {
    throw new MemoryServiceError(
      'similarityThreshold must be a number between 0.0 and 1.0', 400
    )
  }

  const body = {
    ...(similarityThreshold !== null && { similarity_threshold: similarityThreshold }),
    ...(collectionName      !== null && { collection_name:      collectionName      }),
  }

  const res = await api.post('/rag/scan', body, { signal })

  const normalised = normaliseScanResponse(res)

  // Cache scan results and update document cache from scan output
  _cache.scanResult = normalised
  _cache.scannedAt  = new Date()
  if (normalised.results.length > 0) {
    _cache.documents = normalised.results
    _cache.fetchedAt = new Date()
  }

  return normalised
}

// ── getMemoryStats ────────────────────────────────────────────────────────────

/**
 * Return aggregate statistics about the current RAG memory contents.
 *
 * Strategy:
 *   1. If a scan result is cached (< 60s old), derive stats from it.
 *   2. If the document list cache is valid, derive stats from it.
 *   3. Otherwise, GET /rag/memory and derive stats from the fresh list.
 *
 * Always returns a stats object — never throws due to a missing cache.
 *
 * @param {object}  [options]
 * @param {boolean} [options.forceRefresh=false]  — bypass cache
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<MemoryStats>}
 * @throws  {MemoryServiceError}
 */
export async function getMemoryStats(options = {}) {
  const { forceRefresh = false, signal = null } = options

  // Use cached scan result if fresh (most accurate — has per-doc poison scores)
  if (
    !forceRefresh &&
    _cache.scanResult &&
    _cache.scannedAt &&
    Date.now() - _cache.scannedAt.getTime() < CACHE_TTL_MS
  ) {
    const s = _cache.scanResult
    return {
      total:                 s.totalDocuments,
      blockedCount:          s.poisonedCount,
      flaggedCount:          s.flaggedCount,
      cleanCount:            s.cleanCount,
      highRiskCount:         s.results.filter((d) => d.isHighRisk).length,
      threatRate:            s.threatRate,
      avgPoisonScorePercent: null,   // not available in scan summary
      maxPoisonScorePercent: null,
      isClean:               s.isClean,
      memorySafe:            s.poisonedCount === 0,
      source:                'scan_cache',
      cachedAt:              _cache.scannedAt.toISOString(),
    }
  }

  // Use document list cache if valid
  if (!forceRefresh && _cacheIsValid()) {
    const stats = deriveStats(_cache.documents)
    return {
      ...stats,
      source:   'memory_cache',
      cachedAt: _cache.fetchedAt.toISOString(),
    }
  }

  // Fresh fetch
  const norm  = await _fetchAndCacheMemory(signal)
  const stats = deriveStats(norm.documents)

  return {
    ...stats,
    source:   'fresh',
    cachedAt: new Date().toISOString(),
  }
}

// ── getPoisonedDocuments ──────────────────────────────────────────────────────

/**
 * Return only the documents in RAG memory that are poisoned
 * (status === 'blocked' or 'flagged'), optionally filtered further.
 *
 * Fetches from GET /rag/memory unless the cache is still valid.
 *
 * @param {object}  [options]
 * @param {string}  [options.status]           — 'blocked' | 'flagged' | undefined (both)
 * @param {string}  [options.sortBy='score']   — 'score' | 'status' | 'date'
 * @param {boolean} [options.forceRefresh=false]
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<PoisonedDocumentsResult>}
 * @throws  {MemoryServiceError}
 */
export async function getPoisonedDocuments(options = {}) {
  const {
    status:       statusFilter = undefined,
    sortBy        = 'score',
    forceRefresh  = false,
    signal        = null,
  } = options

  if (
    statusFilter !== undefined &&
    !Object.values(POISON_STATUS).includes(statusFilter)
  ) {
    throw new MemoryServiceError(
      `status must be one of: ${Object.values(POISON_STATUS).join(', ')}`, 400
    )
  }
  if (!['score', 'status', 'date'].includes(sortBy)) {
    throw new MemoryServiceError("sortBy must be 'score', 'status', or 'date'", 400)
  }

  // Resolve source data (cache or fresh)
  let allDocs

  if (
    !forceRefresh &&
    _cache.scanResult &&
    _cache.scannedAt &&
    Date.now() - _cache.scannedAt.getTime() < CACHE_TTL_MS &&
    _cache.scanResult.results.length > 0
  ) {
    // Prefer scan results — they have the most accurate poison_score values
    allDocs = _cache.scanResult.results
  } else if (!forceRefresh && _cacheIsValid()) {
    allDocs = _cache.documents
  } else {
    const norm = await _fetchAndCacheMemory(signal)
    allDocs    = norm.documents
  }

  // Filter: poisoned only (blocked + flagged), then optionally by sub-status
  let poisoned = allDocs.filter(
    (d) => d.poisonStatus === POISON_STATUS.BLOCKED ||
           d.poisonStatus === POISON_STATUS.FLAGGED
  )

  if (statusFilter) {
    poisoned = poisoned.filter((d) => d.poisonStatus === statusFilter)
  }

  // Sort
  const sorted = [...poisoned].sort((a, b) => {
    if (sortBy === 'score') {
      return (b.poisonScore ?? -1) - (a.poisonScore ?? -1)
    }
    if (sortBy === 'date') {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    }
    // status: blocked first, then flagged
    const order = { [POISON_STATUS.BLOCKED]: 0, [POISON_STATUS.FLAGGED]: 1, [POISON_STATUS.CLEAN]: 2 }
    return (order[a.poisonStatus] ?? 3) - (order[b.poisonStatus] ?? 3)
  })

  const blocked = sorted.filter((d) => d.poisonStatus === POISON_STATUS.BLOCKED)
  const flagged = sorted.filter((d) => d.poisonStatus === POISON_STATUS.FLAGGED)

  return {
    success:      true,
    total:        sorted.length,
    blockedCount: blocked.length,
    flaggedCount: flagged.length,
    documents:    sorted,
    // Convenience sub-lists
    blocked,
    flagged,
    hasThreats:   sorted.length > 0,
  }
}

// ── getAllDocuments ────────────────────────────────────────────────────────────

/**
 * Return all documents currently stored in RAG memory.
 *
 * GET /api/v1/rag/memory
 *
 * Documents are normalised and optionally filtered/sorted by the caller.
 *
 * @param {object}  [options]
 * @param {string}  [options.status]           — 'blocked' | 'flagged' | 'clean' | undefined
 * @param {string}  [options.sortBy='date']    — 'score' | 'status' | 'date'
 * @param {boolean} [options.forceRefresh=false]
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<AllDocumentsResult>}
 * @throws  {MemoryServiceError}
 */
export async function getAllDocuments(options = {}) {
  const {
    status:      statusFilter = undefined,
    sortBy       = 'date',
    forceRefresh = false,
    signal       = null,
  } = options

  if (
    statusFilter !== undefined &&
    !Object.values(POISON_STATUS).includes(statusFilter)
  ) {
    throw new MemoryServiceError(
      `status must be one of: ${Object.values(POISON_STATUS).join(', ')}`, 400
    )
  }

  // Resolve documents
  let docs

  if (!forceRefresh && _cacheIsValid()) {
    docs = _cache.documents
  } else {
    const norm = await _fetchAndCacheMemory(signal)
    docs       = norm.documents
  }

  // Filter
  let list = statusFilter
    ? docs.filter((d) => d.poisonStatus === statusFilter)
    : [...docs]

  // Sort
  list = list.sort((a, b) => {
    if (sortBy === 'score') {
      return (b.poisonScore ?? -1) - (a.poisonScore ?? -1)
    }
    if (sortBy === 'status') {
      const order = { [POISON_STATUS.BLOCKED]: 0, [POISON_STATUS.FLAGGED]: 1, [POISON_STATUS.CLEAN]: 2 }
      return (order[a.poisonStatus] ?? 3) - (order[b.poisonStatus] ?? 3)
    }
    // date descending
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })

  return {
    success:   true,
    total:     list.length,
    documents: list,
    stats:     deriveStats(list),
    cachedAt:  _cache.fetchedAt?.toISOString() ?? null,
  }
}

// ── createCancellableInjection ────────────────────────────────────────────────

/**
 * Create a cancellable wrapper around injectDocument.
 * Automatically aborts any in-flight request when inject() is called again
 * or when cancel() is called explicitly.
 *
 * Usage:
 *   const { inject, cancel } = createCancellableInjection()
 *
 *   const result = await inject(content, 'manual')
 *
 *   // On unmount or re-submit:
 *   cancel()
 *
 * @returns {{ inject: function, cancel: function }}
 */
export function createCancellableInjection() {
  let controller = null

  const inject = (content, source = 'manual', options = {}) => {
    if (controller) controller.abort()
    controller = new AbortController()
    return injectDocument(content, source, { ...options, signal: controller.signal })
  }

  const cancel = () => {
    if (controller) {
      controller.abort()
      controller = null
    }
  }

  return { inject, cancel }
}

// ── Cache management helpers ──────────────────────────────────────────────────

/**
 * Manually invalidate the service's in-memory cache.
 * Call this after an external operation modifies RAG memory
 * (e.g. a delete / quarantine action).
 */
export function invalidateMemoryCache() {
  _invalidateCache()
}

/**
 * Return the current cache state for debugging / status indicators.
 * @returns {{ hasCache: boolean, fetchedAt: string|null, scannedAt: string|null }}
 */
export function getCacheInfo() {
  return {
    hasDocumentCache: _cache.documents !== null,
    hasScanCache:     _cache.scanResult !== null,
    documentCount:    _cache.documents?.length ?? 0,
    fetchedAt:        _cache.fetchedAt?.toISOString() ?? null,
    scannedAt:        _cache.scannedAt?.toISOString() ?? null,
    isStale:          !_cacheIsValid(),
  }
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Returns true if a normalised document should be considered a high-risk threat.
 * @param {NormalisedDocument} doc
 */
export function isHighRisk(doc) {
  return doc?.isPoisoned && (doc?.poisonScore ?? 0) >= HIGH_RISK_THRESHOLD
}

/**
 * Map a poison_score (0–1) to a severity label.
 * @param {number|null} score
 * @returns {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'SAFE'}
 */
export function scoreToSeverity(score) {
  if (score == null)   return 'SAFE'
  if (score >= 0.90)   return 'CRITICAL'
  if (score >= 0.80)   return 'HIGH'
  if (score >= 0.60)   return 'MEDIUM'
  if (score >= 0.40)   return 'LOW'
  return 'SAFE'
}

// ── Default export — convenience object ──────────────────────────────────────

const memoryService = {
  // Core functions
  injectDocument,
  scanMemory,
  getMemoryStats,
  getPoisonedDocuments,
  getAllDocuments,

  // Factory
  createCancellableInjection,

  // Cache management
  invalidateMemoryCache,
  getCacheInfo,

  // Helpers
  isHighRisk,
  scoreToSeverity,

  // Error class
  MemoryServiceError,

  // Constants
  POISON_STATUS,
  ACTION_TAKEN,
}

export default memoryService
