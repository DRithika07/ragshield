/**
 * reportService.js — PDF Incident Report Service Layer
 * ══════════════════════════════════════════════════════
 * Phase 6 · Step 4
 *
 * Dedicated service module for all PDF report API operations.
 * Wraps the shared Axios instance with domain-specific logic:
 *   – input validation before requests leave the browser
 *   – response normalisation into a consistent camelCase shape
 *   – typed ReportServiceError class (mirrors ThreatServiceError pattern)
 *   – in-memory session list cache to avoid redundant GET /reports calls
 *   – browser-native PDF download (anchor injection + Blob URL)
 *   – cancellation support via AbortController
 *
 * Backend routes consumed (reports.py):
 *   POST /api/v1/reports/generate   — generate a PDF for given threat log IDs
 *   GET  /api/v1/reports/{id}       — stream / download a generated PDF
 *   GET  /api/v1/reports            — list all generated reports (newest first)
 *
 * Note: DELETE /api/v1/reports/{id} is not implemented in the backend yet.
 * deleteReport() provides the full client-side implementation so it is
 * ready the moment the route is added — it gracefully handles 404/405
 * and falls back to a cache-only removal.
 *
 * Exports (named):
 *   generateReport(threatLogIds, title, options)  — POST /reports/generate
 *   downloadReport(reportId, fileName, options)   — GET  /reports/{id} → save PDF
 *   getReports(options)                           — GET  /reports
 *   deleteReport(reportId, options)               — DELETE /reports/{id}
 *   getDownloadUrl(reportId)                      — build direct download URL
 *   createCancellableGeneration()                 — factory: cancellable generateReport
 *   ReportServiceError                            — custom error class
 *   REPORT_TYPE                                   — report type constants
 *
 * Default export: convenience object containing all functions.
 */

import axios from 'axios'

// ── Shared Axios instance ─────────────────────────────────────────────────────

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 120_000,             // 2 min — PDF generation includes DB query + rendering
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

// Unwrap response.data; normalise errors → ReportServiceError
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
    return Promise.reject(new ReportServiceError(msg, status, err.response?.data))
  }
)

// ── Separate Axios instance for binary PDF downloads ──────────────────────────
// Must NOT unwrap response.data — we need the raw Axios response to access
// the Blob and Content-Disposition header.

const binaryApi = axios.create({
  baseURL:      '/api/v1',
  timeout:      60_000,
  responseType: 'blob',
})

binaryApi.interceptors.request.use((config) => {
  const key = import.meta.env.VITE_API_KEY
  if (key) config.headers['X-API-Key'] = key
  return config
})

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Known report type values (matches backend report_type column).
 * Used for display label mapping and filter tabs.
 */
export const REPORT_TYPE = Object.freeze({
  SINGLE:        'single',        // one threat log
  BATCH:         'batch',         // multiple threat logs
  MEMORY_POISON: 'memory_poison', // RAG memory poisoning events
  FULL_AUDIT:    'full_audit',    // all logs, including safe prompts
})

// Max number of threat log IDs per report request (backend limit)
const MAX_IDS_PER_REPORT = 500

// In-memory session cache for the report list
const _cache = {
  reports:   null,     // NormalisedReportMeta[] | null
  fetchedAt: null,     // Date | null
}
const CACHE_TTL_MS = 30_000   // 30s — reports change rarely but we stay fresh

function _listCacheIsValid() {
  return (
    _cache.reports  !== null &&
    _cache.fetchedAt !== null &&
    Date.now() - _cache.fetchedAt.getTime() < CACHE_TTL_MS
  )
}

function _invalidateListCache() {
  _cache.reports  = null
  _cache.fetchedAt = null
}

// ── Custom error class ────────────────────────────────────────────────────────

/**
 * Typed error thrown by every reportService function on failure.
 */
export class ReportServiceError extends Error {
  /**
   * @param {string} message  — human-readable description
   * @param {number} status   — HTTP status (0 = network / timeout)
   * @param {any}    detail   — raw backend error payload
   */
  constructor(message, status = 0, detail = null) {
    super(message)
    this.name   = 'ReportServiceError'
    this.status = status
    this.detail = detail
  }

  get isNotFound()     { return this.status === 404 }
  get isUnauthorized() { return this.status === 401 }
  get isServerError()  { return this.status >= 500  }
  get isNetworkError() { return this.status === 0   }
  get isTimeout()      { return this.message?.toLowerCase().includes('timeout') }
}

// ── Response normalisers ──────────────────────────────────────────────────────

/**
 * Normalise a ReportMeta object from the backend.
 *
 * Backend schema (response.py → ReportMeta):
 *   report_id, report_title, file_name, report_type,
 *   threat_log_id, created_at
 */
function normaliseReportMeta(raw) {
  if (!raw) return null
  return {
    reportId:    raw.report_id    ?? raw.id ?? '',
    reportTitle: raw.report_title ?? 'Untitled Report',
    fileName:    raw.file_name    ?? `report_${raw.report_id?.slice(0, 8) ?? 'unknown'}.pdf`,
    reportType:  raw.report_type  ?? REPORT_TYPE.BATCH,
    threatLogId: raw.threat_log_id ?? null,
    createdAt:   raw.created_at   ?? null,
    // Derived
    downloadUrl: getDownloadUrl(raw.report_id ?? raw.id ?? ''),
    typeLabel:   _typeLabel(raw.report_type),
  }
}

/**
 * Normalise the ReportGenerateResponse envelope.
 *
 * Backend schema (response.py → ReportGenerateResponse):
 *   success, message, data: ReportMeta, download_url
 */
function normaliseGenerateResponse(res) {
  const meta = normaliseReportMeta(res?.data)
  return {
    success:     res?.success     ?? true,
    message:     res?.message     ?? '',
    report:      meta,
    downloadUrl: res?.download_url ?? (meta ? getDownloadUrl(meta.reportId) : null),
  }
}

/**
 * Normalise the ReportListResponse envelope.
 *
 * Backend schema (response.py → ReportListResponse):
 *   success, message, data: ReportMeta[], total
 */
function normaliseListResponse(res) {
  const reports = (res?.data ?? []).map(normaliseReportMeta).filter(Boolean)
  return {
    success: res?.success ?? true,
    message: res?.message ?? '',
    reports,
    total:   res?.total   ?? reports.length,
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Map report_type key → human-readable label. */
function _typeLabel(type) {
  const map = {
    [REPORT_TYPE.SINGLE]:        'Malicious Only',
    [REPORT_TYPE.BATCH]:         'Incident Summary',
    [REPORT_TYPE.MEMORY_POISON]: 'Memory Poisoning',
    [REPORT_TYPE.FULL_AUDIT]:    'Full Audit',
  }
  return map[type] ?? 'Report'
}

/**
 * Extract filename from Content-Disposition header.
 * Falls back to the provided defaultName if parsing fails.
 */
function _extractFilename(contentDisposition, defaultName) {
  if (!contentDisposition) return defaultName
  const match = contentDisposition.match(/filename[^;=\n]*=(["']?)([^"'\n;]+)\1/)
  return match?.[2]?.trim() ?? defaultName
}

/**
 * Trigger a browser file-save using a Blob URL anchor.
 * Works in all modern browsers. Cleans up the object URL after 60s.
 */
function _saveBlobAsPdf(blob, filename) {
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = filename
  link.rel      = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ── getDownloadUrl ────────────────────────────────────────────────────────────

/**
 * Build the direct PDF download URL for a given report ID.
 * This mirrors reportsAPI.getDownloadUrl() in api.js so consuming
 * components can use either without importing both services.
 *
 * @param {string} reportId
 * @returns {string}  — absolute path including /api/v1 prefix
 */
export function getDownloadUrl(reportId) {
  if (!reportId) return ''
  return `/api/v1/reports/${reportId}`
}

// ── generateReport ────────────────────────────────────────────────────────────

/**
 * Generate a PDF incident report for one or more threat log IDs.
 *
 * POST /api/v1/reports/generate
 *
 * The backend fetches the specified ThreatLog rows from SQLite, runs
 * them through ReportService.generate_pdf(), persists IncidentReport
 * metadata, and returns the report's download URL.
 *
 * @param {string[]} threatLogIds       — one or more ThreatLog UUIDs (max 500)
 * @param {string}   [title]            — custom report title; auto-generated if omitted
 * @param {object}   [options]
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<NormalisedGenerateResponse>}
 * @throws  {ReportServiceError}
 */
export async function generateReport(threatLogIds, title = null, options = {}) {
  const { signal = null } = options

  // Validate IDs
  if (!Array.isArray(threatLogIds) || threatLogIds.length === 0) {
    throw new ReportServiceError(
      'threatLogIds must be a non-empty array of strings', 400
    )
  }
  if (threatLogIds.length > MAX_IDS_PER_REPORT) {
    throw new ReportServiceError(
      `Cannot include more than ${MAX_IDS_PER_REPORT} threat logs in a single report`, 400
    )
  }
  const cleaned = threatLogIds.map((id, i) => {
    if (!id || typeof id !== 'string') {
      throw new ReportServiceError(
        `threatLogIds[${i}] must be a non-empty string`, 400
      )
    }
    return id.trim()
  })

  // Validate title
  if (title !== null && title !== undefined) {
    if (typeof title !== 'string') {
      throw new ReportServiceError('title must be a string or null', 400)
    }
    if (title.length > 255) {
      throw new ReportServiceError('title must not exceed 255 characters', 400)
    }
  }

  const body = {
    threat_log_ids: cleaned,
    ...(title?.trim() ? { report_title: title.trim() } : {}),
  }

  const res = await api.post('/reports/generate', body, { signal })

  const normalised = normaliseGenerateResponse(res)

  // Prepend to session cache if valid
  if (_listCacheIsValid() && normalised.report) {
    _cache.reports = [normalised.report, ...(_cache.reports ?? [])]
  } else {
    _invalidateListCache()
  }

  return normalised
}

// ── downloadReport ────────────────────────────────────────────────────────────

/**
 * Download a generated PDF report and trigger a browser file-save.
 *
 * GET /api/v1/reports/{report_id}
 *
 * The backend streams the PDF as application/pdf via FileResponse.
 * This function fetches it as a Blob, creates an object URL, and
 * clicks a hidden anchor — no new tab required.
 *
 * @param {string}  reportId            — report UUID
 * @param {string}  [fileName]          — override save filename;
 *                                        falls back to Content-Disposition or reportId
 * @param {object}  [options]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.openInTab=false]  — open PDF in a new tab instead of saving
 *
 * @returns {Promise<DownloadResult>}
 * @throws  {ReportServiceError}
 */
export async function downloadReport(reportId, fileName = null, options = {}) {
  const { signal = null, openInTab = false } = options

  if (!reportId || typeof reportId !== 'string') {
    throw new ReportServiceError('reportId must be a non-empty string', 400)
  }

  // Option A: open in new tab (uses direct URL — no JS download needed)
  if (openInTab) {
    const url = getDownloadUrl(reportId.trim())
    window.open(url, '_blank', 'noopener,noreferrer')
    return { success: true, reportId, method: 'tab', fileName: null }
  }

  // Option B: Blob download
  try {
    const response = await binaryApi.get(`/reports/${reportId.trim()}`, { signal })

    const blob        = new Blob([response.data], { type: 'application/pdf' })
    const disposition = response.headers?.['content-disposition'] ?? ''
    const fallback    = fileName?.trim() || `report_${reportId.slice(0, 8)}.pdf`
    const saveName    = _extractFilename(disposition, fallback)

    _saveBlobAsPdf(blob, saveName)

    return {
      success:  true,
      reportId,
      fileName: saveName,
      method:   'blob',
      sizeBytes: blob.size,
    }
  } catch (err) {
    // If binaryApi throws (no unwrap interceptor), wrap it
    if (err instanceof ReportServiceError) throw err
    const status = err.response?.status ?? 0
    const msg    =
      status === 404
        ? `Report '${reportId}' not found — it may have been deleted or not yet generated`
        : `Failed to download report: ${err.message ?? 'network error'}`
    throw new ReportServiceError(msg, status, err.response?.data)
  }
}

// ── getReports ────────────────────────────────────────────────────────────────

/**
 * Fetch the list of all generated PDF reports, newest first.
 *
 * GET /api/v1/reports
 *
 * Results are cached in-memory for 30 seconds to avoid hammering the
 * endpoint during rapid re-renders (e.g. ReportHistory polling).
 *
 * @param {object}  [options]
 * @param {boolean} [options.forceRefresh=false]  — bypass the session cache
 * @param {string}  [options.reportType]          — client-side filter by report_type
 * @param {string}  [options.sortBy='date']       — 'date' | 'title' | 'type'
 * @param {'asc'|'desc'} [options.sortDir='desc']
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<NormalisedListResult>}
 * @throws  {ReportServiceError}
 */
export async function getReports(options = {}) {
  const {
    forceRefresh = false,
    reportType   = undefined,
    sortBy       = 'date',
    sortDir      = 'desc',
    signal       = null,
  } = options

  if (
    reportType !== undefined &&
    !Object.values(REPORT_TYPE).includes(reportType)
  ) {
    throw new ReportServiceError(
      `reportType must be one of: ${Object.values(REPORT_TYPE).join(', ')}`, 400
    )
  }
  if (!['date', 'title', 'type'].includes(sortBy)) {
    throw new ReportServiceError("sortBy must be 'date', 'title', or 'type'", 400)
  }
  if (!['asc', 'desc'].includes(sortDir)) {
    throw new ReportServiceError("sortDir must be 'asc' or 'desc'", 400)
  }

  // Serve from cache if valid and no forced refresh
  let reports
  if (!forceRefresh && _listCacheIsValid()) {
    reports = _cache.reports
  } else {
    const res = await api.get('/reports', { signal })
    const norm = normaliseListResponse(res)
    reports = norm.reports
    _cache.reports  = reports
    _cache.fetchedAt = new Date()
  }

  // Client-side filter
  let list = reportType
    ? reports.filter((r) => r.reportType === reportType)
    : [...reports]

  // Client-side sort
  list = list.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'date') {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      cmp = tb - ta   // newest first by default
    } else if (sortBy === 'title') {
      cmp = (a.reportTitle ?? '').localeCompare(b.reportTitle ?? '')
    } else if (sortBy === 'type') {
      cmp = (a.reportType ?? '').localeCompare(b.reportType ?? '')
    }
    return sortDir === 'asc' ? -cmp : cmp
  })

  // Aggregate counts by type
  const byType = Object.values(REPORT_TYPE).reduce((acc, t) => {
    acc[t] = reports.filter((r) => r.reportType === t).length
    return acc
  }, {})

  return {
    success:     true,
    reports:     list,
    total:       list.length,
    totalAll:    reports.length,
    byType,
    cachedAt:    _cache.fetchedAt?.toISOString() ?? null,
    isFiltered:  !!reportType,
  }
}

// ── deleteReport ──────────────────────────────────────────────────────────────

/**
 * Delete a generated PDF report by ID.
 *
 * DELETE /api/v1/reports/{report_id}
 *
 * Note: This endpoint is not yet implemented in the backend (reports.py
 * does not define a DELETE route). This function attempts the call and:
 *   • If the server returns 204/200 → success, removes from cache.
 *   • If the server returns 404/405/501 → logs a warning, still removes
 *     from the local session cache so the UI stays consistent.
 *   • Other errors → rethrows as ReportServiceError.
 *
 * @param {string}  reportId
 * @param {object}  [options]
 * @param {boolean} [options.cacheOnly=false]  — skip network, only remove from cache
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<DeleteResult>}
 * @throws  {ReportServiceError}
 */
export async function deleteReport(reportId, options = {}) {
  const { cacheOnly = false, signal = null } = options

  if (!reportId || typeof reportId !== 'string') {
    throw new ReportServiceError('reportId must be a non-empty string', 400)
  }

  const id = reportId.trim()
  let serverSuccess = false

  if (!cacheOnly) {
    try {
      await api.delete(`/reports/${id}`, { signal })
      serverSuccess = true
    } catch (err) {
      if (err instanceof ReportServiceError) {
        // 404 = already gone, 405 = not implemented — both are acceptable
        if (err.isNotFound || err.status === 405 || err.status === 501) {
          console.warn(
            `[reportService] DELETE /reports/${id} returned ${err.status} — ` +
            'removing from local cache only.'
          )
          serverSuccess = false   // soft success
        } else {
          throw err   // genuine server error — propagate
        }
      } else {
        throw err
      }
    }
  }

  // Remove from local session cache regardless of network outcome
  if (_cache.reports) {
    _cache.reports = _cache.reports.filter((r) => r.reportId !== id)
  }

  return {
    success:       true,
    reportId:      id,
    serverSuccess,
    cacheOnly:     cacheOnly || !serverSuccess,
  }
}

// ── createCancellableGeneration ───────────────────────────────────────────────

/**
 * Create a cancellable wrapper around generateReport.
 * Automatically aborts any in-flight request when generate() is called
 * again or cancel() is invoked explicitly — useful in React components
 * that allow the user to cancel a long-running PDF build.
 *
 * Usage:
 *   const { generate, cancel } = createCancellableGeneration()
 *
 *   const result = await generate(threatLogIds, 'Q4 Audit')
 *
 *   // On unmount or re-submit:
 *   cancel()
 *
 * @returns {{ generate: function, cancel: function }}
 */
export function createCancellableGeneration() {
  let controller = null

  const generate = (threatLogIds, title = null, options = {}) => {
    if (controller) controller.abort()
    controller = new AbortController()
    return generateReport(threatLogIds, title, { ...options, signal: controller.signal })
  }

  const cancel = () => {
    if (controller) {
      controller.abort()
      controller = null
    }
  }

  return { generate, cancel }
}

// ── Cache management helpers ──────────────────────────────────────────────────

/**
 * Manually invalidate the session report list cache.
 * Call after external operations that modify the report list.
 */
export function invalidateReportCache() {
  _invalidateListCache()
}

/**
 * Return current cache diagnostic info.
 * @returns {{ hasCache: boolean, count: number, fetchedAt: string|null, isStale: boolean }}
 */
export function getReportCacheInfo() {
  return {
    hasCache:  _cache.reports !== null,
    count:     _cache.reports?.length ?? 0,
    fetchedAt: _cache.fetchedAt?.toISOString() ?? null,
    isStale:   !_listCacheIsValid(),
  }
}

// ── Default export — convenience object ──────────────────────────────────────

const reportService = {
  // Core functions
  generateReport,
  downloadReport,
  getReports,
  deleteReport,

  // URL helper (mirrors reportsAPI.getDownloadUrl from api.js)
  getDownloadUrl,

  // Factory
  createCancellableGeneration,

  // Cache management
  invalidateReportCache,
  getReportCacheInfo,

  // Error class
  ReportServiceError,

  // Constants
  REPORT_TYPE,
}

export default reportService
