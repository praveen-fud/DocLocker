import { useState, useEffect, useCallback } from "react";
import {
  Search, RefreshCw, AlertCircle, FileText, Eye, Download, ChevronDown,
  Building2, FolderOpen, X, GraduationCap, Banknote, FolderInput, KeyRound, EyeOff,
} from "lucide-react";
import { useStudent } from "../../context/StudentContext";
import { getAllStudentsFromDrive, getStudentFiles, getFileProxyUrl, changeOwnPassword } from "../../utils/driveApi";
import "./BankerPortal.css";

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

export default function BankerPortal() {
  const { isAdmin, adminName } = useStudent();

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openStudent, setOpenStudent] = useState(null);
  const [groups, setGroups] = useState({});
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState("");
  const [previewFile, setPreviewFile] = useState(null);

  const [showPwModal, setShowPwModal] = useState(false);
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPwText, setShowPwText] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

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
    void loadStudents();
  }, [isAdmin, loadStudents]);

  const handleOpenStudent = async (student) => {
    if (openStudent?.name === student.name) {
      setOpenStudent(null);
      return;
    }
    setOpenStudent(student);
    setGroups({});
    setGroupsError("");
    setGroupsLoading(true);
    try {
      const g = await getStudentFiles(student.name, student.email || student.phone || "");
      setGroups(g);
    } catch (e) {
      setGroupsError(e.message || "Could not load documents.");
    } finally {
      setGroupsLoading(false);
    }
  };

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (s.name || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q);
  });

  if (!isAdmin) return null;

  return (
    <div className="banker-page">
      <div className="banker-container">
        <div className="banker-header animate-fade-in">
          <div className="banker-header-left">
            <h1 className="banker-title">
              <div className="banker-title-icon"><Building2 size={18} /></div>
              Banker Portal
            </h1>
            <p className="banker-sub">Welcome, {adminName} — showing students shared with you</p>
          </div>
          <div className="banker-header-actions">
            <button className="btn btn-secondary btn-sm" onClick={loadStudents} disabled={loading}>
              <RefreshCw size={13} className={loading ? "spin" : ""} />
              <span>Refresh</span>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowPwModal(true); setPwMsg(null); }}>
              <KeyRound size={13} />
              <span>Change Password</span>
            </button>
          </div>
        </div>

        <div className="banker-search">
          <Search size={15} />
          <input
            className="banker-search-input"
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="banker-search-clear" onClick={() => setSearch("")}><X size={14} /></button>
          )}
        </div>

        {error && (
          <div className="banker-error animate-fade-in">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="banker-loading">
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="banker-empty">
            <div className="banker-empty-icon"><FolderOpen size={28} /></div>
            <h3>No students shared with you yet</h3>
            <p>When an advisor grants you access to a student's application, it will appear here.</p>
          </div>
        ) : (
          <div className="banker-student-list">
            {filtered.map((s) => {
              const isOpen = openStudent?.name === s.name;
              const p = s.personalInfo || {};
              const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.fullName || s.name;
              return (
                <div key={s.name} className={`banker-card${isOpen ? " open" : ""}`}>
                  <button className="banker-card-header" onClick={() => handleOpenStudent(s)}>
                    <div className="banker-card-avatar">{(fullName || "?")[0].toUpperCase()}</div>
                    <div className="banker-card-info">
                      <span className="banker-card-name">{fullName}</span>
                      <span className="banker-card-contact">{s.email || s.phone || "No contact info"}</span>
                    </div>
                    {p.loanAmount && (
                      <span className="meta-pill">₹{Number(p.loanAmount).toLocaleString("en-IN")}</span>
                    )}
                    <ChevronDown size={18} className={`banker-chevron${isOpen ? " open" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="banker-card-body animate-fade-in">
                      {groupsLoading ? (
                        <div className="banker-loading" style={{ padding: "24px 0" }}>
                          <div className="loading-dots"><span /><span /><span /></div>
                        </div>
                      ) : groupsError ? (
                        <div className="banker-error"><AlertCircle size={15} /> {groupsError}</div>
                      ) : Object.keys(groups).length === 0 ? (
                        <p className="banker-no-docs">No documents found for this student.</p>
                      ) : (
                        Object.entries(groups).map(([group, files]) => {
                          const GroupIcon = groupIconFor(group);
                          return (
                            <div key={group} className="banker-doc-group">
                              <div className="banker-doc-group-title">
                                <GroupIcon size={14} /> {group.replace(/_/g, " ")}
                                <span className="banker-doc-count">{files.length}</span>
                              </div>
                              <div className="banker-doc-list">
                                {files.map((f) => (
                                  <div key={f.id} className="banker-doc-row">
                                    <FileText size={15} className="banker-doc-file-icon" />
                                    <div className="banker-doc-meta">
                                      <span className="banker-doc-name">{f.name}</span>
                                      <span className="banker-doc-size">{formatBytes(f.size)}</span>
                                    </div>
                                    <div className="banker-doc-actions">
                                      {PREVIEWABLE.has(f.mimeType) && (
                                        <button
                                          className="icon-btn"
                                          title="View"
                                          onClick={() => setPreviewFile(f)}
                                        >
                                          <Eye size={14} />
                                        </button>
                                      )}
                                      <a
                                        className="icon-btn"
                                        title="Download"
                                        href={getFileProxyUrl(f.id, "download")}
                                      >
                                        <Download size={14} />
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewFile && (
        <div className="banker-preview-backdrop" onClick={() => setPreviewFile(null)}>
          <div className="banker-preview-box" onClick={(e) => e.stopPropagation()}>
            <div className="banker-preview-header">
              <span>{previewFile.name}</span>
              <div className="banker-preview-actions">
                <a className="icon-btn" title="Download" href={getFileProxyUrl(previewFile.id, "download")}>
                  <Download size={15} />
                </a>
                <button className="icon-btn" title="Close" onClick={() => setPreviewFile(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="banker-preview-body">
              {previewFile.mimeType === "application/pdf" ? (
                <iframe src={getFileProxyUrl(previewFile.id, "view")} title={previewFile.name} />
              ) : (
                <img src={getFileProxyUrl(previewFile.id, "view")} alt={previewFile.name} />
              )}
            </div>
          </div>
        </div>
      )}

      {showPwModal && (
        <div className="modal-backdrop" onClick={() => !pwLoading && setShowPwModal(false)}>
          <div className="modal-box bank-modal-box animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon"><KeyRound size={28} /></div>
            <h3 className="bank-modal-title">Change Password</h3>
            <form onSubmit={handleChangePassword} className="settings-form">
              <div className="input-group">
                <label>Current Password</label>
                <div className="password-wrap">
                  <input className="input-field" type={showPwText ? "text" : "password"} placeholder="Your current password"
                    value={curPass} onChange={(e) => setCurPass(e.target.value)} autoFocus />
                  <button type="button" className="show-pass" onClick={() => setShowPwText(!showPwText)}>
                    {showPwText ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="input-group">
                <label>New Password</label>
                <input className="input-field" type={showPwText ? "text" : "password"} placeholder="Min. 6 characters"
                  value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Confirm New Password</label>
                <input className="input-field" type={showPwText ? "text" : "password"} placeholder="Repeat new password"
                  value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} />
              </div>
              {pwMsg && <p className={`settings-msg ${pwMsg.type}`}>{pwMsg.text}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPwModal(false)} disabled={pwLoading}>
                  {pwMsg?.type === "ok" ? "Close" : "Cancel"}
                </button>
                <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                  {pwLoading ? <><RefreshCw size={13} className="spin" /> Saving…</> : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
