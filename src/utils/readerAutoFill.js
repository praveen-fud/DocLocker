// Maps our document model's output (passport / Aadhaar / PAN / 10th and
// 12th certificates) onto the student portal's form fields. Replaces the
// old regex-based autoFillMap.js for these document types; every other
// document still goes through the old parser.

export const READER_SOURCE_LABEL = {
  passport: "Passport",
  aadhaar: "Aadhaar",
  pan: "PAN Card",
  certificate: "12th Certificate",
  ssc: "10th Certificate",
};

// When two documents fill the same field, the more trustworthy one wins.
// Labels written by the old parser aren't listed, so they rank 0 and are
// replaced by any document this model reads.
const SOURCE_PRIORITY = { Passport: 4, Aadhaar: 3, "PAN Card": 2, "10th Certificate": 1, "12th Certificate": 1 };

const SMALL_WORDS = new Set(["S/O", "D/O", "W/O", "C/O"]);

export function titleCase(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => (SMALL_WORDS.has(w.toUpperCase()) ? w.toUpperCase() : w.replace(/(^|[-'])([a-z])/g, (m, p, c) => p + c.toUpperCase())))
    .join("");
}

// Without a passport there's no reliable surname marker, so the last word
// is taken as the last name and everything before it as the first name.
function splitName(full) {
  const parts = titleCase(full).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

// "SSC Public Examinations, March 2019" → "2019"
function examYear(exam) {
  const years = String(exam || "").match(/\b(19|20)\d{2}\b/g);
  return years ? years[years.length - 1] : "";
}

function gender(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "M" || s === "MALE") return "Male";
  if (s === "F" || s === "FEMALE") return "Female";
  if (s === "X" || s === "T" || s === "TRANSGENDER" || s === "OTHER") return "Other";
  return "";
}

// Returns { values: { formKey: value }, from: { formKey: readerFieldName } }.
// `from` lets the model's per-field review flags be shown on the right input.
export function applicantFieldsFromReader(docType, flat = {}, checks = {}) {
  const values = {};
  const from = {};
  const set = (key, value, readerField) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    values[key] = String(value).trim();
    from[key] = readerField;
  };

  if (docType === "passport") {
    set("firstName", titleCase(flat.given_names), "given_names");
    set("lastName", titleCase(flat.surname), "surname");
    set("dob", flat.date_of_birth, "date_of_birth");
    set("gender", gender(flat.sex), "sex");
    set("nationality", titleCase(flat.nationality), "nationality");
    set("passportNumber", flat.passport_number, "passport_number");
    set("passportIssueDate", flat.date_of_issue, "date_of_issue");
    set("passportExpiry", flat.date_of_expiry, "date_of_expiry");
    set("placeOfBirth", titleCase(flat.place_of_birth), "place_of_birth");
    set("fatherName", titleCase(flat.father_name), "father_name");
    set("motherName", titleCase(flat.mother_name), "mother_name");
    set("permanentAddress", flat.address, "address");
  } else if (docType === "aadhaar") {
    const n = splitName(flat.name);
    set("firstName", n.firstName, "name");
    set("lastName", n.lastName, "name");
    set("dob", flat.date_of_birth, "date_of_birth");
    set("gender", gender(flat.gender), "gender");
    set("aadhaarNumber", flat.aadhaar_number, "aadhaar_number");
    set("currentAddress", flat.address, "address");
    set("permanentAddress", flat.address, "address");
    if (/^(S|D)\/O$/i.test(String(flat.relation || "").trim())) set("fatherName", titleCase(flat.care_of), "care_of");
  } else if (docType === "pan") {
    const n = splitName(flat.name);
    set("firstName", n.firstName, "name");
    set("lastName", n.lastName, "name");
    set("fatherName", titleCase(flat.father_name), "father_name");
    set("dob", flat.date_of_birth, "date_of_birth");
    set("panNumber", flat.pan_number, "pan_number");
  } else if (docType === "certificate" && checks.supported !== false) {
    const n = splitName(flat.student_name);
    set("firstName", n.firstName, "student_name");
    set("lastName", n.lastName, "student_name");
    set("fatherName", titleCase(flat.father_name), "father_name");
    set("motherName", titleCase(flat.mother_name), "mother_name");
    if (flat.percentage != null) {
      set("pct12Type", "percentage", "percentage");
      set("pct12Score", flat.percentage, "percentage");
    }
    set("pct12Year", flat.year_of_pass, "year_of_pass");
  } else if (docType === "ssc" && checks.supported !== false) {
    const n = splitName(flat.student_name);
    set("firstName", n.firstName, "student_name");
    set("lastName", n.lastName, "student_name");
    set("fatherName", titleCase(flat.father_name), "father_name");
    set("motherName", titleCase(flat.mother_name), "mother_name");
    set("dob", flat.date_of_birth, "date_of_birth");
    // TS/AP SSC is graded on a 10-point CGPA from 2010; older and other
    // memos print marks.
    if (flat.result_type === "grades" && flat.cgpa != null) {
      set("pct10Type", "points", "cgpa");
      set("pct10Score", flat.cgpa, "cgpa");
    } else if (flat.percentage != null) {
      set("pct10Type", "percentage", "percentage");
      set("pct10Score", flat.percentage, "percentage");
    } else if (flat.total_marks != null) {
      set("pct10Type", "marks", "total_marks");
      set("pct10Score", flat.total_marks, "total_marks");
    }
    set("pct10Year", examYear(flat.exam), "exam");
  }
  return { values, from };
}

export function coApplicantFieldsFromReader(docType, flat = {}) {
  const values = {};
  const from = {};
  const set = (key, value, readerField) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    values[key] = String(value).trim();
    from[key] = readerField;
  };
  if (docType === "aadhaar") {
    const n = splitName(flat.name);
    set("firstName", n.firstName, "name");
    set("lastName", n.lastName, "name");
    set("dob", flat.date_of_birth, "date_of_birth");
    set("aadhaarNumber", flat.aadhaar_number, "aadhaar_number");
    set("currentAddress", flat.address, "address");
    set("permanentAddress", flat.address, "address");
  } else if (docType === "pan") {
    const n = splitName(flat.name);
    set("firstName", n.firstName, "name");
    set("lastName", n.lastName, "name");
    set("dob", flat.date_of_birth, "date_of_birth");
    set("panNumber", flat.pan_number, "pan_number");
  }
  return { values, from };
}

// Merges model-read values into existing form state.
// - Never overwrites something the student typed (typing clears the
//   field's auto-fill marker, so it no longer has a source).
// - Does replace a value auto-filled from a less trustworthy document.
// Returns the new { info, autoFilled, review } plus how many fields changed.
export function mergeReaderFields({ info, autoFilled, review, values, from, sourceLabel, flagged = [], reasons = {} }) {
  const nextInfo = { ...info };
  const nextAuto = { ...autoFilled };
  const nextReview = { ...review };
  const myRank = SOURCE_PRIORITY[sourceLabel] ?? 0;
  let changed = 0;

  for (const [key, value] of Object.entries(values)) {
    const current = info[key];
    const currentSource = autoFilled[key];
    const replaceable = !current || (currentSource && (SOURCE_PRIORITY[currentSource] ?? 0) < myRank);
    const sameSource = currentSource === sourceLabel;
    if (!replaceable && !sameSource) continue;

    if (current !== value) changed++;
    nextInfo[key] = value;
    nextAuto[key] = sourceLabel;
    const readerField = from[key];
    if (readerField && flagged.includes(readerField)) {
      nextReview[key] = reasons[readerField] || "The reader wasn't fully sure about this — please check it";
    } else {
      delete nextReview[key];
    }
  }
  return { info: nextInfo, autoFilled: nextAuto, review: nextReview, changed };
}

// Combine a re-read of a document with what an earlier read already found
// (e.g. the back page of an Aadhaar uploaded later): new non-empty values
// win, old values survive where the new read came back empty.
export function mergeExtractions(previous, next) {
  if (!previous) return next;
  const flat = { ...previous.flat };
  for (const [k, v] of Object.entries(next.flat || {})) {
    if (v !== "" && v !== null && v !== undefined) flat[k] = v;
  }
  return { ...next, flat };
}
