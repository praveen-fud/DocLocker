// Express.js backend API client.
// VITE_API_URL: in local dev, set to http://localhost:3001
// In Vercel production: leave unset (or set to "") — requests go through Vercel's /api proxy
// which rewrites to Railway server-side, so the mobile never needs to reach Railway directly.

import { companyHeaders } from './company';
import { applicantHeaders, clearApplicantToken } from './applicantApi';
import { indianMobileProblem, emailProblem } from './validation';

const API_URL = import.meta.env.VITE_API_URL ?? '';

// ── Auth header helper ────────────────────────────────────────────────────────
// Staff send their token; students their PIN session and the company of
// their signup link.
function getAuthHeaders() {
  try {
    const raw = localStorage.getItem('abroad_admin_session');
    const { token } = raw ? JSON.parse(raw) : {};
    if (token) return { Authorization: `Bearer ${token}` };
  } catch { /* fall through to the student's session */ }
  return { ...companyHeaders(), ...applicantHeaders() };
}

// Staff working on a student's file use the staff routes.
function hasStaffSession() {
  try {
    return Boolean(JSON.parse(localStorage.getItem('abroad_admin_session') || 'null')?.token);
  } catch {
    return false;
  }
}

// ── Core POST ─────────────────────────────────────────────────────────────────
async function apiPost(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error('Bad JSON response from API'); }
  if (!data.success) throw new Error(data.error || 'API returned failure');
  return data;
}

// ── Core GET ──────────────────────────────────────────────────────────────────
async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_URL}${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, { headers: getAuthHeaders(), signal: AbortSignal.timeout(15000) });
  let data;
  try { data = await res.json(); } catch { throw new Error('Bad JSON response from API'); }
  if (!data.success) throw new Error(data.error || 'API GET failed');
  return data;
}

// ── Core DELETE ───────────────────────────────────────────────────────────────
async function apiDelete(path, body = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error('Bad JSON response from API'); }
  if (!data.success) throw new Error(data.error || 'API DELETE failed');
  return data;
}

// ── Core PUT ──────────────────────────────────────────────────────────────────
async function apiPut(path, body = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error('Bad JSON response from API'); }
  if (!data.success) throw new Error(data.error || 'API PUT failed');
  return data;
}

// ── Change own password (any logged-in role) ───────────────────────────────────
export async function changeOwnPassword(currentPassword, newPassword) {
  return apiPut('/api/admins/password', { currentPassword, newPassword });
}

// ── Folder key ────────────────────────────────────────────────────────────────
export function buildFolderKey(name, identifier = '') {
  const safeName = (name || 'Unknown').trim();
  const safeId = (identifier || '').trim().replace(/[^a-zA-Z0-9@._+-]/g, '');
  return safeId ? `${safeName}__${safeId}` : safeName;
}

// ── Input validators ──────────────────────────────────────────────────────────
// Indian mobile numbers only (see utils/validation.js). Empty counts as valid
// here; callers that need a number check for it themselves.
export function isValidPhone(phone) {
  if (!phone || phone.trim() === '') return true;
  return indianMobileProblem(phone) === null;
}

export function isValidEmail(email) {
  if (!email || email.trim() === '') return true;
  return emailProblem(email) === null;
}

// ── Clear student session from localStorage ───────────────────────────────────
export function clearStudentFromLocalStorage() {
  localStorage.removeItem('abroad_student');
  clearApplicantToken();
  // Remove any legacy student_meta_ cache keys from previous app versions
  Object.keys(localStorage)
    .filter((k) => k.startsWith('student_meta_'))
    .forEach((k) => localStorage.removeItem(k));
}

// ── Upload a file (multipart — no base64 overhead) ───────────────────────────
// When no admin JWT exists (student self-service), uses /api/student-upload
// which validates via the student's email/phone identifier instead.
// skipOcr: set when the file will be read by our own document model, so
// the backend skips its Drive OCR + regex parse. ID and certificate slots
// are checked and read by the server before saving (see `reader` below).
export async function uploadDocument({ studentName, studentIdentifier, subFolder, fileName, file, onProgress, skipOcr = false }) {
  const ext = file.name.split('.').pop().toLowerCase();
  const finalName = `${fileName}.${ext}`;
  const authHeaders = getAuthHeaders();
  const hasAdminToken = hasStaffSession();

  if (onProgress) onProgress(10);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('subFolder', subFolder.trim());
  formData.append('fileName', finalName);
  if (skipOcr) formData.append('skipOcr', '1');

  let endpoint;
  if (hasAdminToken) {
    // Staff upload — uses folder key, JWT auth
    formData.append('studentName', buildFolderKey(studentName, studentIdentifier));
    endpoint = '/api/upload';
  } else {
    // Student self-service — the application comes from their PIN session
    endpoint = '/api/student-upload';
  }

  if (onProgress) onProgress(40);

  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: authHeaders,
    body: formData,
    // ID and certificate slots are read by our document model before
    // they're saved, which can take a while for large scans.
    signal: AbortSignal.timeout(150000),
  });

  let data;
  try { data = await res.json(); } catch { throw new Error('Bad JSON from upload API'); }
  if (!data.success) {
    const err = new Error(data.error || 'Upload failed');
    // The wrong document for this slot — nothing was saved.
    err.rejected = Boolean(data.rejected);
    throw err;
  }

  if (onProgress) onProgress(100);

  // `reader` (ID / certificate slots only): { gate, extraction, parsedData }
  // from the check done before saving. Not part of the stored upload record.
  return {
    id: data.fileId, name: data.fileName, webViewLink: data.webViewLink, parsedData: data.parsedData || null,
    reader: data.reader || null,
  };
}

// ── Save student metadata ─────────────────────────────────────────────────────
// Staff path: fire-and-forget (folder already exists, JWT auth).
// Student path: returns a Promise so callers can await folder creation.
// throwOnError: opt in to a Promise that settles with the real outcome (and
// rejects on failure) so the caller can show an honest "Saved" / "Couldn't
// save" state. Without it, failures are logged and swallowed as before.
export function saveStudentMeta(studentName, meta, studentIdentifier = '', { throwOnError = false } = {}) {
  const hasAdminToken = hasStaffSession();
  const swallow = (label) => (e) => {
    console.warn(`[DriveSync] ${label} failed${throwOnError ? '' : ' silently'}:`, e.message);
    if (throwOnError) throw e;
  };
  if (hasAdminToken) {
    const folderKey = buildFolderKey(studentName, studentIdentifier);
    const req = apiPost('/api/meta', { studentName: folderKey, metaJson: JSON.stringify(meta) })
      .catch(swallow('saveMeta'));
    return throwOnError ? req : Promise.resolve();
  } else {
    // The application comes from the applicant's PIN session.
    return apiPost('/api/student-meta', { metaJson: JSON.stringify(meta) })
      .catch(swallow('student-meta'));
  }
}

// ── List all students ─────────────────────────────────────────────────────────
export async function getAllStudentsFromDrive() {
  try {
    const data = await apiGet('/api/students');
    return data.students || [];
  } catch (e) {
    console.warn('getAllStudentsFromDrive failed:', e.message);
    return [];
  }
}

// Extract the Drive folder ID from a webViewLink, e.g.
// "https://drive.google.com/drive/folders/<id>?usp=drivesdk" -> "<id>"
function folderIdFromUrl(url) {
  const m = /\/folders\/([a-zA-Z0-9_-]+)/.exec(url || '');
  return m ? m[1] : null;
}

// ── Delete student ────────────────────────────────────────────────────────────
// Called only from the Admin panel to permanently remove another student's
// Drive folder — must propagate failures so the caller doesn't optimistically
// remove the row from its own list when the backend delete actually failed.
//
// Prefers folderId (extracted from the student's own driveUrl, so it's the
// exact folder shown in the UI) over reconstructing the folder name from
// studentName + studentIdentifier — that reconstruction can silently mismatch
// the real Drive folder name (whitespace/casing drift, older naming scheme),
// which previously made deletes no-op while still looking successful.
//
// Railway-stored students have no Drive folder; they're deleted by their
// own student key instead.
export async function deleteStudent(studentName, studentIdentifier = '', driveUrl = '', railwayStudentKey = '') {
  if (railwayStudentKey) {
    await apiDelete('/api/students', { studentKey: railwayStudentKey });
    return;
  }
  const folderId = folderIdFromUrl(driveUrl);
  if (folderId) {
    await apiDelete('/api/students', { folderId });
    return;
  }
  const folderKey = buildFolderKey(studentName, studentIdentifier);
  await apiDelete('/api/students', { studentName: folderKey });
}

// ── OCR scan a Drive file (admin JWT required) ────────────────────────────────
export async function ocrFile(fileId) {
  return apiPost('/api/ocr', { fileId });
}

// ── Structured document listing for a student, grouped by section ─────────────
// (staff: any student; banker: only students they've been granted access to —
// enforced server-side, so a denied/revoked banker gets a clear error here)
export async function getStudentFiles(studentName, studentIdentifier = '') {
  const folderKey = buildFolderKey(studentName, studentIdentifier);
  const data = await apiGet(`/api/students/${encodeURIComponent(folderKey)}/files`);
  return data.groups || {};
}

// ── Documents: view in the app, download with a one-time link ─────────────────
// The login token never goes into a URL. Viewing fetches the file with the
// Authorization header and hands back a Blob for the in-app viewer; a
// download asks the backend for a one-time link (2 minutes, that file only)
// so the browser can save it natively. Every open is recorded server-side.

// thumbnail: the small profile photo in the staff student list — not
// recorded as a document view (it loads for every row on every visit).
export async function fetchFileBlob(fileId, { thumbnail = false } = {}) {
  const params = new URLSearchParams({ mode: 'view' });
  if (thumbnail) params.set('purpose', 'thumbnail');
  const res = await fetch(`${API_URL}/api/files/${encodeURIComponent(fileId)}/content?${params}`, {
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    let message = `Could not open the document (${res.status})`;
    try { message = (await res.json()).error || message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  return res.blob();
}

function startBrowserDownload(path) {
  const a = document.createElement('a');
  a.href = `${API_URL}${path}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadFile(fileId) {
  const { url } = await apiPost(`/api/files/${encodeURIComponent(fileId)}/download-link`, {});
  startBrowserDownload(url);
}

// ── Update student loan status (admin / advisor / banker with access) ─────────
// disbursement: { processingFee, interestRate, loanAmount, tenureMonths, insuranceAmount }
// — required by the backend when loanStatus is "disbursed", ignored otherwise.
export async function updateLoanStatus(studentName, studentIdentifier, loanStatus, loanRemark = '', disbursement = null) {
  const folderKey = buildFolderKey(studentName, studentIdentifier || '');
  const body = { loanStatus, loanRemark };
  if (disbursement) body.disbursement = disbursement;
  return apiPut(`/api/students/${encodeURIComponent(folderKey)}/loan-status`, body);
}

// ── Upload sanction letter when loan is sanctioned ────────────────────────────
export function uploadSanctionLetter(studentName, studentIdentifier, file) {
  return uploadDocument({ studentName, studentIdentifier, subFolder: 'Loan_Documents', fileName: 'Sanction_Letter', file });
}

// ── Recover student meta from the Summary PDF via OCR + Claude ───────────────
export async function recoverMetaFromPdf(studentName, studentIdentifier = '') {
  const folderKey = buildFolderKey(studentName, studentIdentifier);
  return apiPost(`/api/students/${encodeURIComponent(folderKey)}/recover-meta`, {});
}

// ── Write a restored meta JSON back to Drive ──────────────────────────────────
export async function restoreMeta(studentName, studentIdentifier = '', meta) {
  const folderKey = buildFolderKey(studentName, studentIdentifier);
  return apiPost(`/api/students/${encodeURIComponent(folderKey)}/restore-meta`, { metaJson: JSON.stringify(meta) });
}

// ── Download all of a student's documents as a zip (one-time link) ───────────
export async function downloadAllFiles(studentName, studentIdentifier = '') {
  const folderKey = buildFolderKey(studentName, studentIdentifier);
  const { url } = await apiPost(`/api/students/${encodeURIComponent(folderKey)}/files/zip-link`, {});
  startBrowserDownload(url);
}

// ── Download chosen documents from any students as one zip (superadmin) ──────
// files: [{ id, path }] — path is where the file sits inside the zip.
export async function downloadBundle(files, label) {
  const { url } = await apiPost('/api/files/zip-link', { files, label });
  startBrowserDownload(url);
}

// ── Document reader — certificate / passport / Aadhaar / PAN extraction ───────
// Proxies through our backend (not called directly from the browser) so the
// third-party service URL, timeout and rate limiting all live server-side.
// Pure verification tool: nothing here is saved to Drive or attached to a
// student record — the caller decides what, if anything, to do with the result.
export async function extractDocument(docType, files, { consent } = {}) {
  const formData = new FormData();
  formData.append('doc_type', docType);
  if (consent) formData.append('consent', 'yes');
  files.forEach((f) => formData.append('files', f));

  const res = await fetch(`${API_URL}/api/document-reader/extract`, {
    method: 'POST',
    headers: getAuthHeaders(), // no Content-Type — the browser sets the multipart boundary
    body: formData,
    signal: AbortSignal.timeout(125000),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error('Bad JSON response from document reader'); }
  if (!data.success) throw new Error(data.error || 'Extraction failed');
  return data.result;
}

// ── Audit log (superadmin only) ────────────────────────────────────────────────
export async function getAuditLog({ action, actor, limit } = {}) {
  const params = {};
  if (action) params.action = action;
  if (actor) params.actor = actor;
  if (limit) params.limit = limit;
  const data = await apiGet('/api/audit', params);
  return { entries: data.entries || [], total: data.total || 0 };
}
