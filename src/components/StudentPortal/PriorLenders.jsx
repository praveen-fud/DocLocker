// "Applied to any bank before?" — on "Yes", every lender that turned the
// student down, why (a reason explained on hover / focus / tap), and a note.
// A reason not on the list needs the note. Data: utils/previousLenders.js.
import { useState } from "react";
import { Info, Plus, X } from "lucide-react";
import { BANK_OPTIONS, getBankLogo } from "../../utils/bankOptions";
import { REJECTION_REASONS, entryProblem, priorBanksOf } from "../../utils/previousLenders";
import "./PriorLenders.css";

const OTHERS = "Others";
const LISTED = BANK_OPTIONS.filter((b) => b.value !== OTHERS);
const LISTED_NAMES = new Set(LISTED.map((b) => b.value));
const newId = () => Math.random().toString(36).slice(2, 9);

// The entries being edited. An older record's single lender is shown as the
// first entry, so the student only has to add the reason.
function entriesOf(info) {
  if (Array.isArray(info.priorBanks)) return info.priorBanks;
  return priorBanksOf(info).map((e) => ({ id: newId(), ...e, custom: !LISTED_NAMES.has(e.bank) }));
}

function ReasonPicker({ entry, onPick, invalid }) {
  const [hover, setHover] = useState(null);
  const shown = REJECTION_REASONS.find((r) => r.value === (hover || entry.reason));
  const hintId = `pl-hint-${entry.id}`;
  return (
    <>
      <div
        className="pl-reasons"
        role="radiogroup"
        aria-label={`Why ${entry.bank || "this lender"} said no`}
        aria-describedby={hintId}
        aria-invalid={invalid || undefined}
        onMouseLeave={() => setHover(null)}
      >
        {REJECTION_REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={entry.reason === r.value}
            className="pl-reason"
            onClick={() => onPick(r.value)}
            onMouseEnter={() => setHover(r.value)}
            onFocus={() => setHover(r.value)}
            onBlur={() => setHover(null)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className={`pl-hint${shown ? " is-on" : ""}`} id={hintId}>
        <Info size={14} aria-hidden="true" />
        <span>{shown ? shown.hint : "Hover over or tap a reason to see what it covers."}</span>
      </p>
    </>
  );
}

export default function PriorLenders({ info, onChange }) {
  const entries = entriesOf(info);
  const set = (list) => onChange("priorBanks", list);
  const picked = new Set(entries.filter((e) => !e.custom).map((e) => e.bank));
  const hasCustom = entries.some((e) => e.custom);

  const toggle = (value) => {
    if (value === OTHERS) set(hasCustom ? entries.filter((e) => !e.custom) : [...entries, { id: newId(), bank: "", reason: "", note: "", custom: true }]);
    else if (picked.has(value)) set(entries.filter((e) => e.custom || e.bank !== value));
    else set([...entries, { id: newId(), bank: value, reason: "", note: "" }]);
  };
  const update = (id, patch) => set(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id) => set(entries.filter((e) => e.id !== id));

  return (
    <div className="pl is-full">
      <p className="pl-lead">Choose every lender that turned you down. It helps your advisor pick lenders that fit.</p>
      <div className="pl-banks" role="group" aria-label="Lenders you applied to">
        {[...LISTED, { value: OTHERS, label: "Not listed" }].map((b) => {
          const on = b.value === OTHERS ? hasCustom : picked.has(b.value);
          return (
            <button key={b.value} type="button" className="pl-bank" aria-pressed={on} onClick={() => toggle(b.value)}>
              {b.value === OTHERS ? <Plus size={14} aria-hidden="true" className="pl-bank__plus" /> : <img src={b.logo} alt="" className="pl-logo" />}
              <span>{b.label}</span>
            </button>
          );
        })}
      </div>
      {entries.length === 0 && <p className="pl-todo">Choose at least one lender.</p>}

      {entries.map((e) => {
        const problem = entryProblem(e);
        return (
          <div key={e.id} className={`pl-card${problem ? " is-open" : " is-done"}`}>
            <div className="pl-card__head">
              <img src={getBankLogo(e.custom ? OTHERS : e.bank)} alt="" className="pl-logo" />
              {e.custom ? (
                <input
                  className="input-field pl-name-input"
                  placeholder="Lender’s name"
                  value={e.bank}
                  maxLength={80}
                  aria-label="Lender’s name"
                  onChange={(ev) => update(e.id, { bank: ev.target.value })}
                />
              ) : (
                <strong className="pl-name">{e.bank}</strong>
              )}
              <button type="button" className="pl-remove" onClick={() => remove(e.id)} aria-label={`Remove ${e.bank || "this lender"}`}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="pl-q">Why did they say no?</p>
            <ReasonPicker entry={e} onPick={(reason) => update(e.id, { reason })} invalid={!e.reason} />
            <textarea
              className="input-field pl-note"
              rows={2}
              maxLength={300}
              placeholder={e.reason === "other" ? "What did the lender say?" : "Anything else the lender told you"}
              aria-label={`Note about ${e.bank || "this lender"}`}
              value={e.note || ""}
              onChange={(ev) => update(e.id, { note: ev.target.value })}
            />
            {problem && <p className="pl-todo">{problem}</p>}
          </div>
        );
      })}

      {hasCustom && (
        <button type="button" className="pl-add" onClick={() => set([...entries, { id: newId(), bank: "", reason: "", note: "", custom: true }])}>
          <Plus size={15} aria-hidden="true" /> Add another lender
        </button>
      )}
    </div>
  );
}
