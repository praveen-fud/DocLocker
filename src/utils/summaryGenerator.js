// utils/summaryGenerator.js — the "Application Form" PDF (stored by the
// backend as Student_Summary.pdf).
//
// Renders a hero/readiness-ring/section/document-checklist layout with real
// CSS (summaryPdfTemplate.css — flexbox, grid, custom properties, gradients
// all fine here), captures it with html2canvas and slices the result into A4
// pages with jsPDF, entirely in the browser. The finished PDF blob is
// uploaded and the backend just stores it.
//
// The template is rendered inside its own off-screen iframe that contains
// ONLY the template stylesheet and the brand font. Rendering it inside the
// live app page let app styles leak in, made the result depend on which
// fonts the current page happened to load, and in production builds the
// template's CSS chunk could be missing altogether — which produced a fully
// unstyled, 6-page PDF.
import { companyHeaders, getStudentCompany, companyLogoSrc } from "./company";
import { applicantHeaders } from "./applicantApi";
import jsPDF from "jspdf";
import { DOCUMENT_SCHEMA, getTotalRequiredFields, countUploadedFields, coApplicantFields } from "../context/schemas";
import templateCss from "./summaryPdfTemplate.css?inline";
import { BRAND } from "../config/brand";
import { getApplicationId } from "./applicationId";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export const APPLICATION_FORM_TITLE = "Application Form";

let _pdfDebounceTimer = null;

export function generateAndUploadSummaryPDF(
  studentName,
  studentData,
  studentIdentifier = "",
  uploadedDocuments = [],
) {
  // Debounce: cancel any pending call and wait 3s after the last save
  // before sending. Prevents duplicate PDFs from rapid/double saves.
  if (_pdfDebounceTimer) clearTimeout(_pdfDebounceTimer);
  _pdfDebounceTimer = setTimeout(() => {
    _pdfDebounceTimer = null;
    _doGeneratePdf(studentName, studentData, studentIdentifier, uploadedDocuments);
  }, 3000);
}

async function _doGeneratePdf(studentName, studentData, studentIdentifier, uploadedDocuments) {
  // Each stage is tagged separately in its own console.error (with the full
  // error object, not just .message) — this whole pipeline runs unattended
  // after a debounced auto-save, so a bare "it failed" with no stack is
  // useless after the fact. Anyone can now open devtools and see exactly
  // which stage broke instead of just "the PDF never showed up".
  let model, rendered;
  try {
    model = buildModel(studentName, studentData);
  } catch (e) {
    console.error("[SummaryPDF] buildModel failed — bad/unexpected student data shape:", e);
    return;
  }
  Object.assign(model, await pdfBrand());
  try {
    rendered = await renderSummaryPdf(model);
  } catch (e) {
    console.error("[SummaryPDF] renderSummaryPdf failed — html2canvas/jsPDF error:", e);
    return;
  }
  try {
    const fd = new FormData();
    fd.append("studentName", studentName);
    fd.append("studentIdentifier", studentIdentifier);
    fd.append("documents", JSON.stringify(uploadedDocuments || []));
    fd.append("summaryPdf", rendered.blob, rendered.fname);

    const res = await fetch(`${API_URL}/api/student-summary`, { method: "POST", body: fd, headers: { ...companyHeaders(), ...applicantHeaders() } });
    if (!res.ok) {
      console.error(`[SummaryPDF] upload request failed — HTTP ${res.status} ${res.statusText}`);
      return;
    }
    const d = await res.json();
    if (d.success) console.log("[SummaryPDF] saved:", d.webViewLink);
    else console.error("[SummaryPDF] backend rejected it:", d.error);
  } catch (e) {
    console.error("[SummaryPDF] network/upload error — request may never have reached the backend:", e);
  }
}

// ── Formatting helpers ─────────────────────────────────────────────────────
// "2001-04-12" → "12 Apr 2001"; anything else is returned unchanged.
function fmtDate(v) {
  if (!v) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (!m) return v;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Aadhaar is only ever printed as its last four digits.
function maskAadhaar(v) {
  const digits = String(v || "").replace(/\D/g, "");
  return digits.length >= 4 ? `XXXX XXXX ${digits.slice(-4)}` : "";
}

const rupees = (v) => (v ? "₹" + Number(v).toLocaleString("en-IN") : "");

// The checklist already shows an "Optional" tag, so drop the label's own
// "(optional — auto-fills …)" note; "(if any)" / "(if applicable)" stay.
const checklistLabel = (label) => label.replace(/\s*\(optional[^)]*\)/i, "");

// ── Build the render model from DocLocker's actual student data shape ──────
function buildModel(studentName, studentData) {
  const p = studentData.personalInfo || {};
  const uploads = studentData.uploads || {};
  const coCount = studentData.coApplicants || 0;

  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.fullName || studentName;
  const scoreUnit = (type) => (type === "marks" ? " Marks" : type === "points" ? " Points" : "%");
  const coName = (c) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "";
  const refAddress = (n) => {
    const parts = [p[`ref${n}_house_number`], p[`ref${n}_street_name`], p[`ref${n}_city`], p[`ref${n}_state`], p[`ref${n}_pincode`]].filter(Boolean);
    return parts.length ? parts.join(", ") : p[`ref${n}_address`];
  };

  const student = {
    fullName,
    applicationId: getApplicationId(studentData),
    email: studentData.email || p.email,
    phone: studentData.phone || p.phone,
    maritalStatus: p.marital === "Yes" ? "Married" : p.marital === "No" ? "Unmarried" : p.marital,
    loanTrack: p.loanTrack,
    loanAmountText: rupees(p.loanAmount),
    cibilText: p.studentCibil || "",
    dob: fmtDate(p.dob),
    gender: p.gender,
    nationality: p.nationality,
    placeOfBirth: p.placeOfBirth,
    passportNumber: p.passportNumber,
    passportIssue: fmtDate(p.passportIssueDate),
    passportExpiry: fmtDate(p.passportExpiry),
    panNumber: p.panNumber,
    aadhaarMasked: maskAadhaar(p.aadhaarNumber),
    currentAddress: p.currentAddress,
    permanentAddress: p.permanentAddress,
    destinationText: p.destinationCountry || "",
    coCountText: coCount > 0 ? String(coCount) : "None",
  };

  const academic = {
    highestQualification: p.qualName,
    passedYear: p.qualYear || p.qualPassedYear,
    tenthScore: p.pct10Score ? `${p.pct10Score}${scoreUnit(p.pct10Type)}` : p.pct10,
    tenthYear: p.pct10Year,
    twelfthScore: p.pct12Score ? `${p.pct12Score}${scoreUnit(p.pct12Type)}` : p.pct12,
    twelfthYear: p.pct12Year,
    gradScore: p.pctGradScore ? `${p.pctGradScore} ${p.pctGradType === "cgpa" ? "CGPA" : "%"}` : p.pctGrad,
    gradYear: p.pctGradYear,
    backlogs: p.hasBacklogs,
    backlogsCount: p.hasBacklogs === "Yes" ? (p.backlogCount || "?") : "",
    institution: p.qualInstitution,
    testScores: [
      p.greScore && `GRE ${p.greScore}`,
      p.ieltsScore && `IELTS ${p.ieltsScore}`,
      p.toeflScore && `TOEFL ${p.toeflScore}`,
      p.gmatScore && `GMAT ${p.gmatScore}`,
      p.pteScore && `PTE ${p.pteScore}`,
      p.duolingoScore && `Duolingo ${p.duolingoScore}`,
    ].filter(Boolean).join(" · "),
  };

  // Addresses are printed once, under Personal Information.
  const destination = {
    track: p.loanTrack,
    country: p.destinationCountry,
    i20Received: p.i20Received,
    visaSlotBooked: p.visaBooked,
    visaSlotDate: fmtDate(p.visaSlotDate),
    university: p.targetUniversity,
    course: p.courseNameUniversity,
  };

  const family = {
    father: { name: p.fatherName, contact: p.fatherContact, cibil: p.fatherCibil },
    mother: { name: p.motherName, contact: p.motherContact, cibil: p.motherCibil },
    guarantor: p.guarantorName ? {
      name: p.guarantorName, relation: p.guarantorRelation, mobile: p.guarantorMobile,
      cibil: p.guarantorCibil, sector: p.guarantorSector, docsAvailable: p.guarantorDocsAvailable,
    } : null,
    maternalGrandma: p.maternalGrandma,
    paternalGrandma: p.paternalGrandma,
  };

  const history = {
    appliedBefore: p.priorBankApplied,
    bankAppliedTo: p.priorBankApplied === "Yes"
      ? (p.priorBankName === "Others" ? p.priorBankNameCustom : p.priorBankName)
      : "",
    ownsHouse: p.ownHouseStatus,
    employed: p.hasJobDetails,
    jobDetails: p.hasJobDetails === "Yes" ? p.jobSpecs : "",
    consultant: p.consultantNameLoc,
    consultantContact: p.consultantContact,
  };

  const references = [];
  for (const n of [1, 2]) {
    if (p[`ref${n}_name`] || p[`ref${n}_mobile`]) {
      references.push({
        name: p[`ref${n}_name`],
        mobile: p[`ref${n}_mobile`],
        occupation: p[`ref${n}_occupation`],
        relation: p[`ref${n}_relation`] === "Other" ? p[`ref${n}_custom_relation`] : p[`ref${n}_relation`],
        address: refAddress(n),
      });
    }
  }

  const coApplicants = [];
  for (let i = 0; i < coCount; i++) {
    const c = p[`co_info_${i}`] || {};
    const isFinancial = c.financialStatus !== "non-financial";
    coApplicants.push({
      index: i + 1,
      name: coName(c),
      profile: isFinancial
        ? (c.empType === "salaried" || !c.empType ? "Salaried" : c.empType === "selfEmployed" ? "Self-Employed" : "Financial")
        : "Non-Financial",
      relation: c.relation,
      mobile: c.mobile,
      email: c.email,
      dob: fmtDate(c.dob),
      panNumber: c.panNumber,
      aadhaarMasked: maskAadhaar(c.aadhaarNumber),
      occupation: c.occupation,
      isFinancial,
      annualIncome: rupees(c.annualIncome),
      qualifications: c.qualifications,
      cibil: c.cibil,
      dependants: c.dependants,
      yearsAddress: c.yearsAddress,
      currentAddress: c.currentAddress,
      permanentAddress: c.permanentAddress,
      officeAddress: c.officeAddress,
    });
  }

  // ── Document checklist, built against the real schema + real uploads ────
  // countUploadedFields is the portal's own per-document rule (a multi-page
  // slot counts once, whichever of its "<id>", "<id>_N" keys hold files).
  const groupFromSchema = (label, color, fields, uploadsKey, kind) => {
    const up = uploads[uploadsKey] || {};
    return {
      group: label,
      color,
      kind,
      items: fields.map((f) => ({ name: checklistLabel(f.label), required: !f.optional, uploaded: countUploadedFields(up, [f]) > 0 })),
    };
  };

  const documents = [
    groupFromSchema("Government ID & Personal", "#2E86DE", DOCUMENT_SCHEMA.applicant.fields, "applicant", "student"),
    groupFromSchema("Academic Certificates", "#6C5CE7", DOCUMENT_SCHEMA.academics.fields, "academics", "student"),
  ];
  for (let i = 0; i < coCount; i++) {
    const c = p[`co_info_${i}`] || {};
    const label = `Co-Applicant ${i + 1} Documents${coName(c) ? ` — ${coName(c)}` : ""}`;
    // Uploads live under co_<i>; co_info_<i> only holds their details.
    documents.push(groupFromSchema(label, "#F76707", coApplicantFields(c), `co_${i}`, "co"));
  }
  const otherDocs = Object.entries(uploads.otherDocs || {}).filter(([, v]) => v);
  if (otherDocs.length) {
    documents.push({
      group: "Other Documents",
      color: "#64748B",
      kind: "other",
      items: otherDocs.map(([, v]) => ({
        name: String(v.customName || "").trim() || v.name || "Additional document",
        required: false,
        uploaded: true,
      })),
    });
  }

  // ── Readiness — required-field/document completion, by area ─────────────
  const reqStats = (kind) => {
    const items = documents.filter((g) => g.kind === kind).flatMap((g) => g.items.filter((i) => i.required));
    return { done: items.filter((i) => i.uploaded).length, total: items.length };
  };
  const studentDocs = reqStats("student");
  const coDocs = reqStats("co");
  // Same denominator as the portal's progress, so the two always agree.
  const totalRequired = getTotalRequiredFields(coCount, p);
  const docsDone = studentDocs.done + coDocs.done;

  const profileFields = [p.firstName || p.fullName, p.email || studentData.email, p.phone || studentData.phone, p.loanTrack, p.loanAmount, p.qualName, p.targetUniversity, p.destinationCountry];
  const profileDone = profileFields.filter(Boolean).length;
  const pct = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);

  const segments = [
    { label: "Profile Details", pct: pct(profileDone, profileFields.length), color: "#2E86DE" },
    { label: "Student Documents", pct: pct(studentDocs.done, studentDocs.total), color: "#17855E" },
  ];
  if (coCount > 0) segments.push({ label: "Co-Applicant Documents", pct: pct(coDocs.done, coDocs.total), color: "#F76707" });
  // Weighted by item count, so two profile fields can't outweigh twenty documents.
  const overallPct = pct(profileDone + docsDone, profileFields.length + totalRequired);

  const outstanding = documents
    .map((g) => {
      const missing = g.items.filter((i) => i.required && !i.uploaded).map((i) => i.name);
      return missing.length ? { section: g.group, items: missing, color: g.color } : null;
    })
    .filter(Boolean);

  const flags = outstanding.slice(0, 3).map((o) => `${o.section}: ${o.items.length} required document${o.items.length === 1 ? "" : "s"} pending`);
  const hiddenFlagCount = outstanding.slice(3).reduce((a, o) => a + o.items.length, 0);

  return {
    companyName: BRAND.name,
    logo: BRAND.logo,
    generatedOn: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    student, academic, destination, family, history, references, coApplicants, documents,
    readiness: { percent: overallPct, segments },
    flags, hiddenFlagCount, outstanding,
  };
}

// A partner company's students get that company's name and logo on the
// form, never DocLocker's. The logo is inlined as a data URL first: the
// render frame can't read a cross-origin image back out of its canvas.
async function pdfBrand() {
  const co = getStudentCompany();
  if (!co?.slug) return {};
  let logo = "";
  if (co.logoUrl) {
    try {
      const res = await fetch(companyLogoSrc(co.logoUrl));
      if (res.ok) {
        const blob = await res.blob();
        logo = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.warn("[SummaryPDF] company logo unavailable, printing the name only:", e);
    }
  }
  return { companyName: co.branding?.displayName || co.name || "", logo, companyLogo: true };
}

// ── Render helpers ──────────────────────────────────────────────────────────
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
// html2canvas doesn't understand color-mix() — precompute the lightened
// shade as a plain rgb() instead.
function lighten(hex, pct) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const mix = (ch) => Math.round(ch * (pct / 100) + 255 * (1 - pct / 100));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
function row(k, v, long = false) {
  if (!v) return "";
  return `<div class="row"><span class="k">${esc(k)}</span><span class="v${long ? " long" : ""}">${esc(v)}</span></div>`;
}
// A grid of rows, or "" when none of them has a value.
function grid(rows, cls = "grid") {
  const html = rows.join("");
  return html.trim() ? `<div class="${cls}">${html}</div>` : "";
}

const CANVAS_FONT = '"Plus Jakarta Sans", Arial, sans-serif';

// The numbered section badge is a pre-rendered canvas bitmap, not centered
// CSS text — see summaryPdfTemplate.css's .sec-num note for why: whichever
// font is actually active at html2canvas's capture instant can shift text
// layout, but never a bitmap's own already-baked pixels.
function renderSectionBadgeImage(num, color) {
  const SIZE = 140;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const r = SIZE * 0.26;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(SIZE, 0, SIZE, SIZE, r);
  ctx.arcTo(SIZE, SIZE, 0, SIZE, r);
  ctx.arcTo(0, SIZE, 0, 0, r);
  ctx.arcTo(0, 0, SIZE, 0, r);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(SIZE * 0.56)}px ${CANVAS_FONT}`;
  ctx.fillText(String(num), SIZE / 2, SIZE / 2 + SIZE * 0.02);

  return canvas.toDataURL("image/png");
}
function secHead(num, title, color) {
  const badgeImg = renderSectionBadgeImage(num, color);
  return `<div class="sec-head" style="--c:${color}"><img class="sec-num" src="${badgeImg}" alt="${num}"/><span class="sec-title">${esc(title)}</span></div>`;
}
function emptyState(title, note) {
  return `<div class="empty-state"><b>${esc(title)}</b><p>${esc(note)}</p></div>`;
}
function section(num, title, color, body, emptyNote) {
  const content = body.trim() ? body : emptyState("Not provided yet", emptyNote);
  return `<div class="section">${secHead(num, title, color)}${content}</div>`;
}

// Same reasoning as the section badge: a CSS ring (SVG stroke-dasharray or
// a conic-gradient) asks html2canvas to interpret CSS it renders least
// reliably (conic-gradient isn't supported at all in html2canvas 1.4.x — it
// paints nothing). Drawing the ring, arc, percentage and label directly with
// the plain <canvas> 2D API and dropping the result in as a plain <img>
// sidesteps that entirely — html2canvas only has to copy pixels through.
function renderReadinessRingImage(percent, color) {
  const SIZE = 320;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE / 2 - 34;
  const lineWidth = 30;

  ctx.lineCap = "round";
  ctx.lineWidth = lineWidth;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#E7EDF7";
  ctx.stroke();

  if (percent > 0) {
    const start = -Math.PI / 2;
    const end = start + (Math.PI * 2 * percent) / 100;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0A2E68";
  ctx.font = `700 68px ${CANVAS_FONT}`;
  ctx.fillText(`${percent}%`, cx, cy - 16);
  ctx.fillStyle = "#8A93A6";
  ctx.font = `600 24px ${CANVAS_FONT}`;
  ctx.fillText("READY", cx, cy + 38);

  return canvas.toDataURL("image/png");
}

function renderReadiness(readiness) {
  const pct = Math.max(0, Math.min(100, readiness.percent));
  const ringImg = renderReadinessRingImage(pct, readiness.segments[0]?.color || "#2E86DE");
  const segHtml = readiness.segments.map((s) => `
    <div class="rd-seg">
      <div class="rd-track"><div class="rd-fill" style="width:${s.pct}%;--c:${s.color}"></div></div>
      <div class="l">${esc(s.label)} ${s.pct}%</div>
    </div>`).join("");
  return `
    <div class="readiness">
      <div class="ring"><img src="${ringImg}" alt="${pct}% ready"/></div>
      <div class="rd-body">
        <div class="rd-title">Application Readiness</div>
        <div class="rd-sub">Share of required profile details and documents completed so far, by area.</div>
        <div class="rd-bar">${segHtml}</div>
      </div>
    </div>`;
}

function renderFlags(flags, hiddenFlagCount) {
  if (!flags.length) return "";
  const hiddenLine = hiddenFlagCount > 0
    ? `<li class="muted">+ ${hiddenFlagCount} more document${hiddenFlagCount === 1 ? "" : "s"} — see Outstanding Items later in this form.</li>`
    : "";
  return `
    <div class="flags">
      <h3>Needs Attention</h3>
      <ul>${flags.map((f) => `<li><b>${esc(f)}</b></li>`).join("")}${hiddenLine}</ul>
    </div>`;
}

function renderHero(model) {
  const s = model.student;
  return `
    <div class="hero">
      <div class="hero-top">
        <div class="logo-card">${model.logo ? `<img class="logo-icon${model.companyLogo ? " logo-icon--company" : ""}" src="${model.logo}" alt="" />` : ""}<span class="logo-fallback">${esc(model.companyName)}</span></div>
        ${s.loanTrack ? `
        <div class="track-badge">
          <div class="l">Loan Track For</div>
          <div class="v">${esc(s.loanTrack)}</div>
        </div>` : ""}
      </div>
      <div class="hero-name">
        <div>
          <div class="doc-eyebrow">Education Loan ${esc(APPLICATION_FORM_TITLE)}</div>
          <h1>${esc(s.fullName)}</h1>
        </div>
        ${s.applicationId ? `
        <div class="refcard">
          <div class="l">Application ID</div>
          <div class="v">${esc(s.applicationId)}</div>
        </div>` : ""}
      </div>
      <div class="stats">
        <div class="stat" style="--c:${model.readiness.segments[0]?.color || "#2E86DE"}"><div class="n">${esc(s.loanAmountText || "—")}</div><div class="k">Loan Amount</div></div>
        <div class="stat" style="--c:#0EA5A5"><div class="n">${esc(s.destinationText || "—")}</div><div class="k">Destination</div></div>
        <div class="stat" style="--c:#9F1B32"><div class="n">${esc(s.cibilText || "—")}</div><div class="k">Student CIBIL</div></div>
        <div class="stat" style="--c:#F76707"><div class="n">${esc(s.coCountText)}</div><div class="k">Co-Applicants</div></div>
      </div>
    </div>`;
}

function renderPersonalSection(num, s) {
  const body = [
    grid([
      row("Full Name", s.fullName),
      row("Date of Birth", s.dob),
      row("Gender", s.gender),
      row("Nationality", s.nationality),
      row("Place of Birth", s.placeOfBirth),
      row("Marital Status", s.maritalStatus),
      row("Email", s.email),
      row("Phone / WhatsApp", s.phone),
      row("Loan Amount", s.loanAmountText),
      row("Student CIBIL", s.cibilText),
    ]),
    grid([
      row("Passport No.", s.passportNumber),
      row("Passport Issued", s.passportIssue),
      row("Passport Expiry", s.passportExpiry),
      row("PAN", s.panNumber),
      row("Aadhaar", s.aadhaarMasked),
    ]),
    grid([
      row("Current Address", s.currentAddress, true),
      row("Permanent Address", s.permanentAddress, true),
    ], "grid one"),
  ].join("");
  return section(num, "Student Personal Information", "#2E86DE", body, "The student hasn't filled in their personal details yet.");
}

function renderAcademicSection(num, a) {
  const body = [
    grid([
      row("Highest Qual.", a.highestQualification),
      row("Passed Year", a.passedYear),
      row("10th Score", a.tenthScore),
      row("10th Year", a.tenthYear),
      row("12th Score", a.twelfthScore),
      row("12th Year", a.twelfthYear),
      row("Grad Score", a.gradScore),
      row("Grad Year", a.gradYear),
      row("Backlogs", a.backlogs),
      row("Number of Backlogs", a.backlogsCount),
    ]),
    grid([
      row("Institution", a.institution, true),
      row("Test Scores", a.testScores, true),
    ], "grid one"),
  ].join("");
  return section(num, "Academic Qualifications", "#6C5CE7", body, "No academic details have been added yet.");
}

function renderDestinationSection(num, d) {
  const body = [
    grid([
      row("Loan Track", d.track),
      row("Country", d.country),
      row("I-20 Received", d.i20Received),
      row("Visa Slot Booked", d.visaSlotBooked),
      row("Visa Slot Date", d.visaSlotDate),
    ]),
    grid([
      row("Target University", d.university, true),
      row("Course & University", d.course, true),
    ], "grid one"),
  ].join("");
  return section(num, "Destination & Application Context", "#0EA5A5", body, "The destination, university and course haven't been added yet.");
}

function familyCard(title, rows) {
  const content = grid(rows, "grid one") || emptyState("Not provided yet", `No ${title.toLowerCase()} details have been added.`);
  return `
    <div class="sub">
      <div class="sub-head" style="--c:#9F1B32"><span>${esc(title)}</span></div>
      ${content}
    </div>`;
}

function renderFamilySection(num, f) {
  const parents = [
    familyCard("Father", [row("Name", f.father.name), row("Contact", f.father.contact), row("CIBIL Score", f.father.cibil)]),
    familyCard("Mother", [row("Name", f.mother.name), row("Contact", f.mother.contact), row("CIBIL Score", f.mother.cibil)]),
  ];
  const guarantorHtml = f.guarantor ? `
    <div class="sub">
      <div class="sub-head" style="--c:#9F1B32"><span>Financial Guarantor</span></div>
      ${grid([
        row("Name", f.guarantor.name),
        row("Relation", f.guarantor.relation),
        row("Mobile", f.guarantor.mobile),
        row("CIBIL", f.guarantor.cibil),
        row("Sector", f.guarantor.sector),
        row("Income Docs Available", f.guarantor.docsAvailable),
      ])}
    </div>` : "";
  const grandmas = grid([row("Maternal Grandmother", f.maternalGrandma), row("Paternal Grandmother", f.paternalGrandma)]);
  return `
    <div class="section">
      ${secHead(num, "Family & Financial Background", "#9F1B32")}
      <div class="subs">${parents.join("")}</div>
      ${guarantorHtml}
      ${grandmas}
    </div>`;
}

function renderHistorySection(num, h) {
  const body = grid([
    row("Prior Bank Applied", h.appliedBefore),
    row("Bank Name", h.bankAppliedTo),
    row("Own House", h.ownsHouse),
    row("Has Job", h.employed),
    row("Job Details", h.jobDetails),
    row("Consultant Name / Location", h.consultant),
    row("Consultant Contact", h.consultantContact),
  ]);
  return section(num, "Employment & Prior History", "#E08A00", body, "No employment, prior-loan or consultant details have been added.");
}

function renderReferencesSection(num, references) {
  if (!references.length) {
    return `<div class="section">${secHead(num, "Personal References", "#7CB518")}${emptyState("No references provided", "The student hasn't added any personal references yet.")}</div>`;
  }
  const subs = references.map((r, i) => `
    <div class="sub">
      <div class="sub-head" style="--c:#7CB518"><span>Reference ${i + 1}</span></div>
      ${grid([
        row("Name", r.name),
        row("Mobile", r.mobile),
        row("Occupation", r.occupation),
        row("Relation", r.relation),
        row("Address", r.address, true),
      ], "grid one")}
    </div>`).join("");
  return `<div class="section">${secHead(num, "Personal References", "#7CB518")}<div class="subs">${subs}</div></div>`;
}

function renderCoApplicantsSection(num, coApplicants) {
  if (!coApplicants.length) return "";
  // One full-width card each: their row counts differ a lot, so side-by-side
  // cards left big empty boxes.
  const groups = coApplicants.map((co) => `
    <div class="sub">
      <div class="sub-head" style="--c:#F76707">
        <span>Co-Applicant ${co.index}${co.name ? ` — ${esc(co.name)}` : ""}</span>
        <em>${esc(co.profile)}</em>
      </div>
      ${grid([
        row("Relation", co.relation),
        row("Mobile", co.mobile),
        row("Email", co.email),
        row("Date of Birth", co.dob),
        row("PAN", co.panNumber),
        row("Aadhaar", co.aadhaarMasked),
        row("Occupation", co.occupation),
        co.isFinancial ? row("Annual Income", co.annualIncome) : "",
        row("Qualifications", co.qualifications),
        row("CIBIL Score", co.cibil),
        row("Dependants", co.dependants),
        row("Years at Address", co.yearsAddress),
      ]) || emptyState("Not provided yet", "This co-applicant's details haven't been added.")}
      ${grid([
        row("Current Address", co.currentAddress, true),
        row("Permanent Address", co.permanentAddress, true),
        row("Office Address", co.officeAddress, true),
      ], "grid one")}
    </div>`).join("");
  return `<div class="section">${secHead(num, `Co-Applicants (${coApplicants.length})`, "#F76707")}<div class="subs one">${groups}</div></div>`;
}

function renderDocumentsSection(num, documents) {
  const groupsHtml = documents.map((g) => {
    const req = g.items.filter((i) => i.required);
    const reqDone = req.filter((i) => i.uploaded).length;
    const optDone = g.items.filter((i) => !i.required && i.uploaded).length;
    // Header counts required documents, like the portal; optional extras are noted.
    const countText = req.length
      ? `${reqDone}/${req.length} required${optDone ? ` · +${optDone} optional` : ""}`
      : `${optDone} received`;
    const pct = req.length ? Math.round((reqDone / req.length) * 100) : 100;
    const itemsHtml = g.items.map((i) => {
      const tag = i.uploaded
        ? `<span class="tag rec">Received</span>`
        : i.required
          ? `<span class="tag awa">Awaiting</span>`
          : `<span class="tag opt">Optional</span>`;
      return `
        <li class="${i.uploaded ? "" : !i.required ? "is-opt" : ""}">
          <span class="box${i.uploaded ? " done" : ""}"></span>
          <span class="nm">${esc(i.name)}</span>
          ${tag}
        </li>`;
    }).join("");
    return `
      <div class="dgroup">
        <div class="dgroup-head" style="--c:${g.color};--c-light:${lighten(g.color, 60)}">
          <span class="t">${esc(g.group)}</span>
          <span class="c">${countText}</span>
          <div class="dmeter"><i style="width:${pct}%"></i></div>
        </div>
        <ul class="dlist">${itemsHtml}</ul>
      </div>`;
  }).join("");
  return `<div class="section">${secHead(num, "Document Checklist", "#17855E")}${groupsHtml}</div>`;
}

function renderOutstanding(outstanding) {
  if (!outstanding.length) return "";
  const rows = outstanding.map((o, i) => `
    <div class="out-row">
      <span class="out-n" style="--c:${o.color}">${i + 1}</span>
      <span class="out-sec">${esc(o.section)}</span>
      <span class="out-items">${o.items.map(esc).join(", ")}</span>
    </div>`).join("");
  return `
    <div class="outstanding">
      <div class="out-head">
        <span class="t">Outstanding Items</span>
        <span class="c">${outstanding.reduce((a, o) => a + o.items.length, 0)}</span>
      </div>
      ${rows}
    </div>`;
}

function renderSignOff(model) {
  return `
    <div class="signoff">
      <div class="declaration">
        I, <b>${esc(model.student.fullName)}</b>, declare that the information provided in this application
        is true and accurate to the best of my knowledge, and I authorize ${esc(model.companyName)} and its
        partner lenders to verify these details and the accompanying documents for the purpose of
        processing this education loan application.
      </div>
      <div class="sign-grid">
        <div class="sign-line"><span>Applicant Signature</span></div>
        <div class="sign-line"><span>Date</span></div>
      </div>
      <div class="office">
        <div class="t">For Office Use Only</div>
        <div class="office-grid">
          <div class="sign-line"><span>Verified By</span></div>
          <div class="sign-line"><span>Lender Assigned</span></div>
          <div class="sign-line"><span>Status</span></div>
          <div class="sign-line"><span>Date</span></div>
        </div>
      </div>
    </div>`;
}

function renderHtml(model) {
  // Sections are numbered as they're emitted, so an omitted section never
  // leaves a gap in the numbering.
  let n = 0;
  const next = () => ++n;
  return `
    <div class="sheet pdf-render">
      ${renderHero(model)}
      ${renderReadiness(model.readiness)}
      ${renderFlags(model.flags, model.hiddenFlagCount)}
      ${renderPersonalSection(next(), model.student)}
      ${renderAcademicSection(next(), model.academic)}
      ${renderDestinationSection(next(), model.destination)}
      ${renderFamilySection(next(), model.family)}
      ${renderHistorySection(next(), model.history)}
      ${renderReferencesSection(next(), model.references)}
      ${model.coApplicants.length ? renderCoApplicantsSection(next(), model.coApplicants) : ""}
      ${renderOutstanding(model.outstanding)}
      ${renderDocumentsSection(next(), model.documents)}
      ${renderSignOff(model)}
    </div>`;
}

// ── Running header/footer — drawn as real vector text with jsPDF on every
// page produced by the html2canvas render below. jsPDF's built-in Helvetica
// only covers WinAnsi, so anything else (accents, Indic scripts, ₹) is
// stripped rather than printed as garbage.
function pdfSafe(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u00B7]/g, "")
    .trim();
}

function drawRunningHeader(doc, model) {
  const PW = doc.internal.pageSize.getWidth();
  const M = 14, RH = 16;
  doc.setFillColor(247, 249, 252);
  doc.rect(0, 0, PW, RH, "F");
  doc.setFillColor(46, 134, 222);
  doc.rect(0, RH - 0.9, PW / 2, 0.9, "F");
  doc.setFillColor(23, 133, 94);
  doc.rect(PW / 2, RH - 0.9, PW / 2, 0.9, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(10, 46, 104);
  doc.text(pdfSafe(model.companyName).toUpperCase(), M, 8.3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.6);
  doc.setTextColor(140, 145, 158);
  doc.text(APPLICATION_FORM_TITLE.toUpperCase(), M, 11.6);

  const name = pdfSafe(model.student.fullName) || pdfSafe(model.student.email) || "Applicant";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(30, 38, 58);
  doc.text(name, PW / 2, model.student.applicationId ? 8 : 9.6, { align: "center" });
  if (model.student.applicationId) {
    doc.setFontSize(5.8);
    doc.setTextColor(130, 136, 148);
    doc.text(`Application ID: ${model.student.applicationId}`, PW / 2, 11.6, { align: "center" });
  }

  doc.setFontSize(6.3);
  doc.setTextColor(130, 136, 148);
  doc.text(`Generated: ${pdfSafe(model.generatedOn)}`, PW - M, 9.6, { align: "right" });
}
function drawRunningFooter(doc, pageNum, totalPages) {
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 14, RF = 11;
  doc.setFillColor(7, 31, 71);
  doc.rect(0, PH - RF, PW, RF, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(`Education Loan ${APPLICATION_FORM_TITLE} — Confidential`, M, PH - RF + 6.5);
  doc.text(`Page ${pageNum} of ${totalPages}`, PW - M, PH - RF + 6.5, { align: "right" });
}

// ── Boundary-aware pagination ──────────────────────────────────────────────
// A page break must never land mid-row. "Atomic" ranges (a row, stat, list
// item, card) are never split; every header is kept with the first unit
// after it; "soft" ranges (a card, document group, sign-off) are kept whole
// when that doesn't waste too much of the page. Cuts are whole canvas pixels
// placed in the white gap above the next element, so no sliver of it can
// bleed onto the previous page.
const ATOMIC_SELECTOR = [
  ".stat", ".readiness", ".flags", ".row", ".out-row", ".out-head", ".dlist li",
  ".sign-grid", ".declaration", ".office", ".track-badge", ".empty-state",
].join(", ");
const HEADER_SELECTOR = ".sec-head, .sub-head, .dgroup-head";
const SOFT_UNBREAK_SELECTOR = ".sub, .dgroup, .signoff";
const MAX_WASTE = 0.3;        // share of a page we accept leaving blank to keep a soft range whole
const MIN_SLICE = 0.15;       // a page is never shorter than this share (no slivers)

// The first unbreakable thing after a header: a row, list item, or the
// next header (whose own first unit is then followed in turn).
function firstUnit(el) {
  let cur = el;
  for (let i = 0; cur && i < 6; i++) {
    if (cur.matches(ATOMIC_SELECTOR) || cur.matches(HEADER_SELECTOR)) return cur;
    cur = cur.firstElementChild;
  }
  return el;
}

function measurePageBreakRanges(sheetEl, scale) {
  const rootTop = sheetEl.getBoundingClientRect().top;
  const toRange = (el) => {
    const r = el.getBoundingClientRect();
    return [(r.top - rootTop) * scale, (r.bottom - rootTop) * scale];
  };
  const atomic = [];
  sheetEl.querySelectorAll(ATOMIC_SELECTOR).forEach((el) => {
    const [top, bottom] = toRange(el);
    if (bottom > top) atomic.push([top, bottom]);
  });
  const keep = [];
  sheetEl.querySelectorAll(HEADER_SELECTOR).forEach((headerEl) => {
    const [top, headerBottom] = toRange(headerEl);
    let bottom = headerBottom;
    let unit = headerEl.nextElementSibling && firstUnit(headerEl.nextElementSibling);
    for (let hops = 0; unit && hops < 3; hops++) {
      bottom = Math.max(bottom, toRange(unit)[1]);
      if (!unit.matches(HEADER_SELECTOR)) break;
      unit = unit.nextElementSibling && firstUnit(unit.nextElementSibling);
    }
    if (bottom > top) keep.push([top, bottom]);
  });
  const soft = [];
  sheetEl.querySelectorAll(SOFT_UNBREAK_SELECTOR).forEach((el) => {
    const [top, bottom] = toRange(el);
    if (bottom > top) soft.push([top, bottom]);
  });

  // Every element top is a candidate break; remember the bottom of the
  // content just above it so the cut can sit in the gap between them.
  const all = [...atomic, ...keep, ...soft];
  const tops = [...new Set(all.map(([t]) => Math.round(t * 10) / 10))].sort((a, b) => a - b);
  const cands = tops.map((top) => {
    let gapTop = 0;
    for (const [, b] of all) if (b <= top + 0.5 && b > gapTop) gapTop = b;
    return { top, gapTop };
  });

  const last = sheetEl.lastElementChild || sheetEl;
  const contentEnd = (last.getBoundingClientRect().bottom - rootTop) * scale;
  return { blocks: [...atomic, ...keep], soft, cands, contentEnd };
}

function computeSafePageSlices(contentEnd, getPageContentPx, { blocks, soft, cands }) {
  const end = Math.ceil(contentEnd);
  const slices = [];
  let cursor = 0;
  while (cursor < end) {
    const pageH = getPageContentPx(slices.length);
    const limit = cursor + pageH;
    if (end <= limit) {
      slices.push([cursor, end - cursor]);
      break;
    }
    const splits = (ranges, y) => ranges.some(([t, b]) => b - t <= pageH && y > t + 0.5 && y < b - 0.5);
    const ok = cands.filter((c) => c.top > cursor + MIN_SLICE * pageH && c.top <= limit && !splits(blocks, c.top));
    const keepsSoft = ok.filter((c) => !splits(soft, c.top));
    const lastKeep = keepsSoft[keepsSoft.length - 1];
    const best = lastKeep && (limit - lastKeep.top) / pageH <= MAX_WASTE ? lastKeep : ok[ok.length - 1];

    let cut;
    if (best) {
      const gapTop = Math.max(best.gapTop, cursor);
      cut = Math.floor(gapTop + (best.top - gapTop) / 2);
      if (cut <= cursor) cut = Math.floor(best.top);
    } else {
      cut = Math.floor(limit); // nothing breakable fits — forced cut keeps progress
    }
    cut = Math.min(Math.max(cut, cursor + 1), Math.floor(limit));
    slices.push([cursor, cut - cursor]);
    cursor = cut;
  }
  return slices.filter(([, h]) => h >= 2);
}

// ── Isolated render frame ──────────────────────────────────────────────────
const RENDER_PX_WIDTH = 800;
const H2C_SCALE = 2;
const PDF_FONT_CSS = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=block";
const PDF_FONT_FACES = [400, 500, 600, 700].map((w) => `${w} 12px "Plus Jakarta Sans"`);
const FONT_SAMPLE = "AaZz0123456789₹—·%"; // pulls in the latin and latin-ext subsets

// Loads the brand font into a FontFaceSet; gives up after a few seconds so
// a blocked font server falls back to the system font instead of hanging.
async function loadPdfFonts(fontSet) {
  if (!fontSet?.load) return;
  await Promise.race([
    Promise.all(PDF_FONT_FACES.map((f) => fontSet.load(f, FONT_SAMPLE))),
    new Promise((r) => setTimeout(r, 5000)),
  ]).catch(() => {});
}

async function createRenderFrame(bodyHtml) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  // Needs real layout (not display:none) — html2canvas measures it.
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_PX_WIDTH}px;height:1200px;border:0;visibility:hidden;pointer-events:none`;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8">`
    + `<base href="${esc(window.location.href)}">`
    + `<link rel="stylesheet" href="${PDF_FONT_CSS}">`
    + `<style>html,body{margin:0;padding:0;background:#fff}</style>`
    + `<style>${templateCss}</style>`
    + `</head><body>${bodyHtml}</body></html>`);
  doc.close();

  const link = doc.querySelector("link[rel=stylesheet]");
  await new Promise((resolve) => {
    if (link.sheet) return resolve();
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
    setTimeout(resolve, 5000);
  });
  await loadPdfFonts(doc.fonts);
  await doc.fonts?.ready;
  // A capture taken before the logo decodes prints a blank box.
  await Promise.all([...doc.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
  return { iframe, doc };
}

// Renders the model in an isolated iframe, captures it with html2canvas,
// and slices the result into a real multi-page jsPDF document. Returns the
// finished PDF as a blob (plus a suggested filename) ready to upload.
async function renderSummaryPdf(model) {
  // The section badges and readiness ring are drawn on canvases in this
  // document, so the brand font must be ready here too.
  await loadPdfFonts(document.fonts);
  const { iframe, doc: frameDoc } = await createRenderFrame(renderHtml(model));

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const HEADER_MM = 16, FOOTER_MM = 11;
  const GAP_MM = 6;
  const contentHeightMM = PH - HEADER_MM - FOOTER_MM - GAP_MM * 2;

  let canvas, ranges;
  try {
    const sheetEl = frameDoc.querySelector(".sheet");
    const html2canvas = (await import("html2canvas")).default;
    canvas = await html2canvas(sheetEl, {
      scale: H2C_SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: RENDER_PX_WIDTH,
      windowHeight: frameDoc.documentElement.scrollHeight,
      onclone: (clonedDoc) => loadPdfFonts(clonedDoc.fonts),
    });
    // Measured in the same units html2canvas painted at (its own scale, not
    // canvas.width / width, which carries rounding) so cuts line up exactly.
    ranges = measurePageBreakRanges(sheetEl, H2C_SCALE);
  } finally {
    iframe.remove();
  }

  const pxPerMm = canvas.width / PW;
  const firstPageContentPx = Math.max(1, Math.floor((PH - FOOTER_MM - GAP_MM) * pxPerMm));
  const restPageContentPx = Math.max(1, Math.floor(contentHeightMM * pxPerMm));
  const getPageContentPx = (pageIndex) => (pageIndex === 0 ? firstPageContentPx : restPageContentPx);
  // Paginate to the end of the content (+ a little air), not the canvas —
  // the sheet's bottom padding alone must never become a blank last page.
  const contentEnd = Math.min(canvas.height, ranges.contentEnd + Math.round(4 * pxPerMm));
  const slices = computeSafePageSlices(contentEnd, getPageContentPx, ranges);
  const totalPages = slices.length;

  slices.forEach(([sy, sh], p) => {
    if (p > 0) doc.addPage();
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sh;
    const ctx = pageCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
    const topMM = p === 0 ? 0 : HEADER_MM + GAP_MM;
    doc.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, topMM, PW, sh / pxPerMm);
  });

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 1) drawRunningHeader(doc, model);
    drawRunningFooter(doc, p, totalPages);
  }

  doc.setProperties({ title: `${APPLICATION_FORM_TITLE} — ${pdfSafe(model.student.fullName)}`, subject: `Education Loan ${APPLICATION_FORM_TITLE}` });
  // The backend stores it as Student_Summary.pdf whatever this is called
  // (staff tools and recovery look it up by that name).
  const fname = `Application_Form_${(model.student.fullName || "Student").replace(/\s+/g, "_")}.pdf`;
  return { blob: doc.output("blob"), fname };
}
