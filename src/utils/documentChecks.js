// "Is this document real?" — the built-in checks our document model runs on
// each ID / certificate, turned into plain statements for staff.
//
// These are consistency checks: a passport's machine-readable code has
// check digits, an Aadhaar number has a checksum, a PAN's 5th letter is
// the surname's initial, a marks memo's subjects add up to its total.
// Edited or mistyped documents usually break them. They can't prove a
// document is genuine — only seeing the original can — so the wording
// never claims more than that.
//
// Each check: { ok: true | false | null, text }   (null = couldn't test)

const DOCS = [
  { key: "applicant.passport", label: "Passport", type: "passport" },
  { key: "applicant.aadhar", label: "Aadhaar", type: "aadhaar" },
  { key: "applicant.pan", label: "PAN Card", type: "pan" },
  { key: "academics.marksheet_10", label: "10th Certificate", type: "ssc" },
  { key: "academics.marksheet_12", label: "12th Certificate", type: "certificate" },
];

const DOC_NOUN = {
  passport: "a passport",
  aadhaar: "an Aadhaar card",
  pan: "a PAN card",
  ssc: "a 10th marks memo",
  certificate: "a 12th marks memo",
};

function uploadCheck(extraction, type) {
  const g = extraction.gate;
  if (!g) return null; // uploaded before the upload check existed
  if (g.status === "accepted") {
    // A reason on an accepted upload = another board's memo, recognised
    // from its text rather than read by our model.
    return g.reason
      ? { ok: null, text: "Accepted at upload as another board's marks memo, recognised from its text" }
      : { ok: true, text: `Recognised as ${DOC_NOUN[type]} when it was uploaded` };
  }
  if (g.status === "unverified") return { ok: null, text: "Couldn't be checked when it was uploaded" };
  return null;
}

function typeChecks(type, extraction) {
  const c = extraction.checks || {};
  const out = [];
  switch (type) {
    case "passport":
      if (c.mrzValid === true) {
        out.push({ ok: true, text: "Machine-readable code check digits are valid — passport number, birth date and expiry agree" });
      } else if (c.mrzValid === false) {
        out.push({ ok: false, text: "Machine-readable code check digits don't add up — an edited page or a poor scan" });
      } else {
        out.push({ ok: null, text: "Machine-readable code (bottom two lines) couldn't be read" });
      }
      break;
    case "aadhaar":
      if (c.number_times_read === 0) {
        out.push({ ok: null, text: "Aadhaar number couldn't be read" });
      } else if (c.number_check_digit === true) {
        out.push({ ok: true, text: "Aadhaar number passes the official checksum" });
      } else if (c.number_display === "masked" || c.number_check_digit === "masked on the document") {
        out.push({ ok: null, text: "Number is masked on the card, so its checksum can't be tested" });
      } else if (c.number_check_digit === false) {
        out.push({ ok: false, text: "Aadhaar number fails the official checksum — mistyped or edited" });
      }
      break;
    case "pan":
      if (c.holder_type) {
        out.push(c.holder_type === "individual"
          ? { ok: true, text: "PAN is issued to an individual" }
          : { ok: false, text: `PAN belongs to a ${c.holder_type}, not a person` });
      }
      if (typeof c.surname_letter_matches === "boolean") {
        out.push(c.surname_letter_matches
          ? { ok: true, text: "5th letter of the PAN matches the surname, as it should" }
          : { ok: false, text: "5th letter of the PAN doesn't match the surname" });
      }
      break;
    case "ssc":
      if (typeof c.cgpa_matches_grade_points === "boolean") {
        out.push(c.cgpa_matches_grade_points
          ? { ok: true, text: "CGPA matches the subject grade points" }
          : { ok: false, text: "CGPA doesn't match the subject grade points" });
      }
      if (typeof c.total_matches_subjects === "boolean") {
        out.push(c.total_matches_subjects
          ? { ok: true, text: "Total matches the subject marks" }
          : { ok: false, text: "Total doesn't match the subject marks" });
      }
      break;
    default:
      break;
  }
  if ((type === "ssc" || type === "certificate") && c.supported === false) {
    out.push({ ok: null, text: "Board not read by our model, so its figures weren't checked" });
  }
  return out;
}

function reviewCheck(extraction) {
  const status = extraction.review?.status;
  if (status === "auto") return { ok: true, text: "Every detail read cleanly" };
  if (status === "manual_required") {
    const n = (extraction.review?.fieldsRequiringReview || []).length;
    return { ok: null, text: `${n || "Some"} detail${n === 1 ? "" : "s"} couldn't be read reliably — check against the document` };
  }
  return null;
}

function docResult(label, type, extraction) {
  const checks = [uploadCheck(extraction, type), ...typeChecks(type, extraction), reviewCheck(extraction)].filter(Boolean);
  const status = checks.some((c) => c.ok === false) ? "fail" : checks.some((c) => c.ok === true) ? "pass" : "unknown";
  return { label, status, checks };
}

// → { documents: [{ label, status: pass|fail|unknown, checks }], failed, passed }
export function buildDocumentChecks({ extractions = {}, coCount = 0 }) {
  const documents = [];
  for (const d of DOCS) {
    if (extractions[d.key]) documents.push(docResult(d.label, d.type, extractions[d.key]));
  }
  for (let i = 0; i < coCount; i++) {
    for (const [field, label, type] of [["aadhar", "Aadhaar", "aadhaar"], ["pan", "PAN Card", "pan"]]) {
      const ex = extractions[`co_${i}.${field}`];
      if (ex) documents.push(docResult(`Co-Applicant ${i + 1} — ${label}`, type, ex));
    }
  }
  return {
    documents,
    failed: documents.filter((d) => d.status === "fail").length,
    passed: documents.filter((d) => d.status === "pass").length,
  };
}
