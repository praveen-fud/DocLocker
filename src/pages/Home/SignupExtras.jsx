// The signup form's advisor picker.
import { Briefcase, ChevronDown } from "lucide-react";

// No asterisk and no "optional" label: a student who doesn't know their
// advisor yet simply leaves it.
export function AdvisorPicker({ advisors, value, onChange, error }) {
  if (!advisors.length) return null;
  return (
    <div className={`lp-field${error ? " has-error" : ""}`}>
      <label className="lp-field__label" htmlFor="lp-advisor">Your advisor</label>
      <div className="lp-field__control">
        <Briefcase size={17} className="lp-field__icon" aria-hidden="true" />
        <select
          id="lp-advisor"
          className="lp-input lp-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={error ? "lp-advisor-error" : "lp-advisor-hint"}
          aria-invalid={Boolean(error)}
        >
          <option value="">Choose your advisor</option>
          {advisors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <ChevronDown size={17} className="lp-select__chev" aria-hidden="true" />
      </div>
      {error
        ? <p className="lp-field__error" id="lp-advisor-error" role="alert">{error}</p>
        : <p className="lp-field__hint" id="lp-advisor-hint">The advisor you’ve been talking to</p>}
    </div>
  );
}
