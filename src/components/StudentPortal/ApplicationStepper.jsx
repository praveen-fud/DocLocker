import { Check } from "lucide-react";
import "./ApplicationStepper.css";

// steps: [{ id, label, icon, done, total, summary }]
// A step is complete when every required document in it is uploaded; the
// counts come straight from the application data.
export default function ApplicationStepper({ steps, currentId, onSelect }) {
  return (
    <nav className="stepper" aria-label="Application steps">
      <ol className="stepper__list">
        {steps.map((step, i) => {
          const complete = step.total > 0 && step.done >= step.total;
          const current = step.id === currentId;
          const Icon = step.icon;
          const state = complete ? "complete" : current ? "current" : "upcoming";
          const status = step.summary
            ?? (step.total === 0 ? "Nothing required" : complete ? "Completed" : `${step.done} of ${step.total} done`);
          return (
            <li key={step.id} className={`stepper__step is-${state}${current ? " is-active" : ""}`}>
              <button
                type="button"
                className="stepper__btn"
                onClick={() => onSelect(step.id)}
                aria-current={current ? "step" : undefined}
              >
                <span className="stepper__marker" aria-hidden="true">
                  {complete ? <Check size={16} strokeWidth={2.6} /> : Icon ? <Icon size={16} strokeWidth={2} /> : i + 1}
                </span>
                <span className="stepper__text">
                  <span className="stepper__num">Step {i + 1}</span>
                  <span className="stepper__label">{step.label}</span>
                  <span className="stepper__status">{status}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
