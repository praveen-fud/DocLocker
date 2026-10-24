import { createElement, useState, useRef, useEffect, useId } from "react";
import {
  CloudUpload,
  CircleCheck,
  CircleAlert,
  TriangleAlert,
  LoaderCircle,
  FileText,
  Eye,
  X,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Camera,
  Upload,
  Clock3,
  Info,
  Circle,
} from "lucide-react";
import { uploadDocument } from "../../utils/driveApi";
import CameraCapture from "../CameraCapture/CameraCapture";
import { iconFor, splitLabel, statusFromExtraction } from "./docMeta";
import "./FileUploadBox.css";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_LABEL = "25 MB";

// File types our document model can read. Word documents still go through
// the old Drive OCR path.
const READABLE_TYPES = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);

const canRead = (field, file) => Boolean(field.reader) && READABLE_TYPES.has(file.type);

// ID and certificate slots are checked by the server BEFORE the file is
// saved: a wrong document (say, a PAN card in the passport slot) is
// rejected and never stored. The same check reads the details, so the
// result comes back with the upload — no second request.
function applyReaderResult(field, result, onExtracted) {
  const reader = result?.reader;
  if (!reader) return { status: null, error: "" };
  if (reader.extraction) {
    onExtracted?.(field.id, { extraction: reader.extraction, parsedData: reader.parsedData || null });
    return { status: statusFromExtraction(reader.extraction), error: "" };
  }
  if (reader.gate?.status === "unverified") return { status: "unverified", error: "" };
  return { status: null, error: "" };
}

// The stored upload record never carries the reader result.
const uploadRecord = (result) => {
  const record = { ...result };
  delete record.reader;
  return record;
};

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

// ".pdf,.jpg,.jpeg,.png,.doc,.docx" → "PDF, JPG, PNG, DOC or DOCX"
function formatTypes(field) {
  const exts = getAllowedExts(field)
    .map((e) => (e === "jpeg" ? "jpg" : e).toUpperCase())
    .filter((e, i, arr) => arr.indexOf(e) === i);
  if (exts.length <= 1) return exts.join("");
  return `${exts.slice(0, -1).join(", ")} or ${exts[exts.length - 1]}`;
}

const acceptsImages = (field) => getAllowedExts(field).some((e) => ["jpg", "jpeg", "png"].includes(e));

function formatBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Plain-language wording for failures the student can act on.
function friendlyError(e) {
  if (e?.rejected) return e.message || "This file doesn't match this document.";
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return "The upload took too long. Check your connection and try again.";
  }
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(e?.message || "")) {
    return "We couldn't reach the server. Check your internet connection and try again.";
  }
  return e?.message || "Upload failed. Please try again.";
}

const READ_MESSAGES = {
  reading:     { icon: LoaderCircle,  tone: "info",    text: "Reading your document…" },
  read:        { icon: Sparkles,      tone: "success", text: "Details read — your profile has been filled in" },
  review:      { icon: TriangleAlert, tone: "warning", text: "Read — a few details are highlighted for you to check" },
  manual:      { icon: CircleAlert,   tone: "warning", text: "Some details couldn't be read — please check your profile" },
  unsupported: { icon: TriangleAlert, tone: "warning", text: "This board's format isn't supported yet — used basic text reading instead" },
  failed:      { icon: CircleAlert,   tone: "error",   text: "Couldn't read this automatically — please fill your details manually" },
  unverified:  { icon: Info,          tone: "info",    text: "Uploaded — we couldn't check it automatically, so please fill in your details" },
};

function ReadStatus({ status, error }) {
  if (!status) return null;
  const m = READ_MESSAGES[status];
  const Icon = m.icon;
  return (
    <p className={`doc-note doc-note--${m.tone}`}>
      <Icon size={14} className={status === "reading" ? "doc-spin" : undefined} aria-hidden="true" />
      <span>{status === "failed" && error ? `${m.text} (${error})` : m.text}</span>
    </p>
  );
}

// The badge in the card's top-right corner. Wording follows what the server
// actually confirmed: "Verified" only when our reader checked the document
// type and read it cleanly.
const BADGES = {
  uploading: { tone: "info",    icon: LoaderCircle,  text: "Uploading", spin: true },
  checking:  { tone: "info",    icon: LoaderCircle,  text: "Checking", spin: true },
  verified:  { tone: "success", icon: ShieldCheck,   text: "Verified" },
  uploaded:  { tone: "success", icon: CircleCheck,   text: "Uploaded" },
  review:    { tone: "warning", icon: TriangleAlert, text: "Check details" },
  pages:     { tone: "warning", icon: Clock3,        text: "Page needed" },
  rejected:  { tone: "error",   icon: ShieldAlert,   text: "Not accepted" },
  failed:    { tone: "error",   icon: CircleAlert,   text: "Upload failed" },
};

function StatusBadge({ kind, text }) {
  if (!kind) return null;
  const b = BADGES[kind];
  const Icon = b.icon;
  return (
    <span className={`doc-badge doc-badge--${b.tone}`}>
      <Icon size={13} className={b.spin ? "doc-spin" : undefined} aria-hidden="true" />
      {text || b.text}
    </span>
  );
}

function badgeForRead(readStatus) {
  if (readStatus === "read") return "verified";
  if (readStatus === "review" || readStatus === "manual") return "review";
  return "uploaded";
}

// Card chrome shared by single and multi-file slots.
function CardHeader({ field, titleId, badge, badgeText }) {
  const { title, note } = splitLabel(field.label);
  return (
    <header className="doc-card__head">
      <span className="doc-card__icon" aria-hidden="true">
        {createElement(iconFor(field.id), { size: 20, strokeWidth: 1.8 })}
      </span>
      <div className="doc-card__titles">
        <h4 className="doc-card__title" id={titleId}>{title}</h4>
        {field.reader ? (
          <p className="doc-card__sub is-ai"><Sparkles size={12} aria-hidden="true" /> Fills in your details</p>
        ) : note ? (
          <p className="doc-card__sub">{note}</p>
        ) : null}
      </div>
      <div className="doc-card__status" aria-live="polite">
        <StatusBadge kind={badge} text={badgeText} />
      </div>
    </header>
  );
}

// Drop target with two clear actions: pick a file, or scan it with the
// camera (in-page camera with a guide frame; the phone's own camera picker
// when the browser can't use it). File types and size are listed once per
// step, not on every card — the exact rule only shows up if a file is wrong.
//   pages: labels still to capture, e.g. ["Front side", "Back side"]
function DropArea({ field, onFiles, disabled, multiple, prompt, hintId, pages = [] }) {
  const [dragging, setDragging] = useState(false);
  const [camera, setCamera] = useState(false);
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const title = splitLabel(field.label).title;
  const open = () => { if (!disabled) inputRef.current?.click(); };

  return (
    <>
      <div
        className={`doc-drop${dragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
        }}
      >
        {dragging ? (
          <span className="doc-drop__title"><CloudUpload size={18} aria-hidden="true" /> Drop to upload</span>
        ) : (
          <div className="doc-drop__actions">
            <button type="button" className="doc-drop__btn" onClick={open} disabled={disabled} aria-describedby={hintId} aria-label={`${prompt}: ${title}`}>
              <Upload size={16} aria-hidden="true" /> {prompt}
            </button>
            {acceptsImages(field) && (
              <button type="button" className="doc-drop__btn is-camera" onClick={() => setCamera(true)} disabled={disabled} aria-label={`Scan ${title} with your camera`}>
                <Camera size={16} aria-hidden="true" /> Camera
              </button>
            )}
          </div>
        )}
        <span className="sr-only" id={hintId}>
          {formatTypes(field)}, up to {MAX_LABEL}{multiple ? " each" : ""}.
        </span>
      </div>
      {camera && (
        <CameraCapture
          title={title}
          pages={pages}
          onClose={() => setCamera(false)}
          onDone={(files) => { setCamera(false); onFiles(files); }}
          onFallback={() => { setCamera(false); cameraRef.current?.click(); }}
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept={field.accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }}
      />
    </>
  );
}

function FileThumb({ previewUrl, name }) {
  const [failed, setFailed] = useState(false);
  if (previewUrl && !failed) {
    return <img className="doc-file__thumb" src={previewUrl} alt="" onError={() => setFailed(true)} />;
  }
  const isPdf = /\.pdf$/i.test(name || "");
  return (
    <span className={`doc-file__thumb doc-file__thumb--icon${isPdf ? " is-pdf" : ""}`} aria-hidden="true">
      <FileText size={18} strokeWidth={1.8} />
      <span>{(name || "").split(".").pop()?.slice(0, 4).toUpperCase()}</span>
    </span>
  );
}

// In-session preview of an image the student just picked. Lives only in
// memory (an object URL) — never stored, never sent anywhere.
function usePreviewUrls() {
  const urls = useRef(new Set());
  useEffect(() => {
    const set = urls.current;
    return () => { set.forEach((u) => URL.revokeObjectURL(u)); set.clear(); };
  }, []);
  return {
    make(file) {
      if (!file?.type?.startsWith("image/")) return null;
      const u = URL.createObjectURL(file);
      urls.current.add(u);
      return u;
    },
    release(u) {
      if (!u) return;
      URL.revokeObjectURL(u);
      urls.current.delete(u);
    },
  };
}

// ── Single-file upload card ───────────────────────────────────────────────────
function SingleUploadBox({ anchorId, field, studentName, studentIdentifier, subFolder, onUploaded, uploadedFiles, extraction, onExtracted }) {
  const [uploading, setUploading]     = useState(false);
  const [progress, setProgress]       = useState(0);
  const [error, setError]             = useState("");
  const [rejected, setRejected]       = useState(false);
  const [invalid, setInvalid]         = useState(false);
  const [retryFile, setRetryFile]     = useState(null);
  const [localResult, setLocalResult] = useState(null);
  const [local, setLocal]             = useState({ previewUrl: null, size: null });
  const [read, setRead]               = useState({ status: null, error: "" });
  const replaceRef = useRef(null);
  const previews = usePreviewUrls();
  const titleId = useId();
  const hintId = useId();
  const errorId = useId();

  const uploaded = localResult || uploadedFiles[field.id];
  const isUploaded = !uploading && uploaded;
  const readStatus = read.status || (isUploaded ? statusFromExtraction(extraction) : null);

  const handleFile = async (file) => {
    if (!file || uploading) return;
    setError("");
    setRejected(false);
    setInvalid(false);
    setRetryFile(null);
    setRead({ status: null, error: "" });

    const ext = file.name.split(".").pop().toLowerCase();
    if (!getAllowedExts(field).includes(ext)) {
      setError(`This file type isn't accepted here. Please choose a ${formatTypes(field)} file.`);
      setInvalid(true);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`This file is ${formatBytes(file.size)}. The limit is ${MAX_LABEL} — please choose a smaller file.`);
      setInvalid(true);
      return;
    }

    setUploading(true);
    setProgress(0);
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
      setError(friendlyError(e));
      setRejected(Boolean(e.rejected));
      setRetryFile(e.rejected ? null : file);
      setUploading(false);
      return;
    }

    const record = uploadRecord(result);
    previews.release(local.previewUrl);
    setLocal({ previewUrl: previews.make(compressed), size: compressed.size });
    setUploading(false);
    setLocalResult(record);
    onUploaded(field.id, record);
    setRead(applyReaderResult(field, result, onExtracted));
  };

  const pickFiles = (files) => handleFile(files[0]);

  let badge = null;
  if (uploading) badge = field.reader ? "checking" : "uploading";
  else if (error && !isUploaded) badge = rejected ? "rejected" : "failed";
  else if (isUploaded) badge = badgeForRead(readStatus);

  const state = uploading ? "busy" : error ? "error" : isUploaded ? (badge === "review" ? "attention" : "done") : "empty";

  return (
    <article id={anchorId} tabIndex={anchorId ? -1 : undefined} className={`doc-card is-${state}`} aria-labelledby={titleId} aria-describedby={error ? errorId : undefined}>
      <CardHeader field={field} titleId={titleId} badge={badge} />

      {uploading ? (
        <div className="doc-progress" role="status">
          <div className="doc-progress__label">
            <LoaderCircle size={16} className="doc-spin" aria-hidden="true" />
            <span>{field.reader ? "Checking your document…" : "Uploading your document…"}</span>
            {!field.reader && <span className="doc-progress__pct">{progress}%</span>}
          </div>
          <div
            className={`doc-bar${field.reader ? " is-indeterminate" : ""}`}
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={field.reader ? undefined : progress}
          >
            <span style={field.reader ? undefined : { width: `${progress}%` }} />
          </div>
          {field.reader && <p className="doc-progress__sub">We check it&apos;s the right document before saving it.</p>}
        </div>
      ) : isUploaded ? (
        <div className="doc-file">
          <FileThumb previewUrl={local.previewUrl} name={uploaded.name} />
          <div className="doc-file__body">
            <span className="doc-file__name" title={uploaded.name}>{uploaded.name}</span>
            <span className="doc-file__meta">
              {uploaded._demo ? "Saved (demo)" : "Saved to your file"}
              {local.size ? ` · ${formatBytes(local.size)}` : ""}
            </span>
          </div>
          <div className="doc-file__actions">
            {uploaded.webViewLink && (
              <a href={uploaded.webViewLink} target="_blank" rel="noreferrer" className="doc-icon-btn" aria-label={`View ${uploaded.name} (opens in a new tab)`} title="View">
                <Eye size={16} aria-hidden="true" />
              </a>
            )}
            <button type="button" className="doc-icon-btn" onClick={() => replaceRef.current?.click()} aria-label={`Replace ${uploaded.name}`} title="Replace">
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
          <input
            ref={replaceRef}
            type="file"
            accept={field.accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>
      ) : (
        <DropArea field={field} hintId={hintId} onFiles={pickFiles} disabled={uploading} prompt="Upload" />
      )}

      {field.pageHint && !isUploaded && !uploading && <p className="doc-card__hint">{field.pageHint}</p>}

      {!uploading && <ReadStatus status={readStatus} error={read.error} />}

      {error && (
        <div className={`doc-alert${rejected ? " doc-alert--rejected" : ""}`} role="alert" id={errorId}>
          {rejected ? <ShieldAlert size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
          <div className="doc-alert__body">
            <strong>{rejected ? "Not uploaded" : invalid ? "File not accepted" : isUploaded ? "Replacement not uploaded" : "Upload didn't finish"}</strong>
            <span>{error}</span>
            {rejected && (
              <span className="doc-alert__help">Make sure the document is clear, fully visible and matches “{splitLabel(field.label).title}”.</span>
            )}
            <div className="doc-alert__actions">
              {retryFile && (
                <button type="button" className="doc-link-btn" onClick={() => handleFile(retryFile)}>
                  <RefreshCw size={13} aria-hidden="true" /> Try again
                </button>
              )}
              {isUploaded && (
                <button type="button" className="doc-link-btn" onClick={() => replaceRef.current?.click()}>
                  Choose another file
                </button>
              )}
            </div>
          </div>
          <button type="button" className="doc-alert__close" onClick={() => { setError(""); setRejected(false); setInvalid(false); setRetryFile(null); }} aria-label="Dismiss message">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

    </article>
  );
}

const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// For two-page IDs: which pages are covered. A page counts once the reader
// found a detail printed only on it, or once every page has a file.
function pageStates(field, extraction, doneCount) {
  if (!field.pages) return null;
  const flat = extraction?.flat;
  if (flat) {
    return field.pages.map((p) => {
      const readIt = p.readKeys.some((k) => hasValue(flat[k]));
      return { ...p, state: readIt ? "read" : doneCount >= field.pages.length ? "uploaded" : "missing" };
    });
  }
  // Nothing was read (e.g. a Word file): we only know how many pages exist.
  return null;
}

// ── Multi-file upload card (for fields with field.multiple = true) ───────────
function MultiUploadBox({ anchorId, field, studentName, studentIdentifier, subFolder, onUploaded, uploadedFiles, extraction, onExtracted }) {
  const [queue, setQueue] = useState(() => {
    // restore already-uploaded files from uploadedFiles
    return Object.keys(uploadedFiles)
      .filter((k) => (k === field.id || k.startsWith(field.id + "_")) && uploadedFiles[k])
      .map((k) => ({ key: k, name: uploadedFiles[k]?.name || k, status: "done", result: uploadedFiles[k], error: "" }));
  });
  const [read, setRead]   = useState({ status: null, error: "" });
  const [limitMsg, setLimitMsg] = useState("");
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  const previews = usePreviewUrls();
  const titleId = useId();
  const hintId = useId();

  const maxFiles = field.maxFiles || Infinity;
  const readStatus = read.status || (queue.some((q) => q.status === "done") ? statusFromExtraction(extraction) : null);

  const patch = (slotKey, change) =>
    setQueue((q) => q.map((item) => (item.key === slotKey ? { ...item, ...change } : item)));

  // Returns "done" | "rejected" | "error".
  const uploadFile = async (file, slotKey) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!getAllowedExts(field).includes(ext)) {
      patch(slotKey, { status: "error", invalid: true, error: `This file type isn't accepted. Please choose a ${formatTypes(field)} file.` });
      return "error";
    }
    if (file.size > MAX_BYTES) {
      patch(slotKey, { status: "error", invalid: true, error: `This file is ${formatBytes(file.size)} — the limit is ${MAX_LABEL}.` });
      return "error";
    }

    patch(slotKey, { status: "uploading", progress: 0, error: "", file });
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
        onProgress: (p) => patch(slotKey, { progress: p }),
        skipOcr: willRead && !field.keepOcr,
      });
    } catch (e) {
      const status = e.rejected ? "rejected" : "error";
      patch(slotKey, { status, error: friendlyError(e) });
      return status;
    }

    const record = uploadRecord(result);
    const previewUrl = previews.make(compressed);
    const markDone = (q) => q.map((item) => item.key === slotKey
      ? { ...item, status: "done", result: record, name: record.name, error: "", file: null, previewUrl, size: compressed.size }
      : item);
    queueRef.current = markDone(queueRef.current);
    setQueue(markDone);
    onUploaded(slotKey, record);
    if (willRead) setRead(applyReaderResult(field, result, onExtracted));
    return "done";
  };

  // Pages go up one at a time: the server checks each new page together
  // with the pages already saved. A page rejected on its own (e.g. a
  // passport's last page sent before the photo page) gets one more try
  // once the rest of the batch is saved.
  const uploadBatch = async (items) => {
    const retry = [];
    for (const it of items) {
      const outcome = await uploadFile(it.file, it.key);
      if (outcome === "rejected") retry.push(it);
    }
    if (retry.length && retry.length < items.length) {
      for (const it of retry) await uploadFile(it.file, it.key);
    }
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
    const newItems = arr.map((file, i) => ({ key: keys[i], name: file.name, status: "pending", progress: 0, result: null, error: "", file }));
    queueRef.current = [...queueRef.current, ...newItems];
    setQueue((prev) => [...prev, ...newItems]);
    if (field.reader) {
      uploadBatch(arr.map((file, i) => ({ file, key: keys[i] })));
    } else {
      // Plain slots: upload concurrently, as before.
      arr.forEach((file, i) => uploadFile(file, keys[i]));
    }
  };

  const removeItem = (key) => {
    setLimitMsg("");
    const item = queueRef.current.find((q) => q.key === key);
    previews.release(item?.previewUrl);
    queueRef.current = queueRef.current.filter((q) => q.key !== key);
    setQueue((q) => q.filter((it) => it.key !== key));
    // signal removal to parent by passing null
    onUploaded(key, null);
  };

  const doneCount = queue.filter((q) => q.status === "done").length;
  const busy = queue.some((q) => q.status === "uploading" || q.status === "pending");
  const failed = queue.filter((q) => q.status === "rejected" || q.status === "error");
  const atLimit = queue.length >= maxFiles;

  const pageTotal = field.pages?.length || 0;
  const pages = pageStates(field, readStatus ? extraction : null, doneCount);
  const pagesCovered = pageTotal
    ? (pages ? pages.every((p) => p.state !== "missing") : doneCount >= pageTotal)
    : true;

  let badge = null;
  let badgeText;
  if (busy) badge = field.reader ? "checking" : "uploading";
  else if (doneCount === 0 && failed.length) badge = failed.some((f) => f.status === "rejected") ? "rejected" : "failed";
  else if (doneCount > 0 && !pagesCovered) {
    badge = "pages";
    badgeText = pages ? "Page needed" : `${doneCount} of ${pageTotal} pages`;
  } else if (doneCount > 0) {
    badge = badgeForRead(readStatus);
    if (badge === "uploaded" && !field.reader && doneCount > 1) badgeText = `${doneCount} files`;
  }

  const state = busy ? "busy" : failed.length && !doneCount ? "error" : doneCount ? (badge === "pages" || badge === "review" ? "attention" : "done") : "empty";

  const prompt = pageTotal
    ? (doneCount > 0 ? "Add next page" : "Upload")
    : (queue.length > 0 ? "Add more" : "Upload");
  const pagesToScan = pageTotal
    ? (pages ? pages.filter((p) => p.state === "missing").map((p) => p.label) : field.pages.slice(doneCount).map((p) => p.label))
    : [];

  return (
    <article id={anchorId} tabIndex={anchorId ? -1 : undefined} className={`doc-card is-${state}`} aria-labelledby={titleId}>
      <CardHeader field={field} titleId={titleId} badge={badge} badgeText={badgeText} />

      {pageTotal > 0 && (
        <ul className="doc-pages" aria-label="Pages">
          {pages
            ? pages.map((p) => (
                <li key={p.label} className={`doc-page is-${p.state}`}>
                  {p.state === "missing"
                    ? <Circle size={15} aria-hidden="true" />
                    : <CircleCheck size={15} aria-hidden="true" />}
                  <span className="doc-page__text">
                    <span className="doc-page__label">{p.label}</span>
                    <span className="doc-page__state">
                      {p.state === "read" ? "Details read" : p.state === "uploaded" ? "Uploaded" : p.detail ? `Still needed — has your ${p.detail}` : "Still needed"}
                    </span>
                  </span>
                </li>
              ))
            : field.pages.map((p) => {
                // Nothing was read, so we can't tell which page a file is —
                // only whether there are enough files for every page.
                const all = doneCount >= pageTotal;
                return (
                  <li key={p.label} className={`doc-page is-${all ? "uploaded" : "unknown"}`}>
                    {all ? <CircleCheck size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
                    <span className="doc-page__text">
                      <span className="doc-page__label">{p.label}</span>
                      <span className="doc-page__state">{all ? "Uploaded" : p.detail ? `Has your ${p.detail}` : "Needed"}</span>
                    </span>
                  </li>
                );
              })}
          {!pages && doneCount > 0 && doneCount < pageTotal && (
            <li className="doc-page doc-page--note">
              {doneCount} of {pageTotal} pages uploaded — make sure both pages are included.
            </li>
          )}
        </ul>
      )}
      {!pageTotal && field.pageHint && <p className="doc-card__hint">{field.pageHint}</p>}

      {queue.length > 0 && (
        <ul className="doc-files">
          {queue.map((item) => (
            <li key={item.key} className={`doc-file doc-file--row is-${item.status}`}>
              <FileThumb previewUrl={item.previewUrl} name={item.name} />
              <div className="doc-file__body">
                <span className="doc-file__name" title={item.name}>{item.name}</span>
                <span className="doc-file__meta">
                  {item.status === "pending" && "Waiting…"}
                  {item.status === "uploading" && (field.reader ? "Checking…" : `Uploading… ${item.progress || 0}%`)}
                  {item.status === "done" && <>Saved{item.size ? ` · ${formatBytes(item.size)}` : ""}</>}
                  {item.status === "error" && <span className="doc-file__err">Not uploaded</span>}
                  {item.status === "rejected" && <span className="doc-file__err">Not accepted</span>}
                </span>
                {item.status === "uploading" && !field.reader && (
                  <div className="doc-bar doc-bar--thin" aria-hidden="true"><span style={{ width: `${item.progress || 0}%` }} /></div>
                )}
              </div>
              <div className="doc-file__actions">
                {item.status === "uploading" && <LoaderCircle size={16} className="doc-spin doc-file__busy" aria-label="Uploading" />}
                {item.status === "done" && item.result?.webViewLink && (
                  <a href={item.result.webViewLink} target="_blank" rel="noreferrer" className="doc-icon-btn" aria-label={`View ${item.name} (opens in a new tab)`} title="View">
                    <Eye size={16} aria-hidden="true" />
                  </a>
                )}
                {item.status === "error" && item.file && !item.invalid && (
                  <button type="button" className="doc-icon-btn" onClick={() => uploadFile(item.file, item.key)} aria-label={`Try uploading ${item.name} again`} title="Try again">
                    <RefreshCw size={16} aria-hidden="true" />
                  </button>
                )}
                {item.status !== "uploading" && item.status !== "pending" && (
                  <button type="button" className="doc-icon-btn doc-icon-btn--danger" onClick={() => removeItem(item.key)} aria-label={`Remove ${item.name}`} title="Remove">
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!atLimit && (
        <DropArea field={field} hintId={hintId} onFiles={addFiles} multiple prompt={prompt} pages={pagesToScan} />
      )}

      {failed.map((item) => (
        <div key={`err-${item.key}`} className={`doc-alert${item.status === "rejected" ? " doc-alert--rejected" : ""}`} role="alert">
          {item.status === "rejected" ? <ShieldAlert size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
          <div className="doc-alert__body">
            <strong>{item.status === "rejected" ? `${item.name} was not uploaded` : `${item.name}`}</strong>
            <span>{item.error}</span>
          </div>
        </div>
      ))}
      {limitMsg && (
        <p className="doc-note doc-note--warning"><CircleAlert size={14} aria-hidden="true" /><span>{limitMsg}</span></p>
      )}
      {!busy && <ReadStatus status={readStatus} error={read.error} />}

    </article>
  );
}

// ── Public export — routes to single or multi based on field.multiple ──────────
export default function FileUploadBox({ anchorId, field, studentName, studentIdentifier, subFolder, onUploaded, uploadedFiles = {}, extraction, onExtracted }) {
  const Box = field.multiple ? MultiUploadBox : SingleUploadBox;
  return (
    <Box
      anchorId={anchorId}
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
