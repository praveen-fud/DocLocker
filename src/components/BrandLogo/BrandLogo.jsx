import { BRAND } from "../../config/brand";
import { useBrand } from "../../context/BrandContext";
import "./BrandLogo.css";

// The brand lockup for the current page (see context/BrandContext.jsx):
// DocLocker's shield + two-tone wordmark, or — on a partner company's pages —
// that company's own logo and name, with nothing of DocLocker's.
//   size:    "sm" | "md" | "lg"
//   tone:    "light" (on white/light surfaces) | "dark" (on navy/blue)
//   variant: "full" (mark + name) | "mark" (mark only)
export default function BrandLogo({ size = "md", tone = "light", variant = "full", tagline = false, className = "" }) {
  const brand = useBrand();
  const cls = `brand-logo brand-logo--${size} brand-logo--${tone} ${className}`.trim();

  if (brand.kind === "pending") {
    return <span className={`${cls} brand-logo--pending`} aria-hidden="true"><span className="brand-logo__placeholder" /></span>;
  }

  if (brand.kind === "company") {
    const initials = brand.name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return (
      <span className={`${cls} brand-logo--company`} style={brand.accent ? { "--brand-company": brand.accent } : undefined}>
        {brand.logoSrc
          ? <img src={brand.logoSrc} alt={variant === "mark" ? brand.name : ""} className="brand-logo__mark brand-logo__mark--company" />
          : <span className="brand-logo__mark brand-logo__initials" aria-hidden={variant !== "mark"}>{initials}</span>}
        {variant === "full" && (
          <span className="brand-logo__text">
            <span className="brand-logo__company">{brand.name}</span>
            {tagline && brand.tagline && <span className="brand-logo__tagline">{brand.tagline}</span>}
          </span>
        )}
      </span>
    );
  }

  const label = BRAND.name;
  return (
    <span className={cls}>
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
