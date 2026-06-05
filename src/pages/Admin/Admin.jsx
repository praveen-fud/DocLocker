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
  BarChart3,
  Trash2,
  X,
  ExternalLink,
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { getAllStudentsFromDrive, deleteStudent } from "../../utils/driveApi";
import "./Admin.css";

function getProgress(s) {
  if (!s.uploads) return 0;
  const total = Object.values(s.uploads).reduce(
    (a, sec) => a + Object.keys(sec).length,
    0,
  );
  return Math.min(100, Math.round((total / 20) * 100));
}

export default function Admin() {
  const { isAdmin } = useStudent();
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Wrap loadStudents in useCallback so it can be safely used in useEffect
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

  // Redirect if not admin
  useEffect(() => {
    if (!isAdmin) navigate("/admin-login");
  }, [isAdmin, navigate]);

  // Load students only when isAdmin becomes true, using an async IIFE
  useEffect(() => {
    if (isAdmin) {
      const fetchData = async () => {
        await loadStudents();
      };
      fetchData();
    }
  }, [isAdmin, loadStudents]); // correct dependencies

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

  const openDriveFolder = (s) => {
    const url =
      s.driveUrl ||
      s.driveFolderUrl ||
      (import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID
        ? `https://drive.google.com/drive/folders/${import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID}`
        : null);
    if (url) window.open(url, "_blank");
  };

  const filtered = students.filter(
    (s) =>
      !search ||
      (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.phone || "").includes(search),
  );

  const stats = {
    total: students.length,
    complete: students.filter((s) => getProgress(s) === 100).length,
    inProgress: students.filter((s) => {
      const p = getProgress(s);
      return p > 0 && p < 100;
    }).length,
    notStarted: students.filter((s) => getProgress(s) === 0).length,
  };

  const rootUrl = import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID
    ? `https://drive.google.com/drive/folders/${import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID}`
    : null;

  return (
    <div className="admin-page page-bg">
      <div className="admin-container">
        <div className="admin-header animate-fade-in">
          <div>
            <h1 className="admin-title">
              <BarChart3 size={24} /> Admin Dashboard
            </h1>
            <p className="admin-sub">Manage all student document submissions</p>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadStudents}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate("/")}
            >
              <UserPlus size={14} /> Add Student
            </button>
            {rootUrl && (
              <a
                className="btn btn-secondary btn-sm"
                href={rootUrl}
                target="_blank"
                rel="noreferrer"
              >
                <FolderOpen size={14} /> Open Root Drive
              </a>
            )}
          </div>
        </div>

        <div className="admin-stats animate-fade-in">
          {[
            {
              label: "Total",
              value: stats.total,
              icon: <Users size={18} />,
              color: "blue",
            },
            {
              label: "Completed",
              value: stats.complete,
              icon: <CheckCircle size={18} />,
              color: "green",
            },
            {
              label: "In Progress",
              value: stats.inProgress,
              icon: <Clock size={18} />,
              color: "yellow",
            },
            {
              label: "Not Started",
              value: stats.notStarted,
              icon: <AlertCircle size={18} />,
              color: "red",
            },
          ].map((st, i) => (
            <div key={i} className={`stat-card stat-${st.color}`}>
              <div className="stat-icon">{st.icon}</div>
              <div className="stat-value">{st.value}</div>
              <div className="stat-label">{st.label}</div>
            </div>
          ))}
        </div>

        <div className="admin-search animate-fade-in">
          <Search size={16} />
          <input
            className="search-input"
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error && (
          <div className="admin-error animate-fade-in">
            <AlertCircle size={16} /> {error}
            <button className="close-err" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="admin-table-wrap animate-fade-in">
          {loading ? (
            <div className="admin-loading">
              <RefreshCw size={24} className="spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">
              <Users size={40} />
              <h3>{search ? "No students found" : "No students yet"}</h3>
            </div>
          ) : (
            <div className="student-list">
              {filtered.map((s, i) => {
                const progress = getProgress(s);
                const fileCount = s.uploads
                  ? Object.values(s.uploads).reduce(
                      (a, sec) => a + Object.keys(sec).length,
                      0,
                    )
                  : 0;
                const isOpen = expandedIdx === i;
                return (
                  <div
                    key={i}
                    className={`student-block${isOpen ? " open" : ""}`}
                  >
                    <div
                      className="student-row"
                      onClick={() => setExpandedIdx(isOpen ? null : i)}
                    >
                      <div className="student-avatar">
                        {(s.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="student-info">
                        <span className="student-name">
                          {s.name || "Unknown"}
                        </span>
                        <span className="student-contact">
                          {s.email || s.phone || "—"}
                        </span>
                      </div>
                      <div className="student-meta">
                        {s.personalInfo?.loanAmount && (
                          <span className="meta-tag">
                            ₹{s.personalInfo.loanAmount}
                          </span>
                        )}
                        <span className="meta-tag">{fileCount} files</span>
                      </div>
                      <div className="student-progress-col">
                        <div className="mini-progress">
                          <div
                            className="mini-fill"
                            style={{
                              width: `${progress}%`,
                              background:
                                progress === 100 ? "#22c55e" : "var(--blue)",
                            }}
                          />
                        </div>
                        <span className="mini-pct">{progress}%</span>
                      </div>
                      <div className="student-status">
                        {progress === 100 ? (
                          <span className="badge badge-success">Complete</span>
                        ) : progress > 0 ? (
                          <span className="badge badge-warning">
                            In Progress
                          </span>
                        ) : (
                          <span className="badge badge-error">Not Started</span>
                        )}
                      </div>
                      <div
                        className="student-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="icon-btn drive-btn"
                          title="Open Drive folder"
                          onClick={() => openDriveFolder(s)}
                        >
                          <FolderOpen size={15} />
                        </button>
                        <button
                          className="icon-btn del-btn"
                          title="Delete student"
                          onClick={() => setConfirmDelete(s.name)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="student-detail animate-fade-in">
                        <div className="detail-grid">
                          {[
                            ["Email", s.email || s.personalInfo?.email],
                            ["Phone", s.phone || s.personalInfo?.phone],
                            ["Loan Amt", s.personalInfo?.loanAmount],
                            ["Marital", s.personalInfo?.marital],
                            ["Co-Applicants", s.coApplicants],
                          ]
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <div key={k} className="detail-item">
                                <span className="detail-label">{k}</span>
                                <span className="detail-value">{v}</span>
                              </div>
                            ))}
                        </div>
                        <div className="detail-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => openDriveFolder(s)}
                          >
                            <ExternalLink size={14} /> Open Drive Folder
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setConfirmDelete(s.name)}
                          >
                            <Trash2 size={14} /> Delete Student
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div
          className="modal-backdrop"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="modal-box animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-icon">
              <Trash2 size={28} />
            </div>
            <h3>Delete Student?</h3>
            <p>
              This will permanently delete <strong>{confirmDelete}</strong> and
              all their data from Google Drive. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
              >
                {deleting ? (
                  "Deleting…"
                ) : (
                  <>
                    <Trash2 size={14} /> Delete permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
