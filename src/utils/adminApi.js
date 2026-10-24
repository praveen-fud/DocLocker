// Signed-in staff API calls (admin dashboard, team and company pages).
const API_URL = import.meta.env.VITE_API_URL ?? '';

export function getToken() {
  try { return JSON.parse(localStorage.getItem("abroad_admin_session") || "{}").token || ""; }
  catch { return ""; }
}

// Resolves with the JSON body whatever the status, so callers can show the
// server's own message ("This is the last active super admin", …).
export async function callAPI(method, path, body) {
  const token = getToken();
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, opts);
  try {
    return await res.json();
  } catch {
    return { success: false, error: `Request failed (${res.status})` };
  }
}

export const ROLE_LABELS = { superadmin: "Super admin", admin: "Admin", advisor: "Staff", banker: "Lender" };
export const isAdminLevel = (role) => role === "superadmin" || role === "admin";

// Mirrors the server rule (services/accounts.js passwordProblem).
export function passwordProblem(p = "") {
  if (p.length < 10) return "Use at least 10 characters";
  if (p.length > 72) return "Use at most 72 characters";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Include at least one letter and one number";
  return null;
}

// A readable random password for "Generate" buttons (no look-alike characters).
export function generatePassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => set[v % set.length]).join("");
  return `${pick(letters, 4)}-${pick(digits, 2)}${pick(letters, 4)}-${pick(digits, 2)}${pick(letters, 2)}`;
}

// Multipart upload (e.g. a company logo). Same JSON-whatever-the-status
// contract as callAPI.
export async function uploadAPI(path, field, file) {
  const token = getToken();
  const form = new FormData();
  form.append(field, file);
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  try {
    return await res.json();
  } catch {
    return { success: false, error: `Upload failed (${res.status})` };
  }
}
