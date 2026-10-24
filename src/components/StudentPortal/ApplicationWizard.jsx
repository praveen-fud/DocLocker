import { Check, ArrowLeft, ArrowRight, LoaderCircle, FileCheck2, UserRoundCheck, Camera, Sparkles } from "lucide-react";
import { percent } from "./profileFields";
import "./ApplicationWizard.css";

// The guided application: one step on screen at a time, a stepper above,
// and one action bar below. Steps can be visited in any order.
//
//   steps:   [{ id, label, icon, done, total }]   (total 0 = nothing to count)
//   counts:  { docs: { done, total }, details: { done, total } }
export default function ApplicationWizard({
  steps, current, onSelect, counts, heading, description, children,
  onBack, onNext, nextLabel, nextDisabled, busy, secondary, notes,
}) {
  const index = steps.findIndex((s) => s.id === current);
  const step = steps[index];
  const overall = percent(counts.docs.done + counts.details.done, counts.docs.total + counts.details.total);

  return (
    <div className="aw">
      <div className="aw__top">
        <div className="aw__summary">
          <div className="aw__overall">
            <span className="aw__orbit">
              <OrbitRing value={overall} />
              <span className="aw__overall-pct">{overall}%</span>
            </span>
            <span className="aw__overall-label">of your application is complete</span>
          </div>
          <div className="aw__meters">
            <Meter icon={FileCheck2} label="Documents" {...counts.docs} />
            <Meter icon={UserRoundCheck} label="Details" {...counts.details} />
          </div>
        </div>

        <nav className="aw-steps" aria-label="Application steps">
          <ol>
            {steps.map((s, i) => {
              const complete = s.total > 0 && s.done >= s.total;
              const state = s.id === current ? "current" : complete ? "done" : "todo";
              return (
                <li key={s.id} className={`aw-step is-${state}${complete ? " is-complete" : ""}`}>
                  <button type="button" onClick={() => onSelect(s.id)} aria-current={s.id === current ? "step" : undefined}>
                    <span className="aw-step__dot" aria-hidden="true">
                      {state === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="aw-step__text">
                      <span className="aw-step__label">{s.label}</span>
                      {s.total > 0 && <span className="aw-step__count">{Math.min(s.done, s.total)}/{s.total}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="aw__mobile-step" aria-hidden="true">
          Step {index + 1} of {steps.length}
        </p>
      </div>

      <section className="aw__body" aria-labelledby="aw-heading">
        <header className="aw__head">
          <div>
            <h1 className="aw__title" id="aw-heading">{heading}</h1>
            {description && <p className="aw__lede">{description}</p>}
          </div>
          {step?.total > 0 && (
            <span className={`aw__chip${step.done >= step.total ? " is-done" : ""}`}>
              {step.done >= step.total ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
              {Math.min(step.done, step.total)} of {step.total} {step.unit || "required"}
            </span>
          )}
        </header>
        {notes && <StepNotes {...notes} />}
        {children}
      </section>

      <div className="aw-bar">
        <div className="aw-bar__inner">
          <button type="button" className="aw-btn aw-btn--ghost" onClick={onBack} disabled={index <= 0 || busy}>
            <ArrowLeft size={17} aria-hidden="true" /> <span className="aw-btn__long">Back</span>
          </button>
          {secondary}
          <button type="button" className="aw-btn aw-btn--primary" onClick={onNext} disabled={busy || nextDisabled}>
            {busy ? <LoaderCircle size={17} className="aw-spin" aria-hidden="true" /> : null}
            <span>{nextLabel}</span>
            {!busy && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// The overall figure sits inside a gold orbit, like the one round the logo:
// the arc runs as far as the application is complete, and a small
// "satellite" marks where it has got to.
function OrbitRing({ value }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <svg className="aw-orbit" viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <circle className="aw-orbit__track" cx="40" cy="40" r="32" />
      <circle
        className="aw-orbit__value"
        cx="40" cy="40" r="32"
        pathLength="100"
        strokeDasharray={`${v} 100`}
        transform="rotate(-90 40 40)"
        style={{ opacity: v > 0 ? 1 : 0 }}
      />
      <g className="aw-orbit__sat" style={{ transform: `rotate(${v * 3.6}deg)` }}>
        <circle cx="40" cy="8" r="5" />
      </g>
    </svg>
  );
}

function Meter({ icon: Icon, label, done, total }) {
  const pct = percent(done, total);
  return (
    <div className="aw-meter">
      <span className="aw-meter__label"><Icon size={14} aria-hidden="true" /> {label}</span>
      <span className="aw-meter__bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="aw-meter__count">{done}/{total}</span>
    </div>
  );
}

// The rules for a document step, said once instead of on every card.
function StepNotes({ types = "PDF, JPG or PNG", maxSize = "25 MB", autoFill }) {
  return (
    <ul className="aw-notes">
      <li>{types} · up to {maxSize} each</li>
      <li><Camera size={14} aria-hidden="true" /><span>Use <strong>Camera</strong> to scan a paper document</span></li>
      {autoFill && <li className="is-ai"><Sparkles size={14} aria-hidden="true" /><span>{autoFill}</span></li>}
    </ul>
  );
}
