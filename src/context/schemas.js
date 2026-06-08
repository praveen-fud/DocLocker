// Document schemas — no visa, no guarantor (as requested)

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
        accept: ".pdf,.jpg,.jpeg,.png,doc,.docx",
      },
      {
        id: "marksheet_12",
        label: "12th Marksheet",
        rename: "12th_Marksheet",
        accept: ".pdf,.jpg,.jpeg,.png,doc,.docx",
      },
      {
        id: "Diploma_marksheet",
        label: "Diploma Marksheet (if applicable)",
        rename: "Diploma_Marksheet",
        accept: ".pdf,.jpg,.jpeg,.png,doc,.docx",
        optional: true,
      },
      {
        id: "graduation",
        label: "Graduation Marksheets (Semester-wise) & Degree",
        rename: "Graduation_Marksheet",
        accept: ".pdf,.zip,.jpg,.jpeg,.png,.doc,.docx",
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
        accept: ".pdf,.zip,. jpg,.jpeg,.png,.doc,.docx",
        optional: true,
      },
      {
        id: "OD",
        label: "OD(if required by university)",
        rename: "OD",
        accept: ".pdf,.zip,.doc,.docx,jpg,.jpeg,.png",
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
    ],
  },
  // Visa section removed
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
      id: "form16_itr",
      label: "Form 16 / ITR Acknowledgement (last 2 yrs)",
      rename: "Form16_ITR_2Years",
      accept: ".pdf,.zip,.doc,.docx",
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
      id: "itr_2years",
      label: "ITR (last 2 years)",
      rename: "ITR_2Years",
      accept: ".pdf,.zip,.doc,.docx,.jpg,.jpeg,.png",
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
