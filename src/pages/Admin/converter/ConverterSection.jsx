// The File Converter page. Three ways in:
//  1. the Port: drop (or choose) files and the radial menu opens;
//  2. Quick convert: say what you have and what you need, then pick files;
//  3. the tool library: every tool as a card, searchable, by kind.
// Shift + drop on any page opens the same menu (ConverterProvider).
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, ArrowRightLeft, ArrowUpRight, ChevronDown, FileAudio, FileImage, FileText, FileType, FileVideo,
  Repeat2, Search, ShieldCheck, Sparkles, Upload, X, Zap, CloudOff, Cpu, Play,
} from "lucide-react";
import { useConverter } from "./converterContext";
import { toolLibrary } from "./catalog";
import "./ConverterPage.css";
import demoVideo from "./demo/converter-demo.webm";
import demoPoster from "./demo/converter-demo-poster.jpg";

/* ── What the page knows about kinds and formats ─────────── */
const KINDS = [
  { id: "image", label: "Images", icon: FileImage, tone: "sapphire", accept: "image/*,.tif,.tiff" },
  { id: "pdf", label: "PDFs", icon: FileText, tone: "midnight", accept: "application/pdf,.pdf" },
  { id: "video", label: "Video", icon: FileVideo, tone: "iris", accept: "video/*,.mkv,.avi" },
  { id: "audio", label: "Audio", icon: FileAudio, tone: "teal", accept: "audio/*" },
  { id: "docs", label: "Documents", icon: FileType, tone: "gold", accept: ".docx,.txt,.md,.html,.htm,.csv,.json" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));

// What you can start from (grouped in the picker), and what each becomes
const FROM = [
  ["Images", [["png", "PNG", ".png,image/png"], ["jpg", "JPG", ".jpg,.jpeg,image/jpeg"], ["webp", "WEBP", ".webp,image/webp"], ["gif", "GIF", ".gif,image/gif"],
    ["bmp", "BMP", ".bmp,image/bmp"], ["svg", "SVG", ".svg,image/svg+xml"], ["avif", "AVIF", ".avif,image/avif"], ["tiff", "TIFF", ".tif,.tiff"]]],
  ["Documents", [["pdf", "PDF", ".pdf,application/pdf"], ["docx", "Word", ".docx"], ["csv", "CSV", ".csv,text/csv"], ["json", "JSON", ".json,application/json"],
    ["md", "Markdown", ".md,.markdown"], ["html", "HTML", ".html,.htm"], ["txt", "Text", ".txt,text/plain"]]],
  ["Video", [["mp4", "MP4", ".mp4,video/mp4"], ["mov", "MOV", ".mov,video/quicktime"], ["webm", "WEBM", ".webm,video/webm"], ["mkv", "MKV", ".mkv"], ["avi", "AVI", ".avi"]]],
  ["Audio", [["mp3", "MP3", ".mp3,audio/mpeg"], ["wav", "WAV", ".wav,audio/wav"], ["m4a", "M4A", ".m4a,audio/mp4"], ["ogg", "OGG", ".ogg,audio/ogg"], ["flac", "FLAC", ".flac,audio/flac"]]],
];
const FROM_FLAT = Object.fromEntries(FROM.flatMap(([group, list]) => list.map(([id, label, accept]) => [id, { id, label, accept, group }])));
const IMAGE_TO = [["png", "img-to-png"], ["jpg", "img-to-jpg"], ["webp", "img-to-webp"], ["avif", "img-to-avif"], ["bmp", "img-to-bmp"], ["ico", "img-to-ico"], ["pdf", "img-to-pdf"]];
const VIDEO_TO = [["mp4", "vid-to-mp4"], ["webm", "vid-to-webm"], ["mov", "vid-to-mov"], ["mkv", "vid-to-mkv"], ["avi", "vid-to-avi"], ["gif", "vid-to-gif"], ["mp3", "vid-audio-mp3"], ["wav", "vid-audio-wav"], ["m4a", "vid-audio-m4a"]];
const AUDIO_TO = [["mp3", "aud-to-mp3"], ["wav", "aud-to-wav"], ["m4a", "aud-to-m4a"], ["ogg", "aud-to-ogg"], ["flac", "aud-to-flac"], ["opus", "aud-to-opus"]];
const TARGETS = {
  ...Object.fromEntries(["png", "jpg", "webp", "gif", "bmp", "svg", "avif", "tiff"].map((f) => [f, IMAGE_TO])),
  pdf: [["png", "pdf-to-png-150"], ["jpg", "pdf-to-jpg-150"], ["webp", "pdf-to-webp-150"], ["txt", "pdf-to-txt"]],
  docx: [["pdf", "doc-to-pdf"], ["html", "doc-to-html"], ["txt", "doc-to-txt"]],
  md: [["html", "doc-to-html"], ["pdf", "doc-to-pdf"], ["txt", "doc-to-txt"]],
  html: [["pdf", "doc-to-pdf"], ["txt", "doc-to-txt"]],
  txt: [["pdf", "doc-to-pdf"], ["html", "doc-to-html"]],
  csv: [["json", "csv-to-json"], ["pdf", "doc-to-pdf"], ["html", "doc-to-html"]],
  json: [["csv", "json-to-csv"], ["pdf", "doc-to-pdf"]],
  ...Object.fromEntries(["mp4", "mov", "webm", "mkv", "avi"].map((f) => [f, VIDEO_TO])),
  ...Object.fromEntries(["mp3", "wav", "m4a", "ogg", "flac"].map((f) => [f, AUDIO_TO])),
};
const TO_LABEL = { png: "PNG", jpg: "JPG", webp: "WEBP", avif: "AVIF", bmp: "BMP", ico: "ICO", pdf: "PDF", txt: "Text", html: "HTML", json: "JSON", csv: "CSV",
  mp4: "MP4", webm: "WEBM", mov: "MOV", mkv: "MKV", avi: "AVI", gif: "GIF", mp3: "MP3", wav: "WAV", m4a: "M4A", ogg: "OGG", flac: "FLAC", opus: "OPUS" };
const targetsFor = (from) => (TARGETS[from] || []).filter(([to]) => to !== from);
// One click sets both sides
const PAIRS = [["pdf", "jpg"], ["jpg", "pdf"], ["docx", "pdf"], ["png", "jpg"], ["webp", "png"], ["mp4", "mp3"], ["mov", "mp4"], ["wav", "mp3"], ["csv", "json"]];

// The tools people reach for most, shown first
const POPULAR = [
  ["pdf-compress-balanced", "pdf"], ["pdf-merge", "pdf"], ["img-merge-pdf", "image"], ["img-passport", "image"],
  ["img-under-200", "image"], ["pdf-unlock", "pdf"], ["doc-to-pdf", "docs", "docx"], ["pdf-to-jpg-150", "pdf"],
  ["vid-compress-balanced", "video"], ["img-to-jpg", "image"], ["pdf-pick", "pdf"], ["aud-to-mp3", "audio"],
];
const SHORT = {
  "pdf-compress-balanced": "Compress PDF", "pdf-merge": "Merge PDFs", "img-merge-pdf": "Images to one PDF", "img-passport": "Passport photo",
  "img-under-200": "Photo under 200 KB", "pdf-unlock": "Unlock PDF", "doc-to-pdf": "Word to PDF", "pdf-to-jpg-150": "PDF to JPG",
  "vid-compress-balanced": "Compress video", "img-to-jpg": "Any image to JPG", "pdf-pick": "Pick PDF pages", "aud-to-mp3": "Audio to MP3",
};

const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

/* ── The Port: the radial menu in miniature, as a drop target ─ */
const rad = (a) => (a * Math.PI) / 180;
const at = (r, a) => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];
function wedge(r0, r1, a0, a1) {
  const [x0, y0] = at(r1, a0); const [x1, y1] = at(r1, a1); const [x2, y2] = at(r0, a1); const [x3, y3] = at(r0, a0);
  return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`;
}
const ORBITING = ["PNG", "PDF", "MP4", "DOCX", "JPG", "MP3", "WEBP", "CSV"];

function Port({ over }) {
  return (
    <div className={`cv-port${over ? " is-over" : ""}`} aria-hidden="true">
      <span className="cv-port__halo" />
      <span className="cv-port__orbit" />
      <div className="cv-port__spin">
        <svg className="cv-port__ring" viewBox="-150 -150 300 300">
          {KINDS.map((k, i) => <path key={k.id} d={wedge(104, 138, i * 72 - 34, i * 72 + 34)} className={`cv-port__w is-${k.tone}`} />)}
        </svg>
        {KINDS.map((k, i) => {
          const Icon = k.icon;
          const [x, y] = at(121, i * 72);
          return <span key={k.id} className="cv-port__icon" style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}><Icon size={16} /></span>;
        })}
      </div>
      <div className="cv-port__formats">
        {ORBITING.map((f, i) => {
          const [x, y] = at(80, i * (360 / ORBITING.length));
          return <span key={f} className="cv-port__fmt" style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}>{f}</span>;
        })}
      </div>
      <span className="cv-port__core"><ArrowRightLeft size={28} /></span>
    </div>
  );
}

/* ── The tour: a captioned recording of the real thing ───── */
// Where each step starts in the recording (seconds)
const STEPS = [
  [0, "Hold ⇧ Shift and drop a file", "On any page of the workspace"],
  [7.5, "Pick a tool on the ring", "Hover a group, then click a tool"],
  [14.1, "Or type what you need", "Search the tools, press Enter"],
  [18.2, "Download the result", "It never left this computer"],
  [20.7, "Or start from this page", "Pick a pair, then choose the files"],
];
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function DemoVideo({ videoRef }) {
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const active = STEPS.reduce((n, [t], i) => (time >= t ? i : n), 0);
  const play = (from) => {
    const v = videoRef.current;
    if (!v) return;
    if (typeof from === "number") v.currentTime = from;
    v.play().catch(() => {});
  };
  return (
    <section className="cv-demo" aria-labelledby="cv-demo-title">
      <div className="cv-demo__player">
        <video
          ref={videoRef}
          src={demoVideo}
          poster={demoPoster}
          muted
          playsInline
          preload="metadata"
          controls={started}
          aria-label="Tour of the File Converter: Shift and drop a file, pick a tool on the ring or type to search, download the result, or start from this page."
          onPlay={() => { setPlaying(true); setStarted(true); }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
        {!playing && !started && (
          <button type="button" className="cv-demo__play" onClick={() => play(0)}>
            <span className="cv-demo__play-pill">
              <span className="cv-demo__play-disc" aria-hidden="true"><Play size={20} fill="currentColor" /></span>
              Watch the tour{duration ? ` · ${clock(duration)}` : ""}
            </span>
          </button>
        )}
      </div>
      <div className="cv-demo__side">
        <span className="cv-demo__badge"><Play size={13} aria-hidden="true" /> How it works</span>
        <h2 id="cv-demo-title" className="cv-demo__title">See it in thirty seconds</h2>
        <p className="cv-demo__sub">A real run, with captions, so it works without sound. Pick a step to jump to it.</p>
        <ol className="cv-demo__steps">
          {STEPS.map(([t, title, sub], i) => {
            const on = started && i === active;
            const end = STEPS[i + 1]?.[0] ?? duration;
            const pct = on && end > t ? Math.min(100, ((time - t) / (end - t)) * 100) : 0;
            return (
              <li key={title}>
                <button type="button" className={`cv-step${on ? " is-on" : ""}`} onClick={() => play(t)} aria-current={on ? "step" : undefined}>
                  <span className="cv-step__n" aria-hidden="true">{i + 1}</span>
                  <span className="cv-step__text">
                    <strong>{title}</strong>
                    <span>{sub}</span>
                  </span>
                  <span className="cv-step__time">{clock(t)}</span>
                  {on && <span className="cv-step__bar" style={{ width: `${pct}%` }} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ── A format pill with a grid of choices ────────────────── */
function FormatPicker({ label, value, groups, onPick, disabled }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => { if (open) wrap.current?.querySelector(".cv-fmt.is-on, .cv-fmt")?.focus(); }, [open]);
  return (
    <div className="cv-pick" ref={wrap}>
      <button type="button" className={`cv-pick__btn${open ? " is-open" : ""}`} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} disabled={disabled}>
        <span className="cv-pick__label">{label}</span>
        <span className="cv-pick__value">{value}</span>
        <ChevronDown size={16} className="cv-pick__chev" aria-hidden="true" />
      </button>
      {open && (
        <motion.div className="cv-pick__menu" role="listbox" aria-label={label} initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.16 }}>
          {groups.map(([group, items]) => (
            <div key={group} className="cv-pick__group">
              <p className="cv-pick__group-title">{group}</p>
              <div className="cv-pick__grid">
                {items.map(([id, text]) => (
                  <button key={id} type="button" role="option" aria-selected={text === value} className={`cv-fmt${text === value ? " is-on" : ""}`} onClick={() => { onPick(id); setOpen(false); }}>{text}</button>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

/* ── The page ─────────────────────────────────────────────── */
export default function ConverterSection() {
  const { open, runTool } = useConverter();
  const reduce = useReducedMotion();
  const inputRef = useRef(null);
  const pending = useRef(null);
  const dockRef = useRef(null);
  const videoRef = useRef(null);
  const [accept, setAccept] = useState("");
  const [over, setOver] = useState(null); // "dock" | "quick" | null
  const [from, setFrom] = useState("png");
  const [to, setTo] = useState("jpg");
  const [tab, setTab] = useState("popular");
  const [query, setQuery] = useState("");

  const library = useMemo(() => toolLibrary(), []);
  const total = library.length;
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.id, library.filter((t) => t.kind === k.id).length])), [library]);

  // The chosen pair, and the tool it runs
  const targets = targetsFor(from);
  const pair = targets.find(([t]) => t === to) || targets[0];
  const tool = library.find((t) => t.id === pair?.[1]);
  const canSwap = FROM_FLAT[to] && targetsFor(to).some(([t]) => t === from);
  const pickFrom = (id) => {
    setFrom(id);
    const next = targetsFor(id);
    if (!next.some(([t]) => t === to)) setTo(next[0]?.[0]);
  };

  // One hidden picker: what it accepts, and what happens after, depend on who opened it
  const centre = () => {
    const r = dockRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined;
  };
  const choose = (acc, then) => {
    pending.current = then;
    setAccept(acc || "");
    requestAnimationFrame(() => inputRef.current?.click());
  };
  const chooseForTool = (t) => {
    const acc = t.kind === "docs" ? (FROM_FLAT[t.source]?.accept || KIND.docs.accept) : KIND[t.kind].accept;
    choose(acc, (files) => runTool(files, t.id, centre()));
  };

  const dropZone = (name, onFiles) => ({
    onDragOver: (e) => { if (isFileDrag(e)) { e.preventDefault(); setOver(name); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); },
    onDrop: (e) => { e.preventDefault(); setOver(null); onFiles(e.dataTransfer.files, { x: e.clientX, y: e.clientY }); },
  });

  // The library: popular, one kind (in its groups), or search results (by kind)
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/);
      const hits = library.filter((t) => words.every((w) => t.keywords.includes(w) || t.title.toLowerCase().includes(w)));
      return KINDS.map((k) => [k.label, hits.filter((t) => t.kind === k.id)]).filter(([, list]) => list.length);
    }
    if (tab === "popular") {
      return [["Most used", POPULAR.map(([id, kind, source]) => {
        const t = library.find((x) => x.id === id && x.kind === kind && (!source || x.source === source));
        return t && { ...t, title: SHORT[id] || t.title };
      }).filter(Boolean)]];
    }
    const byGroup = new Map();
    for (const t of library.filter((x) => x.kind === tab)) {
      if (!byGroup.has(t.group)) byGroup.set(t.group, []);
      byGroup.get(t.group).push(t);
    }
    return [...byGroup.entries()];
  }, [library, query, tab]);
  const found = groups.reduce((n, [, list]) => n + list.length, 0);

  const TABS = [["popular", "Popular", Sparkles, POPULAR.length], ...KINDS.map((k) => [k.id, k.label, k.icon, counts[k.id]])];

  return (
    <div className="cv-page">
      {/* ── The two ways in ── */}
      <div className="cv-hero">
        <div ref={dockRef} className={`cv-dock${over === "dock" ? " is-over" : ""}`} {...dropZone("dock", (files, p) => open(files, p))}>
          <Port over={over === "dock"} />
          <div className="cv-dock__text">
            <h2 className="cv-dock__title">{over === "dock" ? "Let go to open the tools" : "Drop files here"}</h2>
            <p className="cv-dock__sub">Images, PDFs, video, audio and documents: {total} tools open in a ring around them.</p>
          </div>
          <div className="cv-dock__actions">
            <button type="button" className="cv-btn cv-btn--primary cv-btn--lg" onClick={() => choose("", (files) => open(files, centre()))}>
              <Upload size={17} /> Choose files
            </button>
            <button
              type="button"
              className="cv-btn cv-btn--ghost cv-btn--lg"
              onClick={() => {
                const v = videoRef.current;
                v?.closest(".cv-demo")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
                if (v) { v.currentTime = 0; v.play().catch(() => {}); }
              }}
            >
              <Play size={16} /> Watch the tour
            </button>
          </div>
          <p className="cv-dock__tip"><kbd>⇧ Shift</kbd> + drop works on every page too</p>
        </div>

        <div className={`cv-quick${over === "quick" ? " is-over" : ""}`} {...dropZone("quick", (files, p) => tool && runTool(files, tool.id, p))}>
          <div className="cv-quick__head">
            <span className="cv-quick__badge"><Zap size={14} /> Quick convert</span>
            <h2 className="cv-quick__title">What do you have, and what do you need?</h2>
          </div>
          <div className="cv-quick__pair">
            <FormatPicker label="From" value={FROM_FLAT[from]?.label} groups={FROM.map(([g, items]) => [g, items.map(([id, l]) => [id, l])])} onPick={pickFrom} />
            <button type="button" className="cv-swap" onClick={() => { const f = from; setFrom(to); setTo(f); }} disabled={!canSwap} aria-label="Swap the two formats" title={canSwap ? "Swap" : "Can't convert back the other way"}>
              <Repeat2 size={18} />
            </button>
            <FormatPicker label="To" value={TO_LABEL[pair?.[0]]} groups={[["Becomes", targets.map(([t]) => [t, TO_LABEL[t]])]]} onPick={setTo} disabled={!targets.length} />
          </div>
          <p className="cv-quick__what" aria-live="polite">
            {tool ? (<><strong>{tool.title}</strong>{tool.hint ? <span> · {tool.hint}</span> : null}</>) : "Pick a format"}
          </p>
          <div className="cv-pairs">
            <p className="cv-pairs__title">Popular pairs</p>
            <div className="cv-pairs__list">
              {PAIRS.map(([f, t]) => {
                const on = f === from && t === pair?.[0];
                return (
                  <button key={`${f}-${t}`} type="button" className={`cv-pairchip${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => { setFrom(f); setTo(t); }}>
                    {FROM_FLAT[f].label} <ArrowRight size={13} aria-hidden="true" /> {TO_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="cv-quick__go">
            <button type="button" className="cv-btn cv-btn--primary cv-btn--lg" disabled={!tool} onClick={() => tool && choose(FROM_FLAT[from]?.accept, (files) => runTool(files, tool.id, centre()))}>
              <Upload size={17} /> Choose {FROM_FLAT[from]?.label} files
            </button>
            <span className="cv-quick__or">or drop them on this card</span>
          </div>
          <ul className="cv-trust" aria-label="How it works">
            <li><Cpu size={14} aria-hidden="true" /> Runs on this computer</li>
            <li><CloudOff size={14} aria-hidden="true" /> Nothing is uploaded</li>
            <li><ShieldCheck size={14} aria-hidden="true" /> No account, no limits</li>
          </ul>
        </div>
      </div>

      <DemoVideo videoRef={videoRef} />

      {/* ── Every tool ── */}
      <section className="cv-lib" aria-labelledby="cv-lib-title">
        <header className="cv-lib__head">
          <div>
            <h2 id="cv-lib-title" className="cv-lib__title">Every tool</h2>
            <p className="cv-lib__sub">Pick a tool, then choose the files. {query ? `${found} match${found === 1 ? "" : "es"}` : `${library.length} to choose from`}</p>
          </div>
          <label className="cv-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search tools</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, e.g. compress pdf" />
            {query && <button type="button" className="cv-search__clear" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
          </label>
        </header>

        <div className={`cv-tabs${query ? " is-dim" : ""}`} role="tablist" aria-label="Kinds of file">
          {TABS.map(([id, label, Icon, n]) => {
            const on = tab === id && !query;
            return (
              <button key={id} type="button" role="tab" aria-selected={on} className={`cv-tab${on ? " is-on" : ""}`} onClick={() => { setTab(id); setQuery(""); }}>
                {on && <motion.span layoutId="cv-tab-pill" className="cv-tab__pill" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }} />}
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
                <span className="cv-tab__n">{n}</span>
              </button>
            );
          })}
        </div>

        {groups.length === 0 ? (
          <p className="cv-lib__empty">No tool matches “{query}”. Try a format (pdf, mp4) or a task (compress, merge, crop).</p>
        ) : groups.map(([title, list]) => (
          <div key={`${tab}-${query}-${title}`} className="cv-lib__group">
            <h3 className="cv-lib__group-title">{title}<span>{list.length}</span></h3>
            <div className="cv-tools">
              {list.map((t, i) => {
                const k = KIND[t.kind];
                const Icon = t.icon || k.icon;
                return (
                  <motion.button
                    key={`${t.kind}-${t.source || ""}-${t.id}`}
                    type="button"
                    className={`cv-tool is-${k.tone}`}
                    onClick={() => chooseForTool(t)}
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(i, 12) * 0.025 }}
                  >
                    <span className="cv-tool__icon" aria-hidden="true"><Icon size={18} /></span>
                    <span className="cv-tool__text">
                      <span className="cv-tool__title">{t.title}</span>
                      <span className="cv-tool__hint">{t.hint || `${k.label}${t.many ? " · several files" : ""}`}</span>
                    </span>
                    <span className="cv-tool__go" aria-hidden="true"><ArrowUpRight size={16} /></span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept || undefined}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) (pending.current || ((fs) => open(fs, centre())))(files);
          pending.current = null;
          e.target.value = "";
        }}
      />
    </div>
  );
}
