// What was converted this session: progress while a tool runs, then the
// files to download (or drag out to the desktop in Chrome and Edge).
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp, CircleAlert, Download, Eye, FileArchive, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { download, formatBytes } from "./kinds";
import { canShow } from "./useBlobUrl";

function saving(job, o) {
  if (job.sources.length !== 1 || job.outputs.length !== 1 || !job.inputSize) return "";
  const d = 1 - o.size / job.inputSize;
  if (Math.abs(d) < 0.02) return "";
  return d > 0 ? `${Math.round(d * 100)}% smaller` : `${Math.round(-d * 100)}% larger`;
}

function Job({ job, focus, onDismiss }) {
  const firstButton = useRef(null);
  const [zipping, setZipping] = useState(false);
  useEffect(() => { if (focus) firstButton.current?.focus(); }, [focus]);

  const downloadAll = async () => {
    setZipping(true);
    try {
      const { zipOutputs } = await import("./engines/zip");
      const z = await zipOutputs(job.outputs, "converted.zip");
      download(z);
      setTimeout(() => URL.revokeObjectURL(z.url), 60000);
    } finally {
      setZipping(false);
    }
  };

  return (
    <li className={`cv-job is-${job.status}`}>
      <div className="cv-job__head">
        <span className="cv-job__state" aria-hidden="true">
          {job.status === "running" ? <LoaderCircle size={16} className="cv-spin" /> : job.status === "error" ? <CircleAlert size={16} /> : <ShieldCheck size={16} />}
        </span>
        <span className="cv-job__text">
          <span className="cv-job__title">{job.title}</span>
          <span className="cv-job__src">{job.sources.length === 1 ? job.sources[0] : `${job.sources.length} files`}</span>
        </span>
        {job.status !== "running" && (
          <button type="button" className="cv-icon-btn cv-icon-btn--sm" onClick={() => onDismiss(job.id)} aria-label={`Remove ${job.title} from the list`}><X size={14} /></button>
        )}
      </div>

      {job.status === "running" && (
        <>
          <div className={`cv-progress${job.progress == null ? " is-busy" : ""}`} role="progressbar" aria-label={job.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress == null ? undefined : Math.round(job.progress * 100)}>
            <span style={job.progress == null ? undefined : { width: `${Math.max(4, job.progress * 100)}%` }} />
          </div>
          <p className="cv-job__note">{job.note || "Working on it…"}</p>
        </>
      )}

      {job.status === "error" && <p className="cv-job__error" role="alert">{job.error}</p>}

      {job.status === "done" && (
        <ul className="cv-outs">
          {job.outputs.map((o, i) => (
            <li
              key={o.url}
              className="cv-out"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("DownloadURL", `${o.type || "application/octet-stream"}:${o.name}:${o.url}`);
              }}
              title="Drag to the desktop, or download"
            >
              <span className="cv-out__text">
                <span className="cv-out__name">{o.name}</span>
                <span className="cv-out__meta">{formatBytes(o.size)}{saving(job, o) ? ` · ${saving(job, o)}` : ""}</span>
              </span>
              {canShow(o.type) && (
                <a className="cv-icon-btn cv-icon-btn--sm" href={o.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${o.name}`}><Eye size={15} /></a>
              )}
              <button ref={i === 0 ? firstButton : undefined} type="button" className="cv-btn cv-btn--primary cv-btn--sm" onClick={() => download(o)}>
                <Download size={14} /> Download
              </button>
            </li>
          ))}
          {job.outputs.length > 1 && (
            <li className="cv-out cv-out--all">
              <button type="button" className="cv-btn cv-btn--ghost cv-btn--sm" onClick={downloadAll} disabled={zipping}>
                <FileArchive size={14} /> {zipping ? "Zipping…" : `Download all ${job.outputs.length} (.zip)`}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export default function ResultsTray({ jobs, focusId, onDismiss, onClear }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(true);
  const running = jobs.filter((j) => j.status === "running").length;
  const done = jobs.length - running;
  return (
    <motion.aside
      className={`cv-tray${open ? "" : " is-collapsed"}`}
      aria-label="Converted files"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="cv-tray__head">
        <button type="button" className="cv-tray__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="cv-tray__title">{running ? `Converting ${running}…` : "Converted here"}</span>
          <span className="cv-tray__count">{jobs.length}</span>
          {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}
        </button>
        {done > 0 && <button type="button" className="cv-tray__clear" onClick={onClear}>Clear</button>}
      </header>
      {open && (
        <>
          <ul className="cv-jobs">
            {jobs.map((j) => <Job key={j.id} job={j} focus={j.id === focusId} onDismiss={onDismiss} />)}
          </ul>
          <p className="cv-tray__foot"><ShieldCheck size={13} aria-hidden="true" /> Done on this computer. Nothing was uploaded.</p>
        </>
      )}
    </motion.aside>
  );
}
