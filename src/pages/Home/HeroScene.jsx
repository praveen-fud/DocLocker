import { Sparkles, ShieldCheck, Zap, FolderLock, FileText, IdCard, CreditCard, GraduationCap, CircleCheck, Clock3 } from "lucide-react";

// Optional hero photo. Import a licensed image here (e.g. a student with a
// laptop on a transparent or soft-blue background) and it replaces the
// product preview card; the scene and floating cards stay as they are.
const HERO_PHOTO = null;

const FEATURES = [
  { icon: Sparkles, tone: "ai", title: "AI Document Verification", text: "Auto-fill your profile" },
  { icon: ShieldCheck, tone: "secure", title: "Secure & Private", text: "Bank-grade security" },
  { icon: Zap, tone: "fast", title: "Faster Loan Process", text: "Get approval sooner" },
];

// Illustrative rows for the preview card only. 3 of 4 verified = the ring.
const PREVIEW_DOCS = [
  { icon: IdCard, tone: "blue", name: "Passport", done: true },
  { icon: CreditCard, tone: "violet", name: "PAN Card", done: true },
  { icon: FileText, tone: "rose", name: "Aadhaar Card", done: true },
  { icon: GraduationCap, tone: "amber", name: "12th Marksheet", done: false },
];
const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;
const PREVIEW_DONE = PREVIEW_DOCS.filter((d) => d.done).length;

function Plane({ className }) {
  return (
    <svg className={className} viewBox="0 0 120 48" aria-hidden="true" focusable="false">
      <path d="M62 23 52 9h7l18 13.6Z" opacity=".75" />
      <path d="M14 25 6 11h7l15 13.5Z" />
      <path d="M6 30c0-3 3-5 8-5l78-3c10-.4 20 0 24 2 2 1 1 3-2 4l-92 5c-8 .4-16 0-16-3Z" />
      <path d="M58 27 40 44h8l28-17Z" />
    </svg>
  );
}

// Faint campus-and-city skyline along the bottom of the hero.
export function HeroSkyline() {
  return (
    <svg className="lp-skyline" viewBox="0 0 1440 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <g className="lp-skyline__far">
        <rect x="0" y="70" width="150" height="170" rx="4" />
        <rect x="160" y="120" width="70" height="120" rx="3" />
        <rect x="830" y="110" width="80" height="130" rx="3" />
        <rect x="920" y="60" width="54" height="180" rx="3" />
        <rect x="1270" y="90" width="90" height="150" rx="3" />
        <rect x="1370" y="130" width="70" height="110" rx="3" />
      </g>
      <g className="lp-skyline__windows">
        {[0, 1, 2, 3, 4, 5].map((r) =>
          [0, 1, 2, 3].map((c) => <rect key={`${r}-${c}`} x={16 + c * 34} y={86 + r * 24} width="20" height="12" rx="2" />),
        )}
      </g>
      <g className="lp-skyline__near">
        {/* Campus hall with a clock tower and dome */}
        <rect x="440" y="150" width="320" height="90" rx="3" />
        <rect x="480" y="120" width="240" height="34" rx="3" />
        <rect x="574" y="56" width="52" height="70" rx="3" />
        <path d="M570 60c0-22 13-34 30-34s30 12 30 34Z" />
        <rect x="597" y="6" width="6" height="22" rx="2" />
        <rect x="372" y="130" width="60" height="110" rx="3" />
        <rect x="770" y="140" width="56" height="100" rx="3" />
      </g>
      <g className="lp-skyline__detail">
        <circle cx="600" cy="84" r="10" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={462 + i * 42} y="170" width="14" height="70" rx="3" />)}
      </g>
      <g className="lp-skyline__trees">
        {[250, 290, 330, 690, 730, 1010, 1050, 1095, 1180, 1225].map((x, i) => (
          <circle key={x} cx={x} cy={i % 2 ? 214 : 204} r={i % 3 ? 30 : 38} />
        ))}
      </g>
    </svg>
  );
}

export default function HeroScene() {
  return (
    <div className="lp-scene">
      <div className="lp-scene__art" aria-hidden="true">
        <span className="lp-scene__halo" />
        <Plane className="lp-scene__plane lp-scene__plane--big" />
        <Plane className="lp-scene__plane lp-scene__plane--small" />
        <span className="lp-scene__cloud lp-scene__cloud--a" />
        <span className="lp-scene__cloud lp-scene__cloud--b" />
      </div>

      {HERO_PHOTO ? (
        <img className="lp-scene__photo" src={HERO_PHOTO} alt="" />
      ) : (
        <div className="lp-preview" aria-hidden="true">
          <div className="lp-preview__head">
            <span className="lp-preview__icon"><FolderLock size={18} /></span>
            <span className="lp-preview__heading">
              <span className="lp-preview__title">Document completion</span>
              <span className="lp-preview__sub">Example loan file</span>
            </span>
          </div>

          <div className="lp-preview__progress">
            <svg className="lp-preview__ring" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r={RING_R} className="lp-preview__ring-track" />
              <circle
                cx="40"
                cy="40"
                r={RING_R}
                className="lp-preview__ring-fill"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - PREVIEW_DONE / PREVIEW_DOCS.length)}
              />
              <text x="40" y="45" textAnchor="middle" className="lp-preview__ring-text">
                {PREVIEW_DONE}/{PREVIEW_DOCS.length}
              </text>
            </svg>
            <span className="lp-preview__meter">
              <span className="lp-preview__meter-top">
                <span className="lp-preview__chip">In progress</span>
                <span className="lp-preview__meter-label">
                  {Math.round((PREVIEW_DONE / PREVIEW_DOCS.length) * 100)}% completed
                </span>
              </span>
              <span className="lp-preview__bar">
                <span style={{ width: `${(PREVIEW_DONE / PREVIEW_DOCS.length) * 100}%` }} />
              </span>
              <span className="lp-preview__counts">
                <span><CircleCheck size={13} /> {PREVIEW_DONE} verified</span>
                <span><Clock3 size={13} /> {PREVIEW_DOCS.length - PREVIEW_DONE} pending</span>
              </span>
            </span>
          </div>

          <ul className="lp-preview__docs">
            {PREVIEW_DOCS.map(({ icon: Icon, tone, name, done }) => (
              <li key={name} className="lp-preview__doc">
                <span className={`lp-preview__doc-icon lp-tone--${tone}`}><Icon size={16} /></span>
                <span className="lp-preview__doc-name">{name}</span>
                <span className={`lp-status lp-status--${done ? "ok" : "wait"}`}>
                  {done ? <CircleCheck size={12} /> : <Clock3 size={12} />}
                  {done ? "Verified" : "Pending"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="lp-floats" aria-label="Highlights">
        {FEATURES.map(({ icon: Icon, tone, title, text }, i) => (
          <li key={title} className={`lp-float lp-float--${i + 1}`}>
            <span className={`lp-float__icon lp-float__icon--${tone}`}>
              <Icon size={26} aria-hidden="true" />
            </span>
            <span className="lp-float__body">
              <span className="lp-float__title">{title}</span>
              <span className="lp-float__text">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
