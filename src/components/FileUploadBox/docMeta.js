// Document-slot helpers shared by the upload cards and the student dashboard,
// so both always agree on a document's icon, title and read status.
import {
  FileText,
  ContactRound,
  CreditCard,
  Fingerprint,
  Image as ImageIcon,
  PenLine,
  Plane,
  Gauge,
  FileUser,
  ReceiptText,
  FileSpreadsheet,
  GraduationCap,
  Award,
  Languages,
  Mail,
  FileBadge,
  BadgeCheck,
  ClipboardCheck,
  School,
  CalendarCheck,
  Landmark,
  ScrollText,
  Building2,
  FolderOpen,
} from "lucide-react";

const DOC_ICONS = {
  passport: ContactRound,
  pan: CreditCard,
  aadhar: Fingerprint,
  photo: ImageIcon,
  signature: PenLine,
  "Visa History": Plane,
  cibil_report: Gauge,
  resume: FileUser,
  salary_slip_applicant: ReceiptText,
  salary_slip_3m: ReceiptText,
  bank_stmt_6m: Landmark,
  business_proof: Building2,
  marksheet_10: FileSpreadsheet,
  marksheet_12: FileSpreadsheet,
  Diploma_marksheet: FileSpreadsheet,
  CMM: FileSpreadsheet,
  graduation: GraduationCap,
  degree_certificate: Award,
  MOI: Languages,
  LOR: Mail,
  OD: FileBadge,
  PC: BadgeCheck,
  i20_admission: School,
  visa_appointment: CalendarCheck,
};

export function iconFor(id = "") {
  if (DOC_ICONS[id]) return DOC_ICONS[id];
  if (/^(itr_|form16)/.test(id)) return ScrollText;
  if (/scorecard$/.test(id)) return ClipboardCheck;
  if (id.startsWith("custom_")) return FolderOpen;
  return FileText;
}

// "GRE Score Report (optional — auto-fills GRE score)" → title + a separate
// auto-fill note, so the card doesn't repeat "optional" next to its chip.
export function splitLabel(label = "") {
  const m = /\s*\((?:optional\s*[—-]\s*)?(auto-fills[^)]*)\)\s*$/i.exec(label);
  if (!m) return { title: label, note: "" };
  return { title: label.slice(0, m.index).trim(), note: m[1].charAt(0).toUpperCase() + m[1].slice(1) };
}

// Turns a stored extraction into the status shown on the card, so a
// reloaded page still says whether the document was read.
export function statusFromExtraction(extraction) {
  if (!extraction) return null;
  if (["certificate", "ssc"].includes(extraction.docType) && extraction.checks?.supported === false) return "unsupported";
  const s = extraction.review?.status;
  if (s === "manual_required") return "manual";
  if (s === "review_recommended") return "review";
  return "read";
}

// Stable DOM id for a document's upload card ("doc-co_0-aadhar"), used to
// jump to it from the dashboard.
export const docAnchorId = (sectionKey, fieldId) =>
  `doc-${sectionKey}-${String(fieldId).replace(/[^A-Za-z0-9_-]+/g, "-")}`;
