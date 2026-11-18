// "Applied to any bank before?" on the portal's Background page: every lender
// that turned the student down, and why. Stored on personalInfo:
//   priorBankApplied: "Yes" | "No"
//   priorBanks: [{ bank, reason, note, custom? }]
// Older records hold a single lender (priorBankName / priorBankNameCustom);
// priorBanksOf() reads both, so every screen shows either kind.

// `hint` explains each reason on hover / focus / tap.
export const REJECTION_REASONS = [
  { value: "credit_score", label: "Low credit score", hint: "The co-applicant's CIBIL score was below the lender's cut-off, or there was no credit history." },
  { value: "co_applicant_income", label: "Co-applicant income", hint: "The co-applicant's income wasn't enough to cover the monthly EMI the lender expects." },
  { value: "collateral", label: "Collateral not accepted", hint: "The property offered as security wasn't accepted, or the lender needed security and none was offered." },
  { value: "university_course", label: "University or course", hint: "The lender doesn't fund this university, country or course." },
  { value: "academics", label: "Academic scores", hint: "Marks, study gaps or test scores (GRE, IELTS, TOEFL) were below what the lender needs." },
  { value: "documents", label: "Documents", hint: "Papers were missing, or names and dates didn't match across documents." },
  { value: "existing_loans", label: "Existing loans or defaults", hint: "Current EMIs were too high, or there were missed payments on earlier loans or cards." },
  { value: "loan_amount", label: "Amount too high", hint: "The amount asked for was more than the lender would give for this profile." },
  { value: "other", label: "Other reason", hint: "Not on this list? Choose this and write what the lender said." },
];

export const reasonLabel = (value) => REJECTION_REASONS.find((r) => r.value === value)?.label || "";
export const reasonHint = (value) => REJECTION_REASONS.find((r) => r.value === value)?.hint || "";

// The lenders tried before, as [{ bank, reason, note }] (empty when "No").
export function priorBanksOf(p = {}) {
  if (p.priorBankApplied !== "Yes") return [];
  if (Array.isArray(p.priorBanks)) {
    return p.priorBanks
      .map((e) => ({ bank: String(e?.bank || "").trim(), reason: e?.reason || "", note: String(e?.note || "").trim() }))
      .filter((e) => e.bank);
  }
  const legacy = p.priorBankName === "Others" ? p.priorBankNameCustom : p.priorBankName;
  return legacy ? [{ bank: String(legacy).trim(), reason: "", note: "" }] : [];
}

// One line per lender, e.g. "Avanse Financial Services (Low credit score: CIBIL 640)".
export function priorBanksText(p = {}) {
  return priorBanksOf(p).map((e) => {
    const why = [reasonLabel(e.reason), e.note].filter(Boolean).join(": ");
    return why ? `${e.bank} (${why})` : e.bank;
  }).join("; ");
}

// What's still to answer, per entry: null when complete.
export function entryProblem(e) {
  if (e.custom && String(e.bank || "").trim().length < 2) return "Enter the lender’s name";
  if (!e.reason) return "Choose why they said no";
  if (e.reason === "other" && String(e.note || "").trim().length < 3) return "Write what the lender said";
  return null;
}

// For the "still missing" list: true when "Yes" but the answer is incomplete.
export function priorBanksIncomplete(p = {}) {
  if (p.priorBankApplied !== "Yes") return false;
  if (!Array.isArray(p.priorBanks)) return !priorBanksOf(p).length;
  return p.priorBanks.length === 0 || p.priorBanks.some((e) => entryProblem(e));
}
