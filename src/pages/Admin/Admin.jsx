import { useState, useEffect, useCallback, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Users,
  Search,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  RefreshCw,
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
  UsersRound,
  Wallet,
  FileCheck2,
  ArrowDown,
  BookOpen,
  Plane,
  Check,
  Copy,
  Mail,
  Phone as PhoneIcon,
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
  ArrowRight,
  Filter,
  Landmark,
  LogIn,
  ChevronRight,
  MoreVertical,
  Download,
  MoreHorizontal,
  UserRound,
  FileClock,
  BadgeCheck,
  Hourglass,
  MinusCircle,
  ScanSearch,
  CalendarDays,
  ArrowRightLeft,
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { getAllStudentsFromDrive, deleteStudent, updateLoanStatus, uploadSanctionLetter, recoverMetaFromPdf, restoreMeta, buildFolderKey, getAuditLog, downloadAllFiles } from "../../utils/driveApi";
import DocumentViewer from "../../components/DocumentViewer/DocumentViewer";
import useFileObjectUrl from "../../hooks/useFileObjectUrl";
import { DOCUMENT_SCHEMA, CO_APPLICANT_SCHEMA, getTotalRequiredFields, coApplicantFields } from "../../context/schemas";
import { BANK_OPTIONS, getBankLogo } from "../../utils/bankOptions";
import BrandLogo from "../../components/BrandLogo/BrandLogo";
import CountUp from "../../components/CountUp/CountUp";
import { LenderMarquee } from "../Home/LandingVisuals";
import "../Home/Landing.css";
import "./Admin.css";
import "./StudentProfile.css";
import "./Dashboard.css";
import "./BanksLenders.css";
import DocumentReader from "./DocumentReader";
import DocumentLibrary from "./DocumentLibrary";
import { TeamSection, CompaniesSection } from "./TeamCompanies";
import ConverterProvider from "./converter/ConverterProvider";
import ConverterSection from "./converter/ConverterSection";
// After the section stylesheets: every page's cards as frosted glass
import "./Surfaces.css";
import { callAPI, isAdminLevel, ROLE_LABELS, passwordProblem } from "../../utils/adminApi";
import { companyLogoSrc } from "../../utils/company";
import { buildIdentityReport } from "../../utils/identityCheck";
import { buildDocumentChecks } from "../../utils/documentChecks";
import { getApplicationId } from "../../utils/applicationId";

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

function getInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

function getAvatarVariant(name) {
  const variants = ["a", "b", "c", "d", "e"];
  let code = 0;
  for (const ch of String(name || "?")) code = (code * 31 + ch.charCodeAt(0)) % 9973;
  return variants[code % variants.length];
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

// Lending partners — a slim card: count on the left, an auto-scrolling logo
// strip on the right. The tile list is duplicated once so the track can loop
// seamlessly at -50%; hovering (or `prefers-reduced-motion`) pauses it.
function PartnerBanksShowcase() {
  const banks = BANK_OPTIONS.filter((b) => b.value !== "Others");
  if (banks.length === 0) return null;

  return (
    <section className="dh-partners" aria-label="Lending partners">
      <LenderMarquee lenders={banks} label={`Lending partners · ${banks.length} banks and NBFCs connected`} />
    </section>
  );
}

// Dashboard-top notification for banker-access requests — renders nothing
// once the queue is empty, so it never sits around as a permanent, ignorable
// fixture. Superadmin gets an actionable "go review these" framing; an
// advisor gets a quieter "here's where things stand" one, since they can't
// decide their own requests.
function BankerRequestsNotice({ count, adminRole, onOpen }) {
  if (!count) return null;
  return (
    <button type="button" className="requests-notice animate-fade-in" onClick={onOpen}>
      <span className="requests-notice-icon"><Hourglass size={18} /></span>
      <span className="requests-notice-body">
        <span className="requests-notice-title">
          {isAdminLevel(adminRole)
            ? `${count} banker access request${count === 1 ? "" : "s"} awaiting your review`
            : count === 1 ? "1 lender access request you sent is waiting for approval" : `${count} lender access requests you sent are waiting for approval`}
        </span>
        <span className="requests-notice-sub">
          {isAdminLevel(adminRole)
            ? "An advisor asked to share a student's documents with a banker — approve or reject before it takes effect."
            : "An admin approves it before the lender can see the student."}
        </span>
      </span>
      <span className="requests-notice-cta">
        {isAdminLevel(adminRole) ? "Review requests" : "View status"} <ArrowUpRight size={14} />
      </span>
    </button>
  );
}

// A percentage-of-total share, not a fabricated "vs last month" figure we
// have no historical snapshots to actually compute. Returns null (renders
// nothing) rather than a misleading "0%" when the total itself is zero.
function shareOfTotal(value, total) {
  if (!total) return null;
  return Math.round((value / total) * 100);
}

// One overview card: a stacked bar showing how the total splits, and a
// legend whose rows double as filters for the student table above.
function BreakdownCard({ title, sub, icon: Icon, items, active, onSelect, footer }) {
  const total = items.reduce((sum, it) => sum + it.value, 0);
  return (
    <section className="ov-card ov-breakdown" aria-label={title}>
      <header className="ov-card-head">
        <span className="ov-card-icon" aria-hidden="true"><Icon size={18} /></span>
        <div className="ov-card-heading">
          <p className="ov-card-title">{title}</p>
          <p className="ov-card-sub">{sub}</p>
        </div>
      </header>

      <div className="ov-bar" role="img" aria-label={items.map((it) => `${it.label} ${it.value}`).join(", ")}>
        {total === 0
          ? <span className="ov-bar-empty" />
          : items.filter((it) => it.value > 0).map((it) => (
            <span key={it.key} className={`ov-bar-seg ov-c-${it.key}`} style={{ flexGrow: it.value }} />
          ))}
      </div>

      <ul className="ov-legend">
        {items.map((it) => {
          const pct = shareOfTotal(it.value, total);
          const isActive = active === it.key;
          return (
            <li key={it.key}>
              <button
                type="button"
                className={`ov-legend-row ov-c-${it.key}${isActive ? " is-active" : ""}`}
                aria-pressed={isActive}
                onClick={() => onSelect(it.key)}
                title={isActive ? "Show all students" : `Show ${it.label.toLowerCase()} students`}
              >
                <span className="ov-dot" aria-hidden="true" />
                <span className="ov-legend-label">{it.label}</span>
                <span className="ov-legend-value">{it.value}</span>
                <span className="ov-legend-pct">{pct === null ? "–" : `${pct}%`}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {footer && (
        <dl className="ov-footer">
          {footer.map(({ label, value }) => (
            <div key={label} className="ov-footer-stat">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}



/* ─── Dashboard home ───────────────────────────────────────────────
   A command centre, not a list: headline figures, the loan funnel, the
   students who need someone to act, and (superadmin) how each company is
   doing. Every number opens the Students page filtered to exactly that
   slice; every student opens their profile. */

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ₹4,50,00,000 → "₹4.5 Cr", ₹45,00,000 → "₹45 L"
function compactInr(n) {
  if (!n) return "₹0";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e9 ? 0 : 2).replace(/\.?0+$/, "")} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, "")} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
const amountOf = (s) => {
  const raw = s.loanStatus === "disbursed" && s.loanDisbursement?.loanAmount ? s.loanDisbursement.loanAmount : s.personalInfo?.loanAmount;
  const n = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Ordered stages take one hue, lighter → darker as the loan moves on
// (ordinal ramp, checked with the dataviz palette validator).
const FUNNEL = [
  { key: "pending", label: "Pending", hint: "Reviewing documents", color: "var(--ramp-1)" },
  { key: "inprocess", label: "In process", hint: "With the lender", color: "var(--ramp-2)" },
  { key: "sanctioned", label: "Sanctioned", hint: "Loan approved", color: "var(--ramp-3)" },
  { key: "disbursed", label: "Disbursed", hint: "Money released", color: "var(--ramp-4)" },
];
const STALE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Why a student needs someone to act — most urgent first.
function attentionReasons(s, { adminLevel }) {
  const reasons = [];
  const status = s.loanStatus || "pending";
  const progress = getOverallProgress(s);
  const idr = identityReportFor(s);
  if (s._parseError) reasons.push({ tone: "danger", text: "Record unreadable" });
  if (idr.overall === "mismatch") reasons.push({ tone: "danger", text: "Details don’t match" });
  if (status === "inprocess" && progress < 100) reasons.push({ tone: "warn", text: "Docs missing at lender stage" });
  if (needsSanctionLetter(s)) reasons.push({ tone: "warn", text: "Sanction letter missing" });
  if (adminLevel && !s.advisor) reasons.push({ tone: "warn", text: "No advisor" });
  if (progress === 0) reasons.push({ tone: "info", text: "No documents yet" });
  const updated = s.updatedAt ? Date.parse(s.updatedAt) : NaN;
  const idle = Number.isNaN(updated) ? 0 : Math.floor((Date.now() - updated) / DAY_MS);
  if (idle >= STALE_DAYS && !["disbursed", "rejected", "dropped"].includes(status)) {
    reasons.push({ tone: "info", text: `No update in ${idle} days` });
  }
  return reasons;
}
const TONE_RANK = { danger: 0, warn: 1, info: 2 };

function DashboardHome({
  students, loading, adminRole, companies = [], bankers = [], stats, loanStats,
  onOpenStudents, onOpenProfile, onOpenCompanies, onOpenAudit, onOpenStudentFile,
}) {
  const isSuper = adminRole === "superadmin";
  const adminLevel = isAdminLevel(adminRole);
  const total = students.length;
  const dash = (v) => (loading ? "–" : v);

  // ── Headline figures ──
  const active = students.filter((s) => ["inprocess", "sanctioned"].includes(s.loanStatus));
  const pipelineValue = active.reduce((sum, s) => sum + amountOf(s), 0);
  const disbursedValue = students.filter((s) => s.loanStatus === "disbursed").reduce((sum, s) => sum + amountOf(s), 0);
  const approved = loanStats.sanctioned + loanStats.disbursed;
  const decided = approved + loanStats.rejected;
  const approvalRate = decided ? Math.round((approved / decided) * 100) : null;
  const lettersMissing = students.filter(needsSanctionLetter).length;
  const completeShare = total ? Math.round((stats.complete / total) * 100) : 0;
  const partners = companies.filter((c) => c.kind !== "owner");
  const viaPartners = students.filter((s) => s.company && s.company.slug !== "flyurdream").length;

  const kpis = [
    {
      key: "students", label: "Students", value: total, icon: UserRound, tone: "blue",
      sub: stats.newThisWeek ? `+${stats.newThisWeek} this week` : "No new students this week", up: stats.newThisWeek > 0,
      open: () => onOpenStudents(),
    },
    {
      key: "pipeline", label: "Loan value in progress", value: compactInr(pipelineValue), icon: Wallet, tone: "indigo",
      sub: disbursedValue ? `${compactInr(disbursedValue)} disbursed` : `${active.length} application${active.length === 1 ? "" : "s"} moving`,
      open: () => onOpenStudents({ loan: "inprocess" }),
    },
    {
      key: "docs", label: "Files complete", value: `${completeShare}%`, icon: FileCheck2, tone: "teal",
      sub: `${stats.inProgress + stats.notStarted} waiting on documents`,
      open: () => onOpenStudents({ doc: "incomplete" }),
    },
    {
      key: "approved", label: "Sanctioned & disbursed", value: approved, icon: BadgeCheck, tone: "green",
      // Letters still to collect come first: they're the thing to act on
      sub: lettersMissing
        ? `${lettersMissing} sanction letter${lettersMissing === 1 ? "" : "s"} missing`
        : approvalRate === null ? "No decisions yet" : `${approvalRate}% approval rate`,
      warn: lettersMissing > 0,
      open: () => (lettersMissing ? onOpenStudents({ letters: "missing" }) : onOpenStudents({ loan: "sanctioned" })),
    },
    ...(isSuper ? [{
      key: "companies", label: "Partner companies", value: partners.length, icon: Building2, tone: "violet",
      sub: total ? `${viaPartners} students · ${Math.round((viaPartners / total) * 100)}% of all` : "No students yet",
      open: onOpenCompanies,
    }] : []),
  ];

  // ── Funnel: how far students have got ──
  const atStage = FUNNEL.map((f) => (f.key === "pending" ? loanStats.pending : loanStats[f.key]));
  const reached = atStage.map((_, i) => atStage.slice(i).reduce((a, b) => a + b, 0));
  const maxStage = Math.max(1, ...atStage);
  const inJourney = reached[0];

  // ── Needs attention ──
  const attention = students
    .map((s) => ({ s, reasons: attentionReasons(s, { adminLevel }) }))
    .filter((x) => x.reasons.length)
    .sort((a, b) => TONE_RANK[a.reasons[0].tone] - TONE_RANK[b.reasons[0].tone] || b.reasons.length - a.reasons.length);
  const attentionShown = attention.slice(0, 6);

  // ── Companies (superadmin) ──
  const companyRows = companies.map((c) => {
    const mine = students.filter((s) => s.company?.id === c.id);
    const approvedHere = mine.filter((s) => ["sanctioned", "disbursed"].includes(s.loanStatus)).length;
    return {
      ...c,
      count: mine.length,
      inprocess: mine.filter((s) => s.loanStatus === "inprocess").length,
      approved: approvedHere,
      complete: mine.length ? Math.round((mine.filter((s) => getOverallProgress(s) === 100).length / mine.length) * 100) : null,
      value: mine.filter((s) => ["inprocess", "sanctioned", "disbursed"].includes(s.loanStatus)).reduce((sum, s) => sum + amountOf(s), 0),
    };
  }).sort((a, b) => (a.kind === "owner" ? -1 : b.kind === "owner" ? 1 : b.count - a.count));
  // Sapphire family only; every entry stays AA as text (company initials).
  const COMPANY_COLORS = ["var(--ramp-4)", "var(--ramp-3)", "var(--navy-soft)", "var(--gold-text)"];

  const recent = [...students].filter((s) => s.updatedAt).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);

  // ── Advisor workload ──
  const advisorRows = Object.values(students.reduce((acc, s) => {
    const name = s.advisor || "";
    if (!acc[name]) acc[name] = { name, count: 0, progress: 0, active: 0 };
    acc[name].count += 1;
    acc[name].progress += getOverallProgress(s);
    if (["inprocess", "sanctioned"].includes(s.loanStatus)) acc[name].active += 1;
    return acc;
  }, {})).map((a) => ({ ...a, progress: Math.round(a.progress / a.count) }))
    .sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || b.count - a.count);
  const maxAdvisor = Math.max(1, ...advisorRows.map((a) => a.count));

  return (
    <div className="dh">
      {/* Headline figures */}
      <section className={`dh-kpis${kpis.length === 5 ? " dh-kpis--5" : ""}`} aria-label="Key figures">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <button key={k.key} type="button" className={`dh-kpi dh-tone-${k.tone}`} onClick={k.open}>
              <span className="dh-kpi-top">
                <span className="dh-kpi-label">{k.label}</span>
                <span className="dh-kpi-icon" aria-hidden="true"><Icon size={18} /></span>
              </span>
              <span className="dh-kpi-mid">
                <span className="dh-kpi-value"><CountUp text={dash(k.value)} /></span>
                <ArrowUpRight size={16} className="dh-kpi-go" aria-hidden="true" />
              </span>
              <span className={`dh-kpi-sub${k.up ? " is-up" : ""}${k.warn ? " is-warn" : ""}`}>{loading ? "Loading…" : k.sub}</span>
            </button>
          );
        })}
      </section>

      <div className={`dh-grid${adminLevel ? "" : " dh-grid--staff"}`}>
        {/* Loan funnel */}
        <section className="dh-card dh-card--funnel" aria-labelledby="dh-funnel-title">
          <header className="dh-card-head">
            <div>
              <h2 id="dh-funnel-title" className="dh-card-title">Loan journey</h2>
              <p className="dh-card-sub">How far each application has got. Select a stage to see its students.</p>
            </div>
          </header>
          <ol className="dh-journey">
            {FUNNEL.map((f, i) => {
              const n = atStage[i];
              const share = total ? Math.round((n / total) * 100) : 0;
              const moved = i < FUNNEL.length - 1 && reached[i] ? Math.round((reached[i + 1] / reached[i]) * 100) : null;
              // The longest bar stops short of the edge so its label still fits.
              const width = loading ? 0 : (n / maxStage) * 88;
              return (
                <li key={f.key} className="dh-step" style={{ "--dh-step": f.color }}>
                  <button
                    type="button"
                    className="dh-step-row"
                    onClick={() => onOpenStudents({ loan: f.key })}
                    aria-label={`${f.label}: ${n} student${n === 1 ? "" : "s"}, ${share}% of all. Show them.`}
                  >
                    <span className="dh-step-label">
                      <span className="dh-step-num" aria-hidden="true">{i + 1}</span>
                      <span className="dh-step-text">
                        <span className="dh-step-name">{f.label}</span>
                        <span className="dh-step-hint">{f.hint}</span>
                      </span>
                    </span>
                    <span className="dh-step-track" aria-hidden="true">
                      <span className="dh-step-bar" style={{ width: `${width}%` }} />
                      <span className="dh-step-value" style={{ left: `${width}%` }}>{dash(n)}</span>
                      <span className="dh-tip" role="presentation">
                        <strong>{f.label}</strong>
                        <span>{n} student{n === 1 ? "" : "s"} · {share}% of all</span>
                        {reached[i] > n && <span>{reached[i]} reached this stage or beyond</span>}
                      </span>
                    </span>
                    <span className="dh-step-share">{loading ? "" : `${share}%`}</span>
                  </button>
                  {moved !== null && (
                    <span className="dh-step-moved">
                      <ArrowDown size={13} aria-hidden="true" />
                      {inJourney ? `${moved}% moved on to the next stage` : "—"}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="dh-closed">
            <button type="button" className="dh-closed-item ov-c-rejected" onClick={() => onOpenStudents({ loan: "rejected" })}>
              <span className="ov-dot" aria-hidden="true" /> Rejected <strong>{dash(loanStats.rejected)}</strong>
            </button>
            <button type="button" className="dh-closed-item ov-c-dropped" onClick={() => onOpenStudents({ loan: "dropped" })}>
              <span className="ov-dot" aria-hidden="true" /> Dropped <strong>{dash(loanStats.dropped)}</strong>
            </button>
            {approvalRate !== null && <span className="dh-closed-note">{approvalRate}% of decided applications approved</span>}
          </div>
        </section>

        {/* Needs attention */}
        <section className="dh-card dh-card--attention" aria-labelledby="dh-attn-title">
          <header className="dh-card-head">
            <div>
              <h2 id="dh-attn-title" className="dh-card-title">Needs attention</h2>
              <p className="dh-card-sub">{attention.length ? `${attention.length} student${attention.length === 1 ? "" : "s"} waiting on someone` : "Nothing waiting right now"}</p>
            </div>
          </header>
          {loading ? (
            <div className="dh-empty"><div className="loading-dots"><span /><span /><span /></div></div>
          ) : attentionShown.length === 0 ? (
            <div className="dh-empty dh-empty--ok"><CheckCircle size={22} /><p>Every student is moving — no missing documents, unassigned files or stalled applications.</p></div>
          ) : (
            <ul className="dh-attn">
              {attentionShown.map(({ s, reasons }) => (
                <li key={studentKey(s)}>
                  <button type="button" className="dh-attn-row" onClick={() => onOpenProfile(s, attention.map((x) => x.s))}>
                    <span className={`dh-avatar avatar-${getAvatarVariant(s.name)}`} aria-hidden="true">{getInitials(displayName(s.name))}</span>
                    <span className="dh-attn-text">
                      <span className="dh-attn-name">{displayName(s.name)}</span>
                      <span className="dh-attn-reasons">
                        <span className={`dh-reason dh-reason--${reasons[0].tone}`}>{reasons[0].text}</span>
                        {reasons.length > 1 && <span className="dh-more">+{reasons.length - 1} more</span>}
                      </span>
                    </span>
                    <ChevronRight size={16} className="dh-chev" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* A short list leaves room to say the rest are fine */}
          {!loading && attentionShown.length > 0 && attentionShown.length < 4 && total > attention.length && (
            <p className="dh-attn-rest">
              <CheckCircle size={16} aria-hidden="true" />
              {total - attention.length} other student{total - attention.length === 1 ? " is" : "s are"} on track
            </p>
          )}
          {!loading && attention.length > 0 && (
            <button type="button" className="dh-link" onClick={() => onOpenProfile(attention[0].s, attention.map((x) => x.s))}>
              {attention.length > 1 ? `Go through all ${attention.length}` : "Open their file"} <ArrowRight size={14} />
            </button>
          )}
        </section>

        {/* Companies (superadmin) */}
        {isSuper && companyRows.length > 0 && (
          <section className="dh-card dh-card--companies" aria-labelledby="dh-co-title">
            <header className="dh-card-head">
              <div>
                <h2 id="dh-co-title" className="dh-card-title">Companies</h2>
                <p className="dh-card-sub">{partners.length} partner{partners.length === 1 ? "" : "s"} · where every student comes from and how their files are moving</p>
              </div>
              <button type="button" className="dh-link" onClick={onOpenCompanies}>Manage companies <ArrowUpRight size={14} /></button>
            </header>
            {total > 0 && (
              <div className="dh-share" role="img" aria-label={companyRows.map((c) => `${c.name} ${c.count}`).join(", ")}>
                {companyRows.filter((c) => c.count).map((c, i) => (
                  <span key={c.id} style={{ flexGrow: c.count, background: c.branding?.accent || COMPANY_COLORS[i % COMPANY_COLORS.length] }} title={`${c.name}: ${c.count}`} />
                ))}
              </div>
            )}
            <div className="dh-co-table" role="table" aria-label="Companies">
              <div className="dh-co-row dh-co-row--head" role="row">
                <span role="columnheader">Company</span>
                <span role="columnheader">Students</span>
                <span role="columnheader">In process</span>
                <span role="columnheader">Approved</span>
                <span role="columnheader">Files complete</span>
                <span role="columnheader">Loan value</span>
                <span role="columnheader">Team</span>
              </div>
              {companyRows.map((c, i) => (
                <button key={c.id} type="button" role="row" className="dh-co-row" onClick={() => onOpenStudents({ company: c.id })}>
                  <span role="cell" className="dh-co-name">
                    {c.logoUrl
                      ? <img src={companyLogoSrc(c.logoUrl)} alt="" className="dh-co-logo" />
                      : <span className="dh-co-logo dh-co-logo--initials" style={{ "--co": c.branding?.accent || COMPANY_COLORS[i % COMPANY_COLORS.length] }}>{getInitials(c.name)}</span>}
                    <span className="dh-co-text">
                      <span className="dh-co-title">{c.name}</span>
                      <span className="dh-co-kind">{c.kind === "owner" ? "Owner" : c.status === "active" ? "Partner" : "Suspended"}</span>
                    </span>
                  </span>
                  <span role="cell" data-label="Students" className="dh-co-num">
                    <strong>{c.count}</strong>
                    <span className="dh-co-pct">{total ? `${Math.round((c.count / total) * 100)}%` : ""}</span>
                  </span>
                  <span role="cell" data-label="In process" className="dh-co-num">{c.inprocess}</span>
                  <span role="cell" data-label="Approved" className="dh-co-num">{c.approved}</span>
                  <span role="cell" data-label="Files complete" className="dh-co-progress">
                    {c.complete === null ? <span className="dh-muted">—</span> : (
                      <>
                        <span className="dh-mini-bar"><span style={{ width: `${c.complete}%` }} /></span>
                        <span>{c.complete}%</span>
                      </>
                    )}
                  </span>
                  <span role="cell" data-label="Loan value" className="dh-co-num">{c.value ? compactInr(c.value) : "—"}</span>
                  <span role="cell" data-label="Team" className="dh-co-team">
                    {c.counts ? `${c.counts.admins} admin${c.counts.admins === 1 ? "" : "s"} · ${c.counts.staff} staff · ${c.counts.lenders} lender${c.counts.lenders === 1 ? "" : "s"}` : "—"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Documents */}
        <div className="dh-cell dh-cell--docs">
          <BreakdownCard
            title="Document completion"
            sub={total ? `${stats.complete} of ${total} files complete` : "No students yet"}
            icon={FileText}
            items={[
              { key: "complete", label: "All documents in", value: stats.complete },
              { key: "progress", label: "In progress", value: stats.inProgress },
              { key: "notStarted", label: "Not started", value: stats.notStarted },
            ]}
            active={null}
            onSelect={(key) => onOpenStudents({ doc: key })}
            footer={[
              { label: "Average completion", value: total ? `${stats.avgProgress}%` : "–" },
              { label: "New this week", value: stats.newThisWeek },
            ]}
          />
        </div>

        {/* Advisor workload */}
        {adminLevel && (
          <section className="dh-card dh-cell--advisors" aria-labelledby="dh-adv-title">
            <header className="dh-card-head">
              <div>
                <h2 id="dh-adv-title" className="dh-card-title">Advisor workload</h2>
                <p className="dh-card-sub">Students per advisor and how complete their files are</p>
              </div>
            </header>
            {advisorRows.length === 0 ? (
              <div className="dh-empty"><p>No students yet.</p></div>
            ) : (
              <ul className="dh-adv">
                {advisorRows.slice(0, 6).map((a) => (
                  <li key={a.name || "none"}>
                    <button type="button" className="dh-adv-row" onClick={() => onOpenStudents(a.name ? { advisor: a.name } : {})} disabled={!a.name}>
                      <span className={`dh-avatar dh-avatar--sm${a.name ? "" : " is-none"}`} aria-hidden="true">{a.name ? getInitials(a.name) : "?"}</span>
                      <span className="dh-adv-text">
                        <span className="dh-adv-name">{a.name || "Unassigned"}</span>
                        <span className="dh-adv-bar"><span style={{ width: `${(a.count / maxAdvisor) * 100}%` }} /></span>
                      </span>
                      <span className="dh-adv-nums">
                        <strong>{a.count}</strong>
                        <span>{a.progress}% docs</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Staff: their most recently updated students */}
        {!adminLevel && (
          <section className="dh-card dh-cell--recent" aria-labelledby="dh-recent-title">
            <header className="dh-card-head">
              <div>
                <h2 id="dh-recent-title" className="dh-card-title">Recently updated</h2>
                <p className="dh-card-sub">Your students with the latest changes</p>
              </div>
            </header>
            {recent.length === 0 ? (
              <div className="dh-empty"><p>No students assigned to you yet.</p></div>
            ) : (
              <ul className="dh-attn">
                {recent.map((s) => (
                  <li key={studentKey(s)}>
                    <button type="button" className="dh-attn-row" onClick={() => onOpenProfile(s, recent)}>
                      <span className={`dh-avatar avatar-${getAvatarVariant(s.name)}`} aria-hidden="true">{getInitials(displayName(s.name))}</span>
                      <span className="dh-attn-text">
                        <span className="dh-attn-name">{displayName(s.name)}</span>
                        <span className="dh-attn-reasons">
                          <LoanStatusBadge status={s.loanStatus} />
                          <span className="dh-more">{s.updatedAt ? timeAgo(s.updatedAt) : ""}</span>
                        </span>
                      </span>
                      <ChevronRight size={16} className="dh-chev" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Recent activity */}
        {adminLevel && (
          <div className="dh-cell dh-cell--activity">
            <LiveActivityFeed onViewAll={onOpenAudit} students={students} bankers={bankers} onOpenStudent={onOpenStudentFile} />
          </div>
        )}
      </div>

      <PartnerBanksShowcase />
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

// A sanctioned or disbursed loan whose sanction letter isn't in the file yet
const needsSanctionLetter = (s) => ["sanctioned", "disbursed"].includes(s.loanStatus) && !s.sanctionLetter;

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
      let letter = null;
      if (["sanctioned", "disbursed"].includes(status) && sanctionFile) {
        setLoadingMsg("Uploading sanction letter…");
        try {
          letter = await uploadSanctionLetter(student.name, student.email || student.phone || "", sanctionFile);
        } catch (upErr) {
          // The status is saved; say so, and keep the dialog open to retry the letter
          onUpdated(student.name, status, remark, disbursementPayload);
          setErr(`Status saved, but the sanction letter wasn't uploaded: ${upErr.message}`);
          return;
        }
      }
      onUpdated(student.name, status, remark, disbursementPayload, letter);
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
                onClick={() => { setStatus(key); if (!REMARK_STATUSES.includes(key)) setRemark(""); if (!["sanctioned", "disbursed"].includes(key)) setSanctionFile(null); }}
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

          {["sanctioned", "disbursed"].includes(status) && (
            <div className="lsm-upload-wrap">
              <label className="lsm-remark-label">
                Sanction Letter <span className="lsm-optional">— optional</span>
              </label>
              {!student.sanctionLetter && (
                <p className="lsm-hint">Without it, this file shows “Letter missing” until someone uploads it.</p>
              )}
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

// Upload (or replace) the sanction letter for a sanctioned / disbursed loan
function SanctionLetterModal({ student, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const replacing = Boolean(student.sanctionLetter);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setErr("Choose the sanction letter to upload."); return; }
    setLoading(true);
    setErr("");
    try {
      const letter = await uploadSanctionLetter(student.name, student.email || student.phone || "", file);
      onUploaded(student.name, letter);
      onClose();
    } catch (e2) {
      setErr(e2.message || "The sanction letter wasn't uploaded.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !loading && onClose()}>
      <div className="loan-status-modal animate-fade-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="slm-title">
        <div className="lsm-header">
          <div className="lsm-icon"><FileCheck2 size={22} /></div>
          <div className="lsm-title-block">
            <h3 className="lsm-title" id="slm-title">{replacing ? "Replace sanction letter" : "Upload sanction letter"}</h3>
            <p className="lsm-sub">{displayName(student.name)} · {LOAN_STATUS_CONFIG[student.loanStatus]?.label || "Sanctioned"}</p>
          </div>
          <button className="lsm-close" onClick={onClose} disabled={loading} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="lsm-body">
          <p className="lsm-hint">
            {replacing
              ? `The current letter (${student.sanctionLetter.name}) is replaced. The student sees the new one in their portal.`
              : "Once it's uploaded, the student can download it from their portal and the “Letter missing” flag clears."}
          </p>
          <label className={`lsm-file-drop${file ? " has-file" : ""}`}>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={(e) => setFile(e.target.files[0] || null)} />
            {file ? (
              <div className="lsm-file-selected">
                <FileText size={15} />
                <span className="lsm-file-name">{file.name}</span>
                <button type="button" className="lsm-file-remove" aria-label="Remove file" onClick={(e) => { e.preventDefault(); setFile(null); }}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="lsm-file-placeholder">
                <Upload size={16} />
                <span>Choose the letter: PDF, JPG or PNG</span>
              </div>
            )}
          </label>

          {err && <p className="lsm-error">{err}</p>}

          <div className="lsm-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !file}>
              {loading ? <><RefreshCw size={13} className="spin" /> Uploading…</> : <><Upload size={14} /> {replacing ? "Replace letter" : "Upload letter"}</>}
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
          Scans the student's <strong>Application Form</strong> PDF from Drive, uses AI to reconstruct the
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

// ─── Identity check (admin / advisor only) ────────────────────────────────────
// Name, parents' names, DOB and gender as read from the student's passport /
// Aadhaar / PAN / 10th and 12th certificates, compared against each other and against
// what the student typed. Recomputed from the stored reads every time the
// popup opens, so it reflects edits made after the student's last save.
//
// Laid out for a 3-second read: one verdict line, one plain sentence per
// problem, then a details × documents table where only the cells that
// disagree are coloured.

const BASIC_SCAN = " (basic scan)";
const ENTRY_SOURCES = new Set(["Student's entry", "Entered name"]);

function splitSource(label) {
  return label.endsWith(BASIC_SCAN)
    ? { name: label.slice(0, -BASIC_SCAN.length), basic: true }
    : { name: label, basic: false };
}

const idcTitleCase = (s) => String(s).toLowerCase().replace(/(^|[\s\-'./])([a-z])/g, (m, p, c) => p + c.toUpperCase());

// Same value, same look — "METTU SIDDARDHA" and "Mettu Siddardha" shouldn't
// read as different at a glance when the check already says they match.
function formatIdcValue(key, value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (key === "dob") {
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dmy = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    const d = iso ? new Date(+iso[1], +iso[2] - 1, +iso[3]) : dmy ? new Date(+dmy[3], +dmy[2] - 1, +dmy[1]) : null;
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : v;
  }
  if (key === "gender") {
    const g = v.toUpperCase();
    if (g === "M" || g === "MALE") return "Male";
    if (g === "F" || g === "FEMALE") return "Female";
  }
  return idcTitleCase(v);
}

const IDC_ICON = { match: CheckCircle, partial: AlertTriangle, mismatch: XCircle };

function identityProblems(checks, prefix = "") {
  const out = [];
  for (const c of checks) {
    if (c.status === "match") continue;
    const ref = c.items[0];
    for (const it of c.items.slice(1)) {
      if (it.status === "match") continue;
      out.push({ key: `${prefix}${c.key}-${it.source}`, status: it.status, label: `${prefix}${c.label}`, check: c, ref, item: it });
    }
  }
  return out;
}

function IdentityTable({ checks }) {
  const sources = [];
  for (const c of checks) for (const it of c.items) if (!sources.includes(it.source)) sources.push(it.source);
  sources.sort((a, b) => Number(ENTRY_SOURCES.has(a)) - Number(ENTRY_SOURCES.has(b)));

  return (
    <div className="idc-table-wrap">
      <table className="idc-table">
        <thead>
          <tr>
            <th scope="col">Detail</th>
            {sources.map((s) => {
              const { name, basic } = splitSource(s);
              return (
                <th scope="col" key={s}>
                  {name}
                  {basic && <span className="idc-basic" title="Read by the older text scanner — less reliable">basic scan</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => {
            const RowIcon = IDC_ICON[c.status];
            return (
              <tr key={c.key}>
                <th scope="row" className={`idc-detail idc-detail-${c.status}`}>
                  <RowIcon size={14} /> {c.label}
                </th>
                {sources.map((s) => {
                  const it = c.items.find((i) => i.source === s);
                  if (!it) return <td key={s} className="idc-cell idc-cell-empty">—</td>;
                  const problem = it.status === "partial" || it.status === "mismatch";
                  const CellIcon = IDC_ICON[it.status];
                  return (
                    <td key={s} className={`idc-cell idc-cell-${it.status}`} title={it.note || undefined}>
                      {problem && <CellIcon size={12} />}
                      {formatIdcValue(c.key, it.value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function identityReportFor(student) {
  return buildIdentityReport({
    extractions: student.extractions || {},
    personalInfo: student.personalInfo || {},
    coCount: student.coApplicants || 0,
    legacyDocs: student.uploadedDocuments || [],
  });
}

function IdentityCheckSection({ student }) {
  const report = identityReportFor(student);
  const allChecks = [...report.applicant, ...report.coApplicants.flatMap((co) => co.checks)];
  const usesBasicScan = allChecks.some((c) => c.items.some((i) => i.source.endsWith(BASIC_SCAN)));

  const problems = [
    ...identityProblems(report.applicant),
    ...report.coApplicants.flatMap((co) => identityProblems(co.checks, `${co.label} · `)),
  ];
  const mismatches = problems.filter((p) => p.status === "mismatch").length;
  const toCheck = problems.length - mismatches;
  const docCount = new Set(
    report.applicant
      .flatMap((c) => c.items.map((i) => splitSource(i.source).name))
      .filter((s) => !ENTRY_SOURCES.has(s)),
  ).size;

  let verdict;
  let title;
  let sub;
  if (report.overall === "none") {
    verdict = "none";
    title = "Not checked yet";
    sub = "Fills in once the student uploads at least two of Passport, Aadhaar, PAN, 10th and 12th certificate.";
  } else if (!problems.length) {
    verdict = "match";
    title = "All details match";
    sub = `Name, date of birth and parents' names agree across ${docCount} document${docCount === 1 ? "" : "s"} and the student's entries.`;
  } else {
    verdict = mismatches ? "mismatch" : "partial";
    title = [
      mismatches && `${mismatches} mismatch${mismatches === 1 ? "" : "es"}`,
      toCheck && `${toCheck} detail${toCheck === 1 ? "" : "s"} to check`,
    ].filter(Boolean).join(" · ");
    sub = "Banks reject files when these don't agree — confirm with the student before sending to a lender.";
  }
  const VerdictIcon = verdict === "mismatch" ? XCircle : verdict === "partial" ? AlertTriangle : ShieldCheck;

  const relationChecks = (co) => co.checks.filter((c) => c.key === "relation");
  const tableChecks = (co) => co.checks.filter((c) => c.key !== "relation");

  return (
    <div className="rpt-section idc-section">
      <div className="rpt-section-title">
        <ShieldCheck size={13} /> Identity Check
      </div>

      <div className={`idc-verdict idc-verdict-${verdict}`}>
        <span className="idc-verdict-icon"><VerdictIcon size={18} /></span>
        <div>
          <p className="idc-verdict-title">{title}</p>
          <p className="idc-verdict-sub">{sub}</p>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="idc-problems">
          {problems.map((p) => {
            const Icon = IDC_ICON[p.status];
            const k = p.check.key === "relation" ? "name" : p.check.key;
            return (
              <li key={p.key} className={`idc-problem idc-problem-${p.status}`}>
                <Icon size={14} />
                <span>
                  <strong>{p.label}:</strong> {splitSource(p.item.source).name} has{" "}
                  <em>{formatIdcValue(k, p.item.value)}</em>, {splitSource(p.ref.source).name} has{" "}
                  <em>{formatIdcValue(k, p.ref.value)}</em>
                  {p.item.note && <span className="idc-problem-note"> — {p.item.note.toLowerCase()}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {report.applicant.length > 0 && <IdentityTable checks={report.applicant} />}

      {report.coApplicants.map((co) => (
        <div key={co.index} className="idc-co">
          <p className="idc-co-title">{co.label}</p>
          {tableChecks(co).length > 0 && <IdentityTable checks={tableChecks(co)} />}
          {relationChecks(co).map((c) => {
            const Icon = IDC_ICON[c.status];
            return (
              <p key={c.key} className={`idc-relation idc-relation-${c.status}`}>
                <Icon size={13} />
                <span>
                  {c.label} on the student's documents: <em>{formatIdcValue("name", c.items[0].value)}</em> · co-applicant's ID:{" "}
                  <em>{formatIdcValue("name", c.items[1].value)}</em>
                </span>
              </p>
            );
          })}
        </div>
      ))}

      {usesBasicScan && (
        <p className="idc-footnote">
          "Basic scan" columns come from the older text reader and can misread names — ask the student to re-upload those documents for an accurate check.
        </p>
      )}
    </div>
  );
}

// ─── Document checks (admin / advisor only) ───────────────────────────────────
// Whether each ID / certificate passed the checks built into it (passport
// check digits, Aadhaar checksum, PAN letter rule, memo totals). Failures
// first; a passing document is one line.
const DCK_ICON = { true: CheckCircle, false: XCircle, null: MinusCircle };

function DocumentChecksSection({ student }) {
  const { documents, failed, passed } = buildDocumentChecks({
    extractions: student.extractions || {},
    coCount: student.coApplicants || 0,
  });

  let verdict;
  let title;
  let sub;
  if (!documents.length) {
    verdict = "none";
    title = "No documents checked yet";
    sub = "Passport, Aadhaar, PAN, 10th and 12th are checked automatically when the student uploads them.";
  } else if (failed) {
    verdict = "mismatch";
    title = `${failed} document${failed === 1 ? "" : "s"} failed a check`;
    sub = "Often just a blurred or cropped scan, but it can mean an edited document — ask for a clearer copy or see the original.";
  } else if (passed) {
    verdict = "match";
    title = passed === documents.length ? "All document checks passed" : `${passed} of ${documents.length} documents passed their checks`;
    sub = "These checks catch edits and typing errors in the document itself. They don't replace seeing the original.";
  } else {
    verdict = "partial";
    title = "Documents couldn't be checked";
    sub = "The details couldn't be read well enough to test — check these documents by hand.";
  }
  const VerdictIcon = verdict === "mismatch" ? XCircle : verdict === "partial" ? AlertTriangle : ShieldCheck;
  const order = { fail: 0, unknown: 1, pass: 2 };
  const sorted = [...documents].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="rpt-section idc-section">
      <div className="rpt-section-title">
        <ScanText size={13} /> Document Checks
      </div>

      <div className={`idc-verdict idc-verdict-${verdict}`}>
        <span className="idc-verdict-icon"><VerdictIcon size={18} /></span>
        <div>
          <p className="idc-verdict-title">{title}</p>
          <p className="idc-verdict-sub">{sub}</p>
        </div>
      </div>

      {sorted.length > 0 && (
        <ul className="dck-list">
          {sorted.map((doc) => (
            <li key={doc.label} className={`dck-doc dck-doc-${doc.status}`}>
              <span className="dck-doc-name">{doc.label}</span>
              <ul className="dck-checks">
                {doc.checks.map((c) => {
                  const Icon = DCK_ICON[String(c.ok)];
                  return (
                    <li key={c.text} className={`dck-check dck-check-${String(c.ok)}`}>
                      <Icon size={13} /> <span>{c.text}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
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

          <IdentityCheckSection student={student} />
          <DocumentChecksSection student={student} />

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

/* ─── Student profile (full details) ───────────────────────────────
   Opens over the list as a large sheet: header with the key facts and
   actions, a summary strip, then Overview / Profile / Documents /
   Activity. Everything here is read from the student record already
   loaded for the list; only Activity fetches (the audit log). */

const fmtDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const inr = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return v && Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString("en-IN")}` : "";
};
const scoreText = (score, type, year) => {
  if (!score) return "";
  const unit = type === "marks" ? " marks" : type === "points" ? " points" : type === "cgpa" ? " CGPA" : "%";
  return `${score}${unit}${year ? ` · ${year}` : ""}`;
};
// Only the last four digits of an ID number are ever shown.
const maskTail = (v, keep = 4) => {
  const s = String(v || "").replace(/\s/g, "");
  return s ? `${"•".repeat(Math.max(0, s.length - keep))}${s.slice(-keep)}` : "";
};
const cleanDocLabel = (label = "") => label.replace(/\s*\((?:optional|if)[^)]*\)\s*$/i, "").trim();

function personName(p, fallback) {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || p.fullName || p.name || fallback;
}

// Grouped, labelled view of everything the student filled in.
function profileSections(student) {
  const p = student.personalInfo || {};
  const coCount = student.coApplicants || 0;
  const sections = [
    {
      id: "personal", title: "Personal details", icon: User, rows: [
        { label: "Full name", value: personName(p, displayName(student.name)) },
        { label: "Date of birth", value: fmtDate(p.dob) },
        { label: "Gender", value: p.gender },
        { label: "Nationality", value: p.nationality },
        { label: "Place of birth", value: p.placeOfBirth },
        { label: "Married", value: p.marital },
        { label: "Email", value: student.email || p.email },
        { label: "Mobile", value: student.phone || p.phone },
        { label: "Present address", value: p.currentAddress, wide: true },
        { label: "Permanent address", value: p.permanentAddress, wide: true },
      ],
    },
    {
      id: "identity", title: "Identity", icon: ShieldCheck, rows: [
        { label: "Passport number", value: p.passportNumber },
        { label: "Passport issued", value: fmtDate(p.passportIssueDate) },
        { label: "Passport expires", value: fmtDate(p.passportExpiry) },
        { label: "PAN", value: p.panNumber },
        { label: "Aadhaar", value: maskTail(p.aadhaarNumber), hint: "Masked" },
      ],
    },
    {
      id: "academics", title: "Academics", icon: BookOpen, rows: [
        { label: "Highest qualification", value: p.qualName },
        { label: "Institution", value: p.qualInstitution },
        { label: "Passed out", value: p.qualYear || p.qualPassedYear },
        { label: "10th", value: scoreText(p.pct10Score, p.pct10Type, p.pct10Year) || p.pct10 },
        { label: "12th", value: scoreText(p.pct12Score, p.pct12Type, p.pct12Year) || p.pct12 },
        { label: "Graduation", value: scoreText(p.pctGradScore, p.pctGradType, p.pctGradYear) || p.pctGrad },
        { label: "Backlogs", value: p.hasBacklogs === "Yes" ? `Yes${p.backlogCount ? ` · ${p.backlogCount}` : ""}` : p.hasBacklogs },
        {
          label: "Test scores", wide: true, value: [
            p.greScore && `GRE ${p.greScore}`, p.gmatScore && `GMAT ${p.gmatScore}`, p.ieltsScore && `IELTS ${p.ieltsScore}`,
            p.toeflScore && `TOEFL ${p.toeflScore}`, p.pteScore && `PTE ${p.pteScore}`, p.duolingoScore && `Duolingo ${p.duolingoScore}`,
          ].filter(Boolean).join(" · "),
        },
      ],
    },
    {
      id: "study", title: "Study plan", icon: Plane, rows: [
        { label: "Destination", value: p.destinationCountry },
        { label: "University", value: p.targetUniversity },
        { label: "Course", value: p.courseNameUniversity },
        { label: "I-20 received", value: p.i20Received },
        { label: "Visa slot booked", value: p.visaBooked },
        { label: "Visa slot date", value: fmtDate(p.visaSlotDate) },
      ],
    },
    {
      id: "loan", title: "Loan & finances", icon: Banknote, rows: [
        { label: "Loan amount", value: inr(p.loanAmount) },
        { label: "Student CIBIL", value: p.studentCibil },
        { label: "Applied to a bank before", value: p.priorBankApplied === "Yes" ? `Yes${(p.priorBankName === "Others" ? p.priorBankNameCustom : p.priorBankName) ? ` · ${p.priorBankName === "Others" ? p.priorBankNameCustom : p.priorBankName}` : ""}` : p.priorBankApplied },
        { label: "Family owns a house", value: p.ownHouseStatus },
        { label: "Working", value: p.hasJobDetails === "Yes" ? `Yes${p.jobSpecs ? ` · ${p.jobSpecs}` : ""}` : p.hasJobDetails, wide: p.hasJobDetails === "Yes" },
        { label: "Consultancy", value: [p.consultantNameLoc, p.consultantContact].filter(Boolean).join(" · "), wide: true },
      ],
    },
    {
      id: "family", title: "Family", icon: UsersIcon, rows: [
        { label: "Father", value: [p.fatherName, p.fatherContact].filter(Boolean).join(" · ") },
        { label: "Father’s CIBIL", value: p.fatherCibil },
        { label: "Mother", value: [p.motherName, p.motherContact].filter(Boolean).join(" · ") },
        { label: "Mother’s CIBIL", value: p.motherCibil },
        { label: "Maternal grandmother", value: p.maternalGrandma },
        { label: "Paternal grandmother", value: p.paternalGrandma },
        ...(p.guarantorName ? [
          { label: "Guarantor", value: [p.guarantorName, p.guarantorRelation].filter(Boolean).join(" · ") },
          { label: "Guarantor’s mobile", value: p.guarantorMobile },
          { label: "Guarantor’s CIBIL", value: p.guarantorCibil },
          { label: "Guarantor’s sector", value: p.guarantorSector },
        ] : []),
      ],
    },
  ];

  const coApplicants = Array.from({ length: coCount }, (_, i) => {
    const c = p[`co_info_${i}`] || {};
    const financial = c.financialStatus !== "non-financial";
    return {
      index: i,
      name: personName(c, `Co-applicant ${i + 1}`),
      tag: financial ? (c.empType === "selfEmployed" ? "Self-employed" : c.empType === "other" ? "Financial" : "Salaried") : "Non-financial",
      rows: [
        { label: "Relationship", value: c.relation },
        { label: "Mobile", value: c.mobile },
        { label: "Email", value: c.email },
        { label: "Date of birth", value: fmtDate(c.dob) },
        { label: "PAN", value: c.panNumber },
        { label: "Aadhaar", value: maskTail(c.aadhaarNumber), hint: "Masked" },
        { label: "Occupation", value: c.occupation },
        { label: "Annual income", value: inr(c.annualIncome) },
        { label: "CIBIL", value: c.cibil },
        { label: "Current address", value: c.currentAddress, wide: true },
      ],
    };
  });

  const references = [1, 2].map((n) => ({
    n,
    name: p[`ref${n}_name`],
    detail: [p[`ref${n}_relation`] === "Other" ? p[`ref${n}_custom_relation`] : p[`ref${n}_relation`], p[`ref${n}_occupation`], p[`ref${n}_mobile`]].filter(Boolean).join(" · "),
  })).filter((r) => r.name || r.detail);

  return { sections, coApplicants, references };
}

// Every upload slot, uploaded or not, grouped like the student's portal.
function slotFiles(sectionUploads, fieldId) {
  return Object.entries(sectionUploads || {})
    .filter(([k, v]) => v && (k === fieldId || (k.startsWith(`${fieldId}_`) && /^\d+$/.test(k.slice(fieldId.length + 1)))))
    .map(([, v]) => ({ id: v.id || v.fileId, name: v.name || v.fileName || fieldId, webViewLink: v.webViewLink }));
}

function documentGroups(student) {
  const uploads = student.uploads || {};
  const p = student.personalInfo || {};
  const group = (key, title, fields, sectionKey) => ({
    key, title,
    items: fields.map((f) => ({ id: f.id, label: cleanDocLabel(f.label), required: !f.optional, files: slotFiles(uploads[sectionKey], f.id) })),
  });
  const groups = [
    group("applicant", "Identity & personal", DOCUMENT_SCHEMA.applicant.fields, "applicant"),
    group("academics", "Academics & tests", DOCUMENT_SCHEMA.academics.fields, "academics"),
  ];
  for (let i = 0; i < (student.coApplicants || 0); i++) {
    const info = p[`co_info_${i}`] || {};
    groups.push(group(`co_${i}`, `Co-applicant ${i + 1}${personName(info, "") ? ` · ${personName(info, "")}` : ""}`, coApplicantFields(info), `co_${i}`));
  }
  // Anything else the student added under their own names
  const known = new Set(["applicant", "academics", ...Array.from({ length: student.coApplicants || 0 }, (_, i) => `co_${i}`)]);
  const extra = Object.entries(uploads)
    .filter(([k, v]) => !known.has(k) && v && typeof v === "object")
    .flatMap(([, v]) => Object.entries(v).filter(([, f]) => f).map(([fid, f]) => ({
      id: fid, label: f.customName || f.name || fid, required: false,
      files: [{ id: f.id || f.fileId, name: f.name || f.fileName || fid, webViewLink: f.webViewLink }],
    })));
  if (extra.length) groups.push({ key: "other", title: "Other documents", items: extra });
  return groups;
}

function ProfileRows({ rows }) {
  return (
    <dl className="sp-rows">
      {rows.map((r) => (
        <div key={r.label} className={r.wide ? "is-wide" : undefined}>
          <dt>{r.label}{r.hint && r.value ? <small>{r.hint}</small> : null}</dt>
          <dd className={r.value ? undefined : "is-empty"}>{r.value || "Not provided"}</dd>
        </div>
      ))}
    </dl>
  );
}

function StudentProfile({
  student, position, onPrev, onNext, onClose, adminRole, bankers = [], isDuplicate,
  onLoanStatus, onUploadLetter, onEligibility, onShare, onOpenDrive, onRecover, onDelete, canManage,
  canEditAdvisor, onAdvisorSave, advisorOptions, canEditConsultancy, onConsultancySave, consultancySuggestions,
}) {
  const [tab, setTab] = useState("overview");
  // A letter saved before letters were recorded on the student, found in
  // their Loan_Documents folder: undefined = not looked yet, null = none
  const [foundLetter, setFoundLetter] = useState(undefined);
  const [viewing, setViewing] = useState(null);
  const [copied, setCopied] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [activity, setActivity] = useState(null); // null = not loaded
  const [openEntry, setOpenEntry] = useState(null);
  const [zipBusy, setZipBusy] = useState(false);
  // The student's applicant PIN: null = not loaded, then { hasPin, note }
  const [pin, setPin] = useState(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const canSeeActivity = isAdminLevel(adminRole);
  const name = displayName(student.name);
  const appId = getApplicationId(student);
  const identity = identityReportFor(student);
  const { sections, coApplicants, references } = profileSections(student);
  const groups = documentGroups(student);
  // Every count in the profile comes from the checklist below, so the
  // header, tabs and Documents tab always agree (multi-page slots count once).
  const requiredItems = groups.flatMap((g) => g.items.filter((i) => i.required));
  const missing = requiredItems.filter((i) => !i.files.length);
  const requiredTotal = requiredItems.length;
  const progress = requiredTotal ? Math.round(((requiredTotal - missing.length) / requiredTotal) * 100) : 100;
  const uploadedFiles = groups.flatMap((g) => g.items.flatMap((it) => it.files.map((f) => ({ ...f, slot: it.label, group: g.title }))));
  const generated = [
    student.summaryPdf && { id: student.summaryPdf.fileId || student.summaryPdf.id, name: "Application Form", note: "Built from the profile on every save" },
    student.eligibilityPdf && { id: student.eligibilityPdf.fileId || student.eligibilityPdf.id, name: "Eligibility Report", note: "Scores, CIBIL and readiness" },
  ].filter((g) => g && g.id);
  const letterStage = ["sanctioned", "disbursed"].includes(student.loanStatus);
  const letter = student.sanctionLetter || foundLetter || null;
  const letterFile = letter && { id: letter.fileId, name: "Sanction Letter", slot: "Loan documents" };
  const viewerFiles = [...(letterFile ? [letterFile] : []), ...generated, ...uploadedFiles].filter((f) => f.id).map((f) => ({ id: f.id, name: f.name }));
  const lenders = (student.sharedBankers || []).map((n) => ({ name: n, bank: bankers.find((b) => b.name === n)?.bank || "" }));
  const photo = student.uploads?.applicant?.photo;
  const hasPhoto = !!photo?.id && /\.(jpe?g|png|webp|gif)$/i.test(photo.name || "") && !photoFailed;
  const updated = student.updatedAt ? new Date(student.updatedAt) : null;
  const p = student.personalInfo || {};

  // Esc closes — unless a dialog opened from here (viewer, loan status…) is on top.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".modal-backdrop, .dv-backdrop, .ad-backdrop, .rpt-backdrop")) return;
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, []);

  // This student's audit trail, loaded the first time Activity (or the
  // overview preview) needs it.
  useEffect(() => {
    if (!canSeeActivity || activity !== null) return undefined;
    let cancelled = false;
    getAuditLog({ limit: 500 })
      .then(({ entries }) => {
        if (cancelled) return;
        const target = studentAuditTarget(student);
        setActivity(entries.filter((e) => e.target === target || (student.studentKey && e.target === student.studentKey)));
      })
      .catch(() => { if (!cancelled) setActivity([]); });
    return () => { cancelled = true; };
  }, [canSeeActivity, activity, student]);

  // Students sign in with a PIN; a forgotten one is reset here and they
  // choose a new one on their next visit.
  const pinKey = student.studentKey || studentAuditTarget(student);
  useEffect(() => {
    let cancelled = false;
    callAPI("GET", `/api/applicant/pin-status?studentKey=${encodeURIComponent(pinKey)}`)
      .then((d) => { if (!cancelled && d.success) setPin({ hasPin: d.hasPin }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pinKey]);
  const resetPin = async () => {
    if (!window.confirm(`Reset ${name}’s PIN? They’ll be signed out and choose a new PIN the next time they open their application.`)) return;
    const d = await callAPI("POST", "/api/applicant/reset-pin", { studentKey: pinKey }).catch(() => ({ success: false }));
    setPin(d.success
      ? { hasPin: false, note: "PIN reset — the student creates a new one on their next visit." }
      : { ...(pin || {}), note: d.error || "The PIN couldn’t be reset. Try again." });
  };

  // Older letters weren't recorded on the student: look in the file once
  useEffect(() => {
    if (student.sanctionLetter || foundLetter !== undefined || !letterStage) return undefined;
    let cancelled = false;
    callAPI("GET", `/api/students/${encodeURIComponent(pinKey)}/files`)
      .then((d) => {
        if (cancelled) return;
        const files = Object.entries(d.groups || {})
          .filter(([group]) => group.split("/").pop() === "Loan_Documents")
          .flatMap(([, list]) => list)
          .filter((f) => /^sanction_letter\./i.test(f.name || ""));
        setFoundLetter(files[0] ? { fileId: files[0].id, name: files[0].name, found: true } : null);
      })
      .catch(() => { if (!cancelled) setFoundLetter(null); });
    return () => { cancelled = true; };
  }, [student.sanctionLetter, foundLetter, letterStage, pinKey]);

  const copyId = async () => {
    try { await navigator.clipboard.writeText(appId); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ }
  };
  const downloadZip = async () => {
    setZipBusy(true);
    try { await downloadAllFiles(student.name, student.email || student.phone || ""); } catch { /* the browser shows its own error page */ }
    setZipBusy(false);
  };

  const attention = [
    student._parseError && { tone: "danger", text: "The saved record can’t be read — use Recover data to restore it." },
    isDuplicate && { tone: "warn", text: "Another record uses the same email or phone. Check both before deleting either." },
    (identity.overall === "mismatch" || identity.overall === "partial") && { tone: identity.overall === "mismatch" ? "danger" : "warn", text: `Details differ between documents: ${identity.issues.slice(0, 2).join("; ")}${identity.issues.length > 2 ? "…" : ""}` },
    !student.advisor && { tone: "warn", text: "No advisor is assigned yet." },
    missing.length > 0 && { tone: "info", text: `${missing.length} required document${missing.length === 1 ? "" : "s"} missing`, action: () => setTab("documents") },
    student.loanStatus === "rejected" && student.loanRemark && { tone: "danger", text: `Rejected: ${student.loanRemark}` },
    letterStage && foundLetter === null && !student.sanctionLetter && { tone: "warn", text: "The loan is sanctioned but its sanction letter isn’t in the file yet.", action: onUploadLetter, actionLabel: "Upload" },
  ].filter(Boolean);

  const glance = [
    { label: "Destination", value: [p.destinationCountry, p.targetUniversity].filter(Boolean).join(" · ") },
    { label: "Course", value: p.courseNameUniversity },
    { label: "Loan amount", value: inr(p.loanAmount) },
    { label: "Student CIBIL", value: p.studentCibil },
    { label: "Qualification", value: [p.qualName, p.qualInstitution].filter(Boolean).join(" · ") },
    { label: "Co-applicants", value: student.coApplicants ? coApplicants.map((c) => c.name).join(", ") : "None" },
  ];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "profile", label: "Profile" },
    { id: "documents", label: "Documents", count: missing.length ? `${missing.length} missing` : null },
    ...(canSeeActivity ? [{ id: "activity", label: "Activity", count: activity?.length || null }] : []),
  ];

  const loanCfg = LOAN_STATUS_CONFIG[student.loanStatus || "pending"] || LOAN_STATUS_CONFIG.pending;

  return (
    <div className="sp-backdrop" onClick={onClose}>
      <section className="sp-sheet" role="dialog" aria-modal="true" aria-labelledby="sp-name" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <header className="sp-head">
          <div className="sp-topbar">
            <button type="button" ref={closeRef} className="sp-icon-btn" onClick={onClose} aria-label="Close student profile">
              <X size={18} />
            </button>
            <span className="sp-crumb">Students <ChevronRight size={14} aria-hidden="true" /> <strong>{name}</strong></span>
            {position && (
              <span className="sp-pager">
                <span className="sp-pager-count">{position.index + 1} of {position.total}</span>
                <button type="button" className="sp-icon-btn" onClick={onPrev} disabled={!onPrev} aria-label="Previous student"><ChevronLeft size={18} /></button>
                <button type="button" className="sp-icon-btn" onClick={onNext} disabled={!onNext} aria-label="Next student"><ChevronRight size={18} /></button>
              </span>
            )}
          </div>

          <div className="sp-identity">
            <span className={`sp-avatar${hasPhoto ? " has-photo" : ` avatar-${getAvatarVariant(student.name)}`}`} aria-hidden="true">
              {hasPhoto ? <StudentPhoto fileId={photo.id} onFail={() => setPhotoFailed(true)} /> : getInitials(name)}
            </span>
            <div className="sp-identity-text">
              <h2 id="sp-name" className="sp-name">{name}</h2>
              <div className="sp-meta">
                {appId && (
                  <button type="button" className="sp-appid" onClick={copyId} title="Copy Application ID">
                    {appId} {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
                {(student.email || p.email) && <span><Mail size={14} aria-hidden="true" /> {student.email || p.email}</span>}
                {(student.phone || p.phone) && <span><PhoneIcon size={14} aria-hidden="true" /> {student.phone || p.phone}</span>}
                {adminRole === "superadmin" && student.company?.name && <span><Building2 size={14} aria-hidden="true" /> {student.company.name}</span>}
                {updated && <span className="sp-muted">Updated {timeAgo(updated).replace("Just now", "just now")}</span>}
                {pin && <span className="sp-muted"><KeyRound size={14} aria-hidden="true" /> {pin.hasPin ? "PIN set" : "No PIN yet"}</span>}
              </div>
              {pin?.note && <p className="sp-pin-note" role="status">{pin.note}</p>}
            </div>
            <div className="sp-actions">
              <button type="button" className="sp-btn sp-btn--primary" onClick={onLoanStatus}><Banknote size={16} /> Update loan status</button>
              <button type="button" className="sp-btn" onClick={onShare}><Send size={16} /> Share with lender</button>
              <ActionsMenu
                label="More actions"
                icon={MoreHorizontal}
                className="sp-icon-btn sp-icon-btn--outline"
                items={[
                  { label: "Eligibility report", icon: BarChart3, onSelect: onEligibility },
                  { label: zipBusy ? "Preparing download…" : "Download all files", icon: Download, onSelect: downloadZip },
                  ...(pin?.hasPin ? [{ label: "Reset applicant PIN", icon: KeyRound, onSelect: resetPin }] : []),
                  ...(student.storage !== "railway" ? [{ label: "Open in Drive", icon: ExternalLink, onSelect: onOpenDrive }] : []),
                  ...(canManage ? [
                    { label: "Recover data from PDF", icon: ScanText, onSelect: onRecover },
                    { label: "Delete student", icon: Trash2, onSelect: onDelete, danger: true },
                  ] : []),
                ]}
              />
            </div>
          </div>

          {/* ── Summary strip ── */}
          <div className="sp-summary">
            <div className={`sp-tile sp-tile--loan ${loanCfg.cls}`}>
              <span className="sp-tile-label">Loan status</span>
              <span className="sp-tile-value"><LoanStatusBadge status={student.loanStatus} /></span>
              <span className="sp-tile-sub">
                {student.loanStatusUpdatedBy ? `by ${student.loanStatusUpdatedBy}${student.loanStatusUpdatedAt ? ` · ${timeAgo(student.loanStatusUpdatedAt)}` : ""}` : "Not updated yet"}
              </span>
            </div>
            <button type="button" className="sp-tile sp-tile--button" onClick={() => setTab("documents")}>
              <span className="sp-tile-label">Documents</span>
              <span className="sp-tile-value sp-tile-progress">
                <DocRing pct={progress} />
                <strong>{progress}%</strong>
              </span>
              <span className="sp-tile-sub">{missing.length ? `${missing.length} of ${requiredTotal} required missing` : "All required documents in"}</span>
            </button>
            <div className="sp-tile">
              <span className="sp-tile-label">Advisor</span>
              <span className="sp-tile-value sp-tile-text">{student.advisor || <em>Not assigned</em>}</span>
              {canEditAdvisor
                ? <AdvisorEditor value={student.advisor || ""} onSave={onAdvisorSave} options={advisorOptions} compact />
                : <span className="sp-tile-sub">{student.advisor ? "Assigned advisor" : "Ask an admin to assign one"}</span>}
            </div>
            <div className="sp-tile">
              <span className="sp-tile-label">Lenders</span>
              <span className="sp-tile-value sp-tile-text">{lenders.length ? `${lenders.length} lender${lenders.length === 1 ? "" : "s"}` : <em>Not shared</em>}</span>
              <span className="sp-tile-sub">{lenders.length ? lenders.map((l) => l.bank || l.name).join(", ") : "Share to start the loan review"}</span>
            </div>
          </div>

          <nav className="sp-tabs" role="tablist" aria-label="Student details">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`sp-tab${tab === t.id ? " is-active" : ""}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.count ? <span className={`sp-tab-count${t.id === "documents" ? " is-warn" : ""}`}>{t.count}</span> : null}
              </button>
            ))}
          </nav>
        </header>

        {/* ── Body ── */}
        <div className="sp-body">
          {tab === "overview" && (
            <div className="sp-overview">
              <div className="sp-col">
                <section className="sp-card">
                  <h3 className="sp-card-title">Needs attention</h3>
                  {attention.length === 0 ? (
                    <p className="sp-allclear"><CheckCircle size={18} /> Everything looks good — documents are in and the details match.</p>
                  ) : (
                    <ul className="sp-attention">
                      {attention.map((a) => (
                        <li key={a.text} className={`sp-attn sp-attn--${a.tone}`}>
                          {a.tone === "info" ? <FileClock size={16} /> : <AlertTriangle size={16} />}
                          <span>{a.text}</span>
                          {a.action && <button type="button" className="sp-link" onClick={a.action}>{a.actionLabel || "Review"}</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="sp-card">
                  <h3 className="sp-card-title">At a glance</h3>
                  <ProfileRows rows={glance} />
                  <button type="button" className="sp-link sp-card-more" onClick={() => setTab("profile")}>See full profile <ArrowRight size={14} /></button>
                </section>

                {canEditConsultancy && (
                  <section className="sp-card">
                    <h3 className="sp-card-title">Consultancy</h3>
                    <ConsultancyEditor value={p.consultantNameLoc || ""} onSave={onConsultancySave} suggestions={consultancySuggestions} />
                  </section>
                )}
              </div>

              <div className="sp-col">
                {letterStage && (
                  <section className={`sp-card sp-letter${letter ? " is-in" : " is-missing"}`}>
                    <h3 className="sp-card-title"><FileCheck2 size={16} /> Sanction letter</h3>
                    {letter ? (
                      <div className="sp-file">
                        <span className="sp-file-icon sp-file-icon--letter"><FileCheck2 size={16} /></span>
                        <span className="sp-file-text">
                          <strong>{letter.name}</strong>
                          <span>
                            {letter.found
                              ? "In Loan documents"
                              : [letter.uploadedBy && `Uploaded by ${letter.uploadedBy}`, letter.uploadedAt && timeAgo(letter.uploadedAt)].filter(Boolean).join(" · ") || "In Loan documents"}
                            {" · the student can download it"}
                          </span>
                        </span>
                        <span className="sp-letter-actions">
                          <button type="button" className="sp-btn sp-btn--sm" onClick={() => setViewing(letterFile)}><Eye size={15} /> View</button>
                          <button type="button" className="sp-btn sp-btn--sm" onClick={onUploadLetter}><RefreshCw size={14} /> Replace</button>
                        </span>
                      </div>
                    ) : foundLetter === undefined && !student.sanctionLetter ? (
                      <div className="sp-loading"><div className="loading-dots"><span /><span /><span /></div></div>
                    ) : (
                      <div className="sp-letter-missing">
                        <p><AlertTriangle size={15} aria-hidden="true" /> Not in the file yet. Upload the lender&apos;s letter so the student can download it.</p>
                        <button type="button" className="sp-btn sp-btn--primary sp-btn--sm" onClick={onUploadLetter}><Upload size={14} /> Upload sanction letter</button>
                      </div>
                    )}
                  </section>
                )}

                <section className="sp-card">
                  <h3 className="sp-card-title">Reports</h3>
                  {generated.length === 0 ? (
                    <p className="sp-muted-text">The Application Form appears here after the student saves their profile.</p>
                  ) : (
                    <ul className="sp-files">
                      {generated.map((g) => (
                        <li key={g.name} className="sp-file">
                          <span className="sp-file-icon sp-file-icon--report"><ScanText size={16} /></span>
                          <span className="sp-file-text"><strong>{g.name}</strong><span>{g.note}</span></span>
                          <button type="button" className="sp-btn sp-btn--sm" onClick={() => setViewing(g)}><Eye size={15} /> View</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {canSeeActivity && (
                  <section className="sp-card">
                    <h3 className="sp-card-title">Recent activity</h3>
                    {activity === null ? (
                      <div className="sp-loading"><div className="loading-dots"><span /><span /><span /></div></div>
                    ) : activity.length === 0 ? (
                      <p className="sp-muted-text">No activity recorded yet.</p>
                    ) : (
                      <>
                        <ol className="sp-timeline">
                          {activity.slice(0, 5).map((e) => <ActivityItem key={e.id} entry={e} onOpen={() => setOpenEntry(e)} />)}
                        </ol>
                        {activity.length > 5 && <button type="button" className="sp-link sp-card-more" onClick={() => setTab("activity")}>All {activity.length} events <ArrowRight size={14} /></button>}
                      </>
                    )}
                  </section>
                )}
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div className="sp-profile">
              {sections.map((s) => {
                const Icon = s.icon;
                const filled = s.rows.filter((r) => r.value).length;
                return (
                  <section key={s.id} className="sp-card">
                    <h3 className="sp-card-title"><Icon size={16} /> {s.title} <span className="sp-card-count">{filled}/{s.rows.length}</span></h3>
                    <ProfileRows rows={s.rows} />
                  </section>
                );
              })}
              {coApplicants.map((c) => (
                <section key={c.index} className="sp-card">
                  <h3 className="sp-card-title"><UsersIcon size={16} /> {c.name} <span className="sp-chip">{c.tag}</span></h3>
                  <ProfileRows rows={c.rows} />
                </section>
              ))}
              {references.length > 0 && (
                <section className="sp-card">
                  <h3 className="sp-card-title"><UserCheck size={16} /> References</h3>
                  <ProfileRows rows={references.map((r) => ({ label: `Reference ${r.n}`, value: [r.name, r.detail].filter(Boolean).join(" · "), wide: true }))} />
                </section>
              )}
            </div>
          )}

          {tab === "documents" && (
            <div className="sp-docs">
              <div className="sp-docs-head">
                <div className="sp-docs-progress">
                  <span className="sp-docs-pct">{progress}%</span>
                  <span className="sp-bar"><span style={{ width: `${progress}%` }} /></span>
                  <span className="sp-muted">{missing.length ? `${missing.length} required document${missing.length === 1 ? "" : "s"} still missing` : "Every required document is in"}</span>
                </div>
                <button type="button" className="sp-btn" onClick={downloadZip} disabled={zipBusy || uploadedFiles.length === 0}>
                  {zipBusy ? <RefreshCw size={16} className="spin" /> : <Download size={16} />} Download all
                </button>
              </div>

                {letterStage && (
                  <section className={`sp-card sp-card--flat sp-letter${letter ? " is-in" : " is-missing"}`}>
                    <h3 className="sp-card-title"><FileCheck2 size={16} /> Sanction letter</h3>
                    {letter ? (
                      <div className="sp-file">
                        <span className="sp-file-icon sp-file-icon--letter"><FileCheck2 size={16} /></span>
                        <span className="sp-file-text">
                          <strong>{letter.name}</strong>
                          <span>
                            {letter.found
                              ? "In Loan documents"
                              : [letter.uploadedBy && `Uploaded by ${letter.uploadedBy}`, letter.uploadedAt && timeAgo(letter.uploadedAt)].filter(Boolean).join(" · ") || "In Loan documents"}
                            {" · the student can download it"}
                          </span>
                        </span>
                        <span className="sp-letter-actions">
                          <button type="button" className="sp-btn sp-btn--sm" onClick={() => setViewing(letterFile)}><Eye size={15} /> View</button>
                          <button type="button" className="sp-btn sp-btn--sm" onClick={onUploadLetter}><RefreshCw size={14} /> Replace</button>
                        </span>
                      </div>
                    ) : foundLetter === undefined && !student.sanctionLetter ? (
                      <div className="sp-loading"><div className="loading-dots"><span /><span /><span /></div></div>
                    ) : (
                      <div className="sp-letter-missing">
                        <p><AlertTriangle size={15} aria-hidden="true" /> Not in the file yet. Upload the lender&apos;s letter so the student can download it.</p>
                        <button type="button" className="sp-btn sp-btn--primary sp-btn--sm" onClick={onUploadLetter}><Upload size={14} /> Upload sanction letter</button>
                      </div>
                    )}
                  </section>
                )}

              {generated.length > 0 && (
                <section className="sp-card sp-card--flat">
                  <h3 className="sp-card-title">Generated reports</h3>
                  <ul className="sp-files sp-files--row">
                    {generated.map((g) => (
                      <li key={g.name} className="sp-file">
                        <span className="sp-file-icon sp-file-icon--report"><ScanText size={16} /></span>
                        <span className="sp-file-text"><strong>{g.name}</strong><span>{g.note}</span></span>
                        <button type="button" className="sp-btn sp-btn--sm" onClick={() => setViewing(g)}><Eye size={15} /> View</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {groups.map((g) => {
                const req = g.items.filter((i) => i.required);
                const done = req.filter((i) => i.files.length).length;
                return (
                  <section key={g.key} className="sp-card sp-card--flat">
                    <h3 className="sp-card-title">
                      {g.title}
                      {req.length > 0 && <span className={`sp-card-count${done === req.length ? " is-done" : ""}`}>{done}/{req.length} required</span>}
                    </h3>
                    <ul className="sp-checklist">
                      {g.items.map((it) => {
                        const has = it.files.length > 0;
                        if (!has && !it.required) return null; // empty optional slots stay out of the way
                        return (
                          <li key={it.id} className={`sp-check${has ? " is-done" : " is-missing"}`}>
                            <span className="sp-check-icon" aria-hidden="true">{has ? <CheckCircle size={17} /> : <AlertCircle size={17} />}</span>
                            <span className="sp-check-text">
                              <span className="sp-check-label">{it.label}{!it.required && <em className="sp-optional">Optional</em>}</span>
                              <span className="sp-check-files">
                                {has ? it.files.map((f) => f.name).join(", ") : "Not uploaded yet"}
                              </span>
                            </span>
                            {has && (
                              <span className="sp-check-actions">
                                {it.files.map((f, idx) => (
                                  f.id
                                    ? <button key={f.id} type="button" className="sp-btn sp-btn--sm" onClick={() => setViewing({ id: f.id, name: f.name, slot: it.label })}><Eye size={15} /> {it.files.length > 1 ? `Page ${idx + 1}` : "View"}</button>
                                    : f.webViewLink && <a key={idx} className="sp-btn sp-btn--sm" href={f.webViewLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Drive</a>
                                ))}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          {tab === "activity" && canSeeActivity && (
            <section className="sp-card">
              {activity === null ? (
                <div className="sp-loading"><div className="loading-dots"><span /><span /><span /></div></div>
              ) : activity.length === 0 ? (
                <p className="sp-muted-text">No activity recorded yet.</p>
              ) : (
                <ol className="sp-timeline">
                  {activity.map((e) => <ActivityItem key={e.id} entry={e} onOpen={() => setOpenEntry(e)} />)}
                </ol>
              )}
            </section>
          )}
        </div>
      </section>

      {viewing && (
        <DocumentViewer
          file={{ id: viewing.id, name: viewing.name }}
          files={viewerFiles}
          subtitle={[name, appId, viewing.slot].filter(Boolean).join(" · ")}
          onClose={() => setViewing(null)}
        />
      )}
      {openEntry && (
        <ActivityDetail
          entry={openEntry}
          entries={activity || []}
          students={[student]}
          bankers={bankers}
          label={bankActivityActionLabel}
          onClose={() => setOpenEntry(null)}
        />
      )}
    </div>
  );
}

function ActivityItem({ entry, onOpen }) {
  const prefix = entry.action.split(".")[0];
  const Icon = BANK_ACTIVITY_ACTION_ICON[prefix] || History;
  const tone = AUDIT_ACTION_TONE[prefix] || "slate";
  const d = entry.details || {};
  const extra = entry.action === "loan_status.update"
    ? `${d.previousStatus ? `${LOAN_STATUS_CONFIG[d.previousStatus]?.label || d.previousStatus} → ` : "→ "}${LOAN_STATUS_CONFIG[d.loanStatus]?.label || d.loanStatus || ""}`
    : d.banker || d.fileName || d.file || "";
  return (
    <li>
      <button type="button" className={`sp-event tone-${tone}`} onClick={onOpen}>
        <span className="sp-event-icon" aria-hidden="true"><Icon size={14} /></span>
        <span className="sp-event-text">
          <span className="sp-event-title">{bankActivityActionLabel(entry.action)}{extra && <em> · {extra}</em>}</span>
          <span className="sp-event-meta">{entry.actor} · {new Date(entry.ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </span>
        <ChevronRight size={16} className="sp-event-chevron" aria-hidden="true" />
      </button>
    </li>
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

// The small profile photo in a student row. Loaded privately (no login in
// the URL) and only once the row scrolls into view, so a long list doesn't
// fetch every photo up front.
function StudentPhoto({ fileId, onFail }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const { url, error, type, loading } = useFileObjectUrl(fileId, { thumbnail: true, enabled: visible });
  useEffect(() => {
    if (error || (!loading && visible && !url && type)) onFail();
  }, [error, loading, visible, url, type, onFail]);
  return url ? <img ref={ref} src={url} alt="" onError={onFail} /> : <span ref={ref} className="student-photo-placeholder" />;
}

// Small progress ring for the Document Status column — fill is the student's
// real share of required uploads.
function DocRing({ pct }) {
  const tone = pct === 100 ? "done" : pct >= 50 ? "high" : pct > 0 ? "mid" : "none";
  return (
    <svg viewBox="0 0 20 20" className={`adm-docring adm-docring--${tone}`} aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" className="adm-docring-track" />
      <circle cx="10" cy="10" r="7.5" pathLength="100" strokeDasharray={`${pct} 100`} className="adm-docring-fill" />
    </svg>
  );
}

// Actions menu (row kebab, header overflow). Rendered position: fixed from the
// trigger's rect so it is never clipped by the table's scroll container; it
// follows the trigger on scroll/resize and closes on Escape or outside click.
function ActionsMenu({ label, items, icon: TriggerIcon = MoreVertical, className = "adm-kebab" }) {
  const [pos, setPos] = useState(null);
  const open = pos !== null;
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback((restoreFocus) => {
    setPos(null);
    if (restoreFocus) btnRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r || r.bottom < 0 || r.top > window.innerHeight) { setPos(null); return; }
    const menuH = menuRef.current?.offsetHeight || items.length * 44 + 12;
    const openUp = r.bottom + menuH + 8 > window.innerHeight && r.top > menuH + 8;
    setPos({
      right: Math.max(8, window.innerWidth - r.right),
      top: openUp ? undefined : r.bottom + 6,
      bottom: openUp ? window.innerHeight - r.top + 6 : undefined,
    });
  }, [items.length]);

  const toggle = (e) => {
    e.stopPropagation();
    if (open) close();
    else place();
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const btns = Array.from(menuRef.current?.querySelectorAll("button") || []);
      const i = btns.indexOf(document.activeElement);
      const next = e.key === "ArrowDown" ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      btns[next]?.focus();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, close, place]);

  return (
    <div className="adm-rowmenu" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <TriggerIcon size={17} />
      </button>
      {open && (
        <>
          <div className="adm-rowmenu-scrim" onClick={() => close()} />
          <div
            ref={menuRef}
            role="menu"
            className="adm-rowmenu-list"
            style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}
          >
            {items.map(({ label: itemLabel, icon: Icon, onSelect, danger }) => (
              <button
                key={itemLabel}
                type="button"
                role="menuitem"
                className={danger ? "is-danger" : undefined}
                onClick={(e) => { close(); onSelect(e); }}
              >
                <Icon size={15} /> {itemLabel}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StudentRow({ student, isOpen, onToggle, selected, onToggleSelect, onDelete, onOpenDrive, onViewReport, onSendToBank, onLoanStatusUpdate, onUploadLetter, onRecoverMeta, isDuplicate, showAdvisor, canManage }) {
  const [photoFailed, setPhotoFailed] = useState(false);

  const totalUploads = getTotalUploads(student);
  const required = getTotalRequiredFields(student.coApplicants || 1, student.personalInfo || {});
  const progress = getOverallProgress(student);
  const avatarVariant = getAvatarVariant(student.name);
  const identity = identityReportFor(student);
  const applicationId = getApplicationId(student);
  const destination = (student.personalInfo?.destinationCountry || "").trim();

  // The Govt ID / KYC section's "Passport Size Photo" upload — same field
  // the student's own portal collects. Only tried as an <img> when its
  // filename looks like an actual image; that upload slot also accepts
  // PDFs and Word docs, which can't render as a thumbnail.
  const photoUpload = student.uploads?.applicant?.photo;
  const hasPhoto = !!photoUpload?.id && /\.(jpe?g|png|webp|gif)$/i.test(photoUpload.name || "") && !photoFailed;

  const updated = student.updatedAt ? new Date(student.updatedAt) : null;

  const menuItems = [
    { label: "Open profile", icon: Eye, onSelect: onToggle },
    { label: "Eligibility report", icon: BarChart3, onSelect: onViewReport },
    { label: "Bank access", icon: Send, onSelect: onSendToBank },
    { label: "Update loan status", icon: Banknote, onSelect: onLoanStatusUpdate },
    ...(["sanctioned", "disbursed"].includes(student.loanStatus)
      ? [{ label: student.sanctionLetter ? "Replace sanction letter" : "Upload sanction letter", icon: FileCheck2, onSelect: onUploadLetter }]
      : []),
    ...(student.storage !== "railway" ? [{ label: "Open Drive", icon: ExternalLink, onSelect: onOpenDrive }] : []),
    ...(canManage ? [
      { label: "Recover meta", icon: ScanText, onSelect: onRecoverMeta },
      { label: "Delete student", icon: Trash2, onSelect: onDelete, danger: true },
    ] : []),
  ];

  return (
    <div className={`adm-rowblock${isOpen ? " is-open" : ""}${selected ? " is-selected" : ""}`}>
      <div className={`adm-row${showAdvisor ? " adm-row--advisor" : ""}`} onClick={onToggle}>
        <div className="adm-cell adm-cell--check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label={`Select ${student.name}`} />
        </div>

        <div className="adm-cell adm-cell--student">
          <span className={`adm-avatar${hasPhoto ? " has-photo" : ` avatar-${avatarVariant}`}`} aria-hidden="true">
            {hasPhoto ? (
              <StudentPhoto fileId={photoUpload.id} onFail={() => setPhotoFailed(true)} />
            ) : (
              getInitials(student.name)
            )}
          </span>
          <div className="adm-student-text">
            <button
              type="button"
              className="adm-student-name"
              aria-haspopup="dialog"
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
            >
              {student.name || "Unknown Student"}
            </button>
            <span className="adm-student-contact">{student.email || student.phone || "No contact info"}</span>
            {(student._parseError || isDuplicate || identity.overall === "mismatch" || identity.overall === "partial") && (
              <span className="adm-flags">
                {student._parseError && (
                  <span
                    className="adm-flag adm-flag--danger"
                    title={`This student's data file is unreadable and could not be loaded: ${student._parseError}. Filters, progress, and details may be inaccurate until it's fixed (try Recover Meta).`}
                  >
                    <AlertTriangle size={11} /> Data unreadable
                  </span>
                )}
                {isDuplicate && (
                  <span
                    className="adm-flag adm-flag--warn"
                    title="Another student record shares this same email or phone number — likely a duplicate Drive folder from a double submission. Check both records before deleting either one."
                  >
                    <AlertTriangle size={11} /> Possible duplicate
                  </span>
                )}
                {(identity.overall === "mismatch" || identity.overall === "partial") && (
                  <span
                    className={`adm-flag ${identity.overall === "partial" ? "adm-flag--warn" : "adm-flag--danger"}`}
                    title={`Details differ between this student's documents:\n• ${identity.issues.join("\n• ")}`}
                  >
                    <AlertTriangle size={11} /> {identity.overall === "mismatch" ? "Name/DOB mismatch" : "Details to check"}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="adm-cell adm-cell--appid" data-label="Application ID">
          {applicationId || <span className="adm-empty-val">—</span>}
        </div>
        <div className="adm-cell adm-cell--dest" data-label="Destination">
          {destination || <span className="adm-empty-val">—</span>}
        </div>
        {showAdvisor && (
          <div className="adm-cell adm-cell--advisor" data-label="Advisor">
            {student.advisor || <span className="adm-empty-val">—</span>}
          </div>
        )}
        <div
          className="adm-cell adm-cell--docs"
          data-label="Documents"
          title={`${progress}% complete · ${totalUploads} file${totalUploads === 1 ? "" : "s"} uploaded`}
        >
          <DocRing pct={progress} />
          <span>{Math.min(totalUploads, required)}/{required}</span>
        </div>
        <div className="adm-cell adm-cell--loan" data-label="Loan Status">
          <LoanStatusBadge status={student.loanStatus} />
          {needsSanctionLetter(student) && (
            <button
              type="button"
              className="adm-letter-flag"
              onClick={(e) => { e.stopPropagation(); onUploadLetter(); }}
              title="This loan is sanctioned but its sanction letter isn't in the file. Upload it."
            >
              <AlertTriangle size={11} aria-hidden="true" /> Letter missing
            </button>
          )}
          {student.sanctionLetter && ["sanctioned", "disbursed"].includes(student.loanStatus) && (
            <span className="adm-letter-ok" title={`${student.sanctionLetter.name}${student.sanctionLetter.uploadedBy ? ` · uploaded by ${student.sanctionLetter.uploadedBy}` : ""}`}>
              <CheckCircle size={11} aria-hidden="true" /> Letter in file
            </span>
          )}
        </div>
        <div className="adm-cell adm-cell--updated" data-label="Updated On">
          {updated ? (
            <span className="adm-updated">
              <span>{updated.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
              <span className="adm-updated-time">{updated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
            </span>
          ) : (
            <span className="adm-empty-val">—</span>
          )}
        </div>
        <div className="adm-cell adm-cell--actions">
          <ActionsMenu label={`Actions for ${student.name || "student"}`} items={menuItems} />
        </div>
      </div>

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

function GrantBankAccessModal({ student, onClose, onAccessChanged, adminRole, onRequestSubmitted }) {
  const [bankers, setBankers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(new Set(student.sharedBankers || []));
  // Bankers an advisor has already requested for this student, still
  // awaiting a superadmin's decision — seeded from the pending-requests
  // queue so the "Pending approval" state survives closing/reopening this
  // modal, not just the current toggle click.
  const [pending, setPending] = useState(new Set());
  const [togglingName, setTogglingName] = useState(null);
  const [error, setError] = useState("");

  const identifier = student.email || student.phone || "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bankersRes, requestsRes] = await Promise.all([
          callAPI("GET", "/api/admins/bankers"),
          callAPI("GET", "/api/students/banker-access-requests?status=pending"),
        ]);
        if (cancelled) return;
        if (bankersRes.success) setBankers(bankersRes.bankers || []);
        if (requestsRes.success) {
          const mine = (requestsRes.requests || []).filter(
            (r) => r.studentName === student.name && r.studentIdentifier === identifier,
          );
          setPending(new Set(mine.map((r) => r.bankerName)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [student.name, identifier]);

  const p = student.personalInfo || {};
  const excludedBank = p.priorBankApplied === "Yes"
    ? (p.priorBankName === "Others" ? p.priorBankNameCustom : p.priorBankName)
    : "";

  const toggleAccess = async (bankerName) => {
    const grant = !shared.has(bankerName);
    setTogglingName(bankerName);
    setError("");
    try {
      const r = await callAPI("PUT", "/api/students/banker-access", {
        studentName: student.name, studentIdentifier: identifier, bankerName, grant,
      });
      if (!r.success) {
        setError(r.error || "Failed to update access.");
      } else if (r.pending) {
        setPending((prev) => new Set(prev).add(bankerName));
        onRequestSubmitted?.();
      } else {
        setShared(new Set(r.sharedBankers));
        onAccessChanged?.(student.name, r.sharedBankers);
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
          {adminRole === "advisor"
            ? <>Choose which banker accounts should get access to <strong>{student.name}</strong>'s documents. A superadmin reviews each request before it takes effect.</>
            : <>Choose which banker accounts can log in and view <strong>{student.name}</strong>'s documents. Access can be revoked at any time.</>}
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
            {bankers.map((b) => {
              const isPending = pending.has(b.name);
              return (
                <label key={b.name} className={`team-row bank-check-row${isPending ? " is-pending" : ""}`}>
                  <input
                    type="checkbox"
                    className="bank-checkbox"
                    checked={shared.has(b.name)}
                    disabled={togglingName === b.name || isPending}
                    onChange={() => toggleAccess(b.name)}
                  />
                  <div className="bank-logo-mini-wrap">
                    <img src={getBankLogo(b.bank)} alt={b.bank || b.name} className="bank-logo-mini" onError={(e) => { e.target.style.display = "none"; }} />
                  </div>
                  <div className="team-info">
                    <span className="team-name">{b.name}</span>
                    <span className={`team-role-badge banker${isPending ? " pending-badge" : ""}`}>
                      {togglingName === b.name
                        ? "Updating…"
                        : isPending
                          ? <><Hourglass size={11} /> Pending approval</>
                          : shared.has(b.name) ? "Access granted" : "No access"}
                    </span>
                  </div>
                </label>
              );
            })}
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

// Student names are stored as "Name__identifier"; show only the name part.
const displayName = (name) => (name || "").split("__")[0] || "Unnamed";

function BankerAccessSection({ students, onAccessChanged, onBankersChanged, adminRole, adminName, onRequestsChanged, panel, setPanel }) {
  // Bankers — fetched internally so add/edit/delete stays live
  const [allBankers, setAllBankers] = useState([]);
  const [bankersLoading, setBankersLoading] = useState(true);

  // Selection
  const [selectedName, setSelectedName] = useState(null);

  // Panel ("access" | "add" | "edit" | "requests") is lifted to Admin() so
  // the dashboard's "N requests awaiting review" notification can deep-link
  // straight into the Requests tab instead of just landing on the default
  // access-management view.

  // Access requests — advisor-initiated grants awaiting superadmin review.
  // Superadmin sees every request; the backend scopes an advisor down to
  // just their own, so this component doesn't need to filter by requester.
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestStatusFilter, setRequestStatusFilter] = useState("pending");
  const [decidingId, setDecidingId] = useState(null);
  const [rejectDraftId, setRejectDraftId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [requestsError, setRequestsError] = useState("");

  // Add form
  const [addBank, setAddBank] = useState("");
  const [addName, setAddName] = useState("");
  const [addPass, setAddPass] = useState("");
  const [addEmail, setAddEmail] = useState("");
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

  // Officer list search
  const [officerSearch, setOfficerSearch] = useState("");
  // A lender picked in the bank-wise breakdown narrows the officer list to it
  const [bankFilter, setBankFilter] = useState(null);

  // Access management
  const [accessSearch, setAccessSearch] = useState("");
  // "all" | "unshared": the share list, narrowed to students no lender has yet
  const [grantFilter, setGrantFilter] = useState("all");
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

  // Load on open — the fetch sets state asynchronously, not in the effect body.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchBankers(); }, [fetchBankers]);

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const r = await callAPI("GET", "/api/students/banker-access-requests");
      if (r.success) setRequests(r.requests || []);
    } catch { /* silent — the requests panel just shows nothing to review */ }
    finally { setRequestsLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Derived: unique banks that have registered officers
  const uniqueBanks = Array.from(new Set(allBankers.map((b) => b.bank).filter(Boolean))).sort();

  // Officers listed after the search
  const oq = officerSearch.trim().toLowerCase();
  const listedBankers = allBankers.filter((b) =>
    (!bankFilter || (b.bank || "No lender set") === bankFilter) &&
    (!oq || `${b.name} ${b.bank || ""} ${b.email || ""}`.toLowerCase().includes(oq)));
  const accessCount = (name) => students.filter((s) => (s.sharedBankers || []).includes(name)).length;

  const selectedBanker = allBankers.find((b) => b.name === selectedName) || null;

  // Access management data. A share only counts for officers that still
  // exist; a removed officer's name can linger on a student.
  const bankerNames = new Set(allBankers.map((b) => b.name));
  const sharedWith = (s) => (s.sharedBankers || []).filter((n) => bankerNames.has(n));
  const grantedStudents = students.filter((s) => (s.sharedBankers || []).includes(selectedName));
  const grantedNames = new Set(grantedStudents.map((s) => s.name));
  const q = accessSearch.trim().toLowerCase();
  const availableAll = students.filter((s) => {
    if (grantedNames.has(s.name)) return false;
    if (!q) return true;
    return (s.name || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q);
  });
  const availableStudents = grantFilter === "unshared" ? availableAll.filter((s) => !sharedWith(s).length) : availableAll;
  const visibleAvailable = availableStudents.slice(0, 40);

  // Requests data
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const visibleRequests = requestStatusFilter === "all" ? requests : requests.filter((r) => r.status === requestStatusFilter);
  // Students already requested (still pending) for the currently-selected
  // banker — so the "Grant" list can show "Pending approval" instead of a
  // clickable Grant button for them.
  const pendingForSelected = new Set(
    pendingRequests.filter((r) => r.bankerName === selectedName).map((r) => r.studentName),
  );

  // Handlers
  const toggleAccess = async (student, grant) => {
    setTogglingName(student.name);
    setAccessError("");
    try {
      const identifier = student.email || student.phone || "";
      const r = await callAPI("PUT", "/api/students/banker-access", {
        studentName: student.name, studentIdentifier: identifier, bankerName: selectedName, grant,
      });
      if (!r.success) {
        setAccessError(r.error || "Failed to update access.");
      } else if (r.pending) {
        await fetchRequests();
        onRequestsChanged?.();
      } else {
        onAccessChanged?.(student.name, r.sharedBankers);
      }
    } catch (e) {
      setAccessError(e.message || "Network error.");
    } finally {
      setTogglingName(null);
    }
  };

  const handleApprove = async (request) => {
    setDecidingId(request.id);
    setRequestsError("");
    try {
      const r = await callAPI("POST", `/api/students/banker-access-requests/${encodeURIComponent(request.id)}/approve`);
      if (r.success) {
        setRequests((prev) => prev.map((x) => (x.id === request.id ? r.request : x)));
        onAccessChanged?.(request.studentName, r.sharedBankers);
        onRequestsChanged?.();
      } else {
        setRequestsError(r.error || "Failed to approve request.");
      }
    } catch (e) {
      setRequestsError(e.message || "Network error.");
    } finally {
      setDecidingId(null);
    }
  };

  const handleReject = async (request) => {
    setDecidingId(request.id);
    setRequestsError("");
    try {
      const r = await callAPI("POST", `/api/students/banker-access-requests/${encodeURIComponent(request.id)}/reject`, {
        note: rejectNote.trim() || undefined,
      });
      if (r.success) {
        setRequests((prev) => prev.map((x) => (x.id === request.id ? r.request : x)));
        setRejectDraftId(null);
        setRejectNote("");
        onRequestsChanged?.();
      } else {
        setRequestsError(r.error || "Failed to reject request.");
      }
    } catch (e) {
      setRequestsError(e.message || "Network error.");
    } finally {
      setDecidingId(null);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addBank) { setAddMsg({ type: "err", text: "Please select a bank." }); return; }
    if (!addName.trim()) { setAddMsg({ type: "err", text: "Name is required." }); return; }
    if (!/^\S+@\S+\.\S{2,}$/.test(addEmail.trim())) { setAddMsg({ type: "err", text: "Enter their email — they sign in with it." }); return; }
    if (passwordProblem(addPass)) { setAddMsg({ type: "err", text: `Password: ${passwordProblem(addPass)}.` }); return; }
    setAddLoading(true); setAddMsg(null);
    try {
      const r = await callAPI("POST", "/api/admins", {
        name: addName.trim(), email: addEmail.trim(), role: "banker", password: addPass,
        bank: addBank,
      });
      if (r.success) {
        setAddMsg({ type: "ok", text: `${addName.trim()} added successfully.` });
        setAddBank(""); setAddName(""); setAddPass(""); setAddEmail("");
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
      if (editPass && passwordProblem(editPass)) { setEditMsg({ type: "err", text: `Password: ${passwordProblem(editPass)}.` }); setEditLoading(false); return; }
      const r = await callAPI("PUT", `/api/admins/${editBanker.id}`, { bank: editBank, email: editEmail.trim() });
      if (!r.success) { setEditMsg({ type: "err", text: r.error || "Failed to update." }); setEditLoading(false); return; }
      if (editPass) {
        const rp = await callAPI("PUT", `/api/admins/${editBanker.id}/reset-password`, { newPassword: editPass });
        if (!rp.success) { setEditMsg({ type: "err", text: rp.error || "Failed to reset password." }); setEditLoading(false); return; }
      }
      setEditMsg({ type: "ok", text: "Saved successfully." });
      await fetchBankers(); onBankersChanged?.();
      setTimeout(() => { setPanel("access"); setEditBanker(null); setEditMsg(null); }, 1400);
    } catch { setEditMsg({ type: "err", text: "Network error." }); }
    finally { setEditLoading(false); }
  };

  const handleDelete = async (banker) => {
    setDeleteLoading(true);
    try {
      const r = await callAPI("DELETE", `/api/admins/${banker.id}`);
      if (r.success) {
        setDeleteTarget(null);
        if (editBanker?.name === banker.name) { setPanel("access"); setEditBanker(null); }
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
    setAddBank(""); setAddName(""); setAddPass(""); setAddEmail("");
  };

  const officersTab = panel !== "requests";
  const adminLevel = isAdminLevel(adminRole);
  const firstName = (name) => (name || "").split(" ")[0] || name;

  // ── Headline figures ──
  const sharedStudents = students.filter((s) => sharedWith(s).length > 0);
  const notSharedCount = students.length - sharedStudents.length;
  const approvedByLenders = sharedStudents.filter((s) => ["sanctioned", "disbursed"].includes(s.loanStatus));
  const approvedValue = approvedByLenders.reduce((sum, s) => sum + amountOf(s), 0);
  // Bank-wise: each lender's officers, and the students those officers hold
  const lenders = [];
  for (const b of allBankers) {
    const bank = b.bank || "No lender set";
    let l = lenders.find((x) => x.bank === bank);
    if (!l) { l = { bank, officers: [] }; lenders.push(l); }
    l.officers.push(b);
  }
  for (const l of lenders) {
    const names = new Set(l.officers.map((o) => o.name));
    const held = students.filter((st) => (st.sharedBankers || []).some((n) => names.has(n)));
    l.files = held.length;
    l.approved = held.filter((st) => ["sanctioned", "disbursed"].includes(st.loanStatus)).length;
  }
  lenders.sort((a, b) => b.officers.length - a.officers.length || a.bank.localeCompare(b.bank));
  const pickLender = (l) => {
    setPanel("access");
    if (bankFilter === l.bank) { setBankFilter(null); return; }
    setBankFilter(l.bank);
    if (!l.officers.some((o) => o.name === selectedName)) setSelectedName(l.officers[0]?.name || null);
  };
  const officersWithFiles = allBankers.filter((b) => accessCount(b.name) > 0).length;
  const oldestPending = pendingRequests.reduce((min, r) => (!min || r.requestedAt < min ? r.requestedAt : min), null);
  const kpis = [
    {
      key: "lenders", label: "Lenders", value: uniqueBanks.length, icon: Building2, tone: "violet",
      sub: lenders[0] ? `Most officers at ${lenders[0].bank}` : "No lenders yet",
      open: () => {
        setPanel("access"); setBankFilter(null);
        document.getElementById("bl-lenders")?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    },
    {
      key: "officers", label: "Loan officers", value: allBankers.length, icon: Landmark, tone: "teal",
      sub: allBankers.length ? `${officersWithFiles} with files shared` : "No officers yet",
      open: () => { setPanel("access"); setBankFilter(null); },
    },
    {
      key: "shared", label: "Files shared with lenders", value: sharedStudents.length, icon: FileCheck2, tone: "blue",
      sub: !students.length ? "No students yet" : notSharedCount ? `${notSharedCount} not shared yet` : "Every student is shared",
      open: () => { setPanel("access"); setGrantFilter(notSharedCount ? "unshared" : "all"); },
    },
    {
      key: "approved", label: "Approved by lenders", value: approvedByLenders.length, icon: BadgeCheck, tone: "green",
      sub: approvedValue ? `${compactInr(approvedValue)} sanctioned` : "No sanctions yet", up: approvedByLenders.length > 0,
    },
    {
      key: "requests", label: adminLevel ? "Requests to review" : "Your requests waiting", value: pendingRequests.length, icon: Hourglass, tone: "indigo",
      sub: oldestPending ? `Oldest sent ${timeAgo(oldestPending)}` : "Nothing waiting",
      open: () => setPanel("requests"),
    },
  ];

  // ── The selected officer ──
  const grantedInProcess = grantedStudents.filter((s) => s.loanStatus === "inprocess").length;
  const grantedApproved = grantedStudents.filter((s) => ["sanctioned", "disbursed"].includes(s.loanStatus)).length;
  const officerStats = [
    { key: "see", label: "Can see", value: grantedStudents.length, unit: grantedStudents.length === 1 ? "student" : "students" },
    { key: "process", label: "With the lender", value: grantedInProcess, unit: "in process" },
    { key: "approved", label: "Approved", value: grantedApproved, unit: "sanctioned" },
    { key: "waiting", label: "Waiting", value: pendingForSelected.size, unit: pendingForSelected.size === 1 ? "request" : "requests" },
  ];

  // Officers grouped under their lender, lenders A–Z
  const groups = [];
  for (const b of listedBankers) {
    const bank = b.bank || "No lender set";
    let g = groups.find((x) => x.bank === bank);
    if (!g) { g = { bank, officers: [] }; groups.push(g); }
    g.officers.push(b);
  }
  groups.sort((a, b) => a.bank.localeCompare(b.bank));

  const othersFor = (st) => sharedWith(st).filter((n) => n !== selectedName);
  const alsoWith = (st) => {
    const others = othersFor(st);
    if (!others.length) return null;
    return others.length === 1 ? `Also with ${others[0]}` : `Also with ${others[0]} +${others.length - 1}`;
  };

  const studentRow = (st, action) => {
    const also = alsoWith(st);
    return (
      <li key={st.name} className="bl-student">
        <span className={`bl-avatar avatar-${getAvatarVariant(displayName(st.name))}`} aria-hidden="true">{getInitials(displayName(st.name))}</span>
        <span className="bl-student-text">
          <span className="bl-student-name">{displayName(st.name)}</span>
          <span className="bl-student-sub">
            <LoanStatusBadge status={st.loanStatus} />
            {also
              ? <span className="bl-also"><Users size={12} aria-hidden="true" /> {also}</span>
              : <span className="bl-contact">{st.email || st.phone || "No contact saved"}</span>}
          </span>
        </span>
        {action}
      </li>
    );
  };

  const formBank = panel === "add" ? addBank : editBank;
  const formName = panel === "add" ? addName.trim() : editBanker?.name;

  return (
    <div className="bl-page dh animate-fade-in">
      {/* ── At a glance ───────────────────────────────────────── */}
      <section className="dh-kpis dh-kpis--5 bl-kpis" aria-label="Lending at a glance">
        {kpis.map((k) => {
          const Icon = k.icon;
          const Tag = k.open ? "button" : "div";
          return (
            <Tag key={k.key} {...(k.open ? { type: "button", onClick: k.open } : {})} className={`dh-kpi dh-tone-${k.tone}${k.open ? "" : " is-static"}`}>
              <span className="dh-kpi-top">
                <span className="dh-kpi-label">{k.label}</span>
                <span className="dh-kpi-icon" aria-hidden="true"><Icon size={18} /></span>
              </span>
              <span className="dh-kpi-mid">
                <span className="dh-kpi-value"><CountUp text={bankersLoading ? "–" : k.value} /></span>
                {k.open && <ArrowUpRight size={16} className="dh-kpi-go" aria-hidden="true" />}
              </span>
              <span className={`dh-kpi-sub${k.up ? " is-up" : ""}`}>{bankersLoading ? "Loading…" : k.sub}</span>
            </Tag>
          );
        })}
      </section>

      {/* ── Tabs + primary action ─────────────────────────────── */}
      <div className="bl-bar">
        <div className="bl-tabs" role="tablist" aria-label="Banks & lenders">
          <button
            type="button"
            role="tab"
            aria-selected={officersTab}
            className={`bl-tab${officersTab ? " is-active" : ""}`}
            onClick={() => setPanel("access")}
          >
            <Users size={16} aria-hidden="true" /> Loan officers
            <span className="bl-tab-count">{allBankers.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!officersTab}
            className={`bl-tab${!officersTab ? " is-active" : ""}`}
            onClick={() => setPanel("requests")}
          >
            <Hourglass size={16} aria-hidden="true" /> Access requests
            {pendingRequests.length > 0 && <span className="bl-tab-count bl-tab-count--alert">{pendingRequests.length}</span>}
          </button>
        </div>
        <button type="button" className="adm-btn adm-btn--primary bl-add" onClick={openAdd}>
          <Plus size={17} /> <span>Add loan officer</span>
        </button>
      </div>

      {/* ── Bank-wise: who works at each lender ──────────────────── */}
      {officersTab && lenders.length > 0 && (
        <section id="bl-lenders" className="bl-card bl-lenders" aria-labelledby="bl-lenders-title">
          <header className="bl-card-head">
            <div>
              <h2 id="bl-lenders-title" className="bl-card-title">Lenders</h2>
              <p className="bl-card-sub">Officers and student files at each lender. Pick one to list only its officers.</p>
            </div>
            {bankFilter && (
              <button type="button" className="bl-btn bl-btn--sm" onClick={() => setBankFilter(null)}>
                <X size={13} /> Show all lenders
              </button>
            )}
          </header>
          <ul className="bl-lender-grid">
            {lenders.map((l) => {
              const active = bankFilter === l.bank;
              const extra = l.officers.length - 3;
              return (
                <li key={l.bank}>
                  <button type="button" className={`bl-lender${active ? " is-active" : ""}`} aria-pressed={active} onClick={() => pickLender(l)}>
                    <span className="bl-lender-top">
                      <span className="bl-logo">
                        <img src={getBankLogo(l.bank)} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                      </span>
                      <span className="bl-lender-name">{l.bank}</span>
                    </span>
                    <span className="bl-lender-figs">
                      <span><strong>{l.officers.length}</strong> {l.officers.length === 1 ? "officer" : "officers"}</span>
                      <span><strong>{l.files}</strong> {l.files === 1 ? "file" : "files"}</span>
                      <span className="is-approved"><strong>{l.approved}</strong> approved</span>
                    </span>
                    <span className="bl-lender-team">
                      <span className="bl-stack" aria-hidden="true">
                        {l.officers.slice(0, 3).map((o) => (
                          <span key={o.name} className={`bl-avatar bl-avatar--xs avatar-${getAvatarVariant(o.name)}`}>{getInitials(o.name)}</span>
                        ))}
                        {extra > 0 && <span className="bl-avatar bl-avatar--xs bl-avatar--more">+{extra}</span>}
                      </span>
                      <span className="bl-lender-names">{l.officers.map((o) => o.name).join(", ")}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {officersTab && (
        <div className="bl-layout">
          {/* ── Officers, grouped by lender ──────────────────────── */}
          <aside className="bl-card bl-list" aria-label="Loan officers">
            <header className="bl-card-head">
              <div>
                <h2 className="bl-card-title">Loan officers</h2>
                <p className="bl-card-sub">
                  {bankFilter ? <>Showing <strong>{bankFilter}</strong> only</> : "Pick one to see and change what they can open"}
                </p>
              </div>
              {bankFilter && (
                <button type="button" className="bl-clear" onClick={() => setBankFilter(null)} aria-label="Show officers at every lender">
                  <X size={14} />
                </button>
              )}
            </header>
            <label className="bl-search">
              <span className="sr-only">Search loan officers</span>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search name, lender or email…"
                value={officerSearch}
                onChange={(e) => setOfficerSearch(e.target.value)}
              />
            </label>

            {bankersLoading ? (
              <div className="bl-state"><div className="loading-dots"><span /><span /><span /></div></div>
            ) : listedBankers.length === 0 ? (
              <div className="bl-state">
                <Building2 size={26} aria-hidden="true" />
                <p>{oq ? "No officers match your search." : "Officers you add appear here, grouped by lender."}</p>
              </div>
            ) : (
              <div className="bl-groups">
                {groups.map((g) => (
                  <section key={g.bank} className="bl-bankgroup" aria-label={g.bank}>
                    <p className="bl-bankgroup-head">
                      <span className="bl-logo bl-logo--xs">
                        <img src={getBankLogo(g.bank)} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                      </span>
                      <span className="bl-bankgroup-name">{g.bank}</span>
                      <span className="bl-bankgroup-count">{g.officers.length}</span>
                    </p>
                    <ul className="bl-officers">
                      {g.officers.map((b) => {
                        const isSelected = selectedName === b.name && panel !== "add";
                        const count = accessCount(b.name);
                        return (
                          <li key={b.name}>
                            <button
                              type="button"
                              className={`bl-officer${isSelected ? " is-selected" : ""}`}
                              aria-current={isSelected ? "true" : undefined}
                              onClick={() => { setSelectedName(b.name); if (panel === "edit" || panel === "add") setPanel("access"); }}
                            >
                              <span className={`bl-avatar avatar-${getAvatarVariant(b.name)}`} aria-hidden="true">{getInitials(b.name)}</span>
                              <span className="bl-officer-text">
                                <span className="bl-officer-name">{b.name}</span>
                                <span className="bl-officer-bank">{b.email || "No email saved"}</span>
                              </span>
                              <span className={`bl-officer-count${count ? "" : " is-zero"}`} title={`${count} student${count !== 1 ? "s" : ""} shared`}>
                                {count} <small>{count === 1 ? "file" : "files"}</small>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </aside>

          {/* ── Detail / forms ───────────────────────────────────── */}
          <section className="bl-detail" aria-live="polite">
            {panel === "access" && (
              selectedBanker ? (
                <>
                  <header className="bl-card bl-hero">
                    <div className="bl-hero-top">
                      <span className="bl-logo bl-logo--lg">
                        <img src={getBankLogo(selectedBanker.bank)} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                      </span>
                      <div className="bl-hero-text">
                        <p className="bl-hero-bank">{selectedBanker.bank || "No lender set"}</p>
                        <h2 className="bl-hero-name">{selectedBanker.name}</h2>
                        <p className="bl-hero-meta">
                          {selectedBanker.email && <span><Mail size={13} aria-hidden="true" /> {selectedBanker.email}</span>}
                          {selectedBanker.createdAt && (
                            <span><CalendarDays size={13} aria-hidden="true" /> Officer since {new Date(selectedBanker.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
                          )}
                        </p>
                      </div>
                      <div className="bl-hero-actions">
                        {deleteTarget === selectedBanker.name ? (
                          <div className="bl-confirm" role="group" aria-label="Confirm removal">
                            <span>Remove {firstName(selectedBanker.name)}? They lose access to every file.</span>
                            <button type="button" className="bl-btn bl-btn--danger" disabled={deleteLoading} onClick={() => handleDelete(selectedBanker)}>
                              {deleteLoading ? <RefreshCw size={14} className="spin" /> : "Remove"}
                            </button>
                            <button type="button" className="bl-btn" disabled={deleteLoading} onClick={() => setDeleteTarget(null)}>Cancel</button>
                          </div>
                        ) : (
                          <>
                            <button type="button" className="bl-btn" onClick={() => openEdit(selectedBanker)}>
                              <Pencil size={14} /> Edit
                            </button>
                            <button type="button" className="bl-btn bl-btn--quiet-danger" onClick={() => setDeleteTarget(selectedBanker.name)}>
                              <Trash2 size={14} /> Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <dl className="bl-hero-stats">
                      {officerStats.map((s) => (
                        <div key={s.key} className={`bl-stat bl-stat--${s.key}`}>
                          <dt>{s.label}</dt>
                          <dd><strong>{s.value}</strong> {s.unit}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="bl-hero-note">
                      <ShieldCheck size={15} aria-hidden="true" />
                      <span>
                        {firstName(selectedBanker.name)} only sees the students under <strong>Can see</strong>, in the secure viewer.
                        {adminLevel ? " Sharing and revoking take effect straight away." : " A superadmin approves each new share before it takes effect."}
                      </span>
                    </p>
                  </header>

                  {accessError && <p className="bl-error" role="alert"><AlertCircle size={15} /> {accessError}</p>}

                  <div className="bl-columns">
                    <section className="bl-card bl-group" aria-label={`Students ${selectedBanker.name} can see`}>
                      <header className="bl-group-head">
                        <span className="bl-group-icon is-see" aria-hidden="true"><Eye size={16} /></span>
                        <div className="bl-group-heading">
                          <h3>Can see</h3>
                          <p>Files {firstName(selectedBanker.name)} can open now</p>
                        </div>
                        <span className="bl-group-count">{grantedStudents.length}</span>
                      </header>
                      {grantedStudents.length === 0 ? (
                        <div className="bl-empty">
                          <FolderOpen size={22} aria-hidden="true" />
                          <p>No files shared yet. Share a student from the list beside this one.</p>
                        </div>
                      ) : (
                        <ul className="bl-students">
                          {grantedStudents.map((st) => studentRow(st, (
                            <button type="button" className="bl-btn bl-btn--sm bl-btn--quiet-danger" disabled={togglingName === st.name} onClick={() => toggleAccess(st, false)}>
                              {togglingName === st.name ? <RefreshCw size={13} className="spin" /> : "Revoke"}
                            </button>
                          )))}
                        </ul>
                      )}
                    </section>

                    <section className="bl-card bl-group" aria-label={`Share more students with ${selectedBanker.name}`}>
                      <header className="bl-group-head">
                        <span className="bl-group-icon is-share" aria-hidden="true"><Send size={15} /></span>
                        <div className="bl-group-heading">
                          <h3>{adminLevel ? "Share more files" : "Ask to share"}</h3>
                          <p>{adminLevel ? "Pick a student to share with this officer" : "Your request goes to a superadmin"}</p>
                        </div>
                        <span className="bl-group-count">{availableStudents.length}</span>
                      </header>
                      <div className="bl-group-tools">
                        <label className="bl-search">
                          <span className="sr-only">Search students</span>
                          <Search size={16} aria-hidden="true" />
                          <input
                            type="search"
                            placeholder="Search name, email or phone…"
                            value={accessSearch}
                            onChange={(e) => setAccessSearch(e.target.value)}
                          />
                        </label>
                        <div className="bl-chips" role="group" aria-label="Which students">
                          <button type="button" className={`bl-chip${grantFilter === "all" ? " is-active" : ""}`} aria-pressed={grantFilter === "all"} onClick={() => setGrantFilter("all")}>
                            Everyone <span>{availableAll.length}</span>
                          </button>
                          <button type="button" className={`bl-chip${grantFilter === "unshared" ? " is-active" : ""}`} aria-pressed={grantFilter === "unshared"} onClick={() => setGrantFilter("unshared")}>
                            Not with any lender <span>{availableAll.filter((s) => !sharedWith(s).length).length}</span>
                          </button>
                        </div>
                      </div>
                      {visibleAvailable.length === 0 ? (
                        <div className="bl-empty">
                          <CheckCircle size={22} aria-hidden="true" />
                          <p>{!students.length ? "No students yet. They appear here once they register." : accessSearch ? "No matching students." : grantFilter === "unshared" ? "Every student is with at least one lender." : "Every student is already shared."}</p>
                        </div>
                      ) : (
                        <ul className="bl-students">
                          {visibleAvailable.map((st) => studentRow(st, pendingForSelected.has(st.name) ? (
                            <span className="bl-pill bl-pill--pending"><Hourglass size={12} /> Awaiting approval</span>
                          ) : (
                            <button type="button" className="bl-btn bl-btn--sm bl-btn--primary-soft" disabled={togglingName === st.name} onClick={() => toggleAccess(st, true)}>
                              {togglingName === st.name ? <RefreshCw size={13} className="spin" /> : <><Plus size={13} /> {adminLevel ? "Share" : "Request"}</>}
                            </button>
                          )))}
                        </ul>
                      )}
                      {availableStudents.length > visibleAvailable.length && (
                        <p className="bl-more">+{availableStudents.length - visibleAvailable.length} more. Search to find them.</p>
                      )}
                    </section>
                  </div>
                </>
              ) : (
                <div className="bl-card bl-blank">
                  <span className="bl-blank-icon"><Landmark size={28} /></span>
                  <h2>No loan officers yet</h2>
                  <p>Add the officers you work with at each lender. They only see the student files you share with them.</p>
                  <button type="button" className="adm-btn adm-btn--primary" onClick={openAdd}><Plus size={16} /> Add loan officer</button>
                </div>
              )
            )}

            {(panel === "add" || (panel === "edit" && editBanker)) && (
              <div className="bl-formwrap animate-fade-in">
                <form onSubmit={panel === "add" ? handleAdd : handleEdit} className="bl-card bl-form">
                  <header className="bl-form-head">
                    <h2>{panel === "add" ? "Add loan officer" : `Edit ${editBanker.name}`}</h2>
                    <p>{panel === "add"
                      ? "They sign in on the staff login with this email and only see students you share with them."
                      : "Change their lender or email, or set a new password."}</p>
                  </header>

                  <label className="bl-field">
                    <span>Lender {panel === "add" && <em className="bl-req">*</em>}</span>
                    <span className="bl-select-wrap">
                      {formBank && <img src={getBankLogo(formBank)} alt="" className="bl-select-logo" />}
                      <select
                        className={`bl-input${formBank ? " has-logo" : ""}`}
                        value={formBank}
                        onChange={(e) => (panel === "add" ? setAddBank : setEditBank)(e.target.value)}
                      >
                        <option value="">Select a lender</option>
                        {BANK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </span>
                  </label>

                  {panel === "add" && (
                    <label className="bl-field">
                      <span>Full name <em className="bl-req">*</em></span>
                      <input className="bl-input" type="text" placeholder="e.g. Rajesh Kumar" value={addName} onChange={(e) => setAddName(e.target.value)} autoComplete="off" />
                    </label>
                  )}

                  <label className="bl-field">
                    <span>Email {panel === "add" && <em className="bl-req">*</em>} <small>they sign in with this</small></span>
                    <input
                      className="bl-input"
                      type="email"
                      placeholder="name@bank.com"
                      value={panel === "add" ? addEmail : editEmail}
                      onChange={(e) => (panel === "add" ? setAddEmail : setEditEmail)(e.target.value)}
                      autoComplete="off"
                    />
                  </label>

                  <label className="bl-field">
                    <span>
                      {panel === "add" ? <>Password <em className="bl-req">*</em></> : <>New password <small>leave blank to keep the current one</small></>}
                    </span>
                    <span className="bl-pw">
                      <input
                        className="bl-input"
                        type={(panel === "add" ? addShowPass : editShowPass) ? "text" : "password"}
                        placeholder="At least 10 characters, with a number"
                        value={panel === "add" ? addPass : editPass}
                        onChange={(e) => (panel === "add" ? setAddPass : setEditPass)(e.target.value)}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="bl-pw-toggle"
                        aria-label={(panel === "add" ? addShowPass : editShowPass) ? "Hide password" : "Show password"}
                        onClick={() => (panel === "add" ? setAddShowPass(!addShowPass) : setEditShowPass(!editShowPass))}
                      >
                        {(panel === "add" ? addShowPass : editShowPass) ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                  </label>

                  {(panel === "add" ? addMsg : editMsg) && (
                    <p className={`bl-msg bl-msg--${(panel === "add" ? addMsg : editMsg).type}`} role="status">
                      {(panel === "add" ? addMsg : editMsg).text}
                    </p>
                  )}

                  <div className="bl-form-actions">
                    <button type="submit" className="adm-btn adm-btn--primary" disabled={panel === "add" ? addLoading : editLoading}>
                      {(panel === "add" ? addLoading : editLoading)
                        ? <><RefreshCw size={15} className="spin" /> {panel === "add" ? "Creating…" : "Saving…"}</>
                        : panel === "add" ? <><Plus size={15} /> Create officer</> : <><CheckCircle size={15} /> Save changes</>}
                    </button>
                    <button type="button" className="adm-btn adm-btn--outline" onClick={() => { setPanel("access"); setEditBanker(null); }}>Cancel</button>
                  </div>
                </form>

                {/* What the officer gets, previewed as they'll appear */}
                <aside className="bl-card bl-explain" aria-label="What a loan officer can do">
                  <div className="bl-preview">
                    <span className="bl-logo bl-logo--md">
                      {formBank
                        ? <img src={getBankLogo(formBank)} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                        : <Landmark size={20} aria-hidden="true" />}
                    </span>
                    <span className="bl-preview-text">
                      <span className="bl-preview-name">{formName || "New loan officer"}</span>
                      <span className="bl-preview-bank">{formBank || "Choose their lender"}</span>
                    </span>
                  </div>
                  <h3>What a loan officer can do</h3>
                  <ul className="bl-explain-list">
                    <li><span aria-hidden="true"><Eye size={15} /></span><p><strong>See only shared students.</strong> Nothing else in your workspace is visible to them.</p></li>
                    <li><span aria-hidden="true"><ShieldCheck size={15} /></span><p><strong>Review in a secure viewer.</strong> Documents open inside DocLocker, not by email.</p></li>
                    <li><span aria-hidden="true"><Download size={15} /></span><p><strong>Download with one-time links.</strong> Each link stops working once it's used.</p></li>
                    <li><span aria-hidden="true"><History size={15} /></span><p><strong>Leave a full trail.</strong> Views, downloads and status changes go to the audit log.</p></li>
                  </ul>
                </aside>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Access requests ──────────────────────────────────────── */}
      {!officersTab && (
        <section className="bl-requests" aria-label="Access requests">
          <div className="bl-card bl-flow">
            <ol className="bl-flow-steps">
              <li><span>1</span><p><strong>An advisor asks</strong> to share a student with a loan officer</p></li>
              <li><span>2</span><p><strong>A superadmin decides</strong>: approve or reject, with a reason</p></li>
              <li><span>3</span><p><strong>The officer sees the file</strong> once it's approved, never before</p></li>
            </ol>
          </div>

          <div className="bl-requests-head">
            <h2 className="bl-requests-title">
              {requestStatusFilter === "pending" ? (adminLevel ? "Waiting for your decision" : "Waiting for a decision")
                : requestStatusFilter === "approved" ? "Approved requests"
                : requestStatusFilter === "rejected" ? "Rejected requests" : "Every request"}
            </h2>
            <div className="bl-seg" role="group" aria-label="Filter requests">
              {[
                { id: "pending", label: "Pending" },
                { id: "approved", label: "Approved" },
                { id: "rejected", label: "Rejected" },
                { id: "all", label: "All" },
              ].map((t) => {
                const count = t.id === "all" ? requests.length : requests.filter((r) => r.status === t.id).length;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`bl-seg-btn${requestStatusFilter === t.id ? " is-active" : ""}`}
                    aria-pressed={requestStatusFilter === t.id}
                    onClick={() => setRequestStatusFilter(t.id)}
                  >
                    {t.label} <span className="bl-seg-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {requestsError && <p className="bl-error" role="alert"><AlertCircle size={15} /> {requestsError}</p>}

          {requestsLoading ? (
            <div className="bl-state"><div className="loading-dots"><span /><span /><span /></div></div>
          ) : visibleRequests.length === 0 ? (
            <div className="bl-card bl-blank">
              <span className="bl-blank-icon"><CheckCircle size={26} /></span>
              <h2>{requestStatusFilter === "pending" ? "All caught up" : "No requests here"}</h2>
              <p>{requestStatusFilter === "pending" ? "Nothing is waiting for review." : "Requests show up here once advisors send them."}</p>
            </div>
          ) : (
            <ul className="bl-request-list">
              {visibleRequests.map((r) => {
                const bank = allBankers.find((b) => b.name === r.bankerName)?.bank;
                const st = students.find((s) => s.name === r.studentName);
                return (
                  <li key={r.id} className={`bl-card bl-request status-${r.status}`}>
                    <div className="bl-request-pair">
                      <span className="bl-request-party">
                        <span className={`bl-avatar avatar-${getAvatarVariant(displayName(r.studentName))}`} aria-hidden="true">{getInitials(displayName(r.studentName))}</span>
                        <span className="bl-request-party-text">
                          <strong>{displayName(r.studentName)}</strong>
                          {st ? <LoanStatusBadge status={st.loanStatus} /> : <small>Student</small>}
                        </span>
                      </span>
                      <span className="bl-request-arrow" aria-label="to be shared with"><ArrowRight size={16} /></span>
                      <span className="bl-request-party">
                        <span className="bl-logo bl-logo--sm">
                          <img src={getBankLogo(bank)} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                        </span>
                        <span className="bl-request-party-text">
                          <strong>{r.bankerName}</strong>
                          <small>{bank || "Lender not set"}</small>
                        </span>
                      </span>
                    </div>
                    <div className="bl-request-info">
                      <p className="bl-request-meta">
                        Asked by <strong>{r.requestedBy === adminName ? "you" : r.requestedBy}</strong> · {timeAgo(r.requestedAt)}
                        {r.status !== "pending" && r.decidedBy && (
                          <> · {r.status === "approved" ? "approved" : "rejected"} by {r.decidedBy} {timeAgo(r.decidedAt)}</>
                        )}
                      </p>
                      {r.note && <p className="bl-request-note">“{r.note}”</p>}
                      {r.status === "pending" && adminLevel && rejectDraftId === r.id && (
                        <div className="bl-reject">
                          <input
                            className="bl-input"
                            placeholder="Reason for rejecting (optional)"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            autoFocus
                          />
                          <button type="button" className="bl-btn bl-btn--danger" disabled={decidingId === r.id} onClick={() => handleReject(r)}>
                            {decidingId === r.id ? <RefreshCw size={14} className="spin" /> : "Reject"}
                          </button>
                          <button type="button" className="bl-btn" disabled={decidingId === r.id} onClick={() => { setRejectDraftId(null); setRejectNote(""); }}>Cancel</button>
                        </div>
                      )}
                    </div>
                    <div className="bl-request-side">
                      {/* Approve/Reject already say it's waiting; the pill marks the rest */}
                      {!(r.status === "pending" && adminLevel) && (
                        <span className={`bl-pill bl-pill--${r.status}`}>
                          {r.status === "pending" ? <><Hourglass size={12} /> Pending</> : r.status === "approved" ? <><CheckCircle size={12} /> Approved</> : <><XCircle size={12} /> Rejected</>}
                        </span>
                      )}
                      {r.status === "pending" && adminLevel && rejectDraftId !== r.id && (
                        <div className="bl-request-actions">
                          <button type="button" className="bl-btn bl-btn--sm bl-btn--success" disabled={decidingId === r.id} onClick={() => handleApprove(r)}>
                            {decidingId === r.id ? <RefreshCw size={13} className="spin" /> : <><CheckCircle size={14} /> Approve</>}
                          </button>
                          <button type="button" className="bl-btn bl-btn--sm" disabled={decidingId === r.id} onClick={() => { setRejectDraftId(r.id); setRejectNote(""); }}>
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/* ─── Settings Panel ───────────────────────────────────────────── */

// Staff API calls live in utils/adminApi.js (callAPI).

function SettingsPanel({ onClose }) {
  const { loginAdmin } = useStudent();
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [passMsg, setPassMsg] = useState(null);
  const [passLoading, setPassLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const problem = passwordProblem(newPass);
    if (problem) { setPassMsg({ type: "err", text: `${problem}.` }); return; }
    if (newPass !== confirmPass) { setPassMsg({ type: "err", text: "Passwords do not match." }); return; }
    setPassLoading(true); setPassMsg(null);
    try {
      const r = await callAPI("PUT", "/api/admins/password", { currentPassword: curPass, newPassword: newPass });
      if (r.success) {
        // A password change signs out every other device; this one keeps
        // working with the session that came back.
        loginAdmin(r.role, r.advisorName, r.name, r.token, r.bank, r.account);
        setPassMsg({ type: "ok", text: "Password updated. Other devices have been signed out." });
        setCurPass(""); setNewPass(""); setConfirmPass("");
      } else {
        setPassMsg({ type: "err", text: r.error || "Failed to update password." });
      }
    } catch { setPassMsg({ type: "err", text: "Network error. Try again." }); }
    finally { setPassLoading(false); }
  };

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-panel animate-fade-in">
        <div className="settings-header">
          <div className="settings-title"><Settings size={16} /> Settings</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings"><X size={16} /></button>
        </div>

        <div className="settings-body">
          <form onSubmit={handleChangePassword} className="settings-form">
            <p className="settings-section-label">Change your password</p>
            <div className="input-group">
              <label>Current password</label>
              <div className="password-wrap">
                <input className="input-field" type={showPass ? "text" : "password"} placeholder="Your current password"
                  value={curPass} onChange={(e) => setCurPass(e.target.value)} autoComplete="current-password" />
                <button type="button" className="show-pass" onClick={() => setShowPass(!showPass)} aria-label={showPass ? "Hide passwords" : "Show passwords"}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="input-group">
              <label>New password</label>
              <input className="input-field" type={showPass ? "text" : "password"} placeholder="At least 10 characters, with a number"
                value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="input-group">
              <label>Confirm new password</label>
              <input className="input-field" type={showPass ? "text" : "password"} placeholder="Repeat new password"
                value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} autoComplete="new-password" />
            </div>
            {passMsg && <p className={`settings-msg ${passMsg.type}`} role="status">{passMsg.text}</p>}
            <button type="submit" className="btn btn-primary btn-sm" disabled={passLoading}>
              {passLoading ? <><RefreshCw size={13} className="spin" /> Saving…</> : <><KeyRound size={13} /> Update password</>}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

/* ─── Main Component ───────────────────────────────────────────── */

// A stable per-student identity for React keys and state tracking.
// driveUrl / studentKey are always unique (one Drive folder or one Railway
// record per student); name is NOT —
// two students can share a display name, and a student whose meta.json
// failed to parse falls back to showing its raw folder-key name, which can
// collide with another record. Using name/array-index as a key or state
// pointer lets the wrong row appear expanded/selected after a filter or
// list refresh reorders things.
function studentKey(s) {
  return s.driveUrl || s.studentKey || s.email || s.phone || s.name;
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

function AdminSidebar({
  section, setSection, adminRole, adminName,
  onOpenSettings, onLogout,
  mobileOpen, onCloseMobile,
  setLoanStatusFilter,
  pendingBankerRequests = 0,
}) {
  const [expanded, setExpanded] = useState(null);
  const drawerRef = useRef(null);
  const roleLabel = ROLE_LABELS[adminRole] || "Staff";
  const initials = getInitials(adminName);

  // Drawer mode (below the desktop breakpoint): Escape closes it, focus moves
  // into it on open and the page behind stops scrolling.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => { if (e.key === "Escape") onCloseMobile?.(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector("button")?.focus();
    const drawer = drawerRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (drawer?.contains(document.activeElement)) document.querySelector(".adm-menu-btn")?.focus();
    };
  }, [mobileOpen, onCloseMobile]);

  const goStudents = (apply) => {
    setSection("students");
    apply?.();
    onCloseMobile?.();
  };

  const NAV_ITEMS = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid, roles: ["superadmin", "admin", "advisor"] },
    { id: "students",  label: adminRole === "advisor" ? "My Students" : "Students", icon: Users, roles: ["superadmin", "admin", "advisor"] },
    { id: "advisors",  label: "Advisors",  icon: UserCheck,  roles: ["superadmin", "admin"] },
    {
      id: "loanApps", label: "Loan Applications", icon: FileText, roles: ["superadmin", "admin", "advisor"],
      subItems: LOAN_STATUS_SUBITEMS.map((s) => ({
        label: s.label,
        onSelect: () => goStudents(() => setLoanStatusFilter(s.value)),
      })),
    },
    { id: "documents", label: "Document Management", icon: FolderOpen, roles: ["superadmin", "admin"] },
    { id: "banks", label: "Banks & Lenders", icon: Landmark, roles: ["superadmin", "admin", "advisor"] },
    { id: "docReader", label: "Document Reader", icon: ScanSearch, roles: ["superadmin", "admin", "advisor"] },
    { id: "converter", label: "File Converter", icon: ArrowRightLeft, roles: ["superadmin", "admin", "advisor"] },
    { id: "team", label: "Team", icon: UsersRound, roles: ["superadmin", "admin"] },
    { id: "companies", label: adminRole === "superadmin" ? "Companies" : "Company", icon: Building2, roles: ["superadmin", "admin"] },
    {
      id: "reports", label: "Reports", icon: BarChart3, roles: ["superadmin", "admin"],
      subItems: [
        { label: "Audit Log", active: section === "audit", onSelect: () => { setSection("audit"); onCloseMobile?.(); } },
        { label: "Bank Activity", active: section === "bankActivity", onSelect: () => { setSection("bankActivity"); onCloseMobile?.(); } },
      ],
    },
  ];
  const visibleNav = NAV_ITEMS.filter((n) => n.roles.includes(adminRole));
  const reduceMotion = useReducedMotion();

  return (
    <>
      {mobileOpen && <div className="adm-scrim" onClick={onCloseMobile} aria-hidden="true" />}
      <aside
        ref={drawerRef}
        id="adm-sidebar"
        className={`adm-sidebar${mobileOpen ? " is-open" : ""}`}
        aria-label="Admin navigation"
      >
        {/* Soft light drifting behind the menu (decoration only) */}
        <span className="adm-sidebar-glow is-a" aria-hidden="true" />
        <span className="adm-sidebar-glow is-b" aria-hidden="true" />
        <div className="adm-sidebar-top">
          <div className="adm-sidebar-brand">
            <BrandLogo size="sm" />
            <button type="button" className="adm-sidebar-close" onClick={onCloseMobile} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          {/* A partner team's own logo is the BrandLogo above */}
          <div className="adm-sidebar-role">
            <span className="adm-avatar adm-avatar--xs" aria-hidden="true">{initials}</span>
            <span>{roleLabel}</span>
          </div>
        </div>

        <nav className="adm-nav" aria-label="Sections">
          {visibleNav.map(({ id, label, icon: Icon, subItems }) => {
            const isActive = id === "reports" ? (section === "audit" || section === "bankActivity") : section === id;
            const isExpanded = expanded === id;
            return (
              <div key={id} className="adm-nav-group">
                <button
                  type="button"
                  className={`adm-nav-link${isActive && !subItems ? " is-active" : ""}${isActive && subItems ? " is-current" : ""}`}
                  aria-current={isActive && !subItems ? "page" : undefined}
                  aria-expanded={subItems ? isExpanded : undefined}
                  onClick={() => {
                    if (subItems) setExpanded(isExpanded ? null : id);
                    else { setSection(id); onCloseMobile?.(); }
                  }}
                >
                  {isActive && (
                    <motion.span
                      layoutId="adm-nav-pill"
                      className="adm-nav-pill"
                      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                      aria-hidden="true"
                    />
                  )}
                  <Icon size={19} className="adm-nav-icon" />
                  <span className="adm-nav-label">{label}</span>
                  {id === "banks" && pendingBankerRequests > 0 && (
                    <span className="adm-nav-badge" title={`${pendingBankerRequests} banker access request${pendingBankerRequests === 1 ? "" : "s"} awaiting review`}>
                      {pendingBankerRequests > 99 ? "99+" : pendingBankerRequests}
                    </span>
                  )}
                  {subItems && <ChevronDown size={15} className={`adm-nav-chevron${isExpanded ? " is-expanded" : ""}`} />}
                </button>
                {subItems && isExpanded && (
                  <div className="adm-nav-sub">
                    {subItems.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        className={`adm-nav-sublink${s.active ? " is-active" : ""}`}
                        aria-current={s.active ? "page" : undefined}
                        onClick={s.onSelect}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="adm-nav-divider" role="separator" />
          <button type="button" className="adm-nav-link" onClick={() => { onOpenSettings(); onCloseMobile?.(); }}>
            <Settings size={19} className="adm-nav-icon" />
            <span className="adm-nav-label">Settings</span>
          </button>
        </nav>

        <div className="adm-sidebar-footer">
          <div className="adm-user-card">
            <span className="adm-avatar adm-avatar--lg" aria-hidden="true">{initials}</span>
            <span className="adm-user-text">
              <span className="adm-user-name">{adminName || roleLabel}</span>
              <span className="adm-user-role">{roleLabel}</span>
            </span>
          </div>
          <button type="button" className="adm-logout" onClick={onLogout}>
            <LogOut size={17} />
            <span>Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

/* ─── Compact top bar below the desktop breakpoint: menu + logo ─── */

function AdminMobileBar({ onOpenMenu, menuOpen }) {
  return (
    <header className="adm-mobilebar">
      <button
        type="button"
        className="adm-icon-btn adm-menu-btn"
        onClick={onOpenMenu}
        aria-label="Open menu"
        aria-controls="adm-sidebar"
        aria-expanded={menuOpen}
      >
        <Menu size={20} />
      </button>
      <BrandLogo size="sm" />
    </header>
  );
}

/* ─── Advisors section ────────────────────────────────────────────── */

function AdvisorsSection({ students, allAdvisors, onOpenAdvisor }) {
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
          <button
            key={r.name}
            type="button"
            className="advisor-card"
            onClick={() => onOpenAdvisor(r.name)}
            aria-label={`Open ${r.name}'s ${r.total} student${r.total === 1 ? "" : "s"}`}
          >
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
            <span className="advisor-card-go">
              View students <ArrowRight size={14} aria-hidden="true" />
            </span>
          </button>
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
  "banker_access.request": "Requested bank access",
  "banker_access.approve": "Approved bank access request",
  "banker_access.reject": "Rejected bank access request",
  "sanction_letter.upload": "Uploaded sanction letter",
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
  student: UserRound,
  loan_status: Banknote,
  banker_access: Landmark,
  company: Building2,
  document_reader: ScanSearch,
  sanction_letter: FileCheck2,
};
const AUDIT_ACTION_TONE = {
  auth: "blue",
  admin: "violet",
  student: "rose",
  loan_status: "orange",
  banker_access: "teal",
  company: "violet",
  document: "blue",
  sanction_letter: "teal",
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

/* ─── Activity detail panel ─────────────────────────────────────────
   One side panel for every activity list (dashboard feed, Audit Log,
   Bank Activity): what changed, which student, who did it and when. */

const FULL_DATE = { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
const ACTIVITY_ROLE_LABELS = { ...ROLE_LABELS, student: "Student" };
const DOC_CHECK_LABELS = { pass: "Passed", review: "Needs review", fail: "Failed" };

// Student lookup by the folder key audit entries carry as their target.
function buildStudentIndex(students) {
  const map = new Map();
  for (const st of students || []) {
    map.set(studentAuditTarget(st), st);
    if (st.studentKey) map.set(st.studentKey, st);
  }
  return map;
}

// Status before a loan-status change. Newer entries record it; for older
// ones it's the previous change to the same student in the loaded log.
function previousLoanStatus(entry, entries) {
  if (entry.details?.previousStatus) return { status: entry.details.previousStatus, derived: false };
  const earlier = (entries || [])
    .filter((x) => x.action === "loan_status.update" && x.target === entry.target && x.ts < entry.ts)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))[0];
  return earlier?.details?.loanStatus ? { status: earlier.details.loanStatus, derived: true } : null;
}

function formatInr(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `₹${v.toLocaleString("en-IN")}` : String(n);
}

function formatDisbursement(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "tenureMonths") return `${value} months`;
  if (key === "interestRate") return `${value}%`;
  return formatInr(value);
}

// Label/value rows describing what an entry did, by action.
function activityChangeRows(entry, bankers) {
  const d = entry.details || {};
  const bankOf = (name) => bankers.find((b) => b.name === name)?.bank;
  const rows = [];
  const officer = (name) => name && rows.push({
    label: "Loan officer",
    value: (
      <span className="ad-officer">
        {bankOf(name) && <img src={getBankLogo(bankOf(name))} alt="" onError={(e) => { e.target.style.display = "none"; }} />}
        <span>{name}{bankOf(name) ? ` · ${bankOf(name)}` : ""}</span>
      </span>
    ),
  });
  switch (entry.action.split(".")[0]) {
    case "banker_access":
      officer(d.banker);
      if (d.requestedBy) rows.push({ label: "Requested by", value: d.requestedBy });
      if (d.note) rows.push({ label: "Reason", value: d.note });
      break;
    case "document":
      if (d.fileName || d.file) rows.push({ label: "File", value: d.fileName || d.file });
      if (d.subFolder) rows.push({ label: "Section", value: d.subFolder });
      if (d.docType) rows.push({ label: "Document type", value: d.docType });
      if (d.check) rows.push({ label: "Automatic check", value: DOC_CHECK_LABELS[d.check] || d.check });
      if (d.files) rows.push({ label: "Files", value: d.files });
      if (d.fileCount) rows.push({ label: "Files read", value: d.fileCount });
      if (d.review) rows.push({ label: "Review", value: d.review });
      break;
    case "document_reader":
      rows.push({ label: "Document type", value: entry.target || "—" });
      if (d.fileCount) rows.push({ label: "Files read", value: d.fileCount });
      if (d.seconds) rows.push({ label: "Time taken", value: `${d.seconds}s` });
      break;
    case "admin":
      rows.push({ label: "Account", value: entry.target || "—" });
      if (d.role) rows.push({ label: "Role", value: ACTIVITY_ROLE_LABELS[d.role] || d.role });
      break;
    case "student":
      if (d.count) rows.push({ label: "Records removed", value: d.count });
      if (d.documents) rows.push({ label: "Documents removed", value: d.documents });
      break;
    default:
      break;
  }
  return rows;
}

const ACTIVITY_SUMMARY = {
  "auth.login": "Signed in to the workspace.",
  "student.save": "The student saved their application details.",
  "summary.generate": "A new Application Form PDF was generated.",
  "banker_access.grant": "This student's files were shared with the loan officer.",
  "banker_access.revoke": "The loan officer can no longer see this student.",
  "banker_access.request": "An advisor asked to share this student with a loan officer.",
  "banker_access.approve": "The request was approved and the files were shared.",
  "banker_access.reject": "The request was rejected; nothing was shared.",
  "document.view": "A document was opened in the viewer.",
  "document.download": "A document was downloaded.",
  "document.upload": "A document was uploaded.",
  "document.rejected": "An upload was rejected by the automatic check.",
  "student.delete": "The student and their documents were deleted.",
};

function ActivityDetail({ entry, entries, students, bankers = [], label = auditActionLabel, onClose, onOpenStudent }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const prefix = entry.action.split(".")[0];
  const Icon = BANK_ACTIVITY_ACTION_ICON[prefix] || History;
  const tone = AUDIT_ACTION_TONE[prefix] || "slate";
  const student = buildStudentIndex(students).get(entry.target) || null;
  const isStudentTarget = !["auth", "admin", "document_reader"].includes(prefix) && Boolean(entry.target);
  const d = entry.details || {};
  const isLoan = entry.action === "loan_status.update";
  const prev = isLoan ? previousLoanStatus(entry, entries) : null;
  const rows = activityChangeRows(entry, bankers);
  const disbursement = isLoan && d.disbursement ? DISBURSEMENT_FIELDS.filter((f) => d.disbursement[f.key] !== undefined) : [];
  const when = new Date(entry.ts);

  return createPortal(
    <div className="ad-backdrop" onClick={onClose}>
      <aside
        className="ad-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ad-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`ad-head tone-${tone}`}>
          <span className="ad-head-icon" aria-hidden="true"><Icon size={20} /></span>
          <div className="ad-head-text">
            <h2 id="ad-title">{label(entry.action)}</h2>
            <p><time dateTime={entry.ts}>{when.toLocaleString("en-IN", FULL_DATE)}</time> · {timeAgo(entry.ts)}</p>
          </div>
          <button type="button" ref={closeRef} className="ad-close" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </header>

        <div className="ad-body">
          {/* What changed */}
          <section className="ad-section" aria-label="What changed">
            <h3 className="ad-section-title">What happened</h3>
            {isLoan ? (
              <>
                <div className="ad-change">
                  <div className="ad-change-side">
                    <span className="ad-change-label">From</span>
                    {prev ? <LoanStatusBadge status={prev.status} /> : <span className="ad-muted">Not recorded</span>}
                  </div>
                  <ArrowRight size={18} className="ad-change-arrow" aria-label="changed to" />
                  <div className="ad-change-side">
                    <span className="ad-change-label">To</span>
                    <LoanStatusBadge status={d.loanStatus} />
                  </div>
                </div>
                {prev?.derived && <p className="ad-hint">Previous status taken from the earlier change in the log.</p>}
                {d.remark && (
                  <div className="ad-note">
                    <span className="ad-change-label">Remark</span>
                    <p>{d.remark}</p>
                  </div>
                )}
                {disbursement.length > 0 && (
                  <dl className="ad-grid">
                    {disbursement.map((f) => (
                      <div key={f.key}>
                        <dt>{f.label}</dt>
                        <dd>{formatDisbursement(f.key, d.disbursement[f.key])}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            ) : (
              <>
                {ACTIVITY_SUMMARY[entry.action] && <p className="ad-summary">{ACTIVITY_SUMMARY[entry.action]}</p>}
                {rows.length > 0 && (
                  <dl className="ad-rows">
                    {rows.map((r) => (
                      <div key={r.label}>
                        <dt>{r.label}</dt>
                        <dd>{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {!ACTIVITY_SUMMARY[entry.action] && rows.length === 0 && <p className="ad-summary">{label(entry.action)}.</p>}
              </>
            )}
          </section>

          {/* Student */}
          {isStudentTarget && (
            <section className="ad-section" aria-label="Student">
              <h3 className="ad-section-title">Student</h3>
              {student ? (
                <div className="ad-student">
                  <div className="ad-student-top">
                    <span className="ad-avatar" aria-hidden="true">{getInitials(displayName(student.name))}</span>
                    <div className="ad-student-text">
                      <p className="ad-student-name">{displayName(student.name)}</p>
                      <p className="ad-student-id">{getApplicationId(student)}</p>
                    </div>
                    <span className="ad-current" title="Current loan status">
                      <span>Now</span>
                      <LoanStatusBadge status={student.loanStatus} />
                    </span>
                  </div>
                  <dl className="ad-rows ad-rows--compact">
                    {student.email && <div><dt>Email</dt><dd>{student.email}</dd></div>}
                    {student.phone && <div><dt>Phone</dt><dd>{student.phone}</dd></div>}
                    {student.advisor && <div><dt>Advisor</dt><dd>{student.advisor}</dd></div>}
                    {(student.sharedBankers || []).length > 0 && (
                      <div><dt>Shared with</dt><dd>{student.sharedBankers.join(", ")}</dd></div>
                    )}
                  </dl>
                  {onOpenStudent && (
                    <button type="button" className="ad-open" onClick={() => { onClose(); onOpenStudent(student); }}>
                      Open student file <ArrowUpRight size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="ad-student ad-student--missing">
                  <p className="ad-student-name">{displayName(entry.target)}</p>
                  <p className="ad-muted">Not in the current student list. They may have been deleted.</p>
                </div>
              )}
            </section>
          )}

          {/* Who */}
          <section className="ad-section" aria-label="Done by">
            <h3 className="ad-section-title">Done by</h3>
            <div className="ad-actor">
              <span className={`ad-avatar ad-avatar--${entry.role || "other"}`} aria-hidden="true">{getInitials(entry.actor)}</span>
              <div>
                <p className="ad-student-name">{entry.actor || "Unknown"}</p>
                <p className="ad-muted">{ACTIVITY_ROLE_LABELS[entry.role] || entry.role || "—"}</p>
              </div>
            </div>
          </section>
        </div>

        <footer className="ad-foot">Reference {String(entry.id).replace(/^db-/, "#")}</footer>
      </aside>
    </div>,
    document.body,
  );
}

// Right-rail companion to the dashboard's KPI cards — a running feed of the
// same audit log the full Audit Log screen shows, trimmed to the most
// recent entries and polished for a glance rather than an investigation.
// Polls quietly in the background so it reads as "live" without a socket;
// entries that weren't in the previous poll get a brief highlight so a
// genuinely new event is visible, without replaying that animation on
// every 30s poll for rows that were already there.
function LiveActivityFeed({ onViewAll, students, bankers, onOpenStudent }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState(() => new Set());
  const [, setClock] = useState(0);
  const [openEntry, setOpenEntry] = useState(null);
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
    <section className="ov-card ov-activity" aria-label="Recent activity">
      <header className="ov-card-head">
        <span className="ov-live" aria-hidden="true" />
        <div className="ov-card-heading">
          <p className="ov-card-title">Recent activity</p>
          <p className="ov-card-sub">Live from the audit log</p>
        </div>
        <button type="button" className="ov-link" onClick={onViewAll}>
          View all <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </header>

      <div className="ov-activity-list">
        {loading ? (
          <div className="ov-activity-state"><div className="loading-dots"><span /><span /><span /></div></div>
        ) : entries.length === 0 ? (
          <p className="ov-activity-state">No recent activity yet.</p>
        ) : (
          <ol>
            {entries.map((e) => {
              const prefix = e.action.split(".")[0];
              const Icon = BANK_ACTIVITY_ACTION_ICON[prefix] || History;
              const tone = AUDIT_ACTION_TONE[prefix] || "slate";
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`ov-activity-row tone-${tone}${newIds.has(e.id) ? " is-new" : ""}`}
                    onClick={() => setOpenEntry(e)}
                  >
                    <span className="ov-activity-icon" aria-hidden="true"><Icon size={14} /></span>
                    <span className="ov-activity-body">
                      <span className="ov-activity-action">{bankActivityActionLabel(e.action)}</span>
                      <span className="ov-activity-actor">{e.actor}</span>
                    </span>
                    <time className="ov-activity-time" dateTime={e.ts}>{timeAgo(e.ts)}</time>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {openEntry && (
        <ActivityDetail
          entry={openEntry}
          entries={entries}
          students={students}
          bankers={bankers}
          onClose={() => setOpenEntry(null)}
          onOpenStudent={onOpenStudent}
        />
      )}
    </section>
  );
}

function AuditLogSection({ students, bankers, onOpenStudent }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logErr, setLogErr] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [openEntry, setOpenEntry] = useState(null);

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
            {actionOptions.map((a) => <option key={a} value={a}>{bankActivityActionLabel(a)}</option>)}
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
            <button type="button" className="audit-row audit-row--button" key={e.id} onClick={() => setOpenEntry(e)}>
              <span className="audit-action">
                <span className={`audit-dot audit-dot--${e.action.split(".")[0]}`} />
                {bankActivityActionLabel(e.action)}
              </span>
              <span className="audit-actor">
                {e.actor}
                {e.role && <span className="audit-role-pill">{e.role}</span>}
              </span>
              <span className="audit-target" title={e.target}>{e.target ? displayName(e.target) : "—"}</span>
              <span className="audit-time">
                {new Date(e.ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </button>
          ))}
        </div>
      )}
      {openEntry && (
        <ActivityDetail
          entry={openEntry}
          entries={entries}
          students={students}
          bankers={bankers}
          onClose={() => setOpenEntry(null)}
          onOpenStudent={onOpenStudent}
        />
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
  "document.rejected": "Upload rejected by the check",
  "document.view": "Opened a document",
  "document.download": "Downloaded a document",
  "document.download_all": "Downloaded all documents",
  "document.download_bundle": "Downloaded a document bundle",
  "document.extract": "Read a document automatically",
  "document_reader.extract": "Used the Document Reader",
  "student.save": "Saved application details",
  "auth.login_failed": "Failed sign-in attempt",
  "admin.update": "Updated an account",
  "admin.change_own_email": "Changed own email",
  "company.create": "Created a company",
  "company.update": "Updated company details",
  "company.suspend": "Suspended a company",
  "company.reactivate": "Reactivated a company",
  "company.logo_update": "Updated the company logo",
  "company.logo_remove": "Removed the company logo",
  "summary.generate": "Generated application form",
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

function BankActivityReportSection({ students, bankers, onOpenStudent }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedBank, setSelectedBank] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [openEntry, setOpenEntry] = useState(null);

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
              <button type="button" key={e.id} className={`bar-row bar-row--button tone-${tone}`} onClick={() => setOpenEntry(e)}>
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
                        {displayName(e.studentName)}
                      </>
                    )}
                    <span className="bar-row-dot">·</span>
                    {new Date(e.ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <ChevronRight size={16} className="bar-row-chevron" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
      {openEntry && (
        <ActivityDetail
          entry={openEntry}
          entries={entries}
          students={students}
          bankers={bankers}
          label={bankActivityActionLabel}
          onClose={() => setOpenEntry(null)}
          onOpenStudent={onOpenStudent}
        />
      )}
    </div>
  );
}

export default function Admin() {
  const { isAdmin, adminRole, adminAdvisorName, adminName, adminAccount, updateAdminAccount, logoutAdmin, clearStudent } = useStudent();
  // Keeps role, company and logo current for sessions started before a change.
  const refreshAccount = useCallback(async () => {
    const r = await callAPI("GET", "/api/auth/me");
    if (r.success && r.account) updateAdminAccount(r.account);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void refreshAccount(); }, [refreshAccount]);
  const adminId = adminAccount?.id || "";
  // "Add student" opens the student registration form. A partner company's
  // team registers on its own company link, so the student lands in that
  // company, not in Flyurdream.
  const openRegistration = () => {
    const co = adminAccount?.company;
    const base = co?.kind === "partner" && co.slug ? `/c/${encodeURIComponent(co.slug)}` : "/";
    navigate(`${base}?apply=new`);
  };
  const navigate = useNavigate();

  const [section, setSection] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const [companyFilter, setCompanyFilter] = useState("all");
  // Superadmin: every company with its team counts (dashboard + filters)
  const [companies, setCompanies] = useState([]);
  // Students a profile opened from the dashboard can step through; null =
  // the Students table's current (filtered) list.
  const [profileList, setProfileList] = useState(null);
  const [bankers, setBankers] = useState([]);
  const [allAdvisors, setAllAdvisors] = useState([]);
  // Superadmin: count of ALL requests awaiting their review. Advisor: count
  // of their OWN still-pending requests — the backend scopes the response by
  // role, this just reads its length either way.
  const [pendingBankerRequests, setPendingBankerRequests] = useState(0);
  // Which sub-panel the Banks & Lenders page opens on. Lifted out of
  // BankerAccessSection so the dashboard notification can jump straight to
  // "requests" instead of the default access-management view.
  const [bankPanel, setBankPanel] = useState("access");
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
  const [letterStudent, setLetterStudent] = useState(null);
  // "all" | "missing": sanctioned files whose letter isn't in yet
  const [letterFilter, setLetterFilter] = useState("all");
  const [recoverStudent, setRecoverStudent] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!isAdmin) navigate("/admin-login");
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (adminRole !== "superadmin") return;
    callAPI("GET", "/api/companies").then((r) => { if (r.success) setCompanies(r.companies || []); });
  }, [adminRole]);

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

  const loadPendingBankerRequests = useCallback(async () => {
    try {
      const r = await callAPI("GET", "/api/students/banker-access-requests?status=pending");
      if (r.success) setPendingBankerRequests((r.requests || []).length);
    } catch { /* silent — sidebar badge just won't show a count */ }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudents();
    void loadBankers();
    void loadAdvisors();
    void loadPendingBankerRequests();
    // Light polling so the sidebar badge reflects requests decided (or filed)
    // from another admin's session too, same cadence as LiveActivityFeed.
    const id = setInterval(loadPendingBankerRequests, 30000);
    return () => clearInterval(id);
  }, [isAdmin, loadStudents, loadBankers, loadAdvisors, loadPendingBankerRequests]);

  // Deletes by the actual student object (not by name — display names are
  // not unique, e.g. two students can share a name, or a corrupted meta
  // record falls back to showing its raw folder-key name). Matching by name
  // could delete/hide the wrong row when two students collide on it.
  const handleDelete = async (student) => {
    setDeleting(true);
    try {
      const identifier = student.email || student.phone || "";
      await deleteStudent(student.name, identifier, student.driveUrl || "", student.storage === "railway" ? student.studentKey : "");
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

  const handleLoanStatusChange = (name, loanStatus, loanRemark, loanDisbursement, sanctionLetter) => {
    setStudents((prev) =>
      prev.map((s) =>
        s.name === name
          ? { ...s, loanStatus, loanRemark, ...(loanDisbursement ? { loanDisbursement } : {}), ...(sanctionLetter ? { sanctionLetter } : {}) }
          : s,
      ),
    );
  };
  const handleLetterUploaded = (name, sanctionLetter) => {
    setStudents((prev) => prev.map((s) => (s.name === name ? { ...s, sanctionLetter } : s)));
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

  // A full page load to the home page: it gets past this route's guard
  // (which would otherwise bounce to the sign-in page) and drops every
  // piece of student data still held in memory.
  const handleLogout = () => {
    clearStudent();
    logoutAdmin();
    window.location.replace("/");
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
    avgProgress: scopedStudents.length
      ? Math.round(scopedStudents.reduce((sum, s) => sum + getOverallProgress(s), 0) / scopedStudents.length)
      : 0,
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
      (s.phone || "").includes(q) ||
      getApplicationId(s).toLowerCase().includes(q);
    const p = getOverallProgress(s);
    const matchesFilter =
      filter === "all" ||
      (filter === "complete" && p === 100) ||
      (filter === "progress" && p > 0 && p < 100) ||
      (filter === "notStarted" && p === 0) ||
      (filter === "incomplete" && p < 100);
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
    const matchesCompany = companyFilter === "all" || s.company?.id === companyFilter;
    const matchesLetter = letterFilter === "all" || needsSanctionLetter(s);
    return matchesSearch && matchesFilter && matchesLoanStatus && matchesConsultancy && matchesCompany && matchesLetter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Any filter/search change can shrink the result set below the current
  // page — snap back to page 1 rather than showing an empty page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search, filter, loanStatusFilter, consultancyFilter, advisorFilter, bankerFilter, letterFilter]);

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
        await deleteStudent(s.name, identifier, s.driveUrl || "", s.storage === "railway" ? s.studentKey : "").catch((e) => {
          console.error(`Bulk delete failed for ${s.name}:`, e.message);
        });
      }
      setSelectedKeys(new Set());
      await loadStudents();
    } finally {
      setBulkBusy(false);
    }
  };

  // One-time zip link per student, started one after another — browsers
  // drop several downloads fired in the same instant.
  const handleBulkDownload = async () => {
    for (const s of selectedStudents) {
      const identifier = s.email || s.phone || "";
      try {
        await downloadAllFiles(s.name, identifier);
      } catch (e) {
        console.error(`Download failed for ${s.name}:`, e.message);
      }
      await new Promise((r) => setTimeout(r, 700));
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

  const isAdvisor = adminRole === "advisor";
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const SECTION_META = {
    dashboard: {
      title: `${greeting()}, ${(adminName || "").split(/\s+/)[0] || "there"}`,
      // A line about the book itself; the date sits in the chip above
      sub: loading && students.length === 0
        ? "Loading your students…"
        : stats.total
          ? `${stats.total} student file${stats.total === 1 ? "" : "s"}, ${stats.newThisWeek} new this week. Here’s where every application stands.`
          : "No students yet. Add your first student and their file starts here.",
    },
    students: {
      title: isAdvisor ? "My Students" : "Students",
      sub: isAdvisor ? "Search, filter and manage the students assigned to you." : "Search, filter, and manage every student file.",
    },
    advisors: { title: "Advisors", sub: "Workload and progress by advisor" },
    banks:    { title: "Banks & Lenders", sub: "Manage loan officers and control which students each one can see" },
    team: { title: "Team", sub: "Who can sign in, their role and their company" },
    companies: adminRole === "superadmin"
      ? { title: "Companies", sub: "Partner companies, their teams and signup links" }
      : { title: "Company", sub: "Your company’s details, logo and signup link" },
    documents: { title: "Document Management", sub: "Every student document, sorted into folders by type" },
    docReader: { title: "Document Reader", sub: "Extract structured data from a 10th or 12th certificate, passport, Aadhaar or PAN card in seconds" },
    converter: { title: "File Converter", sub: "Convert, compress, crop, trim and merge files right here. Nothing is uploaded." },
    audit:    { title: "Audit Log", sub: "Who did what, and when" },
    bankActivity: { title: "Bank Activity", sub: "Student, advisor, and banker actions, grouped by lender" },
  };
  const activeMeta = SECTION_META[section] || SECTION_META.dashboard;
  const showStudents = section === "students";
  const showAdvisorCol = !isAdvisor;

  // Quick-filter pills: each is a preset over the existing document-progress
  // and loan-status filters, so the full Filter panel stays in sync.
  const pendingDocs = stats.inProgress + stats.notStarted;
  const lettersMissing = scopedStudents.filter(needsSanctionLetter).length;
  const QUICK_TABS = [
    { id: "all", label: "All Students", count: stats.total, doc: "all", loan: "all" },
    { id: "pendingDocs", label: "Pending Docs", count: pendingDocs, doc: "incomplete", loan: "all" },
    { id: "inprocess", label: "In Process", count: loanStats.inprocess, doc: "all", loan: "inprocess" },
    { id: "sanctioned", label: "Sanctioned", count: loanStats.sanctioned, doc: "all", loan: "sanctioned" },
    // Only while there's something to chase
    ...(lettersMissing || letterFilter === "missing"
      ? [{ id: "letters", label: "Letter missing", count: lettersMissing, doc: "all", loan: "all", letters: "missing", warn: true }]
      : []),
  ];
  const activeQuickTab = QUICK_TABS.find((t) => t.doc === filter && t.loan === loanStatusFilter && (t.letters || "all") === letterFilter)?.id || null;
  const activeFilterCount =
    [filter !== "all", loanStatusFilter !== "all", !!consultancyFilter, advisorFilter !== "all", bankerFilter !== "all", companyFilter !== "all", letterFilter !== "all"].filter(Boolean).length
    - (activeQuickTab && activeQuickTab !== "all" ? 1 : 0);
  const clearAllFilters = () => {
    setFilter("all");
    setLoanStatusFilter("all");
    setConsultancyFilter("");
    setAdvisorFilter("all");
    setBankerFilter("all");
    setCompanyFilter("all");
    setLetterFilter("all");
  };

  // Dashboard → the Students page with exactly this slice showing.
  const openStudents = ({ doc = "all", loan = "all", company = "all", advisor = "all", letters = "all", query = "" } = {}) => {
    clearAllFilters();
    setFilter(doc);
    setLoanStatusFilter(loan);
    setLetterFilter(letters);
    setCompanyFilter(company);
    if (adminRole !== "advisor") setAdvisorFilter(advisor);
    setSearch(query);
    setPage(1);
    setSection("students");
    window.scrollTo({ top: 0 });
  };

  // Open a student's profile over whatever page is showing; `list` is what
  // its previous / next buttons step through.
  const openProfile = (s, list = [s]) => {
    setProfileList(list.map(studentKey));
    setExpandedKey(studentKey(s));
  };

  // From an activity entry: back to the dashboard with just this student
  // listed and their details expanded.
  const openStudentFile = (s) => openProfile(s);


  const headerMenuItems = [
    ...(rootUrl ? [{ label: "Open root Drive", icon: FolderOpen, onSelect: () => window.open(rootUrl, "_blank", "noreferrer") }] : []),
    { label: "Banker access", icon: Send, onSelect: () => setSection("banks") },
    { label: "Settings", icon: Settings, onSelect: () => setShowSettings(true) },
  ];

  // Refresh, more and add student, beside the dashboard and Students titles
  const headerActions = (
    <div className="adm-header-actions">
      <button
        type="button"
        className="adm-icon-btn adm-icon-btn--outline"
        onClick={loadStudents}
        disabled={loading}
        aria-label="Refresh students"
        title="Refresh students"
      >
        <RefreshCw size={18} className={loading ? "spin" : ""} />
      </button>
      <ActionsMenu
        label="More actions"
        items={headerMenuItems}
        icon={MoreHorizontal}
        className="adm-icon-btn adm-icon-btn--outline"
      />
      <button type="button" className="adm-add-btn" onClick={openRegistration}>
        <span className="adm-add-btn__icon" aria-hidden="true"><Plus size={15} strokeWidth={2.6} /></span>
        <span>Add student</span>
      </button>
    </div>
  );

  return (
    <div className="admin-shell theme-orbit orbit-backdrop">
      {/* Shift + drop a file anywhere here opens the File Converter */}
      <ConverterProvider>
      <AdminSidebar
        section={section}
        setSection={setSection}
        adminRole={adminRole}
        adminName={adminName}
        onOpenSettings={() => setShowSettings(true)}
        onLogout={handleLogout}
        mobileOpen={mobileNavOpen}
        onCloseMobile={closeMobileNav}
        setLoanStatusFilter={setLoanStatusFilter}
        pendingBankerRequests={pendingBankerRequests}
      />

    <div className="admin-page admin-page--shell">
      <AdminMobileBar onOpenMenu={() => setMobileNavOpen(true)} menuOpen={mobileNavOpen} />

      <main className="admin-container">
        <div className="adm-header">
          <div className="adm-header-text">
            {section === "dashboard" && (
              <p className="adm-chip">
                <span className="adm-chip__icon" aria-hidden="true"><CalendarDays size={14} /></span>
                {todayLabel}
              </p>
            )}
            <h1 className="adm-title">{activeMeta.title}</h1>
            <p className="adm-sub">{activeMeta.sub}</p>
          </div>
          {(showStudents || section === "dashboard") && headerActions}
        </div>

        {section === "dashboard" && (
          <>
            <BankerRequestsNotice
              count={pendingBankerRequests}
              adminRole={adminRole}
              onOpen={() => { setSection("banks"); setBankPanel("requests"); }}
            />
            <DashboardHome
              students={scopedStudents}
              loading={loading && students.length === 0}
              adminRole={adminRole}
              companies={companies}
              bankers={bankers}
              stats={stats}
              loanStats={loanStats}
              onOpenStudents={openStudents}
              onOpenProfile={openProfile}
              onOpenCompanies={() => setSection("companies")}
              onOpenAudit={() => setSection("audit")}
              onOpenStudentFile={openStudentFile}
            />
          </>
        )}

        {section === "advisors" && isAdminLevel(adminRole) && (
          <AdvisorsSection students={students} allAdvisors={allAdvisors} onOpenAdvisor={(advisor) => openStudents({ advisor })} />
        )}

        {section === "audit" && isAdminLevel(adminRole) && (
          <AuditLogSection students={students} bankers={bankers} onOpenStudent={openStudentFile} />
        )}

        {section === "bankActivity" && isAdminLevel(adminRole) && (
          <BankActivityReportSection students={students} bankers={bankers} onOpenStudent={openStudentFile} />
        )}

        {section === "banks" && (
          <BankerAccessSection
            students={scopedStudents}
            onAccessChanged={handleAccessChanged}
            onBankersChanged={loadBankers}
            adminRole={adminRole}
            adminName={adminName}
            onRequestsChanged={loadPendingBankerRequests}
            panel={bankPanel}
            setPanel={setBankPanel}
          />
        )}

        {section === "docReader" && <DocumentReader />}

        {section === "converter" && <ConverterSection />}

        {section === "documents" && isAdminLevel(adminRole) && <DocumentLibrary students={students} />}

        {section === "team" && isAdminLevel(adminRole) && (
          <TeamSection adminRole={adminRole} adminId={adminId} onTeamChanged={() => { loadBankers(); }} />
        )}

        {section === "companies" && isAdminLevel(adminRole) && (
          <CompaniesSection students={students} adminRole={adminRole} onChanged={refreshAccount} />
        )}

        {showStudents && (
        <section className="adm-students" aria-label="Students">
          <div className="adm-tabs" role="group" aria-label="Quick filters">
            {QUICK_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`adm-tab${activeQuickTab === t.id ? " is-active" : ""}${t.warn ? " is-warn" : ""}`}
                aria-pressed={activeQuickTab === t.id}
                onClick={() => { setFilter(t.doc); setLoanStatusFilter(t.loan); setLetterFilter(t.letters || "all"); }}
              >
                {t.label} <span className="adm-tab-count">({t.count})</span>
              </button>
            ))}
          </div>

          <div className="adm-toolbar">
            <label className="adm-search">
              <span className="sr-only">Search students</span>
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search name, email, phone, app ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="adm-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="adm-toolbar-btns">
              <button
                type="button"
                className={`adm-btn adm-btn--outline${filtersOpen ? " is-pressed" : ""}`}
                aria-expanded={filtersOpen}
                aria-controls="adm-filter-panel"
                onClick={() => setFiltersOpen((o) => !o)}
              >
                <Filter size={17} />
                <span>Filter</span>
                {activeFilterCount > 0 && <span className="adm-btn-badge" aria-label={`${activeFilterCount} active`}>{activeFilterCount}</span>}
                <ChevronDown size={15} className={`adm-btn-chevron${filtersOpen ? " is-open" : ""}`} />
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--outline"
                onClick={handleExportCsv}
                disabled={filtered.length === 0}
                title="Download the students currently shown as a CSV file"
              >
                <Upload size={17} />
                <span>Export</span>
              </button>
            </div>
          </div>

          {filtersOpen && (
            <div className="adm-filter-panel" id="adm-filter-panel">
              <label className="adm-field">
                <span>Document progress</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="complete">Completed</option>
                  <option value="progress">In progress</option>
                  <option value="notStarted">Not started</option>
                  <option value="incomplete">Pending (not complete)</option>
                </select>
              </label>
              <label className="adm-field">
                <span>Loan status</span>
                <select value={loanStatusFilter} onChange={(e) => setLoanStatusFilter(e.target.value)}>
                  <option value="all">All loan status</option>
                  <option value="pending">Pending</option>
                  <option value="inprocess">In Process</option>
                  <option value="sanctioned">Sanctioned</option>
                  <option value="disbursed">Disbursed</option>
                  <option value="rejected">Rejected</option>
                  <option value="dropped">Dropped</option>
                </select>
              </label>
              {adminRole === "superadmin" && companies.length > 1 && (
                <label className="adm-field">
                  <span>Company</span>
                  <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
                    <option value="all">All companies</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
              <label className="adm-field">
                <span>Consultancy</span>
                <select value={consultancyFilter} onChange={(e) => setConsultancyFilter(e.target.value)}>
                  <option value="">All consultancies</option>
                  {consultancyList.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__none__">No consultancy set</option>
                </select>
              </label>
              {!isAdvisor && advisorList.length > 0 && (
                <label className="adm-field">
                  <span>Advisor</span>
                  <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)}>
                    <option value="all">All advisors</option>
                    {advisorList.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </label>
              )}
              {bankers.length > 0 && (
                <label className="adm-field">
                  <span>Shared with banker</span>
                  <select value={bankerFilter} onChange={(e) => setBankerFilter(e.target.value)}>
                    <option value="all">All bankers</option>
                    {bankers.map((b) => (
                      <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="adm-btn adm-btn--ghost adm-filter-reset" onClick={clearAllFilters}>
                Reset filters
              </button>
            </div>
          )}

          {error && (
            <div className="admin-error animate-fade-in" role="alert">
              <AlertCircle size={15} />
              {error}
              <button className="close-err" onClick={() => setError("")} aria-label="Dismiss error"><X size={13} /></button>
            </div>
          )}

          {selectedKeys.size > 0 && (
            <div className="bulk-toolbar animate-fade-in">
              <span className="bulk-toolbar-count">Selected: {selectedKeys.size}</span>
              <div className="bulk-toolbar-actions">
                <button className="btn btn-secondary btn-sm" onClick={handleBulkDownload} disabled={bulkBusy}>
                  <Download size={13} /> <span className="btn-label">Download</span>
                </button>
                {isAdminLevel(adminRole) && (
                  <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} disabled={bulkBusy}>
                    <Trash2 size={13} /> <span className="btn-label">{bulkBusy ? "Working…" : "Delete"}</span>
                  </button>
                )}
              </div>
              <button className="bulk-toolbar-clear" onClick={() => setSelectedKeys(new Set())} aria-label="Clear selection">
                <X size={14} />
              </button>
            </div>
          )}

          {letterFilter === "missing" && (
            <div className="adm-scope-chip adm-scope-chip--warn animate-fade-in">
              <FileCheck2 size={14} aria-hidden="true" />
              <span>Sanctioned files <strong>without a sanction letter</strong></span>
              <button type="button" onClick={() => { setLetterFilter("all"); setPage(1); }} aria-label="Show every student">
                <X size={13} />
              </button>
            </div>
          )}

          {/* Opened from an advisor's card: say whose students these are */}
          {adminRole !== "advisor" && advisorFilter !== "all" && (
            <div className="adm-scope-chip animate-fade-in">
              <UserCheck size={14} aria-hidden="true" />
              <span>Showing <strong>{advisorFilter}</strong>'s students</span>
              <button type="button" onClick={() => { setAdvisorFilter("all"); setPage(1); }} aria-label="Show every advisor's students">
                <X size={13} />
              </button>
            </div>
          )}

          <div className="adm-table">
            <div className="adm-table-scroll">
              <div className={`adm-thead${showAdvisorCol ? " adm-row--advisor" : ""}`}>
                <div className="adm-th adm-th--check">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all students on this page" />
                  <span className="adm-th-mobile">Select all on this page</span>
                </div>
                <div className="adm-th">Student Name</div>
                <div className="adm-th">Application ID</div>
                <div className="adm-th">Destination</div>
                {showAdvisorCol && <div className="adm-th adm-th--advisor">Advisor</div>}
                <div className="adm-th">Document Status</div>
                <div className="adm-th">Loan Status</div>
                <div className="adm-th">Updated On</div>
                <div className="adm-th adm-th--actions">Actions</div>
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
                    {search || filter !== "all" || consultancyFilter || loanStatusFilter !== "all"
                      ? "No students match"
                      : isAdvisor
                        ? "No students assigned yet"
                        : "No students yet"}
                  </h3>
                  <p>
                    {consultancyFilter === "__none__"
                      ? "Every student has a consultancy set."
                      : consultancyFilter
                        ? `No students found for consultancy "${consultancyFilter}".`
                        : search || filter !== "all" || loanStatusFilter !== "all"
                          ? "Try adjusting your search or filter."
                          : isAdvisor
                            ? `No students have selected ${adminAdvisorName} as their advisor yet.`
                            : "Add a student to get started."}
                  </p>
                  {(search || filter !== "all" || consultancyFilter || loanStatusFilter !== "all") && (
                    <button
                      className="adm-btn adm-btn--outline"
                      onClick={() => { setSearch(""); clearAllFilters(); }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="adm-tbody">
                  {paginated.map((s) => {
                    const k = studentKey(s);
                    return (
                      <StudentRow
                        key={k}
                        student={s}
                        isOpen={expandedKey === k}
                        onToggle={() => { setProfileList(null); setExpandedKey((cur) => (cur === k ? null : k)); }}
                        selected={selectedKeys.has(k)}
                        onToggleSelect={() => toggleSelectOne(k)}
                        onDelete={(e) => { if (e) e.stopPropagation(); setConfirmDelete(s); }}
                        onOpenDrive={(e) => { if (e) e.stopPropagation(); openDriveFolder(s); }}
                        onViewReport={(e) => { if (e) e.stopPropagation(); setReportStudent(s); }}
                        onSendToBank={(e) => { if (e) e.stopPropagation(); setBankStudent(s); }}
                        onLoanStatusUpdate={(e) => { if (e) e.stopPropagation(); setLoanStatusStudent(s); }}
                        onUploadLetter={() => setLetterStudent(s)}
                        onRecoverMeta={(e) => { if (e) e.stopPropagation(); setRecoverStudent(s); }}
                        isDuplicate={isDuplicateStudent(s)}
                        showAdvisor={showAdvisorCol}
                        canManage={isAdminLevel(adminRole)}
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
                      <span key={n} className="pg-num-wrap">
                        {i > 0 && arr[i - 1] !== n - 1 && <span className="pg-ellipsis">…</span>}
                        <button
                          className={`pg-btn pg-num${n === safePage ? " active" : ""}`}
                          aria-label={`Page ${n}`}
                          aria-current={n === safePage ? "page" : undefined}
                          onClick={() => setPage(n)}
                        >
                          {n}
                        </button>
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
        </section>
        )}

      </main>
    </div>

      {/* Student profile — the selected row, with previous / next through the current list */}
      {(() => {
        const list = profileList
          ? profileList.map((k) => scopedStudents.find((x) => studentKey(x) === k)).filter(Boolean)
          : filtered;
        const index = list.findIndex((x) => studentKey(x) === expandedKey);
        if (index < 0) return null;
        const s = list[index];
        const go = (i) => () => setExpandedKey(studentKey(list[i]));
        return (
          <StudentProfile
            key={studentKey(s)}
            student={s}
            position={{ index, total: list.length }}
            onPrev={index > 0 ? go(index - 1) : null}
            onNext={index < list.length - 1 ? go(index + 1) : null}
            onClose={() => { setExpandedKey(null); setProfileList(null); }}
            adminRole={adminRole}
            bankers={bankers}
            isDuplicate={isDuplicateStudent(s)}
            canManage={isAdminLevel(adminRole)}
            onLoanStatus={() => setLoanStatusStudent(s)}
            onUploadLetter={() => setLetterStudent(s)}
            onEligibility={() => setReportStudent(s)}
            onShare={() => setBankStudent(s)}
            onOpenDrive={() => openDriveFolder(s)}
            onRecover={() => setRecoverStudent(s)}
            onDelete={() => setConfirmDelete(s)}
            canEditAdvisor={isAdminLevel(adminRole)}
            onAdvisorSave={(value) => handleAdvisorSave(s, value)}
            advisorOptions={allAdvisors}
            canEditConsultancy={adminRole === "advisor" || isAdminLevel(adminRole)}
            onConsultancySave={(value) => handleConsultancySave(s, value)}
            consultancySuggestions={consultancyList}
          />
        );
      })()}

      {/* Loan Status Modal */}
      {loanStatusStudent && (
        <LoanStatusModal
          student={loanStatusStudent}
          onClose={() => setLoanStatusStudent(null)}
          onUpdated={handleLoanStatusChange}
        />
      )}

      {letterStudent && (
        <SanctionLetterModal
          student={letterStudent}
          onClose={() => setLetterStudent(null)}
          onUploaded={handleLetterUploaded}
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
          adminRole={adminRole}
          onRequestSubmitted={loadPendingBankerRequests}
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

      </ConverterProvider>
    </div>
  );
}
