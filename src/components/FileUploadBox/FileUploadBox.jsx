import { useState, useRef, useEffect } from "react";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Loader,
  FileText,
  Eye,
  X,
  Sparkles,
} from "lucide-react";
import { uploadDocument, extractStudentDocument } from "../../utils/driveApi";
import "./FileUploadBox.css";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// File types our document model can read. Word documents still go through
// the old Drive OCR path.
const READABLE_TYPES = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);

const canRead = (field, file) => Boolean(field.reader) && READABLE_TYPES.has(file.type);

// ── Compress image files before upload (canvas, no dependency) ─────────────────
async function compressImage(file) {
  if (!file.type.startsWith("image/")) return file;
  const MAX_W = 1920;
  const QUALITY = 0.85;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_W) {
        height = Math.round((height * MAX_W) / width);
        width = MAX_W;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function getAllowedExts(field) {
  return field.accept
    .split(",")
    .map((a) => a.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
}

// Turns a stored extraction into the status shown on the card, so a
// reloaded page still says whether the document was read.
function statusFromExtraction(extraction) {
  if (!extraction) return null;
  if (["certificate", "ssc"].includes(extraction.docType) && extraction.checks?.supported === false) return "unsupported";
  const s = extraction.review?.status;
  if (s === "manual_required") return "manual";
  if (s === "review_recommended") return "review";
  return "read";
}

const READ_MESSAGES = {
  reading:     { icon: Loader,        text: "Reading your document…" },
  read:        { icon: Sparkles,      text: "Details read — your profile has been filled in" },
  review:      { icon: AlertTriangle, text: "Read — a few details are highlighted for you to check" },
  manual:      { icon: AlertCircle,   text: "Some details couldn't be read — please check your profile" },
  unsupported: { icon: AlertTriangle, text: "This board's format isn't supported yet — used basic text reading instead" },
  failed:      { icon: AlertCircle,   text: "Couldn't read this automatically — please fill your details manually" },
};

function ReadStatus({ status, error }) {
  if (!status) return null;
  const m = READ_MESSAGES[status];
  const Icon = m.icon;
  return (
    <div className={`reader-status reader-${status}`} role="status">
      <Icon size={13} className={status === "reading" ? "spin" : undefined} />
      <span>{status === "failed" && error ? `${m.text} (${error})` : m.text}</span>
    </div>
  );
}

// Shared read call: reports the result to the parent and returns the status
// to show on the card.
async function readWithModel({ field, files, studentName, studentIdentifier, subFolder, onExtracted }) {
  try {
    const result = await extractStudentDocument({
      studentName,
      studentIdentifier,
      docType: field.reader,
      files,
      subFolder,
      sourceFile: field.label,
    });
    onExtracted?.(field.id, result);
    return { status: statusFromExtraction(result.extraction), error: "" };
  } catch (e) {
    return { status: "failed", error: e.message || "" };
  }
}

// ── Single-file upload box (original behaviour) ────────────────────────────────
function SingleUploadBox({ field, studentName, studentIdentifier, subFolder, onUploaded, uploadedFiles, extraction, onExtracted }) {
  const [dragging, setDragging]       = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [progress, setProgress]       = useState(0);
  const [error, setError]             = useState("");
  const [localResult, setLocalResult] = useState(null);
  const [reUploading, setReUploading] = useState(false);
  const [read, setRead]               = useState({ status: null, error: "" });
  const inputRef = useRef(null);

  // reUploading overrides the prop so the drop-zone (with progress bar) is shown
  // while the replacement file is being uploaded.
  const isUploaded = !reUploading && (localResult || uploadedFiles[field.id]);
  const readStatus = read.status || (isUploaded ? statusFromExtraction(extraction) : null);

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setUploading(true);
    setProgress(0);
    setRead({ status: null, error: "" });

    const ext = file.name.split(".").pop().toLowerCase();
    if (!getAllowedExts(field).includes(ext)) {
      setError(`Invalid file type. Allowed: ${field.accept}`);
      setUploading(false);
      setReUploading(false);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File too large. Max 25 MB.");
      setUploading(false);
      setReUploading(false);
      return;
    }

    const compressed = await compressImage(file);
    const willRead = canRead(field, compressed);
    let result;

    try {
      result = await uploadDocument({
        studentName,
        studentIdentifier: studentIdentifier || "",
        subFolder,
        fileName: field.rename,
        file: compressed,
        onProgress: setProgress,
        skipOcr: willRead && !field.keepOcr,
      });
    } catch (e) {
      setError(e.message || "Upload failed. Please try again.");
      setUploading(false);
      setReUploading(false);
      return;
    }

    setUploading(false);
    setReUploading(false);
    setLocalResult(result);
    onUploaded(field.id, result);

    if (willRead) {
      setRead({ status: "reading", error: "" });
      setRead(await readWithModel({ field, files: [compressed], studentName, studentIdentifier, subFolder, onExtracted }));
    }
  };

  return (
    <div
      className={["upload-box", isUploaded ? "uploaded" : "", uploading ? "uploading" : "", dragging ? "dragging" : ""].filter(Boolean).join(" ")}
    >
      <div className="upload-box-header">
        <div className="upload-label">
          <span>{field.label}</span>
          {!field.optional && <span className="required-dot" title="Required">*</span>}
          {field.optional && <span className="optional-tag">Optional</span>}
          {field.reader && <span className="reader-tag" title="Your details are read from this document automatically"><Sparkles size={10} /> Auto-fill</span>}
        </div>
        {isUploaded && (
          <div className="upload-status-badge">
            <CheckCircle size={13} />
            <span>{isUploaded._demo ? "Saved (demo)" : "Uploaded ✓"}</span>
          </div>
        )}
      </div>

      {isUploaded ? (
        <div className="uploaded-info">
          <FileText size={16} />
          <span className="renamed-name">{isUploaded.name}</span>
          <div className="uploaded-actions">
            {isUploaded.webViewLink && (
              <a href={isUploaded.webViewLink} target="_blank" rel="noreferrer" className="view-link">
                <Eye size={13} /> View in Drive
              </a>
            )}
            <button className="re-upload-btn" onClick={() => { setLocalResult(null); setReUploading(true); setError(""); inputRef.current?.click(); }}>
              Re-upload
            </button>
          </div>
        </div>
      ) : (
        <div
          className="drop-zone"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          {uploading ? (
            <div className="upload-progress">
              <Loader size={20} className="spin" />
              <span>Uploading… {progress}%</span>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            </div>
          ) : (
            <div className="drop-content">
              <Upload size={18} />
              <span>Drop file here or <strong>click to browse</strong></span>
              <span className="accepted-types">{field.accept.replace(/\./g, "").toUpperCase()}</span>
              <span className="size-limit-note">Max file size: 25 MB</span>
            </div>
          )}
        </div>
      )}

      <ReadStatus status={readStatus} error={read.error} />

      {error && (
        <div className="upload-error">
          <AlertCircle size={13} />
          <span>{error}</span>
          <button className="error-dismiss" onClick={() => setError("")}>×</button>
        </div>
      )}

      <input ref={inputRef} type="file" accept={field.accept} style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
      <div className="rename-hint">Will be saved as: <strong>{field.rename}.ext</strong></div>
    </div>
  );
}

// ── Multi-file upload box (for fields with field.multiple = true) ──────────────
function MultiUploadBox({ field, studentName, studentIdentifier, subFolder, onUploaded, uploadedFiles, extraction, onExtracted }) {
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue]       = useState(() => {
    // restore already-uploaded files from uploadedFiles
    return Object.keys(uploadedFiles)
      .filter((k) => (k === field.id || k.startsWith(field.id + "_")) && uploadedFiles[k])
      .map((k) => ({ key: k, name: uploadedFiles[k]?.name || k, status: "done", result: uploadedFiles[k], error: "" }));
  });
  const [read, setRead]   = useState({ status: null, error: "" });
  const [limitMsg, setLimitMsg] = useState("");
  const inputRef = useRef(null);
  // Pages uploaded in this session, kept so both sides of a two-page
  // document can be read together once the last one finishes uploading.
  const filesRef = useRef({});
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const maxFiles = field.maxFiles || Infinity;
  const readStatus = read.status || (queue.some((q) => q.status === "done") ? statusFromExtraction(extraction) : null);

  const readIfSettled = async () => {
    const q = queueRef.current;
    if (q.some((item) => item.status === "uploading" || item.status === "pending")) return;
    const files = q.filter((item) => item.status === "done" && filesRef.current[item.key]).map((item) => filesRef.current[item.key]);
    if (!files.length) return;
    setRead({ status: "reading", error: "" });
    setRead(await readWithModel({ field, files: files.slice(0, 4), studentName, studentIdentifier, subFolder, onExtracted }));
  };

  const uploadFile = async (file, slotKey) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!getAllowedExts(field).includes(ext)) {
      setQueue((q) => q.map((item) => item.key === slotKey ? { ...item, status: "error", error: `Invalid type. Allowed: ${field.accept}` } : item));
      return;
    }
    if (file.size > MAX_BYTES) {
      setQueue((q) => q.map((item) => item.key === slotKey ? { ...item, status: "error", error: "File too large. Max 25 MB." } : item));
      return;
    }

    setQueue((q) => q.map((item) => item.key === slotKey ? { ...item, status: "uploading", progress: 0 } : item));
    const compressed = await compressImage(file);
    const willRead   = canRead(field, compressed);
    const rename     = slotKey === field.id ? field.rename : `${field.rename}_${slotKey.split("_").pop()}`;
    let result;

    try {
      result = await uploadDocument({
        studentName,
        studentIdentifier: studentIdentifier || "",
        subFolder,
        fileName: rename,
        file: compressed,
        onProgress: (p) =>
          setQueue((q) => q.map((item) => item.key === slotKey ? { ...item, progress: p } : item)),
        skipOcr: willRead && !field.keepOcr,
      });
    } catch (e) {
      setQueue((q) => q.map((item) => item.key === slotKey ? { ...item, status: "error", error: e.message || "Upload failed." } : item));
      return;
    }

    if (willRead) filesRef.current[slotKey] = compressed;
    const markDone = (q) => q.map((item) => item.key === slotKey ? { ...item, status: "done", result, name: result.name } : item);
    // Update the ref synchronously — readIfSettled() runs before React
    // re-renders, and must see this page as done.
    queueRef.current = markDone(queueRef.current);
    setQueue(markDone);
    onUploaded(slotKey, result);
    if (willRead) readIfSettled();
  };

  const addFiles = (files) => {
    let arr = Array.from(files);
    const room = maxFiles - queueRef.current.length;
    if (room <= 0) {
      setLimitMsg(`Up to ${maxFiles} files — remove one to replace it.`);
      return;
    }
    if (arr.length > room) {
      arr = arr.slice(0, room);
      setLimitMsg(`Only ${maxFiles} files allowed — extra files were skipped.`);
    } else {
      setLimitMsg("");
    }
    // Reuse freed slot keys after a removal instead of colliding with an
    // existing `<id>_N`.
    const used = new Set(queueRef.current.map((p) => p.key));
    const keys = [];
    for (let idx = 0; keys.length < arr.length; idx++) {
      const key = idx === 0 ? field.id : `${field.id}_${idx}`;
      if (!used.has(key)) keys.push(key);
    }
    const newItems = arr.map((file, i) => ({ key: keys[i], name: file.name, status: "pending", progress: 0, result: null, error: "" }));
    queueRef.current = [...queueRef.current, ...newItems];
    setQueue((prev) => [...prev, ...newItems]);
    // start uploads concurrently
    arr.forEach((file, i) => uploadFile(file, keys[i]));
  };

  const removeItem = (key) => {
    delete filesRef.current[key];
    setLimitMsg("");
    setQueue((q) => q.filter((item) => item.key !== key));
    // signal removal to parent by passing null
    onUploaded(key, null);
  };

  const doneCount = queue.filter((q) => q.status === "done").length;
  const atLimit = queue.length >= maxFiles;

  return (
    <div className={["upload-box", doneCount > 0 ? "uploaded" : "", dragging ? "dragging" : ""].filter(Boolean).join(" ")}>
      <div className="upload-box-header">
        <div className="upload-label">
          <span>{field.label}</span>
          {!field.optional && <span className="required-dot" title="Required">*</span>}
          {field.optional && <span className="optional-tag">Optional</span>}
          {field.reader && <span className="reader-tag" title="Your details are read from this document automatically"><Sparkles size={10} /> Auto-fill</span>}
        </div>
        {doneCount > 0 && (
          <div className="upload-status-badge">
            <CheckCircle size={13} />
            <span>{doneCount} file{doneCount > 1 ? "s" : ""} uploaded</span>
          </div>
        )}
      </div>

      {field.pageHint && <p className="page-hint">{field.pageHint}</p>}

      {/* File queue list */}
      {queue.length > 0 && (
        <div className="multi-queue">
          {queue.map((item) => (
            <div key={item.key} className={`queue-item queue-${item.status}`}>
              <FileText size={13} />
              <span className="queue-name">{item.name}</span>
              {item.status === "uploading" && (
                <div className="queue-progress-wrap">
                  <Loader size={12} className="spin" />
                  <div className="queue-bar"><div className="queue-fill" style={{ width: `${item.progress || 0}%` }} /></div>
                </div>
              )}
              {item.status === "done" && (
                <>
                  <CheckCircle size={12} className="queue-done-icon" />
                  {item.result?.webViewLink && (
                    <a href={item.result.webViewLink} target="_blank" rel="noreferrer" className="view-link" style={{ fontSize: 11 }}>
                      <Eye size={11} />
                    </a>
                  )}
                </>
              )}
              {item.status === "error" && <AlertCircle size={12} className="queue-err-icon" title={item.error} />}
              <button className="queue-remove" onClick={() => removeItem(item.key)} title="Remove">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone for adding more files */}
      {!atLimit && (
        <div
          className="drop-zone"
          style={{ marginTop: queue.length > 0 ? 8 : 0 }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
        >
          <div className="drop-content">
            <Upload size={18} />
            <span>
              {queue.length > 0 && field.maxFiles ? <>Add the <strong>next page</strong></> : <>Drop files here or <strong>click to browse</strong></>}
            </span>
            <span className="accepted-types">
              {field.accept.replace(/\./g, "").toUpperCase()} · {field.maxFiles ? `Up to ${field.maxFiles} files` : "Multiple files OK"}
            </span>
            <span className="size-limit-note">Max 25 MB per file</span>
          </div>
        </div>
      )}

      {limitMsg && <div className="upload-error"><AlertCircle size={13} /><span>{limitMsg}</span></div>}
      <ReadStatus status={readStatus} error={read.error} />

      <input ref={inputRef} type="file" accept={field.accept} multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      <div className="rename-hint">Will be saved as: <strong>{field.rename}_N.ext</strong></div>
    </div>
  );
}

// ── Public export — routes to single or multi based on field.multiple ──────────
export default function FileUploadBox({ field, studentName, studentIdentifier, subFolder, onUploaded, uploadedFiles = {}, extraction, onExtracted }) {
  const Box = field.multiple ? MultiUploadBox : SingleUploadBox;
  return (
    <Box
      field={field}
      studentName={studentName}
      studentIdentifier={studentIdentifier}
      subFolder={subFolder}
      onUploaded={onUploaded}
      uploadedFiles={uploadedFiles}
      extraction={extraction}
      onExtracted={onExtracted}
    />
  );
}
