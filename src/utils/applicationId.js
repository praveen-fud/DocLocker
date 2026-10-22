// Application ID shown to students, staff, bankers and on the Application
// Form PDF, e.g. "DL-7K3M-9QX2".
//
// Students have no server-side id (Drive folders and Railway rows are keyed
// by name + email/phone), so the id is derived from the registered
// identifier: the same student gets the same id on every screen with no
// backend change. Once computed it is saved into the record as
// `applicationId` and the stored value always wins, so it never changes even
// if the student later edits their email or phone.

// Crockford base32: no I, L, O or U, so ids read back unambiguously.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function normalizeIdentifier(student) {
  const email = String(student?.email || "").trim().toLowerCase();
  if (email) return email;
  const digits = String(student?.phone || "").replace(/\D/g, "");
  return digits ? digits.slice(-10) : "";
}

// 40 bits from two independent FNV-1a passes — collisions stay negligible
// for any realistic number of students.
function hash40(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 0x9e37) >>> 0;
  }
  return BigInt(a) * 256n + BigInt(b & 0xff);
}

export function deriveApplicationId(student) {
  const key = normalizeIdentifier(student);
  if (!key) return "";
  let n = hash40(key);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[Number(n % 32n)] + out;
    n /= 32n;
  }
  return `DL-${out.slice(0, 4)}-${out.slice(4)}`;
}

export function getApplicationId(student) {
  return student?.applicationId || deriveApplicationId(student);
}
