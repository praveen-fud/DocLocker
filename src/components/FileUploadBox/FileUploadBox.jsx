import { useState, useRef } from "react";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader,
  FileText,
  Eye,
} from "lucide-react";
import { uploadDocument } from "../../utils/driveApi";
import "./FileUploadBox.css";

export default function FileUploadBox({
  field,
  studentName,
  subFolder,
  onUploaded,
  uploadedFiles = {},
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [localUploaded, setLocalUploaded] = useState(null);
  const inputRef = useRef(null);

  const isUploaded = localUploaded || uploadedFiles[field.id];

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setUploading(true);
    setProgress(0);

    const ext = file.name.split(".").pop().toLowerCase();
    const allowed = field.accept
      .split(",")
      .map((a) => a.trim().replace(".", ""));
    if (!allowed.includes(ext)) {
      setError(`Invalid file type. Allowed: ${field.accept}`);
      setUploading(false);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("File too large. Max 20 MB.");
      setUploading(false);
      return;
    }

    const scriptConfigured = !!import.meta.env.VITE_APPS_SCRIPT_URL;
    let result; // removed useless `= null` initialization

    try {
      if (scriptConfigured) {
        result = await uploadDocument({
          studentName,
          subFolder,
          fileName: field.rename,
          file,
          onProgress: setProgress,
        });
      } else {
        for (let p = 10; p <= 100; p += 15) {
          await new Promise((r) => setTimeout(r, 120));
          setProgress(p);
        }
        result = {
          id: `demo_${Date.now()}`,
          name: `${field.rename}.${ext}`,
          webViewLink: null,
          _demo: true,
        };
      }
    } catch (e) {
      setError(e.message || "Upload failed. Please try again.");
      setUploading(false);
      return;
    }

    setUploading(false);
    setLocalUploaded(result);
    onUploaded(field.id, result);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleReUpload = () => {
    setLocalUploaded(null);
    setError("");
    inputRef.current?.click();
  };

  return (
    <div
      className={[
        "upload-box",
        isUploaded ? "uploaded" : "",
        uploading ? "uploading" : "",
        dragging ? "dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="upload-box-header">
        <div className="upload-label">
          <span>{field.label}</span>
          {!field.optional && (
            <span className="required-dot" title="Required">
              *
            </span>
          )}
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
              <a
                href={isUploaded.webViewLink}
                target="_blank"
                rel="noreferrer"
                className="view-link"
              >
                <Eye size={13} /> View in Drive
              </a>
            )}
            <button className="re-upload-btn" onClick={handleReUpload}>
              Re-upload
            </button>
          </div>
        </div>
      ) : (
        <div
          className="drop-zone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          {uploading ? (
            <div className="upload-progress">
              <Loader size={20} className="spin" />
              <span>Uploading… {progress}%</span>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="drop-content">
              <Upload size={18} />
              <span>
                Drop file here or <strong>click to browse</strong>
              </span>
              <span className="accepted-types">
                {field.accept.replace(/\./g, "").toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="upload-error">
          <AlertCircle size={13} />
          <span>{error}</span>
          <button className="error-dismiss" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={field.accept}
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <div className="rename-hint">
        Will be saved as: <strong>{field.rename}.ext</strong>
      </div>
    </div>
  );
}
