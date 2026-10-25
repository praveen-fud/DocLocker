// Loan status as staff set it on the student record (Admin / Banker portals).
// A record without one is still "pending".
export const LOAN_STATUS = {
  pending:    { label: "Pending",    tone: "warning", title: "Application received", text: "Your advisor is reviewing your documents and details." },
  inprocess:  { label: "In Process", tone: "info",    title: "Being processed",      text: "Your application is being processed with a lender." },
  sanctioned: { label: "Sanctioned", tone: "success", title: "Loan sanctioned",      text: "A lender has sanctioned your education loan." },
  disbursed:  { label: "Disbursed",  tone: "success", title: "Loan disbursed",       text: "The lender has released the loan amount." },
  rejected:   { label: "Rejected",   tone: "error",   title: "Application rejected", text: "The lender did not approve this application. Your advisor can explain the next steps." },
  dropped:    { label: "Dropped",    tone: "muted",   title: "Application closed",   text: "This application was closed. Contact your advisor if you would like to continue." },
};

export const loanStatusKey = (student) => (LOAN_STATUS[student?.loanStatus] ? student.loanStatus : "pending");

// "12 Aug 2026"; "" when the record has no usable date.
export function formatAppliedOn(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";

export const firstName = (name = "") => name.trim().split(/\s+/)[0] || "there";
