import { useMemo, useState } from "react";
import {
  IdCard, GraduationCap, Award, Plane, Wallet, FolderOpen, Folder, FileText, FileImage,
  Search, X, Download, Eye, ChevronRight, ArrowLeft, RefreshCw, AlertCircle, UserX, Users, BadgeCheck,
} from "lucide-react";
import DocumentViewer from "../../components/DocumentViewer/DocumentViewer";
import { downloadFile, downloadBundle } from "../../utils/driveApi";
import { getApplicationId } from "../../utils/applicationId";
import "./DocumentLibrary.css";

// Every student document, sorted into folders by document type rather than
// by student. Superadmin only. Folders are matched on the upload field id
// (multi-file fields add "_1", "_2" …), so a co-applicant's PAN lands in the
// same "PAN Card" folder as the student's, tagged with who it belongs to.
//   required:  every student should have one (a Missing tab lists who doesn't)
//   expected:  only these students should have one (same Missing tab)
const LETTER_STAGES = new Set(["sanctioned", "disbursed"]);
const GROUPS = [
  {
    id: "loan", label: "Loan", icon: BadgeCheck, folders: [
      // From the lender, not the student: the recorded letter, or one the
      // server found in the student's file
      { key: "sanction_letters", label: "Sanction letters", ids: [], expected: (s) => LETTER_STAGES.has(s.loanStatus) },
    ],
  },
  {
    id: "identity", label: "Identity", icon: IdCard, folders: [
      { key: "passport", label: "Passport", ids: ["passport"], required: true },
      { key: "pan", label: "PAN Card", ids: ["pan"], required: true },
      { key: "aadhar", label: "Aadhaar Card", ids: ["aadhar", "aadhaar"], required: true },
      { key: "photo", label: "Photos", ids: ["photo"] },
      { key: "signature", label: "Signatures", ids: ["signature"] },
      { key: "visa_history", label: "Visa history", ids: ["Visa History"] },
    ],
  },
  {
    id: "academics", label: "Academics", icon: GraduationCap, folders: [
      { key: "marksheet_10", label: "10th Marksheet", ids: ["marksheet_10"], required: true },
      { key: "marksheet_12", label: "12th Marksheet", ids: ["marksheet_12"], required: true },
      { key: "diploma", label: "Diploma", ids: ["Diploma_marksheet"] },
      { key: "graduation", label: "Graduation marksheets", ids: ["graduation"] },
      { key: "degree", label: "Degree certificate", ids: ["degree_certificate"] },
      { key: "cmm", label: "Consolidated marksheet", ids: ["CMM"] },
      { key: "moi", label: "Medium of instruction", ids: ["MOI"] },
      { key: "lor", label: "Recommendation letters", ids: ["LOR"] },
      { key: "od", label: "OD certificate", ids: ["OD"] },
      { key: "pc", label: "Professional certificates", ids: ["PC"] },
    ],
  },
  {
    id: "tests", label: "Test scores", icon: Award, folders: [
      { key: "gre", label: "GRE", ids: ["gre_scorecard"] },
      { key: "gmat", label: "GMAT", ids: ["gmat_scorecard"] },
      { key: "ielts", label: "IELTS", ids: ["ielts_scorecard"] },
      { key: "toefl", label: "TOEFL", ids: ["toefl_scorecard"] },
      { key: "pte", label: "PTE", ids: ["pte_scorecard"] },
      { key: "duolingo", label: "Duolingo", ids: ["duolingo_scorecard"] },
    ],
  },
  {
    id: "admission", label: "Admission & visa", icon: Plane, folders: [
      { key: "admission", label: "I-20 / Admission letters", ids: ["i20_admission"] },
      { key: "visa_appointment", label: "Visa appointments", ids: ["visa_appointment"] },
    ],
  },
  {
    id: "financial", label: "Financial", icon: Wallet, folders: [
      { key: "cibil", label: "CIBIL reports", ids: ["cibil_report"] },
      { key: "salary", label: "Salary slips", ids: ["salary_slip_applicant", "salary_slip_3m"] },
      { key: "bank_statements", label: "Bank statements", ids: ["bank_stmt_6m"] },
      { key: "itr", label: "ITR / Form 16", ids: ["form16_itr_y1", "form16_itr_y2", "form16_itr_y3", "itr_y1", "itr_y2", "itr_y3"] },
      { key: "business", label: "Business proof / GST", ids: ["business_proof"] },
    ],
  },
  {
    id: "other", label: "Generated & other", icon: FolderOpen, folders: [
      { key: "application_form", label: "Application forms", ids: [] },
      { key: "eligibility", label: "Eligibility reports", ids: [] },
      { key: "resume", label: "Resumes", ids: ["resume"] },
      { key: "other", label: "Other documents", ids: [] },
    ],
  },
];

const FOLDERS = GROUPS.flatMap((g) => g.folders.map((f) => ({ ...f, group: g.id })));
const FOLDER_BY_ID = new Map(FOLDERS.flatMap((f) => f.ids.map((id) => [id, f.key])));
const FOLDER_BY_KEY = new Map(FOLDERS.map((f) => [f.key, f]));
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic)$/i;

const studentName = (s) => (s.name || "").split("__")[0] || "Unnamed";

function initials(name) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || "?") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}

// "passport_1" → "passport"; only strips a numeric suffix
function baseFieldId(fieldId) {
  const m = /^(.*)_(\d+)$/.exec(fieldId);
  return m && FOLDER_BY_ID.has(m[1]) ? m[1] : fieldId;
}

function ownerOf(section) {
  const m = /^co_(\d+)$/.exec(section);
  return m ? { type: "co", label: `Co-applicant ${Number(m[1]) + 1}` } : { type: "student", label: "Student" };
}

// Flatten every student's uploads into one list of documents.
function collectDocuments(students) {
  const docs = [];
  for (const s of students) {
    const base = { student: s, studentName: studentName(s), appId: getApplicationId(s) };
    for (const [section, fields] of Object.entries(s.uploads || {})) {
      if (!fields || typeof fields !== "object") continue;
      for (const [fieldId, info] of Object.entries(fields)) {
        const id = info?.id || info?.fileId;
        if (!id) continue;
        const owner = ownerOf(section);
        docs.push({
          ...base, id, name: info.name || info.fileName || fieldId,
          folder: FOLDER_BY_ID.get(baseFieldId(fieldId)) || "other",
          owner: owner.label, ownerType: owner.type,
        });
      }
    }
    if (s.sanctionLetter?.fileId) docs.push({ ...base, id: s.sanctionLetter.fileId, name: s.sanctionLetter.name || "Sanction_Letter.pdf", folder: "sanction_letters", owner: "Lender", ownerType: "lender" });
    if (s.summaryPdf?.id) docs.push({ ...base, id: s.summaryPdf.id, name: "Application_Form.pdf", folder: "application_form", owner: "Generated", ownerType: "generated" });
    if (s.eligibilityPdf?.id) docs.push({ ...base, id: s.eligibilityPdf.id, name: "Eligibility_Report.pdf", folder: "eligibility", owner: "Generated", ownerType: "generated" });
  }
  return docs.sort((a, b) => a.studentName.localeCompare(b.studentName) || a.owner.localeCompare(b.owner));
}

function matches(doc, q) {
  return !q || `${doc.studentName} ${doc.appId} ${doc.name} ${doc.student.email || ""} ${doc.student.phone || ""}`.toLowerCase().includes(q);
}

// Where a file goes inside a zip: "<Folder>/<Student> (<App ID>)[ - Co-applicant 1] - <file>"
function zipPath(doc, withFolder = true) {
  const who = `${doc.studentName} (${doc.appId})${doc.ownerType === "co" ? ` - ${doc.owner}` : ""}`;
  const folder = FOLDER_BY_KEY.get(doc.folder)?.label || "Other documents";
  return `${withFolder ? `${folder}/` : ""}${who} - ${doc.name}`;
}

function FileIcon({ name }) {
  const Icon = IMAGE_EXT.test(name) ? FileImage : FileText;
  return <span className={`dl-file-icon${IMAGE_EXT.test(name) ? " is-image" : ""}`} aria-hidden="true"><Icon size={16} /></span>;
}

export default function DocumentLibrary({ students }) {
  const [folderKey, setFolderKey] = useState(null);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("all");
  const [view, setView] = useState("files"); // "files" | "missing" inside a folder
  const [selected, setSelected] = useState(() => new Set());
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(null); // id of the file / "zip" being prepared
  const [error, setError] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  const allDocs = useMemo(() => collectDocuments(students), [students]);
  const q = query.trim().toLowerCase();
  const scoped = allDocs.filter((d) => (owner === "all" || d.ownerType === owner || (owner === "student" && ["generated", "lender"].includes(d.ownerType))) && matches(d, q));

  const folder = folderKey ? FOLDER_BY_KEY.get(folderKey) : null;
  const visible = folder ? scoped.filter((d) => d.folder === folderKey) : q ? scoped : [];
  const studentsWith = (key) => new Set(allDocs.filter((d) => d.folder === key && d.ownerType !== "co").map((d) => d.student));
  // Who should have this folder's document: everyone, or only some
  const expectedFor = (f) => (f.required ? students : f.expected ? students.filter(f.expected) : []);
  const tracksMissing = Boolean(folder?.required || folder?.expected);
  const missingStudents = tracksMissing
    ? expectedFor(folder).filter((s) => !studentsWith(folder.key).has(s) && matches({ studentName: studentName(s), appId: getApplicationId(s), name: "", student: s }, q))
    : [];

  const openFolder = (key) => {
    setFolderKey(key);
    setView("files");
    setSelected(new Set());
    setError("");
  };

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = visible.length > 0 && visible.every((d) => selected.has(d.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((d) => d.id)));

  const zip = async (docs, label) => {
    if (!docs.length) return;
    setBusy("zip");
    setError("");
    try {
      await downloadBundle(docs.map((d) => ({ id: d.id, path: zipPath(d, !folder) })), label);
    } catch (e) {
      setError(e.message || "Could not prepare the download.");
    } finally {
      setBusy(null);
    }
  };

  const downloadOne = async (doc) => {
    setBusy(doc.id);
    setError("");
    try {
      await downloadFile(doc.id);
    } catch (e) {
      setError(e.message || "Download failed.");
    } finally {
      setBusy(null);
    }
  };

  const zipLabel = (folder ? folder.label : "DocLocker search").replace(/[^\w]+/g, "_");
  const selectedDocs = visible.filter((d) => selected.has(d.id));
  const totalStudents = new Set(allDocs.map((d) => d.student)).size;
  // Empty folders stay out of the way unless asked for — except required
  // ones, where "nobody has uploaded this" is itself worth seeing.
  const folderCount = (key) => scoped.filter((d) => d.folder === key).length;
  const emptyCount = FOLDERS.filter((f) => !f.required && folderCount(f.key) === 0).length;
  const inUse = FOLDERS.filter((f) => folderCount(f.key) > 0).length;

  return (
    <div className="dl-page animate-fade-in">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="dl-toolbar">
        {folder ? (
          <nav className="dl-crumbs" aria-label="Breadcrumb">
            <button type="button" className="dl-back" onClick={() => openFolder(null)} aria-label="Back to all folders">
              <ArrowLeft size={18} />
            </button>
            <button type="button" className="dl-crumb" onClick={() => openFolder(null)}>All folders</button>
            <ChevronRight size={15} aria-hidden="true" className="dl-crumb-sep" />
            <span className="dl-crumb is-current" aria-current="page">{folder.label}</span>
          </nav>
        ) : (
          <div className="dl-summary">
            <p><strong>{allDocs.length}</strong> documents · <strong>{totalStudents}</strong> students · <strong>{inUse}</strong> folders in use</p>
            {emptyCount > 0 && (
              <button type="button" className="dl-link" aria-pressed={showEmpty} onClick={() => setShowEmpty((v) => !v)}>
                {showEmpty ? "Hide empty folders" : `Show ${emptyCount} empty folders`}
              </button>
            )}
          </div>
        )}
        <div className="dl-tools">
          <label className="dl-search">
            <span className="sr-only">Search documents</span>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              placeholder={folder ? `Search in ${folder.label}…` : "Search student, app ID or file…"}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(new Set()); }}
            />
            {query && (
              <button type="button" className="dl-search-clear" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>
            )}
          </label>
          <div className="dl-seg" role="group" aria-label="Whose documents">
            {[["all", "All"], ["student", "Students"], ["co", "Co-applicants"]].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`dl-seg-btn${owner === id ? " is-active" : ""}`}
                aria-pressed={owner === id}
                onClick={() => { setOwner(id); setSelected(new Set()); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="dl-error" role="alert">
          <AlertCircle size={16} /> {error}
          <button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button>
        </p>
      )}

      {/* ── Folder grid ─────────────────────────────────────────── */}
      {!folder && !q && GROUPS.map((g) => {
        const GroupIcon = g.icon;
        const folders = g.folders
          .map((f) => ({ ...f, docs: scoped.filter((d) => d.folder === f.key) }))
          .filter((f) => showEmpty || f.required || f.docs.length > 0 || (f.expected && students.some(f.expected)));
        const groupCount = folders.reduce((n, f) => n + f.docs.length, 0);
        if (!folders.length) return null;
        return (
          <section key={g.id} className={`dl-group dl-tone-${g.id}`} aria-labelledby={`dl-group-${g.id}`}>
            <header className="dl-group-head">
              <span className="dl-group-icon" aria-hidden="true"><GroupIcon size={16} /></span>
              <h2 id={`dl-group-${g.id}`}>{g.label}</h2>
              <span className="dl-group-count">{groupCount} files</span>
            </header>
            <div className="dl-folders">
              {folders.map((f) => {
                const people = new Set(f.docs.map((d) => d.student)).size;
                const expectedN = expectedFor(f).length;
                const coverage = (f.required || f.expected) && expectedN
                  ? Math.round((expectedFor(f).filter((s) => studentsWith(f.key).has(s)).length / expectedN) * 100)
                  : null;
                const empty = f.docs.length === 0;
                return (
                  <button
                    key={f.key}
                    type="button"
                    className={`dl-folder${empty ? " is-empty" : ""}`}
                    onClick={() => openFolder(f.key)}
                  >
                    <span className="dl-folder-icon" aria-hidden="true">{empty ? <Folder size={22} /> : <FolderOpen size={22} />}</span>
                    <span className="dl-folder-text">
                      <span className="dl-folder-name">{f.label}</span>
                      <span className="dl-folder-meta">
                        {empty ? "Empty" : `${f.docs.length} file${f.docs.length === 1 ? "" : "s"} · ${people} student${people === 1 ? "" : "s"}`}
                      </span>
                    </span>
                    {coverage !== null && (
                      <span className="dl-coverage" title={f.expected ? `${coverage}% of sanctioned and disbursed loans have their letter` : `${coverage}% of students have uploaded this`}>
                        <span className="dl-coverage-bar"><span style={{ width: `${coverage}%` }} /></span>
                        <span className="dl-coverage-pct">{coverage}%</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* ── Folder / search results ─────────────────────────────── */}
      {(folder || q) && (
        <section className="dl-files" aria-label={folder ? folder.label : "Search results"}>
          <header className="dl-files-head">
            <div className="dl-files-title">
              <span className={`dl-folder-icon dl-tone-${folder?.group || "other"}`} aria-hidden="true">
                {folder ? <FolderOpen size={22} /> : <Search size={20} />}
              </span>
              <div>
                <h2>{folder ? folder.label : `Results for “${query.trim()}”`}</h2>
                <p>
                  {visible.length} file{visible.length === 1 ? "" : "s"}
                  {" · "}{new Set(visible.map((d) => d.student)).size} students
                  {tracksMissing && ` · ${missingStudents.length} missing`}
                </p>
              </div>
            </div>
            <div className="dl-files-actions">
              {selectedDocs.length > 0 ? (
                <>
                  <button type="button" className="dl-btn" onClick={() => setSelected(new Set())}>Clear ({selectedDocs.length})</button>
                  <button type="button" className="dl-btn dl-btn--primary" disabled={busy === "zip"} onClick={() => zip(selectedDocs, `${zipLabel}_selected`)}>
                    {busy === "zip" ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
                    Download selected ({selectedDocs.length})
                  </button>
                </>
              ) : (
                <button type="button" className="dl-btn dl-btn--primary" disabled={!visible.length || busy === "zip"} onClick={() => zip(visible, zipLabel)}>
                  {busy === "zip" ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
                  Download all as ZIP
                </button>
              )}
            </div>
          </header>

          {tracksMissing && (
            <div className="dl-tabs" role="tablist" aria-label="Show">
              <button type="button" role="tab" aria-selected={view === "files"} className={`dl-tab${view === "files" ? " is-active" : ""}`} onClick={() => setView("files")}>
                <FileText size={15} /> Uploaded <span>{visible.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={view === "missing"} className={`dl-tab${view === "missing" ? " is-active" : ""}`} onClick={() => setView("missing")}>
                <UserX size={15} /> Missing <span>{missingStudents.length}</span>
              </button>
            </div>
          )}

          {view === "missing" && tracksMissing ? (
            missingStudents.length === 0 ? (
              <div className="dl-empty"><Users size={26} /><p>{folder.expected ? "Every sanctioned and disbursed loan has its sanction letter." : `Every student has uploaded their ${folder.label}.`}</p></div>
            ) : (
              <ul className="dl-missing">
                {missingStudents.map((s) => (
                  <li key={getApplicationId(s) + studentName(s)}>
                    <span className="dl-avatar" aria-hidden="true">{initials(studentName(s))}</span>
                    <span className="dl-person">
                      <span className="dl-person-name">{studentName(s)}</span>
                      <span className="dl-person-sub">{getApplicationId(s)} · {s.email || s.phone || "No contact"}</span>
                    </span>
                    <span className="dl-person-advisor">{folder.expected ? (s.loanStatus === "disbursed" ? "Disbursed" : "Sanctioned") : s.advisor || "No advisor"}</span>
                  </li>
                ))}
              </ul>
            )
          ) : visible.length === 0 ? (
            <div className="dl-empty"><FolderOpen size={26} /><p>{q ? "No documents match your search." : "No documents in this folder yet."}</p></div>
          ) : (
            <div className="dl-table" role="table" aria-label="Documents">
              <div className="dl-row dl-row--head" role="row">
                <span role="columnheader" className="dl-cell-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all documents" />
                </span>
                <span role="columnheader">Document</span>
                <span role="columnheader">Student</span>
                {!folder && <span role="columnheader">Folder</span>}
                <span role="columnheader" className="dl-cell-actions">Actions</span>
              </div>
              {visible.map((d) => (
                <div key={d.id} role="row" className={`dl-row${selected.has(d.id) ? " is-selected" : ""}${!folder ? " dl-row--wide" : ""}`}>
                  <span role="cell" className="dl-cell-check">
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.name}`} />
                  </span>
                  <span role="cell" className="dl-doc">
                    <FileIcon name={d.name} />
                    <span className="dl-doc-text">
                      <span className="dl-doc-name" title={d.name}>{d.name}</span>
                      <span className={`dl-owner dl-owner--${d.ownerType}`}>{d.owner}</span>
                    </span>
                  </span>
                  <span role="cell" className="dl-student">
                    <span className="dl-avatar" aria-hidden="true">{initials(d.studentName)}</span>
                    <span className="dl-person">
                      <span className="dl-person-name">{d.studentName}</span>
                      <span className="dl-person-sub">{d.appId}</span>
                    </span>
                  </span>
                  {!folder && (
                    <span role="cell" className="dl-cell-folder">
                      <button type="button" className="dl-folder-link" onClick={() => openFolder(d.folder)}>
                        {FOLDER_BY_KEY.get(d.folder)?.label}
                      </button>
                    </span>
                  )}
                  <span role="cell" className="dl-cell-actions">
                    <button type="button" className="dl-icon-btn" onClick={() => setViewing(d)} aria-label={`View ${d.name}`} title="View">
                      <Eye size={17} />
                    </button>
                    <button type="button" className="dl-icon-btn" disabled={busy === d.id} onClick={() => downloadOne(d)} aria-label={`Download ${d.name}`} title="Download">
                      {busy === d.id ? <RefreshCw size={16} className="spin" /> : <Download size={17} />}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {viewing && (
        <DocumentViewer
          file={{ id: viewing.id, name: viewing.name }}
          files={visible.map((d) => ({ id: d.id, name: d.name }))}
          subtitle={[viewing.studentName, viewing.appId, FOLDER_BY_KEY.get(viewing.folder)?.label, viewing.ownerType === "co" ? viewing.owner : null].filter(Boolean).join(" · ")}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
