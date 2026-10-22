import { useId, useState } from "react";
import { ChevronDown, CircleCheck } from "lucide-react";
import "./DocumentSection.css";

// A collapsible document category. Collapsing only hides the cards — they
// stay mounted so an upload in progress keeps running and keeps its state.
export default function DocumentSection({ id, icon: Icon, title, description, done, total, extra, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const complete = total > 0 && done >= total;

  return (
    <section id={id} className={`dsec${open ? " is-open" : ""}`} aria-labelledby={`${id}-title`}>
      <header className="dsec__head">
        <span className={`dsec__icon${complete ? " is-complete" : ""}`} aria-hidden="true">
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <h2 className="dsec__title" id={`${id}-title`}>{title}</h2>
        {description && <p className="dsec__desc">{description}</p>}
        <div className="dsec__aside">
          {total > 0 && (
            <span className={`dsec__count${complete ? " is-complete" : ""}`}>
              {complete && <CircleCheck size={14} aria-hidden="true" />}
              {done} of {total} required
            </span>
          )}
          {extra}
          <button
            type="button"
            className="dsec__toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div id={bodyId} className="dsec__body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
