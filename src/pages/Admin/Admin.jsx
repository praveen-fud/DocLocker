import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Search,
  FolderOpen,
  CheckCircle,
  Clock,
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
  Shield,
  TrendingUp,
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
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { getAllStudentsFromDrive, deleteStudent } from "../../utils/driveApi";
import { DOCUMENT_SCHEMA, CO_APPLICANT_SCHEMA, getTotalRequiredFields } from "../../context/schemas";
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

function StatCard({ label, value, icon, color, active, onClick }) {
  return (
    <button
      type="button"
      className={`stat-card stat-${color}${active ? " stat-active" : ""}`}
      onClick={onClick}
    >
      <div className="stat-top">
        <div className="stat-icon-wrap">{icon}</div>
        <span className="stat-trend">
          {color === "blue" ? "ALL" : color === "green" ? "✓" : color === "yellow" ? "~" : "○"}
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </button>
  );
}

function Badge({ progress }) {
  if (progress === 100)
    return (
      <span className="badge badge-success">
        <span className="badge-dot" />
        Complete
      </span>
    );
  if (progress > 0)
    return (
      <span className="badge badge-warning">
        <span className="badge-dot" />
        In Progress
      </span>
    );
  return (
    <span className="badge badge-error">
      <span className="badge-dot" />
      Not Started
    </span>
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
  if (!files.length) {
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
    </div>
  );
}

/* ─── Student Row ──────────────────────────────────────────────── */

function StudentRow({ student, isOpen, onToggle, onDelete, onOpenDrive, onViewReport, onSendToBank }) {
  const [activeTab, setActiveTab] = useState("personal");

  const totalUploads = getTotalUploads(student);
  const progress = getOverallProgress(student);
  const progClass = getProgressClass(progress);
  const avatarVariant = getAvatarVariant(student.name);
  const files = getAllUploadedFiles(student.uploads);

  const tabs = [
    { id: "personal", label: "Personal", icon: <User size={12} />, count: null },
    { id: "documents", label: "Documents", icon: <FolderOpen size={12} />, count: null },
    { id: "files", label: "Files", icon: <FileText size={12} />, count: files.length },
  ];

  return (
    <div className={`student-block${isOpen ? " open" : ""}`}>
      <div className="student-row" onClick={onToggle}>
        <div className={`student-avatar avatar-${avatarVariant}`}>
          {(student.name || "?")[0].toUpperCase()}
        </div>

        <div className="student-info">
          <span className="student-name">{student.name || "Unknown Student"}</span>
          <span className="student-contact">{student.email || student.phone || "No contact info"}</span>
        </div>

        <div className="student-meta">
          {student.advisor && <span className="meta-pill">{student.advisor}</span>}
          {student.personalInfo?.loanAmount && (
            <span className="meta-pill">₹{Number(student.personalInfo.loanAmount).toLocaleString("en-IN")}</span>
          )}
          <span className="meta-pill">{totalUploads} files</span>
        </div>

        <div className={`student-progress-col ${progClass}`}>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-pct">{progress}%</span>
        </div>

        <div className="student-status-col">
          <Badge progress={progress} />
        </div>

        <div className="student-actions-col" onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-btn report-btn"
            title="View Eligibility Report"
            onClick={onViewReport}
          >
            <BarChart3 size={14} />
          </button>
          <button
            className="icon-btn drive-btn"
            title="Open Drive folder"
            onClick={onOpenDrive}
          >
            <FolderOpen size={14} />
          </button>
          <button
            className="icon-btn bank-btn"
            title="Grant Bank Access"
            onClick={onSendToBank}
          >
            <Send size={14} />
          </button>
          <button
            className="icon-btn del-btn"
            title="Delete student"
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
        </div>

        <button className={`chevron-btn${isOpen ? " open" : ""}`}>
          <ChevronDown size={16} />
        </button>
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

            <div className="detail-action-bar">
              <button className="btn btn-primary btn-sm" onClick={onViewReport}>
                <BarChart3 size={13} /> View Eligibility Report
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onOpenDrive}>
                <ExternalLink size={13} /> Open Drive Folder
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onSendToBank}>
                <Send size={13} /> Grant Bank Access
              </button>
              <button className="btn btn-danger btn-sm" onClick={onDelete}>
                <Trash2 size={13} /> Delete Student
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
            No banker accounts yet. Create one from Settings → Team.
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

/* ─── Banker Access Manager ────────────────────────────────────── */
// Reverse view of GrantBankAccessModal: pick a banker first, then see/manage
// every student that banker can currently access, plus grant new ones.

function BankerAccessManagerModal({ students, bankers, onClose, onAccessChanged }) {
  const [selectedBankerState, setSelectedBanker] = useState("");
  const [search, setSearch] = useState("");
  const [togglingName, setTogglingName] = useState(null);
  const [error, setError] = useState("");

  // Falls back to the first banker until the user explicitly picks one —
  // derived during render instead of synced via an effect, so there's no
  // extra render pass just to apply the default.
  const selectedBanker = selectedBankerState || bankers[0]?.name || "";

  const toggleAccess = async (student, grant) => {
    setTogglingName(student.name);
    setError("");
    try {
      const identifier = student.email || student.phone || "";
      const r = await callAPI("PUT", "/api/students/banker-access", {
        studentName: student.name, studentIdentifier: identifier, bankerName: selectedBanker, grant,
      });
      if (r.success) {
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

  const grantedStudents = students.filter((s) => (s.sharedBankers || []).includes(selectedBanker));
  const grantedNames = new Set(grantedStudents.map((s) => s.name));

  const q = search.trim().toLowerCase();
  const availableStudents = students.filter((s) => {
    if (grantedNames.has(s.name)) return false;
    if (!q) return true;
    return (s.name || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q);
  });
  const visibleAvailable = availableStudents.slice(0, 40);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="bam-modal animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="bam-header">
          <h3><Send size={16} /> Banker Access Management</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {bankers.length === 0 ? (
          <p className="bam-empty">No banker accounts yet. Create one from Settings → Bankers.</p>
        ) : (
          <div className="bam-body">
            <div className="bam-banker-list">
              {bankers.map((b) => {
                const count = students.filter((s) => (s.sharedBankers || []).includes(b.name)).length;
                return (
                  <button
                    key={b.name}
                    className={`bam-banker-row${selectedBanker === b.name ? " active" : ""}`}
                    onClick={() => setSelectedBanker(b.name)}
                  >
                    <div className="bam-banker-avatar">{b.name[0].toUpperCase()}</div>
                    <span className="bam-banker-name">{b.name}</span>
                    <span className="bam-banker-count">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="bam-main">
              <div className="bam-section">
                <p className="bam-section-title">
                  Students <strong>{selectedBanker}</strong> can access ({grantedStudents.length})
                </p>
                {grantedStudents.length === 0 ? (
                  <p className="bam-no-students">No students granted yet.</p>
                ) : (
                  <div className="bam-student-list">
                    {grantedStudents.map((s) => (
                      <div key={s.name} className="bam-student-row">
                        <div className="bam-student-avatar">{(s.name || "?")[0].toUpperCase()}</div>
                        <div className="bam-student-info">
                          <span className="bam-student-name">{s.name}</span>
                          <span className="bam-student-contact">{s.email || s.phone || "No contact info"}</span>
                        </div>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={togglingName === s.name}
                          onClick={() => toggleAccess(s, false)}
                        >
                          {togglingName === s.name ? <RefreshCw size={12} className="spin" /> : "Revoke"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bam-section">
                <p className="bam-section-title">Grant access to another student</p>
                <div className="bam-search">
                  <Search size={14} />
                  <input
                    placeholder="Search students by name, email, or phone…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="bam-student-list bam-add-list">
                  {visibleAvailable.length === 0 ? (
                    <p className="bam-no-students">
                      {search ? "No matching students." : "All students already have access."}
                    </p>
                  ) : (
                    visibleAvailable.map((s) => (
                      <div key={s.name} className="bam-student-row">
                        <div className="bam-student-avatar">{(s.name || "?")[0].toUpperCase()}</div>
                        <div className="bam-student-info">
                          <span className="bam-student-name">{s.name}</span>
                          <span className="bam-student-contact">{s.email || s.phone || "No contact info"}</span>
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={togglingName === s.name}
                          onClick={() => toggleAccess(s, true)}
                        >
                          {togglingName === s.name ? <RefreshCw size={12} className="spin" /> : "Grant"}
                        </button>
                      </div>
                    ))
                  )}
                  {availableStudents.length > visibleAvailable.length && (
                    <p className="bam-more-hint">
                      +{availableStudents.length - visibleAvailable.length} more — refine your search to find them
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <div className="settings-msg err bam-error">{error}</div>}
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
  const [createMsg, setCreateMsg] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [bankers, setBankers] = useState([]);
  const [bankersLoading, setBankersLoading] = useState(false);
  const [newBankerName, setNewBankerName] = useState("");
  const [newBankerPass, setNewBankerPass] = useState("");
  const [createBankerMsg, setCreateBankerMsg] = useState(null);
  const [createBankerLoading, setCreateBankerLoading] = useState(false);
  const [deleteBankerTarget, setDeleteBankerTarget] = useState(null);
  const [deleteBankerLoading, setDeleteBankerLoading] = useState(false);

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

  const loadBankers = async () => {
    setBankersLoading(true);
    try {
      const d = await callAPI("GET", "/api/admins/bankers");
      if (d.success) setBankers(d.bankers || []);
    } catch { /* silent */ }
    finally { setBankersLoading(false); }
  };

  const handleCreateBanker = async (e) => {
    e.preventDefault();
    if (!newBankerName.trim()) { setCreateBankerMsg({ type: "err", text: "Name is required." }); return; }
    if (newBankerPass.length < 6) { setCreateBankerMsg({ type: "err", text: "Password must be at least 6 characters." }); return; }
    setCreateBankerLoading(true); setCreateBankerMsg(null);
    try {
      const r = await callAPI("POST", "/api/admins", { name: newBankerName.trim(), role: "banker", password: newBankerPass });
      if (r.success) {
        setCreateBankerMsg({ type: "ok", text: `${newBankerName.trim()} created successfully.` });
        setNewBankerName(""); setNewBankerPass("");
        loadBankers();
      } else {
        setCreateBankerMsg({ type: "err", text: r.error || "Failed to create banker." });
      }
    } catch { setCreateBankerMsg({ type: "err", text: "Network error. Try again." }); }
    finally { setCreateBankerLoading(false); }
  };

  const handleDeleteBanker = async (name) => {
    setDeleteBankerLoading(true);
    try {
      const r = await callAPI("DELETE", `/api/admins/${encodeURIComponent(name)}`);
      if (r.success) { setDeleteBankerTarget(null); loadBankers(); }
      else { alert(r.error || "Failed to delete."); }
    } catch { alert("Network error. Try again."); }
    finally { setDeleteBankerLoading(false); }
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
        loadBankers();
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
          {(adminRole === "superadmin" || adminRole === "advisor") && (
            <button
              className={`settings-tab${tab === "bankers" ? " active" : ""}`}
              onClick={() => { setTab("bankers"); if (teamVerified) loadBankers(); }}
            >
              <Building2 size={16} />
              <span>Bankers</span>
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
                      <input className="input-field" type="password" placeholder="Min. 6 characters" value={newAdminPass} onChange={(e) => setNewAdminPass(e.target.value)} />
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

          {tab === "bankers" && (
            <div>
              {!teamVerified ? (
                <form onSubmit={handleVerifyTeamPass} className="settings-form">
                  <p className="settings-section-label">Enter your password to manage bankers</p>
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
                  <p className="settings-section-label">Banker Accounts</p>
                  {bankersLoading ? (
                    <div className="admin-loading" style={{ padding: "24px 0" }}>
                      <div className="loading-dots"><span /><span /><span /></div>
                    </div>
                  ) : bankers.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No banker accounts yet.</p>
                  ) : (
                    <div className="team-list">
                      {bankers.map((b) => (
                        <div key={b.name} className="team-row">
                          <div className="team-avatar">{b.name[0].toUpperCase()}</div>
                          <div className="team-info">
                            <span className="team-name">{b.name}</span>
                            <span className="team-role-badge banker">Banker</span>
                          </div>
                          {deleteBankerTarget === b.name ? (
                            <div className="team-delete-confirm">
                              <span>Delete?</span>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteBanker(b.name)} disabled={deleteBankerLoading}>
                                {deleteBankerLoading ? <RefreshCw size={12} className="spin" /> : "Yes"}
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteBankerTarget(null)} disabled={deleteBankerLoading}>No</button>
                            </div>
                          ) : (
                            <>
                              <button className="icon-btn" title={`Reset ${b.name}'s password`} onClick={() => { setResetPwTarget(b.name); setResetPwValue(""); setResetPwMsg(null); }}>
                                <KeyRound size={13} />
                              </button>
                              <button className="icon-btn del-btn" title={`Remove ${b.name}`} onClick={() => setDeleteBankerTarget(b.name)}>
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="settings-section-label" style={{ marginTop: 20 }}>Add Banker</p>
                  <form onSubmit={handleCreateBanker} className="settings-form">
                    <div className="input-group">
                      <label>Name</label>
                      <input className="input-field" type="text" placeholder="e.g. HDFC - Rajesh" value={newBankerName} onChange={(e) => setNewBankerName(e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label>Password</label>
                      <input className="input-field" type="password" placeholder="Min. 6 characters" value={newBankerPass} onChange={(e) => setNewBankerPass(e.target.value)} />
                    </div>
                    {createBankerMsg && <p className={`settings-msg ${createBankerMsg.type}`}>{createBankerMsg.text}</p>}
                    <button type="submit" className="btn btn-primary btn-sm" disabled={createBankerLoading}>
                      {createBankerLoading ? <><RefreshCw size={13} className="spin" /> Creating…</> : <><Plus size={13} /> Create Banker</>}
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

export default function Admin() {
  const { isAdmin, adminRole, adminAdvisorName, adminName } = useStudent();
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [advisorFilter, setAdvisorFilter] = useState("all");
  const [bankerFilter, setBankerFilter] = useState("all");
  const [bankers, setBankers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [reportStudent, setReportStudent] = useState(null);
  const [bankStudent, setBankStudent] = useState(null);
  const [showAccessManager, setShowAccessManager] = useState(false);

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

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudents();
    void loadBankers();
  }, [isAdmin, loadStudents, loadBankers]);

  const handleDelete = async (name) => {
    setDeleting(true);
    try {
      const s = students.find((st) => st.name === name);
      const identifier = s?.email || s?.phone || "";
      await deleteStudent(name, identifier);
      setStudents((prev) => prev.filter((s) => s.name !== name));
      setConfirmDelete(null);
      setExpandedIdx(null);
    } catch (e) {
      setError("Delete failed: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleAccessChanged = (name, sharedBankers) => {
    setStudents((prev) => prev.map((s) => s.name === name ? { ...s, sharedBankers } : s));
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
  };

  // Advisor dropdown options always list every advisor, regardless of current scope.
  const advisorList = Array.from(
    new Set(students.map((s) => s.advisor).filter(Boolean)),
  ).sort();

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
    return matchesSearch && matchesFilter;
  });

  const rootUrl = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID
    ? `https://drive.google.com/drive/folders/${import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID}`
    : null;

  if (!isAdmin) return null;

  return (
    <div className="admin-page">
      <div className="admin-container">
        {/* Header */}
        <div className="admin-header animate-fade-in">
          <div className="admin-header-left">
            <h1 className="admin-title">
              <div className="admin-title-icon"><Shield size={18} /></div>
              Admin Dashboard
            </h1>
            <p className="admin-sub">
              {adminRole === "advisor"
                ? `Advisor: ${adminAdvisorName} — showing your students only`
                : "Super Admin — all students"}
            </p>
          </div>

          <div className="header-actions">
            <button className="btn btn-secondary btn-sm" onClick={loadStudents} disabled={loading}>
              <RefreshCw size={13} className={loading ? "spin" : ""} />
              <span className="btn-label">Refresh</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>
              <UserPlus size={13} />
              <span className="btn-label">Add Student</span>
            </button>
            {rootUrl && (
              <a className="btn btn-primary btn-sm" href={rootUrl} target="_blank" rel="noreferrer">
                <FolderOpen size={13} />
                <span className="btn-label">Root Drive</span>
              </a>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAccessManager(true)} title="Manage which students each banker can see">
              <Send size={13} />
              <span className="btn-label">Banker Access</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSettings(true)} title="Settings">
              <Settings size={13} />
              <span className="btn-label">Settings</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="admin-stats animate-fade-in">
          <StatCard label="Total Students" value={stats.total} icon={<Building2 size={18} />} color="blue" active={filter === "all"} onClick={() => setFilter("all")} />
          <StatCard label="Completed" value={stats.complete} icon={<CheckCircle size={18} />} color="green" active={filter === "complete"} onClick={() => setFilter("complete")} />
          <StatCard label="In Progress" value={stats.inProgress} icon={<TrendingUp size={18} />} color="yellow" active={filter === "progress"} onClick={() => setFilter("progress")} />
          <StatCard label="Not Started" value={stats.notStarted} icon={<Clock size={18} />} color="red" active={filter === "notStarted"} onClick={() => setFilter("notStarted")} />
        </div>

        {/* Toolbar */}
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={15} />
            <input
              className="search-input"
              placeholder="Search by name, email, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch("")}><X size={14} /></button>
            )}
          </div>

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
        <div className="admin-table-wrap animate-fade-in">
          <div className="table-head">
            <div className="th th-name">Student</div>
            <div className="th th-meta">Metadata</div>
            <div className="th th-progress">Progress</div>
            <div className="th th-status">Status</div>
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
                {search || filter !== "all"
                  ? "No students match"
                  : adminRole === "advisor"
                    ? "No students assigned yet"
                    : "No students yet"}
              </h3>
              <p>
                {search || filter !== "all"
                  ? "Try adjusting your search or filter."
                  : adminRole === "advisor"
                    ? `No students have selected ${adminAdvisorName} as their advisor yet.`
                    : "Add a student to get started."}
              </p>
              {(search || filter !== "all") && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => { setSearch(""); setFilter("all"); }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="student-list">
              {filtered.map((s, i) => (
                <StudentRow
                  key={s.name || i}
                  student={s}
                  isOpen={expandedIdx === i}
                  onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  onDelete={(e) => { if (e) e.stopPropagation(); setConfirmDelete(s.name); }}
                  onOpenDrive={(e) => { if (e) e.stopPropagation(); openDriveFolder(s); }}
                  onViewReport={(e) => { if (e) e.stopPropagation(); setReportStudent(s); }}
                  onSendToBank={(e) => { if (e) e.stopPropagation(); setBankStudent(s); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

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

      {/* Banker Access Manager — select a banker, see/manage every student they can access */}
      {showAccessManager && (
        <BankerAccessManagerModal
          students={scopedStudents}
          bankers={bankers}
          onClose={() => setShowAccessManager(false)}
          onAccessChanged={handleAccessChanged}
        />
      )}

      {/* Delete modal */}
      {confirmDelete && (
        <DeleteModal
          name={confirmDelete}
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
