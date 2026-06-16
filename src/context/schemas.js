// Document schemas

export const DOCUMENT_SCHEMA = {
  applicant: {
    label: "GOVT ID",
    folder: "GOVT ID",
    fields: [
      {
        id: "passport",
        label: "Passport",
        rename: "Passport",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
      },
      {
        id: "pan",
        label: "PAN Card",
        rename: "PAN_Card",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
      },
      {
        id: "aadhar",
        label: "Aadhar Card",
        rename: "Aadhar_Card",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
      },
      {
        id: "photo",
        label: "Passport Size Photo",
        rename: "Passport_Photo",
        accept: ".jpg,.jpeg,.png,.doc,.docx,.pdf",
      },
      {
        id: "signature",
        label: "Signature",
        rename: "Signature",
        // FIX: was missing .doc — added correctly
        accept: ".jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "Visa History",
        label: "Visa History (if any)",
        rename: "Visa_History",
        accept: ".pdf,.zip,.doc,.docx,.jpg,.jpeg,.png",
        optional: true,
      },
      {
        id: "cibil_report",
        label: "Student CIBIL Report (optional — auto-fills CIBIL score)",
        rename: "Student_CIBIL_Report",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "resume",
        label: "Resume",
        rename: "Resume",
        accept: ".pdf,.doc,.docx",
      },
      {
        id: "salary_slip_applicant",
        label: "Last 1 Month Salary Slip (if you are working)",
        rename: "Salary_Slip_Applicant",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
    ],
  },
  academics: {
    label: "Academic Certificates",
    folder: "Academics",
    fields: [
      {
        id: "marksheet_10",
        label: "10th Marksheet",
        rename: "10th_Marksheet",
        // FIX: was ".pdf,.jpg,.jpeg,.png,doc,.docx" (missing dot before doc)
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "marksheet_12",
        label: "12th Marksheet",
        rename: "12th_Marksheet",
        // FIX: same missing dot issue
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
      },
      {
        id: "Diploma_marksheet",
        label: "Diploma Marksheet (if applicable)",
        rename: "Diploma_Marksheet",
        // FIX: same missing dot issue
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "graduation",
        label: "Graduation Marksheets (Semester-wise) & Degree",
        rename: "Graduation_Marksheet",
        accept: ".pdf,.zip,.jpg,.jpeg,.png,.doc,.docx",
        multiple: true,
      },
      {
        id: "degree_certificate",
        label: "Degree Certificate",
        rename: "Degree_Certificate",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
      },
      {
        id: "MOI",
        label: "Medium of Instruction Certificate",
        rename: "Medium_of_Instruction_Certificate",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
      },
      {
        id: "LOR",
        label: "Letter of Recommendation (if any)",
        rename: "Letter_of_Recommendation",
        accept: ".pdf,.zip,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
        multiple: true,
      },
      {
        id: "OD",
        label: "OD (if required by university)",
        rename: "OD",
        // FIX: was ".pdf,.zip,.doc,.docx,jpg,.jpeg,.png" (missing dot before jpg)
        accept: ".pdf,.zip,.doc,.docx,.jpg,.jpeg,.png",
        optional: true,
      },
      {
        id: "PC",
        label: "Professional Certificate",
        rename: "Professional_Certificate",
        accept: ".pdf,.jpeg,.png,.jpg,.doc,.docx",
      },
      {
        id: "CMM",
        label: "Common Mementary Marksheet (if applicable)",
        rename: "CMM",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "gre_scorecard",
        label: "GRE Score Report (optional — auto-fills GRE score)",
        rename: "GRE_Scorecard",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "ielts_scorecard",
        label: "IELTS Score Report (optional — auto-fills IELTS score)",
        rename: "IELTS_Scorecard",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "toefl_scorecard",
        label: "TOEFL Score Report (optional — auto-fills TOEFL score)",
        rename: "TOEFL_Scorecard",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "duolingo_scorecard",
        label: "Duolingo Score Certificate (optional — auto-fills Duolingo score)",
        rename: "Duolingo_Scorecard",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "i20_admission",
        label: "I-20 / Admission Letter (optional — auto-fills university & course)",
        rename: "I20_Admission_Letter",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "visa_appointment",
        label: "Visa Appointment Letter (optional — auto-fills visa date)",
        rename: "Visa_Appointment_Letter",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "gmat_scorecard",
        label: "GMAT Score Report (optional — auto-fills GMAT score)",
        rename: "GMAT_Scorecard",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "pte_scorecard",
        label: "PTE Score Report (optional — auto-fills PTE score)",
        rename: "PTE_Scorecard",
        accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
    ],
  },
};

export const CO_APPLICANT_SCHEMA = {
  salaried: [
    {
      id: "aadhar",
      label: "Aadhar Card",
      rename: "Aadhar",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "pan",
      label: "PAN Card",
      rename: "PAN",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "photo",
      label: "Passport Size Photo",
      rename: "Photo",
      accept: ".jpg,.jpeg,.png,.doc,.docx,.pdf",
    },
    {
      id: "salary_slip_3m",
      label: "Last 3 Month Salary Slip",
      rename: "Salary_Slip_3Months",
      accept: ".pdf,.zip,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "bank_stmt_6m",
      label: "Last 6 Month Bank Statement (salary a/c)",
      rename: "Bank_Statement_6Months",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "form16_itr_y1",
      label: "Form 16 / ITR - Year 1 (Latest)",
      rename: "Form16_ITR_Year1",
      accept: ".pdf,.doc,.docx",
    },
    {
      id: "form16_itr_y2",
      label: "Form 16 / ITR - Year 2",
      rename: "Form16_ITR_Year2",
      accept: ".pdf,.doc,.docx",
    },
    {
      id: "form16_itr_y3",
      label: "Form 16 / ITR - Year 3 (optional)",
      rename: "Form16_ITR_Year3",
      accept: ".pdf,.doc,.docx",
      optional: true,
    },
  ],
  selfEmployed: [
    {
      id: "aadhar",
      label: "Aadhar Card",
      rename: "Aadhar",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "pan",
      label: "PAN Card",
      rename: "PAN",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "photo",
      label: "Passport Size Photo",
      rename: "Photo",
      accept: ".jpg,.jpeg,.png,.doc,.docx,.pdf",
    },
    {
      id: "bank_stmt_6m",
      label: "Last 6 Month Bank Statement",
      rename: "Bank_Statement_6Months",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "itr_y1",
      label: "ITR Acknowledgement - Year 1 (Latest)",
      rename: "ITR_Year1",
      accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png",
    },
    {
      id: "itr_y2",
      label: "ITR Acknowledgement - Year 2",
      rename: "ITR_Year2",
      accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png",
    },
    {
      id: "itr_y3",
      label: "ITR Acknowledgement - Year 3 (optional)",
      rename: "ITR_Year3",
      accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png",
      optional: true,
    },
    {
      id: "business_proof",
      label: "Business Proof / GST Certificate",
      rename: "Business_Proof_GST",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
  ],
  other: [
    {
      id: "aadhar",
      label: "Aadhar Card",
      rename: "Aadhar",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "pan",
      label: "PAN Card",
      rename: "PAN",
      accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx",
    },
    {
      id: "photo",
      label: "Passport Size Photo",
      rename: "Photo",
      accept: ".jpg,.jpeg,.png,.doc,.docx,.pdf",
    },
  ],
};

// ── Schema helpers ────────────────────────────────────────────────────────────

/**
 * Compute the total number of REQUIRED fields across all sections
 * for a given student (used for accurate progress calculation).
 * Replaces the old hardcoded magic number 22.
 */
export function getTotalRequiredFields(coCount = 1, coApplicantsInfo = {}) {
  const applicantRequired = DOCUMENT_SCHEMA.applicant.fields.filter(
    (f) => !f.optional,
  ).length;

  const academicsRequired = DOCUMENT_SCHEMA.academics.fields.filter(
    (f) => !f.optional,
  ).length;

  let coRequired = 0;
  for (let i = 0; i < coCount; i++) {
    const info = coApplicantsInfo[`co_info_${i}`] || {};
    if (info.financialStatus === "non-financial") {
      coRequired += 3; // aadhar, pan, photo
    } else {
      const empType = info.empType || "salaried";
      const schema = CO_APPLICANT_SCHEMA[empType] || CO_APPLICANT_SCHEMA.other;
      coRequired += schema.filter((f) => !f.optional).length;
    }
  }

  return applicantRequired + academicsRequired + coRequired;
}
