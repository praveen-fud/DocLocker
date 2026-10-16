import { useEffect, useRef, useState } from "react";
import { Download, X, RefreshCw, FileText, AlertCircle, ShieldCheck } from "lucide-react";
import useFileObjectUrl from "../../hooks/useFileObjectUrl";
import { downloadFile } from "../../utils/driveApi";
import "./DocumentViewer.css";

// In-app document viewer for staff and bankers. The document never leaves
// DocLocker as a link: it's fetched privately and shown here, and
// "Download" uses a one-time link that only works for this file, once.
//
// file: { id, name }  subtitle: optional context line (student · section)
export default function DocumentViewer({ file, subtitle, onClose }) {
  const { url, type, error, loading, retry } = useFileObjectUrl(file.id);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadFile(file.id);
    } catch (err) {
      setDownloadError(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  let body;
  if (loading) {
    body = (
      <div className="dv-state" role="status">
        <RefreshCw size={22} className="dv-spin" />
        <span>Opening document…</span>
      </div>
    );
  } else if (error) {
    body = (
      <div className="dv-state dv-state-error" role="alert">
        <AlertCircle size={24} />
        <span>{error}</span>
        <button type="button" className="dv-btn" onClick={retry}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  } else if (url && type === "application/pdf") {
    body = <iframe src={url} title={file.name} className="dv-frame" />;
  } else if (url) {
    body = <img src={url} alt={file.name} className="dv-image" />;
  } else {
    body = (
      <div className="dv-state">
        <FileText size={24} />
        <span>This file type can’t be shown here. Download it to open it.</span>
        <button type="button" className="dv-btn dv-btn-primary" onClick={handleDownload} disabled={downloading}>
          <Download size={14} /> {downloading ? "Preparing…" : "Download"}
        </button>
      </div>
    );
  }

  return (
    <div className="dv-backdrop" onClick={onClose}>
      <div
        className="dv-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dv-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dv-header">
          <div className="dv-heading">
            <h2 id="dv-title" className="dv-title" title={file.name}>{file.name}</h2>
            {subtitle && <p className="dv-subtitle">{subtitle}</p>}
          </div>
          <div className="dv-actions">
            <button type="button" className="dv-btn" onClick={handleDownload} disabled={downloading} title="Download this document">
              <Download size={15} /> <span className="dv-btn-label">{downloading ? "Preparing…" : "Download"}</span>
            </button>
            <button type="button" ref={closeRef} className="dv-icon-btn" onClick={onClose} aria-label="Close viewer">
              <X size={17} />
            </button>
          </div>
        </header>
        {downloadError && <p className="dv-download-error" role="alert">{downloadError}</p>}
        <div className="dv-body">{body}</div>
        <footer className="dv-footer">
          <ShieldCheck size={13} /> Opened securely in DocLocker. This view is recorded in the audit log.
        </footer>
      </div>
    </div>
  );
}
