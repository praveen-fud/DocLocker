import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download, X, RefreshCw, FileText, FileImage, AlertCircle, ShieldCheck,
  ZoomIn, ZoomOut, Scan, RotateCw, Maximize2, Minimize2,
} from "lucide-react";
import useFileObjectUrl from "../../hooks/useFileObjectUrl";
import { downloadFile } from "../../utils/driveApi";
import "./DocumentViewer.css";

// Ask the browser's PDF viewer to fit the page to the frame's width and keep
// its thumbnail sidebar closed, so a page never scrolls sideways. Chrome and
// Edge read view/navpanes, Firefox reads zoom/pagemode; unknown keys are ignored.
const PDF_VIEW_PARAMS = "#view=FitH&navpanes=0&zoom=page-width&pagemode=none";

// In-app document viewer for staff and bankers. The document never leaves
// DocLocker as a link: it's fetched privately and shown here, and
// "Download" uses a one-time link that only works for this file, once.
//
// file:     { id, name } shown first
// files:    optional [{ id, name, mimeType? }] — with more than one, a rail
//           lets the viewer switch between them (e.g. a whole folder)
// subtitle: optional context line (student · application id)

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const FIT = { zoom: 1, rotation: 0 };
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

function isImageFile(f) {
  return (f.mimeType || "").startsWith("image/") || IMAGE_EXT.test(f.name || "");
}

// Sized boxes rather than a CSS scale(), so a zoomed image scrolls to its
// edges instead of overflowing the stage.
function ImageStage({ url, name, zoom, rotation }) {
  const stageRef = useRef(null);
  const [stage, setStage] = useState(null);
  const [natural, setNatural] = useState(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let frame = null;
  let img = null;
  if (stage && natural) {
    const turned = rotation % 180 !== 0;
    const boxW = turned ? natural.h : natural.w;
    const boxH = turned ? natural.w : natural.h;
    const fit = Math.min((stage.w - 48) / boxW, (stage.h - 48) / boxH, 1);
    const scale = Math.max(fit, 0.05) * zoom;
    frame = { width: boxW * scale, height: boxH * scale };
    img = { width: natural.w * scale, height: natural.h * scale, transform: `translate(-50%, -50%) rotate(${rotation}deg)` };
  }

  return (
    <div className="dv-stage" ref={stageRef} tabIndex={0} aria-label={`${name}, scrollable`}>
      <div className={`dv-page${frame ? "" : " dv-page--measuring"}`} style={frame || undefined}>
        <img
          src={url}
          alt={name}
          className="dv-image"
          style={img || undefined}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      </div>
    </div>
  );
}

// fetchBlob / download: the applicant's dashboard passes its own (PIN
// session); staff use the defaults.
export default function DocumentViewer({ file, files, subtitle, onClose, fetchBlob, download = downloadFile, downloadText = "Download (One-time Link)" }) {
  const list = files?.length > 1 ? files : null;
  // Remember which rail item was picked, but only for the file this viewer
  // was opened with — a new `file` prop starts fresh.
  const [picked, setPicked] = useState(null);
  const active = (picked?.base === file.id && list?.find((f) => f.id === picked.id)) || file;

  const { url, type, error, loading, retry } = useFileObjectUrl(active.id, fetchBlob ? { fetchBlob } : undefined);
  const [view, setView] = useState({ id: active.id, ...FIT });
  const { zoom, rotation } = view.id === active.id ? view : FIT;
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const boxRef = useRef(null);
  const closeRef = useRef(null);
  // Callers pass an inline onClose; a ref keeps the open/close effect below
  // from re-running (and re-grabbing focus) on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      // Keep keyboard focus inside the dialog while it's open
      if (e.key !== "Tab" || !boxRef.current) return;
      const focusable = boxRef.current.querySelectorAll("button:not(:disabled), iframe, [tabindex='0']");
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const isImage = Boolean(url) && type !== "application/pdf";
  const stepIndex = ZOOM_STEPS.indexOf(zoom);
  const setZoom = (z) => setView({ id: active.id, zoom: z, rotation });

  const selectFile = (f) => {
    setPicked({ base: file.id, id: f.id });
    setDownloadError("");
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      await download(active.id);
    } catch (err) {
      setDownloadError(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const downloadLabel = downloading ? "Preparing…" : downloadText;

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
    body = <iframe key={url} src={`${url}${PDF_VIEW_PARAMS}`} title={active.name} className="dv-frame" />;
  } else if (url) {
    body = <ImageStage key={url} url={url} name={active.name} zoom={zoom} rotation={rotation} />;
  } else {
    body = (
      <div className="dv-state">
        <FileText size={24} />
        <span>This file type can’t be shown here. Download it to open it.</span>
        <button type="button" className="dv-btn dv-btn-primary" onClick={handleDownload} disabled={downloading}>
          <Download size={14} /> {downloadLabel}
        </button>
      </div>
    );
  }

  // Portalled to <body>: callers render the viewer deep inside panels that
  // animate with a transform (e.g. the admin student detail), and a
  // transformed ancestor would trap this fixed overlay inside that panel.
  return createPortal(
    <div className="dv-backdrop" onClick={onClose}>
      <div
        ref={boxRef}
        className={`dv-box${expanded ? " dv-box--expanded" : ""}${list ? " dv-box--rail" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dv-title"
        aria-describedby={subtitle ? "dv-subtitle" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dv-header">
          <div className="dv-heading">
            <h2 id="dv-title" className="dv-title" title={active.name}>{active.name}</h2>
            {subtitle && <p id="dv-subtitle" className="dv-subtitle">{subtitle}</p>}
          </div>
          <button type="button" ref={closeRef} className="dv-icon-btn" onClick={onClose} aria-label="Close viewer">
            <X size={18} />
          </button>
        </header>

        <div className="dv-main">
          {list && (
            <nav className="dv-rail" aria-label="Documents in this folder">
              <ol className="dv-rail-list">
                {list.map((f, i) => {
                  const Icon = isImageFile(f) ? FileImage : FileText;
                  const current = f.id === active.id;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={`dv-thumb${current ? " is-active" : ""}`}
                        aria-current={current ? "true" : undefined}
                        title={f.name}
                        onClick={() => selectFile(f)}
                      >
                        <span className="dv-thumb-page">
                          <Icon size={20} />
                          <span className="dv-thumb-index" aria-hidden="true">{i + 1}</span>
                        </span>
                        <span className="dv-thumb-name">{f.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          <section className="dv-content" aria-label="Document">
            <div className={`dv-toolbar${isImage ? " dv-toolbar--image" : ""}`} role="toolbar" aria-label="View controls">
              <span className="dv-kind">
                {type === "application/pdf" ? "PDF document" : isImage ? "Image" : "Document"}
                {list && <span className="dv-kind-count">{list.findIndex((f) => f.id === active.id) + 1} of {list.length}</span>}
              </span>
              <div className="dv-tools">
                {isImage && (
                  <>
                    <button type="button" className="dv-tool" onClick={() => setZoom(ZOOM_STEPS[stepIndex - 1])} disabled={stepIndex <= 0} aria-label="Zoom out">
                      <ZoomOut size={17} />
                    </button>
                    <output className="dv-zoom" aria-live="polite" aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
                    <button type="button" className="dv-tool" onClick={() => setZoom(ZOOM_STEPS[stepIndex + 1])} disabled={stepIndex >= ZOOM_STEPS.length - 1} aria-label="Zoom in">
                      <ZoomIn size={17} />
                    </button>
                    <span className="dv-tool-sep" aria-hidden="true" />
                    <button type="button" className="dv-tool" onClick={() => setView({ id: active.id, ...FIT, rotation })} disabled={zoom === 1} aria-label="Fit to window" title="Fit to window">
                      <Scan size={17} />
                    </button>
                    <button type="button" className="dv-tool" onClick={() => setView({ id: active.id, zoom, rotation: (rotation + 90) % 360 })} aria-label="Rotate 90 degrees" title="Rotate">
                      <RotateCw size={17} />
                    </button>
                    <span className="dv-tool-sep" aria-hidden="true" />
                  </>
                )}
                <button
                  type="button"
                  className="dv-tool dv-tool--expand"
                  onClick={() => setExpanded((v) => !v)}
                  aria-pressed={expanded}
                  aria-label={expanded ? "Exit full screen" : "Full screen"}
                  title={expanded ? "Exit full screen" : "Full screen"}
                >
                  {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </button>
              </div>
            </div>
            <div className="dv-body">{body}</div>
          </section>
        </div>

        {downloadError && <p className="dv-download-error" role="alert">{downloadError}</p>}
        <footer className="dv-footer">
          <p className="dv-audit">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Every view and download is recorded in the audit log for security.</span>
          </p>
          <button type="button" className="dv-btn dv-btn-primary dv-download" onClick={handleDownload} disabled={downloading}>
            {downloading ? <RefreshCw size={16} className="dv-spin" /> : <Download size={16} />}
            <span>{downloadLabel}</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
