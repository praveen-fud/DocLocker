import { useState } from "react";
import {
  Sparkles,
  CircleCheck,
  TriangleAlert,
  CircleX,
  Eye,
  EyeOff,
  ArrowRight,
  FileCheck2,
  Layers,
  FileType2,
  HardDrive,
  ScanSearch,
} from "lucide-react";
import PdfUnlockBanner from "../PdfUnlockBanner/PdfUnlockBanner";
import "./PortalRail.css";

// ── AI verification results ───────────────────────────────────────────────────
function formatDate(v) {
  if (!v) return "";
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const maskId = (v = "") => {
  const s = String(v).replace(/\s+/g, "");
  if (s.length <= 3) return "•".repeat(s.length);
  return `${"•".repeat(Math.max(s.length - 3, 3))}${s.slice(-3)}`;
};

const CROSS = {
  match:    { icon: CircleCheck,   tone: "success", text: (n) => (n >= 2 ? `Matches across ${n} documents` : "Matches your documents") },
  partial:  { icon: TriangleAlert, tone: "warning", text: () => "Differs slightly between documents" },
  mismatch: { icon: CircleX,       tone: "error",   text: () => "Doesn't match between documents" },
};

function crossStatus(cross) {
  const c = CROSS[cross.status];
  const Icon = c.icon;
  return (
    <span className={`rail-field__state is-${c.tone}`}>
      <Icon size={13} aria-hidden="true" /> {c.text(cross.count)}
    </span>
  );
}

function FieldRow({ label, value, source, review, cross, sensitive }) {
  const [revealed, setRevealed] = useState(false);
  const shown = sensitive && value && !revealed ? maskId(value) : value;

  let status;
  if (!value) {
    status = <span className="rail-field__state is-muted">Not read yet</span>;
  } else if (cross && cross.status !== "match" && CROSS[cross.status]) {
    status = crossStatus(cross);
  } else if (review) {
    // The reader's own doubt outranks a match: the student should still look.
    status = (
      <span className="rail-field__state is-warning" title={review}>
        <TriangleAlert size={13} aria-hidden="true" /> Please check
      </span>
    );
  } else if (cross && CROSS[cross.status]) {
    status = crossStatus(cross);
  } else if (source) {
    status = (
      <span className="rail-field__state is-ai">
        <Sparkles size={13} aria-hidden="true" /> From {source}
      </span>
    );
  } else {
    status = <span className="rail-field__state is-muted">Entered by you</span>;
  }

  return (
    <li className="rail-field">
      <div className="rail-field__top">
        <span className="rail-field__label">{label}</span>
        {status}
      </div>
      <div className="rail-field__value">
        <span className={value ? undefined : "is-empty"}>{shown || "—"}</span>
        {sensitive && value && (
          <button
            type="button"
            className="rail-reveal"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          </button>
        )}
      </div>
      {review && value && <p className="rail-field__reason">{review}</p>}
    </li>
  );
}

export function AIVerificationPanel({ info, autoFilled, review, identity, onEditProfile }) {
  const check = (key) => {
    const c = identity?.applicant?.find((a) => a.key === key);
    if (!c) return null;
    // Count documents only — the student's own typed entry is a source too.
    const docs = c.items.filter((it) => !/entry|entered/i.test(it.source)).length;
    return { status: c.status, count: docs };
  };
  const fullName = [info.firstName, info.lastName].filter(Boolean).join(" ");
  const fields = [
    { label: "Full name", value: fullName, source: autoFilled.firstName || autoFilled.lastName, review: review.firstName || review.lastName, cross: check("name") },
    { label: "Date of birth", value: formatDate(info.dob), source: autoFilled.dob, review: review.dob, cross: check("dob") },
    { label: "Gender", value: info.gender, source: autoFilled.gender, review: review.gender, cross: check("gender") },
    { label: "Nationality", value: info.nationality, source: autoFilled.nationality, review: review.nationality },
    { label: "Passport number", value: info.passportNumber, source: autoFilled.passportNumber, review: review.passportNumber, sensitive: true },
  ];
  const anyRead = Object.keys(autoFilled).length > 0;
  const issues = identity?.issues || [];

  return (
    <section className="rail-card" aria-labelledby="rail-ai-title">
      <div className="rail-card__head">
        <span className="rail-card__icon is-ai" aria-hidden="true"><Sparkles size={16} /></span>
        <div>
          <h2 className="rail-card__title" id="rail-ai-title">AI Verification Results</h2>
          <p className="rail-card__sub">Review the details extracted from your documents.</p>
        </div>
      </div>

      {!anyRead && !fullName ? (
        <p className="rail-empty">
          Upload your passport, Aadhaar or PAN card and we&apos;ll read your details for you.
        </p>
      ) : (
        <ul className="rail-fields">
          {fields.map((f) => <FieldRow key={f.label} {...f} />)}
        </ul>
      )}

      {issues.length > 0 && (
        <ul className="rail-issues" aria-label="Details that don't match">
          {issues.slice(0, 3).map((t) => (
            <li key={t}><CircleX size={13} aria-hidden="true" /> {t}</li>
          ))}
          {issues.length > 3 && <li className="is-more">+{issues.length - 3} more — see your profile</li>}
        </ul>
      )}

      {onEditProfile && (
        <button type="button" className="rail-btn rail-btn--ghost" onClick={onEditProfile}>
          View &amp; Edit Profile <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

// ── Guidelines ────────────────────────────────────────────────────────────────
export function DocumentGuidelines({ maxSize }) {
  const items = [
    { icon: ScanSearch, text: "Upload clear, readable scans or photos." },
    { icon: Layers, text: "Include every page — both sides of ID cards." },
    { icon: FileCheck2, text: "Check the document matches the slot you're uploading to." },
    { icon: FileType2, text: "PDF, JPG, PNG, DOC or DOCX." },
    { icon: HardDrive, text: `Up to ${maxSize} per file.` },
  ];
  return (
    <section className="rail-card" aria-labelledby="rail-guide-title">
      <h2 className="rail-card__title" id="rail-guide-title">Document Guidelines</h2>
      <ul className="rail-guides">
        {items.map(({ icon: Icon, text }) => (
          <li key={text}><Icon size={16} aria-hidden="true" /> <span>{text}</span></li>
        ))}
      </ul>
      <PdfUnlockBanner />
    </section>
  );
}
