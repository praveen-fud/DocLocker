// Contact details for India. Each *Problem() returns a short message for the
// field, or null when the value is fine. Mirrored on the server
// (Backend/src/services/contactValidation.js) — keep the two in step.

// "+91 98765 43210", "09876543210", "919876543210" → "9876543210"
export function normalizeIndianMobile(input) {
  let digits = String(input || "").replace(/[\s\-().]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function indianMobileProblem(input) {
  const raw = String(input || "").trim();
  if (!raw) return "Enter your mobile number";
  if (/[^\d+\s\-().]/.test(raw)) return "Use digits only";
  const digits = normalizeIndianMobile(raw);
  if (!/^\d+$/.test(digits)) return "Use digits only";
  if (digits.length < 10) return `Mobile number must be 10 digits (${digits.length} entered)`;
  if (digits.length > 10) return "Mobile number must be exactly 10 digits";
  if (!/^[6-9]/.test(digits)) return "Indian mobile numbers start with 6, 7, 8 or 9";
  if (/^(\d)\1{9}$/.test(digits)) return "Enter a real mobile number";
  return null;
}

// Common slips in popular domains, offered as a fix rather than rejected.
const DOMAIN_FIXES = {
  "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmaill.com": "gmail.com",
  "yahoo.con": "yahoo.com", "yaho.com": "yahoo.com", "yahoo.co": "yahoo.com",
  "hotmail.con": "hotmail.com", "hotmial.com": "hotmail.com", "outlook.con": "outlook.com",
  "rediffmail.con": "rediffmail.com",
};

export function emailProblem(input) {
  const email = String(input || "").trim();
  if (!email) return "Enter your email address";
  if (/\s/.test(email)) return "Email can’t contain spaces";
  if (email.length > 254) return "Email is too long";
  const at = email.lastIndexOf("@");
  if (at < 1 || email.indexOf("@") !== at || at === email.length - 1) return "Enter a valid email, like name@example.com";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (local.length > 64) return "The part before @ is too long";
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return "The part before @ has characters email doesn’t allow";
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return "The part before @ can’t start or end with a dot, or have two in a row";
  const labels = domain.split(".");
  if (labels.length < 2) return "Add the domain ending, like .com or .in";
  if (labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return "The part after @ doesn’t look right";
  if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1])) return "The domain ending (like .com or .in) doesn’t look right";
  if (DOMAIN_FIXES[domain]) return `Did you mean ${local}@${DOMAIN_FIXES[domain]}?`;
  return null;
}

export const normalizeEmail = (input) => String(input || "").trim().toLowerCase();
