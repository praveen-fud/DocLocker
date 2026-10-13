// Cross-document identity check: compares the name, parents' names, date of
// birth and gender read from the student's passport / Aadhaar / PAN / 12th
// certificate (and what the student typed) so a mismatch is caught at upload
// time, not weeks later when a bank rejects the file.

const TITLES = new Set([
  "MR", "MRS", "MS", "MISS", "MASTER", "KUM", "KUMARI", "SMT", "SHRI", "SRI",
  "SHREE", "DR", "LATE", "SELVI", "THIRU", "TMT",
]);

export function nameTokens(name) {
  if (!name) return [];
  return String(name)
    .toUpperCase()
    .replace(/\b[SDWC]\s*\/\s*O\b/g, " ")
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t));
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function tokenRelation(a, b) {
  if (a === b) return "exact";
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) return "initial";
  const shorter = Math.min(a.length, b.length);
  if (shorter >= 4 && levenshtein(a, b) <= (shorter >= 8 ? 2 : 1)) return "fuzzy";
  return null;
}

// Returns { status: "match" | "partial" | "mismatch", note } or null when
// either side is empty. Word order is ignored (passports print the surname
// first), and joined spellings like "VENKATA RAMANA" / "VENKATARAMANA" match.
export function compareNames(a, b) {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (!A.length || !B.length) return null;
  if (A.join("") === B.join("") || [...A].sort().join("") === [...B].sort().join("")) {
    return { status: "match", note: null };
  }

  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  const usedLong = new Array(long.length).fill(false);
  const matchedShort = new Array(short.length).fill(null);

  for (const kind of ["exact", "fuzzy", "initial"]) {
    short.forEach((tok, i) => {
      if (matchedShort[i]) return;
      const j = long.findIndex((lt, idx) => !usedLong[idx] && tokenRelation(tok, lt) === kind);
      if (j !== -1) {
        usedLong[j] = true;
        matchedShort[i] = kind;
      }
    });
  }

  if (matchedShort.some((m) => !m)) return { status: "mismatch", note: null };
  if (long.length > short.length) {
    return { status: "partial", note: "One document has an extra name part (middle name or surname)" };
  }
  if (matchedShort.includes("initial")) return { status: "partial", note: "Initials used instead of the full name" };
  if (matchedShort.includes("fuzzy")) return { status: "partial", note: "Spelling differs slightly" };
  return { status: "match", note: null };
}

function normDate(v) {
  if (!v) return "";
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return s;
}

function normGender(v) {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return "";
  if (s === "M" || s === "MALE") return "M";
  if (s === "F" || s === "FEMALE") return "F";
  return "X";
}

function compareValues(kind, a, b) {
  if (kind === "name") return compareNames(a, b);
  const norm = kind === "date" ? normDate : normGender;
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return null;
  return x === y ? { status: "match", note: null } : { status: "mismatch", note: null };
}

const RANK = { none: 0, match: 1, partial: 2, mismatch: 3 };
const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);

const fullName = (first, last) => [first, last].filter(Boolean).join(" ").trim();

// Students who uploaded before our document model existed only have the old
// Drive-OCR parser's results (student.uploadedDocuments). Those still carry
// names and dates, so they're used — labelled, and ranked below anything the
// model read — rather than leaving older students with no check at all.
const BASIC = " (basic scan)";

function legacyDoc(legacyDocs, type, coIndex = null) {
  return legacyDocs.find((d) => {
    if (!d || d.type !== type || d.source === "reader") return false;
    const co = /Co_Applicant_(\d+)/i.exec(d.subFolder || "");
    return coIndex === null ? !co : Boolean(co) && Number(co[1]) === coIndex + 1;
  });
}

function legacySources(legacyDocs, extractions, prefix, coIndex) {
  const out = [];
  const f = (doc) => doc.fields || {};
  if (coIndex === null && !extractions[`${prefix}.passport`]) {
    const d = legacyDoc(legacyDocs, "passport");
    if (d) {
      out.push({
        label: `Passport${BASIC}`,
        name: f(d).Name || fullName(f(d)["Given Name"], f(d).Surname),
        dob: f(d)["Date of Birth"],
        gender: f(d).Gender,
      });
    }
  }
  if (!extractions[`${prefix}.aadhar`]) {
    const d = legacyDoc(legacyDocs, "aadhaar", coIndex);
    if (d) out.push({ label: `Aadhaar${BASIC}`, name: f(d).Name, dob: f(d)["Date of Birth"], gender: f(d).Gender });
  }
  if (!extractions[`${prefix}.pan`]) {
    const d = legacyDoc(legacyDocs, "pan", coIndex);
    if (d) out.push({ label: `PAN Card${BASIC}`, name: f(d).Name, fatherName: f(d)["Father's Name"], dob: f(d)["Date of Birth"] });
  }
  if (coIndex === null && !extractions["academics.marksheet_12"]) {
    const d = legacyDoc(legacyDocs, "12th");
    if (d) out.push({ label: `12th Certificate${BASIC}`, name: f(d).Name });
  }
  return out;
}

// What each document says about the person. Order = trust order: the first
// document that has a value becomes the reference everything else is
// compared against. Model-read documents come before basic scans.
function applicantSources(extractions, info, legacyDocs) {
  const sources = [];
  const pp = extractions["applicant.passport"]?.flat;
  if (pp) {
    sources.push({
      label: "Passport",
      name: fullName(pp.given_names, pp.surname),
      fatherName: pp.father_name,
      motherName: pp.mother_name,
      dob: pp.date_of_birth,
      gender: pp.sex,
    });
  }
  const ad = extractions["applicant.aadhar"]?.flat;
  if (ad) {
    const childOf = /^(S|D)\/O$/i.test(String(ad.relation || "").trim());
    sources.push({
      label: "Aadhaar",
      name: ad.name,
      fatherName: childOf ? ad.care_of : "",
      dob: ad.date_of_birth,
      gender: ad.gender,
    });
  }
  const pan = extractions["applicant.pan"]?.flat;
  if (pan) {
    sources.push({ label: "PAN Card", name: pan.name, fatherName: pan.father_name, dob: pan.date_of_birth });
  }
  const cert = extractions["academics.marksheet_12"];
  if (cert?.flat && cert.checks?.supported !== false) {
    sources.push({
      label: "12th Certificate",
      name: cert.flat.student_name,
      fatherName: cert.flat.father_name,
      motherName: cert.flat.mother_name,
    });
  }
  sources.push(...legacySources(legacyDocs, extractions, "applicant", null));
  if (sources.length) {
    sources.push({
      label: "Student's entry",
      name: fullName(info.firstName, info.lastName),
      fatherName: info.fatherName,
      motherName: info.motherName,
      dob: info.dob,
      gender: info.gender,
    });
  }
  return sources;
}

const ATTRIBUTES = [
  { key: "name", label: "Name", kind: "name" },
  { key: "fatherName", label: "Father's name", kind: "name" },
  { key: "motherName", label: "Mother's name", kind: "name" },
  { key: "dob", label: "Date of birth", kind: "date" },
  { key: "gender", label: "Gender", kind: "gender" },
];

function checkAttribute(attr, sources) {
  const withValue = sources.filter((s) => s[attr.key] && String(s[attr.key]).trim());
  if (withValue.length < 2) return null;
  const ref = withValue[0];
  let status = "match";
  const items = [{ source: ref.label, value: ref[attr.key], status: "reference", note: null }];
  for (const s of withValue.slice(1)) {
    const cmp = compareValues(attr.kind, ref[attr.key], s[attr.key]);
    if (!cmp) continue;
    status = worst(status, cmp.status);
    items.push({ source: s.label, value: s[attr.key], status: cmp.status, note: cmp.note });
  }
  if (items.length < 2) return null;
  return { key: attr.key, label: attr.label, status, items };
}

function issuesFor(checks, prefix = "") {
  const out = [];
  for (const c of checks) {
    if (c.status === "match") continue;
    const ref = c.items[0].source;
    for (const it of c.items.slice(1)) {
      if (it.status === "match") continue;
      const verb = it.status === "mismatch" ? "doesn't match" : "differs slightly from";
      out.push(`${prefix}${c.label} on ${it.source} ${verb} ${ref}`);
    }
  }
  return out;
}

export function buildIdentityReport({ extractions = {}, personalInfo = {}, coCount = 0, legacyDocs = [] } = {}) {
  const sources = applicantSources(extractions, personalInfo, legacyDocs || []);
  const applicant = ATTRIBUTES.map((a) => checkAttribute(a, sources)).filter(Boolean);

  // Reference values for the student's parents, used to sanity-check a
  // co-applicant who says they are the father or mother.
  const refOf = (key) => sources.find((s) => s.label !== "Student's entry" && s[key])?.[key] || personalInfo[key] || "";

  const coApplicants = [];
  for (let i = 0; i < coCount; i++) {
    const coInfo = personalInfo[`co_info_${i}`] || {};
    const coSources = [];
    const ad = extractions[`co_${i}.aadhar`]?.flat;
    const pan = extractions[`co_${i}.pan`]?.flat;
    if (ad) coSources.push({ label: "Aadhaar", name: ad.name, dob: ad.date_of_birth, gender: ad.gender });
    if (pan) coSources.push({ label: "PAN Card", name: pan.name, dob: pan.date_of_birth });
    coSources.push(...legacySources(legacyDocs || [], extractions, `co_${i}`, i));
    if (!coSources.length) continue;
    coSources.push({ label: "Entered name", name: fullName(coInfo.firstName, coInfo.lastName), dob: coInfo.dob });

    const checks = ATTRIBUTES.filter((a) => ["name", "dob", "gender"].includes(a.key))
      .map((a) => checkAttribute(a, coSources))
      .filter(Boolean);

    const parentKey = coInfo.relation === "Father" ? "fatherName" : coInfo.relation === "Mother" ? "motherName" : null;
    const coName = coSources.find((s) => s.name)?.name;
    const parentRef = parentKey ? refOf(parentKey) : "";
    if (parentKey && coName && parentRef) {
      const cmp = compareNames(parentRef, coName);
      if (cmp) {
        checks.push({
          key: "relation",
          label: `${coInfo.relation}'s name`,
          status: cmp.status,
          items: [
            { source: "Student's documents", value: parentRef, status: "reference", note: null },
            { source: "Co-applicant's ID", value: coName, status: cmp.status, note: cmp.note },
          ],
        });
      }
    }
    if (checks.length) coApplicants.push({ index: i, label: `Co-Applicant ${i + 1}`, checks });
  }

  let overall = "none";
  for (const c of applicant) overall = worst(overall, c.status);
  for (const co of coApplicants) for (const c of co.checks) overall = worst(overall, c.status);

  const issues = [
    ...issuesFor(applicant),
    ...coApplicants.flatMap((co) => issuesFor(co.checks, `${co.label}: `)),
  ];

  return { overall, applicant, coApplicants, issues, checkedAt: new Date().toISOString() };
}
