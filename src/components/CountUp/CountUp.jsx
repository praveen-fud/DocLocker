// A figure that counts up to its value ("₹2.25 Cr", "75%", "12"), as the
// landing page's numbers do; text with no number in it ("–" while loading)
// is shown as it is. Shown straight away for visitors who ask for reduced
// motion.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

export default function CountUp({ text }) {
  const reduce = useReducedMotion();
  const parts = /^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(String(text ?? ""));
  const target = parts ? Number(parts[2].replace(/,/g, "")) : null;
  const [value, setValue] = useState(0);
  const last = useRef(0);
  useEffect(() => {
    if (target === null || reduce) return undefined;
    const from = last.current;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      const v = from + (target - from) * (1 - (1 - p) ** 3);
      last.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce]);
  if (target === null || reduce) return text;
  const decimals = (parts[2].split(".")[1] || "").length;
  const num = parts[2].includes(",")
    ? value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : value.toFixed(decimals);
  return `${parts[1]}${num}${parts[3]}`;
}
