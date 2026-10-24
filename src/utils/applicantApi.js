// Applicant accounts: PIN sign-in and the applicant's own dashboard data.
// The session token lives beside the student record in localStorage and is
// sent with every student call (driveApi.js getAuthHeaders).
import { companyHeaders, setStudentCompany } from './company';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const KEY = 'doclocker_applicant';

// A token past its expiry is treated as no token.
export function getApplicantToken() {
  try {
    const { token } = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    if (!token) return '';
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return exp && exp * 1000 > Date.now() ? token : '';
  } catch {
    return '';
  }
}

export function setApplicantToken(token) {
  try {
    if (token) localStorage.setItem(KEY, JSON.stringify({ token }));
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked: the student signs in again next time */ }
}

export const clearApplicantToken = () => setApplicantToken('');

export function applicantHeaders() {
  const token = getApplicantToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Thrown for every failed call; `status` and the server's extra fields
// (attemptsLeft, needsPin, locked, exists, applicantSignIn) ride along.
class ApplicantError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

async function call(method, path, body, { auth = false } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...companyHeaders(),
        ...(auth ? applicantHeaders() : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new ApplicantError('We couldn’t reach the server. Please check your connection and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const { error, success, ...extra } = data;
    void success;
    const message = res.status === 429
      ? 'Too many tries in a short time. Please wait a few minutes and try again.'
      : error || 'Something went wrong. Please try again.';
    throw new ApplicantError(message, res.status, extra);
  }
  return data;
}

// A successful registration / sign-in: keep the session and the company,
// hand back the record.
function signedIn(data) {
  setApplicantToken(data.token);
  if (data.company) setStudentCompany(data.company);
  return data.student;
}

export const registerApplicant = async (details) => signedIn(await call('POST', '/api/applicant/register', details));
export const lookupApplicant = (identifier) => call('POST', '/api/applicant/lookup', { identifier });
export const signInApplicant = async (identifier, pin) => signedIn(await call('POST', '/api/applicant/sign-in', { identifier, pin }));
export const createApplicantPin = async (identifier, pin) => signedIn(await call('POST', '/api/applicant/create-pin', { identifier, pin }));

export const fetchMyApplication = () => call('GET', '/api/applicant/me', null, { auth: true });
export const submitMyApplication = () => call('POST', '/api/applicant/submit', {}, { auth: true });
export const fetchMyDocuments = async () => (await call('GET', '/api/applicant/documents', null, { auth: true })).groups || [];
export const fetchMyActivity = async () => (await call('GET', '/api/applicant/activity', null, { auth: true })).items || [];

// Files come back as a blob (the session can't ride on a plain link) and
// are handed to the browser to save.
async function fetchBlob(path) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: { ...companyHeaders(), ...applicantHeaders() }, signal: AbortSignal.timeout(180000) });
  } catch {
    throw new ApplicantError('We couldn’t reach the server. Please check your connection and try again.', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApplicantError(data.error || 'The download didn’t work. Please try again.', res.status, data);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'document';
  return { blob: await res.blob(), name };
}

function saveBlob({ blob, name }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const openMyDocument = (fileId) => fetchBlob(`/api/applicant/documents/${encodeURIComponent(fileId)}`);
export const downloadMyDocument = async (fileId) => saveBlob(await fetchBlob(`/api/applicant/documents/${encodeURIComponent(fileId)}?mode=download`));
export const downloadMyZip = async (group) => saveBlob(await fetchBlob(`/api/applicant/documents-zip${group ? `?group=${encodeURIComponent(group)}` : ''}`));

// The 6-digit PIN rule, mirrored from Backend/src/services/applicantPins.js.
export function pinProblem(pin) {
  const p = String(pin || '');
  if (!/^\d{6}$/.test(p)) return 'Your PIN must be exactly 6 digits';
  if (/^(\d)\1{5}$/.test(p)) return 'Choose a PIN that isn’t one digit repeated';
  if ('0123456789'.includes(p) || '9876543210'.includes(p)) return 'Choose a PIN that isn’t a simple sequence like 123456';
  return null;
}
