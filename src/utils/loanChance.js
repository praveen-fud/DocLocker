// "Will this student get an education loan?" at a glance, for staff.
//
// A transparent, rules-based indicator from what the student filled in — not
// a lender's decision. Each factor is rated good / fair / risk / unknown with
// the reason in plain words, and the verdict is how those add up. The
// thresholds below follow common Indian education-loan practice; tune them
// here.

import { priorBanksOf, reasonLabel } from "./previousLenders.js";

export const RULES = {
  cibilGood: 750,          // co-applicant CIBIL at or above: good
  cibilFair: 700,          // at or above: fair; below cibilRisk: risk
  cibilRisk: 650,
  unsecuredLimit: 4000000, // ₹40L: above this most lenders want collateral
  academicsGood: 60,       // lowest of 10th / 12th / graduation, in %
  academicsRisk: 50,
  backlogsRisk: 5,         // more than this many backlogs: risk
};

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const yes = (v) => String(v || "").toLowerCase() === "yes";
const no = (v) => String(v || "").toLowerCase() === "no";
const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const lakh = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(n % 1e7 ? 2 : 0)} Cr` : `₹${(n / 1e5).toFixed(n % 1e5 ? 1 : 0)}L`);

// A score as a percentage: points and CGPA (0–10) are scaled the usual way.
function asPercent(score, type) {
  const n = num(score);
  if (n == null) return null;
  if (type === "points" || type === "cgpa" || (n <= 10 && type !== "percentage")) return Math.min(100, n * 9.5);
  if (type === "marks") return null; // marks out of an unknown total
  return n <= 100 ? n : null;
}

// Income proof among a co-applicant's uploads.
const INCOME_DOCS = /salary|itr|form_?16|bank_?statement|income|business|gst|profit/i;

function coApplicants(student) {
  const p = student.personalInfo || {};
  const count = Math.max(Number(student.coApplicants) || 0, ...Object.keys(p).filter((k) => /^co_info_\d+$/.test(k)).map((k) => Number(k.slice(8)) + 1), 0);
  return Array.from({ length: count }, (_, i) => {
    const info = p[`co_info_${i}`] || {};
    const uploads = (student.uploads || {})[`co_${i}`] || {};
    return {
      name: [info.firstName, info.lastName].filter(Boolean).join(" "),
      relation: info.relation || info.relationship || "",
      earning: info.financialStatus !== "non-financial",
      incomeProof: Object.keys(uploads).some((k) => INCOME_DOCS.test(k)),
    };
  });
}

export function assessLoanChance(student = {}) {
  const p = student.personalInfo || {};
  const factors = [];
  const add = (key, label, status, value, detail, weight = 1) => factors.push({ key, label, status, value, detail, weight });

  // 1. Credit — lenders lean on the co-applicant's CIBIL score.
  const scores = [["Father", p.fatherCibil], ["Mother", p.motherCibil], ["Guarantor", p.guarantorCibil]]
    .map(([who, v]) => [who, num(v)]).filter(([, v]) => v && v >= 300 && v <= 900);
  const best = scores.sort((a, b) => b[1] - a[1])[0];
  const own = num(p.studentCibil);
  if (best) {
    const [who, s] = best;
    const st = s >= RULES.cibilGood ? "good" : s >= RULES.cibilFair ? "fair" : s >= RULES.cibilRisk ? "fair" : "risk";
    add("credit", "Co-applicant credit", st, `${s} (${who})`,
      st === "good" ? "Comfortably above most lenders' cut-off."
        : st === "risk" ? `Below ${RULES.cibilRisk}: most lenders will decline.`
          : s >= RULES.cibilFair ? `Accepted by most lenders; ${RULES.cibilGood}+ gets better rates.`
            : `Some lenders accept ${RULES.cibilRisk}–${RULES.cibilFair - 1}, at higher rates.`, 2);
  } else if (own && own >= 300) {
    add("credit", "Co-applicant credit", "unknown", `Only the student's: ${own}`, "Ask for the co-applicant's CIBIL score — lenders decide on it.", 2);
  } else {
    add("credit", "Co-applicant credit", "unknown", "Not given", "Ask for the co-applicant's CIBIL score — lenders decide on it.", 2);
  }

  // 2. Repayment — an earning co-applicant with income proof.
  const cos = coApplicants(student);
  const earners = cos.filter((c) => c.earning);
  const proven = earners.filter((c) => c.incomeProof);
  const guarantorDocs = yes(p.guarantorDocsAvailable);
  if (!cos.length && !p.guarantorName) {
    add("income", "Earning co-applicant", "unknown", "None added", "Every lender needs an earning co-applicant.", 2);
  } else if (proven.length || (guarantorDocs && earners.length)) {
    add("income", "Earning co-applicant", "good", `${earners.length} earning${proven.length ? ", income proof in" : ""}`, "Repayment backing is in place.", 2);
  } else if (earners.length) {
    add("income", "Earning co-applicant", "fair", `${earners.length} earning, no income proof yet`, "Upload salary slips, ITR or bank statements.", 2);
  } else {
    add("income", "Earning co-applicant", "risk", "Co-applicants not earning", guarantorDocs ? "Only the guarantor's income backs the loan." : "Add an earning co-applicant or a guarantor with income documents.", 2);
  }

  // 3. Amount vs. security
  const amount = num(p.loanAmount);
  const house = yes(p.ownHouseStatus);
  if (amount == null) {
    add("security", "Amount & collateral", "unknown", house ? "Family owns a house" : "Amount not given", "Ask for the loan amount needed.");
  } else if (house) {
    add("security", "Amount & collateral", "good", `${lakh(amount)} · house available`, "A secured loan is possible, at better rates.");
  } else if (amount <= RULES.unsecuredLimit) {
    add("security", "Amount & collateral", "fair", `${lakh(amount)} · no collateral`, `Within the usual unsecured range (up to ${lakh(RULES.unsecuredLimit)}).`);
  } else {
    add("security", "Amount & collateral", "risk", `${lakh(amount)} · no collateral`, `Above ${lakh(RULES.unsecuredLimit)} most lenders want property as security.`);
  }

  // 4. Academics — the weakest of the three, and backlogs
  const pcts = [["10th", asPercent(p.pct10Score, p.pct10Type)], ["12th", asPercent(p.pct12Score, p.pct12Type)], ["Grad", asPercent(p.pctGradScore, p.pctGradType)]]
    .filter(([, v]) => v != null);
  const backlogs = yes(p.hasBacklogs) ? num(p.backlogCount) ?? 1 : 0;
  if (!pcts.length) {
    add("academics", "Academics", "unknown", "Scores not given", "Lenders check 10th, 12th and graduation scores.");
  } else {
    const [, low] = pcts.reduce((a, b) => (b[1] < a[1] ? b : a));
    let st = low >= RULES.academicsGood ? "good" : low >= RULES.academicsRisk ? "fair" : "risk";
    if (backlogs > RULES.backlogsRisk) st = "risk";
    else if (backlogs && st === "good") st = "fair";
    add("academics", "Academics", st, `${pcts.map(([k, v]) => `${k} ${Math.round(v)}%`).join(" · ")}${backlogs ? ` · ${backlogs} backlog${backlogs === 1 ? "" : "s"}` : ""}`,
      st === "good" ? "Meets most lenders' minimums." : st === "fair" ? "Acceptable to many lenders; some ask for 60%+." : "Below what most lenders accept.");
  }

  // 5. Admission
  if (yes(p.i20Received)) add("admission", "Admission letter", "good", yes(p.visaBooked) ? "Received · visa slot booked" : "Received", "Lenders can sanction against it.");
  else if (no(p.i20Received)) add("admission", "Admission letter", "fair", "Not received yet", "A sanction usually waits for the admission letter (I-20 / CAS).");
  else add("admission", "Admission letter", "unknown", "Not answered", "Ask whether the I-20 / CAS has arrived.");

  // 6. Lenders tried before
  const prior = priorBanksOf(p);
  if (p.priorBankApplied === "No") add("history", "Earlier applications", "good", "First application", "No earlier rejections.");
  else if (prior.length) {
    const credit = prior.some((x) => ["credit_score", "existing_loans", "co_applicant_income"].includes(x.reason));
    add("history", "Earlier applications", credit || prior.length > 2 ? "risk" : "fair",
      `${prior.length} declined: ${prior.map((x) => x.reason ? `${x.bank} (${reasonLabel(x.reason)})` : x.bank).join(", ")}`,
      credit ? "Turned down for credit or income — fix that before applying again." : "Avoid sending to the same lenders; address the reason first.");
  } else if (p.priorBankApplied === "Yes") add("history", "Earlier applications", "fair", "Applied before, lender not named", "Ask which lender and why it said no.");
  else add("history", "Earlier applications", "unknown", "Not answered", "Ask whether they applied anywhere before.");

  // Verdict
  const points = { good: 2, fair: 1, unknown: 0, risk: -2 };
  const max = factors.reduce((n, f) => n + 2 * f.weight, 0);
  const score = factors.reduce((n, f) => n + points[f.status] * f.weight, 0);
  const unknown = factors.filter((f) => f.status === "unknown");
  const risks = factors.filter((f) => f.status === "risk");
  const pct = Math.max(0, Math.round((score / max) * 100));
  let level;
  if (unknown.reduce((n, f) => n + f.weight, 0) >= 4) level = "unknown";
  else if (risks.some((f) => f.key === "credit" || f.key === "income") || pct < 40) level = "weak";
  else if (pct >= 70 && !risks.length) level = "strong";
  else level = "fair";

  const VERDICT = {
    strong: { title: "Strong chance", text: "The profile fits what most lenders look for." },
    fair: { title: "Fair chance", text: "Fundable with the right lender — fix the points below first." },
    weak: { title: "Weak chance", text: "Most lenders would decline as things stand." },
    unknown: { title: "Not enough information", text: "Key details are missing — get these before judging." },
  };
  // What would help most: one concrete step per weak or missing factor —
  // risks first, then missing details, heaviest first.
  const ACTION = {
    credit: {
      unknown: "Get the co-applicant's CIBIL score — lenders decide on it.",
      fair: "If another family member has a higher CIBIL score, add them as co-applicant.",
      risk: "Add a co-applicant with a CIBIL score of 700+, or improve the current score first.",
    },
    income: {
      unknown: "Add an earning co-applicant — every lender needs one.",
      fair: "Upload the co-applicant's salary slips, ITR or bank statements.",
      risk: "Add an earning co-applicant or a guarantor with income documents.",
    },
    security: {
      unknown: "Ask for the loan amount needed.",
      risk: `Offer property as collateral, or bring the amount within ${lakh(RULES.unsecuredLimit)}.`,
    },
    academics: {
      unknown: "Add the 10th, 12th and graduation scores.",
      risk: "Target lenders that accept lower scores, with a strong co-applicant.",
    },
    admission: {
      unknown: "Ask whether the I-20 / CAS has arrived.",
      fair: "Follow up on the admission letter (I-20 / CAS) — most sanctions wait for it.",
    },
    history: {
      unknown: "Ask whether they applied to a lender before.",
      fair: "Don't resend to lenders that declined; fix their reason first.",
      risk: "Fix why earlier lenders declined (credit or income) before applying again.",
    },
  };
  const order = { risk: 0, unknown: 1, fair: 2 };
  const next = factors.filter((f) => ACTION[f.key]?.[f.status])
    .sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight)
    .slice(0, 3).map((f) => ACTION[f.key][f.status]);

  return { level, ...VERDICT[level], pct, factors, next, good: factors.filter((f) => f.status === "good").length, amountText: amount != null ? inr(amount) : "" };
}
