// utils/summaryGenerator.js
const API_URL = import.meta.env.VITE_API_URL ?? '';

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

function _doGeneratePdf(studentName, studentData, studentIdentifier, uploadedDocuments) {
  try {
    const p = studentData.personalInfo || {};
    const co = studentData.coApplicants || 0;

    // ── helpers ────────────────────────────────────────────────────────────
    const v = (val) => val || '<span class="empty">—</span>';
    const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.fullName || studentName;
    const scoreUnit = (type) => (type === "marks" ? " Marks" : type === "points" ? " Points" : "%");
    const coName = (c) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "";
    const refAddress = (n) => {
      const parts = [p[`ref${n}_house_number`], p[`ref${n}_street_name`], p[`ref${n}_city`], p[`ref${n}_state`], p[`ref${n}_pincode`]].filter(Boolean);
      return parts.length ? parts.join(", ") : p[`ref${n}_address`];
    };

    const row = (label, value) => `
      <tr>
        <td class="lbl">${label}</td>
        <td class="val">${v(value)}</td>
      </tr>`;

    const section = (title, color, rows) => `
      <div class="section">
        <div class="section-title" style="background:${color}">${title}</div>
        <table class="data-table">${rows}</table>
      </div>`;

    // ── sections ───────────────────────────────────────────────────────────
    const studentSection = section(
      "Student Identity",
      "#1e40af",
      [
        row("Full Name", fullName),
        row("Finance Advisor", studentData.advisor),
        row("Email", studentData.email || p.email),
        row("Phone", studentData.phone || p.phone),
        row("Marital Status", p.marital === "Yes" ? "Married" : p.marital === "No" ? "Unmarried" : p.marital),
        row("Applied For", p.loanTrack),
        row(
          "Loan Amount",
          p.loanAmount
            ? "₹" + Number(p.loanAmount).toLocaleString("en-IN")
            : "",
        ),
        row("Student CIBIL", p.studentCibil),
        row("Current Address", p.currentAddress),
        row("Permanent Address", p.permanentAddress),
      ].join(""),
    );

    const academicSection = section(
      "Academic Profile",
      "#065f46",
      [
        row(
          "Qualification & Year",
          p.qualName
            ? `${p.qualName}${p.qualYear ? ` — ${p.qualYear}` : ""}`
            : p.qualPassedYear,
        ),
        row(
          "10th Score",
          p.pct10Score
            ? `${p.pct10Score}${scoreUnit(p.pct10Type)}${p.pct10Year ? ` — ${p.pct10Year}` : ""}`
            : p.pct10,
        ),
        row(
          "12th Score",
          p.pct12Score
            ? `${p.pct12Score}${scoreUnit(p.pct12Type)}${p.pct12Year ? ` — ${p.pct12Year}` : ""}`
            : p.pct12,
        ),
        row(
          "Graduation % / CGPA",
          p.pctGradScore
            ? `${p.pctGradScore} ${p.pctGradType === "cgpa" ? "CGPA" : "%"}${p.pctGradYear ? ` — ${p.pctGradYear}` : ""}`
            : p.pctGrad,
        ),
        row("Graduation Institution", p.qualInstitution),
        row(
          "Backlogs",
          p.hasBacklogs === "Yes"
            ? "Yes — " + (p.backlogCount || "?") + " backlog(s)"
            : p.hasBacklogs,
        ),
        row("GRE Score", p.greScore),
        row("IELTS Score", p.ieltsScore),
        row("TOEFL Score", p.toeflScore),
        row("GMAT Score", p.gmatScore),
        row("PTE Score", p.pteScore),
        row("Duolingo Score", p.duolingoScore),
      ].join(""),
    );

    const universitySection = section(
      "University & Visa",
      "#7c3aed",
      [
        row("Destination Country", p.destinationCountry),
        row("Target University", p.targetUniversity),
        row("Course", p.courseNameUniversity),
        row("I20 Received", p.i20Received),
        row("Visa Slot Booked", p.visaBooked),
        row("Visa Slot Date", p.visaSlotDate),
      ].join(""),
    );

    const familySection = section(
      "Family & Guarantor",
      "#92400e",
      [
        row("Father Name", p.fatherName),
        row("Father Contact", p.fatherContact),
        row("Father CIBIL", p.fatherCibil),
        row("Mother Name", p.motherName),
        row("Mother Contact", p.motherContact),
        row("Mother CIBIL", p.motherCibil),
        row("Maternal Grandmother", p.maternalGrandma),
        row("Paternal Grandmother", p.paternalGrandma),
        row("Own House", p.ownHouseStatus),
        row("Guarantor Name", p.guarantorName),
        row("Guarantor Relation", p.guarantorRelation),
        row("Guarantor Mobile", p.guarantorMobile),
        row("Guarantor CIBIL", p.guarantorCibil),
        row("Guarantor Sector", p.guarantorSector),
        row("Income Docs Available", p.guarantorDocsAvailable),
      ].join(""),
    );

    const employmentSection = section(
      "Employment & History",
      "#be185d",
      [
        row(
          "Job Details",
          p.hasJobDetails === "Yes"
            ? "Yes — " + (p.jobSpecs || "")
            : p.hasJobDetails,
        ),
        row("Prior Bank Applied", p.priorBankApplied),
        row(
          "Bank Name",
          p.priorBankApplied === "Yes"
            ? p.priorBankName === "Others"
              ? p.priorBankNameCustom
              : p.priorBankName
            : "",
        ),
        row("Consultant Name/Loc", p.consultantNameLoc),
        row("Consultant Contact", p.consultantContact),
      ].join(""),
    );

    const refSection = section(
      "References",
      "#0f766e",
      [
        row("Ref 1 — Name", p.ref1_name),
        row("Ref 1 — Mobile", p.ref1_mobile),
        row("Ref 1 — Occupation", p.ref1_occupation),
        row(
          "Ref 1 — Relation",
          p.ref1_relation === "Other"
            ? p.ref1_custom_relation
            : p.ref1_relation,
        ),
        row("Ref 1 — Address", refAddress(1)),
        row("Ref 2 — Name", p.ref2_name),
        row("Ref 2 — Mobile", p.ref2_mobile),
        row("Ref 2 — Occupation", p.ref2_occupation),
        row(
          "Ref 2 — Relation",
          p.ref2_relation === "Other"
            ? p.ref2_custom_relation
            : p.ref2_relation,
        ),
        row("Ref 2 — Address", refAddress(2)),
      ].join(""),
    );

    // ── co-applicant sections ──────────────────────────────────────────────
    let coSections = "";
    for (let i = 0; i < co; i++) {
      const c = p[`co_info_${i}`] || {};
      const cName = coName(c);
      const label = cName
        ? `Co-Applicant ${i + 1} — ${cName}`
        : `Co-Applicant ${i + 1}`;
      const status =
        c.financialStatus === "non-financial" ? "Non-Financial" : "Financial";
      coSections += section(
        label,
        "#1d4ed8",
        [
          row("Full Name", cName),
          row("Relation", c.relation),
          row("Mobile", c.mobile),
          row("Email", c.email),
          row("Occupation", c.occupation),
          row("Annual Income", c.annualIncome ? "₹" + Number(c.annualIncome).toLocaleString("en-IN") : ""),
          row("Financial Status", status),
          row("Employment Type", c.empType),
          row("Qualifications", c.qualifications),
          row("Dependants", c.dependants),
          row("Years at Address", c.yearsAddress),
          row("Current Address", c.currentAddress),
          row("Permanent Address", c.permanentAddress),
          row("Office Address", c.officeAddress),
        ].join(""),
      );
    }

    // ── Fixed Sizing HTML structure ──────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  /* Explicit layout definition for PDF Engines */
  @page {
    size: A4 portrait;
    margin: 0.4in;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { 
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
    font-size: 10pt; 
    line-height: 1.4;
    color: #1f2937; 
    background: #fff; 
    width: 100%;
  }

  /* Fixed layout structural elements - avoiding CSS Grid completely */
  .cover {
    background-color: #1e40af;
    color: #ffffff;
    padding: 20pt;
    margin-bottom: 20pt;
    border-radius: 4pt;
  }
  .cover-logo {
    font-size: 8pt; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; color: #93c5fd; margin-bottom: 4pt;
  }
  .cover-title { font-size: 18pt; font-weight: 700; margin-bottom: 2pt; }
  .cover-sub   { font-size: 11pt; color: #bfdbfe; margin-bottom: 15pt; }
  
  /* Traditional block table to fix varying card sizes */
  .cover-table { width: 100%; border-collapse: collapse; }
  .cover-cell {
    width: 25%;
    padding: 8pt;
    background: rgba(255, 255, 255, 0.12);
    border: 2pt solid #1e40af; /* matches cover bg to make gap appearance */
    border-radius: 4pt;
    vertical-align: top;
  }
  .clabel { font-size: 7.5pt; text-transform: uppercase; color: #93c5fd; margin-bottom: 2pt; font-weight: bold; }
  .cval { font-size: 10pt; font-weight: 600; color: #ffffff; }

  .body-wrap { padding: 0; }

  /* Enforce section formatting boundaries */
  .section {
    margin-bottom: 16pt; 
    border-radius: 4pt;
    border: 1pt solid #e5e7eb;
    page-break-inside: avoid; /* Prevents text rows split down the middle */
  }
  .section-title {
    color: #fff; font-size: 9pt; font-weight: 700;
    letter-spacing: 0.5px; text-transform: uppercase; padding: 6pt 10pt;
  }
  
  .data-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .data-table tr:nth-child(even) td { background-color: #f9fafb; }
  .data-table td {
    padding: 6pt 10pt; 
    border-bottom: 1pt solid #f3f4f6;
    vertical-align: top; 
    font-size: 9.5pt;
  }
  td.lbl {
    width: 35%; 
    font-weight: 600; 
    color: #4b5563;
  }
  td.val { 
    width: 65%;
    color: #111827; 
    word-wrap: break-word;
  }
  .empty { color: #9ca3af; font-style: italic; }

  .footer {
    margin-top: 25pt; 
    border-top: 1pt solid #e5e7eb;
    padding-top: 8pt; 
    font-size: 8pt;
    color: #9ca3af; 
    text-align: center;
    page-break-inside: avoid;
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-logo">DocLocker · Confidential</div>
  <div class="cover-title">Student Application Summary</div>
  <div class="cover-sub">Education Loan Documentation Package</div>
  <table class="cover-table">
    <tr>
      <td class="cover-cell">
        <div class="clabel">Student Name</div>
        <div class="cval">${fullName}</div>
      </td>
      <td class="cover-cell">
        <div class="clabel">Generated On</div>
        <div class="cval">${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
      </td>
      <td class="cover-cell">
        <div class="clabel">Loan Amount</div>
        <div class="cval">${p.loanAmount ? "₹" + p.loanAmount : "—"}</div>
      </td>
      <td class="cover-cell">
        <div class="clabel">Target Uni</div>
        <div class="cval">${p.targetUniversity || "—"}</div>
      </td>
    </tr>
  </table>
</div>

<div class="body-wrap">
  ${studentSection}
  ${academicSection}
  ${universitySection}
  ${familySection}
  ${employmentSection}
  ${refSection}
  ${coSections}
  <div class="footer">
    This document is auto-generated by DocLocker and intended for authorised bank personnel only.<br>
    Render Status: Compiled on ${new Date().toLocaleString("en-IN")}
  </div>
</div>

</body>
</html>`;

    // ── send to Express API ───────────────────────────────────────────────
    // Student self-service — no admin JWT exists here, so this must hit the
    // no-auth student-summary route (validated by name + identifier), not
    // the staff-only /api/summary.
    fetch(`${API_URL}/api/student-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentName,
        studentIdentifier,
        htmlContent: html,
        documents: uploadedDocuments || [],
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) console.log("[SummaryPDF] saved:", d.webViewLink);
        else console.warn("[SummaryPDF] failed:", d.error);
      })
      .catch((e) => console.warn("[SummaryPDF] network error:", e.message));
  } catch (e) {
    console.warn("[generateAndUploadSummaryPDF] error:", e.message);
  }
}
