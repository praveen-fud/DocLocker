import { useState, useRef } from "react";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader,
  FileText,
  Eye,
  X,
} from "lucide-react";
import { uploadDocument } from "../../utils/driveApi";
import "./FileUploadBox.css";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

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

// ── Single-file upload box (original behaviour) ────────────────────────────────
function SingleUploadBox({ field, studentName, studentIdentifier, subFolder, onUploaded, uploadedFiles }) {
  const [dragging, setDragging]       = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [progress, setProgress]       = useState(0);
  const [error, setError]             = useState("");
  const [localResult, setLocalResult] = useState(null);
  const [reUploading, setReUploading] = useState(false);
  const inputRef = useRef(null);

  // reUploading overrides the prop so the drop-zone (with progress bar) is shown
  // while the replacement file is being uploaded.
  const isUploaded = !reUploading && (localResult || uploadedFiles[field.id]);

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setUploading(true);
    setProgress(0);

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
    const apiConfigured = !!import.meta.env.VITE_API_URL;
    let result;

    try {
      if (apiConfigured) {
        result = await uploadDocument({
          studentName,
          studentIdentifier: studentIdentifier || "",
          subFolder,
          fileName: field.rename,
          file: compressed,
          onProgress: setProgress,
        });
      } else {
        for (let p = 10; p <= 100; p += 15) {
          await new Promise((r) => setTimeout(r, 80));
          setProgress(p);
        }
        result = { id: `demo_${Date.now()}`, name: `${field.rename}.${ext}`, webViewLink: null, _demo: true };
      }
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
function MultiUploadBox({ field, studentName, studentIdentifier, subFolder, onUploaded, uploadedFiles }) {
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue]       = useState(() => {
    // restore already-uploaded files from uploadedFiles
    return Object.keys(uploadedFiles)
      .filter((k) => k === field.id || k.startsWith(field.id + "_"))
      .map((k) => ({ key: k, name: uploadedFiles[k]?.name || k, status: "done", result: uploadedFiles[k], error: "" }));
  });
  const inputRef = useRef(null);

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
    const rename     = slotKey === field.id ? field.rename : `${field.rename}_${slotKey.split("_").pop()}`;
    const apiConfigured = !!import.meta.env.VITE_API_URL;
    let result;

    try {
      if (apiConfigured) {
        result = await uploadDocument({
          studentName,
          studentIdentifier: studentIdentifier || "",
          subFolder,
          fileName: rename,
          file: compressed,
          onProgress: (p) =>
            setQueue((q) => q.map((item) => item.key === slotKey ? { ...item, progress: p } : item)),
        });
      } else {
        for (let p = 10; p <= 100; p += 20) {
          await new Promise((r) => setTimeout(r, 80));
          setQueue((q) => q.map((item) => item.key === slotKey ? { ...item, progress: p } : item));
        }
        result = { id: `demo_${Date.now()}`, name: `${rename}.${ext}`, webViewLink: null, _demo: true };
      }
    } catch (e) {
      setQueue((q) => q.map((item) => item.key === slotKey ? { ...item, status: "error", error: e.message || "Upload failed." } : item));
      return;
    }

    setQueue((q) => q.map((item) => item.key === slotKey ? { ...item, status: "done", result, name: result.name } : item));
    onUploaded(slotKey, result);
  };

  const addFiles = (files) => {
    const arr = Array.from(files);
    setQueue((prev) => {
      const newItems = arr.map((file, i) => {
        const idx  = prev.length + i;
        const key  = idx === 0 ? field.id : `${field.id}_${idx}`;
        return { key, name: file.name, status: "pending", progress: 0, result: null, error: "" };
      });
      const updated = [...prev, ...newItems];
      // start uploads concurrently
      arr.forEach((file, i) => {
        const key = (prev.length + i) === 0 ? field.id : `${field.id}_${prev.length + i}`;
        uploadFile(file, key);
      });
      return updated;
    });
  };

  const removeItem = (key) => {
    setQueue((q) => q.filter((item) => item.key !== key));
    // signal removal to parent by passing null
    onUploaded(key, null);
  };

  const doneCount = queue.filter((q) => q.status === "done").length;

  return (
    <div className={["upload-box", doneCount > 0 ? "uploaded" : "", dragging ? "dragging" : ""].filter(Boolean).join(" ")}>
      <div className="upload-box-header">
        <div className="upload-label">
          <span>{field.label}</span>
          {!field.optional && <span className="required-dot" title="Required">*</span>}
          {field.optional && <span className="optional-tag">Optional</span>}
        </div>
        {doneCount > 0 && (
          <div className="upload-status-badge">
            <CheckCircle size={13} />
            <span>{doneCount} file{doneCount > 1 ? "s" : ""} uploaded</span>
          </div>
        )}
      </div>

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
          <span>Drop files here or <strong>click to browse</strong></span>
          <span className="accepted-types">{field.accept.replace(/\./g, "").toUpperCase()} · Multiple files OK</span>
          <span className="size-limit-note">Max 25 MB per file</span>
        </div>
      </div>

      <input ref={inputRef} type="file" accept={field.accept} multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
      <div className="rename-hint">Will be saved as: <strong>{field.rename}_N.ext</strong></div>
    </div>
  );
}

// ── Public export — routes to single or multi based on field.multiple ──────────
export default function FileUploadBox({ field, studentName, studentIdentifier, subFolder, onUploaded, uploadedFiles = {} }) {
  if (field.multiple) {
    return (
      <MultiUploadBox
        field={field}
        studentName={studentName}
        studentIdentifier={studentIdentifier}
        subFolder={subFolder}
        onUploaded={onUploaded}
        uploadedFiles={uploadedFiles}
      />
    );
  }
  return (
    <SingleUploadBox
      field={field}
      studentName={studentName}
      studentIdentifier={studentIdentifier}
      subFolder={subFolder}
      onUploaded={onUploaded}
      uploadedFiles={uploadedFiles}
    />
  );
}
