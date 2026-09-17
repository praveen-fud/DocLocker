// utils/summaryGenerator.js — student-facing "Application Summary" PDF.
//
// Renders a rich hero/readiness-ring/section/document-checklist layout
// off-screen with real CSS (summaryPdfTemplate.css — flexbox, grid, custom
// properties, gradients all fine here), captures it with html2canvas, and
// slices the result into A4 pages with jsPDF, entirely in the browser. The
// backend's /api/student-summary route used to receive an HTML string and
// convert it to PDF via Google Drive's own HTML-import-then-export — that
// pipeline has no real CSS engine (no grid/flexbox/custom-properties/
// gradients), which can't render this design at all, so the finished PDF
// blob is now uploaded directly instead and the backend just stores it.
import jsPDF from "jspdf";
import { DOCUMENT_SCHEMA, CO_APPLICANT_SCHEMA, getTotalRequiredFields } from "../context/schemas";
import "./summaryPdfTemplate.css";

const API_URL = import.meta.env.VITE_API_URL ?? "";

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
  try {
    const model = buildModel(studentName, studentData);
    const { blob, fname } = await renderSummaryPdf(model);

    const fd = new FormData();
    fd.append("studentName", studentName);
    fd.append("studentIdentifier", studentIdentifier);
    fd.append("documents", JSON.stringify(uploadedDocuments || []));
    fd.append("summaryPdf", blob, fname);

    const res = await fetch(`${API_URL}/api/student-summary`, { method: "POST", body: fd });
    const d = await res.json();
    if (d.success) console.log("[SummaryPDF] saved:", d.webViewLink);
    else console.warn("[SummaryPDF] failed:", d.error);
  } catch (e) {
    console.warn("[generateAndUploadSummaryPDF] error:", e.message);
  }
}

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
    email: studentData.email || p.email,
    phone: studentData.phone || p.phone,
    maritalStatus: p.marital === "Yes" ? "Married" : p.marital === "No" ? "Unmarried" : p.marital,
    loanTrack: p.loanTrack,
    loanAmountText: p.loanAmount ? "₹" + Number(p.loanAmount).toLocaleString("en-IN") : "",
    cibilText: p.studentCibil || "",
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

  const destination = {
    track: p.loanTrack,
    country: p.destinationCountry,
    i20Received: p.i20Received,
    visaSlotBooked: p.visaBooked,
    visaSlotDate: p.visaSlotDate,
    university: p.targetUniversity,
    course: p.courseNameUniversity,
    currentAddress: p.currentAddress,
    permanentAddress: p.permanentAddress,
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
        ? (c.empType === "salaried" ? "Salaried" : c.empType === "selfEmployed" ? "Self-Employed" : "Financial")
        : "Non-Financial",
      relation: c.relation,
      mobile: c.mobile,
      email: c.email,
      occupation: c.occupation,
      isFinancial,
      annualIncome: c.annualIncome ? "₹" + Number(c.annualIncome).toLocaleString("en-IN") : "",
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
  const groupFromSchema = (label, color, fields, uploadsKey) => {
    const up = uploads[uploadsKey] || {};
    return {
      group: label,
      color,
      items: fields.map((f) => ({ name: f.label, required: !f.optional, uploaded: !!up[f.id] })),
    };
  };

  const documents = [
    groupFromSchema("Government ID & Personal", "#2E86DE", DOCUMENT_SCHEMA.applicant.fields, "applicant"),
    groupFromSchema("Academic Certificates", "#6C5CE7", DOCUMENT_SCHEMA.academics.fields, "academics"),
  ];
  for (let i = 0; i < coCount; i++) {
    const c = p[`co_info_${i}`] || {};
    const isFinancial = c.financialStatus !== "non-financial";
    const empType = c.empType || "salaried";
    const fields = isFinancial ? (CO_APPLICANT_SCHEMA[empType] || CO_APPLICANT_SCHEMA.other) : CO_APPLICANT_SCHEMA.other;
    const label = `Co-Applicant ${i + 1} Documents${coName(c) ? ` — ${coName(c)}` : ""}`;
    documents.push(groupFromSchema(label, "#F76707", fields, `co_info_${i}`));
  }

  // ── Readiness — required-field/document completion, by area ─────────────
  const totalRequired = getTotalRequiredFields(coCount, p);
  let uploadedRequired = 0;
  documents.forEach((g) => g.items.forEach((i) => { if (i.required && i.uploaded) uploadedRequired++; }));
  const docPct = totalRequired > 0 ? Math.round((uploadedRequired / totalRequired) * 100) : 0;

  const profileFields = [p.firstName || p.fullName, p.email, p.phone, p.loanTrack, p.loanAmount, p.qualName, p.targetUniversity, p.destinationCountry];
  const profilePct = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);

  const segments = [
    { label: "Profile Details", pct: profilePct, color: "#2E86DE" },
    { label: "Documents", pct: docPct, color: "#17855E" },
  ];
  if (coCount > 0) {
    const coFilled = coApplicants.filter((c) => c.name && c.mobile).length;
    segments.push({ label: "Co-Applicants", pct: Math.round((coFilled / coCount) * 100), color: "#F76707" });
  }
  const overallPct = Math.round(segments.reduce((a, s) => a + s.pct, 0) / segments.length);

  const outstanding = documents
    .map((g) => {
      const missing = g.items.filter((i) => i.required && !i.uploaded).map((i) => i.name);
      return missing.length ? { section: g.group, items: missing, color: g.color } : null;
    })
    .filter(Boolean);

  const flags = outstanding.slice(0, 3).map((o) => `${o.section}: ${o.items.length} required document${o.items.length === 1 ? "" : "s"} pending`);
  const hiddenFlagCount = Math.max(0, outstanding.length - 3);

  return {
    companyName: "DocLocker",
    generatedOn: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    student, academic, destination, family, history, references, coApplicants, documents,
    readiness: { percent: overallPct, segments },
    flags, hiddenFlagCount, outstanding,
  };
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
  ctx.font = `700 ${Math.round(SIZE * 0.56)}px Poppins, Arial, sans-serif`;
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
  ctx.font = "700 68px Poppins, Arial, sans-serif";
  ctx.fillText(`${percent}%`, cx, cy - 16);
  ctx.fillStyle = "#8A93A6";
  ctx.font = "600 24px Poppins, Arial, sans-serif";
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
        <div class="rd-sub">Share of required profile fields and documents completed so far, by area.</div>
        <div class="rd-bar">${segHtml}</div>
      </div>
    </div>`;
}

function renderFlags(flags, hiddenFlagCount) {
  if (!flags.length) return "";
  const hiddenLine = hiddenFlagCount > 0
    ? `<li class="muted">+ ${hiddenFlagCount} more item${hiddenFlagCount === 1 ? "" : "s"} — see Outstanding Items at the end of this document.</li>`
    : "";
  return `
    <div class="flags">
      <h3>Needs Attention</h3>
      <ul>${flags.map((f) => `<li><b>${esc(f)}</b></li>`).join("")}${hiddenLine}</ul>
    </div>`;
}

function renderHero(model) {
  return `
    <div class="hero">
      <div class="hero-top">
        <div class="logo-card"><span class="logo-fallback">${esc(model.companyName)}</span></div>
        ${model.student.loanTrack ? `
        <div class="track-badge">
          <div class="l">Loan Track For</div>
          <div class="v">${esc(model.student.loanTrack)}</div>
        </div>` : ""}
      </div>
      <div class="hero-name">
        <h1>${esc(model.student.fullName)}</h1>
      </div>
      <div class="stats">
        <div class="stat" style="--c:${model.readiness.segments[0]?.color || "#2E86DE"}"><div class="n">${esc(model.student.loanAmountText || "—")}</div><div class="k">Loan Amount</div></div>
        <div class="stat" style="--c:#0EA5A5"><div class="n">${esc(model.student.destinationText || "—")}</div><div class="k">Destination</div></div>
        <div class="stat" style="--c:#9F1B32"><div class="n">${esc(model.student.cibilText || "—")}</div><div class="k">Student CIBIL</div></div>
        <div class="stat" style="--c:#F76707"><div class="n">${esc(model.student.coCountText)}</div><div class="k">Co-Applicants</div></div>
      </div>
    </div>`;
}

function renderPersonalSection(model) {
  const s = model.student;
  return `
    <div class="section">
      ${secHead(1, "Student Personal Information", "#2E86DE")}
      <div class="grid">
        ${row("Full Name", s.fullName)}
        ${row("Email", s.email)}
        ${row("Phone / WhatsApp", s.phone)}
        ${row("Marital Status", s.maritalStatus)}
        ${row("Loan Amount", s.loanAmountText)}
        ${row("Student CIBIL", s.cibilText)}
      </div>
      <div class="grid one">
        ${row("Current Address", s.currentAddress, true)}
        ${row("Permanent Address", s.permanentAddress, true)}
      </div>
    </div>`;
}

function renderAcademicSection(a) {
  return `
    <div class="section">
      ${secHead(2, "Academic Qualifications", "#6C5CE7")}
      <div class="grid">
        ${row("Highest Qual.", a.highestQualification)}
        ${row("Passed Year", a.passedYear)}
        ${row("10th Score", a.tenthScore)}
        ${row("10th Year", a.tenthYear)}
        ${row("12th Score", a.twelfthScore)}
        ${row("12th Year", a.twelfthYear)}
        ${row("Grad Score", a.gradScore)}
        ${row("Grad Year", a.gradYear)}
        ${row("Backlogs", a.backlogs)}
        ${row("Number of Backlogs", a.backlogsCount)}
      </div>
      <div class="grid one">
        ${row("Institution", a.institution, true)}
        ${row("Test Scores", a.testScores, true)}
      </div>
    </div>`;
}

function renderDestinationSection(d) {
  return `
    <div class="section">
      ${secHead(3, "Destination & Application Context", "#0EA5A5")}
      <div class="grid">
        ${row("Loan Track", d.track)}
        ${row("Country", d.country)}
        ${row("I-20 Received", d.i20Received)}
        ${row("Visa Slot Booked", d.visaSlotBooked)}
        ${row("Visa Slot Date", d.visaSlotDate)}
      </div>
      <div class="grid one">
        ${row("Target University", d.university, true)}
        ${row("Course & University", d.course, true)}
        ${row("Current Address", d.currentAddress, true)}
        ${row("Permanent Address", d.permanentAddress, true)}
      </div>
    </div>`;
}

function renderFamilySection(f) {
  const subs = [
    `<div class="sub">
      <div class="sub-head" style="--c:#9F1B32"><span>Father</span></div>
      <div class="grid one">
        ${row("Name", f.father.name)}
        ${row("Contact", f.father.contact)}
        ${row("CIBIL Score", f.father.cibil)}
      </div>
    </div>`,
    `<div class="sub">
      <div class="sub-head" style="--c:#9F1B32"><span>Mother</span></div>
      <div class="grid one">
        ${row("Name", f.mother.name)}
        ${row("Contact", f.mother.contact)}
        ${row("CIBIL Score", f.mother.cibil)}
      </div>
    </div>`,
  ];
  const guarantorHtml = f.guarantor ? `
    <div class="sub">
      <div class="sub-head" style="--c:#9F1B32"><span>Financial Guarantor</span></div>
      <div class="grid one">
        ${row("Name", f.guarantor.name)}
        ${row("Relation", f.guarantor.relation)}
        ${row("Mobile", f.guarantor.mobile)}
        ${row("CIBIL", f.guarantor.cibil)}
        ${row("Sector", f.guarantor.sector)}
        ${row("Income Docs Available", f.guarantor.docsAvailable)}
      </div>
    </div>` : "";
  const grandmaRow = (f.maternalGrandma || f.paternalGrandma)
    ? `<div class="grid">${row("Maternal Grandmother", f.maternalGrandma)}${row("Paternal Grandmother", f.paternalGrandma)}</div>`
    : "";
  return `
    <div class="section">
      ${secHead(4, "Family & Financial Background", "#9F1B32")}
      <div class="subs">${subs.join("")}</div>
      ${guarantorHtml}
      ${grandmaRow}
    </div>`;
}

function renderHistorySection(h) {
  return `
    <div class="section">
      ${secHead(5, "Employment & Prior History", "#E08A00")}
      <div class="grid">
        ${row("Prior Bank Applied", h.appliedBefore)}
        ${row("Bank Name", h.bankAppliedTo)}
        ${row("Own House", h.ownsHouse)}
        ${row("Has Job", h.employed)}
        ${row("Job Details", h.jobDetails)}
        ${row("Consultant Name / Location", h.consultant)}
        ${row("Consultant Contact", h.consultantContact)}
      </div>
    </div>`;
}

function renderReferencesSection(references) {
  if (!references.length) {
    return `<div class="section">${secHead(6, "Personal References", "#7CB518")}${emptyState("No references provided", "The student hasn't added any personal references yet.")}</div>`;
  }
  const subs = references.map((r, i) => `
    <div class="sub">
      <div class="sub-head" style="--c:#7CB518"><span>Reference ${i + 1}</span></div>
      <div class="grid one">
        ${row("Name", r.name)}
        ${row("Mobile", r.mobile)}
        ${row("Occupation", r.occupation)}
        ${row("Relation", r.relation)}
        ${row("Address", r.address, true)}
      </div>
    </div>`).join("");
  return `<div class="section">${secHead(6, "Personal References", "#7CB518")}<div class="subs">${subs}</div></div>`;
}

function renderCoApplicantsSection(coApplicants, sectionNum) {
  if (!coApplicants.length) return "";
  const groups = coApplicants.map((co) => `
    <div class="sub">
      <div class="sub-head" style="--c:#F76707">
        <span>Co-Applicant ${co.index}${co.name ? ` — ${esc(co.name)}` : ""}</span>
        <em>${esc(co.profile)}</em>
      </div>
      <div class="grid one">
        ${row("Relation", co.relation)}
        ${row("Mobile", co.mobile)}
        ${row("Email", co.email)}
        ${row("Occupation", co.occupation)}
        ${co.isFinancial ? row("Annual Income", co.annualIncome) : ""}
        ${row("Qualifications", co.qualifications)}
        ${row("CIBIL Score", co.cibil)}
        ${row("Dependants", co.dependants)}
        ${row("Years at Address", co.yearsAddress)}
        ${row("Current Address", co.currentAddress, true)}
        ${row("Permanent Address", co.permanentAddress, true)}
        ${row("Office Address", co.officeAddress, true)}
      </div>
    </div>`).join("");
  return `<div class="section">${secHead(sectionNum, `Co-Applicants (${coApplicants.length})`, "#F76707")}<div class="subs">${groups}</div></div>`;
}

function renderDocumentsSection(documents, sectionNum) {
  const groupsHtml = documents.map((g) => {
    const done = g.items.filter((i) => i.uploaded).length;
    const total = g.items.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
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
          <span class="c">${done}/${total}</span>
          <div class="dmeter"><i style="width:${pct}%"></i></div>
        </div>
        <ul class="dlist">${itemsHtml}</ul>
      </div>`;
  }).join("");
  return `<div class="section">${secHead(sectionNum, "Document Upload Summary", "#17855E")}${groupsHtml}</div>`;
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
  const coSectionNum = 7;
  const docsSectionNum = model.coApplicants.length > 0 ? 8 : 7;
  return `
    <div class="sheet pdf-render">
      ${renderHero(model)}
      ${renderReadiness(model.readiness)}
      ${renderFlags(model.flags, model.hiddenFlagCount)}
      ${renderPersonalSection(model)}
      ${renderAcademicSection(model.academic)}
      ${renderDestinationSection(model.destination)}
      ${renderFamilySection(model.family)}
      ${renderHistorySection(model.history)}
      ${renderReferencesSection(model.references)}
      ${renderCoApplicantsSection(model.coApplicants, coSectionNum)}
      ${renderOutstanding(model.outstanding)}
      ${renderDocumentsSection(model.documents, docsSectionNum)}
      ${renderSignOff(model)}
    </div>`;
}

// ── Running header/footer — drawn as real vector text with jsPDF on every
// page produced by the html2canvas render below.
function drawRunningHeader(doc, companyName, studentName, generatedOn) {
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
  doc.text(String(companyName || "").toUpperCase(), M, 8.3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.6);
  doc.setTextColor(140, 145, 158);
  doc.text("APPLICATION SUMMARY", M, 11.6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(30, 38, 58);
  doc.text(studentName, PW / 2, 9.6, { align: "center" });

  doc.setFontSize(6.3);
  doc.setTextColor(130, 136, 148);
  doc.text(`Generated: ${generatedOn}`, PW - M, 9.6, { align: "right" });
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
  doc.text("Education Loan Application Summary — Confidential", M, PH - RF + 6.5);
  doc.text(`Page ${pageNum} of ${totalPages}`, PW - M, PH - RF + 6.5, { align: "right" });
}

// ── Boundary-aware pagination — a page break must never land mid-row or
// mid-section. "Hard" ranges (a single row/stat/etc) can never be split;
// "soft" ranges (a whole section/sub/dgroup) are kept whole only when they
// fit within one page's content height on their own.
const ATOMIC_SELECTOR = [
  ".stat", ".readiness", ".flags", ".row", ".out-row", ".dlist li",
  ".sign-grid", ".declaration", ".office", ".track-badge",
].join(", ");
const HEADER_SELECTOR = ".sec-head, .sub-head, .dgroup-head";
const SOFT_UNBREAK_SELECTOR = ".section, .sub, .dgroup";

function measurePageBreakRanges(sheetEl, scale) {
  const rootTop = sheetEl.getBoundingClientRect().top;
  const toRange = (el) => {
    const r = el.getBoundingClientRect();
    return [(r.top - rootTop) * scale, (r.bottom - rootTop) * scale];
  };
  const hard = [];
  sheetEl.querySelectorAll(ATOMIC_SELECTOR).forEach((el) => {
    const [top, bottom] = toRange(el);
    if (bottom > top) hard.push([top, bottom]);
  });
  sheetEl.querySelectorAll(HEADER_SELECTOR).forEach((headerEl) => {
    const [top, headerBottom] = toRange(headerEl);
    const next = headerEl.nextElementSibling;
    const bottom = next ? Math.max(headerBottom, toRange(next)[1]) : headerBottom;
    if (bottom > top) hard.push([top, bottom]);
  });
  hard.sort((a, b) => a[0] - b[0]);

  const soft = [];
  sheetEl.querySelectorAll(SOFT_UNBREAK_SELECTOR).forEach((el) => {
    const [top, bottom] = toRange(el);
    if (bottom > top) soft.push([top, bottom]);
  });
  soft.sort((a, b) => a[0] - b[0]);

  return { hard, soft };
}

function computeSafePageSlices(canvasHeight, getPageContentPx, hardRanges, softRanges) {
  const slices = [];
  let cursor = 0;
  while (cursor < canvasHeight) {
    const pageContentPx = getPageContentPx(slices.length);
    let cut = Math.min(cursor + pageContentPx, canvasHeight);
    if (cut < canvasHeight) {
      const hardHit = hardRanges.find(([top, bottom]) => cut > top && cut < bottom);
      if (hardHit && hardHit[0] > cursor) cut = hardHit[0];

      const softHit = softRanges.find(
        ([top, bottom]) => cut > top && cut < bottom && (bottom - top) <= pageContentPx,
      );
      if (softHit && softHit[0] > cursor) cut = softHit[0];
    }
    slices.push([cursor, cut - cursor]);
    cursor = cut;
  }
  return slices;
}

// Renders the model to an off-screen container, captures it with
// html2canvas, and slices the result into a real multi-page jsPDF document.
// Returns the finished PDF as a blob (plus a suggested filename) ready to
// upload — nothing here depends on any server-side rendering step.
async function renderSummaryPdf(model) {
  const bodyHtml = renderHtml(model);

  const RENDER_PX_WIDTH = 800;
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "-99999px";
  container.style.width = `${RENDER_PX_WIDTH}px`;
  container.innerHTML = bodyHtml;
  document.body.appendChild(container);

  // Wait for any web fonts this page has requested to finish loading before
  // capturing — otherwise html2canvas can bake in whichever font (real or
  // fallback) happened to be active at that exact instant.
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const HEADER_MM = 16, FOOTER_MM = 11;
  const GAP_MM = 6;
  const contentHeightMM = PH - HEADER_MM - FOOTER_MM - GAP_MM * 2;

  let canvas, hardRanges, softRanges, scale;
  try {
    const sheetEl = container.querySelector(".sheet");
    const html2canvas = (await import("html2canvas")).default;
    canvas = await html2canvas(sheetEl, {
      scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: RENDER_PX_WIDTH,
    });
    scale = canvas.width / sheetEl.getBoundingClientRect().width;
    ({ hard: hardRanges, soft: softRanges } = measurePageBreakRanges(sheetEl, scale));
  } finally {
    document.body.removeChild(container);
  }

  const pxPerMm = canvas.width / PW;
  const firstPageContentPx = Math.max(1, Math.floor((PH - FOOTER_MM - GAP_MM) * pxPerMm));
  const restPageContentPx = Math.max(1, Math.floor(contentHeightMM * pxPerMm));
  const getPageContentPx = (pageIndex) => (pageIndex === 0 ? firstPageContentPx : restPageContentPx);
  const slices = computeSafePageSlices(canvas.height, getPageContentPx, hardRanges, softRanges);
  const totalPages = slices.length;

  slices.forEach(([sy, sh], p) => {
    if (p > 0) doc.addPage();
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sh;
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
    const topMM = p === 0 ? 0 : HEADER_MM + GAP_MM;
    doc.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, topMM, PW, sh / pxPerMm);
  });

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 1) drawRunningHeader(doc, model.companyName, model.student.fullName, model.generatedOn);
    drawRunningFooter(doc, p, totalPages);
  }

  const fname = `Student_Summary_${(model.student.fullName || "Student").replace(/\s+/g, "_")}.pdf`;
  return { blob: doc.output("blob"), fname };
}
