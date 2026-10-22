import { BRAND } from "../../config/brand";
import "./BrandLogo.css";

// The DocLocker lockup: shield mark + two-tone wordmark (+ optional tagline).
// The wordmark is live text so it stays crisp at every size.
//   size:    "sm" | "md" | "lg"
//   tone:    "light" (on white/light surfaces) | "dark" (on navy/blue)
//   variant: "full" (mark + wordmark) | "mark" (mark only)
export default function BrandLogo({ size = "md", tone = "light", variant = "full", tagline = false, className = "" }) {
  const label = BRAND.name;
  return (
    <span className={`brand-logo brand-logo--${size} brand-logo--${tone} ${className}`.trim()}>
      <img src={BRAND.logo} alt={variant === "mark" ? label : ""} className="brand-logo__mark" />
      {variant === "full" && (
        <span className="brand-logo__text">
          <span className="brand-logo__word" aria-label={label}>
            <span className="brand-logo__doc">{BRAND.wordmark[0]}</span>
            <span className="brand-logo__locker">{BRAND.wordmark[1]}</span>
          </span>
          {tagline && <span className="brand-logo__tagline">{BRAND.tagline}</span>}
        </span>
      )}
    </span>
  );
}
