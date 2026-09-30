import { useEffect, useRef, useState } from "react";
import {
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
} from "lucide-react";
import { extractDocument } from "../../utils/driveApi";
import "./DocumentReader.css";

const MAX_BYTES = 25 * 1024 * 1024;

const DOC_TYPES = [
  {
    id: "certificate",
    label: "Certificate",
    hint: "12th / Intermediate marks memo",
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

function VerificationChips({ kind, full }) {
  const chips = [];
  if (kind === "certificate" && full && full.supported === false) {
    chips.push({ ok: false, label: "Doesn't look like a supported TS/AP Intermediate certificate" });
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

function InfoCell({ label, value, wide }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={`info-cell${wide ? " docr-cell-wide" : ""}`}>
      <div className="info-label">{label}</div>
      <div className={`info-value${empty ? " empty" : ""}`}>{empty ? "—" : String(value)}</div>
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

// Field layout per doc type — a curated grid order plus which key (if any)
// gets shown as a full-width cell (long free-text like an address) instead
// of being squeezed into the regular grid.
function ExtractedFields({ kind, flat }) {
  if (kind === "certificate") {
    const gridKeys = ["document_type", "state", "board", "student_name", "father_name", "mother_name",
      "hall_ticket_number", "year_of_pass", "month_of_pass", "course", "group", "medium"];
    return (
      <>
        <div className="info-grid docr-grid">
          {gridKeys.map((k) => <InfoCell key={k} label={labelFor(k)} value={flat[k]} />)}
        </div>
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

  if (kind === "passport") {
    const gridKeys = ["passport_number", "surname", "given_names", "nationality", "sex", "date_of_birth",
      "place_of_birth", "place_of_issue", "date_of_issue", "date_of_expiry", "file_number",
      "father_name", "mother_name", "spouse_name"];
    return (
      <div className="info-grid docr-grid">
        {gridKeys.map((k) => <InfoCell key={k} label={labelFor(k)} value={flat[k]} />)}
        <InfoCell label={labelFor("address")} value={flat.address} wide />
      </div>
    );
  }

  if (kind === "aadhaar") {
    const gridKeys = ["aadhaar_number", "name", "date_of_birth", "gender", "care_of", "relation", "pincode"];
    return (
      <div className="info-grid docr-grid">
        {gridKeys.map((k) => <InfoCell key={k} label={labelFor(k)} value={flat[k]} />)}
        <InfoCell label={labelFor("address")} value={flat.address} wide />
      </div>
    );
  }

  // pan
  const gridKeys = ["pan_number", "name", "father_name", "date_of_birth"];
  return (
    <div className="info-grid docr-grid">
      {gridKeys.map((k) => <InfoCell key={k} label={labelFor(k)} value={flat[k]} />)}
    </div>
  );
}

function DocTypeTile({ type, active, onSelect }) {
  const Icon = type.icon;
  return (
    <button type="button" className={`docr-type-tile${active ? " active" : ""}`} onClick={onSelect}>
      <span className="docr-type-icon"><Icon size={20} /></span>
      <span className="docr-type-label">{type.label}</span>
      <span className="docr-type-hint">{type.hint}</span>
      <span className="docr-type-files">{type.filesHint}</span>
    </button>
  );
}

function FileRow({ file, onRemove }) {
  const isImage = (file.type || "").startsWith("image/");
  const Icon = isImage ? FileImage : FileText;
  return (
    <div className="docr-file-row">
      <Icon size={15} />
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

  return (
    <div className="docr-page animate-fade-in">
      <div className="docr-layout">
        {/* ── Left: upload panel ─────────────────────────────────── */}
        <div className="docr-upload-panel">
          <div className="docr-panel-section">
            <p className="docr-step-label">1. Choose document type</p>
            <div className="docr-type-grid">
              {DOC_TYPES.map((t) => (
                <DocTypeTile key={t.id} type={t} active={t.id === docType} onSelect={() => selectType(t.id)} />
              ))}
            </div>
          </div>

          <div className="docr-panel-section">
            <p className="docr-step-label">2. Upload {activeType.filesHint.toLowerCase()}</p>
            <div
              className={`docr-dropzone${dragging ? " dragging" : ""}${files.length >= activeType.maxFiles ? " full" : ""}`}
              onDragOver={(e) => { e.preventDefault(); if (files.length < activeType.maxFiles) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              onClick={() => files.length < activeType.maxFiles && inputRef.current?.click()}
            >
              <Upload size={20} />
              <span>
                {files.length >= activeType.maxFiles
                  ? `${activeType.maxFiles} of ${activeType.maxFiles} files added`
                  : <>Drop file{activeType.maxFiles > 1 ? "s" : ""} here or <strong>click to browse</strong></>}
              </span>
              <span className="docr-dropzone-note">PDF, JPG, PNG, TIFF, BMP or WEBP · max 25 MB each</span>
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
          </div>

          {error && (
            <div className="docr-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button type="button" className="btn btn-primary docr-extract-btn" onClick={handleExtract} disabled={loading || files.length === 0}>
            {loading ? <><RefreshCw size={15} className="spin" /> Reading document… {elapsed}s</> : <><ScanSearch size={16} /> Extract Document</>}
          </button>
          <p className="docr-timing-note"><Timer size={11} /> Usually 3–15 seconds per document</p>
        </div>

        {/* ── Right: results panel ───────────────────────────────── */}
        <div className="docr-results-panel">
          {!result && !loading && (
            <div className="admin-empty">
              <div className="admin-empty-icon"><ScanSearch size={30} /></div>
              <h3>Nothing scanned yet</h3>
              <p>Choose a document type, add a file, and hit Extract to see the structured data here.</p>
            </div>
          )}

          {loading && (
            <div className="admin-empty">
              <div className="loading-dots"><span /><span /><span /></div>
              <h3>Reading document…</h3>
              <p>{elapsed}s elapsed — the certificate model and large passport scans take the longest.</p>
            </div>
          )}

          {result && !loading && (
            <div className="docr-result animate-fade-in">
              <div className="docr-result-head">
                {result.preview && <img src={result.preview} alt="" className="docr-preview" />}
                <div className="docr-result-head-info">
                  <span className="docr-result-kind">{(result.kind || docType).toUpperCase()}</span>
                  <span className="docr-result-file">{result.file}</span>
                  <span className="docr-result-seconds">Processed in {result.seconds != null ? `${result.seconds}s` : "—"}</span>
                </div>
                <div className="docr-result-head-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopy}>
                    {copied ? <><CopyCheck size={13} /> Copied</> : <><Copy size={13} /> Copy Data</>}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>
                    <RefreshCw size={13} /> Scan Another
                  </button>
                </div>
              </div>

              <VerificationChips kind={result.kind || docType} full={result.full} />
              <ReviewBanner review={result.full?.review} />

              <ExtractedFields kind={result.kind || docType} flat={result.flat || {}} />

              {result.full?.fields && (
                <div className="docr-detail-toggle-wrap">
                  <button type="button" className="docr-detail-toggle" onClick={() => setShowDetail((v) => !v)}>
                    {showDetail ? "Hide" : "Show"} verification detail
                  </button>
                  {showDetail && <FieldDetailTable fields={result.full.fields} />}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
