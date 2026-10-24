import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, CircleAlert, ArrowRight, Download, Eye, FolderOpen, FolderArchive, FileText, Landmark,
  LoaderCircle, RefreshCw, ChevronLeft, Upload, UserRound, Sparkles, History, Send, PencilLine,
  FileCheck2, UserRoundCheck, ShieldCheck, Users, GraduationCap, IdCard,
} from "lucide-react";
import DocumentViewer from "../DocumentViewer/DocumentViewer";
import {
  fetchMyDocuments, fetchMyActivity, downloadMyDocument, downloadMyZip, openMyDocument,
} from "../../utils/applicantApi";
import { LOAN_STATUS, loanStatusKey, formatAppliedOn, firstName } from "./studentRecord";
import { percent } from "./profileFields";
import "./ApplicantDashboard.css";

// The viewer loads files through the applicant's own session.
const loadBlob = (id) => openMyDocument(id).then((r) => r.blob);

// ── Where the application is ──────────────────────────────────────────────
const STAGES = [
  { key: "submitted",  label: "Submitted" },
  { key: "pending",    label: "Under review" },
  { key: "inprocess",  label: "With lenders" },
  { key: "sanctioned", label: "Sanctioned" },
  { key: "disbursed",  label: "Disbursed" },
];
const STAGE_TEXT = {
  pending:    "Your advisor is checking your documents and details. They’ll contact you if anything else is needed.",
  inprocess:  "Your file is with our lending partners. Lenders review applications in a few working days.",
  sanctioned: "A lender has sanctioned your education loan. Your advisor will walk you through the sanction letter.",
  disbursed:  "The lender has released your loan amount. Congratulations!",
};

function StatusHead({ student }) {
  const key = loanStatusKey(student);
  const closed = key === "rejected" || key === "dropped";
  const at = closed ? -1 : STAGES.findIndex((s) => s.key === key);
  const meta = LOAN_STATUS[key];
  return (
    <div className="ad-hero__status">
      <p className="ad-eyebrow">Application status</p>
      <div className="ad-hero__status-row">
        <h2 className="ad-status__title" id="ad-status-title">{closed ? meta.title : STAGES[Math.max(at, 0)].label}</h2>
        <span className={`ad-pill is-${meta.tone}`}>{meta.label}</span>
      </div>
    </div>
  );
}

function StatusTracker({ student }) {
  const key = loanStatusKey(student);
  const closed = key === "rejected" || key === "dropped";
  const at = closed ? -1 : STAGES.findIndex((s) => s.key === key);
  const meta = LOAN_STATUS[key];
  return (
    <section className={`ad-status${closed ? " is-closed" : ""}`} aria-labelledby="ad-status-title">
      {closed ? (
        <p className="ad-status__closed"><CircleAlert size={18} aria-hidden="true" /> <span>{student.loanRemark || meta.text}</span></p>
      ) : (
        <>
          <ol className="ad-track">
            {STAGES.map((s, i) => {
              const state = i < at || (i === at && s.key === "disbursed") ? "done" : i === at ? "current" : "todo";
              return (
                <li key={s.key} className={`ad-track__step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
                  <span className="ad-track__dot" aria-hidden="true">{state === "done" ? <Check size={12} strokeWidth={3} /> : null}</span>
                  <span className="ad-track__label">{s.label}</span>
                </li>
              );
            })}
          </ol>
          <p className="ad-status__text">
            {STAGE_TEXT[key]}
            {student.loanStatusUpdatedAt && <span className="ad-status__updated"> Updated {formatAppliedOn(student.loanStatusUpdatedAt)}.</span>}
          </p>
        </>
      )}
    </section>
  );
}

// ── Documents: folders, files, zip ────────────────────────────────────────
function folderLabel(group, personalInfo = {}) {
  const co = /Co_Applicant_(\d+)/i.exec(group || "");
  if (co) {
    const info = personalInfo[`co_info_${Number(co[1]) - 1}`] || {};
    const name = [info.firstName, info.lastName].filter(Boolean).join(" ");
    return name ? `Co-applicant · ${name}` : `Co-applicant ${co[1]}`;
  }
  return ({
    "GOVT ID": "Identity documents",
    Academics: "Education",
    Other_Documents: "Other documents",
    Others: "Application form",
  })[group] || (group ? group.replace(/_/g, " ") : "Other");
}
const FOLDER_ICON = { "GOVT ID": IdCard, Academics: GraduationCap, Others: FileCheck2 };
const folderIcon = (group) => (/Co_Applicant/i.test(group) ? Users : FOLDER_ICON[group] || FolderOpen);
// Colour family of a folder tile (presentation only).
const FOLDER_KIND = { "GOVT ID": "id", Academics: "edu", Others: "form" };
const folderKind = (group) => (/Co_Applicant/i.test(group || "") ? "co" : FOLDER_KIND[group] || "other");
// Identity first, application form last.
const folderOrder = (g) => (g === "GOVT ID" ? 0 : g === "Academics" ? 1 : /Co_Applicant/i.test(g) ? 2 : g === "Others" ? 4 : 3);

function formatSize(n) {
  const v = Number(n);
  if (!v) return "";
  if (v < 1024 * 1024) return `${Math.max(1, Math.round(v / 1024))} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}
const readableName = (name) => String(name || "").replace(/\.[^.]+$/, "").replace(/_/g, " ");
const isApplicationForm = (f) => /student_summary/i.test(f.name);

// Re-read whenever `refreshKey` changes (each time a section opens), so a
// file added meanwhile — like the Application Form drawn after submitting —
// shows up without a reload.
function useMyDocuments(refreshKey) {
  const [state, setState] = useState({ loading: true, error: "", groups: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchMyDocuments()
      .then((groups) => { if (!cancelled) setState({ loading: false, error: "", groups: [...groups].sort((a, b) => folderOrder(a.group) - folderOrder(b.group)) }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message, groups: [] }); });
    return () => { cancelled = true; };
  }, [attempt, refreshKey]);
  const reload = useCallback(() => { setState((s) => ({ ...s, loading: true })); setAttempt((n) => n + 1); }, []);
  return { ...state, reload };
}

function DownloadButton({ onDownload, label, busyLabel = "Preparing…", className = "ad-btn ad-btn--ghost", icon: Icon = Download }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true);
    setError("");
    try { await onDownload(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <span className="ad-dl">
      <button type="button" className={className} onClick={run} disabled={busy}>
        {busy ? <LoaderCircle size={16} className="ad-spin" aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
        <span>{busy ? busyLabel : label}</span>
      </button>
      {error && <span className="ad-dl__error" role="alert">{error}</span>}
    </span>
  );
}

function DocumentsLibrary({ docs, student, onAddDocuments }) {
  const [openGroup, setOpenGroup] = useState(null);
  const [viewing, setViewing] = useState(null);
  const info = student.personalInfo || {};
  const total = docs.groups.reduce((a, g) => a + g.files.length, 0);
  const folder = docs.groups.find((g) => g.group === openGroup);

  if (docs.loading) return <StateBlock icon={LoaderCircle} spin text="Loading your documents…" />;
  if (docs.error) return <StateBlock icon={CircleAlert} text={docs.error} action={<button type="button" className="ad-btn ad-btn--ghost" onClick={docs.reload}><RefreshCw size={16} aria-hidden="true" /> Try again</button>} />;
  if (!total) {
    return <StateBlock icon={FolderOpen} text="No documents yet." action={<button type="button" className="ad-btn ad-btn--primary" onClick={onAddDocuments}><Upload size={16} aria-hidden="true" /> Upload documents</button>} />;
  }

  return (
    <div className="ad-lib">
      {folder ? (
        <div className={`ad-card ad-lib__folder is-${folderKind(folder.group)}`}>
          <div className="ad-lib__bar">
            <button type="button" className="ad-btn ad-btn--text" onClick={() => setOpenGroup(null)}>
              <ChevronLeft size={17} aria-hidden="true" /> All folders
            </button>
            <DownloadButton label="Download folder" onDownload={() => downloadMyZip(folder.group)} icon={FolderArchive} />
          </div>
          <h2 className="ad-lib__folder-title">{folderLabel(folder.group, info)}</h2>
          <ul className="ad-files">
            {folder.files.map((f) => (
              <li key={f.id} className="ad-file">
                <span className="ad-file__icon" aria-hidden="true"><FileText size={18} /></span>
                <span className="ad-file__body">
                  <span className="ad-file__name">{isApplicationForm(f) ? "Application form" : readableName(f.name)}</span>
                  <span className="ad-file__meta">{[f.name.split(".").pop()?.toUpperCase(), formatSize(f.size), formatAppliedOn(f.updatedAt)].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="ad-file__actions">
                  <button type="button" className="ad-icon-btn" onClick={() => setViewing({ file: f, files: folder.files })} aria-label={`View ${f.name}`} title="View">
                    <Eye size={17} aria-hidden="true" />
                  </button>
                  <DownloadIcon fileId={f.id} name={f.name} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="ad-lib__bar is-banner">
            <p className="ad-lib__summary">
              <span className="ad-tile is-sapphire" aria-hidden="true"><FolderOpen size={18} /></span>
              <span><strong>{total} file{total === 1 ? "" : "s"}</strong> in {docs.groups.length} folder{docs.groups.length === 1 ? "" : "s"}</span>
            </p>
            <DownloadButton label="Download all (.zip)" busyLabel="Preparing zip…" onDownload={() => downloadMyZip()} className="ad-btn ad-btn--primary" icon={FolderArchive} />
          </div>
          <ul className="ad-folders">
            {docs.groups.map((g) => {
              const Icon = folderIcon(g.group);
              const latest = g.files.map((f) => f.updatedAt).filter(Boolean).sort().pop();
              return (
                <li key={g.group}>
                  <button type="button" className={`ad-folder is-${folderKind(g.group)}`} onClick={() => setOpenGroup(g.group)}>
                    <span className="ad-folder__icon" aria-hidden="true"><Icon size={19} /></span>
                    <span className="ad-folder__name">{folderLabel(g.group, info)}</span>
                    <span className="ad-folder__meta">
                      {g.files.length} file{g.files.length === 1 ? "" : "s"}{latest ? ` · ${formatAppliedOn(latest)}` : ""}
                    </span>
                    <ArrowRight size={16} className="ad-folder__go" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="ad-btn ad-btn--ghost ad-lib__add" onClick={onAddDocuments}>
            <Upload size={16} aria-hidden="true" /> Add or replace documents
          </button>
        </>
      )}
      {viewing && (
        <DocumentViewer
          file={viewing.file}
          files={viewing.files}
          onClose={() => setViewing(null)}
          fetchBlob={loadBlob}
          download={downloadMyDocument}
          downloadText="Download"
        />
      )}
    </div>
  );
}

function DownloadIcon({ fileId, name }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="ad-icon-btn"
      disabled={busy}
      onClick={async () => { setBusy(true); try { await downloadMyDocument(fileId); } catch { /* the viewer shows errors; a retry is one tap */ } finally { setBusy(false); } }}
      aria-label={`Download ${name}`}
      title="Download"
    >
      {busy ? <LoaderCircle size={17} className="ad-spin" aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
    </button>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────
const dayKey = (iso) => new Date(iso).toDateString();
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

// Raw entries → readable events. Repeats on the same day (ten uploads, a
// lender opening five files) become one line.
function buildEvents(items) {
  const events = [];
  const merged = new Map();
  const bump = (key, make, extra) => {
    const ev = merged.get(key);
    if (ev) { ev.count += 1; if (extra) ev.files.push(extra); return; }
    const created = { ...make, count: 1, files: extra ? [extra] : [] };
    merged.set(key, created);
    events.push(created);
  };
  for (const it of items) {
    const day = dayKey(it.at);
    switch (it.action) {
      case "student.register":
        events.push({ id: it.id, at: it.at, icon: Sparkles, tone: "info", accent: "start", text: "You started your application" });
        break;
      case "applicant.submit":
        events.push({ id: it.id, at: it.at, icon: Send, tone: "info", accent: "milestone", text: "You submitted your application" });
        break;
      case "loan_status.update": {
        const label = LOAN_STATUS[it.status]?.label || it.status;
        events.push({ id: it.id, at: it.at, icon: History, tone: LOAN_STATUS[it.status]?.tone || "info", text: `Status changed to ${label}`, note: it.remark });
        break;
      }
      case "banker_access.grant":
      case "banker_access.approve":
        events.push({ id: it.id, at: it.at, icon: Landmark, tone: "success", text: `Shared with ${it.bank}` });
        break;
      case "banker_access.revoke":
        events.push({ id: it.id, at: it.at, icon: Landmark, tone: "muted", text: `No longer shared with ${it.bank}` });
        break;
      case "document.upload":
        bump(`up|${day}`, { id: it.id, at: it.at, icon: Upload, tone: "info", kind: "upload" }, readableName(it.file));
        break;
      default:
        if (it.bank) bump(`bank|${it.bank}|${day}`, { id: it.id, at: it.at, icon: Eye, tone: "info", text: `${it.bank} reviewed your documents` });
        else bump(`staff|${day}`, { id: it.id, at: it.at, icon: UserRound, tone: "info", text: "Your advisor reviewed your documents" });
    }
  }
  for (const ev of events) {
    if (ev.kind === "upload") ev.text = ev.count === 1 ? `You uploaded ${ev.files[0] || "a document"}` : `You uploaded ${ev.count} documents`;
  }
  return events;
}

function useMyActivity(refreshKey) {
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  useEffect(() => {
    let cancelled = false;
    fetchMyActivity()
      .then((items) => { if (!cancelled) setState({ loading: false, error: "", items }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message, items: [] }); });
    return () => { cancelled = true; };
  }, [refreshKey]);
  return state;
}

function ActivityList({ activity, limit }) {
  const events = useMemo(() => buildEvents(activity.items), [activity.items]);
  if (activity.loading) return <StateBlock icon={LoaderCircle} spin text="Loading activity…" />;
  if (activity.error) return <StateBlock icon={CircleAlert} text={activity.error} />;
  if (!events.length) return <StateBlock icon={History} text="Nothing here yet." />;
  const shown = limit ? events.slice(0, limit) : events;
  return (
    <ol className={`ad-timeline${limit ? " is-compact" : ""}`}>
      {shown.map((ev, i) => {
        const Icon = ev.icon;
        // A date heading above the first event of each day (full list only).
        const showDay = !limit && (i === 0 || dayKey(shown[i - 1].at) !== dayKey(ev.at));
        return (
          <li key={ev.id} className="ad-event">
            {showDay && <p className="ad-event__day">{dayLabel(ev.at)}</p>}
            <div className="ad-event__row">
              <span className={`ad-event__icon is-${ev.accent || ev.tone}`} aria-hidden="true"><Icon size={15} /></span>
              <div className="ad-event__body">
                <p className="ad-event__text">{ev.text}</p>
                {ev.note && <p className="ad-event__note">“{ev.note}”</p>}
                {ev.kind === "upload" && ev.count > 1 && (
                  <details className="ad-event__more">
                    <summary>Show documents</summary>
                    <ul>{[...new Set(ev.files.filter(Boolean))].map((f) => <li key={f}>{f}</li>)}</ul>
                  </details>
                )}
              </div>
              <time className="ad-event__time" dateTime={ev.at}>{limit ? dayLabel(ev.at) : timeOf(ev.at)}</time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Application summary ───────────────────────────────────────────────────
const fmtDate = (v) => (v ? formatAppliedOn(v) : "");
const money = (v) => (v ? `₹${Number(v).toLocaleString("en-IN")}` : "");

function ApplicationSummary({ student, applicationId, counts, docs, onEdit }) {
  const info = student.personalInfo || {};
  const form = docs.groups.flatMap((g) => g.files).find(isApplicationForm);
  const coCount = student.coApplicants || 1;
  const sections = [
    {
      title: "About you", step: "details", icon: UserRound, hue: "sapphire", rows: [
        ["Full name", [info.firstName, info.lastName].filter(Boolean).join(" ") || student.name],
        ["Date of birth", fmtDate(info.dob)], ["Gender", info.gender], ["Mobile", info.phone || student.phone], ["Email", info.email || student.email],
        ["Present address", info.currentAddress],
      ],
    },
    {
      title: "Study plans", step: "details", icon: GraduationCap, hue: "gold", rows: [
        ["Loan amount", money(info.loanAmount)], ["Destination", info.destinationCountry], ["Course & university", info.courseNameUniversity],
        ["Track", info.loanTrack], ["Highest qualification", [info.qualName, info.qualYear].filter(Boolean).join(", ")],
      ],
    },
    {
      title: "Family", step: "details", icon: Users, hue: "midnight", rows: [
        ["Father", info.fatherName], ["Mother", info.motherName],
        ...Array.from({ length: coCount }, (_, i) => {
          const c = info[`co_info_${i}`] || {};
          return [`Co-applicant ${i + 1}`, [[c.firstName, c.lastName].filter(Boolean).join(" "), c.relation].filter(Boolean).join(" · ")];
        }),
      ],
    },
  ];

  return (
    <div className="ad-app">
      <section className="ad-card ad-app__form">
        <span className="ad-app__form-icon" aria-hidden="true"><FileCheck2 size={20} /></span>
        <div className="ad-app__form-text">
          <h2>Application form</h2>
          <p>{form ? `Prepared from your details and documents · ${formatAppliedOn(form.updatedAt) || "latest"}` : "It’s prepared automatically from your details. It will appear here shortly."}</p>
        </div>
        {form && <DownloadButton label="Download PDF" onDownload={() => downloadMyDocument(form.id)} className="ad-btn ad-btn--light" />}
      </section>

      <div className="ad-app__meters">
        <MiniMeter icon={FileCheck2} label="Documents" {...counts.docs} onClick={() => onEdit("identity")} />
        <MiniMeter icon={UserRoundCheck} label="Details" {...counts.details} onClick={() => onEdit("details")} />
      </div>

      {sections.map(({ icon: SectionIcon, ...s }) => (
        <section key={s.title} className="ad-card ad-section">
          <div className="ad-card__head">
            <h2 className="ad-card__title"><span className={`ad-tile is-${s.hue}`} aria-hidden="true"><SectionIcon size={16} /></span> {s.title}</h2>
            <button type="button" className="ad-btn ad-btn--text" onClick={() => onEdit(s.step)}>
              <PencilLine size={15} aria-hidden="true" /> Edit
            </button>
          </div>
          <dl className="ad-rows">
            {s.rows.map(([label, value]) => (
              <div key={label} className="ad-row">
                <dt>{label}</dt>
                <dd className={value ? undefined : "is-empty"}>{value || "Not added"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="ad-muted ad-app__id">Application ID <strong>{applicationId}</strong></p>
    </div>
  );
}

function MiniMeter({ icon: Icon, label, done, total, onClick }) {
  const pct = percent(done, total);
  const complete = total > 0 && done >= total;
  return (
    <button type="button" className="ad-meter" onClick={onClick}>
      <span className="ad-meter__top">
        <span className="ad-meter__label"><Icon size={15} aria-hidden="true" /> {label}</span>
        <span className={`ad-meter__count${complete ? " is-done" : ""}`}>{done}/{total}</span>
      </span>
      <span className="ad-meter__bar" aria-hidden="true"><span style={{ width: `${pct}%` }} className={complete ? "is-done" : undefined} /></span>
    </button>
  );
}

// Decoration only: the gold orbit from the logo, with a "satellite" at the
// end of its arc — the same mark as the guided steps' band.
// `from` and `sweep` are degrees, clockwise from three o'clock.
function OrbitRing({ className = "", from = 110, sweep = 85 }) {
  const end = ((from + sweep) * Math.PI) / 180;
  return (
    <svg className={`ad-orbit ${className}`} viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      {/* fill/stroke attributes are the fallback; the stylesheet refines them */}
      <circle className="ad-orbit__track" cx="120" cy="120" r="96" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
      <circle className="ad-orbit__track is-inner" cx="120" cy="120" r="64" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
      <circle
        className="ad-orbit__arc"
        cx="120" cy="120" r="96"
        fill="none" stroke="#f2a623" strokeWidth="3" strokeLinecap="round"
        pathLength="360" strokeDasharray={`${sweep} 360`} transform={`rotate(${from} 120 120)`}
      />
      <circle className="ad-orbit__sat" cx={120 + 96 * Math.cos(end)} cy={120 + 96 * Math.sin(end)} r="7" fill="#f2a623" />
    </svg>
  );
}

function StateBlock({ icon: Icon, text, action, spin }) {
  return (
    <div className="ad-state" role={spin ? "status" : undefined}>
      <Icon size={22} className={spin ? "ad-spin" : undefined} aria-hidden="true" />
      <p>{text}</p>
      {action}
    </div>
  );
}

// ── The dashboard ─────────────────────────────────────────────────────────
//   missing: [{ key, label, group, step }] — required items still to add
export default function ApplicantDashboard({ view, onViewChange, student, applicationId, counts, missing, lenders, onEdit }) {
  const docs = useMyDocuments(view);
  const activity = useMyActivity(view);

  if (view === "documents") {
    return (
      <div className="ad-page">
        <PageHead title="Documents" text="Everything in your file, sorted into folders. Download one file, a folder, or everything as a zip." />
        <DocumentsLibrary docs={docs} student={student} onAddDocuments={() => onEdit("identity")} />
      </div>
    );
  }
  if (view === "application") {
    return (
      <div className="ad-page">
        <PageHead title="My application" text="What lenders see about you. Keep it up to date." />
        <ApplicationSummary student={student} applicationId={applicationId} counts={counts} docs={docs} onEdit={onEdit} />
      </div>
    );
  }
  if (view === "activity") {
    return (
      <div className="ad-page">
        <PageHead title="Activity" text="Everything that has happened on your application." />
        <section className="ad-card ad-activity"><ActivityList activity={activity} /></section>
      </div>
    );
  }

  const appliedOn = formatAppliedOn(student.applicationSubmittedAt || student.createdAt);
  return (
    <div className="ad-page">
      <div className={`ad-hero${missing.length > 0 ? " has-todo" : ""}`}>
        <OrbitRing className="ad-hero__orbit" from={105} sweep={80} />
        <div className="ad-hero__top">
          <div className="ad-hello">
            <h1 className="ad-hello__title">Hi {firstName(student.name)}</h1>
            <p className="ad-hello__sub">
              <span><strong>{applicationId}</strong>{appliedOn ? ` · submitted ${appliedOn}` : ""}</span>
              <span className="ad-secure"><ShieldCheck size={13} aria-hidden="true" /> Encrypted</span>
            </p>
          </div>
          <StatusHead student={student} />
        </div>

        <StatusTracker student={student} />

        {missing.length > 0 && (
          <section className="ad-todo" aria-labelledby="ad-todo-title">
            <span className="ad-todo__icon" aria-hidden="true"><CircleAlert size={20} /></span>
            <div className="ad-todo__body">
              <h2 id="ad-todo-title">{missing.length} item{missing.length === 1 ? "" : "s"} still needed</h2>
              <p>{missing.slice(0, 3).map((m) => m.label).join(", ")}{missing.length > 3 ? ` and ${missing.length - 3} more` : ""}</p>
            </div>
            <button type="button" className="ad-btn ad-btn--primary ad-todo__btn" onClick={() => onEdit(missing[0].step)}>
              Add now <ArrowRight size={15} aria-hidden="true" />
            </button>
          </section>
        )}
      </div>

      <div className="ad-grid">
        <section className="ad-card ad-file-card" aria-labelledby="ad-file-title">
          <div className="ad-card__head">
            <h2 className="ad-card__title" id="ad-file-title"><span className="ad-tile is-sapphire" aria-hidden="true"><FileCheck2 size={17} /></span> Your file</h2>
            <button type="button" className="ad-btn ad-btn--text" onClick={() => onViewChange("documents")}>
              Open <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="ad-app__meters is-stacked">
            <MiniMeter icon={FileCheck2} label="Documents" {...counts.docs} onClick={() => onViewChange("documents")} />
            <MiniMeter icon={UserRoundCheck} label="Details" {...counts.details} onClick={() => onViewChange("application")} />
          </div>
          <div className="ad-quick">
            <DownloadButton label="Download all (.zip)" busyLabel="Preparing zip…" onDownload={() => downloadMyZip()} icon={FolderArchive} />
            <button type="button" className="ad-btn ad-btn--ghost" onClick={() => onViewChange("application")}>
              <FileText size={16} aria-hidden="true" /> Application form
            </button>
          </div>
        </section>

        <section className="ad-card ad-lenders-card" aria-labelledby="ad-lenders-title">
          <div className="ad-card__head">
            <h2 className="ad-card__title" id="ad-lenders-title"><span className="ad-tile is-midnight" aria-hidden="true"><Landmark size={17} /></span> Lenders</h2>
          </div>
          {lenders.length ? (
            <ul className="ad-lenders">
              {lenders.map((bank) => (
                <li key={bank}><span className="ad-lenders__mark" aria-hidden="true">{bank.slice(0, 1)}</span> <span>{bank}</span> <span className="ad-pill is-info">Reviewing</span></li>
              ))}
            </ul>
          ) : (
            <div className="ad-lenders__empty">
              <span className="ad-lenders__art" aria-hidden="true"><Landmark size={26} /></span>
              <p className="ad-empty">Your advisor shares your file with the lenders that suit you best once it’s complete.</p>
            </div>
          )}
        </section>

        <section className="ad-card ad-activity-card" aria-labelledby="ad-act-title">
          <div className="ad-card__head">
            <h2 className="ad-card__title" id="ad-act-title"><span className="ad-tile is-tint" aria-hidden="true"><History size={17} /></span> Recent activity</h2>
            <button type="button" className="ad-btn ad-btn--text" onClick={() => onViewChange("activity")}>
              View all <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          <ActivityList activity={activity} limit={5} />
        </section>
      </div>
    </div>
  );
}

function PageHead({ title, text }) {
  return (
    <div className="ad-head">
      <h1 className="ad-head__title">{title}</h1>
      {text && <p className="ad-head__text">{text}</p>}
    </div>
  );
}
