import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  UserPlus,
  Trash2,
  X,
  ExternalLink,
  FileText,
  User,
  UsersIcon,
  ChevronDown,
  ChevronLeft,
  Shield,
  Building2,
  Settings,
  KeyRound,
  UserCheck,
  Plus,
  Eye,
  EyeOff,
  BarChart3,
  CreditCard,
  GraduationCap,
  Banknote,
  Home,
  Briefcase,
  Star,
  AlertTriangle,
  XCircle,
  Send,
  Upload,
  ScanText,
  ShieldCheck,
  Pencil,
  LayoutGrid,
  History,
  LogOut,
  Menu,
  ArrowUpRight,
  Filter,
  Landmark,
  LogIn,
  ChevronRight,
  Bell,
  MoreVertical,
  Download,
  Hourglass,
  Wallet,
  MinusCircle,
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { getAllStudentsFromDrive, deleteStudent, updateLoanStatus, uploadSanctionLetter, recoverMetaFromPdf, restoreMeta, buildFolderKey, getAuditLog, getDownloadAllUrl, getFileProxyUrl } from "../../utils/driveApi";
import { DOCUMENT_SCHEMA, CO_APPLICANT_SCHEMA, getTotalRequiredFields } from "../../context/schemas";
import { BANK_OPTIONS, getBankLogo } from "../../utils/bankOptions";
import logoImg from "../../assets/logo.jpeg";
import heroImg from "../../assets/bg.png";
import "./Admin.css";

/* ─── Helpers ─────────────────────────────────────────────────── */

function getTotalUploads(s) {
  if (!s.uploads) return 0;
  return Object.values(s.uploads).reduce((acc, section) => {
    if (!section || typeof section !== "object") return acc;
    return acc + Object.values(section).filter(Boolean).length;
  }, 0);
}

function getOverallProgress(s) {
  const total = getTotalUploads(s);
  const required = getTotalRequiredFields(s.coApplicants || 1, s.personalInfo || {});
  return Math.min(100, Math.round((total / required) * 100));
}

function getAvatarVariant(name) {
  const variants = ["a", "b", "c", "d", "e"];
  const code = (name || "?").charCodeAt(0);
  return variants[code % variants.length];
}

function getAllUploadedFiles(uploads) {
  const files = [];
  if (!uploads) return files;
  Object.entries(uploads).forEach(([section, sectionFiles]) => {
    if (!sectionFiles || typeof sectionFiles !== "object") return;
    Object.entries(sectionFiles).forEach(([fieldId, fileInfo]) => {
      if (!fileInfo) return; // null = removed file slot
      files.push({
        section,
        fieldId,
        name: fileInfo.name || fileInfo.fileName || fieldId,
        webViewLink: fileInfo.webViewLink,
        customName: fileInfo.customName,
      });
    });
  });
  return files;
}

function getMissingDocs(s) {
  const uploads = s.uploads || {};
  const missing = [];

  const applicantUploads = uploads.applicant || {};
  DOCUMENT_SCHEMA.applicant.fields
    .filter((f) => !f.optional)
    .forEach((f) => {
      if (!applicantUploads[f.id]) {
        missing.push({ section: "GOVT ID", label: f.label });
      }
    });

  const academicUploads = uploads.academics || {};
  DOCUMENT_SCHEMA.academics.fields
    .filter((f) => !f.optional)
    .forEach((f) => {
      if (!academicUploads[f.id]) {
        missing.push({ section: "Academics", label: f.label });
      }
    });

  const coCount = s.coApplicants || 0;
  for (let i = 0; i < coCount; i++) {
    const coUploads = uploads[`co_${i}`] || {};
    const empType = s.personalInfo?.[`co_info_${i}`]?.empType || "salaried";
    const coFields = CO_APPLICANT_SCHEMA[empType] || CO_APPLICANT_SCHEMA.other;
    const coInfoForName = s.personalInfo?.[`co_info_${i}`] || {};
    const coName =
      [coInfoForName.firstName, coInfoForName.lastName].filter(Boolean).join(" ") ||
      coInfoForName.name ||
      `Co-Applicant ${i + 1}`;

    coFields.forEach((f) => {
      if (!coUploads[f.id]) {
        missing.push({ section: coName, label: f.label });
      }
    });
  }

  return missing;
}

function getProgressClass(p) {
  if (p === 0) return "prog-0";
  if (p === 100) return "prog-done";
  return "prog-mid";
}

/* ─── Score Classification Helpers ────────────────────────────── */

// Generic: returns "cibil-excellent" | "cibil-good" | "cibil-fair" | "cibil-poor" | "cibil-unknown"
function getScoreClass(value, { excellent, good, fair, min = 0 }) {
  const n = parseFloat(value);
  if (!n || isNaN(n) || n < min) return "cibil-unknown";
  if (n >= excellent) return "cibil-excellent";
  if (n >= good)      return "cibil-good";
  if (n >= fair)      return "cibil-fair";
  return "cibil-poor";
}

function getScoreLabel(value, { excellent, good, fair, min = 0 }, labels = ["Low","Average","Good","Excellent"]) {
  const n = parseFloat(value);
  if (!n || isNaN(n) || n < min) return "N/A";
  if (n >= excellent) return labels[3];
  if (n >= good)      return labels[2];
  if (n >= fair)      return labels[1];
  return labels[0];
}

// Threshold presets
const CIBIL_T    = { excellent: 750, good: 700, fair: 650, min: 300 };
const PCT_T      = { excellent: 85,  good: 75,  fair: 60,  min: 0   };
const CGPA_T     = { excellent: 8.5, good: 7.5, fair: 6.0, min: 0   };
const GRE_T      = { excellent: 325, good: 310, fair: 290, min: 260  };
const IELTS_T    = { excellent: 8.0, good: 7.0, fair: 6.0, min: 0   };
const TOEFL_T    = { excellent: 110, good: 100, fair: 80,  min: 0   };
const DUOLINGO_T = { excellent: 131, good: 110, fair: 90,  min: 10  };
const GMAT_T     = { excellent: 700, good: 600, fair: 500, min: 200 };
const PTE_T      = { excellent: 79,  good: 65,  fair: 50,  min: 10  };

const ACAD_LABELS = ["Low", "Average", "Good", "Excellent"];
const CIBIL_LABELS = ["Poor", "Fair", "Good", "Excellent"];

/* ─── Loan Eligibility Engine ──────────────────────────────────── */

function scoreAcademics(p) {
  // Returns 0–3 representing overall academic strength
  let points = 0, count = 0;
  const rate = (val, thresholds) => {
    const cls = getScoreClass(val, thresholds);
    if (cls === "cibil-excellent") return 3;
    if (cls === "cibil-good")      return 2;
    if (cls === "cibil-fair")      return 1;
    if (cls === "cibil-poor")      return 0;
    return null;
  };
  // "marks" totals vary by board (out of 500/600/etc) and aren't comparable on a
  // fixed scale, so they're excluded from the strength score. "points" (0-10) maps
  // onto the same scale as CGPA.
  [
    p.pct10Type === "marks" ? null : rate(p.pct10Score, p.pct10Type === "points" ? CGPA_T : PCT_T),
    p.pct12Type === "marks" ? null : rate(p.pct12Score, p.pct12Type === "points" ? CGPA_T : PCT_T),
    rate(p.pctGradScore, p.pctGradType === "cgpa" ? CGPA_T : PCT_T),
  ].forEach((v) => { if (v !== null) { points += v; count++; } });
  return count > 0 ? points / count : null; // null = no data
}

function assessLoanEligibility(student) {
  const p = student.personalInfo || {};
  const progress = getOverallProgress(student);

  // Collect CIBIL scores
  const scores = [];
  if (p.studentCibil)  scores.push({ label: "Student",   score: parseInt(p.studentCibil),  role: "student"    });
  if (p.fatherCibil)   scores.push({ label: "Father",    score: parseInt(p.fatherCibil),   role: "co"         });
  if (p.motherCibil)   scores.push({ label: "Mother",    score: parseInt(p.motherCibil),   role: "co"         });
  if (p.guarantorCibil)scores.push({ label: "Guarantor", score: parseInt(p.guarantorCibil),role: "guarantor"  });

  const coCount = student.coApplicants || 0;
  for (let i = 0; i < coCount; i++) {
    const co = p[`co_info_${i}`] || {};
    const coLabel = [co.firstName, co.lastName].filter(Boolean).join(" ") || co.name || `Co-App ${i + 1}`;
    if (co.cibil) scores.push({ label: coLabel, score: parseInt(co.cibil), role: "co" });
  }

  const validScores = scores.filter((s) => s.score >= 300 && s.score <= 900);
  const bestFinancial = validScores
    .filter((s) => s.role !== "student")
    .reduce((best, s) => (s.score > (best?.score || 0) ? s : best), null);

  const bestScore = bestFinancial?.score || (validScores[0]?.score) || 0;
  const acadScore = scoreAcademics(p); // 0–3 or null

  // Verdicts
  const docGood   = progress >= 70;
  const scoreGood = bestScore >= 700;
  const scoreFair = bestScore >= 650 && bestScore < 700;
  const acadGood  = acadScore !== null && acadScore >= 2;    // Good or Excellent average
  const acadFair  = acadScore !== null && acadScore >= 1;    // at least Average

  let verdict, verdictClass, verdictReasons;

  if (scoreGood && docGood && (acadScore === null || acadGood)) {
    verdict = "Likely Eligible";
    verdictClass = "verdict-eligible";
    verdictReasons = [
      "Strong CIBIL score",
      docGood  ? "Documents ready"         : null,
      acadGood ? "Good academic profile"   : null,
    ].filter(Boolean);
  } else if (
    scoreFair ||
    (scoreGood && !docGood) ||
    (scoreGood && acadScore !== null && !acadGood) ||
    (!scoreGood && docGood && bestScore >= 650)
  ) {
    verdict = "Needs Review";
    verdictClass = "verdict-review";
    verdictReasons = [
      !scoreGood ? "CIBIL score below 700"        : "CIBIL acceptable",
      !docGood   ? `Docs ${progress}% complete`   : "Documents ready",
      acadScore !== null && !acadFair ? "Weak academic profile" :
      acadScore !== null && !acadGood ? "Average academic profile" : null,
    ].filter(Boolean);
  } else if (bestScore > 0 && bestScore < 650) {
    verdict = "High Risk";
    verdictClass = "verdict-risky";
    verdictReasons = [
      `CIBIL ${bestScore} below minimum (650)`,
      !docGood ? `Docs ${progress}% complete` : null,
      acadScore !== null && !acadFair ? "Weak academic profile" : null,
    ].filter(Boolean);
  } else {
    verdict = "Incomplete Data";
    verdictClass = "verdict-incomplete";
    verdictReasons = [
      "CIBIL scores not entered",
      !docGood ? `Documents ${progress}% complete` : null,
    ].filter(Boolean);
  }

  return { scores: validScores, bestFinancial, acadScore, progress, verdict, verdictClass, verdictReasons };
}

/* ─── Sub-components ───────────────────────────────────────────── */

// Connected banks & lenders — a continuously auto-scrolling logo strip.
// The tile list is duplicated once so the track can loop seamlessly at
// -50%; hovering (or `prefers-reduced-motion`) pauses the motion.
function PartnerBanksShowcase() {
  const banks = BANK_OPTIONS.filter((b) => b.value !== "Others");
  if (banks.length === 0) return null;

  return (
    <div className="banks-card animate-fade-in">
      <div className="banks-card-head">
        <p className="banks-card-title"><Landmark size={15} /> Connected Banks &amp; Lenders</p>
      </div>
      <div className="banks-tile-row">
        <div className="banks-tile-track">
          {banks.concat(banks).map((b, i) => (
            <div className="banks-tile" key={`${b.value}-${i}`} title={b.label}>
              <img src={b.logo} alt={b.label} loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// A percentage-of-total trend line, not a fabricated "vs last month" figure
// we have no historical snapshots to actually compute. Returns null (renders
// nothing) rather than a misleading "0%" when the total itself is zero.
function shareOfTotal(value, total) {
  if (!total) return null;
  return Math.round((value / total) * 100);
}

// One ring in the Document Progress card. Total Students reads as the
// complete circle (it IS the whole); every other ring is that stat's real
// share of the total, so the fill itself is honest, not decorative.
function StatRing({ pct, color, value, label, active, onClick }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <button type="button" className={`stat-ring tone-${color}${active ? " stat-ring--active" : ""}`} onClick={onClick}>
      <svg viewBox="0 0 36 36" className="stat-ring-svg">
        <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" className="stat-ring-track" />
        <circle
          cx="18" cy="18" r="15.9" fill="none" strokeWidth="3"
          strokeDasharray={`${clamped} ${100 - clamped}`}
          strokeDashoffset="25"
          className="stat-ring-fill"
        />
      </svg>
      <span className="stat-ring-center">
        <span className="stat-ring-value">{value}</span>
        <span className="stat-ring-label">{label}</span>
      </span>
    </button>
  );
}

function StatsPanel({ stats, loanStats, filter, setFilter, loanStatusFilter, setLoanStatusFilter }) {
  const docRings = [
    { key: "all", label: "Total Students", value: stats.total, color: "blue", pct: 100 },
    { key: "complete", label: "Completed", value: stats.complete, color: "green", pct: shareOfTotal(stats.complete, stats.total) || 0 },
    { key: "progress", label: "In Progress", value: stats.inProgress, color: "amber", pct: shareOfTotal(stats.inProgress, stats.total) || 0 },
    { key: "notStarted", label: "Not Started", value: stats.notStarted, color: "red", pct: shareOfTotal(stats.notStarted, stats.total) || 0 },
  ];
  const loanTotal = loanStats.pending + loanStats.inprocess + loanStats.sanctioned + loanStats.disbursed + loanStats.rejected + loanStats.dropped;
  const loanCards = [
    { key: "pending",    label: "Pending",    value: loanStats.pending,    color: "slate",   icon: <Hourglass size={15} /> },
    { key: "inprocess",  label: "In Process", value: loanStats.inprocess,  color: "orange",  icon: <RefreshCw size={15} /> },
    { key: "sanctioned", label: "Sanctioned", value: loanStats.sanctioned, color: "teal",    icon: <CheckCircle size={15} /> },
    { key: "disbursed",  label: "Disbursed",  value: loanStats.disbursed,  color: "emerald", icon: <Wallet size={15} /> },
    { key: "rejected",   label: "Rejected",   value: loanStats.rejected,   color: "rose",    icon: <XCircle size={15} /> },
    { key: "dropped",    label: "Dropped",    value: loanStats.dropped,    color: "violet",  icon: <MinusCircle size={15} /> },
  ].map((c) => ({ ...c, pct: shareOfTotal(c.value, loanTotal) }));

  return (
    <div className="stats-row animate-fade-in">
      <div className="stats-card">
        <div className="stats-card-head">
          <p className="stats-card-title"><BarChart3 size={15} /> Document Progress</p>
        </div>
        <div className="ring-grid">
          {docRings.map(({ key, label, value, color, pct }) => (
            <StatRing
              key={key}
              color={color}
              value={value}
              label={label}
              pct={pct}
              active={filter === key}
              onClick={() => setFilter(filter === key && key !== "all" ? "all" : key)}
            />
          ))}
        </div>
      </div>

      <div className="stats-card">
        <div className="stats-card-head">
          <p className="stats-card-title"><Banknote size={15} /> Loan Application Status</p>
        </div>
        <div className="loan-stat-row">
          {loanCards.map(({ key, label, value, color, icon, pct }) => (
            <button key={key} type="button"
              className={`loan-stat-item tone-${color}${loanStatusFilter === key ? " active" : ""}`}
              onClick={() => setLoanStatusFilter(loanStatusFilter === key ? "all" : key)}>
              <span className="loan-stat-top">
                <span className="loan-stat-icon">{icon}</span>
                {pct !== null && <span className="loan-stat-pct">{pct}%</span>}
              </span>
              <span className="loan-stat-value">{value}</span>
              <span className="loan-stat-label">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ─── Loan Status ──────────────────────────────────────────────── */

const LOAN_STATUS_CONFIG = {
  pending:    { label: "Pending",     cls: "loan-pending" },
  inprocess:  { label: "In Process",  cls: "loan-inprocess" },
  sanctioned: { label: "Sanctioned",  cls: "loan-sanctioned" },
  disbursed:  { label: "Disbursed",   cls: "loan-disbursed" },
  rejected:   { label: "Rejected",    cls: "loan-rejected" },
  dropped:    { label: "Dropped",     cls: "loan-dropped" },
};

// Statuses that must carry an explanatory remark (mirrors backend validation)
const REMARK_STATUSES = ["rejected", "dropped"];
const REMARK_LABELS = {
  rejected: { label: "Rejection Remark", placeholder: "Describe the reason for rejection…" },
  dropped:  { label: "Drop Remark",      placeholder: "Describe why the application was dropped…" },
};

// Figures captured once a loan is marked disbursed (mirrors backend
// DISBURSEMENT_FIELDS validation in routes/bankerAccess.js).
const DISBURSEMENT_FIELDS = [
  { key: "loanAmount",     label: "Loan Amount",      unit: "₹",      placeholder: "e.g. 1200000" },
  { key: "tenureMonths",   label: "Tenure",            unit: "months", placeholder: "e.g. 84" },
  { key: "interestRate",   label: "Interest Rate",     unit: "%",      placeholder: "e.g. 10.5" },
  { key: "processingFee",  label: "Processing Fee",    unit: "₹",      placeholder: "e.g. 15000" },
  { key: "insuranceAmount", label: "Insurance Amount", unit: "₹",      placeholder: "e.g. 8000" },
];
const EMPTY_DISBURSEMENT = { loanAmount: "", tenureMonths: "", interestRate: "", processingFee: "", insuranceAmount: "" };

function LoanStatusBadge({ status }) {
  const cfg = LOAN_STATUS_CONFIG[status || "pending"] || LOAN_STATUS_CONFIG.pending;
  return <span className={`loan-badge ${cfg.cls}`}>{cfg.label}</span>;
}

function LoanStatusModal({ student, onClose, onUpdated }) {
  const [status, setStatus] = useState(student.loanStatus || "pending");
  const [remark, setRemark] = useState(student.loanRemark || "");
  const [sanctionFile, setSanctionFile] = useState(null);
  const [disbursement, setDisbursement] = useState({
    ...EMPTY_DISBURSEMENT,
    ...(student.loanDisbursement || {}),
  });
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (REMARK_STATUSES.includes(status) && !remark.trim()) {
      setErr(`A remark is required when the loan is ${status === "rejected" ? "rejected" : "dropped"}.`);
      return;
    }
    let disbursementPayload = null;
    if (status === "disbursed") {
      for (const { key, label } of DISBURSEMENT_FIELDS) {
        const n = Number(disbursement[key]);
        if (disbursement[key] === "" || Number.isNaN(n) || n < 0) {
          setErr(`Enter a valid ${label.toLowerCase()} to mark the loan as disbursed.`);
          return;
        }
      }
      disbursementPayload = Object.fromEntries(
        DISBURSEMENT_FIELDS.map(({ key }) => [key, Number(disbursement[key])]),
      );
    }
    setLoading(true);
    setErr("");
    try {
      setLoadingMsg("Updating status…");
      await updateLoanStatus(student.name, student.email || student.phone || "", status, remark, disbursementPayload);
      if (status === "sanctioned" && sanctionFile) {
        setLoadingMsg("Uploading sanction letter…");
        await uploadSanctionLetter(student.name, student.email || student.phone || "", sanctionFile);
      }
      onUpdated(student.name, status, remark, disbursementPayload);
      onClose();
    } catch (e2) {
      setErr(e2.message || "Failed to update loan status.");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !loading && onClose()}>
      <div className="loan-status-modal animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="lsm-header">
          <div className="lsm-icon"><Banknote size={22} /></div>
          <div className="lsm-title-block">
            <h3 className="lsm-title">Update Loan Status</h3>
            <p className="lsm-sub">{student.name}</p>
          </div>
          <button className="lsm-close" onClick={onClose} disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="lsm-body">
          <div className="lsm-status-grid">
            {Object.entries(LOAN_STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key} type="button"
                className={`lsm-option ${cfg.cls}${status === key ? " selected" : ""}`}
                onClick={() => { setStatus(key); if (!REMARK_STATUSES.includes(key)) setRemark(""); if (key !== "sanctioned") setSanctionFile(null); }}
              >
                <span className="lsm-option-dot" />
                <span>{cfg.label}</span>
                {status === key && <CheckCircle size={14} className="lsm-check" />}
              </button>
            ))}
          </div>

          {REMARK_STATUSES.includes(status) && (
            <div className="lsm-remark-wrap">
              <label className="lsm-remark-label">
                {REMARK_LABELS[status].label} <span className="required-star">*</span>
              </label>
              <textarea
                className="lsm-remark-input"
                rows={3}
                placeholder={REMARK_LABELS[status].placeholder}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
          )}

          {status === "sanctioned" && (
            <div className="lsm-upload-wrap">
              <label className="lsm-remark-label">
                Sanction Letter <span className="lsm-optional">— optional</span>
              </label>
              <label className={`lsm-file-drop${sanctionFile ? " has-file" : ""}`}>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: "none" }}
                  onChange={(e) => setSanctionFile(e.target.files[0] || null)}
                />
                {sanctionFile ? (
                  <div className="lsm-file-selected">
                    <FileText size={15} />
                    <span className="lsm-file-name">{sanctionFile.name}</span>
                    <button
                      type="button"
                      className="lsm-file-remove"
                      onClick={(e) => { e.preventDefault(); setSanctionFile(null); }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="lsm-file-placeholder">
                    <Upload size={16} />
                    <span>Click to upload PDF or image</span>
                  </div>
                )}
              </label>
            </div>
          )}

          {status === "disbursed" && (
            <div className="lsm-disbursement-wrap">
              <label className="lsm-remark-label">
                Disbursement Details <span className="required-star">*</span>
              </label>
              <div className="lsm-disbursement-grid">
                {DISBURSEMENT_FIELDS.map(({ key, label, unit, placeholder }) => (
                  <div className="lsm-disbursement-field" key={key}>
                    <label className="lsm-disbursement-label">{label}</label>
                    <div className="lsm-disbursement-input-wrap">
                      <span className="lsm-disbursement-unit">{unit}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="lsm-disbursement-input"
                        placeholder={placeholder}
                        value={disbursement[key]}
                        onChange={(e) => setDisbursement((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {student.loanRemark && REMARK_STATUSES.includes(student.loanStatus) && !REMARK_STATUSES.includes(status) && (
            <p className="lsm-prev-remark">Previous remark: <em>{student.loanRemark}</em></p>
          )}

          {err && <p className="lsm-error">{err}</p>}

          <div className="lsm-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><RefreshCw size={13} className="spin" /> {loadingMsg}</> : "Update Status"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Report Modal ─────────────────────────────────────────────── */

// Generic scored bar — reuses cibil-* color classes for consistency
function ScoreBar({ label, rawValue, displayValue, thresholds, rangeMin, rangeMax, labels = ACAD_LABELS }) {
  const n = parseFloat(rawValue);
  if (!rawValue && rawValue !== 0) return null;
  const cls = getScoreClass(n, thresholds);
  const lbl = getScoreLabel(n, thresholds, labels);
  const pct = (rangeMax > rangeMin)
    ? Math.min(100, Math.max(0, Math.round(((n - rangeMin) / (rangeMax - rangeMin)) * 100)))
    : 0;

  return (
    <div className="cibil-row">
      <div className="cibil-row-label">{label}</div>
      <div className="cibil-row-right">
        <div className="cibil-track">
          <div className={`cibil-fill ${cls}`} style={{ width: `${pct}%` }} />
        </div>
        <div className={`cibil-score-chip ${cls}`}>
          {displayValue ?? n}
          <span className="cibil-lbl-text">{lbl}</span>
        </div>
      </div>
    </div>
  );
}

function InfoPair({ label, value, mono }) {
  return (
    <div className="rpt-pair">
      <div className="rpt-pair-label">{label}</div>
      <div className={`rpt-pair-value${!value ? " rpt-empty" : ""}${mono ? " mono" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}

/* ─── Recover Meta Modal ─────────────────────────────────────── */

function RecoverMetaModal({ student, onClose, onRestored }) {
  const [phase, setPhase] = useState("idle"); // idle | scanning | preview | writing | done | error
  const [recovered, setRecovered] = useState(null);
  const [warning, setWarning] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleScan = async () => {
    setPhase("scanning");
    setErrorMsg("");
    try {
      const r = await recoverMetaFromPdf(student.name, student.email || student.phone || "");
      if (!r.success) { setErrorMsg(r.error || "Recovery failed"); setPhase("error"); return; }
      setRecovered(r.recovered);
      setWarning(r.warning || null);
      setPhase("preview");
    } catch (e) {
      setErrorMsg(e.message || "Unexpected error");
      setPhase("error");
    }
  };

  const handleRestore = async () => {
    setPhase("writing");
    try {
      await restoreMeta(student.name, student.email || student.phone || "", recovered);
      setPhase("done");
      setTimeout(() => onRestored(recovered), 800);
    } catch (e) {
      setErrorMsg(e.message || "Write failed");
      setPhase("error");
    }
  };

  const p = recovered?.personalInfo || {};
  const previewFields = [
    ["Name", recovered?.name],
    ["Email", recovered?.email],
    ["Phone", recovered?.phone],
    ["Advisor", recovered?.advisor],
    ["Loan Amount", p.loanAmount ? `₹${Number(p.loanAmount).toLocaleString("en-IN")}` : null],
    ["Target University", p.targetUniversity],
    ["Course", p.courseNameUniversity],
    ["10th Score", p.pct10Score ? `${p.pct10Score} (${p.pct10Type || "%"})` : null],
    ["12th Score", p.pct12Score ? `${p.pct12Score} (${p.pct12Type || "%"})` : null],
    ["Graduation", p.pctGradScore ? `${p.pctGradScore} ${p.pctGradType === "cgpa" ? "CGPA" : "%"}` : null],
    ["Co-Applicants", recovered?.coApplicants],
  ].filter(([, v]) => v != null && v !== "");

  return (
    <div className="modal-backdrop" onClick={() => phase !== "scanning" && phase !== "writing" && onClose()}>
      <div className="modal-box recover-modal animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon"><ScanText size={26} /></div>
        <h3 className="bank-modal-title">Recover Meta from PDF</h3>
        <p className="bank-modal-desc">
          Scans <strong>Student_Summary.pdf</strong> from Drive, uses AI to reconstruct the
          student's form data, then writes it back as <code>student_meta.json</code>.
        </p>

        {phase === "idle" && (
          <>
            <div className="recover-info-box">
              <AlertTriangle size={13} />
              <span>Only run this if the student's data was lost. It will <strong>replace</strong> the current meta.</span>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleScan}>
                <ScanText size={13} /> Scan &amp; Recover
              </button>
            </div>
          </>
        )}

        {phase === "scanning" && (
          <div className="recover-loading">
            <div className="loading-dots"><span /><span /><span /></div>
            <p>OCR-ing PDF then asking Claude to reconstruct the data…</p>
          </div>
        )}

        {phase === "preview" && recovered && (
          <>
            {warning && (
              <div className="recover-warn-box">
                <AlertTriangle size={13} /> {warning}
              </div>
            )}
            <div className="recover-preview">
              <p className="recover-preview-title">Recovered fields preview:</p>
              <div className="recover-field-grid">
                {previewFields.map(([label, value]) => (
                  <div key={label} className="recover-field-row">
                    <span className="recover-field-lbl">{label}</span>
                    <span className="recover-field-val">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRestore}>
                <ShieldCheck size={13} /> Confirm &amp; Write
              </button>
            </div>
          </>
        )}

        {phase === "writing" && (
          <div className="recover-loading">
            <div className="loading-dots"><span /><span /><span /></div>
            <p>Writing recovered data to Drive…</p>
          </div>
        )}

        {phase === "done" && (
          <div className="recover-success">
            <ShieldCheck size={22} />
            <p>Meta restored successfully.</p>
          </div>
        )}

        {phase === "error" && (
          <>
            <div className="settings-msg err">{errorMsg}</div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
              <button className="btn btn-primary" onClick={handleScan}>Retry</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReportModal({ student, onClose }) {
  const p = student.personalInfo || {};
  const { progress, verdict, verdictClass, verdictReasons } =
    assessLoanEligibility(student);

  const cibilEntries = [
    { label: "Student", key: "studentCibil" },
    { label: "Father", key: "fatherCibil" },
    { label: "Mother", key: "motherCibil" },
    { label: "Guarantor", key: "guarantorCibil" },
  ].filter((e) => p[e.key]);

  const coCount = student.coApplicants || 0;
  const coApplicants = Array.from({ length: coCount }, (_, i) => ({
    idx: i,
    info: p[`co_info_${i}`] || {},
    uploads: student.uploads?.[`co_${i}`] || {},
  }));

  const progressClass = getProgressClass(progress);

  const verdictIconMap = {
    "verdict-eligible": <CheckCircle size={20} />,
    "verdict-review": <AlertTriangle size={20} />,
    "verdict-risky": <XCircle size={20} />,
    "verdict-incomplete": <AlertCircle size={20} />,
  };

  return (
    <div className="modal-backdrop rpt-backdrop" onClick={onClose}>
      <div className="rpt-modal animate-fade-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="rpt-header">
          <div className="rpt-header-left">
            <div className={`rpt-avatar avatar-${getAvatarVariant(student.name)}`}>
              {(student.name || "?")[0].toUpperCase()}
            </div>
            <div>
              <h2 className="rpt-name">{student.name}</h2>
              <p className="rpt-contact">{student.email || student.phone || "No contact"}</p>
              {student.advisor && <p className="rpt-advisor">Advisor: {student.advisor}</p>}
            </div>
          </div>
          <button className="icon-btn rpt-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Verdict Banner */}
        <div className={`rpt-verdict ${verdictClass}`}>
          <div className="rpt-verdict-icon">{verdictIconMap[verdictClass]}</div>
          <div className="rpt-verdict-body">
            <div className="rpt-verdict-title">{verdict}</div>
            <div className="rpt-verdict-reasons">
              {verdictReasons.map((r, i) => (
                <span key={i} className="rpt-reason-chip">{r}</span>
              ))}
            </div>
          </div>
          <div className="rpt-verdict-progress">
            <div className={`rpt-prog-ring ${progressClass}`}>
              <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5" className="ring-track" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5"
                  strokeDasharray={`${progress} ${100 - progress}`}
                  strokeDashoffset="25"
                  className="ring-fill"
                />
              </svg>
              <span>{progress}%</span>
            </div>
            <div className="rpt-prog-label">Docs</div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="rpt-body">
          {/* Summary Row */}
          <div className="rpt-summary-grid">
            <div className="rpt-summary-card">
              <Banknote size={15} />
              <div>
                <div className="rpt-sc-label">Loan Amount</div>
                <div className="rpt-sc-val">
                  {p.loanAmount ? `₹${Number(p.loanAmount).toLocaleString("en-IN")}` : "—"}
                </div>
              </div>
            </div>
            <div className="rpt-summary-card">
              <GraduationCap size={15} />
              <div>
                <div className="rpt-sc-label">Applied For</div>
                <div className="rpt-sc-val">{p.loanTrack || "—"}</div>
              </div>
            </div>
            <div className="rpt-summary-card">
              <Home size={15} />
              <div>
                <div className="rpt-sc-label">Own House</div>
                <div className="rpt-sc-val">{p.ownHouseStatus || "—"}</div>
              </div>
            </div>
            <div className="rpt-summary-card">
              <Briefcase size={15} />
              <div>
                <div className="rpt-sc-label">Prior Bank</div>
                <div className="rpt-sc-val">
                  {p.priorBankApplied === "Yes"
                    ? p.priorBankName === "Others" ? p.priorBankNameCustom : p.priorBankName || "Yes"
                    : p.priorBankApplied || "—"}
                </div>
              </div>
            </div>
          </div>

          {/* CIBIL Scores */}
          {cibilEntries.length > 0 && (
            <div className="rpt-section">
              <div className="rpt-section-title">
                <CreditCard size={13} /> CIBIL Score Analysis
              </div>
              <div className="cibil-scale-labels">
                <span>300</span><span>500</span><span>650</span><span>700</span><span>750</span><span>900</span>
              </div>
              <div className="cibil-list">
                {cibilEntries.map((e) => (
                  <ScoreBar
                    key={e.key}
                    label={e.label}
                    rawValue={p[e.key]}
                    thresholds={CIBIL_T}
                    rangeMin={300}
                    rangeMax={900}
                    labels={CIBIL_LABELS}
                  />
                ))}
              </div>
              <div className="cibil-legend">
                <span className="cl-item cibil-poor">Poor &lt;650</span>
                <span className="cl-item cibil-fair">Fair 650–699</span>
                <span className="cl-item cibil-good">Good 700–749</span>
                <span className="cl-item cibil-excellent">Excellent 750+</span>
              </div>
            </div>
          )}

          {/* Academic Profile */}
          <div className="rpt-section">
            <div className="rpt-section-title">
              <GraduationCap size={13} /> Academic Performance
            </div>

            {/* Qualification meta */}
            {(p.qualName || p.marital || p.hasBacklogs || p.qualInstitution) && (
              <div className="rpt-grid-2" style={{ marginBottom: 4 }}>
                {p.qualName && <InfoPair label="Qualification" value={`${p.qualName}${p.qualYear ? ` (${p.qualYear})` : ""}`} />}
                {p.qualInstitution && <InfoPair label="Institution" value={p.qualInstitution} />}
                {p.marital   && <InfoPair label="Marital Status" value={p.marital === "Yes" ? "Married" : p.marital === "No" ? "Unmarried" : p.marital} />}
                {p.hasBacklogs === "Yes" && (
                  <InfoPair label="Backlogs" value={`Yes — ${p.backlogCount || "?"} backlog(s)`} />
                )}
              </div>
            )}

            {/* Score bars */}
            {(p.pct10Score || p.pct12Score || p.pctGradScore) && (
              <>
                <div className="cibil-scale-labels">
                  <span>0%</span><span>60%</span><span>75%</span><span>85%</span><span>100%</span>
                </div>
                <div className="cibil-list">
                  {p.pct10Score && (
                    p.pct10Type === "marks" ? (
                      <InfoPair label={`10th${p.pct10Year ? ` (${p.pct10Year})` : ""}`} value={`${p.pct10Score} Marks`} />
                    ) : (
                      <ScoreBar
                        label={`10th${p.pct10Year ? ` (${p.pct10Year})` : ""}`}
                        rawValue={p.pct10Score}
                        displayValue={p.pct10Type === "points" ? `${p.pct10Score} Points` : `${p.pct10Score}%`}
                        thresholds={p.pct10Type === "points" ? CGPA_T : PCT_T}
                        rangeMin={0} rangeMax={p.pct10Type === "points" ? 10 : 100}
                      />
                    )
                  )}
                  {p.pct12Score && (
                    p.pct12Type === "marks" ? (
                      <InfoPair label={`12th${p.pct12Year ? ` (${p.pct12Year})` : ""}`} value={`${p.pct12Score} Marks`} />
                    ) : (
                      <ScoreBar
                        label={`12th${p.pct12Year ? ` (${p.pct12Year})` : ""}`}
                        rawValue={p.pct12Score}
                        displayValue={p.pct12Type === "points" ? `${p.pct12Score} Points` : `${p.pct12Score}%`}
                        thresholds={p.pct12Type === "points" ? CGPA_T : PCT_T}
                        rangeMin={0} rangeMax={p.pct12Type === "points" ? 10 : 100}
                      />
                    )
                  )}
                  {p.pctGradScore && (
                    <ScoreBar
                      label={`Grad${p.pctGradYear ? ` (${p.pctGradYear})` : ""}`}
                      rawValue={p.pctGradScore}
                      displayValue={p.pctGradType === "cgpa" ? `${p.pctGradScore} CGPA` : `${p.pctGradScore}%`}
                      thresholds={p.pctGradType === "cgpa" ? CGPA_T : PCT_T}
                      rangeMin={0}
                      rangeMax={p.pctGradType === "cgpa" ? 10 : 100}
                    />
                  )}
                </div>
                <div className="cibil-legend">
                  <span className="cl-item cibil-poor">Low &lt;60%</span>
                  <span className="cl-item cibil-fair">Average 60–74%</span>
                  <span className="cl-item cibil-good">Good 75–84%</span>
                  <span className="cl-item cibil-excellent">Excellent 85%+</span>
                </div>
              </>
            )}

            {/* Test scores */}
            {(p.greScore || p.ieltsScore || p.toeflScore || p.duolingoScore || p.gmatScore || p.pteScore) && (
              <>
                <div className="rpt-section-title" style={{ marginTop: 6, fontSize: 10 }}>
                  <Star size={11} /> Standardized Test Scores
                </div>
                <div className="cibil-list">
                  {p.greScore && (
                    <ScoreBar label="GRE" rawValue={p.greScore} displayValue={p.greScore}
                      thresholds={GRE_T} rangeMin={260} rangeMax={340} />
                  )}
                  {p.ieltsScore && (
                    <ScoreBar label="IELTS" rawValue={p.ieltsScore} displayValue={p.ieltsScore}
                      thresholds={IELTS_T} rangeMin={0} rangeMax={9} />
                  )}
                  {p.toeflScore && (
                    <ScoreBar label="TOEFL" rawValue={p.toeflScore} displayValue={p.toeflScore}
                      thresholds={TOEFL_T} rangeMin={0} rangeMax={120} />
                  )}
                  {p.gmatScore && (
                    <ScoreBar label="GMAT" rawValue={p.gmatScore} displayValue={p.gmatScore}
                      thresholds={GMAT_T} rangeMin={200} rangeMax={800} />
                  )}
                  {p.pteScore && (
                    <ScoreBar label="PTE" rawValue={p.pteScore} displayValue={p.pteScore}
                      thresholds={PTE_T} rangeMin={10} rangeMax={90} />
                  )}
                  {p.duolingoScore && (
                    <ScoreBar label="Duolingo" rawValue={p.duolingoScore} displayValue={p.duolingoScore}
                      thresholds={DUOLINGO_T} rangeMin={10} rangeMax={160} />
                  )}
                </div>
                <div className="cibil-legend">
                  <span className="cl-item cibil-poor">Low</span>
                  <span className="cl-item cibil-fair">Average</span>
                  <span className="cl-item cibil-good">Good</span>
                  <span className="cl-item cibil-excellent">Excellent</span>
                </div>
              </>
            )}
          </div>

          {/* University & Visa */}
          <div className="rpt-section">
            <div className="rpt-section-title">
              <Building2 size={13} /> University & Visa
            </div>
            <div className="rpt-grid-2">
              <InfoPair label="Destination Country" value={p.destinationCountry} />
              <InfoPair label="Target University" value={p.targetUniversity} />
              <InfoPair label="Course" value={p.courseNameUniversity} />
              <InfoPair label="I20 Received" value={p.i20Received} />
              <InfoPair label="Visa Booked" value={p.visaBooked === "Yes" ? `Yes${p.visaSlotDate ? ` — ${p.visaSlotDate}` : ""}` : p.visaBooked} />
            </div>
          </div>

          {/* Family & Guarantor */}
          <div className="rpt-section">
            <div className="rpt-section-title">
              <UsersIcon size={13} /> Family & Guarantor
            </div>
            <div className="rpt-grid-2">
              <InfoPair label="Father" value={p.fatherName ? `${p.fatherName}${p.fatherContact ? ` · ${p.fatherContact}` : ""}` : null} />
              <InfoPair label="Mother" value={p.motherName ? `${p.motherName}${p.motherContact ? ` · ${p.motherContact}` : ""}` : null} />
              <InfoPair label="Guarantor" value={p.guarantorName ? `${p.guarantorName} (${p.guarantorRelation || "N/A"})` : null} />
              <InfoPair label="Guarantor Sector" value={p.guarantorSector} />
              <InfoPair label="Income Docs" value={p.guarantorDocsAvailable} />
              <InfoPair label="Job Details" value={p.hasJobDetails === "Yes" ? p.jobSpecs || "Yes" : p.hasJobDetails} />
            </div>
          </div>

          {/* Co-Applicants */}
          {coApplicants.length > 0 && (
            <div className="rpt-section">
              <div className="rpt-section-title">
                <UsersIcon size={13} /> Co-Applicants ({coCount})
              </div>
              <div className="rpt-co-list">
                {coApplicants.map(({ idx, info, uploads: coUploads }) => {
                  const coDisplayName = [info.firstName, info.lastName].filter(Boolean).join(" ") || info.name || "";
                  if (!coDisplayName) return null;
                  const uploadCount = Object.keys(coUploads).length;
                  const empType = info.empType || "salaried";
                  const fields = info.financialStatus === "non-financial"
                    ? 3
                    : (CO_APPLICANT_SCHEMA[empType] || CO_APPLICANT_SCHEMA.other).length;
                  const coPct = fields ? Math.round((uploadCount / fields) * 100) : 0;
                  return (
                    <div key={idx} className="rpt-co-card">
                      <div className="rpt-co-header">
                        <div className="co-avatar"><UsersIcon size={13} /></div>
                        <div className="rpt-co-info">
                          <span className="rpt-co-name">{coDisplayName}</span>
                          <span className="rpt-co-meta">
                            {info.relation || "N/A"} ·{" "}
                            {info.financialStatus === "non-financial" ? "Non-Financial" : info.empType || "Salaried"}
                          </span>
                        </div>
                        <div className={`rpt-co-pct ${getProgressClass(coPct)}`}>{coPct}%</div>
                      </div>
                      <div className="rpt-co-bar">
                        <div className={`rpt-co-fill ${getProgressClass(coPct)}`} style={{ width: `${coPct}%` }} />
                      </div>
                      <div className="rpt-co-details">
                        {info.mobile && <span>{info.mobile}</span>}
                        {info.occupation && <span>{info.occupation}</span>}
                        {info.annualIncome && <span>₹{Number(info.annualIncome).toLocaleString("en-IN")}/yr</span>}
                        {info.qualifications && <span>{info.qualifications}</span>}
                        {info.dependants && <span>{info.dependants} dependants</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Document Completion */}
          <div className="rpt-section">
            <div className="rpt-section-title">
              <FileText size={13} /> Document Completion
            </div>
            <div className="rpt-doc-sections">
              {[
                { key: "applicant", label: "GOVT ID / KYC", required: DOCUMENT_SCHEMA.applicant.fields.filter(f => !f.optional).length },
                { key: "academics", label: "Academics", required: DOCUMENT_SCHEMA.academics.fields.filter(f => !f.optional).length },
              ].map(({ key, label, required }) => {
                const count = Object.keys(student.uploads?.[key] || {}).length;
                const pct = required ? Math.min(100, Math.round((count / required) * 100)) : 0;
                return (
                  <div key={key} className="rpt-doc-row">
                    <span className="rpt-doc-label">{label}</span>
                    <div className="rpt-doc-track">
                      <div className={`rpt-doc-fill ${getProgressClass(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="rpt-doc-count">{count}/{required}</span>
                  </div>
                );
              })}
              {coApplicants.map(({ idx, info, uploads: coUploads }) => {
                const coDisplayName = [info.firstName, info.lastName].filter(Boolean).join(" ") || info.name || "";
                const empType = info.financialStatus === "non-financial" ? "non-financial" : (info.empType || "salaried");
                const fields = empType === "non-financial" ? 3 : (CO_APPLICANT_SCHEMA[empType] || CO_APPLICANT_SCHEMA.other).length;
                const count = Object.keys(coUploads).length;
                const pct = fields ? Math.min(100, Math.round((count / fields) * 100)) : 0;
                return (
                  <div key={idx} className="rpt-doc-row">
                    <span className="rpt-doc-label">{coDisplayName || `Co-App ${idx + 1}`}</span>
                    <div className="rpt-doc-track">
                      <div className={`rpt-doc-fill ${getProgressClass(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="rpt-doc-count">{count}/{fields}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail tabs content ─────────────────────────────────────── */

function PersonalTab({ student }) {
  const p = student.personalInfo || {};
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.fullName || student.name;
  const fields = [
    { label: "Full Name", value: fullName },
    { label: "Email", value: student.email || p.email },
    { label: "Phone", value: student.phone || p.phone },
    { label: "Marital Status", value: p.marital === "Yes" ? "Married" : p.marital === "No" ? "Unmarried" : p.marital },
    { label: "Loan Amount", value: p.loanAmount ? `₹${Number(p.loanAmount).toLocaleString("en-IN")}` : null },
    { label: "10th Score", value: p.pct10Score ? `${p.pct10Score}${p.pct10Type === "marks" ? " Marks" : p.pct10Type === "points" ? " Points" : "%"}${p.pct10Year ? ` (${p.pct10Year})` : ""}` : p.pct10 },
    { label: "12th Score", value: p.pct12Score ? `${p.pct12Score}${p.pct12Type === "marks" ? " Marks" : p.pct12Type === "points" ? " Points" : "%"}${p.pct12Year ? ` (${p.pct12Year})` : ""}` : p.pct12 },
    { label: "Grad % / CGPA", value: p.pctGradScore ? `${p.pctGradScore}${p.pctGradType === "cgpa" ? " CGPA" : "%"}` : p.pctGrad },
    { label: "Graduation Institution", value: p.qualInstitution },
    { label: "Student CIBIL", value: p.studentCibil },
    { label: "Destination Country", value: p.destinationCountry },
    { label: "Target University", value: p.targetUniversity },
    { label: "Current Address", value: p.currentAddress },
    { label: "Permanent Address", value: p.permanentAddress },
    { label: "Maternal Grandmother", value: p.maternalGrandma },
    { label: "Paternal Grandmother", value: p.paternalGrandma },
  ];

  return (
    <div className="detail-body">
      <p className="section-heading">
        <User size={13} /> Personal Information
      </p>
      <div className="info-grid">
        {fields.map(({ label, value }) => (
          <div key={label} className="info-cell">
            <div className="info-label">{label}</div>
            <div className={`info-value${!value ? " empty" : ""}`}>{value || "—"}</div>
          </div>
        ))}
      </div>

      {student.coApplicants > 0 && (
        <>
          <p className="section-heading" style={{ marginTop: 24 }}>
            <UsersIcon size={13} /> Co‑Applicants ({student.coApplicants})
          </p>
          <div className="co-list">
            {Array.from({ length: student.coApplicants }).map((_, idx) => {
              const info = (student.personalInfo || {})[`co_info_${idx}`] || {};
              const coDisplayName = [info.firstName, info.lastName].filter(Boolean).join(" ") || info.name || "";
              if (!coDisplayName) return null;
              return (
                <div key={idx} className="co-item">
                  <div className="co-avatar"><UsersIcon size={15} /></div>
                  <div className="co-info">
                    <div className="co-name">{coDisplayName}</div>
                    <div className="co-details">{info.relation || "Relation N/A"}</div>
                  </div>
                  {info.empType && <span className="co-type">{info.empType}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DocumentsTab({ student }) {
  const sections = [
    { key: "applicant", label: "Applicant Docs", required: 6 },
    { key: "academics", label: "Academics", required: 10 },
    { key: "otherDocs", label: "Other Documents", required: null },
  ];
  const caSections = student.coApplicants
    ? [{ key: "co_uploads", label: `Co‑Applicant Docs`, required: student.coApplicants * 3 }]
    : [];

  return (
    <div className="detail-body">
      <p className="section-heading">
        <FolderOpen size={13} /> Document Status by Section
      </p>
      <div className="upload-section-grid">
        {[...sections, ...caSections].map(({ key, label, required }) => {
          const uploads = student.uploads || {};
          const count =
            key === "co_uploads"
              ? Object.keys(uploads).filter((k) => k.startsWith("co_")).length
              : Object.keys(uploads[key] || {}).length;
          const pct = required ? Math.min(100, Math.round((count / required) * 100)) : 0;
          return (
            <div key={key} className="upload-section-card">
              <div className="usc-header">
                <span className="usc-label">{label}</span>
                <span className="usc-count">{count}{required ? ` / ${required}` : "+"}</span>
              </div>
              {required && (
                <div className="usc-bar">
                  <div className="usc-fill" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(() => {
        const missing = getMissingDocs(student);
        if (!missing.length)
          return (
            <div className="missing-section missing-all-clear">
              <div className="missing-title missing-ok">
                <CheckCircle size={14} /> All required documents uploaded
              </div>
            </div>
          );

        const grouped = missing.reduce((acc, { section, label }) => {
          if (!acc[section]) acc[section] = [];
          acc[section].push(label);
          return acc;
        }, {});

        return (
          <div className="missing-section" style={{ marginBottom: 16 }}>
            <div className="missing-title">
              <AlertCircle size={14} />
              {missing.length} Missing Required Document{missing.length !== 1 ? "s" : ""}
            </div>
            {Object.entries(grouped).map(([section, labels]) => (
              <div key={section} className="missing-group">
                <div className="missing-group-label">{section}</div>
                <ul className="missing-list">
                  {labels.map((label, i) => <li key={i}>{label}</li>)}
                </ul>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function FilesTab({ student }) {
  const files = getAllUploadedFiles(student.uploads);
  // Student_Summary.pdf / Eligibility_Report.pdf aren't part of student.uploads
  // at all — they're auto-generated server-side into the student's "Others"
  // Drive folder on every save, never recorded into the upload-field state
  // getAllUploadedFiles reads. Listed separately here so staff can actually
  // find them without leaving the app to browse Drive by hand.
  const generated = [
    student.summaryPdf && { key: "summary", name: "Application Summary", tag: "Auto-generated", ...student.summaryPdf },
    student.eligibilityPdf && { key: "eligibility", name: "Eligibility Report", tag: "Auto-generated", ...student.eligibilityPdf },
  ].filter(Boolean);

  if (!files.length && !generated.length) {
    return (
      <div className="detail-body">
        <div className="admin-empty" style={{ padding: "40px 20px" }}>
          <div className="admin-empty-icon"><FileText size={24} /></div>
          <h3>No files uploaded yet</h3>
          <p>Documents will appear here once the student uploads them.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-body">
      {generated.length > 0 && (
        <>
          <p className="section-heading">
            <ScanText size={13} /> Generated Reports
          </p>
          <div className="files-list" style={{ marginBottom: 18 }}>
            {generated.map((file) => (
              <div key={file.key} className="file-item">
                <div className="file-icon file-icon-generated"><ScanText size={14} /></div>
                <div className="file-meta">
                  <div className="file-name">{file.name}</div>
                  <div className="file-section-tag">{file.tag}</div>
                </div>
                {file.webViewLink && (
                  <a
                    href={file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="file-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={12} /> View
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {files.length > 0 && (
        <>
          <p className="section-heading">
            <FileText size={13} /> {files.length} Uploaded File{files.length !== 1 ? "s" : ""}
          </p>
          <div className="files-list">
            {files.map((file, idx) => (
              <div key={idx} className="file-item">
                <div className="file-icon"><FileText size={14} /></div>
                <div className="file-meta">
                  <div className="file-name">{file.name}</div>
                  <div className="file-section-tag">{file.section}</div>
                </div>
                {file.webViewLink && (
                  <a
                    href={file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="file-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={12} /> View
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Student Row ──────────────────────────────────────────────── */

/* ─── Consultancy inline editor (advisor + superadmin) ─────────── */

const NEW_CONSULTANCY_OPTION = "__new__";

function ConsultancyEditor({ value, onSave, suggestions = [] }) {
  const [editing, setEditing] = useState(false);
  // "select" shows a dropdown of existing consultancy names; "new" shows a
  // free-text input — there's no fixed master list (students type their own
  // consultancy), so there must be a way to add one not yet in the dropdown.
  const [mode, setMode] = useState("select");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const begin = () => {
    setErr("");
    if (value && suggestions.includes(value)) {
      // Already-set value matches an existing option — open on the dropdown, preselected.
      setMode("select");
      setDraft(value);
    } else if (value) {
      // Custom value not in the list — edit it as text directly.
      setMode("new");
      setDraft(value);
    } else if (suggestions.length > 0) {
      // Nothing set yet, but other consultancies exist — offer the dropdown first.
      setMode("select");
      setDraft("");
    } else {
      // No consultancies recorded anywhere yet — nothing to pick from.
      setMode("new");
      setDraft("");
    }
    setEditing(true);
  };
  const cancel = () => { setEditing(false); setErr(""); };
  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setErr(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="field-strip">
      <div className="field-strip-label">
        <Building2 size={13} />
        <span>Consultancy</span>
      </div>

      {!editing ? (
        <div className="field-strip-view">
          <span className={`field-strip-value${value ? "" : " empty"}`}>
            {value || "Not set"}
          </span>
          <button className="btn btn-secondary btn-sm field-strip-edit-btn" onClick={begin}>
            <Pencil size={12} /> {value ? "Edit" : "Set consultancy"}
          </button>
        </div>
      ) : mode === "select" ? (
        <div className="field-strip-edit">
          <select
            className="field-strip-select"
            value={draft}
            autoFocus
            disabled={saving}
            onChange={(e) => {
              if (e.target.value === NEW_CONSULTANCY_OPTION) {
                setMode("new");
                setDraft("");
              } else {
                setDraft(e.target.value);
              }
            }}
            onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
          >
            <option value="">Choose existing consultancy…</option>
            {suggestions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value={NEW_CONSULTANCY_OPTION}>+ Add new consultancy…</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !draft}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={cancel} disabled={saving}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="field-strip-edit">
          <input
            className="field-strip-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. ABC Overseas, Hyderabad"
            autoFocus
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
          />
          {suggestions.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={saving}
              onClick={() => { setMode("select"); setDraft(""); }}
              title="Pick from existing consultancies instead"
            >
              Choose existing
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={cancel} disabled={saving}>
            Cancel
          </button>
        </div>
      )}

      {err && <span className="field-strip-err">{err}</span>}
    </div>
  );
}

/* ─── Advisor reassignment editor (superadmin only) ─────────────── */
// Unlike ConsultancyEditor, there's no free-text mode — the advisor must be
// one of the registered advisor accounts (options come from GET /api/advisors,
// the same source Home.jsx's registration dropdown uses), since this field
// also controls which advisor's dashboard the student shows up on.
function AdvisorEditor({ value, onSave, options = [] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const begin = () => {
    setErr("");
    setDraft(value || "");
    setEditing(true);
  };
  const cancel = () => { setEditing(false); setErr(""); };
  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setErr(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  // The student's current advisor might not be in the fetched options list
  // (e.g. an advisor account that was since renamed/removed) — still show it
  // as a selectable option so the dropdown doesn't silently switch off it.
  const selectOptions = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <div className="field-strip">
      <div className="field-strip-label">
        <UserCheck size={13} />
        <span>Advisor</span>
      </div>

      {!editing ? (
        <div className="field-strip-view">
          <span className={`field-strip-value${value ? "" : " empty"}`}>
            {value || "Not set"}
          </span>
          <button className="btn btn-secondary btn-sm field-strip-edit-btn" onClick={begin}>
            <Pencil size={12} /> {value ? "Reassign" : "Assign advisor"}
          </button>
        </div>
      ) : (
        <div className="field-strip-edit">
          <select
            className="field-strip-select"
            value={draft}
            autoFocus
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
          >
            <option value="">Choose advisor…</option>
            {selectOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || draft === value}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={cancel} disabled={saving}>
            Cancel
          </button>
        </div>
      )}

      {err && <span className="field-strip-err">{err}</span>}
    </div>
  );
}

function StudentRow({ student, isOpen, onToggle, selected, onToggleSelect, onDelete, onOpenDrive, onViewReport, onSendToBank, onLoanStatusUpdate, onRecoverMeta, canEditConsultancy, onConsultancySave, consultancySuggestions, canEditAdvisor, onAdvisorSave, advisorOptions, isDuplicate }) {
  const [activeTab, setActiveTab] = useState("personal");
  const [moreOpen, setMoreOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  const totalUploads = getTotalUploads(student);
  const progress = getOverallProgress(student);
  const progClass = getProgressClass(progress);
  const avatarVariant = getAvatarVariant(student.name);
  const files = getAllUploadedFiles(student.uploads);
  const consultancy = student.personalInfo?.consultantNameLoc || "";

  // The Govt ID / KYC section's "Passport Size Photo" upload — same field
  // the student's own portal collects. Only tried as an <img> when its
  // filename looks like an actual image; that upload slot also accepts
  // PDFs and Word docs, which can't render as a thumbnail.
  const photoUpload = student.uploads?.applicant?.photo;
  const hasPhoto = !!photoUpload?.id && /\.(jpe?g|png|webp|gif)$/i.test(photoUpload.name || "") && !photoFailed;

  const tabs = [
    { id: "personal", label: "Personal", icon: <User size={12} />, count: null },
    { id: "documents", label: "Documents", icon: <FolderOpen size={12} />, count: null },
    { id: "files", label: "Files", icon: <FileText size={12} />, count: files.length },
  ];

  const updated = student.updatedAt ? new Date(student.updatedAt) : null;

  return (
    <div className={`student-block${isOpen ? " open" : ""}${selected ? " row-selected" : ""}`}>
      <div className="student-row" onClick={onToggle}>
        <div className="student-cell-check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`Select ${student.name}`} />
        </div>

        <div className="student-cell-name">
          <div className={`student-avatar${hasPhoto ? " has-photo" : ` avatar-${avatarVariant}`}`}>
            {hasPhoto ? (
              <img
                src={getFileProxyUrl(photoUpload.id, "view")}
                alt=""
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <User size={16} />
            )}
          </div>
          <div className="student-info">
            <span className="student-name">{student.name || "Unknown Student"}</span>
            <span className="student-contact">{student.email || student.phone || "No contact info"}</span>
            {student._parseError && (
              <span
                className="student-meta-error-badge"
                title={`This student's data file is unreadable and could not be loaded: ${student._parseError}. Filters, progress, and details may be inaccurate until it's fixed (try Recover Meta).`}
              >
                <AlertTriangle size={11} /> Data unreadable
              </span>
            )}
            {isDuplicate && (
              <span
                className="student-meta-error-badge student-duplicate-badge"
                title="Another student record shares this same email or phone number — likely a duplicate Drive folder from a double submission. Check both records before deleting either one."
              >
                <AlertTriangle size={11} /> Possible duplicate
              </span>
            )}
          </div>
        </div>

        <div className="student-cell-text">{consultancy || <span className="cell-empty">—</span>}</div>
        <div className="student-cell-text">{student.advisor || <span className="cell-empty">—</span>}</div>

        <div className="student-cell-status">
          <LoanStatusBadge status={student.loanStatus} />
        </div>

        <div className={`student-cell-progress ${progClass}`}>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-pct">{progress}%</span>
        </div>

        <div className="student-cell-files">
          <FileText size={13} />
          {totalUploads}
        </div>

        <div className="student-cell-updated">
          {updated ? (
            <>
              <span>{updated.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
              <span className="cell-updated-time">{updated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
            </>
          ) : (
            <span className="cell-empty">—</span>
          )}
        </div>

        <div className="student-cell-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title="View" onClick={onToggle}>
            <Eye size={16} />
          </button>
          <button className="icon-btn" title="Analytics" onClick={onViewReport}>
            <BarChart3 size={16} />
          </button>
          <button className="icon-btn" title="Send to bank" onClick={onSendToBank}>
            <Send size={16} />
          </button>
          <button className="icon-btn del-btn" title="Delete" onClick={onDelete}>
            <Trash2 size={16} />
          </button>
          <div className="row-more-wrap">
            <button className="icon-btn" title="More" onClick={() => setMoreOpen((o) => !o)}>
              <MoreVertical size={16} />
            </button>
            {moreOpen && (
              <>
                <div className="row-more-scrim" onClick={() => setMoreOpen(false)} />
                <div className="row-more-menu">
                  <button onClick={(e) => { setMoreOpen(false); onLoanStatusUpdate(e); }}>
                    <Banknote size={14} /> Update Loan Status
                  </button>
                  <button onClick={(e) => { setMoreOpen(false); onOpenDrive(e); }}>
                    <ExternalLink size={14} /> Open Drive
                  </button>
                  <button onClick={(e) => { setMoreOpen(false); onRecoverMeta(e); }}>
                    <ScanText size={14} /> Recover Meta
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="student-detail">
          <div className="detail-inner">
            <div className="detail-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`detail-tab${activeTab === tab.id ? " active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.count !== null && tab.count > 0 && (
                    <span className="tab-count">{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "personal" && <PersonalTab student={student} />}
            {activeTab === "documents" && <DocumentsTab student={student} />}
            {activeTab === "files" && <FilesTab student={student} />}

            {canEditAdvisor && (
              <AdvisorEditor
                value={student.advisor || ""}
                onSave={onAdvisorSave}
                options={advisorOptions}
              />
            )}

            {canEditConsultancy && (
              <ConsultancyEditor
                value={student.personalInfo?.consultantNameLoc || ""}
                onSave={onConsultancySave}
                suggestions={consultancySuggestions}
              />
            )}

            <div className="detail-action-bar">
              <div className="dab-primary">
                <button className="btn btn-loan btn-sm" onClick={onLoanStatusUpdate}>
                  <Banknote size={13} /> Loan Status
                </button>
                <button className="btn btn-primary btn-sm" onClick={onViewReport}>
                  <BarChart3 size={13} /> Eligibility Report
                </button>
                <button className="btn btn-secondary btn-sm" onClick={onOpenDrive}>
                  <ExternalLink size={13} /> Open Drive
                </button>
                <button className="btn btn-secondary btn-sm" onClick={onSendToBank}>
                  <Send size={13} /> Bank Access
                </button>
                <button className="btn btn-recover btn-sm" onClick={onRecoverMeta} title="Recover meta JSON from Summary PDF">
                  <ScanText size={13} /> Recover Meta
                </button>
              </div>
              <button className="btn btn-danger btn-sm dab-delete" onClick={onDelete}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Delete Confirm Modal ─────────────────────────────────────── */

function DeleteModal({ name, deleting, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={() => !deleting && onCancel()}>
      <div className="modal-box animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon danger"><Trash2 size={28} /></div>
        <h3>Delete Student?</h3>
        <p>
          This will permanently remove <strong>{name}</strong> and all their
          associated documents from Google Drive. This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? (
              <><RefreshCw size={13} className="spin" /> Deleting…</>
            ) : (
              <><Trash2 size={13} /> Delete Permanently</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Grant Bank Access Modal ─────────────────────────────────── */

function GrantBankAccessModal({ student, onClose, onAccessChanged }) {
  const [bankers, setBankers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(new Set(student.sharedBankers || []));
  const [togglingName, setTogglingName] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await callAPI("GET", "/api/admins/bankers");
        if (!cancelled && r.success) setBankers(r.bankers || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const p = student.personalInfo || {};
  const excludedBank = p.priorBankApplied === "Yes"
    ? (p.priorBankName === "Others" ? p.priorBankNameCustom : p.priorBankName)
    : "";

  const toggleAccess = async (bankerName) => {
    const grant = !shared.has(bankerName);
    setTogglingName(bankerName);
    setError("");
    try {
      const identifier = student.email || student.phone || "";
      const r = await callAPI("PUT", "/api/students/banker-access", {
        studentName: student.name, studentIdentifier: identifier, bankerName, grant,
      });
      if (r.success) {
        setShared(new Set(r.sharedBankers));
        onAccessChanged?.(student.name, r.sharedBankers);
      } else {
        setError(r.error || "Failed to update access.");
      }
    } catch (e) {
      setError(e.message || "Network error. Try again.");
    } finally {
      setTogglingName(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box bank-modal-box animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon"><Send size={28} /></div>
        <h3 className="bank-modal-title">Grant Bank Access</h3>
        <p className="bank-modal-desc">
          Choose which banker accounts can log in and view <strong>{student.name}</strong>'s
          documents. Access can be revoked at any time.
        </p>

        {excludedBank && (
          <p className="settings-msg warn">
            <strong>{excludedBank}</strong> may already have this application — double check before granting.
          </p>
        )}

        {loading ? (
          <div className="admin-loading bank-modal-loading">
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        ) : bankers.length === 0 ? (
          <p className="bank-modal-empty">
            No banker accounts yet. Use the "Banker Access" button to add one.
          </p>
        ) : (
          <div className="team-list bank-checklist">
            {bankers.map((b) => (
              <label key={b.name} className="team-row bank-check-row">
                <input
                  type="checkbox"
                  className="bank-checkbox"
                  checked={shared.has(b.name)}
                  disabled={togglingName === b.name}
                  onChange={() => toggleAccess(b.name)}
                />
                <div className="bank-logo-mini-wrap">
                  <img src={getBankLogo(b.bank)} alt={b.bank || b.name} className="bank-logo-mini" onError={(e) => { e.target.style.display = "none"; }} />
                </div>
                <div className="team-info">
                  <span className="team-name">{b.name}</span>
                  <span className="team-role-badge banker">
                    {togglingName === b.name ? "Updating…" : shared.has(b.name) ? "Access granted" : "No access"}
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}

        {error && <div className="settings-msg err">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Banker Access + Management (unified) ─────────────────────── */

function BankerAccessSection({ students, onAccessChanged, onBankersChanged }) {
  // Bankers — fetched internally so add/edit/delete stays live
  const [allBankers, setAllBankers] = useState([]);
  const [bankersLoading, setBankersLoading] = useState(true);

  // Filter + selection
  const [bankFilter, setBankFilter] = useState("all");
  const [selectedName, setSelectedName] = useState(null);

  // Panel: "access" | "add" | "edit"
  const [panel, setPanel] = useState("access");

  // Add form
  const [addBank, setAddBank] = useState("");
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPass, setAddPass] = useState("");
  const [addShowPass, setAddShowPass] = useState(false);
  const [addMsg, setAddMsg] = useState(null);
  const [addLoading, setAddLoading] = useState(false);

  // Edit form
  const [editBanker, setEditBanker] = useState(null);
  const [editBank, setEditBank] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPass, setEditPass] = useState("");
  const [editShowPass, setEditShowPass] = useState(false);
  const [editMsg, setEditMsg] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Access management
  const [accessSearch, setAccessSearch] = useState("");
  const [togglingName, setTogglingName] = useState(null);
  const [accessError, setAccessError] = useState("");

  const fetchBankers = useCallback(async () => {
    try {
      const r = await callAPI("GET", "/api/admins/bankers");
      if (r.success) {
        const list = r.bankers || [];
        setAllBankers(list);
        setSelectedName((prev) => {
          if (prev && list.find((b) => b.name === prev)) return prev;
          return list[0]?.name || null;
        });
      }
    } catch { /* silent */ }
    finally { setBankersLoading(false); }
  }, []);

  useEffect(() => { fetchBankers(); }, [fetchBankers]);

  // Derived: unique banks that have registered officers
  const uniqueBanks = Array.from(new Set(allBankers.map((b) => b.bank).filter(Boolean))).sort();

  // Bankers visible in sidebar after bank filter
  const visibleBankers = bankFilter === "all"
    ? allBankers
    : allBankers.filter((b) => b.bank === bankFilter);

  const selectedBanker = allBankers.find((b) => b.name === selectedName) || null;

  // Keep selected banker valid when filter changes
  useEffect(() => {
    if (selectedName && !visibleBankers.find((b) => b.name === selectedName)) {
      setSelectedName(visibleBankers[0]?.name || null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankFilter, allBankers]);

  // Access management data
  const grantedStudents = students.filter((s) => (s.sharedBankers || []).includes(selectedName));
  const grantedNames = new Set(grantedStudents.map((s) => s.name));
  const q = accessSearch.trim().toLowerCase();
  const availableStudents = students.filter((s) => {
    if (grantedNames.has(s.name)) return false;
    if (!q) return true;
    return (s.name || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q);
  });
  const visibleAvailable = availableStudents.slice(0, 40);

  // Handlers
  const toggleAccess = async (student, grant) => {
    setTogglingName(student.name);
    setAccessError("");
    try {
      const identifier = student.email || student.phone || "";
      const r = await callAPI("PUT", "/api/students/banker-access", {
        studentName: student.name, studentIdentifier: identifier, bankerName: selectedName, grant,
      });
      if (r.success) {
        onAccessChanged?.(student.name, r.sharedBankers);
      } else {
        setAccessError(r.error || "Failed to update access.");
      }
    } catch (e) {
      setAccessError(e.message || "Network error.");
    } finally {
      setTogglingName(null);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addBank) { setAddMsg({ type: "err", text: "Please select a bank." }); return; }
    if (!addName.trim()) { setAddMsg({ type: "err", text: "Name is required." }); return; }
    if (addPass.length < 6) { setAddMsg({ type: "err", text: "Password must be at least 6 characters." }); return; }
    setAddLoading(true); setAddMsg(null);
    try {
      const r = await callAPI("POST", "/api/admins", {
        name: addName.trim(), role: "banker", password: addPass,
        bank: addBank,
      });
      if (r.success) {
        setAddMsg({ type: "ok", text: `${addName.trim()} added successfully.` });
        setAddBank(""); setAddName(""); setAddPass("");
        await fetchBankers(); onBankersChanged?.();
        setTimeout(() => { setPanel("access"); setAddMsg(null); }, 1400);
      } else {
        setAddMsg({ type: "err", text: r.error || "Failed to create." });
      }
    } catch { setAddMsg({ type: "err", text: "Network error." }); }
    finally { setAddLoading(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setEditLoading(true); setEditMsg(null);
    try {
      const r = await callAPI("PUT", `/api/admins/${encodeURIComponent(editBanker.name)}`, { bank: editBank, email: editEmail });
      if (!r.success) { setEditMsg({ type: "err", text: r.error || "Failed to update." }); setEditLoading(false); return; }
      if (editPass.length >= 6) {
        const rp = await callAPI("PUT", `/api/admins/${encodeURIComponent(editBanker.name)}/reset-password`, { newPassword: editPass });
        if (!rp.success) { setEditMsg({ type: "err", text: rp.error || "Failed to reset password." }); setEditLoading(false); return; }
      }
      setEditMsg({ type: "ok", text: "Saved successfully." });
      await fetchBankers(); onBankersChanged?.();
      setTimeout(() => { setPanel("access"); setEditBanker(null); setEditMsg(null); }, 1400);
    } catch { setEditMsg({ type: "err", text: "Network error." }); }
    finally { setEditLoading(false); }
  };

  const handleDelete = async (name) => {
    setDeleteLoading(true);
    try {
      const r = await callAPI("DELETE", `/api/admins/${encodeURIComponent(name)}`);
      if (r.success) {
        setDeleteTarget(null);
        if (editBanker?.name === name) { setPanel("access"); setEditBanker(null); }
        await fetchBankers(); onBankersChanged?.();
      } else { alert(r.error || "Failed to delete."); }
    } catch { alert("Network error."); }
    finally { setDeleteLoading(false); }
  };

  const openEdit = (b) => {
    setEditBanker(b); setEditBank(b.bank || ""); setEditEmail(b.email || "");
    setEditPass(""); setEditMsg(null); setPanel("edit");
    setSelectedName(b.name);
  };

  const openAdd = () => {
    setPanel("add"); setAddMsg(null);
    setAddBank(""); setAddName(""); setAddEmail(""); setAddPass("");
  };

  return (
    <div className="bam-page animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bam-header">
        <div className="bam-header-left">
          <div className="bam-header-icon"><Send size={18} /></div>
          <div>
            <h2 className="bam-title">Banker Access</h2>
            <p className="bam-subtitle">
              {allBankers.length} loan officer{allBankers.length !== 1 ? "s" : ""}
              {uniqueBanks.length > 0 && ` · ${uniqueBanks.length} bank${uniqueBanks.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="bam-header-actions">
          {panel !== "add" && (
            <button className="btn btn-primary btn-sm bam-add-btn" onClick={openAdd}>
              <Plus size={13} /> Add Loan Officer
            </button>
          )}
        </div>
      </div>

        {/* ── Bank filter chips ───────────────────────────────────── */}
        {uniqueBanks.length > 0 && (
          <div className="bam-bank-filters">
            <button
              className={`bam-bank-chip${bankFilter === "all" ? " active" : ""}`}
              onClick={() => setBankFilter("all")}
            >
              <span className="bam-chip-all-icon"><Building2 size={13} /></span>
              <span className="bam-chip-label">All</span>
              <span className="bam-chip-count">{allBankers.length}</span>
            </button>
            {uniqueBanks.map((bank) => {
              const cnt = allBankers.filter((b) => b.bank === bank).length;
              return (
                <button
                  key={bank}
                  className={`bam-bank-chip${bankFilter === bank ? " active" : ""}`}
                  onClick={() => setBankFilter(bank)}
                >
                  <img src={getBankLogo(bank)} alt={bank} className="bam-chip-logo"
                    onError={(e) => { e.target.style.display = "none"; }} />
                  <span className="bam-chip-label">{bank}</span>
                  <span className="bam-chip-count">{cnt}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Body ────────────────────────────────────────────────── */}
        <div className="bam-body">

          {/* Sidebar — banker list */}
          <div className="bam-sidebar">
            {bankersLoading ? (
              <div className="bam-sidebar-loading">
                <div className="loading-dots"><span /><span /><span /></div>
              </div>
            ) : visibleBankers.length === 0 ? (
              <div className="bam-sidebar-empty">
                <div className="bam-sidebar-empty-icon"><Building2 size={28} /></div>
                <p>No loan officers yet</p>
                <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus size={12} /> Add first</button>
              </div>
            ) : (
              visibleBankers.map((b) => {
                const count = students.filter((s) => (s.sharedBankers || []).includes(b.name)).length;
                const isSelected = selectedName === b.name;
                return (
                  <div
                    key={b.name}
                    className={`bam-banker-card${isSelected ? " selected" : ""}`}
                    onClick={() => { setSelectedName(b.name); if (panel === "edit" || panel === "add") setPanel("access"); }}
                  >
                    <div className="bam-card-logo-wrap">
                      <img src={getBankLogo(b.bank)} alt={b.bank || "Bank"} className="bam-card-logo"
                        onError={(e) => { e.target.style.display = "none"; }} />
                    </div>
                    <div className="bam-card-info">
                      <span className="bam-card-name">{b.name}</span>
                      <span className="bam-card-bank">{b.bank || <em className="bam-card-nobank">No bank set</em>}</span>
                      {b.email && <span className="bam-card-email">{b.email}</span>}
                    </div>
                    <div className="bam-card-right">
                      <span className="bam-card-count" title={`${count} student${count !== 1 ? "s" : ""} with access`}>
                        {count}
                      </span>
                      <div className="bam-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="bam-action-btn edit" title="Edit" onClick={() => openEdit(b)}>
                          <Pencil size={11} />
                        </button>
                        {deleteTarget === b.name ? (
                          <div className="bam-del-confirm">
                            <button className="bam-del-yes" disabled={deleteLoading} onClick={() => handleDelete(b.name)}>
                              {deleteLoading ? <RefreshCw size={10} className="spin" /> : "Yes"}
                            </button>
                            <button className="bam-del-no" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>No</button>
                          </div>
                        ) : (
                          <button className="bam-action-btn delete" title="Remove" onClick={() => setDeleteTarget(b.name)}>
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Main panel */}
          <div className="bam-main">

            {/* ── Access panel ── */}
            {panel === "access" && (
              selectedBanker ? (
                <div className="bam-access-panel">
                  {/* Banker identity bar */}
                  <div className="bam-identity-bar">
                    <div className="bam-identity-logo-wrap">
                      <img src={getBankLogo(selectedBanker.bank)} alt={selectedBanker.bank || ""} className="bam-identity-logo"
                        onError={(e) => { e.target.style.display = "none"; }} />
                    </div>
                    <div className="bam-identity-info">
                      <span className="bam-identity-name">{selectedBanker.name}</span>
                      <span className="bam-identity-bank">{selectedBanker.bank || "No bank set"}</span>
                    </div>
                    <button className="bam-identity-edit-btn" onClick={() => openEdit(selectedBanker)} title="Edit this loan officer">
                      <Pencil size={13} /> Edit
                    </button>
                  </div>

                  {/* Granted students */}
                  <div className="bam-section">
                    <div className="bam-section-header">
                      <span className="bam-section-title">Can access</span>
                      <span className="bam-section-badge">{grantedStudents.length}</span>
                    </div>
                    {grantedStudents.length === 0 ? (
                      <p className="bam-no-students">No students assigned yet. Grant access below.</p>
                    ) : (
                      <div className="bam-student-list">
                        {grantedStudents.map((s) => (
                          <div key={s.name} className="bam-student-row">
                            <div className="bam-student-avatar">{(s.name || "?")[0].toUpperCase()}</div>
                            <div className="bam-student-info">
                              <span className="bam-student-name">{s.name}</span>
                              <span className="bam-student-contact">{s.email || s.phone || "—"}</span>
                            </div>
                            <button className="bam-revoke-btn" disabled={togglingName === s.name} onClick={() => toggleAccess(s, false)}>
                              {togglingName === s.name ? <RefreshCw size={11} className="spin" /> : "Revoke"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Grant more */}
                  <div className="bam-section">
                    <div className="bam-section-header">
                      <span className="bam-section-title">Grant access</span>
                    </div>
                    <div className="bam-search-wrap">
                      <Search size={13} className="bam-search-icon" />
                      <input
                        className="bam-search-input"
                        placeholder="Search students by name, email, or phone…"
                        value={accessSearch}
                        onChange={(e) => setAccessSearch(e.target.value)}
                      />
                      {accessSearch && (
                        <button className="bam-search-clear" onClick={() => setAccessSearch("")}><X size={12} /></button>
                      )}
                    </div>
                    <div className="bam-student-list bam-grant-list">
                      {visibleAvailable.length === 0 ? (
                        <p className="bam-no-students">
                          {accessSearch ? "No matching students." : "All students already have access."}
                        </p>
                      ) : (
                        visibleAvailable.map((s) => (
                          <div key={s.name} className="bam-student-row">
                            <div className="bam-student-avatar">{(s.name || "?")[0].toUpperCase()}</div>
                            <div className="bam-student-info">
                              <span className="bam-student-name">{s.name}</span>
                              <span className="bam-student-contact">{s.email || s.phone || "—"}</span>
                            </div>
                            <button className="bam-grant-btn" disabled={togglingName === s.name} onClick={() => toggleAccess(s, true)}>
                              {togglingName === s.name ? <RefreshCw size={11} className="spin" /> : "Grant"}
                            </button>
                          </div>
                        ))
                      )}
                      {availableStudents.length > visibleAvailable.length && (
                        <p className="bam-more-hint">+{availableStudents.length - visibleAvailable.length} more — type to search</p>
                      )}
                    </div>
                    {accessError && <p className="bam-error-inline">{accessError}</p>}
                  </div>
                </div>
              ) : (
                <div className="bam-empty-main">
                  <div className="bam-empty-icon-wrap"><Building2 size={36} /></div>
                  <h3>No loan officers yet</h3>
                  <p>Add your first loan officer using the button above.</p>
                  <button className="btn btn-primary" onClick={openAdd}><Plus size={13} /> Add Loan Officer</button>
                </div>
              )
            )}

            {/* ── Add form ── */}
            {panel === "add" && (
              <div className="bam-form-panel animate-fade-in">
                <div className="bam-form-titlebar">
                  <div className="bam-form-titlebar-icon add"><Plus size={16} /></div>
                  <div>
                    <h3 className="bam-form-h">Add Loan Officer</h3>
                    <p className="bam-form-sub">Register a new banker who can log in and view student documents.</p>
                  </div>
                  <button className="icon-btn" onClick={() => setPanel("access")}><X size={16} /></button>
                </div>
                <form onSubmit={handleAdd} className="bam-form">
                  <div className="bam-field">
                    <label>Bank <span className="req">*</span></label>
                    <div className="bam-select-wrap">
                      {addBank && <img src={getBankLogo(addBank)} alt={addBank} className="bam-select-logo" />}
                      <select className={`bam-select${addBank ? " has-logo" : ""}`} value={addBank} onChange={(e) => setAddBank(e.target.value)}>
                        <option value="">— Select bank —</option>
                        {BANK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="bam-field">
                    <label>Full Name <span className="req">*</span> <span className="bam-hint">(login username)</span></label>
                    <input className="bam-input" type="text" placeholder="e.g. Rajesh Kumar" value={addName} onChange={(e) => setAddName(e.target.value)} />
                  </div>
                  <div className="bam-field">
                    <label>Password <span className="req">*</span></label>
                    <div className="bam-pw-wrap">
                      <input className="bam-input" type={addShowPass ? "text" : "password"} placeholder="Min. 6 characters" value={addPass} onChange={(e) => setAddPass(e.target.value)} />
                      <button type="button" className="bam-pw-toggle" onClick={() => setAddShowPass(!addShowPass)}>
                        {addShowPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  {addMsg && <div className={`bam-msg ${addMsg.type}`}>{addMsg.text}</div>}
                  <div className="bam-form-actions">
                    <button type="submit" className="bam-submit-btn" disabled={addLoading}>
                      {addLoading ? <><RefreshCw size={13} className="spin" /> Creating…</> : <><Plus size={13} /> Create Officer</>}
                    </button>
                    <button type="button" className="bam-cancel-btn" onClick={() => setPanel("access")}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {/* ── Edit form ── */}
            {panel === "edit" && editBanker && (
              <div className="bam-form-panel animate-fade-in">
                <div className="bam-form-titlebar">
                  <div className="bam-edit-logo-wrap">
                    <img src={getBankLogo(editBanker.bank)} alt={editBanker.bank || "Bank"} className="bam-edit-thumb"
                      onError={(e) => { e.target.style.display = "none"; }} />
                  </div>
                  <div>
                    <h3 className="bam-form-h">{editBanker.name}</h3>
                    <p className="bam-form-sub">Since {new Date(editBanker.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p>
                  </div>
                  <button className="icon-btn" onClick={() => { setPanel("access"); setEditBanker(null); }}><X size={16} /></button>
                </div>
                <form onSubmit={handleEdit} className="bam-form">
                  <div className="bam-field">
                    <label>Bank</label>
                    <div className="bam-select-wrap">
                      {editBank && <img src={getBankLogo(editBank)} alt={editBank} className="bam-select-logo" />}
                      <select className={`bam-select${editBank ? " has-logo" : ""}`} value={editBank} onChange={(e) => setEditBank(e.target.value)}>
                        <option value="">— Select bank —</option>
                        {BANK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="bam-field">
                    <label>New Password <span className="bam-hint">(leave blank to keep current)</span></label>
                    <div className="bam-pw-wrap">
                      <input className="bam-input" type={editShowPass ? "text" : "password"} placeholder="Min. 6 characters" value={editPass} onChange={(e) => setEditPass(e.target.value)} />
                      <button type="button" className="bam-pw-toggle" onClick={() => setEditShowPass(!editShowPass)}>
                        {editShowPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  {editMsg && <div className={`bam-msg ${editMsg.type}`}>{editMsg.text}</div>}
                  <div className="bam-form-actions">
                    <button type="submit" className="bam-submit-btn" disabled={editLoading}>
                      {editLoading ? <><RefreshCw size={13} className="spin" /> Saving…</> : <><CheckCircle size={13} /> Save Changes</>}
                    </button>
                    <button type="button" className="bam-cancel-btn" onClick={() => { setPanel("access"); setEditBanker(null); }}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </div>
      </div>
  );
}

/* ─── Settings Panel ───────────────────────────────────────────── */

const API_URL = import.meta.env.VITE_API_URL ?? '';

function getToken() {
  try { return JSON.parse(localStorage.getItem("abroad_admin_session") || "{}").token || ""; }
  catch { return ""; }
}

async function callAPI(method, path, body) {
  const token = getToken();
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, opts);
  return res.json();
}

function SettingsPanel({ onClose, adminName, adminRole }) {
  const [tab, setTab] = useState("password");

  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passMsg, setPassMsg] = useState(null);
  const [passLoading, setPassLoading] = useState(false);

  const [teamPass, setTeamPass] = useState("");
  const [teamVerified, setTeamVerified] = useState(false);
  const [teamVerifying, setTeamVerifying] = useState(false);
  const [teamErr, setTeamErr] = useState("");
  const [admins, setAdmins] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("advisor");
  const [newAdminPass, setNewAdminPass] = useState("");
  const [showNewAdminPass, setShowNewAdminPass] = useState(false);
  const [createMsg, setCreateMsg] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [resetPwTarget, setResetPwTarget] = useState(null);
  const [resetPwValue, setResetPwValue] = useState("");
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwMsg, setResetPwMsg] = useState(null);

  const loadAdmins = async () => {
    setAdminsLoading(true);
    try {
      const d = await callAPI("GET", "/api/admins");
      if (d.success) setAdmins(d.admins || []);
    } catch { /* silent */ }
    finally { setAdminsLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (resetPwValue.length < 6) { setResetPwMsg({ type: "err", text: "Password must be at least 6 characters." }); return; }
    setResetPwLoading(true); setResetPwMsg(null);
    try {
      const r = await callAPI("PUT", `/api/admins/${encodeURIComponent(resetPwTarget)}/reset-password`, { newPassword: resetPwValue });
      if (r.success) {
        setResetPwMsg({ type: "ok", text: `Password reset for ${resetPwTarget}.` });
        setResetPwValue("");
        setTimeout(() => { setResetPwTarget(null); setResetPwMsg(null); }, 1500);
      } else {
        setResetPwMsg({ type: "err", text: r.error || "Failed to reset password." });
      }
    } catch { setResetPwMsg({ type: "err", text: "Network error. Try again." }); }
    finally { setResetPwLoading(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPass.length < 6) { setPassMsg({ type: "err", text: "New password must be at least 6 characters." }); return; }
    if (newPass !== confirmPass) { setPassMsg({ type: "err", text: "Passwords do not match." }); return; }
    setPassLoading(true); setPassMsg(null);
    try {
      const r = await callAPI("PUT", "/api/admins/password", { currentPassword: curPass, newPassword: newPass });
      if (r.success) {
        setPassMsg({ type: "ok", text: "Password updated successfully." });
        setCurPass(""); setNewPass(""); setConfirmPass("");
      } else {
        setPassMsg({ type: "err", text: r.error || "Failed to update password." });
      }
    } catch { setPassMsg({ type: "err", text: "Network error. Try again." }); }
    finally { setPassLoading(false); }
  };

  const handleVerifyTeamPass = async (e) => {
    e.preventDefault(); setTeamVerifying(true); setTeamErr("");
    try {
      const r = await callAPI("POST", "/api/auth/login", { name: adminName, password: teamPass });
      if (r.success && (r.role === "superadmin" || r.role === "advisor")) {
        setTeamVerified(true);
        if (r.role === "superadmin") loadAdmins();
      } else {
        setTeamErr("Incorrect password.");
      }
    } catch { setTeamErr("Network error. Try again."); }
    finally { setTeamVerifying(false); }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (!newName.trim()) { setCreateMsg({ type: "err", text: "Name is required." }); return; }
    if (newAdminPass.length < 6) { setCreateMsg({ type: "err", text: "Password must be at least 6 characters." }); return; }
    setCreateLoading(true); setCreateMsg(null);
    try {
      const r = await callAPI("POST", "/api/admins", { name: newName.trim(), role: newRole, password: newAdminPass });
      if (r.success) {
        setCreateMsg({ type: "ok", text: `${newName.trim()} created successfully.` });
        setNewName(""); setNewAdminPass(""); setNewRole("advisor");
        loadAdmins();
      } else {
        setCreateMsg({ type: "err", text: r.error || "Failed to create admin." });
      }
    } catch { setCreateMsg({ type: "err", text: "Network error. Try again." }); }
    finally { setCreateLoading(false); }
  };

  const handleDeleteAdmin = async (name) => {
    setDeleteLoading(true);
    try {
      const r = await callAPI("DELETE", `/api/admins/${encodeURIComponent(name)}`);
      if (r.success) { setDeleteTarget(null); loadAdmins(); }
      else { alert(r.error || "Failed to delete."); }
    } catch { alert("Network error. Try again."); }
    finally { setDeleteLoading(false); }
  };

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-panel animate-fade-in">
        <div className="settings-header">
          <div className="settings-title"><Settings size={16} /> Settings</div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="settings-tabs">
          <button className={`settings-tab${tab === "password" ? " active" : ""}`} onClick={() => setTab("password")}>
            <KeyRound size={16} />
            <span>Password</span>
          </button>
          {adminRole === "superadmin" && (
            <button
              className={`settings-tab${tab === "team" ? " active" : ""}`}
              onClick={() => { setTab("team"); if (teamVerified) loadAdmins(); }}
            >
              <UserCheck size={16} />
              <span>Team</span>
            </button>
          )}
        </div>

        <div className="settings-body">
          {tab === "password" && (
            <form onSubmit={handleChangePassword} className="settings-form">
              <p className="settings-section-label">Update your login password</p>
              <div className="input-group">
                <label>Current Password</label>
                <div className="password-wrap">
                  <input className="input-field" type={showPass ? "text" : "password"} placeholder="Your current password"
                    value={curPass} onChange={(e) => setCurPass(e.target.value)} />
                  <button type="button" className="show-pass" onClick={() => setShowPass(!showPass)}>
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="input-group">
                <label>New Password</label>
                <input className="input-field" type={showPass ? "text" : "password"} placeholder="Min. 6 characters"
                  value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Confirm New Password</label>
                <input className="input-field" type={showPass ? "text" : "password"} placeholder="Repeat new password"
                  value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
              </div>
              {passMsg && <p className={`settings-msg ${passMsg.type}`}>{passMsg.text}</p>}
              <button type="submit" className="btn btn-primary btn-sm" disabled={passLoading}>
                {passLoading ? <><RefreshCw size={13} className="spin" /> Saving…</> : <><KeyRound size={13} /> Update Password</>}
              </button>
            </form>
          )}

          {tab === "team" && (
            <div>
              {!teamVerified ? (
                <form onSubmit={handleVerifyTeamPass} className="settings-form">
                  <p className="settings-section-label">Enter your password to manage the team</p>
                  <div className="input-group">
                    <label>Your Password</label>
                    <div className="password-wrap">
                      <input className="input-field" type={showPass ? "text" : "password"} placeholder="Confirm your identity"
                        value={teamPass} onChange={(e) => setTeamPass(e.target.value)} autoFocus />
                      <button type="button" className="show-pass" onClick={() => setShowPass(!showPass)}>
                        {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  {teamErr && <p className="settings-msg err">{teamErr}</p>}
                  <button type="submit" className="btn btn-primary btn-sm" disabled={teamVerifying}>
                    {teamVerifying ? <><RefreshCw size={13} className="spin" /> Verifying…</> : <><Shield size={13} /> Verify & Continue</>}
                  </button>
                </form>
              ) : (
                <div>
                  <p className="settings-section-label">Current Team</p>
                  {adminsLoading ? (
                    <div className="admin-loading" style={{ padding: "24px 0" }}>
                      <div className="loading-dots"><span /><span /><span /></div>
                    </div>
                  ) : (
                    <div className="team-list">
                      {admins.map((a) => (
                        <div key={a.name} className="team-row">
                          <div className="team-avatar">{a.name[0].toUpperCase()}</div>
                          <div className="team-info">
                            <span className="team-name">{a.name}</span>
                            <span className={`team-role-badge ${a.role}`}>
                              {a.role === "superadmin" ? "Super Admin" : a.role === "banker" ? "Banker" : "Advisor"}
                            </span>
                          </div>
                          {a.name !== adminName && (
                            deleteTarget === a.name ? (
                              <div className="team-delete-confirm">
                                <span>Delete?</span>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAdmin(a.name)} disabled={deleteLoading}>
                                  {deleteLoading ? <RefreshCw size={12} className="spin" /> : "Yes"}
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>No</button>
                              </div>
                            ) : (
                              <>
                                <button className="icon-btn" title={`Reset ${a.name}'s password`} onClick={() => { setResetPwTarget(a.name); setResetPwValue(""); setResetPwMsg(null); }}>
                                  <KeyRound size={13} />
                                </button>
                                <button className="icon-btn del-btn" title={`Remove ${a.name}`} onClick={() => setDeleteTarget(a.name)}>
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="settings-section-label" style={{ marginTop: 20 }}>Add New Member</p>
                  <form onSubmit={handleCreateAdmin} className="settings-form">
                    <div className="input-group">
                      <label>Name</label>
                      <input className="input-field" type="text" placeholder="e.g. Ravi" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Role</label>
                      <select className="input-field" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                        <option value="advisor">Advisor</option>
                        <option value="banker">Banker</option>
                        <option value="superadmin">Super Admin</option>
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Password</label>
                      <div className="password-wrap">
                        <input className="input-field" type={showNewAdminPass ? "text" : "password"} placeholder="Min. 6 characters"
                          value={newAdminPass} onChange={(e) => setNewAdminPass(e.target.value)} />
                        <button type="button" className="show-pass" onClick={() => setShowNewAdminPass(!showNewAdminPass)}>
                          {showNewAdminPass ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    {createMsg && <p className={`settings-msg ${createMsg.type}`}>{createMsg.text}</p>}
                    <button type="submit" className="btn btn-primary btn-sm" disabled={createLoading}>
                      {createLoading ? <><RefreshCw size={13} className="spin" /> Creating…</> : <><Plus size={13} /> Create Member</>}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {resetPwTarget && (
        <div className="modal-backdrop" onClick={() => !resetPwLoading && setResetPwTarget(null)}>
          <div className="modal-box animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon"><KeyRound size={28} /></div>
            <h3>Reset Password</h3>
            <p>
              Set a new password for <strong>{resetPwTarget}</strong>. They'll need to use it next time they log in.
            </p>
            <form onSubmit={handleResetPassword} className="settings-form" style={{ textAlign: "left" }}>
              <div className="input-group">
                <label>New Password</label>
                <input className="input-field" type="password" placeholder="Min. 6 characters" value={resetPwValue} onChange={(e) => setResetPwValue(e.target.value)} autoFocus />
              </div>
              {resetPwMsg && <p className={`settings-msg ${resetPwMsg.type}`}>{resetPwMsg.text}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setResetPwTarget(null)} disabled={resetPwLoading}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={resetPwLoading}>
                  {resetPwLoading ? <><RefreshCw size={13} className="spin" /> Resetting…</> : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Main Component ───────────────────────────────────────────── */

// A stable per-student identity for React keys and state tracking.
// driveUrl is always unique (one Drive folder per student); name is NOT —
// two students can share a display name, and a student whose meta.json
// failed to parse falls back to showing its raw folder-key name, which can
// collide with another record. Using name/array-index as a key or state
// pointer lets the wrong row appear expanded/selected after a filter or
// list refresh reorders things.
function studentKey(s) {
  return s.driveUrl || s.email || s.phone || s.name;
}

/* ─── Sidebar navigation ──────────────────────────────────────────── */

const LOAN_STATUS_SUBITEMS = [
  { value: "pending", label: "Pending" },
  { value: "inprocess", label: "In Process" },
  { value: "sanctioned", label: "Sanctioned" },
  { value: "disbursed", label: "Disbursed" },
  { value: "rejected", label: "Rejected" },
  { value: "dropped", label: "Dropped" },
];
const DOC_PROGRESS_SUBITEMS = [
  { value: "complete", label: "Completed" },
  { value: "progress", label: "In Progress" },
  { value: "notStarted", label: "Not Started" },
];

function AdminSidebar({
  section, setSection, adminRole, adminName,
  onOpenSettings, onLogout,
  mobileOpen, onCloseMobile,
  setLoanStatusFilter, setDocFilter,
}) {
  const [expanded, setExpanded] = useState(null);

  const goStudents = (apply) => {
    setSection("students");
    apply?.();
    onCloseMobile?.();
  };

  const NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid, roles: ["superadmin", "advisor"] },
    { id: "students",  label: "Students",  icon: Users,      roles: ["superadmin", "advisor"] },
    { id: "advisors",  label: "Advisors",  icon: UserCheck,  roles: ["superadmin"] },
    {
      id: "loanApps", label: "Loan Applications", icon: FileText, roles: ["superadmin", "advisor"],
      subItems: LOAN_STATUS_SUBITEMS.map((s) => ({
        label: s.label,
        onSelect: () => goStudents(() => setLoanStatusFilter(s.value)),
      })),
    },
    {
      id: "documents", label: "Document Management", icon: FolderOpen, roles: ["superadmin", "advisor"],
      subItems: DOC_PROGRESS_SUBITEMS.map((s) => ({
        label: s.label,
        onSelect: () => goStudents(() => setDocFilter(s.value)),
      })),
    },
    { id: "banks", label: "Banks & Lenders", icon: Landmark, roles: ["superadmin", "advisor"] },
    {
      id: "reports", label: "Reports", icon: BarChart3, roles: ["superadmin"],
      subItems: [
        { label: "Audit Log", onSelect: () => { setSection("audit"); onCloseMobile?.(); } },
        { label: "Bank Activity", onSelect: () => { setSection("bankActivity"); onCloseMobile?.(); } },
      ],
    },
  ];
  const visibleNav = NAV_ITEMS.filter((n) => n.roles.includes(adminRole));

  return (
    <>
      {mobileOpen && <div className="admin-sidebar-scrim" onClick={onCloseMobile} />}
      <aside className={`admin-sidebar${mobileOpen ? " is-open" : ""}`}>
        <div className="admin-sidebar-brand">
          <div className="admin-sidebar-brand-icon"><img src={logoImg} alt="" /></div>
          <div className="admin-sidebar-brand-text">
            <span className="admin-sidebar-brand-name">DocLocker</span>
            <span className="admin-sidebar-brand-tag">Admin Console</span>
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          <p className="admin-sidebar-nav-label">Workspace</p>
          {visibleNav.map(({ id, label, icon: Icon, subItems }) => {
            const isActiveSection = id === "reports" ? (section === "audit" || section === "bankActivity") : section === id;
            const isExpanded = expanded === id;
            return (
              <div key={id}>
                <button
                  className={`admin-sidebar-link${isActiveSection && !subItems ? " active" : ""}`}
                  onClick={() => {
                    if (subItems) setExpanded(isExpanded ? null : id);
                    else { setSection(id); onCloseMobile?.(); }
                  }}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {subItems ? (
                    <ChevronRight size={14} className={`admin-sidebar-link-chevron${isExpanded ? " is-expanded" : ""}`} />
                  ) : (
                    isActiveSection && <span className="admin-sidebar-link-dot" />
                  )}
                </button>
                {subItems && isExpanded && (
                  <div className="admin-sidebar-sublinks">
                    {subItems.map((s) => (
                      <button key={s.label} className="admin-sidebar-sublink" onClick={s.onSelect}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <p className="admin-sidebar-nav-label">Manage</p>
          <button className="admin-sidebar-link" onClick={() => { onOpenSettings(); onCloseMobile?.(); }}>
            <Settings size={18} />
            <span>Settings</span>
            <ArrowUpRight size={13} className="admin-sidebar-link-ext" />
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-user">
            <div className="admin-sidebar-user-avatar">{(adminName || "?")[0].toUpperCase()}</div>
            <div className="admin-sidebar-user-info">
              <span className="admin-sidebar-user-name">{adminName}</span>
              <span className="admin-sidebar-user-role">{adminRole === "superadmin" ? "Super Admin" : "Advisor"}</span>
            </div>
          </div>

          <button className="admin-sidebar-logout" onClick={onLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}

/* ─── Top header bar: global quick-search + notifications + account ─── */

function AdminTopbar({ search, setSearch, section, setSection, adminName, adminRole, onOpenSettings, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="admin-topbar">
      <label className="admin-topbar-search">
        <Search size={16} />
        <input
          type="text"
          placeholder="Search by student name, email or phone…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value && section !== "students") setSection("students");
          }}
        />
        {!search && <kbd className="admin-topbar-kbd">/</kbd>}
        {search && (
          <button type="button" className="admin-topbar-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
            <X size={13} />
          </button>
        )}
      </label>

      <div className="admin-topbar-actions">
        <button type="button" className="admin-topbar-icon-btn" title="Notifications" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <div className="admin-topbar-divider" />
        <div className="admin-topbar-user-wrap">
          <button type="button" className="admin-topbar-user" onClick={() => setMenuOpen((o) => !o)}>
            <div className="admin-topbar-avatar">{(adminName || "?")[0].toUpperCase()}</div>
            <div className="admin-topbar-user-text">
              <span className="admin-topbar-user-name">{adminName}</span>
              <span className="admin-topbar-user-role">{adminRole === "superadmin" ? "Super Admin" : "Advisor"}</span>
            </div>
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="admin-topbar-menu-scrim" onClick={() => setMenuOpen(false)} />
              <div className="admin-topbar-menu">
                <button onClick={() => { onOpenSettings(); setMenuOpen(false); }}>
                  <Settings size={14} /> Settings
                </button>
                <button className="danger" onClick={() => { onLogout(); setMenuOpen(false); }}>
                  <LogOut size={14} /> Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Advisors section ────────────────────────────────────────────── */

function AdvisorsSection({ students, allAdvisors }) {
  const rows = allAdvisors
    .map((name) => {
      const list = students.filter((s) => s.advisor === name);
      const complete = list.filter((s) => getOverallProgress(s) === 100).length;
      return { name, total: list.length, complete };
    })
    .sort((a, b) => b.total - a.total);

  if (allAdvisors.length === 0) {
    return (
      <div className="admin-empty animate-fade-in">
        <div className="admin-empty-icon"><UserCheck size={28} /></div>
        <h3>No advisors registered</h3>
        <p>Add an advisor account from Settings → Add New Member.</p>
      </div>
    );
  }

  return (
    <div className="advisor-grid animate-fade-in">
      {rows.map((r) => {
        const pct = r.total ? Math.round((r.complete / r.total) * 100) : 0;
        return (
          <div key={r.name} className="advisor-card">
            <div className="advisor-card-top">
              <div className="advisor-card-avatar">{r.name[0].toUpperCase()}</div>
              <div className="advisor-card-body">
                <h3>{r.name}</h3>
                <p>{r.total} student{r.total === 1 ? "" : "s"} assigned</p>
              </div>
            </div>
            <div className="advisor-card-stat-row">
              <span>{r.complete} complete</span>
              <span>{pct}%</span>
            </div>
            <div className="advisor-card-bar">
              <div className="advisor-card-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Audit log section ───────────────────────────────────────────── */

const AUDIT_ACTION_LABELS = {
  "auth.login": "Signed in",
  "admin.create": "Created account",
  "admin.delete": "Removed account",
  "admin.reset_password": "Reset a password",
  "admin.change_own_password": "Changed own password",
  "student.delete": "Deleted student",
  "loan_status.update": "Updated loan status",
  "banker_access.grant": "Granted bank access",
  "banker_access.revoke": "Revoked bank access",
};

function auditActionLabel(action) {
  return AUDIT_ACTION_LABELS[action] || action;
}

// Action prefix -> a real icon (not just a dot) and the tone token that
// already exists for KPI cards / loan-status cards, so this feed borrows
// the same color language instead of inventing a new one.
const AUDIT_ACTION_ICON = {
  auth: LogIn,
  admin: Shield,
  student: Trash2,
  loan_status: Banknote,
  banker_access: Landmark,
};
const AUDIT_ACTION_TONE = {
  auth: "blue",
  admin: "violet",
  student: "rose",
  loan_status: "orange",
  banker_access: "teal",
};

// "2m ago" / "Just now" — recomputed on a slow tick (see the second effect
// below) so labels stay accurate without re-fetching data every minute.
function timeAgo(ts) {
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  if (diffSec < 45) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

// Right-rail companion to the dashboard's KPI cards — a running feed of the
// same audit log the full Audit Log screen shows, trimmed to the most
// recent entries and polished for a glance rather than an investigation.
// Polls quietly in the background so it reads as "live" without a socket;
// entries that weren't in the previous poll get a brief highlight so a
// genuinely new event is visible, without replaying that animation on
// every 30s poll for rows that were already there.
function LiveActivityFeed() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState(() => new Set());
  const [, setClock] = useState(0);
  const seenIds = useRef(null);

  const load = useCallback(async () => {
    try {
      const { entries: fetched } = await getAuditLog({ limit: 25 });
      if (seenIds.current) {
        const arrived = fetched.filter((e) => !seenIds.current.has(e.id)).map((e) => e.id);
        if (arrived.length) {
          setNewIds(new Set(arrived));
          setTimeout(() => setNewIds(new Set()), 1800);
        }
      }
      seenIds.current = new Set(fetched.map((e) => e.id));
      setEntries(fetched);
    } catch {
      // Best-effort companion widget — the full Audit Log screen is the
      // place to surface a real fetch failure, not this glance panel.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  // Keeps "3m ago" honest between polls without touching the network.
  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="live-feed animate-fade-in">
      <div className="live-feed-head">
        <p className="live-feed-title">
          <span className="live-feed-pulse" />
          Live Activity
        </p>
        <span className="live-feed-tag">Audit log</span>
      </div>

      <div className="live-feed-list">
        {loading ? (
          <div className="live-feed-loading">
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        ) : entries.length === 0 ? (
          <p className="live-feed-empty">No recent activity yet.</p>
        ) : (
          entries.map((e, i) => {
            const prefix = e.action.split(".")[0];
            const Icon = AUDIT_ACTION_ICON[prefix] || History;
            const tone = AUDIT_ACTION_TONE[prefix] || "slate";
            return (
              <div
                key={e.id}
                className={`live-feed-row tone-${tone}${newIds.has(e.id) ? " is-new" : ""}${i === entries.length - 1 ? " is-last" : ""}`}
              >
                <span className="live-feed-row-rail">
                  <span className="live-feed-row-marker"><Icon size={13} /></span>
                  <span className="live-feed-row-line" />
                </span>
                <div className="live-feed-row-body">
                  <p className="live-feed-row-action">{auditActionLabel(e.action)}</p>
                  <p className="live-feed-row-meta">
                    {e.actor}
                    <span className="live-feed-row-dot">·</span>
                    {timeAgo(e.ts)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function AuditLogSection() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logErr, setLogErr] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setLogErr("");
    try {
      const { entries: fetched } = await getAuditLog({ limit: 300 });
      setEntries(fetched);
    } catch (e) {
      setLogErr("Could not load audit log: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const actionOptions = Array.from(new Set(entries.map((e) => e.action))).sort();
  const filtered = actionFilter === "all" ? entries : entries.filter((e) => e.action === actionFilter);

  return (
    <div className="audit-panel animate-fade-in">
      <div className="audit-toolbar">
        <div className="audit-toolbar-filter">
          <Filter size={13} />
          <select className="advisor-filter-select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">All actions</option>
            {actionOptions.map((a) => <option key={a} value={a}>{auditActionLabel(a)}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? "spin" : ""} />
          <span className="btn-label">Refresh</span>
        </button>
      </div>

      {logErr && (
        <div className="admin-error animate-fade-in">
          <AlertCircle size={15} />{logErr}
          <button className="close-err" onClick={() => setLogErr("")}><X size={13} /></button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">
          <div className="loading-dots"><span /><span /><span /></div>
          Loading audit trail…
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-icon"><History size={28} /></div>
          <h3>No activity recorded yet</h3>
          <p>Logins, loan status changes, and account management actions will show up here.</p>
        </div>
      ) : (
        <div className="audit-table">
          <div className="audit-row audit-row--head">
            <span>Action</span>
            <span>Actor</span>
            <span>Target</span>
            <span>When</span>
          </div>
          {filtered.map((e) => (
            <div className="audit-row" key={e.id}>
              <span className="audit-action">
                <span className={`audit-dot audit-dot--${e.action.split(".")[0]}`} />
                {auditActionLabel(e.action)}
              </span>
              <span className="audit-actor">
                {e.actor}
                {e.role && <span className="audit-role-pill">{e.role}</span>}
              </span>
              <span className="audit-target" title={e.target}>{e.target || "—"}</span>
              <span className="audit-time">
                {new Date(e.ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bank Activity Report ────────────────────────────────────────────────
// Every audited action that can be tied to a bank/lender — a student's own
// saves/uploads/summary generation, an advisor's loan-status update, a
// banker's own access grant/revoke — grouped and filterable by that bank.
// Audit entries only ever carry a student folder-key string, never a bank,
// so the bank is derived per entry rather than read directly:
//   - banker_access.grant/revoke already names the banker in its own
//     details, so its bank is exact even after a later revoke changes the
//     student's CURRENT sharedBankers state.
//   - everything else (saves, uploads, summaries, loan-status updates) is
//     resolved via the target student's current sharedBankers -> banker ->
//     bank chain — the only association DocLocker actually records.
// An entry with no resolvable bank (e.g. a deleted student, or a student
// never yet shared with any banker) is simply left out of this report; the
// full unfiltered trail is still on the Audit Log page.
const BANK_ACTIVITY_ACTION_LABELS = {
  ...AUDIT_ACTION_LABELS,
  "document.upload": "Uploaded a document",
  "student.save": "Saved application details",
  "summary.generate": "Generated application summary",
};
function bankActivityActionLabel(action) {
  return BANK_ACTIVITY_ACTION_LABELS[action] || action;
}
const BANK_ACTIVITY_ACTION_ICON = {
  ...AUDIT_ACTION_ICON,
  document: Upload,
  summary: FileText,
};
// Color-coded by WHO acted rather than by action — a single bank's feed
// mixes student/advisor/banker/superadmin activity, and telling those
// apart at a glance is this report's whole point.
const ACTOR_ROLE_TONE = { student: "blue", advisor: "violet", banker: "teal", superadmin: "orange" };

// Mirrors Backend/src/services/drive.js's sanitize() exactly — this is the
// only way to reconstruct the same folder-key string the backend computed
// for entry.target, since the frontend never receives that key directly.
function sanitizeFolderKeyPart(str) {
  return String(str || "Unknown").replace(/[^a-zA-Z0-9 _\-.]/g, "_").trim() || "Unknown";
}
function studentAuditTarget(s) {
  return sanitizeFolderKeyPart(buildFolderKey(s.name, s.email || s.phone || ""));
}

function BankActivityReportSection({ students, bankers }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedBank, setSelectedBank] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const { entries: fetched } = await getAuditLog({ limit: 500 });
      setEntries(fetched);
    } catch (e) {
      setErr("Could not load activity: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const bankersByName = new Map(bankers.map((b) => [b.name, b]));
  const studentByTarget = new Map(students.map((s) => [studentAuditTarget(s), s]));

  const classified = entries
    .map((e) => {
      let banks = [];
      if (e.action === "banker_access.grant" || e.action === "banker_access.revoke") {
        const bank = bankersByName.get(e.details?.banker || "")?.bank;
        if (bank) banks = [bank];
      } else {
        const student = studentByTarget.get(e.target);
        if (student) {
          const set = new Set();
          (student.sharedBankers || []).forEach((name) => {
            const bank = bankersByName.get(name)?.bank;
            if (bank) set.add(bank);
          });
          banks = Array.from(set);
        }
      }
      if (!banks.length) return null;
      return { ...e, banks, studentName: studentByTarget.get(e.target)?.name || null };
    })
    .filter(Boolean);

  const bankCounts = new Map();
  classified.forEach((e) => e.banks.forEach((b) => bankCounts.set(b, (bankCounts.get(b) || 0) + 1)));
  const uniqueBanks = Array.from(bankCounts.keys()).sort();

  const roleOptions = Array.from(new Set(classified.map((e) => e.role).filter(Boolean))).sort();
  const actionOptions = Array.from(new Set(classified.map((e) => e.action))).sort();

  const visible = classified.filter((e) =>
    (selectedBank === "all" || e.banks.includes(selectedBank)) &&
    (actionFilter === "all" || e.action === actionFilter) &&
    (roleFilter === "all" || e.role === roleFilter)
  );

  return (
    <div className="bar-panel animate-fade-in">
      <div className="bar-toolbar">
        <div className="bar-toolbar-filters">
          <div className="audit-toolbar-filter">
            <Filter size={13} />
            <select className="advisor-filter-select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="all">All actions</option>
              {actionOptions.map((a) => <option key={a} value={a}>{bankActivityActionLabel(a)}</option>)}
            </select>
          </div>
          <div className="audit-toolbar-filter">
            <UsersIcon size={13} />
            <select className="advisor-filter-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">Everyone</option>
              {roleOptions.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? "spin" : ""} />
          <span className="btn-label">Refresh</span>
        </button>
      </div>

      {err && (
        <div className="admin-error animate-fade-in">
          <AlertCircle size={15} />{err}
          <button className="close-err" onClick={() => setErr("")}><X size={13} /></button>
        </div>
      )}

      <div className="bar-bank-rail">
        <button
          type="button"
          className={`bar-bank-tile${selectedBank === "all" ? " active" : ""}`}
          onClick={() => setSelectedBank("all")}
        >
          <span className="bar-bank-tile-logo bar-bank-tile-logo--all"><Building2 size={18} /></span>
          <span className="bar-bank-tile-name">All Banks</span>
          <span className="bar-bank-tile-count">{classified.length}</span>
        </button>
        {uniqueBanks.map((bank) => (
          <button
            type="button"
            key={bank}
            className={`bar-bank-tile${selectedBank === bank ? " active" : ""}`}
            onClick={() => setSelectedBank(bank)}
          >
            <span className="bar-bank-tile-logo">
              <img src={getBankLogo(bank)} alt="" onError={(e) => { e.target.style.display = "none"; }} />
            </span>
            <span className="bar-bank-tile-name">{bank}</span>
            <span className="bar-bank-tile-count">{bankCounts.get(bank)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="admin-loading">
          <div className="loading-dots"><span /><span /><span /></div>
          Loading bank activity…
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-icon"><Landmark size={28} /></div>
          <h3>No bank-linked activity yet</h3>
          <p>Once a student is shared with a bank's officer, their saves, uploads, and status changes will show up here.</p>
        </div>
      ) : (
        <div className="bar-feed">
          {visible.map((e) => {
            const prefix = e.action.split(".")[0];
            const Icon = BANK_ACTIVITY_ACTION_ICON[prefix] || History;
            const tone = ACTOR_ROLE_TONE[e.role] || "slate";
            return (
              <div key={e.id} className={`bar-row tone-${tone}`}>
                <span className="bar-row-rail">
                  <span className="bar-row-marker"><Icon size={13} /></span>
                  <span className="bar-row-line" />
                </span>
                <div className="bar-row-body">
                  <div className="bar-row-top">
                    <p className="bar-row-action">{bankActivityActionLabel(e.action)}</p>
                    <div className="bar-row-banks">
                      {e.banks.map((b) => (
                        <span key={b} className="bar-row-bank-tag">
                          <img src={getBankLogo(b)} alt="" onError={(ev) => { ev.target.style.display = "none"; }} />
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="bar-row-meta">
                    <span className={`bar-role-pill role-${e.role}`}>{e.role}</span>
                    <span className="bar-row-actor">{e.actor}</span>
                    {e.studentName && (
                      <>
                        <span className="bar-row-dot">·</span>
                        {e.studentName}
                      </>
                    )}
                    <span className="bar-row-dot">·</span>
                    {new Date(e.ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const { isAdmin, adminRole, adminAdvisorName, adminName, logoutAdmin, clearStudent } = useStudent();
  const navigate = useNavigate();

  const [section, setSection] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Frozen at mount rather than read fresh on every render — a "this week"
  // stat doesn't need millisecond accuracy, and calling Date.now() directly
  // in the render body is an impure call React's hook rules flag. A useState
  // lazy initializer is the documented escape valve: React only invokes it
  // once, on mount, never during a normal render pass.
  const [nowRef] = useState(() => Date.now());

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [advisorFilter, setAdvisorFilter] = useState("all");
  const [bankerFilter, setBankerFilter] = useState("all");
  const [loanStatusFilter, setLoanStatusFilter] = useState("all");
  const [consultancyFilter, setConsultancyFilter] = useState("");
  const [bankers, setBankers] = useState([]);
  const [allAdvisors, setAllAdvisors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Tracks the expanded row by a stable per-student key (driveUrl, falling
  // back to email/phone/name), NOT by array index or by name alone. Both of
  // those break as soon as the list is filtered/reordered or two students
  // share a display name (e.g. a corrupted meta record falling back to its
  // raw folder-key name) — the wrong row would appear expanded, showing one
  // student's data on another student's row.
  const [expandedKey, setExpandedKey] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [reportStudent, setReportStudent] = useState(null);
  const [bankStudent, setBankStudent] = useState(null);
  const [loanStatusStudent, setLoanStatusStudent] = useState(null);
  const [recoverStudent, setRecoverStudent] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!isAdmin) navigate("/admin-login");
  }, [isAdmin, navigate]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fetched = await getAllStudentsFromDrive();
      setStudents(fetched || []);
    } catch (e) {
      setError("Could not load students: " + e.message);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBankers = useCallback(async () => {
    try {
      const r = await callAPI("GET", "/api/admins/bankers");
      if (r.success) setBankers(r.bankers || []);
    } catch { /* silent — banker filter just won't show options */ }
  }, []);

  // Full set of registered advisor accounts (not just those with students
  // already assigned) — lets a superadmin hand a first student to an advisor
  // who currently has none.
  const loadAdvisors = useCallback(async () => {
    try {
      const r = await callAPI("GET", "/api/advisors");
      if (r.success) setAllAdvisors(r.advisors || []);
    } catch { /* silent — advisor reassignment dropdown just won't show options */ }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudents();
    void loadBankers();
    void loadAdvisors();
  }, [isAdmin, loadStudents, loadBankers, loadAdvisors]);

  // Deletes by the actual student object (not by name — display names are
  // not unique, e.g. two students can share a name, or a corrupted meta
  // record falls back to showing its raw folder-key name). Matching by name
  // could delete/hide the wrong row when two students collide on it.
  const handleDelete = async (student) => {
    setDeleting(true);
    try {
      const identifier = student.email || student.phone || "";
      await deleteStudent(student.name, identifier, student.driveUrl || "");
      const key = studentKey(student);
      setStudents((prev) => prev.filter((s) => studentKey(s) !== key));
      setConfirmDelete(null);
      setExpandedKey((cur) => (cur === key ? null : cur));
      // Re-sync from the backend — the cache was just cleared server-side,
      // so this confirms the delete actually stuck instead of trusting the
      // optimistic local removal alone.
      void loadStudents();
    } catch (e) {
      setError("Delete failed: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleAccessChanged = (name, sharedBankers) => {
    setStudents((prev) => prev.map((s) => s.name === name ? { ...s, sharedBankers } : s));
  };

  const handleLoanStatusChange = (name, loanStatus, loanRemark, loanDisbursement) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.name === name
          ? { ...s, loanStatus, loanRemark, ...(loanDisbursement ? { loanDisbursement } : {}) }
          : s,
      ),
    );
  };

  // Advisor sets/corrects a student's consultancy from the admin panel.
  // Writes the same meta field the student portal fills (personalInfo.consultantNameLoc)
  // via the staff-only /api/meta route, so portal, summary PDF, and the
  // consultancy filter all stay in sync.
  const handleConsultancySave = async (student, value) => {
    // Strip backend-added listing fields so only real meta goes back to Drive
    const meta = { ...student };
    delete meta.driveUrl;
    delete meta._parseError;
    const updatedMeta = {
      ...meta,
      personalInfo: { ...(meta.personalInfo || {}), consultantNameLoc: value },
    };
    const identifier = student.email || student.phone || "";
    const folderKey = buildFolderKey(student.name, identifier);
    const r = await callAPI("POST", "/api/meta", {
      studentName: folderKey,
      metaJson: JSON.stringify(updatedMeta),
    });
    if (!r.success) throw new Error(r.error || "Could not save consultancy");
    setStudents((prev) =>
      prev.map((s) => (s.name === student.name ? { ...s, personalInfo: updatedMeta.personalInfo } : s)),
    );
  };

  // Superadmin reassigns which advisor a student belongs to. Writes the
  // student's top-level `advisor` field via the same staff-only /api/meta
  // route — this is also the field advisor-role scoping filters on
  // (scopedStudents above), so a reassignment immediately moves the student
  // off the old advisor's dashboard and onto the new one's.
  const handleAdvisorSave = async (student, value) => {
    const meta = { ...student };
    delete meta.driveUrl;
    delete meta._parseError;
    const updatedMeta = { ...meta, advisor: value };
    const identifier = student.email || student.phone || "";
    const folderKey = buildFolderKey(student.name, identifier);
    const r = await callAPI("POST", "/api/meta", {
      studentName: folderKey,
      metaJson: JSON.stringify(updatedMeta),
    });
    if (!r.success) throw new Error(r.error || "Could not save advisor");
    setStudents((prev) =>
      prev.map((s) => (s.name === student.name ? { ...s, advisor: value } : s)),
    );
  };

  const openDriveFolder = (s) => {
    const url =
      s.driveUrl ||
      s.driveFolderUrl ||
      (import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID
        ? `https://drive.google.com/drive/folders/${import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID}`
        : null);
    if (url) window.open(url, "_blank");
  };

  const handleLogout = () => {
    clearStudent();
    logoutAdmin();
    navigate("/");
  };

  // Flags students sharing a non-empty email or phone with another student —
  // a sign of a duplicate Drive folder (most commonly from a double-submit
  // race during registration/upload, before getOrCreate serialized those
  // calls server-side). Computed across the FULL unscoped list so a
  // superadmin sees cross-advisor duplicates too.
  const duplicateIdentifiers = (() => {
    const counts = new Map();
    for (const s of students) {
      for (const raw of [s.email, s.phone]) {
        const v = (raw || "").trim().toLowerCase();
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
    }
    const dupes = new Set();
    for (const [v, c] of counts) if (c > 1) dupes.add(v);
    return dupes;
  })();
  const isDuplicateStudent = (s) => {
    const e = (s.email || "").trim().toLowerCase();
    const p = (s.phone || "").trim().toLowerCase();
    return (e && duplicateIdentifiers.has(e)) || (p && duplicateIdentifiers.has(p));
  };

  // Advisor scope applies everywhere on the dashboard — stats, list, everything.
  // Advisors are locked to their own students; superadmins can narrow via advisorFilter.
  // bankerFilter narrows further, on top of whichever scope above already applies.
  const scopedStudents = students.filter((s) => {
    if (adminRole === "advisor" && s.advisor !== adminAdvisorName) return false;
    if (adminRole !== "advisor" && advisorFilter !== "all" && s.advisor !== advisorFilter) return false;
    if (bankerFilter !== "all" && !(s.sharedBankers || []).includes(bankerFilter)) return false;
    return true;
  });

  const stats = {
    total: scopedStudents.length,
    complete: scopedStudents.filter((s) => getOverallProgress(s) === 100).length,
    inProgress: scopedStudents.filter((s) => { const p = getOverallProgress(s); return p > 0 && p < 100; }).length,
    notStarted: scopedStudents.filter((s) => getOverallProgress(s) === 0).length,
    // Real, not fabricated — a genuine count of students created in the last
    // 7 days, used as the KPI card's trend line instead of a fake "vs last
    // month" percentage we have no historical snapshots to actually compute.
    newThisWeek: scopedStudents.filter((s) => {
      const t = s.createdAt ? Date.parse(s.createdAt) : NaN;
      return !Number.isNaN(t) && nowRef - t <= 7 * 24 * 60 * 60 * 1000;
    }).length,
  };

  const loanStats = {
    pending:    scopedStudents.filter((s) => !s.loanStatus || s.loanStatus === "pending").length,
    inprocess:  scopedStudents.filter((s) => s.loanStatus === "inprocess").length,
    sanctioned: scopedStudents.filter((s) => s.loanStatus === "sanctioned").length,
    disbursed:  scopedStudents.filter((s) => s.loanStatus === "disbursed").length,
    rejected:   scopedStudents.filter((s) => s.loanStatus === "rejected").length,
    dropped:    scopedStudents.filter((s) => s.loanStatus === "dropped").length,
  };

  // Advisor dropdown options always list every advisor, regardless of current scope.
  const advisorList = Array.from(
    new Set(students.map((s) => s.advisor).filter(Boolean)),
  ).sort();

  // Unique consultancy names across the advisor's scoped students — these come
  // from personalInfo.consultantNameLoc stored in each student's meta on Drive,
  // so the dropdown always reflects what's actually saved in the backend.
  const consultancyList = Array.from(
    new Set(
      scopedStudents
        .map((s) => (s.personalInfo?.consultantNameLoc || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const filtered = scopedStudents.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      (s.name || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q);
    const p = getOverallProgress(s);
    const matchesFilter =
      filter === "all" ||
      (filter === "complete" && p === 100) ||
      (filter === "progress" && p > 0 && p < 100) ||
      (filter === "notStarted" && p === 0);
    const matchesLoanStatus =
      loanStatusFilter === "all" ||
      (loanStatusFilter === "pending" && (!s.loanStatus || s.loanStatus === "pending")) ||
      s.loanStatus === loanStatusFilter;
    // Consultancy dropdown: exact name from the saved list, or "__none__" to
    // surface students whose consultancy hasn't been set yet.
    const consultancyValue = (s.personalInfo?.consultantNameLoc || "").trim();
    const matchesConsultancy =
      !consultancyFilter ||
      (consultancyFilter === "__none__"
        ? !consultancyValue
        : consultancyValue === consultancyFilter);
    return matchesSearch && matchesFilter && matchesLoanStatus && matchesConsultancy;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Any filter/search change can shrink the result set below the current
  // page — snap back to page 1 rather than showing an empty page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, filter, loanStatusFilter, consultancyFilter, advisorFilter, bankerFilter]);

  const visibleKeys = paginated.map(studentKey);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k));
  const toggleSelectAll = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };
  const toggleSelectOne = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const selectedStudents = students.filter((s) => selectedKeys.has(studentKey(s)));

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedStudents.length} selected student${selectedStudents.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      for (const s of selectedStudents) {
        const identifier = s.email || s.phone || "";
        await deleteStudent(s.name, identifier, s.driveUrl || "").catch((e) => {
          console.error(`Bulk delete failed for ${s.name}:`, e.message);
        });
      }
      setSelectedKeys(new Set());
      await loadStudents();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDownload = () => {
    for (const s of selectedStudents) {
      const identifier = s.email || s.phone || "";
      const url = getDownloadAllUrl(s.name, identifier);
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Exports exactly what's currently on screen — respects search + every
  // active filter, not the full unfiltered roster.
  const handleExportCsv = () => {
    const header = ["Student", "Email", "Phone", "Consultancy", "Advisor", "Loan Status", "Document Progress", "Updated On"];
    const rows = filtered.map((s) => [
      s.name || "",
      s.email || "",
      s.phone || "",
      s.personalInfo?.consultantNameLoc || "",
      s.advisor || "",
      LOAN_STATUS_CONFIG[s.loanStatus || "pending"]?.label || "Pending",
      `${getOverallProgress(s)}%`,
      s.updatedAt ? new Date(s.updatedAt).toLocaleString("en-IN") : "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const rootUrl = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID
    ? `https://drive.google.com/drive/folders/${import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID}`
    : null;

  if (!isAdmin) return null;

  const roleEyebrow = adminRole === "advisor" ? `Advisor — ${adminAdvisorName}` : "Super Admin";
  const SECTION_META = {
    dashboard: {
      title: "Admin Dashboard",
      sub: adminRole === "advisor"
        ? `Showing students assigned to ${adminAdvisorName} only.`
        : "Manage all students, applications and documents from one place.",
    },
    students: {
      eyebrow: roleEyebrow,
      title: "Students",
      sub: adminRole === "advisor" ? `Advisor: ${adminAdvisorName} — showing your students only` : "Search, filter, and manage every student file",
    },
    advisors: { eyebrow: roleEyebrow, title: "Advisors", sub: "Workload and progress by advisor" },
    banks:    { eyebrow: roleEyebrow, title: "Banks & Lenders", sub: "Manage loan officers and control which students each one can see" },
    audit:    { eyebrow: roleEyebrow, title: "Audit Log", sub: "Who did what, and when" },
    bankActivity: { eyebrow: roleEyebrow, title: "Bank Activity", sub: "Student, advisor, and banker actions, grouped by lender" },
  };
  const activeMeta = SECTION_META[section] || SECTION_META.dashboard;

  return (
    <div className="admin-shell">
      <AdminSidebar
        section={section}
        setSection={setSection}
        adminRole={adminRole}
        adminName={adminName}
        onOpenSettings={() => setShowSettings(true)}
        onLogout={handleLogout}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        setLoanStatusFilter={setLoanStatusFilter}
        setDocFilter={setFilter}
      />

    <div className="admin-page admin-page--shell">
      {/* Same ambient background stack as the Home page (art + color fields +
          grid + veil) — fixed rather than absolute since this page actually
          scrolls, unlike Home's hero. */}
      <div className="admin-bg" aria-hidden="true">
        <span className="admin-bg__art" style={{ backgroundImage: `url(${heroImg})` }} />
        <span className="admin-bg__field admin-bg__field--indigo" />
        <span className="admin-bg__field admin-bg__field--amber" />
        <span className="admin-bg__grid" />
        <span className="admin-bg__veil" />
      </div>

      <AdminTopbar
        search={search}
        setSearch={setSearch}
        section={section}
        setSection={setSection}
        adminName={adminName}
        adminRole={adminRole}
        onOpenSettings={() => setShowSettings(true)}
        onLogout={handleLogout}
      />
      <div className="admin-container">
        {/* Header */}
        <div className="admin-header animate-fade-in">
          <div className="admin-header-left">
            <div className="admin-title-row">
              <button className="admin-mobile-nav-toggle" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
                <Menu size={18} />
              </button>
              <div>
                <p className="admin-eyebrow">
                  {section === "dashboard" ? `Welcome back${adminName ? `, ${adminName.split(" ")[0]}` : ""}` : activeMeta.eyebrow}
                </p>
                <h1 className="admin-title">{activeMeta.title}</h1>
                <p className="admin-sub">{activeMeta.sub}</p>
              </div>
            </div>
          </div>

          <div className="header-actions">
            {(section === "dashboard" || section === "students") && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={loadStudents} disabled={loading}>
                  <RefreshCw size={16} className={loading ? "spin" : ""} />
                  <span className="btn-label">Refresh</span>
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>
                  <UserPlus size={16} />
                  <span className="btn-label">Add Student</span>
                </button>
                {rootUrl && (
                  <a className="btn btn-primary btn-sm" href={rootUrl} target="_blank" rel="noreferrer">
                    <FolderOpen size={16} />
                    <span className="btn-label">Root Drive</span>
                  </a>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => setSection("banks")}>
                  <Send size={16} />
                  <span className="btn-label">Banker Access</span>
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowSettings(true)}>
                  <Settings size={16} />
                  <span className="btn-label">Settings</span>
                </button>
              </>
            )}
          </div>
        </div>

        {section === "dashboard" && (
          <>
            {/* Financing partner banks — full width, scrolling strip */}
            <PartnerBanksShowcase />

            <div className="dashboard-grid">
              {/* 3/4: Document Progress on top, Loan Application Status below */}
              <div className="dashboard-grid-main">
                <StatsPanel
                  stats={stats}
                  loanStats={loanStats}
                  filter={filter}
                  setFilter={setFilter}
                  loanStatusFilter={loanStatusFilter}
                  setLoanStatusFilter={setLoanStatusFilter}
                />
              </div>

              {/* Remaining 1/4: the live activity log, running the full height */}
              {adminRole === "superadmin" && <LiveActivityFeed />}
            </div>
          </>
        )}

        {section === "advisors" && adminRole === "superadmin" && (
          <AdvisorsSection students={students} allAdvisors={allAdvisors} />
        )}

        {section === "audit" && adminRole === "superadmin" && <AuditLogSection />}

        {section === "bankActivity" && adminRole === "superadmin" && (
          <BankActivityReportSection students={students} bankers={bankers} />
        )}

        {section === "banks" && (
          <BankerAccessSection
            students={scopedStudents}
            onAccessChanged={handleAccessChanged}
            onBankersChanged={loadBankers}
          />
        )}

        {(section === "dashboard" || section === "students") && (
        <>
        {/* Toolbar */}
        <div className="admin-toolbar">
          <div className="toolbar-filter">
            {[
              { id: "all", label: "All" },
              { id: "complete", label: "Complete" },
              { id: "progress", label: "In Progress" },
              { id: "notStarted", label: "Not Started" },
            ].map((f) => (
              <button
                key={f.id}
                className={`filter-chip${filter === f.id ? " active" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="toolbar-dropdowns">
            {/* Consultancy filter — visible to both advisor and superadmin */}
            <select
              className={`advisor-filter-select consultancy-filter-select${consultancyFilter ? " has-value" : ""}`}
              value={consultancyFilter}
              onChange={(e) => setConsultancyFilter(e.target.value)}
              aria-label="Filter students by consultancy"
            >
              <option value="">All Consultancies</option>
              {consultancyList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__none__">— No consultancy set —</option>
            </select>

            {adminRole !== "advisor" && advisorList.length > 0 && (
              <select
                className="advisor-filter-select"
                value={advisorFilter}
                onChange={(e) => setAdvisorFilter(e.target.value)}
              >
                <option value="all">All Advisors</option>
                {advisorList.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}

            {bankers.length > 0 && (
              <select
                className="advisor-filter-select banker-filter-select"
                value={bankerFilter}
                onChange={(e) => setBankerFilter(e.target.value)}
              >
                <option value="all">All Bankers</option>
                {bankers.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            )}

            <select
              className="advisor-filter-select loan-status-filter-select"
              value={loanStatusFilter}
              onChange={(e) => setLoanStatusFilter(e.target.value)}
            >
              <option value="all">All Loan Status</option>
              <option value="pending">Pending</option>
              <option value="inprocess">In Process</option>
              <option value="sanctioned">Sanctioned</option>
              <option value="disbursed">Disbursed</option>
              <option value="rejected">Rejected</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="admin-error animate-fade-in">
            <AlertCircle size={15} />
            {error}
            <button className="close-err" onClick={() => setError("")}><X size={13} /></button>
          </div>
        )}

        {/* Table */}
        {selectedKeys.size > 0 && (
          <div className="bulk-toolbar animate-fade-in">
            <span className="bulk-toolbar-count">Selected: {selectedKeys.size}</span>
            <div className="bulk-toolbar-actions">
              <button className="btn btn-secondary btn-sm" onClick={handleBulkDownload} disabled={bulkBusy}>
                <Download size={13} /> <span className="btn-label">Download</span>
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} disabled={bulkBusy}>
                <Trash2 size={13} /> <span className="btn-label">{bulkBusy ? "Working…" : "Delete"}</span>
              </button>
            </div>
            <button className="bulk-toolbar-clear" onClick={() => setSelectedKeys(new Set())}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="table-section-head">
          <p className="table-section-title">
            Students <span className="table-section-count">{filtered.length}</span>
          </p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportCsv} disabled={filtered.length === 0}>
            <Download size={14} /> <span className="btn-label">Export</span>
          </button>
        </div>

        <div className="admin-table-wrap animate-fade-in">
        <div className="admin-table-scroll">
          <div className="table-head">
            <div className="th th-check">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all students on this page" />
            </div>
            <div className="th th-name">Student</div>
            <div className="th th-consultancy">Consultancy</div>
            <div className="th th-advisor">Advisor</div>
            <div className="th th-status">Loan Status</div>
            <div className="th th-progress">Document Progress</div>
            <div className="th th-files">Files</div>
            <div className="th th-updated">Updated On</div>
            <div className="th th-actions">Actions</div>
          </div>

          {loading ? (
            <div className="admin-loading">
              <div className="loading-dots"><span /><span /><span /></div>
              Loading students…
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon"><Users size={28} /></div>
              <h3>
                {search || filter !== "all" || consultancyFilter
                  ? "No students match"
                  : adminRole === "advisor"
                    ? "No students assigned yet"
                    : "No students yet"}
              </h3>
              <p>
                {consultancyFilter === "__none__"
                  ? "Every student has a consultancy set."
                  : consultancyFilter
                    ? `No students found for consultancy "${consultancyFilter}".`
                    : search || filter !== "all"
                      ? "Try adjusting your search or filter."
                      : adminRole === "advisor"
                        ? `No students have selected ${adminAdvisorName} as their advisor yet.`
                        : "Add a student to get started."}
              </p>
              {(search || filter !== "all" || consultancyFilter) && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => { setSearch(""); setFilter("all"); setConsultancyFilter(""); }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="student-list">
              {paginated.map((s) => {
                const k = studentKey(s);
                return (
                  <StudentRow
                    key={k}
                    student={s}
                    isOpen={expandedKey === k}
                    onToggle={() => setExpandedKey((cur) => (cur === k ? null : k))}
                    selected={selectedKeys.has(k)}
                    onToggleSelect={() => toggleSelectOne(k)}
                    onDelete={(e) => { if (e) e.stopPropagation(); setConfirmDelete(s); }}
                    onOpenDrive={(e) => { if (e) e.stopPropagation(); openDriveFolder(s); }}
                    onViewReport={(e) => { if (e) e.stopPropagation(); setReportStudent(s); }}
                    onSendToBank={(e) => { if (e) e.stopPropagation(); setBankStudent(s); }}
                    onLoanStatusUpdate={(e) => { if (e) e.stopPropagation(); setLoanStatusStudent(s); }}
                    onRecoverMeta={(e) => { if (e) e.stopPropagation(); setRecoverStudent(s); }}
                    canEditConsultancy={adminRole === "advisor" || adminRole === "superadmin"}
                    onConsultancySave={(value) => handleConsultancySave(s, value)}
                    consultancySuggestions={consultancyList}
                    canEditAdvisor={adminRole === "superadmin"}
                    onAdvisorSave={(value) => handleAdvisorSave(s, value)}
                    advisorOptions={allAdvisors}
                    isDuplicate={isDuplicateStudent(s)}
                  />
                );
              })}
            </div>
          )}
        </div>

          {!loading && filtered.length > 0 && (
            <div className="table-pagination">
              <span className="table-pagination-summary">
                Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length} students
              </span>
              <div className="table-pagination-controls">
                <button className="pg-btn" aria-label="Previous page" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                  .map((n, i, arr) => (
                    <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {i > 0 && arr[i - 1] !== n - 1 && <span className="pg-ellipsis">…</span>}
                      <button className={`pg-btn pg-num${n === safePage ? " active" : ""}`} onClick={() => setPage(n)}>{n}</button>
                    </span>
                  ))}
                <button className="pg-btn" aria-label="Next page" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>
                  <ChevronRight size={16} />
                </button>
                <select
                  className="pg-size-select"
                  aria-label="Students per page"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>

      {/* Loan Status Modal */}
      {loanStatusStudent && (
        <LoanStatusModal
          student={loanStatusStudent}
          onClose={() => setLoanStatusStudent(null)}
          onUpdated={handleLoanStatusChange}
        />
      )}

      {/* Recover Meta Modal */}
      {recoverStudent && (
        <RecoverMetaModal
          student={recoverStudent}
          onClose={() => setRecoverStudent(null)}
          onRestored={(recovered) => {
            setStudents((prev) => prev.map((s) =>
              s.name === recoverStudent.name ? { ...s, ...recovered } : s
            ));
            setRecoverStudent(null);
          }}
        />
      )}

      {/* Report Modal */}
      {reportStudent && (
        <ReportModal student={reportStudent} onClose={() => setReportStudent(null)} />
      )}

      {/* Grant Bank Access Modal */}
      {bankStudent && (
        <GrantBankAccessModal
          student={bankStudent}
          onClose={() => setBankStudent(null)}
          onAccessChanged={handleAccessChanged}
        />
      )}

      {/* Delete modal */}
      {confirmDelete && (
        <DeleteModal
          name={confirmDelete.name}
          deleting={deleting}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          adminName={adminName}
          adminRole={adminRole}
        />
      )}

    </div>
  );
}
