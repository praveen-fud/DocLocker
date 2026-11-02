// How alike two consultancy names are. Mirrors Backend/src/services/
// consultancies.js, so the Consultancies page groups duplicates the same way
// the server checks a request.
export function nameKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const FILLER = new Set([
  "pvt", "private", "ltd", "limited", "llp", "inc", "the", "and", "co", "company", "group",
  "consultancy", "consultancies", "consultant", "consultants", "consulting", "services", "service",
  "overseas", "education", "educational", "edu", "abroad", "study", "studies", "international", "intl",
  "global", "solutions", "solution", "academy", "institute", "careers", "career", "immigration", "visa", "visas",
  "branch", "office",
]);
const CITY = {
  hyd: "hyderabad", hyderbad: "hyderabad", secbad: "secunderabad", blr: "bengaluru", bangalore: "bengaluru",
  bengaluru: "bengaluru", vizag: "visakhapatnam", vsp: "visakhapatnam", bza: "vijayawada", vja: "vijayawada",
  chennai: "chennai", madras: "chennai", bombay: "mumbai", mum: "mumbai", del: "delhi", ndls: "delhi", pune: "pune",
  kkd: "kakinada", wgl: "warangal", gnt: "guntur", tpt: "tirupati",
};
const coreTokens = (name) => nameKey(name).split(" ").filter(Boolean).map((t) => CITY[t] || t).filter((t) => !FILLER.has(t));

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a, b) {
  if (nameKey(a) === nameKey(b)) return 1;
  const ta = coreTokens(a);
  const tb = coreTokens(b);
  if (!ta.length || !tb.length) return 0;
  const A = new Set(ta);
  const B = new Set(tb);
  const shared = [...A].filter((t) => B.has(t)).length;
  const jaccard = shared / new Set([...A, ...B]).size;
  const ca = ta.join("");
  const cb = tb.join("");
  const edit = 1 - levenshtein(ca, cb) / Math.max(ca.length, cb.length);
  const contains = (ca.length >= 3 && cb.length >= 3 && (ca.includes(cb) || cb.includes(ca))) ? 0.82 : 0;
  return Math.round(Math.max(jaccard, edit, contains) * 100) / 100;
}

export const DUPLICATE = 0.85;
export const SIMILAR = 0.65;

// The listed consultancy a typed name already is (by name or old spelling)
export function listedFor(name, list) {
  const key = nameKey(name);
  if (!key) return null;
  return list.find((c) => nameKey(c.name) === key || (c.aliases || []).some((a) => nameKey(a) === key)) || null;
}
