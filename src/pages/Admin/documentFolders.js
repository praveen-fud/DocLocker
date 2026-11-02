// How student documents are sorted into folders by document type. Shared by
// Document Management (every student) and a student's own Documents tab
// (one student), so both put a file in the same place.
import { IdCard, GraduationCap, Award, Plane, Wallet, FolderOpen, BadgeCheck } from "lucide-react";
import { getApplicationId } from "../../utils/applicationId";

export const LETTER_STAGES = new Set(["sanctioned", "disbursed"]);

// Folders are matched on the upload field id (multi-file fields add "_1",
// "_2" …), so a co-applicant's PAN lands in the same "PAN Card" folder as
// the student's, tagged with who it belongs to.
//   required:  every student should have one (a Missing tab lists who doesn't)
//   expected:  only these students should have one (same Missing tab)
export const DOC_GROUPS = [
  {
    id: "loan", label: "Loan", icon: BadgeCheck, folders: [
      // From the lender, not the student: the recorded letter, or one the
      // server found in the student's file
      { key: "sanction_letters", label: "Sanction letters", ids: [], expected: (s) => LETTER_STAGES.has(s.loanStatus) },
    ],
  },
  {
    id: "identity", label: "Identity", icon: IdCard, folders: [
      { key: "passport", label: "Passport", ids: ["passport"], required: true },
      { key: "pan", label: "PAN Card", ids: ["pan"], required: true },
      { key: "aadhar", label: "Aadhaar Card", ids: ["aadhar", "aadhaar"], required: true },
      { key: "photo", label: "Photos", ids: ["photo"] },
      { key: "signature", label: "Signatures", ids: ["signature"] },
      { key: "visa_history", label: "Visa history", ids: ["Visa History"] },
    ],
  },
  {
    id: "academics", label: "Academics", icon: GraduationCap, folders: [
      { key: "marksheet_10", label: "10th Marksheet", ids: ["marksheet_10"], required: true },
      { key: "marksheet_12", label: "12th Marksheet", ids: ["marksheet_12"], required: true },
      { key: "diploma", label: "Diploma", ids: ["Diploma_marksheet"] },
      { key: "graduation", label: "Graduation marksheets", ids: ["graduation"] },
      { key: "degree", label: "Degree certificate", ids: ["degree_certificate"] },
      { key: "cmm", label: "Consolidated marksheet", ids: ["CMM"] },
      { key: "moi", label: "Medium of instruction", ids: ["MOI"] },
      { key: "lor", label: "Recommendation letters", ids: ["LOR"] },
      { key: "od", label: "OD certificate", ids: ["OD"] },
      { key: "pc", label: "Professional certificates", ids: ["PC"] },
    ],
  },
  {
    id: "tests", label: "Test scores", icon: Award, folders: [
      { key: "gre", label: "GRE", ids: ["gre_scorecard"] },
      { key: "gmat", label: "GMAT", ids: ["gmat_scorecard"] },
      { key: "ielts", label: "IELTS", ids: ["ielts_scorecard"] },
      { key: "toefl", label: "TOEFL", ids: ["toefl_scorecard"] },
      { key: "pte", label: "PTE", ids: ["pte_scorecard"] },
      { key: "duolingo", label: "Duolingo", ids: ["duolingo_scorecard"] },
    ],
  },
  {
    id: "admission", label: "Admission & visa", icon: Plane, folders: [
      { key: "admission", label: "I-20 / Admission letters", ids: ["i20_admission"] },
      { key: "visa_appointment", label: "Visa appointments", ids: ["visa_appointment"] },
    ],
  },
  {
    id: "financial", label: "Financial", icon: Wallet, folders: [
      { key: "cibil", label: "CIBIL reports", ids: ["cibil_report"] },
      { key: "salary", label: "Salary slips", ids: ["salary_slip_applicant", "salary_slip_3m"] },
      { key: "bank_statements", label: "Bank statements", ids: ["bank_stmt_6m"] },
      { key: "itr", label: "ITR / Form 16", ids: ["form16_itr_y1", "form16_itr_y2", "form16_itr_y3", "itr_y1", "itr_y2", "itr_y3"] },
      { key: "business", label: "Business proof / GST", ids: ["business_proof"] },
    ],
  },
  {
    id: "other", label: "Generated & other", icon: FolderOpen, folders: [
      { key: "application_form", label: "Application forms", ids: [] },
      { key: "eligibility", label: "Eligibility reports", ids: [] },
      { key: "resume", label: "Resumes", ids: ["resume"] },
      { key: "other", label: "Other documents", ids: [] },
    ],
  },
];

export const DOC_FOLDERS = DOC_GROUPS.flatMap((g) => g.folders.map((f) => ({ ...f, group: g.id })));
export const FOLDER_BY_ID = new Map(DOC_FOLDERS.flatMap((f) => f.ids.map((id) => [id, f.key])));
export const FOLDER_BY_KEY = new Map(DOC_FOLDERS.map((f) => [f.key, f]));
export const GROUP_OF_FOLDER = new Map(DOC_FOLDERS.map((f) => [f.key, f.group]));

export const studentName = (s) => (s.name || "").split("__")[0] || "Unnamed";

// "passport_1" → "passport"; only strips a numeric suffix
export function baseFieldId(fieldId) {
  const m = /^(.*)_(\d+)$/.exec(fieldId);
  return m && FOLDER_BY_ID.has(m[1]) ? m[1] : fieldId;
}

// Which folder an upload field's files go in
export const folderOfField = (fieldId) => FOLDER_BY_ID.get(baseFieldId(fieldId)) || "other";

export function ownerOf(section) {
  const m = /^co_(\d+)$/.exec(section);
  return m ? { type: "co", label: `Co-applicant ${Number(m[1]) + 1}` } : { type: "student", label: "Student" };
}

// Flatten every student's uploads into one list of documents.
export function collectDocuments(students) {
  const docs = [];
  for (const s of students) {
    const base = { student: s, studentName: studentName(s), appId: getApplicationId(s) };
    for (const [section, fields] of Object.entries(s.uploads || {})) {
      if (!fields || typeof fields !== "object") continue;
      for (const [fieldId, info] of Object.entries(fields)) {
        const id = info?.id || info?.fileId;
        if (!id) continue;
        const owner = ownerOf(section);
        docs.push({
          ...base, id, name: info.name || info.fileName || fieldId,
          folder: folderOfField(fieldId),
          owner: owner.label, ownerType: owner.type,
        });
      }
    }
    if (s.sanctionLetter?.fileId) docs.push({ ...base, id: s.sanctionLetter.fileId, name: s.sanctionLetter.name || "Sanction_Letter.pdf", folder: "sanction_letters", owner: "Lender", ownerType: "lender" });
    // The student list sends these as { fileId, … }
    const summaryId = s.summaryPdf?.fileId || s.summaryPdf?.id;
    const eligibilityId = s.eligibilityPdf?.fileId || s.eligibilityPdf?.id;
    if (summaryId) docs.push({ ...base, id: summaryId, name: "Application_Form.pdf", folder: "application_form", owner: "Generated", ownerType: "generated" });
    if (eligibilityId) docs.push({ ...base, id: eligibilityId, name: "Eligibility_Report.pdf", folder: "eligibility", owner: "Generated", ownerType: "generated" });
  }
  return docs.sort((a, b) => a.studentName.localeCompare(b.studentName) || a.owner.localeCompare(b.owner));
}
