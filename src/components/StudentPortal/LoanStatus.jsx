import { useState } from "react";
import { Check, CircleX, CircleSlash, Info, Copy, Headset } from "lucide-react";
import { LOAN_STATUS, LOAN_STEPS, loanStatusKey, applicationRows } from "./studentRecord";
import { DetailRows, LoanChip } from "./StudentDashboard";
import "./PortalViews.css";

function CopyId({ value }) {
  const [state, setState] = useState("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <button type="button" className="sd-copy" onClick={copy}>
      {state === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy ID"}</span>
    </button>
  );
}

export default function LoanStatus({ student, applicationId, onOpenHelp }) {
  const key = loanStatusKey(student);
  const closed = !LOAN_STEPS.includes(key);
  const current = LOAN_STEPS.indexOf(key);

  return (
    <div className="sd-page sd-view">
      <div className="sd-view__head">
        <h1 className="sd-view__title">Loan Status</h1>
        <p className="sd-view__lede">Where your education loan application stands right now.</p>
      </div>

      <div className="sd-view__grid">
        <section className="sd-card" aria-labelledby="sd-timeline-title">
          <div className="sd-loan__head">
            <h2 className="sd-card__title" id="sd-timeline-title">Application progress</h2>
            <LoanChip student={student} />
          </div>

          <ol className="sd-timeline">
            {LOAN_STEPS.map((id, i) => {
              const s = LOAN_STATUS[id];
              const state = closed ? "inactive" : i < current ? "done" : i === current ? "current" : "upcoming";
              return (
                <li key={id} className={`sd-step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
                  <span className="sd-step__marker" aria-hidden="true">
                    {state === "done" ? <Check size={16} strokeWidth={3} /> : i + 1}
                  </span>
                  <div className="sd-step__body">
                    <p className="sd-step__label">
                      {s.label}
                      {state === "current" && <span className="sd-step__now">Current status</span>}
                      {state === "done" && <span className="sr-only">(completed)</span>}
                    </p>
                    <p className="sd-step__text">{s.title}. {s.text}</p>
                  </div>
                </li>
              );
            })}
            {closed && (
              <li className={`sd-step is-end is-${LOAN_STATUS[key].tone}`} aria-current="step">
                <span className="sd-step__marker" aria-hidden="true">
                  {key === "rejected" ? <CircleX size={18} /> : <CircleSlash size={18} />}
                </span>
                <div className="sd-step__body">
                  <p className="sd-step__label">
                    {LOAN_STATUS[key].label}
                    <span className="sd-step__now">Current status</span>
                  </p>
                  <p className="sd-step__text">{LOAN_STATUS[key].title}. {LOAN_STATUS[key].text}</p>
                </div>
              </li>
            )}
          </ol>

          <p className="sd-callout">
            <Info size={16} aria-hidden="true" />
            <span>
              Your advisor (or the lender) updates this status as your application moves forward. It shows your record as of your last
              sign-in, so sign in again to see the latest.
            </span>
          </p>
        </section>

        <div className="sd-view__side">
          <section className="sd-card sd-loan" aria-labelledby="sd-details-title">
            <div className="sd-loan__head">
              <h2 className="sd-card__title" id="sd-details-title">Application details</h2>
              <CopyId value={applicationId} />
            </div>
            <DetailRows rows={applicationRows(student, applicationId)} />
            <p className="sd-muted">Quote your Application ID when you contact your advisor.</p>
          </section>

          <button type="button" className="sd-card sd-linkcard" onClick={onOpenHelp}>
            <span className="sd-linkcard__icon" aria-hidden="true"><Headset size={20} /></span>
            <span className="sd-linkcard__text">
              <strong>Questions about your loan?</strong>
              <span>See help and how to reach your advisor.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
