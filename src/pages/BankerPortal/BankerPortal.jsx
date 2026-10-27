import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import {
  Search, RefreshCw, AlertCircle, FileText, Eye, Download, Building2, FolderOpen, X,
  GraduationCap, Banknote, FolderInput, KeyRound, EyeOff, CheckCircle, Upload, Archive,
  UsersRound, LogOut, Menu, Hourglass, ShieldCheck, TriangleAlert, Info, Mail, Phone,
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { getAllStudentsFromDrive, getStudentFiles, changeOwnPassword, updateLoanStatus, uploadSanctionLetter, downloadFile, downloadAllFiles } from "../../utils/driveApi";
import { DOCUMENT_SCHEMA, getTotalRequiredFields, coApplicantFields, countUploadedFields } from "../../context/schemas";
import DocumentViewer from "../../components/DocumentViewer/DocumentViewer";
import BrandLogo from "../../components/BrandLogo/BrandLogo";
import CountUp from "../../components/CountUp/CountUp";
import { getBankLogo } from "../../utils/bankOptions";
import { getApplicationId } from "../../utils/applicationId";
import "./BankerPortal.css";

const LOAN_STATUS_CONFIG = {
  pending:    { label: "Pending" },
  inprocess:  { label: "In Process" },
  sanctioned: { label: "Sanctioned" },
  disbursed:  { label: "Disbursed" },
  rejected:   { label: "Rejected" },
  dropped:    { label: "Dropped" },
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
  { key: "loanAmount",      label: "Loan Amount",     unit: "₹",      placeholder: "e.g. 1200000" },
  { key: "tenureMonths",    label: "Tenure",           unit: "months", placeholder: "e.g. 84" },
  { key: "interestRate",    label: "Interest Rate",    unit: "%",      placeholder: "e.g. 10.5" },
  { key: "processingFee",   label: "Processing Fee",   unit: "₹",      placeholder: "e.g. 15000" },
  { key: "insuranceAmount", label: "Insurance Amount",  unit: "₹",      placeholder: "e.g. 8000" },
];
const EMPTY_DISBURSEMENT = { loanAmount: "", tenureMonths: "", interestRate: "", processingFee: "", insuranceAmount: "" };

const loanKey = (status) => (LOAN_STATUS_CONFIG[status] ? status : "pending");

function LoanChip({ status }) {
  const key = loanKey(status);
  return <span className={`bk-chip bk-chip--${key}`}>{LOAN_STATUS_CONFIG[key].label}</span>;
}

// A sanctioned or disbursed loan whose sanction letter isn't in the file yet
const needsSanctionLetter = (s) => ["sanctioned", "disbursed"].includes(s.loanStatus) && !s.sanctionLetter;

function LetterFlag({ student }) {
  if (needsSanctionLetter(student)) {
    return <span className="bk-letter bk-letter--missing" title="Upload the sanction letter from Update status">Letter missing</span>;
  }
  if (student.sanctionLetter && ["sanctioned", "disbursed"].includes(student.loanStatus)) {
    return <span className="bk-letter bk-letter--ok" title={student.sanctionLetter.name}>Letter in file</span>;
  }
  return null;
}

function DocChip({ docs }) {
  return docs.complete ? (
    <span className="bk-chip bk-chip--complete" title={`All ${docs.total} required documents uploaded`}>Complete</span>
  ) : (
    <span className="bk-chip bk-chip--missing" title={`${docs.total - docs.done} of ${docs.total} required documents missing`}>
      Missing Docs
    </span>
  );
}

const GROUP_ICONS = {
  "GOVT ID": Building2,
  "Academics": GraduationCap,
  "Other_Documents": FolderInput,
  "Others": FileText,
};
function groupIconFor(group) {
  if (GROUP_ICONS[group]) return GROUP_ICONS[group];
  if (group.startsWith("Loan")) return Banknote;
  return FolderOpen;
}

function formatBytes(size) {
  const n = parseInt(size, 10);
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const PREVIEWABLE = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);

// Folder names carry a "__<email/phone>" suffix; show only the person.
function displayName(s) {
  const p = s.personalInfo || {};
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || p.fullName || (s.name || "").split("__")[0] || "Unnamed student";
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const AVATAR_TONES = ["blue", "teal", "amber", "violet", "rose"];
const avatarTone = (name) => AVATAR_TONES[(name || "?").charCodeAt(0) % AVATAR_TONES.length];

// Required documents uploaded vs required — counted per document (a
// two-page Aadhaar is one), using the same checklist as the student portal.
function getDocStatus(s) {
  const uploads = s.uploads || {};
  const p = s.personalInfo || {};
  const coCount = s.coApplicants || 1;
  const required = (fields) => fields.filter((f) => !f.optional);
  let done =
    countUploadedFields(uploads.applicant, required(DOCUMENT_SCHEMA.applicant.fields)) +
    countUploadedFields(uploads.academics, required(DOCUMENT_SCHEMA.academics.fields));
  for (let i = 0; i < coCount; i++) {
    done += countUploadedFields(uploads[`co_${i}`], required(coApplicantFields(p[`co_info_${i}`])));
  }
  const total = getTotalRequiredFields(coCount, p);
  return { done: Math.min(done, total), total, complete: done >= total };
}

const studentIdentifier = (s) => s.email || s.phone || "";

const MOBILE_QUERY = "(max-width: 1023px)";
const subscribeMobile = (cb) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsMobile = () => useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches);

// Moves focus into a panel when it opens and back to whatever opened it
// when it closes.
function useFocusOnOpen(ref) {
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.focus();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, [ref]);
}

function StudentDrawer({
  student, groups, groupsLoading, groupsError, downloadingAll,
  onClose, onUpdateLoan, onView, onDownloadFile, onDownloadAll,
}) {
  const closeRef = useRef(null);
  useFocusOnOpen(closeRef);

  const p = student.personalInfo || {};
  const name = displayName(student);
  const appId = getApplicationId(student);
  const docs = getDocStatus(student);
  const fileCount = Object.values(groups).flat().length;
  const folderCount = Object.keys(groups).length;
  const details = [
    ["Application ID", appId || "—"],
    ["Course", p.courseNameUniversity || "—"],
    ["Destination", p.destinationCountry || "—"],
    ["Loan Amount", p.loanAmount ? `₹${Number(p.loanAmount).toLocaleString("en-IN")}` : "—"],
  ];

  return (
    <div className="bk-drawer-backdrop" onClick={onClose}>
      <aside
        className="bk-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bk-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bk-drawer-head">
          <span className={`bk-avatar bk-avatar--lg bk-avatar--${avatarTone(name)}`} aria-hidden="true">{initials(name)}</span>
          <div className="bk-drawer-heading">
            <h2 id="bk-drawer-title" className="bk-drawer-title">{name}</h2>
            <p className="bk-drawer-contact">
              {student.email && <span><Mail size={13} aria-hidden="true" /> {student.email}</span>}
              {student.phone && <span><Phone size={13} aria-hidden="true" /> {student.phone}</span>}
              {!student.email && !student.phone && <span>No contact info</span>}
            </p>
          </div>
          <button type="button" ref={closeRef} className="bk-icon-btn" onClick={onClose} aria-label="Close student details">
            <X size={20} />
          </button>
        </header>

        <div className="bk-drawer-body">
          <dl className="bk-facts">
            {details.map(([label, value]) => (
              <div key={label} className="bk-fact">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <section className="bk-loan-card" aria-labelledby="bk-loan-title">
            <div className="bk-loan-main">
              <span className="bk-loan-icon" aria-hidden="true"><Banknote size={18} /></span>
              <div className="bk-loan-text">
                <h3 id="bk-loan-title" className="bk-loan-title">Loan Status</h3>
                <LoanChip status={student.loanStatus} />
                <LetterFlag student={student} />
              </div>
              <button type="button" className="btn btn-primary btn-sm bk-loan-update" onClick={() => onUpdateLoan(student)}>
                Update
              </button>
            </div>
            {REMARK_STATUSES.includes(student.loanStatus) && student.loanRemark && (
              <p className="bk-loan-remark">“{student.loanRemark}”</p>
            )}
          </section>

          <section className="bk-docs" aria-labelledby="bk-docs-title">
            <div className="bk-docs-head">
              <h3 id="bk-docs-title" className="bk-section-title">Documents</h3>
              <span className="bk-docs-progress">
                <DocChip docs={docs} />
                <span>{docs.done} of {docs.total} required</span>
              </span>
            </div>

            {groupsLoading ? (
              <div className="bk-state" role="status">
                <RefreshCw size={20} className="bk-spin" /> Loading documents…
              </div>
            ) : groupsError ? (
              <div className="bk-alert" role="alert"><AlertCircle size={16} /> {groupsError}</div>
            ) : folderCount === 0 ? (
              <p className="bk-state">No documents found for this student.</p>
            ) : (
              Object.entries(groups).map(([group, files]) => {
                const GroupIcon = groupIconFor(group);
                const label = group.replace(/_/g, " ");
                return (
                  <div key={group} className="bk-group">
                    <h4 className="bk-group-title">
                      <GroupIcon size={15} aria-hidden="true" /> {label}
                      <span className="bk-group-count">{files.length}</span>
                    </h4>
                    <ul className="bk-files">
                      {files.map((f) => (
                        <li key={f.id} className="bk-file">
                          <span className="bk-file-icon" aria-hidden="true"><FileText size={16} /></span>
                          <span className="bk-file-meta">
                            <span className="bk-file-name" title={f.name}>{f.name}</span>
                            {formatBytes(f.size) && <span className="bk-file-size">{formatBytes(f.size)}</span>}
                          </span>
                          <span className="bk-file-actions">
                            {PREVIEWABLE.has(f.mimeType) && (
                              <button type="button" className="bk-file-btn" onClick={() => onView(f, files)} aria-label={`View ${f.name}`}>
                                <Eye size={15} /> <span className="bk-file-btn-label">View</span>
                              </button>
                            )}
                            <button type="button" className="bk-file-btn bk-file-btn--icon" onClick={() => onDownloadFile(f)} aria-label={`Download ${f.name}`} title="Download (one-time link)">
                              <Download size={15} />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </section>
        </div>

        {!groupsLoading && !groupsError && folderCount > 0 && (
          <footer className="bk-drawer-foot">
            <span className="bk-drawer-foot-info">
              {fileCount} document{fileCount !== 1 ? "s" : ""} across {folderCount} folder{folderCount !== 1 ? "s" : ""}
            </span>
            <button type="button" className="btn btn-primary bk-download-all" disabled={downloadingAll} onClick={() => onDownloadAll(student)}>
              {downloadingAll
                ? <><RefreshCw size={15} className="bk-spin" /> Preparing…</>
                : <><Archive size={15} /> Download All</>}
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

export default function BankerPortal() {
  const { isAdmin, adminName, adminBank, clearStudent, logoutAdmin } = useStudent();
  const isMobile = useIsMobile();

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openStudent, setOpenStudent] = useState(null);
  const [groups, setGroups] = useState({});
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [bankLogoFailed, setBankLogoFailed] = useState(false);
  const filesRequest = useRef(0);

  const [showPwModal, setShowPwModal] = useState(false);
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPwText, setShowPwText] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  const [downloadingAll, setDownloadingAll] = useState(false);

  const [loanModalStudent, setLoanModalStudent] = useState(null);
  const [loanStatus, setLoanStatus] = useState("pending");
  const [loanRemark, setLoanRemark] = useState("");
  const [loanSanctionFile, setLoanSanctionFile] = useState(null);
  const [loanDisbursement, setLoanDisbursement] = useState(EMPTY_DISBURSEMENT);
  const [loanLoading, setLoanLoading] = useState(false);
  const [loanLoadingMsg, setLoanLoadingMsg] = useState("");
  const [loanErr, setLoanErr] = useState("");

  const openLoanModal = (s) => {
    setLoanModalStudent(s);
    setLoanStatus(s.loanStatus || "pending");
    setLoanRemark(s.loanRemark || "");
    setLoanSanctionFile(null);
    setLoanDisbursement({ ...EMPTY_DISBURSEMENT, ...(s.loanDisbursement || {}) });
    setLoanErr("");
  };

  const handleLoanSubmit = async (e) => {
    e.preventDefault();
    if (REMARK_STATUSES.includes(loanStatus) && !loanRemark.trim()) {
      setLoanErr(`A remark is required when the loan is ${loanStatus === "rejected" ? "rejected" : "dropped"}.`);
      return;
    }
    let disbursementPayload = null;
    if (loanStatus === "disbursed") {
      for (const { key, label } of DISBURSEMENT_FIELDS) {
        const n = Number(loanDisbursement[key]);
        if (loanDisbursement[key] === "" || Number.isNaN(n) || n < 0) {
          setLoanErr(`Enter a valid ${label.toLowerCase()} to mark the loan as disbursed.`);
          return;
        }
      }
      disbursementPayload = Object.fromEntries(
        DISBURSEMENT_FIELDS.map(({ key }) => [key, Number(loanDisbursement[key])]),
      );
    }
    setLoanLoading(true);
    setLoanErr("");
    try {
      setLoanLoadingMsg("Updating status…");
      await updateLoanStatus(
        loanModalStudent.name,
        studentIdentifier(loanModalStudent),
        loanStatus,
        loanRemark,
        disbursementPayload
      );
      const applyStatus = (extra = {}) => setStudents((prev) =>
        prev.map((s) =>
          s.name === loanModalStudent.name
            ? { ...s, loanStatus, loanRemark, ...(disbursementPayload ? { loanDisbursement: disbursementPayload } : {}), ...extra }
            : s
        )
      );
      let sanctionLetter = null;
      if (["sanctioned", "disbursed"].includes(loanStatus) && loanSanctionFile) {
        setLoanLoadingMsg("Uploading sanction letter…");
        try {
          sanctionLetter = await uploadSanctionLetter(
            loanModalStudent.name,
            studentIdentifier(loanModalStudent),
            loanSanctionFile
          );
        } catch (upErr) {
          // The status is saved; keep the dialog open so the letter can be retried
          applyStatus();
          setLoanErr(`Status saved, but the sanction letter wasn't uploaded: ${upErr.message}`);
          return;
        }
      }
      applyStatus(sanctionLetter ? { sanctionLetter } : {});
      setLoanModalStudent(null);
    } catch (e2) {
      setLoanErr(e2.message || "Failed to update loan status.");
    } finally {
      setLoanLoading(false);
      setLoanLoadingMsg("");
    }
  };

  // Downloads use one-time links (this student's zip / this file only,
  // valid 2 minutes, single use) — never a link carrying the login.
  const handleDownloadAll = async (student) => {
    setDownloadingAll(true);
    try {
      await downloadAllFiles(student.name, studentIdentifier(student));
    } catch (e) {
      setGroupsError(e.message || "Could not start the download.");
    } finally {
      setTimeout(() => setDownloadingAll(false), 1500);
    }
  };

  const handleDownloadFile = async (file) => {
    try {
      await downloadFile(file.id);
    } catch (e) {
      setGroupsError(e.message || "Could not start the download.");
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPass.length < 6) { setPwMsg({ type: "err", text: "New password must be at least 6 characters." }); return; }
    if (newPass !== confirmPass) { setPwMsg({ type: "err", text: "Passwords do not match." }); return; }
    setPwLoading(true); setPwMsg(null);
    try {
      await changeOwnPassword(curPass, newPass);
      setPwMsg({ type: "ok", text: "Password updated successfully." });
      setCurPass(""); setNewPass(""); setConfirmPass("");
    } catch (e2) {
      setPwMsg({ type: "err", text: e2.message || "Failed to update password." });
    } finally {
      setPwLoading(false);
    }
  };

  const openPasswordModal = () => {
    setNavOpen(false);
    setShowPwModal(true);
    setPwMsg(null);
  };

  // A full page load to the home page: it gets past this route's guard
  // (which would otherwise bounce to the sign-in page) and drops every
  // piece of student data still held in memory.
  const handleSignOut = () => {
    clearStudent();
    logoutAdmin();
    window.location.replace("/");
  };

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fetched = await getAllStudentsFromDrive();
      setStudents(fetched || []);
    } catch (e) {
      setError("Could not load students: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // Load on open — loadStudents sets state as part of an async fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudents();
  }, [isAdmin, loadStudents]);

  const handleOpenStudent = async (student) => {
    if (openStudent?.name === student.name) {
      setOpenStudent(null);
      return;
    }
    // Ignore a slower response for a student opened earlier
    const request = ++filesRequest.current;
    setOpenStudent(student);
    setGroups({});
    setGroupsError("");
    setGroupsLoading(true);
    try {
      const g = await getStudentFiles(student.name, studentIdentifier(student));
      if (request === filesRequest.current) setGroups(g);
    } catch (e) {
      if (request === filesRequest.current) setGroupsError(e.message || "Could not load documents.");
    } finally {
      if (request === filesRequest.current) setGroupsLoading(false);
    }
  };

  // Escape closes the top-most layer. The document viewer handles its own.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || previewFile) return;
      if (loanModalStudent) { if (!loanLoading) setLoanModalStudent(null); }
      else if (showPwModal) { if (!pwLoading) setShowPwModal(false); }
      else if (openStudent) setOpenStudent(null);
      else if (navOpen) setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewFile, loanModalStudent, loanLoading, showPwModal, pwLoading, openStudent, navOpen]);

  // No page scroll behind the student drawer or the mobile menu
  const lockScroll = Boolean(openStudent) || (isMobile && navOpen);
  useEffect(() => {
    if (!lockScroll) return undefined;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [lockScroll]);

  const q = search.trim().toLowerCase();
  const filtered = students.filter((s) => {
    if (!q) return true;
    return displayName(s).toLowerCase().includes(q) ||
      (s.name || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q) ||
      getApplicationId(s).toLowerCase().includes(q);
  });

  // The drawer shows the live record so a loan update is reflected at once
  const openRecord = openStudent && (students.find((s) => s.name === openStudent.name) || openStudent);

  if (!isAdmin) return null;

  const countBy = (pred) => students.filter(pred).length;
  const kpis = [
    { key: "total", label: "Total Assigned", Icon: UsersRound, value: students.length,
      hint: "Students whose applications have been shared with you" },
    { key: "inprocess", label: "In Process", Icon: Hourglass, value: countBy((s) => s.loanStatus === "inprocess"),
      hint: "Loan status is In Process" },
    { key: "sanctioned", label: "Sanctioned", Icon: ShieldCheck, value: countBy((s) => ["sanctioned", "disbursed"].includes(s.loanStatus)),
      hint: "Loan status is Sanctioned or Disbursed" },
    { key: "attention", label: "Needs Attention", Icon: TriangleAlert, value: countBy((s) => loanKey(s.loanStatus) === "pending"),
      hint: "Loan status is still Pending — not yet picked up by your bank" },
  ];

  const roleName = adminName || "Banker";
  const sidebarHidden = isMobile && !navOpen;

  return (
    <div className="bk-page theme-orbit orbit-backdrop">
      {/* ── Mobile top bar ── */}
      <header className="bk-topbar">
        <button
          type="button"
          className="bk-icon-btn"
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          aria-expanded={navOpen}
          aria-controls="bk-sidebar"
        >
          <Menu size={22} />
        </button>
        <BrandLogo size="sm" />
        <span className={`bk-avatar bk-avatar--${avatarTone(roleName)}`} title={`${roleName} · Banker`} aria-hidden="true">{initials(roleName)}</span>
      </header>

      {isMobile && navOpen && <div className="bk-nav-backdrop" onClick={() => setNavOpen(false)} />}

      {/* ── Sidebar (drawer on mobile) ── */}
      <aside
        id="bk-sidebar"
        className={`bk-sidebar${navOpen ? " is-open" : ""}`}
        aria-label="Banker portal"
        inert={sidebarHidden || undefined}
      >
        {/* Soft light drifting behind the menu (decoration only) */}
        <span className="bk-sidebar-glow is-a" aria-hidden="true" />
        <span className="bk-sidebar-glow is-b" aria-hidden="true" />
        <div className="bk-sidebar-top">
          <BrandLogo size="sm" />
          <button type="button" className="bk-icon-btn bk-sidebar-close" onClick={() => setNavOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <div className="bk-role">
          <span className={`bk-avatar bk-avatar--${avatarTone(roleName)}`} aria-hidden="true">{initials(roleName)}</span>
          <span className="bk-role-text">
            <span className="bk-role-label">Banker</span>
            {adminName && <span className="bk-role-name">{adminName}</span>}
          </span>
        </div>

        <nav className="bk-nav" aria-label="Main">
          <ul>
            <li>
              <button type="button" className="bk-nav-item is-active" aria-current="page" onClick={() => setNavOpen(false)}>
                <UsersRound size={19} aria-hidden="true" /> Assigned Students
              </button>
            </li>
            <li>
              <button type="button" className="bk-nav-item" onClick={openPasswordModal}>
                <KeyRound size={19} aria-hidden="true" /> Change Password
              </button>
            </li>
          </ul>
        </nav>

        <div className="bk-sidebar-foot">
          <button type="button" className="bk-nav-item bk-nav-item--signout" onClick={handleSignOut}>
            <LogOut size={19} aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="bk-main" id="bk-main">
        <header className="bk-head">
          <div className="bk-head-text">
            <h1 className="bk-title">Assigned Students</h1>
            <p className="bk-subtitle">Students shared with your bank for loan processing.</p>
          </div>
          <div className="bk-head-side">
            <div className="bk-bank">
              <span className="bk-bank-label">Allotted Bank</span>
              <span className="bk-bank-value">
                {!bankLogoFailed && (
                  <img src={getBankLogo(adminBank)} alt="" className="bk-bank-logo" onError={() => setBankLogoFailed(true)} />
                )}
                <span className="bk-bank-name">{adminBank || "Not set"}</span>
              </span>
            </div>
            <button type="button" className="btn btn-secondary bk-refresh" onClick={loadStudents} disabled={loading} aria-label="Refresh students">
              <RefreshCw size={16} className={loading ? "bk-spin" : ""} aria-hidden="true" />
              <span className="bk-refresh-label">Refresh</span>
            </button>
          </div>
        </header>

        <div className="bk-search-row">
          <label className="bk-search">
            <span className="sr-only">Search students</span>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              className="bk-search-input"
              placeholder="Search by name, email, phone or application ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="bk-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </label>
        </div>

        <ul className="bk-kpis" aria-label="Application counts">
          {kpis.map(({ key, label, Icon, value, hint }) => (
            <li key={key} className={`bk-kpi bk-kpi--${key}`} title={hint}>
              <span className="bk-kpi-icon" aria-hidden="true"><Icon size={21} /></span>
              <span className="bk-kpi-text">
                <span className="bk-kpi-value"><CountUp text={loading ? "–" : value} /></span>
                <span className="bk-kpi-label">
                  {label}
                  {key === "attention" && <Info size={13} className="bk-kpi-info" aria-hidden="true" />}
                </span>
                <span className="sr-only">{hint}</span>
              </span>
            </li>
          ))}
        </ul>

        {error && (
          <div className="bk-alert" role="alert">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <section className="bk-table-card" aria-label="Assigned students">
          {loading ? (
            <div className="bk-state bk-state--lg" role="status">
              <RefreshCw size={22} className="bk-spin" /> Loading students…
            </div>
          ) : students.length === 0 ? (
            <div className="bk-empty">
              <span className="bk-empty-icon" aria-hidden="true"><FolderOpen size={26} /></span>
              <h2>No students shared with you yet</h2>
              <p>When an advisor grants you access to a student's application, it will appear here.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bk-empty">
              <span className="bk-empty-icon" aria-hidden="true"><Search size={24} /></span>
              <h2>No matching students</h2>
              <p>Nothing matches “{search.trim()}”. Try a name, email, phone number or application ID.</p>
            </div>
          ) : (
            <table className="bk-table">
              <thead>
                <tr>
                  <th scope="col">Student Name</th>
                  <th scope="col">Application ID</th>
                  <th scope="col">Course</th>
                  <th scope="col">Document Status</th>
                  <th scope="col">Loan Status</th>
                  <th scope="col"><span className="bk-th-actions">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const name = displayName(s);
                  const course = s.personalInfo?.courseNameUniversity;
                  const appId = getApplicationId(s);
                  return (
                    <tr key={s.name} className={openStudent?.name === s.name ? "is-open" : undefined}>
                      <td className="bk-td-name">
                        <span className="bk-person">
                          <span className={`bk-avatar bk-avatar--${avatarTone(name)}`} aria-hidden="true">{initials(name)}</span>
                          <span className="bk-person-text">
                            <span className="bk-person-name">{name}</span>
                            <span className="bk-person-contact">{s.email || s.phone || "No contact info"}</span>
                          </span>
                        </span>
                      </td>
                      <td className="bk-td-id" data-label="Application ID">{appId || "—"}</td>
                      <td className="bk-td-course" data-label="Course">{course || "—"}</td>
                      <td className="bk-td-docs"><DocChip docs={getDocStatus(s)} /></td>
                      <td className="bk-td-loan"><LoanChip status={s.loanStatus} /> <LetterFlag student={s} /></td>
                      <td className="bk-td-action">
                        <button
                          type="button"
                          className="bk-view-btn"
                          onClick={() => handleOpenStudent(s)}
                          aria-label={`View ${name}`}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>

      {openRecord && (
        <StudentDrawer
          student={openRecord}
          groups={groups}
          groupsLoading={groupsLoading}
          groupsError={groupsError}
          downloadingAll={downloadingAll}
          onClose={() => setOpenStudent(null)}
          onUpdateLoan={openLoanModal}
          onView={(f, files) => setPreviewFile({ file: f, files })}
          onDownloadFile={handleDownloadFile}
          onDownloadAll={handleDownloadAll}
        />
      )}

      {previewFile && (
        <DocumentViewer
          file={previewFile.file}
          files={previewFile.files}
          subtitle={openRecord ? [displayName(openRecord), getApplicationId(openRecord)].filter(Boolean).join(" · ") : undefined}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Loan Status Update Modal */}
      {loanModalStudent && (
        <div className="modal-backdrop bk-modal-backdrop" onClick={() => !loanLoading && setLoanModalStudent(null)}>
          <div
            className="loan-status-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lsm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lsm-header">
              <div className="lsm-icon" aria-hidden="true"><Banknote size={22} /></div>
              <div className="lsm-title-block">
                <h3 id="lsm-title" className="lsm-title">Update Loan Status</h3>
                <p className="lsm-sub">
                  {[displayName(loanModalStudent), getApplicationId(loanModalStudent)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button type="button" className="lsm-close" onClick={() => setLoanModalStudent(null)} disabled={loanLoading} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleLoanSubmit} className="lsm-body">
              <div className="lsm-status-grid" role="radiogroup" aria-label="Loan status">
                {Object.entries(LOAN_STATUS_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={loanStatus === key}
                    className={`lsm-option lsm-option--${key}${loanStatus === key ? " selected" : ""}`}
                    onClick={() => { setLoanStatus(key); if (!REMARK_STATUSES.includes(key)) setLoanRemark(""); if (!["sanctioned", "disbursed"].includes(key)) setLoanSanctionFile(null); }}
                  >
                    <span className="lsm-option-dot" />
                    <span>{cfg.label}</span>
                    {loanStatus === key && <CheckCircle size={14} className="lsm-check" />}
                  </button>
                ))}
              </div>
              {REMARK_STATUSES.includes(loanStatus) && (
                <div className="lsm-remark-wrap">
                  <label className="lsm-remark-label" htmlFor="lsm-remark">
                    {REMARK_LABELS[loanStatus].label} <span className="required-star">*</span>
                  </label>
                  <textarea
                    id="lsm-remark"
                    className="lsm-remark-input"
                    rows={3}
                    placeholder={REMARK_LABELS[loanStatus].placeholder}
                    value={loanRemark}
                    onChange={(e) => setLoanRemark(e.target.value)}
                  />
                </div>
              )}
              {["sanctioned", "disbursed"].includes(loanStatus) && (
                <div className="lsm-upload-wrap">
                  <span className="lsm-remark-label">
                    Sanction Letter <span className="lsm-optional">— optional</span>
                  </span>
                  <p className="lsm-hint">
                    {loanModalStudent.sanctionLetter
                      ? `Already in the file: ${loanModalStudent.sanctionLetter.name}. A new upload replaces it.`
                      : "Without it, this file shows “Letter missing” until it's uploaded."}
                  </p>
                  <label className={`lsm-file-drop${loanSanctionFile ? " has-file" : ""}`}>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only"
                      onChange={(e) => setLoanSanctionFile(e.target.files[0] || null)} />
                    {loanSanctionFile ? (
                      <div className="lsm-file-selected">
                        <FileText size={15} />
                        <span className="lsm-file-name">{loanSanctionFile.name}</span>
                        <button type="button" className="lsm-file-remove" aria-label="Remove sanction letter"
                          onClick={(e) => { e.preventDefault(); setLoanSanctionFile(null); }}>
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
              {loanStatus === "disbursed" && (
                <fieldset className="lsm-disbursement-wrap">
                  <legend className="lsm-remark-label">
                    Disbursement Details <span className="required-star">*</span>
                  </legend>
                  <div className="lsm-disbursement-grid">
                    {DISBURSEMENT_FIELDS.map(({ key, label, unit, placeholder }) => (
                      <div className="lsm-disbursement-field" key={key}>
                        <label className="lsm-disbursement-label" htmlFor={`lsm-${key}`}>{label}</label>
                        <div className="lsm-disbursement-input-wrap">
                          <span className="lsm-disbursement-unit">{unit}</span>
                          <input
                            id={`lsm-${key}`}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="lsm-disbursement-input"
                            placeholder={placeholder}
                            value={loanDisbursement[key]}
                            onChange={(e) => setLoanDisbursement((prev) => ({ ...prev, [key]: e.target.value }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </fieldset>
              )}
              {loanErr && <p className="lsm-error" role="alert">{loanErr}</p>}
              <div className="lsm-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setLoanModalStudent(null)} disabled={loanLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loanLoading}>
                  {loanLoading ? <><RefreshCw size={13} className="bk-spin" /> {loanLoadingMsg}</> : "Update Status"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPwModal && (
        <div className="modal-backdrop bk-modal-backdrop" onClick={() => !pwLoading && setShowPwModal(false)}>
          <div
            className="modal-box bank-modal-box bk-pw-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bk-pw-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-icon" aria-hidden="true"><KeyRound size={28} /></div>
            <h3 id="bk-pw-title" className="bank-modal-title">Change Password</h3>
            <form onSubmit={handleChangePassword} className="settings-form">
              <div className="input-group">
                <label htmlFor="bk-pw-current">Current Password</label>
                <div className="password-wrap">
                  <input id="bk-pw-current" className="input-field" type={showPwText ? "text" : "password"} placeholder="Your current password"
                    autoComplete="current-password" value={curPass} onChange={(e) => setCurPass(e.target.value)} autoFocus />
                  <button type="button" className="show-pass" onClick={() => setShowPwText(!showPwText)}
                    aria-label={showPwText ? "Hide passwords" : "Show passwords"} aria-pressed={showPwText}>
                    {showPwText ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="input-group">
                <label htmlFor="bk-pw-new">New Password</label>
                <input id="bk-pw-new" className="input-field" type={showPwText ? "text" : "password"} placeholder="Min. 6 characters"
                  autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              </div>
              <div className="input-group">
                <label htmlFor="bk-pw-confirm">Confirm New Password</label>
                <input id="bk-pw-confirm" className="input-field" type={showPwText ? "text" : "password"} placeholder="Repeat new password"
                  autoComplete="new-password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
              </div>
              {pwMsg && <p className={`settings-msg ${pwMsg.type}`} role={pwMsg.type === "err" ? "alert" : "status"}>{pwMsg.text}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPwModal(false)} disabled={pwLoading}>
                  {pwMsg?.type === "ok" ? "Close" : "Cancel"}
                </button>
                <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                  {pwLoading ? <><RefreshCw size={13} className="bk-spin" /> Saving…</> : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
