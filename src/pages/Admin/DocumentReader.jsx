import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  IdCard,
  Fingerprint,
  CreditCard,
  Upload,
  FileText,
  FileImage,
  X,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Info,
  Copy,
  CopyCheck,
  ScanSearch,
  Timer,
  ShieldCheck,
  ListChecks,
  ScanLine,
} from "lucide-react";
import { extractDocument } from "../../utils/driveApi";
import "./DocumentReader.css";

const MAX_BYTES = 25 * 1024 * 1024;

const DOC_TYPES = [
  {
    id: "ssc",
    label: "10th Certificate",
    hint: "SSC marks memo (TS / AP)",
    icon: BookOpen,
    maxFiles: 1,
    filesHint: "Exactly 1 file",
    accept: ".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp",
  },
  {
    id: "certificate",
    label: "12th Certificate",
    hint: "Intermediate marks memo (TS / AP)",
    icon: GraduationCap,
    maxFiles: 1,
    filesHint: "Exactly 1 file",
    accept: ".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp",
  },
  {
    id: "passport",
    label: "Passport",
    hint: "Photo page + last page",
    icon: IdCard,
    maxFiles: 4,
    filesHint: "Up to 4 files",
    accept: ".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp",
  },
  {
    id: "aadhaar",
    label: "Aadhaar",
    hint: "Front + back",
    icon: Fingerprint,
    maxFiles: 4,
    filesHint: "Up to 4 files",
    accept: ".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp",
  },
  {
    id: "pan",
    label: "PAN Card",
    hint: "Front side",
    icon: CreditCard,
    maxFiles: 4,
    filesHint: "Up to 4 files",
    accept: ".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp",
  },
];

// What the reader checks on each type, in plain words. Mirrors the
// checks VerificationChips reports once a scan comes back.
const TYPE_CHECKS = {
  ssc: ["Board, student and parents' names", "Every subject's grade or marks", "CGPA checked against the grade points", "Tilted photos straightened first"],
  certificate: ["TS / AP Intermediate memos", "Every subject and paper", "Total marks and percentage", "Result and CGPA"],
  passport: ["Photo page and address page", "MRZ check digits verified", "Issue and expiry dates", "Parents' and spouse's names"],
  aadhaar: ["Front and back of the card", "Aadhaar number check digit", "Address and PIN code", "Full number only with consent"],
  pan: ["PAN number and holder type", "Surname letter matched to the PAN", "Name and father's name", "Date of birth"],
};

// Grid order per type, plus the one long free-text field (if any) that
// gets a full-width cell instead of being squeezed into the grid.
const FIELD_KEYS = {
  certificate: { grid: ["document_type", "state", "board", "student_name", "father_name", "mother_name",
    "hall_ticket_number", "year_of_pass", "month_of_pass", "course", "group", "medium"] },
  ssc: { grid: ["board", "student_name", "father_name", "mother_name", "date_of_birth",
    "roll_number", "exam", "medium", "appearance"], wide: "school" },
  passport: { grid: ["passport_number", "surname", "given_names", "nationality", "sex", "date_of_birth",
    "place_of_birth", "place_of_issue", "date_of_issue", "date_of_expiry", "file_number",
    "father_name", "mother_name", "spouse_name"], wide: "address" },
  aadhaar: { grid: ["aadhaar_number", "name", "date_of_birth", "gender", "care_of", "relation", "pincode"], wide: "address" },
  pan: { grid: ["pan_number", "name", "father_name", "date_of_birth"] },
};
const fieldKeysFor = (kind) => {
  const k = FIELD_KEYS[kind] || FIELD_KEYS.pan;
  return k.wide ? [...k.grid, k.wide] : k.grid;
};
const isEmpty = (v) => v === null || v === undefined || v === "";

const FIELD_LABELS = {
  document_type: "Document Type", state: "State", board: "Board",
  student_name: "Student Name", father_name: "Father's Name", mother_name: "Mother's Name",
  hall_ticket_number: "Hall Ticket No.", year_of_pass: "Year of Pass", month_of_pass: "Month of Pass",
  course: "Course", group: "Group", medium: "Medium of Instruction",
  total_marks: "Total Marks", maximum_marks: "Maximum Marks", percentage: "Percentage",
  result: "Result", cgpa: "CGPA", notes: "Notes",
  passport_number: "Passport Number", surname: "Surname", given_names: "Given Names",
  nationality: "Nationality", sex: "Sex", date_of_birth: "Date of Birth",
  place_of_birth: "Place of Birth", place_of_issue: "Place of Issue",
  date_of_issue: "Date of Issue", date_of_expiry: "Date of Expiry",
  spouse_name: "Spouse's Name", address: "Address", file_number: "File Number",
  aadhaar_number: "Aadhaar Number", name: "Name", gender: "Gender",
  care_of: "Care Of", relation: "Relation", pincode: "PIN Code",
  pan_number: "PAN Number",
  roll_number: "Roll Number", school: "School", exam: "Examination",
  appearance: "Appeared As", result_type: "Result Type", subjects: "Subjects",
};

function labelFor(key) {
  return FIELD_LABELS[key] || key.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const REVIEW_CONFIG = {
  auto: {
    icon: CheckCircle, tone: "success",
    title: "Looks good — no review needed",
    sub: "Every field passed its automatic checks.",
  },
  review_recommended: {
    icon: AlertTriangle, tone: "warning",
    title: "Review recommended",
    sub: "Safe to accept, but double-check the flagged fields below.",
  },
  manual_required: {
    icon: AlertCircle, tone: "danger",
    title: "Manual verification required",
    sub: "A key field is missing or failed a check — a person needs to verify this.",
  },
};

function ReviewBanner({ review }) {
  if (!review) return null;
  const cfg = REVIEW_CONFIG[review.status] || { icon: Info, tone: "slate", title: review.status, sub: "" };
  const Icon = cfg.icon;
  const flagged = review.fields_requiring_review || [];
  return (
    <div className={`docr-review docr-review--${cfg.tone}`}>
      <div className="docr-review-head">
        <span className="docr-review-icon"><Icon size={17} /></span>
        <div>
          <p className="docr-review-title">{cfg.title}</p>
          {cfg.sub && <p className="docr-review-sub">{cfg.sub}</p>}
        </div>
      </div>
      {flagged.length > 0 && (
        <ul className="docr-review-flags">
          {flagged.map((f) => (
            <li key={f}>
              <strong>{labelFor(f)}</strong>
              {review.reasons?.[f] && <span> — {review.reasons[f]}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function verificationChips(kind, full) {
  const chips = [];
  if (kind === "certificate" && full && full.supported === false) {
    chips.push({ ok: false, label: "Doesn't look like a supported TS/AP Intermediate certificate" });
  }
  if (kind === "ssc" && full) {
    if (full.document_type && full.document_type !== "ssc") {
      chips.push({ ok: false, label: "Doesn't look like a TS/AP 10th (SSC) certificate" });
    }
    const c = full.checks || {};
    if (typeof c.cgpa_matches_grade_points === "boolean") {
      chips.push({
        ok: c.cgpa_matches_grade_points,
        label: c.cgpa_matches_grade_points ? "CGPA matches the subject grade points" : "CGPA doesn't match the subject grade points",
      });
    }
    if (typeof c.total_matches_subjects === "boolean") {
      chips.push({
        ok: c.total_matches_subjects,
        label: c.total_matches_subjects ? "Total matches the subject marks" : "Total doesn't match the subject marks",
      });
    }
    if (c.tilt_corrected) chips.push({ ok: null, label: "Photo was tilted — straightened before reading" });
  }
  if (kind === "passport" && typeof full?.mrz_valid === "boolean") {
    chips.push({ ok: full.mrz_valid, label: full.mrz_valid ? "MRZ check digits verified" : "MRZ check failed" });
  }
  if (kind === "aadhaar" && full?.checks) {
    const v = full.checks.number_check_digit;
    if (v === "masked on the document") chips.push({ ok: null, label: "Number masked — check digit unavailable" });
    else if (typeof v === "boolean") chips.push({ ok: v, label: v ? "Aadhaar number verified" : "Aadhaar number check failed" });
  }
  if (kind === "pan" && full?.checks) {
    if (full.checks.holder_type) chips.push({ ok: null, label: `Holder type: ${full.checks.holder_type}` });
    if (typeof full.checks.surname_letter_matches === "boolean") {
      chips.push({
        ok: full.checks.surname_letter_matches,
        label: full.checks.surname_letter_matches ? "Surname letter matches PAN" : "Surname letter mismatch",
      });
    }
  }
  return chips;
}

function VerificationChips({ chips }) {
  if (chips.length === 0) return null;
  return (
    <div className="docr-chips">
      {chips.map((c, i) => (
        <span key={i} className={`docr-chip docr-chip--${c.ok === true ? "ok" : c.ok === false ? "bad" : "neutral"}`}>
          {c.ok === true ? <CheckCircle size={12} /> : c.ok === false ? <XCircle size={12} /> : <Info size={12} />}
          {c.label}
        </span>
      ))}
    </div>
  );
}

function InfoCell({ label, value, wide, flagged }) {
  const empty = isEmpty(value);
  return (
    <div className={`docr-field${wide ? " docr-cell-wide" : ""}${flagged ? " is-flagged" : ""}${empty ? " is-empty" : ""}`}>
      <div className="docr-field-label">
        {label}
        {flagged && <span className="docr-field-flag"><AlertTriangle size={11} /> Check</span>}
      </div>
      <div className="docr-field-value">{empty ? "Not found" : String(value)}</div>
    </div>
  );
}

function SubjectsTable({ subjects }) {
  if (!subjects || subjects.length === 0) return null;
  return (
    <div className="docr-table-wrap">
      <table className="docr-table">
        <thead>
          <tr><th>Subject</th><th>Paper</th><th>Marks</th><th>Max</th></tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => (
            <tr key={i}>
              <td>{s.subject_name || "—"}</td>
              <td>{s.paper || "—"}</td>
              <td>{s.marks ?? "—"}</td>
              <td>{s.maximum_marks ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 10th subjects: graded memos (CGPA era) show grade + grade point,
// older/marks memos show marks out of 100. Language papers carry the
// actual language in `subject` (e.g. "First Language (Telugu)").
function SscSubjectsTable({ subjects, graded }) {
  if (!subjects || subjects.length === 0) return null;
  return (
    <div className="docr-table-wrap">
      <table className="docr-table">
        <thead>
          <tr>
            <th>Subject</th>
            {graded ? <><th>Grade</th><th>Grade Point</th></> : <><th>Marks</th><th>Max</th></>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => {
            const isLanguage = /^L\d$/.test(s.area || "");
            const name = isLanguage && s.subject ? `${s.area_name} (${s.subject})` : (s.area_name || s.subject || "—");
            const flagged = s.review && s.review !== "auto";
            return (
              <tr key={i} className={flagged ? "docr-row-flagged" : undefined}>
                <td>{name}</td>
                {graded
                  ? <><td>{s.grade ?? "—"}</td><td>{s.grade_point ?? "—"}</td></>
                  : <><td>{s.marks ?? "—"}</td><td>100</td></>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FieldDetailTable({ fields }) {
  const entries = Object.entries(fields || {}).filter(([, v]) => v && typeof v === "object");
  if (entries.length === 0) return null;
  return (
    <div className="docr-table-wrap">
      <table className="docr-table docr-detail-table">
        <thead>
          <tr><th>Field</th><th>Value</th><th>Confidence</th><th>Verified</th><th>Source</th></tr>
        </thead>
        <tbody>
          {entries.map(([key, f]) => (
            <tr key={key}>
              <td>{labelFor(key)}</td>
              <td>{f.value || <span className="info-value empty">—</span>}</td>
              <td>
                {typeof f.confidence === "number" ? (
                  <span className={`docr-conf docr-conf--${f.confidence >= 0.9 ? "high" : f.confidence >= 0.7 ? "mid" : "low"}`}>
                    {Math.round(f.confidence * 100)}%
                  </span>
                ) : "—"}
              </td>
              <td>
                {f.verified === true ? (
                  <span className="docr-verified docr-verified--yes"><CheckCircle size={12} /> Verified</span>
                ) : f.verified === false ? (
                  <span className="docr-verified docr-verified--no">Unverified</span>
                ) : "—"}
              </td>
              <td className="docr-source">{f.source || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Field layout per doc type (FIELD_KEYS), then each type's own extras:
// subject tables and the result summary for certificates.
function ExtractedFields({ kind, flat, flagged }) {
  const keys = FIELD_KEYS[kind] || FIELD_KEYS.pan;
  const grid = (
    <div className="docr-grid">
      {keys.grid.map((k) => <InfoCell key={k} label={labelFor(k)} value={flat[k]} flagged={flagged.has(k)} />)}
      {keys.wide && <InfoCell label={labelFor(keys.wide)} value={flat[keys.wide]} wide flagged={flagged.has(keys.wide)} />}
    </div>
  );

  if (kind === "certificate") {
    return (
      <>
        {grid}
        <SubjectsTable subjects={flat.subjects} />
        <div className="docr-result-strip">
          <div className="docr-result-item">
            <span className="docr-result-label">Total Marks</span>
            <span className="docr-result-value">
              {flat.total_marks != null && flat.maximum_marks != null ? `${flat.total_marks} / ${flat.maximum_marks}` : "—"}
            </span>
          </div>
          <div className="docr-result-item">
            <span className="docr-result-label">Percentage</span>
            <span className="docr-result-value">{flat.percentage != null ? `${flat.percentage}%` : "—"}</span>
          </div>
          <div className="docr-result-item">
            <span className="docr-result-label">Result</span>
            <span className="docr-result-value">{flat.result || "—"}</span>
          </div>
          {flat.cgpa != null && (
            <div className="docr-result-item">
              <span className="docr-result-label">CGPA</span>
              <span className="docr-result-value">{flat.cgpa}</span>
            </div>
          )}
        </div>
        {flat.notes && <p className="docr-notes">{flat.notes}</p>}
      </>
    );
  }

  if (kind === "ssc") {
    const graded = flat.result_type === "grades";
    return (
      <>
        {grid}
        <SscSubjectsTable subjects={flat.subjects} graded={graded} />
        <div className="docr-result-strip">
          {graded ? (
            <div className="docr-result-item">
              <span className="docr-result-label">CGPA</span>
              <span className="docr-result-value">{flat.cgpa != null ? `${Number(flat.cgpa).toFixed(1)} / 10` : "—"}</span>
            </div>
          ) : (
            <>
              <div className="docr-result-item">
                <span className="docr-result-label">Total Marks</span>
                <span className="docr-result-value">
                  {flat.total_marks != null ? `${flat.total_marks}${flat.maximum_marks != null ? ` / ${flat.maximum_marks}` : ""}` : "—"}
                </span>
              </div>
              <div className="docr-result-item">
                <span className="docr-result-label">Percentage</span>
                <span className="docr-result-value">{flat.percentage != null ? `${flat.percentage}%` : "—"}</span>
              </div>
            </>
          )}
          <div className="docr-result-item">
            <span className="docr-result-label">Subjects Read</span>
            <span className="docr-result-value">{(flat.subjects || []).length || "—"}</span>
          </div>
        </div>
      </>
    );
  }

  return grid;
}

function DocTypeTile({ type, active, onSelect }) {
  const Icon = type.icon;
  return (
    <button type="button" className={`docr-type-tile${active ? " active" : ""}`} aria-pressed={active} onClick={onSelect}>
      <span className="docr-type-icon" aria-hidden="true"><Icon size={18} /></span>
      <span className="docr-type-text">
        <span className="docr-type-label">{type.label}</span>
        <span className="docr-type-hint">{type.hint}</span>
      </span>
      <span className="docr-type-files">{type.filesHint}</span>
    </button>
  );
}

function FileRow({ file, onRemove }) {
  const isImage = (file.type || "").startsWith("image/");
  const Icon = isImage ? FileImage : FileText;
  return (
    <div className="docr-file-row">
      <span className="docr-file-icon" aria-hidden="true"><Icon size={15} /></span>
      <span className="docr-file-name">{file.name}</span>
      <span className="docr-file-size">{fmtBytes(file.size)}</span>
      <button type="button" className="docr-file-remove" onClick={onRemove} aria-label={`Remove ${file.name}`}>
        <X size={13} />
      </button>
    </div>
  );
}

export default function DocumentReader() {
  const [docType, setDocType] = useState("certificate");
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  const activeType = DOC_TYPES.find((t) => t.id === docType) || DOC_TYPES[0];

  useEffect(() => {
    if (!loading) return undefined;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const selectType = (id) => {
    if (id === docType) return;
    setDocType(id);
    setFiles([]);
    setError("");
    setResult(null);
    setConsent(false);
  };

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    const oversize = incoming.filter((f) => f.size > MAX_BYTES).length;
    const sized = incoming.filter((f) => f.size <= MAX_BYTES);
    setFiles((prev) => {
      const room = activeType.maxFiles - prev.length;
      if (room <= 0) return prev;
      return [...prev, ...sized.slice(0, room)];
    });
    const overflow = Math.max(0, files.length + sized.length - activeType.maxFiles);
    if (oversize > 0) {
      setError(`${oversize} file${oversize > 1 ? "s were" : " was"} over 25 MB and skipped.`);
    } else if (overflow > 0) {
      setError(`${activeType.label} accepts at most ${activeType.maxFiles} file${activeType.maxFiles === 1 ? "" : "s"} — extra file${overflow > 1 ? "s" : ""} skipped.`);
    } else {
      setError("");
    }
  };

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleExtract = async () => {
    if (files.length === 0) { setError("Add at least one file first."); return; }
    setError("");
    setResult(null);
    setLoading(true);
    setElapsed(0);
    try {
      const r = await extractDocument(docType, files, { consent: docType === "aadhaar" && consent });
      setResult(r);
    } catch (e) {
      setError(e.message || "Extraction failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError("");
    setFiles([]);
    setShowDetail(false);
  };

  const handleCopy = async () => {
    if (!result?.flat) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.flat, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable — silently ignore, the button just won't confirm */ }
  };

  const kind = result?.kind || docType;
  const flat = result?.flat || {};
  const review = result?.full?.review;
  const flagged = new Set(review?.fields_requiring_review || []);
  const chips = result ? verificationChips(kind, result.full) : [];
  const resultKeys = fieldKeysFor(kind);
  const filled = resultKeys.filter((k) => !isEmpty(flat[k])).length;
  const passed = chips.filter((c) => c.ok === true).length;
  const judged = chips.filter((c) => c.ok !== null).length;
  const resultStats = [
    { key: "read", label: "Fields read", value: `${filled}/${resultKeys.length}`, tone: "blue" },
    { key: "checks", label: "Checks passed", value: judged ? `${passed}/${judged}` : "—", tone: judged && passed === judged ? "green" : judged ? "red" : "blue" },
    { key: "review", label: "To review", value: flagged.size, tone: flagged.size ? "gold" : "green" },
    { key: "time", label: "Read in", value: result?.seconds != null ? `${result.seconds}s` : "—", tone: "blue" },
  ];
  const ActiveIcon = activeType.icon;
  const full = files.length >= activeType.maxFiles;

  return (
    <div className="docr-page dh animate-fade-in">
      {/* ── 1. What you're reading ─────────────────────────────── */}
      <section className="docr-card docr-types" aria-labelledby="docr-step1">
        <header className="docr-card-head">
          <span className="docr-step" aria-hidden="true">1</span>
          <div>
            <h2 id="docr-step1" className="docr-card-title">Choose what you're reading</h2>
            <p className="docr-card-sub">Each document has its own reader and its own checks</p>
          </div>
        </header>
        <div className="docr-type-grid">
          {DOC_TYPES.map((t) => (
            <DocTypeTile key={t.id} type={t} active={t.id === docType} onSelect={() => selectType(t.id)} />
          ))}
        </div>
      </section>

      <div className="docr-layout">
        {/* ── 2. Add the files ───────────────────────────────────── */}
        <section className="docr-card docr-upload-panel" aria-labelledby="docr-step2">
          <header className="docr-card-head">
            <span className="docr-step" aria-hidden="true">2</span>
            <div>
              <h2 id="docr-step2" className="docr-card-title">Add the {activeType.label}</h2>
              <p className="docr-card-sub">{activeType.hint} · {activeType.filesHint.toLowerCase()}</p>
            </div>
          </header>

          <div
            className={`docr-dropzone${dragging ? " dragging" : ""}${full ? " full" : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (!full) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            onClick={() => !full && inputRef.current?.click()}
          >
            <span className="docr-dropzone-icon" aria-hidden="true">{full ? <CheckCircle size={20} /> : <Upload size={20} />}</span>
            <span className="docr-dropzone-main">
              {full
                ? `${activeType.maxFiles} of ${activeType.maxFiles} file${activeType.maxFiles === 1 ? "" : "s"} added`
                : <>Drop file{activeType.maxFiles > 1 ? "s" : ""} here or <strong>browse</strong></>}
            </span>
            <span className="docr-dropzone-note">PDF, JPG, PNG, TIFF, BMP or WEBP · up to 25 MB each</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={activeType.accept}
            multiple={activeType.maxFiles > 1}
            style={{ display: "none" }}
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />

          {files.length > 0 && (
            <div className="docr-file-list">
              {files.map((f, i) => (
                <FileRow key={`${f.name}-${i}`} file={f} onRemove={() => removeFile(i)} />
              ))}
            </div>
          )}

          {docType === "aadhaar" && (
            <label className="docr-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I have the holder's consent to reveal the full Aadhaar number</span>
            </label>
          )}

          {error && (
            <div className="docr-error" role="alert">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button type="button" className="adm-btn adm-btn--primary docr-extract-btn" onClick={handleExtract} disabled={loading || files.length === 0}>
            {loading ? <><RefreshCw size={15} className="spin" /> Reading… {elapsed}s</> : <><ScanSearch size={16} /> Read {activeType.label}</>}
          </button>
          <p className="docr-timing-note"><Timer size={12} /> Usually 3–15 seconds per document</p>

          <div className="docr-checks">
            <p className="docr-checks-title"><ListChecks size={14} aria-hidden="true" /> What we check on a {activeType.label}</p>
            <ul>
              {(TYPE_CHECKS[docType] || []).map((c) => <li key={c}><CheckCircle size={13} aria-hidden="true" /> {c}</li>)}
            </ul>
          </div>
        </section>

        {/* ── 3. The result ─────────────────────────────────────── */}
        <section className="docr-card docr-results-panel" aria-labelledby="docr-step3" aria-live="polite">
          <header className="docr-card-head">
            <span className="docr-step" aria-hidden="true">3</span>
            <div>
              <h2 id="docr-step3" className="docr-card-title">Check what was read</h2>
              <p className="docr-card-sub">Fields marked <strong>Check</strong> need a person to confirm them</p>
            </div>
            {result && !loading && (
              <div className="docr-result-head-actions">
                <button type="button" className="docr-btn" onClick={handleCopy}>
                  {copied ? <><CopyCheck size={13} /> Copied</> : <><Copy size={13} /> Copy data</>}
                </button>
                <button type="button" className="docr-btn" onClick={handleReset}>
                  <RefreshCw size={13} /> Scan another
                </button>
              </div>
            )}
          </header>

          {!result && !loading && (
            <div className="docr-empty">
              <span className="docr-empty-icon" aria-hidden="true"><ActiveIcon size={26} /></span>
              <h3>Nothing read yet</h3>
              <p>Add the {activeType.label.toLowerCase()} and press <strong>Read</strong>. These fields come back here:</p>
              <ul className="docr-empty-fields">
                {fieldKeysFor(docType).map((k) => <li key={k}>{labelFor(k)}</li>)}
              </ul>
            </div>
          )}

          {loading && (
            <div className="docr-empty docr-empty--loading">
              <span className="docr-scan" aria-hidden="true"><span className="docr-scan-doc"><i /><i /><i /><i /></span><span className="docr-scan-line" /></span>
              <h3>Reading the {activeType.label.toLowerCase()}…</h3>
              <p>{elapsed}s so far. Certificates and large passport scans take the longest.</p>
            </div>
          )}

          {result && !loading && (
            <div className="docr-result animate-fade-in">
              <div className="docr-result-head">
                {result.preview
                  ? <img src={result.preview} alt="" className="docr-preview" />
                  : <span className="docr-preview docr-preview--icon" aria-hidden="true"><ScanLine size={24} /></span>}
                <div className="docr-result-head-info">
                  <span className="docr-result-kind">{(DOC_TYPES.find((t) => t.id === kind) || activeType).label}</span>
                  <span className="docr-result-file">{result.file}</span>
                </div>
              </div>

              <dl className="docr-stats">
                {resultStats.map((st) => (
                  <div key={st.key} className={`docr-stat is-${st.tone}`}>
                    <dt>{st.label}</dt>
                    <dd>{st.value}</dd>
                  </div>
                ))}
              </dl>

              <VerificationChips chips={chips} />
              <ReviewBanner review={review} />

              <ExtractedFields kind={kind} flat={flat} flagged={flagged} />

              {result.full?.fields && (
                <div className="docr-detail-toggle-wrap">
                  <button type="button" className="docr-detail-toggle" aria-expanded={showDetail} onClick={() => setShowDetail((v) => !v)}>
                    <ShieldCheck size={14} aria-hidden="true" /> {showDetail ? "Hide" : "Show"} how each field was verified
                  </button>
                  {showDetail && <FieldDetailTable fields={result.full.fields} />}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
