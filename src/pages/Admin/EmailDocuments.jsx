import { useEffect, useRef, useState } from "react";
import { Mail, Send, X, RefreshCw, AlertCircle, CheckCircle, FileText, Paperclip } from "lucide-react";
import { callAPI } from "../../utils/adminApi";
import "./EmailDocuments.css";

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;

// Choose who gets the student's passport and academic documents. The
// email is sent from the DocLocker mailbox, in the background: this closes
// as soon as it's queued and onQueued tracks it.
export default function EmailDocumentsDialog({ studentName, studentKey, files, onClose, onQueued }) {
  const [settings, setSettings] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    callAPI("GET", "/api/email/settings")
      .then((r) => { if (!cancelled) setSettings(r.success ? r : { configured: false, presets: [], from: "" }); })
      .catch(() => { if (!cancelled) setSettings({ configured: false, presets: [], from: "" }); });
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { cancelled = true; document.removeEventListener("keydown", onKey); };
  }, [busy, onClose]);

  const otherClean = other.trim();
  const otherBad = otherClean && !EMAIL_RE.test(otherClean);
  const recipients = [...picked, ...(otherClean && !otherBad ? [otherClean] : [])];
  const toggle = (e) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(e)) next.delete(e); else next.add(e);
    return next;
  });

  const send = async (ev) => {
    ev.preventDefault();
    if (otherBad) { setErr(`"${otherClean}" isn't a valid email address.`); return; }
    if (!recipients.length) { setErr("Choose at least one address."); return; }
    setBusy(true);
    setErr("");
    try {
      const r = await callAPI("POST", `/api/students/${encodeURIComponent(studentKey)}/email-documents`, { recipients, files, note: note.trim() });
      if (!r.success) throw new Error(r.error || "The email couldn't be queued.");
      onQueued({ ...r.job, studentName });
      onClose();
    } catch (e2) {
      setErr(e2.message || "The email couldn't be queued.");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <form className="loan-status-modal ed-modal animate-fade-in" onClick={(e) => e.stopPropagation()} onSubmit={send} role="dialog" aria-modal="true" aria-labelledby="ed-title">
        <div className="lsm-header">
          <div className="lsm-icon"><Mail size={22} /></div>
          <div className="lsm-title-block">
            <h3 className="lsm-title" id="ed-title">Email documents</h3>
            <p className="lsm-sub">{studentName} · passport and academic documents</p>
          </div>
          <button type="button" ref={closeRef} className="lsm-close" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="lsm-body">
          {settings === null ? (
            <div className="ed-loading"><div className="loading-dots"><span /><span /><span /></div></div>
          ) : (
            <>
              {!settings.configured && (
                <p className="ed-warn"><AlertCircle size={15} aria-hidden="true" /> Email isn&apos;t set up on the server yet, so this can&apos;t send. Ask whoever manages the backend to add the DocLocker mailbox&apos;s app password.</p>
              )}
              <fieldset className="ed-to">
                <legend>Send to</legend>
                {settings.presets.map((e) => (
                  <label key={e} className={`ed-option${picked.has(e) ? " is-on" : ""}`}>
                    <input type="checkbox" checked={picked.has(e)} onChange={() => toggle(e)} />
                    <span className="ed-avatar" aria-hidden="true">{e.slice(0, 1).toUpperCase()}</span>
                    <span className="ed-addr">{e}</span>
                  </label>
                ))}
                <label className={`ed-option ed-option--other${otherClean && !otherBad ? " is-on" : ""}${otherBad ? " is-bad" : ""}`}>
                  <span className="ed-avatar is-other" aria-hidden="true"><Mail size={14} /></span>
                  <input
                    type="email"
                    className="ed-other"
                    placeholder={settings.presets.length ? "Another email address" : "Email address"}
                    value={other}
                    onChange={(e) => setOther(e.target.value)}
                    aria-label="Another email address"
                    aria-invalid={Boolean(otherBad)}
                  />
                </label>
              </fieldset>

              <label className="lsm-remark-label" htmlFor="ed-note">Note <span className="lsm-optional">optional, goes in the email</span></label>
              <textarea id="ed-note" className="lsm-remark-input" rows={2} maxLength={500} placeholder="e.g. For the Hyderabad file review" value={note} onChange={(e) => setNote(e.target.value)} />

              <div className="ed-files">
                <p><Paperclip size={14} aria-hidden="true" /> {files.length} attachment{files.length === 1 ? "" : "s"}</p>
                <ul>{files.map((f) => <li key={f.id}><FileText size={13} aria-hidden="true" /> {f.label}</li>)}</ul>
              </div>
              {settings.from && <p className="ed-from">Sent from <strong>{settings.from}</strong>. It goes out in the background; you can keep working.</p>}
            </>
          )}

          {err && <p className="lsm-error">{err}</p>}

          <div className="lsm-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !settings?.configured || !recipients.length}>
              {busy ? <><RefreshCw size={13} className="spin" /> Queuing…</> : <><Send size={14} /> Send to {recipients.length || "…"}</>}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Bottom-corner notices for emails going out in the background
export function EmailJobsToasts({ jobs, onDismiss }) {
  if (!jobs.length) return null;
  return (
    <div className="ed-toasts" aria-live="polite">
      {jobs.map((j) => (
        <div key={j.id} className={`ed-toast is-${j.status}`} role="status">
          <span className="ed-toast-icon" aria-hidden="true">
            {j.status === "sent" ? <CheckCircle size={17} /> : j.status === "failed" ? <AlertCircle size={17} /> : <RefreshCw size={16} className="spin" />}
          </span>
          <span className="ed-toast-text">
            <strong>
              {j.status === "sent" ? `Sent ${j.studentName}'s documents` : j.status === "failed" ? `Couldn't send ${j.studentName}'s documents` : `Sending ${j.studentName}'s documents…`}
            </strong>
            <span>{j.status === "failed" ? j.error : `To ${j.recipients.join(", ")}${j.parts > 1 ? ` in ${j.parts} emails` : ""}`}</span>
          </span>
          {(j.status === "sent" || j.status === "failed") && (
            <button type="button" className="ed-toast-close" onClick={() => onDismiss(j.id)} aria-label="Dismiss"><X size={14} /></button>
          )}
        </div>
      ))}
    </div>
  );
}
