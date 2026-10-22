// Brand identity. Kept in one place so a white-label tenant can swap name,
// logo and tagline without touching layout components; colours come from
// the --brand-* tokens in index.css.
import logo from "../assets/logo.png";

export const BRAND = {
  name: "DocLocker",
  // Two-tone wordmark: [navy part, blue part]
  wordmark: ["Doc", "Locker"],
  tagline: "Trusted. Secured. For your future.",
  logo,
};
