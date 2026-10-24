import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./PinInput.css";

// A 6-digit PIN shown as six boxes. One real input sits over the boxes, so
// typing, pasting, password managers and screen readers all work as usual.
export default function PinInput({ id, value, onChange, label, autoComplete = "current-password", invalid, describedBy, autoFocus }) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);
  const digits = String(value || "").split("").slice(0, 6);
  const active = Math.min(digits.length, 5);

  return (
    <div className={`pin${invalid ? " is-invalid" : ""}${focused ? " is-focused" : ""}`}>
      <div className="pin__boxes" aria-hidden="true" onClick={() => ref.current?.focus()}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`pin__box${digits[i] ? " is-filled" : ""}${focused && i === active ? " is-active" : ""}`}>
            {digits[i] ? (show ? digits[i] : "•") : ""}
          </span>
        ))}
      </div>
      <input
        ref={ref}
        id={id}
        className="pin__input"
        type={show ? "text" : "password"}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoComplete={autoComplete}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      <button type="button" className="pin__toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide PIN" : "Show PIN"} aria-pressed={show}>
        {show ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </div>
  );
}
