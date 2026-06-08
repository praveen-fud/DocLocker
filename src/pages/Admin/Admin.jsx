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
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { getAllStudentsFromDrive, deleteStudent } from "../../utils/driveApi";
import { DOCUMENT_SCHEMA, CO_APPLICANT_SCHEMA } from "../../context/schemas";
import "./Admin.css";

/* ─── Helpers ─────────────────────────────────────────────────── */

function getTotalUploads(s) {
  if (!s.uploads) return 0;
  return Object.values(s.uploads).reduce(
    (acc, section) => acc + Object.keys(section).length,
    0,
  );
}

function getOverallProgress(s) {
  const total = getTotalUploads(s);
  return Math.min(100, Math.round((total / 22) * 100));
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
    Object.entries(sectionFiles).forEach(([fieldId, fileInfo]) => {
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

/**
 * Returns an array of { section, label } objects for every required
 * document not yet uploaded, driven directly from DOCUMENT_SCHEMA
 * and CO_APPLICANT_SCHEMA.
 */
function getMissingDocs(s) {
  const uploads = s.uploads || {};
  const missing = [];

  // Applicant (GOVT ID) required fields
  const applicantUploads = uploads.applicant || {};
  DOCUMENT_SCHEMA.applicant.fields
    .filter((f) => !f.optional)
    .forEach((f) => {
      if (!applicantUploads[f.id]) {
        missing.push({ section: "GOVT ID", label: f.label });
      }
    });

  // Academics required fields
  const academicUploads = uploads.academics || {};
  DOCUMENT_SCHEMA.academics.fields
    .filter((f) => !f.optional)
    .forEach((f) => {
      if (!academicUploads[f.id]) {
        missing.push({ section: "Academics", label: f.label });
      }
    });

  // Co-applicant required fields
  const coCount = s.coApplicants || 0;
  for (let i = 0; i < coCount; i++) {
    const coUploads = uploads[`co_${i}`] || {};
    const empType = s.personalInfo?.[`co_info_${i}`]?.empType || "salaried";
    const coFields = CO_APPLICANT_SCHEMA[empType] || CO_APPLICANT_SCHEMA.other;
    const coName =
      s.personalInfo?.[`co_info_${i}`]?.name || `Co-Applicant ${i + 1}`;

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

/* ─── Sub-components ───────────────────────────────────────────── */

function StatCard({ label, value, icon, color }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-top">
        <div className="stat-icon-wrap">{icon}</div>
        <span className="stat-trend">
          {color === "blue"
            ? "ALL"
            : color === "green"
              ? "✓"
              : color === "yellow"
                ? "~"
                : "○"}
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
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

/* ─── Detail tabs content ─────────────────────────────────────── */

function PersonalTab({ student }) {
  const p = student.personalInfo || {};
  const fields = [
    { label: "Full Name", value: p.fullName || student.name },
    { label: "Email", value: student.email || p.email },
    { label: "Phone", value: student.phone || p.phone },
    { label: "Marital Status", value: p.marital },
    { label: "Loan Amount", value: p.loanAmount ? `₹${p.loanAmount}` : null },
    { label: "10th %", value: p.pct10 },
    { label: "12th %", value: p.pct12 },
    { label: "Grad % / CGPA", value: p.pctGrad },
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
            <div className={`info-value${!value ? " empty" : ""}`}>
              {value || "—"}
            </div>
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
              if (!info.name) return null;
              return (
                <div key={idx} className="co-item">
                  <div className="co-avatar">
                    <UsersIcon size={15} />
                  </div>
                  <div className="co-info">
                    <div className="co-name">{info.name}</div>
                    <div className="co-details">
                      {info.relation || "Relation N/A"}
                    </div>
                  </div>
                  {info.empType && (
                    <span className="co-type">{info.empType}</span>
                  )}
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
    ? [
        {
          key: "co_uploads",
          label: `Co‑Applicant Docs`,
          required: student.coApplicants * 3,
        },
      ]
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
          const pct = required
            ? Math.min(100, Math.round((count / required) * 100))
            : 0;
          return (
            <div key={key} className="upload-section-card">
              <div className="usc-header">
                <span className="usc-label">{label}</span>
                <span className="usc-count">
                  {count}
                  {required ? ` / ${required}` : "+"}
                </span>
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

      {/* Missing docs alert — grouped by section */}
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

        // group by section
        const grouped = missing.reduce((acc, { section, label }) => {
          if (!acc[section]) acc[section] = [];
          acc[section].push(label);
          return acc;
        }, {});

        return (
          <div className="missing-section" style={{ marginBottom: 16 }}>
            <div className="missing-title">
              <AlertCircle size={14} />
              {missing.length} Missing Required Document
              {missing.length !== 1 ? "s" : ""}
            </div>
            {Object.entries(grouped).map(([section, labels]) => (
              <div key={section} className="missing-group">
                <div className="missing-group-label">{section}</div>
                <ul className="missing-list">
                  {labels.map((label, i) => (
                    <li key={i}>{label}</li>
                  ))}
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
          <div className="admin-empty-icon">
            <FileText size={24} />
          </div>
          <h3>No files uploaded yet</h3>
          <p>Documents will appear here once the student uploads them.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-body">
      <p className="section-heading">
        <FileText size={13} /> {files.length} Uploaded File
        {files.length !== 1 ? "s" : ""}
      </p>
      <div className="files-list">
        {files.map((file, idx) => (
          <div key={idx} className="file-item">
            <div className="file-icon">
              <FileText size={14} />
            </div>
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
                <ExternalLink size={12} />
                View
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Student Row ──────────────────────────────────────────────── */

function StudentRow({ student, isOpen, onToggle, onDelete, onOpenDrive }) {
  const [activeTab, setActiveTab] = useState("personal");

  const totalUploads = getTotalUploads(student);
  const progress = getOverallProgress(student);
  const progClass = getProgressClass(progress);
  const avatarVariant = getAvatarVariant(student.name);
  const files = getAllUploadedFiles(student.uploads);

  const tabs = [
    {
      id: "personal",
      label: "Personal",
      icon: <User size={12} />,
      count: null,
    },
    {
      id: "documents",
      label: "Documents",
      icon: <FolderOpen size={12} />,
      count: null,
    },
    {
      id: "files",
      label: "Files",
      icon: <FileText size={12} />,
      count: files.length,
    },
  ];

  return (
    <div className={`student-block${isOpen ? " open" : ""}`}>
      {/* Row */}
      <div className="student-row" onClick={onToggle}>
        <div className={`student-avatar avatar-${avatarVariant}`}>
          {(student.name || "?")[0].toUpperCase()}
        </div>

        <div className="student-info">
          <span className="student-name">
            {student.name || "Unknown Student"}
          </span>
          <span className="student-contact">
            {student.email || student.phone || "No contact info"}
          </span>
        </div>

        <div className="student-meta">
          {student.personalInfo?.loanAmount && (
            <span className="meta-pill">
              ₹{student.personalInfo.loanAmount}
            </span>
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

        <div
          className="student-actions-col"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="icon-btn drive-btn"
            title="Open Drive folder"
            onClick={onOpenDrive}
          >
            <FolderOpen size={14} />
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

      {/* Expanded detail panel */}
      {isOpen && (
        <div className="student-detail">
          <div className="detail-inner">
            {/* Tab bar */}
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

            {/* Tab body */}
            {activeTab === "personal" && <PersonalTab student={student} />}
            {activeTab === "documents" && <DocumentsTab student={student} />}
            {activeTab === "files" && <FilesTab student={student} />}

            {/* Action bar */}
            <div className="detail-action-bar">
              <button
                className="btn btn-secondary btn-sm"
                onClick={onOpenDrive}
              >
                <ExternalLink size={13} />
                Open Drive Folder
              </button>
              <button className="btn btn-danger btn-sm" onClick={onDelete}>
                <Trash2 size={13} />
                Delete Student
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
      <div
        className="modal-box animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-icon">
          <Trash2 size={28} />
        </div>
        <h3>Delete Student?</h3>
        <p>
          This will permanently remove <strong>{name}</strong> and all their
          associated documents from Google Drive. This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <RefreshCw size={13} className="spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 size={13} />
                Delete Permanently
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────── */

export default function Admin() {
  const { isAdmin } = useStudent();
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | complete | progress | notStarted
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Auth guard ───────────────────────────────────────────── */
  useEffect(() => {
    if (!isAdmin) navigate("/admin-login");
  }, [isAdmin, navigate]);

  /* ── Load data ────────────────────────────────────────────── */
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

  useEffect(() => {
    if (isAdmin) {
      const run = async () => {
        await loadStudents();
      };
      run();
    }
  }, [isAdmin, loadStudents]);

  /* ── Delete ───────────────────────────────────────────────── */
  const handleDelete = async (name) => {
    setDeleting(true);
    try {
      await deleteStudent(name);
      setStudents((prev) => prev.filter((s) => s.name !== name));
      setConfirmDelete(null);
      setExpandedIdx(null);
    } catch (e) {
      setError("Delete failed: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  /* ── Drive folder ─────────────────────────────────────────── */
  const openDriveFolder = (s) => {
    const url =
      s.driveUrl ||
      s.driveFolderUrl ||
      (import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID
        ? `https://drive.google.com/drive/folders/${import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID}`
        : null);
    if (url) window.open(url, "_blank");
  };

  /* ── Stats ────────────────────────────────────────────────── */
  const stats = {
    total: students.length,
    complete: students.filter((s) => getOverallProgress(s) === 100).length,
    inProgress: students.filter((s) => {
      const p = getOverallProgress(s);
      return p > 0 && p < 100;
    }).length,
    notStarted: students.filter((s) => getOverallProgress(s) === 0).length,
  };

  /* ── Filtered list ─────────────────────────────────────────── */
  const filtered = students.filter((s) => {
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

  /* ── Root Drive URL ────────────────────────────────────────── */
  const rootUrl = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID
    ? `https://drive.google.com/drive/folders/${import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID}`
    : null;

  if (!isAdmin) return null;

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <div className="admin-page">
      <div className="admin-container">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="admin-header animate-fade-in">
          <div className="admin-header-left">
            <h1 className="admin-title">
              <div className="admin-title-icon">
                <Shield size={18} />
              </div>
              Admin Dashboard
            </h1>
            <p className="admin-sub">Manage all student document submissions</p>
          </div>

          <div className="header-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadStudents}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? "spin" : ""} />
              Refresh
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigate("/")}
            >
              <UserPlus size={13} />
              Add Student
            </button>
            {rootUrl && (
              <a
                className="btn btn-primary btn-sm"
                href={rootUrl}
                target="_blank"
                rel="noreferrer"
              >
                <FolderOpen size={13} />
                Root Drive
              </a>
            )}
          </div>
        </div>

        {/* ── Stats ──────────────────────────────────────────── */}
        <div className="admin-stats animate-fade-in">
          <StatCard
            label="Total Students"
            value={stats.total}
            icon={<Building2 size={18} />}
            color="blue"
          />
          <StatCard
            label="Completed"
            value={stats.complete}
            icon={<CheckCircle size={18} />}
            color="green"
          />
          <StatCard
            label="In Progress"
            value={stats.inProgress}
            icon={<TrendingUp size={18} />}
            color="yellow"
          />
          <StatCard
            label="Not Started"
            value={stats.notStarted}
            icon={<Clock size={18} />}
            color="red"
          />
        </div>

        {/* ── Toolbar ────────────────────────────────────────── */}
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
              <button className="search-clear" onClick={() => setSearch("")}>
                <X size={14} />
              </button>
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
        </div>

        {/* ── Error banner ───────────────────────────────────── */}
        {error && (
          <div className="admin-error animate-fade-in">
            <AlertCircle size={15} />
            {error}
            <button className="close-err" onClick={() => setError("")}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────── */}
        <div className="admin-table-wrap animate-fade-in">
          {/* Column headers */}
          <div className="table-head">
            <div className="th th-name">Student</div>
            <div className="th th-meta">Metadata</div>
            <div className="th th-progress">Progress</div>
            <div className="th th-status">Status</div>
            <div className="th th-actions">Actions</div>
          </div>

          {loading ? (
            <div className="admin-loading">
              <div className="loading-dots">
                <span />
                <span />
                <span />
              </div>
              Loading students…
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon">
                <Users size={28} />
              </div>
              <h3>
                {search || filter !== "all"
                  ? "No students match"
                  : "No students yet"}
              </h3>
              <p>
                {search || filter !== "all"
                  ? "Try adjusting your search or filter."
                  : "Add a student to get started."}
              </p>
              {(search || filter !== "all") && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
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
                  onDelete={(e) => {
                    if (e) e.stopPropagation();
                    setConfirmDelete(s.name);
                  }}
                  onOpenDrive={(e) => {
                    if (e) e.stopPropagation();
                    openDriveFolder(s);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Delete modal ─────────────────────────────────────── */}
      {confirmDelete && (
        <DeleteModal
          name={confirmDelete}
          deleting={deleting}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
