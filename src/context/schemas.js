// Document schemas — separate file so fast-refresh works correctly

export const DOCUMENT_SCHEMA = {
  applicant: {
    label: 'Applicant Documents',
    folder: 'Applicant',
    fields: [
      { id: 'passport',        label: 'Passport',                                          rename: 'Passport',               accept: '.pdf,.jpg,.jpeg,.png' },
      { id: 'pan',             label: 'PAN Card',                                          rename: 'PAN_Card',               accept: '.pdf,.jpg,.jpeg,.png' },
      { id: 'aadhar',          label: 'Aadhar Card',                                       rename: 'Aadhar_Card',            accept: '.pdf,.jpg,.jpeg,.png' },
      { id: 'photo',           label: 'Passport Size Photo',                               rename: 'Passport_Photo',         accept: '.jpg,.jpeg,.png' },
      { id: 'marksheet_10',    label: '10th Marksheet',                                    rename: '10th_Marksheet',         accept: '.pdf,.jpg,.jpeg,.png' },
      { id: 'marksheet_12',    label: '12th Marksheet',                                    rename: '12th_Marksheet',         accept: '.pdf,.jpg,.jpeg,.png' },
      { id: 'graduation',      label: 'Graduation Marksheets (Semester-wise) & Degree',    rename: 'Graduation_Marksheet',   accept: '.pdf,.zip' },
      { id: 'admission_letter',label: 'University/College Admission Letter',               rename: 'Admission_Letter',       accept: '.pdf,.jpg,.jpeg,.png', optional: true },
      { id: 'salary_slip',     label: 'Last 6 Month Salary Slip (if working)',             rename: 'Salary_Slip_6Months',    accept: '.pdf,.zip',            optional: true },
      { id: 'bank_statement',  label: 'Last 6 Month Bank Statement (if working)',          rename: 'Bank_Statement_6Months', accept: '.pdf',                 optional: true },
      { id: 'score_card',      label: 'GRE/IELTS/TOEFL/GMAT/PTE/DUOLINGO Score Card',     rename: 'Test_Score_Card',        accept: '.pdf,.jpg,.jpeg,.png', optional: true },
      { id: 'resume',          label: 'Resume / CV',                                       rename: 'Resume',                 accept: '.pdf,.doc,.docx' },
    ],
  },
  academics: {
    label: 'Academic Certificates',
    folder: 'Academics',
    fields: [
      { id: 'degree_certificate',  label: 'Degree Certificate',    rename: 'Degree_Certificate',    accept: '.pdf,.jpg,.jpeg,.png' },
      { id: 'transfer_certificate',label: 'Transfer Certificate',  rename: 'Transfer_Certificate',  accept: '.pdf,.jpg,.jpeg,.png', optional: true },
      { id: 'migration_certificate',label:'Migration Certificate', rename: 'Migration_Certificate', accept: '.pdf,.jpg,.jpeg,.png', optional: true },
    ],
  },
  visa: {
    label: 'Visa Related Documents',
    folder: 'Visa',
    fields: [
      { id: 'i20_ds2019',       label: 'I-20 / DS-2019 (if received)',  rename: 'I20_DS2019',              accept: '.pdf', optional: true },
      { id: 'visa_appointment', label: 'Visa Appointment Letter',        rename: 'Visa_Appointment_Letter', accept: '.pdf', optional: true },
      { id: 'sevis_receipt',    label: 'SEVIS Fee Receipt',              rename: 'SEVIS_Fee_Receipt',       accept: '.pdf', optional: true },
      { id: 'offer_letter',     label: 'University Offer Letter',        rename: 'University_Offer_Letter', accept: '.pdf', optional: true },
      { id: 'financial_support',label: 'Financial Support Letter',       rename: 'Financial_Support_Letter',accept: '.pdf', optional: true },
    ],
  },
};

export const CO_APPLICANT_SCHEMA = {
  salaried: [
    { id: 'aadhar',        label: 'Aadhar Card',                               rename: 'Aadhar',               accept: '.pdf,.jpg,.jpeg,.png' },
    { id: 'pan',           label: 'PAN Card',                                  rename: 'PAN',                  accept: '.pdf,.jpg,.jpeg,.png' },
    { id: 'photo',         label: 'Passport Size Photo',                       rename: 'Photo',                accept: '.jpg,.jpeg,.png' },
    { id: 'salary_slip_3m',label: 'Last 3 Month Salary Slip',                  rename: 'Salary_Slip_3Months',  accept: '.pdf,.zip' },
    { id: 'bank_stmt_6m',  label: 'Last 6 Month Bank Statement (salary a/c)',  rename: 'Bank_Statement_6Months',accept: '.pdf' },
    { id: 'form16_itr',    label: 'Form 16 / ITR Acknowledgement (last 2 yrs)',rename: 'Form16_ITR_2Years',    accept: '.pdf,.zip' },
  ],
  selfEmployed: [
    { id: 'aadhar',        label: 'Aadhar Card',                   rename: 'Aadhar',               accept: '.pdf,.jpg,.jpeg,.png' },
    { id: 'pan',           label: 'PAN Card',                      rename: 'PAN',                  accept: '.pdf,.jpg,.jpeg,.png' },
    { id: 'photo',         label: 'Passport Size Photo',           rename: 'Photo',                accept: '.jpg,.jpeg,.png' },
    { id: 'bank_stmt_6m',  label: 'Last 6 Month Bank Statement',   rename: 'Bank_Statement_6Months',accept: '.pdf' },
    { id: 'itr_2years',    label: 'ITR (last 2 years)',            rename: 'ITR_2Years',           accept: '.pdf,.zip' },
    { id: 'business_proof',label: 'Business Proof / GST Certificate',rename: 'Business_Proof_GST', accept: '.pdf,.jpg,.jpeg,.png' },
  ],
  other: [
    { id: 'aadhar', label: 'Aadhar Card',         rename: 'Aadhar', accept: '.pdf,.jpg,.jpeg,.png' },
    { id: 'pan',    label: 'PAN Card',             rename: 'PAN',    accept: '.pdf,.jpg,.jpeg,.png' },
    { id: 'photo',  label: 'Passport Size Photo',  rename: 'Photo',  accept: '.jpg,.jpeg,.png' },
  ],
};
