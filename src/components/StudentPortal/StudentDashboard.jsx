import { createElement } from "react";
import {
  CircleCheck,
  Clock3,
  CircleAlert,
  CloudUpload,
  ChevronRight,
  ArrowRight,
  TriangleAlert,
} from "lucide-react";
import { iconFor } from "../FileUploadBox/docMeta";
import { LOAN_STATUS, loanStatusKey, applicationRows, initials, firstName } from "./studentRecord";
import "./StudentDashboard.css";

const DOC_CHIPS = {
  verified:  { label: "Verified",        tone: "success", icon: CircleCheck },
  uploaded:  { label: "Uploaded",        tone: "success", icon: CircleCheck },
  attention: { label: "Needs attention", tone: "error",   icon: CircleAlert },
  pending:   { label: "Pending",         tone: "warning", icon: Clock3 },
  upload:    { label: "Upload",          tone: "info",    icon: CloudUpload },
};

// Soft icon-tile colour per document type, so the grid scans like the
// mockup (blue / coral / teal / amber / violet).
const HUES = {
  passport: "blue", aadhar: "coral", pan: "blue", photo: "violet", resume: "teal",
  signature: "violet", "Visa History": "blue", cibil_report: "amber", salary_slip_applicant: "amber",
  marksheet_10: "teal", marksheet_12: "amber", Diploma_marksheet: "teal", graduation: "teal",
  degree_certificate: "violet", MOI: "blue", PC: "amber", CMM: "coral", LOR: "violet", OD: "blue",
  salary_slip_3m: "amber", bank_stmt_6m: "teal", business_proof: "violet",
};
const CYCLE = ["blue", "coral", "teal", "amber", "violet"];
const hueFor = (id, i) => HUES[id] || (/^(itr_|form16)/.test(id) ? "coral" : /scorecard$/.test(id) ? "teal" : CYCLE[i % CYCLE.length]);

export function StatusChip({ status }) {
  const c = DOC_CHIPS[status];
  return (
    <span className={`sd-chip is-${c.tone}`}>
      {createElement(c.icon, { size: 14, strokeWidth: 2.2, "aria-hidden": true })}
      {c.label}
    </span>
  );
}

export function LoanChip({ student }) {
  const s = LOAN_STATUS[loanStatusKey(student)];
  return <span className={`sd-loanchip is-${s.tone}`}>{s.label}</span>;
}

function Ring({ done, total }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <div className="sd-ring" role="img" aria-label={`${done} of ${total} required documents uploaded`}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={r} className="sd-ring__track" />
        <circle cx="64" cy="64" r={r} className="sd-ring__value" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <span className="sd-ring__label" aria-hidden="true">
        <strong>{done}</strong><span>/{total}</span>
      </span>
    </div>
  );
}

export function DetailRows({ rows }) {
  return (
    <dl className="sd-rows">
      {rows.map((r) => (
        <div key={r.label} className="sd-row">
          <dt>{r.label}</dt>
          <dd className={r.value ? (r.strong ? "is-strong" : undefined) : "is-empty"}>{r.value || r.placeholder}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function StudentDashboard({
  student,
  applicationId,
  done,
  total,
  counts,
  groups,
  reviewCount,
  onOpenDoc,
  onViewAll,
  onLoanDetails,
  onOpenProfile,
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const name = firstName(student.name);
  const stats = [
    { key: "verified", label: "Verified by AI", value: counts.verified, icon: CircleCheck },
    { key: "pending", label: "Pending", value: counts.pending, icon: Clock3 },
    { key: "attention", label: "Needs Attention", value: counts.attention, icon: CircleAlert },
  ];

  return (
    <div className="sd-page">
      <div className="sd-top">
        <div className="sd-welcome">
          <span className="sd-welcome__avatar" aria-hidden="true">{initials(student.name)}</span>
          <div className="sd-welcome__text">
            <h1 className="sd-welcome__title">
              <span className="sd-wide">Welcome back, {name}!</span>
              <span className="sd-narrow">Hi {name}!</span>
            </h1>
            <p className="sd-welcome__sub">
              <span className="sd-wide">Let&apos;s complete your documents for a faster loan approval.</span>
              <span className="sd-narrow">Let&apos;s complete your documents.</span>
            </p>
          </div>
        </div>

        <section className="sd-card sd-completion" aria-labelledby="sd-completion-title">
          <h2 className="sd-card__title" id="sd-completion-title">Document Completion</h2>
          <div className="sd-completion__body">
            <Ring done={done} total={total} />
            <div className="sd-completion__main">
              <div className="sd-completion__text">
                <p className="sd-completion__label" aria-hidden="true">Documents Completed</p>
                <div className="sd-progress">
                  <span className="sd-progress__pct">{pct}%<span className="sd-wide"> completed</span></span>
                  <span
                    className="sd-progress__bar"
                    role="progressbar"
                    aria-label="Required documents uploaded"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                  >
                    <span style={{ width: `${pct}%` }} />
                  </span>
                </div>
              </div>
              <ul className="sd-stats">
                {stats.map((s) => (
                  <li key={s.key} className={`sd-stat is-${s.key}`}>
                    <span className="sd-stat__icon" aria-hidden="true">{createElement(s.icon, { size: 22, strokeWidth: 2.4 })}</span>
                    <span className="sd-stat__text">
                      <strong>{s.value}</strong>
                      <span>{s.label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {reviewCount > 0 && (
            <button type="button" className="sd-note" onClick={onOpenProfile}>
              <TriangleAlert size={16} aria-hidden="true" />
              <span>{reviewCount} profile {reviewCount === 1 ? "detail" : "details"} read from your documents {reviewCount === 1 ? "needs" : "need"} a quick check</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
        </section>

        <section className="sd-card sd-loan" aria-labelledby="sd-loan-title">
          <div className="sd-loan__head">
            <h2 className="sd-card__title" id="sd-loan-title">Loan Application</h2>
            <LoanChip student={student} />
          </div>
          <DetailRows rows={applicationRows(student, applicationId)} />
          <button type="button" className="sd-outline-btn" onClick={onLoanDetails}>
            View Full Details <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      </div>

      <section className="sd-docs" aria-labelledby="sd-docs-title">
        <div className="sd-docs__head">
          <div>
            <h2 className="sd-docs__title" id="sd-docs-title">Your Documents</h2>
            <p className="sd-docs__sub">Upload all required documents. We read your IDs and certificates to verify them and auto-fill your profile.</p>
          </div>
          <button type="button" className="sd-viewall" onClick={onViewAll}>View All</button>
        </div>

        {groups.filter((g) => g.items.length).map((g, gi) => (
          <div key={g.key} className="sd-group">
            {gi > 0 && <h3 className="sd-group__title">{g.title}</h3>}
            <ul className="sd-tiles">
              {g.items.map((it, i) => (
                <li key={it.key}>
                  <button type="button" className="sd-tile" onClick={() => onOpenDoc(it)}>
                    <span className={`sd-tile__icon hue-${hueFor(it.field.id, i)}`} aria-hidden="true">
                      {createElement(iconFor(it.field.id), { size: 28, strokeWidth: 1.9 })}
                    </span>
                    <span className="sd-tile__body">
                      <span className="sd-tile__name">{it.title}</span>
                      <span className="sd-tile__foot">
                        <StatusChip status={it.status} />
                        <ChevronRight size={18} className="sd-tile__chev" aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
