// Illustrations for the landing page. All decorative (aria-hidden) except
// where they carry real content (lender names). Motion stops entirely for
// visitors who ask for reduced motion (see Landing.css).
import { useLayoutEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  IdCard, Fingerprint, CreditCard, GraduationCap, Landmark, LockKeyhole, Check, ScanLine,
  Sparkles, Camera, CircleCheck, Circle, Eye, Download, ShieldCheck, FileText,
} from "lucide-react";

const STAGE = 560;

// Documents travelling on the two orbits. `ring` picks the orbit, `at` the
// starting point along it (0–100%).
const ORBIT_DOCS = [
  { ring: "a", at: 0, icon: IdCard, tone: "sapphire", label: "Passport" },
  { ring: "a", at: 34, icon: Fingerprint, tone: "iris", label: "Aadhaar" },
  { ring: "a", at: 67, icon: CreditCard, tone: "gold", label: "PAN card" },
  { ring: "b", at: 18, icon: GraduationCap, tone: "teal", label: "12th marksheet" },
  { ring: "b", at: 68, icon: Landmark, tone: "midnight", label: "Bank statement" },
];

// Ellipse as an SVG path (two arcs) centred on the stage.
const ellipse = (rx, ry) => {
  const c = STAGE / 2;
  return `M ${c - rx} ${c} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
};
const RINGS = {
  a: { rx: 252, ry: 96, tilt: -16, d: ellipse(252, 96), speed: 34 },
  b: { rx: 200, ry: 70, tilt: 22, d: ellipse(200, 70), speed: 26 },
};

// The 560px stage keeps its geometry and is scaled to the room it gets, but
// never below 70%: on phones the outer edge of the orbits is cropped instead.
function useStageScale(max = 1) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const apply = () => el.style.setProperty("--lx-scale", String(Math.min(max, Math.max(0.7, el.clientWidth / STAGE))));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return ref;
}

// The two gold orbits and the documents travelling on them.
function OrbitRings({ docs, id }) {
  return Object.entries(RINGS).map(([key, r]) => (
    <div key={key} className={`lx-ring lx-ring--${key}`} style={{ "--tilt": `${r.tilt}deg` }}>
      <svg className="lx-ring__svg" viewBox={`0 0 ${STAGE} ${STAGE}`}>
        <defs>
          <linearGradient id={`${id}-${key}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f2a623" stopOpacity="0.25" />
            <stop offset="0.45" stopColor="#f2a623" stopOpacity="1" />
            <stop offset="1" stopColor="#f7c25c" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <path d={r.d} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={key === "a" ? 3.5 : 2.5} />
        <path d={r.d} fill="none" stroke={`url(#${id}-${key})`} strokeWidth={key === "a" ? 1.4 : 1.1} />
      </svg>
      {docs.filter((d) => d.ring === key).map((doc) => {
        const Icon = doc.icon;
        return (
          <span
            key={doc.label}
            className="lx-chip"
            style={{ offsetPath: `path("${r.d}")`, "--at": `${doc.at}%`, "--speed": `${r.speed}s` }}
          >
            <span className="lx-chip__body">
              <span className={`lx-chip__icon is-${doc.tone}`}><Icon size={15} strokeWidth={2} /></span>
              {doc.label}
              <span className="lx-chip__ok"><Check size={11} strokeWidth={3} /></span>
            </span>
          </span>
        );
      })}
    </div>
  ));
}

// Behind the staff sign-in card: the orbits alone, a few documents on them.
const BACKDROP_DOCS = [
  { ring: "a", at: 6, icon: IdCard, tone: "sapphire", label: "Passport" },
  { ring: "a", at: 56, icon: Landmark, tone: "midnight", label: "Bank statement" },
  { ring: "b", at: 28, icon: CreditCard, tone: "gold", label: "PAN card" },
  { ring: "b", at: 78, icon: GraduationCap, tone: "teal", label: "12th marksheet" },
];
export function OrbitBackdrop() {
  const ref = useStageScale(1.45);
  return (
    <div className="lx-orbit lx-orbit--backdrop" ref={ref} aria-hidden="true">
      <div className="lx-orbit__stage">
        <OrbitRings docs={BACKDROP_DOCS} id="lx-backdrop" />
      </div>
    </div>
  );
}

export function HeroOrbit({ brandName }) {
  const ref = useStageScale();
  return (
    <div className="lx-orbit" ref={ref} aria-hidden="true">
      <div className="lx-orbit__stage">
        <OrbitRings docs={ORBIT_DOCS} id="lx-hero" />

        {/* The vault: where every document ends up */}
        <div className="lx-vault">
          <span className="lx-vault__halo" />
          <div className="lx-vault__card">
            <span className="lx-vault__lock"><LockKeyhole size={22} strokeWidth={2.2} /></span>
            <p className="lx-vault__title">{brandName ? `Your file with ${brandName}` : "Your loan file"}</p>
            <div className="lx-vault__ring">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" className="lx-vault__track" />
                <circle cx="60" cy="60" r="50" className="lx-vault__arc" pathLength="100" />
              </svg>
              <span className="lx-vault__pct"><span>86<small>%</small></span></span>
            </div>
            <p className="lx-vault__sub">12 of 14 documents</p>
            <span className="lx-vault__badge"><ShieldCheck size={13} /> Encrypted</span>
          </div>
        </div>

        {/* AI reading a passport, filling the profile line by line */}
        <div className="lx-read">
          <div className="lx-read__doc">
            <span className="lx-read__photo" />
            <span className="lx-read__lines"><i /><i /><i /><i /></span>
            <span className="lx-read__mrz">P&lt;IND&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</span>
            <span className="lx-read__scan" />
          </div>
          <div className="lx-read__fields">
            <p className="lx-read__head"><Sparkles size={13} /> Read from your passport</p>
            {["Full name", "Date of birth", "Passport no."].map((f, i) => (
              <p key={f} className="lx-read__field" style={{ "--i": i }}>
                <span>{f}</span>
                <span className="lx-read__val"><i /></span>
                <Check size={12} strokeWidth={3} />
              </p>
            ))}
          </div>
        </div>

        {/* Where the file is: the gold path */}
        <div className="lx-status">
          <span className="lx-status__dot" />
          <span>
            <strong>With lenders</strong>
            <small>Status updated just now</small>
          </span>
        </div>
      </div>
    </div>
  );
}

// Full-colour lender logos, scrolling. The second copy is only there to
// make the loop seamless, so screen readers hear the list once.
export function LenderMarquee({ lenders, label }) {
  return (
    <div className="lx-marquee">
      <p className="lx-marquee__label">{label}</p>
      <div className="lx-marquee__viewport">
        <ul className="lx-marquee__track">
          {[0, 1].map((copy) => lenders.map((b) => (
            <li key={`${copy}-${b.value}`} className="lx-lender" aria-hidden={copy === 1 || undefined}>
              <span className="lx-lender__logo"><img src={b.logo} alt="" /></span>
              <span className="lx-lender__name">{b.label}</span>
            </li>
          )))}
        </ul>
      </div>
    </div>
  );
}

// The four steps on a gold path that draws itself when it scrolls into view.
export function JourneyPath({ steps }) {
  const reduce = useReducedMotion();
  return (
    <div className="lx-journey">
      <svg className="lx-journey__path" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
        <path className="lx-journey__base" d="M 120 60 C 170 4, 323 4, 373 60 C 423 4, 577 4, 627 60 C 677 4, 830 4, 880 60" />
        <motion.path
          className="lx-journey__gold"
          d="M 120 60 C 170 4, 323 4, 373 60 C 423 4, 577 4, 627 60 C 677 4, 830 4, 880 60"
          initial={reduce ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 1.8, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>
      <ol className="lx-journey__list">
        {steps.map(({ icon: Icon, title, detail }, i) => (
          <motion.li
            key={title}
            className="lx-station"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, delay: reduce ? 0 : 0.35 + i * 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="lx-station__node"><Icon size={22} /></span>
            <span className="lx-station__step">Step {i + 1}</span>
            <h3 className="lx-station__title">{title}</h3>
            <p className="lx-station__detail">{detail}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

// ── Bento tile visuals ───────────────────────────────────────────────────
export function AutoFillVisual() {
  const rows = [
    ["First name", "As on passport", "Passport"],
    ["Date of birth", "DD / MM / YYYY", "Passport"],
    ["Aadhaar number", "•••• •••• 4821", "Aadhaar"],
    ["12th percentage", "92.4%", "12th memo"],
  ];
  return (
    <div className="lx-fill" aria-hidden="true">
      <div className="lx-fill__doc">
        <IdCard size={20} />
        <span className="lx-fill__lines"><i /><i /><i /></span>
        <span className="lx-fill__scan"><ScanLine size={16} /></span>
      </div>
      <ul className="lx-fill__rows">
        {rows.map(([k, v, from], i) => (
          <li key={k} style={{ "--i": i }}>
            <span className="lx-fill__key">{k}</span>
            <span className="lx-fill__val">{v}</span>
            <span className="lx-fill__from"><Sparkles size={11} /> {from}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CameraVisual() {
  return (
    <div className="lx-phone" aria-hidden="true">
      <div className="lx-phone__screen">
        <span className="lx-phone__island" />
        <div className="lx-phone__bar"><span>Scan document</span><span className="lx-phone__chip">Front</span></div>
        <div className="lx-phone__frame">
          <span className="is-tl" /><span className="is-tr" /><span className="is-bl" /><span className="is-br" />
          <div className="lx-phone__doc"><span /><i /><i /><i /></div>
        </div>
        <p className="lx-phone__hint">Fit the front side inside the frame</p>
        <span className="lx-phone__shutter"><Camera size={18} /></span>
      </div>
    </div>
  );
}

export function ChecklistVisual() {
  const items = [["Passport", true], ["Aadhaar card", true], ["12th marksheet", true], ["Father's ITR", false]];
  return (
    <ul className="lx-check" aria-hidden="true">
      {items.map(([name, done]) => (
        <li key={name} className={done ? "is-done" : undefined}>
          {done ? <CircleCheck size={17} /> : <Circle size={17} />}
          <span>{name}</span>
          <em>{done ? "Done" : "Needed"}</em>
        </li>
      ))}
    </ul>
  );
}

export function TrackerVisual() {
  const stages = ["Submitted", "Review", "Lenders", "Sanctioned"];
  return (
    <div className="lx-track" aria-hidden="true">
      <ol>
        {stages.map((s, i) => (
          <li key={s} className={i < 2 ? "is-done" : i === 2 ? "is-current" : undefined}>
            <span className="lx-track__dot">{i < 2 ? <Check size={11} strokeWidth={3} /> : null}</span>
            <span className="lx-track__label">{s}</span>
          </li>
        ))}
      </ol>
      <p className="lx-track__note"><span /> HDFC Credila is reviewing your file</p>
    </div>
  );
}

// The secure viewer lenders use, in miniature.
export function ViewerMock() {
  return (
    <div className="lx-viewer" aria-hidden="true">
      <div className="lx-viewer__bar">
        <span className="lx-viewer__dots"><i /><i /><i /></span>
        <span className="lx-viewer__title"><FileText size={13} /> Passport · photo page</span>
        <span className="lx-viewer__actions"><Eye size={14} /><Download size={14} /></span>
      </div>
      <div className="lx-viewer__body">
        <div className="lx-viewer__rail">
          <span className="is-active" /><span /><span /><span />
        </div>
        <div className="lx-viewer__page">
          <span className="lx-viewer__photo" />
          <span className="lx-viewer__lines"><i /><i /><i /><i /><i /></span>
          <span className="lx-viewer__mrz" />
        </div>
      </div>
      <p className="lx-viewer__foot"><ShieldCheck size={13} /> Opened securely · recorded in the audit log</p>
    </div>
  );
}
