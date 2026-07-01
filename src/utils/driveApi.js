// Express.js backend API client.
// VITE_API_URL: in local dev, set to http://localhost:3001
// In Vercel production: leave unset (or set to "") — requests go through Vercel's /api proxy
// which rewrites to Railway server-side, so the mobile never needs to reach Railway directly.

const API_URL = import.meta.env.VITE_API_URL ?? '';

// ── Auth header helper ────────────────────────────────────────────────────────
function getAuthHeaders() {
  try {
    const raw = localStorage.getItem('abroad_admin_session');
    if (!raw) return {};
    const { token } = JSON.parse(raw);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
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
export function isValidPhone(phone) {
  if (!phone || phone.trim() === '') return true;
  return /^(\+91|0)?[6-9]\d{9}$/.test(phone.trim().replace(/\s+/g, ''));
}

export function isValidEmail(email) {
  if (!email || email.trim() === '') return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── Clear student session from localStorage ───────────────────────────────────
export function clearStudentFromLocalStorage() {
  localStorage.removeItem('abroad_student');
  // Remove any legacy student_meta_ cache keys from previous app versions
  Object.keys(localStorage)
    .filter((k) => k.startsWith('student_meta_'))
    .forEach((k) => localStorage.removeItem(k));
}

// ── Upload a file (multipart — no base64 overhead) ───────────────────────────
export async function uploadDocument({ studentName, studentIdentifier, subFolder, fileName, file, onProgress }) {

  const ext = file.name.split('.').pop().toLowerCase();
  const finalName = `${fileName}.${ext}`;
  const folderKey = buildFolderKey(studentName, studentIdentifier);

  if (onProgress) onProgress(10);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('studentName', folderKey);
  formData.append('subFolder', subFolder.trim());
  formData.append('fileName', finalName);

  if (onProgress) onProgress(40);

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
    signal: AbortSignal.timeout(90000),
  });

  let data;
  try { data = await res.json(); } catch { throw new Error('Bad JSON from upload API'); }
  if (!data.success) throw new Error(data.error || 'Upload failed');

  if (onProgress) onProgress(100);

  return { id: data.fileId, name: data.fileName, webViewLink: data.webViewLink, parsedData: data.parsedData || null };
}

// ── Save student metadata ─────────────────────────────────────────────────────
export function saveStudentMeta(studentName, meta, studentIdentifier = '') {
  const folderKey = buildFolderKey(studentName, studentIdentifier);
  apiPost('/api/meta', { studentName: folderKey, metaJson: JSON.stringify(meta) })
    .catch((e) => console.warn('[DriveSync] saveMeta failed silently:', e.message));
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

// ── Find student by email or phone ────────────────────────────────────────────
export async function searchStudentByIdentifier(identifier) {
  const id = identifier.trim();
  try {
    const data = await apiGet('/api/students/find', { identifier: id });
    return data.student || null;
  } catch (e) {
    console.warn('searchStudentByIdentifier:', e.message);
    return null;
  }
}

// ── Check if identifier exists ────────────────────────────────────────────────
export async function checkIdentifierExists(identifier) {
  return !!(await searchStudentByIdentifier(identifier));
}

// ── Delete student ────────────────────────────────────────────────────────────
export async function deleteStudent(studentName, studentIdentifier = '') {
  clearStudentFromLocalStorage();
  try {
    const folderKey = buildFolderKey(studentName, studentIdentifier);
    await apiDelete('/api/students', { studentName: folderKey });
  } catch (e) {
    console.warn('deleteStudent API call failed:', e.message);
  }
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

// ── Build a URL for viewing/downloading a file through the secure proxy ───────
// The JWT has to ride in the query string here (not a header) since this URL
// is used directly as <img src>/<iframe src>/download-link href.
export function getFileProxyUrl(fileId, mode = 'view') {
  const token = getAuthHeaders().Authorization?.replace('Bearer ', '') || '';
  const params = new URLSearchParams({ mode, token });
  return `${API_URL}/api/files/${fileId}/content?${params.toString()}`;
}

// ── Update student loan status (admin / advisor / banker with access) ─────────
export async function updateLoanStatus(studentName, studentIdentifier, loanStatus, loanRemark = '') {
  const folderKey = buildFolderKey(studentName, studentIdentifier || '');
  return apiPut(`/api/students/${encodeURIComponent(folderKey)}/loan-status`, { loanStatus, loanRemark });
}
