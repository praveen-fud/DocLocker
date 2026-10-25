// The radial menu: what was dropped in the middle, the kinds of tool on
// the inner ring, that kind's options on the outer ring. Pointer: hover a
// group, click an option. Keys: type to search, ↑↓ group, ←→ option,
// Enter to run, Esc to close.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FileImage, FileText, FileVideo, FileAudio, FileType, Search, X } from "lucide-react";
import { buildMenu, searchOptions } from "./catalog";
import { describeFiles, kindOf } from "./kinds";
import useBlobUrl, { canShow } from "./useBlobUrl";

const R_CENTER = 66;
const R0 = 72;
const R1 = 146;
const R2 = 152;
const R3 = 232;
const SIZE = 480;

const rad = (a) => (a * Math.PI) / 180;
const at = (r, a) => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];

// An annular wedge from angle a0 to a1 (degrees, 0 = top, clockwise)
function wedge(r0, r1, a0, a1) {
  if (a1 - a0 >= 359.5) return `${wedge(r0, r1, a0, a0 + 179.9)} ${wedge(r0, r1, a0 + 180, a0 + 359.9)}`;
  const [x0, y0] = at(r1, a0);
  const [x1, y1] = at(r1, a1);
  const [x2, y2] = at(r0, a1);
  const [x3, y3] = at(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

const KIND_ICON = { image: FileImage, pdf: FileText, video: FileVideo, audio: FileAudio, docx: FileType, text: FileType, other: FileType };

function Preview({ files }) {
  const first = files[0];
  const url = useBlobUrl(kindOf(first) === "image" && canShow(first.type) ? first : null);
  const Icon = KIND_ICON[kindOf(first)];
  return (
    <span className="cv-center__thumb" aria-hidden="true">
      {url ? <img src={url} alt="" /> : <Icon size={24} />}
      {files.length > 1 && <span className="cv-center__count">{files.length}</span>}
    </span>
  );
}

export default function RadialMenu({ files, x, y, onRun, onClose }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const menu = useMemo(() => buildMenu(files), [files]);
  const [catIndex, setCatIndex] = useState(0);
  const [optIndex, setOptIndex] = useState(0);
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const hoverTimer = useRef(0);

  const searching = query.trim().length > 0;
  const results = useMemo(() => (searching ? searchOptions(menu, query) : []), [menu, query, searching]);
  const cats = menu.categories;
  const cat = cats[Math.min(catIndex, cats.length - 1)];
  const options = searching ? results : cat.options;
  const active = options[Math.min(optIndex, Math.max(0, options.length - 1))];

  // Fit on screen: scale down on small screens, keep the whole ring visible
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(1, (vw - 16) / SIZE, (vh - 150) / SIZE);
  const half = (SIZE / 2) * scale;
  const cx = Math.min(Math.max(x, half + 8), vw - half - 8);
  const cy = Math.min(Math.max(y, half + 8), vh - half - 90);
  const barBelow = cy + half + 96 < vh;

  // Focus the search; give focus back to where it was when the menu closes
  useEffect(() => {
    const prev = document.activeElement;
    inputRef.current?.focus();
    return () => { if (prev && document.contains(prev)) prev.focus?.(); };
  }, []);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const step = 360 / cats.length;
  const catAngle = (i) => i * step;
  const optStep = 360 / Math.max(1, options.length);
  const optAngle = (j) => (searching ? 0 : catAngle(catIndex)) + j * optStep;

  const pickCat = (i) => { setCatIndex((i + cats.length) % cats.length); setOptIndex(0); };
  const run = (o) => {
    if (!o) return;
    const forFiles = o.category?.files || cat.files || files;
    onRun(o, forFiles);
  };

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); if (query) setQuery(""); else onClose(); return; }
    if (e.key === "Enter") { e.preventDefault(); run(active); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      setOptIndex((i) => (i + d + options.length) % Math.max(1, options.length));
      return;
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !searching) {
      e.preventDefault();
      pickCat(catIndex + (e.key === "ArrowDown" ? 1 : -1));
    }
    if (e.key === "Tab") { e.preventDefault(); if (!searching) pickCat(catIndex + (e.shiftKey ? -1 : 1)); }
  };

  const activeId = active ? `${uid}-opt-${options.indexOf(active)}` : undefined;
  const name = files.length === 1 ? files[0].name : `${files.length} files`;

  return (
    <div className="cv-layer" role="presentation">
      <motion.div
        className="cv-scrim"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.2 }}
      />
      <motion.div
        className="cv-radial"
        role="dialog"
        aria-modal="true"
        aria-label={`Convert ${name}`}
        style={{ left: cx, top: cy, width: SIZE, height: SIZE, marginLeft: -SIZE / 2, marginTop: -SIZE / 2 }}
        initial={reduce ? false : { opacity: 0, scale: scale * 0.72, rotate: -18 }}
        animate={{ opacity: 1, scale, rotate: 0 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 24 }}
        onKeyDown={onKey}
      >
        <span className="cv-radial__orbit" aria-hidden="true" />

        {/* Outer ring: the options */}
        <motion.div
          key={searching ? `q:${query}` : `c:${cat.id}`}
          className="cv-ring"
          initial={reduce ? false : { opacity: 0, rotate: -10, scale: 0.96 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg className="cv-ring__svg" viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`} role="listbox" id={`${uid}-options`} aria-label={searching ? "Matching tools" : `${cat.label} tools`}>
            {options.length === 0 ? (
              <path d={wedge(R2, R3, 0, 360)} className="cv-w cv-w--empty" />
            ) : options.map((o, j) => {
              const a = optAngle(j);
              const pad = options.length === 1 ? 0 : 0.9;
              return (
                <path
                  key={o.id + j}
                  id={`${uid}-opt-${j}`}
                  role="option"
                  aria-selected={o === active}
                  aria-label={o.title}
                  d={wedge(R2, R3, a - optStep / 2 + pad, a + optStep / 2 - pad)}
                  className={`cv-w cv-w--opt${o === active ? " is-active" : ""}`}
                  onMouseEnter={() => setOptIndex(j)}
                  onClick={() => run(o)}
                />
              );
            })}
          </svg>
          {options.length === 0 ? (
            <span className="cv-label cv-label--empty" style={{ left: "50%", top: `calc(50% - ${(R2 + R3) / 2}px)` }}>No tool matches “{query}”</span>
          ) : options.map((o, j) => {
            const [lx, ly] = at((R2 + R3) / 2, optAngle(j));
            return (
              <span key={o.id + j} className={`cv-label cv-label--opt${o === active ? " is-active" : ""}`} style={{ left: `calc(50% + ${lx}px)`, top: `calc(50% + ${ly}px)` }} aria-hidden="true">
                <span className="cv-label__text">{o.label}</span>
                {searching && <span className="cv-label__sub">{o.category.label}</span>}
              </span>
            );
          })}
        </motion.div>

        {/* Inner ring: the kinds of tool */}
        <div className={`cv-ring cv-ring--inner${searching ? " is-dim" : ""}`}>
          <svg className="cv-ring__svg" viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`} role="tablist" aria-label="Tool groups">
            <defs>
              <linearGradient id={`${uid}-sapphire`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3b63e6" />
                <stop offset="1" stopColor="#1b379e" />
              </linearGradient>
            </defs>
            {cats.map((c, i) => {
              const a = catAngle(i);
              const on = i === catIndex && !searching;
              return (
                <path
                  key={c.id + i}
                  role="tab"
                  aria-selected={on}
                  aria-label={c.label}
                  d={wedge(R0, R1, a - step / 2 + (cats.length > 1 ? 1.2 : 0), a + step / 2 - (cats.length > 1 ? 1.2 : 0))}
                  className={`cv-w cv-w--cat${on ? " is-active" : ""}`}
                  style={on ? { fill: `url(#${uid}-sapphire)` } : undefined}
                  onMouseEnter={() => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => { setQuery(""); pickCat(i); }, 90); }}
                  onMouseLeave={() => clearTimeout(hoverTimer.current)}
                  onClick={() => { setQuery(""); pickCat(i); inputRef.current?.focus(); }}
                />
              );
            })}
          </svg>
          {cats.map((c, i) => {
            const Icon = c.icon;
            const [lx, ly] = at((R0 + R1) / 2, catAngle(i));
            const on = i === catIndex && !searching;
            return (
              <motion.span
                key={c.id + i}
                className={`cv-label cv-label--cat${on ? " is-active" : ""}`}
                style={{ left: `calc(50% + ${lx}px)`, top: `calc(50% + ${ly}px)` }}
                initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: reduce ? 0 : 0.06 + i * 0.035, duration: 0.25 }}
                aria-hidden="true"
              >
                <Icon size={17} />
                <span className="cv-label__text">{c.label}</span>
              </motion.span>
            );
          })}
        </div>

        {/* The middle: what was dropped */}
        <div className="cv-center" style={{ width: R_CENTER * 2, height: R_CENTER * 2 }}>
          <Preview files={files} />
          <span className="cv-center__name" title={name}>{name}</span>
          <span className="cv-center__meta">{describeFiles(files)}</span>
        </div>
        <button type="button" className="cv-radial__close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </motion.div>

      {/* Below (or above): search, what the highlighted option does, the keys */}
      <motion.div
        className="cv-bar"
        style={barBelow ? { left: cx, top: cy + half + 14 } : { left: cx, bottom: vh - (cy - half - 14) }}
        initial={reduce ? false : { opacity: 0, y: barBelow ? -8 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.1, duration: 0.25 }}
      >
        <label className="cv-bar__search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search tools</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${uid}-options`}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOptIndex(0); }}
            onKeyDown={onKey}
            placeholder={`Type to search ${cats.reduce((n, c) => n + c.options.length, 0)} tools…`}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <p className="cv-bar__what" aria-live="polite">
          {active ? (<><strong>{active.title}</strong>{active.hint ? <span> · {active.hint}</span> : null}</>) : "Nothing to run"}
        </p>
        <p className="cv-bar__keys" aria-hidden="true">
          <kbd>↑</kbd><kbd>↓</kbd> group <kbd>←</kbd><kbd>→</kbd> tool <kbd>↵</kbd> run <kbd>esc</kbd> close
        </p>
        {menu.unsupported && <p className="cv-bar__note">These files can only be zipped here.</p>}
      </motion.div>
    </div>
  );
}
