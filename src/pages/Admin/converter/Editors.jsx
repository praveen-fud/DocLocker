// The File Converter's editors: crop an image, trim a recording (or pick
// a frame), and answer a short question (pages, password, text). Each
// resolves with the choice or cancels; dialogs are solid white.
import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Play, Pause, X } from "lucide-react";
import useBlobUrl from "./useBlobUrl";

function Dialog({ title, wide, onCancel, children, footer }) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current?.querySelector("[data-autofocus]") || ref.current?.querySelector("button, input");
    el?.focus();
    return () => prev?.focus?.();
  }, []);
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
    if (e.key === "Tab") {
      // Keep focus inside the dialog
      const items = [...ref.current.querySelectorAll("button:not(:disabled), input, [tabindex='0']")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  return (
    <div className="cv-layer cv-layer--dialog" role="presentation">
      <motion.div className="cv-scrim cv-scrim--strong" onClick={onCancel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        ref={ref}
        className={`cv-dialog${wide ? " cv-dialog--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKey}
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="cv-dialog__head">
          <h2 id={titleId} className="cv-dialog__title">{title}</h2>
          <button type="button" className="cv-icon-btn" onClick={onCancel} aria-label="Cancel"><X size={18} /></button>
        </header>
        <div className="cv-dialog__body">{children}</div>
        {footer && <footer className="cv-dialog__foot">{footer}</footer>}
      </motion.div>
    </div>
  );
}

/* ── Prompt ─────────────────────────────────────────────── */
export function PromptDialog({ title, label, placeholder, hint, type = "text", initial = "", inputMode, validate, onDone, onCancel }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState("");
  const inputId = useId();
  const submit = (e) => {
    e?.preventDefault();
    const problem = validate?.(value) || "";
    if (problem) { setError(problem); return; }
    onDone(value.trim());
  };
  return (
    <Dialog
      title={title}
      onCancel={onCancel}
      footer={(<>
        <button type="button" className="cv-btn cv-btn--ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="cv-btn cv-btn--primary" onClick={submit}><Check size={16} /> Continue</button>
      </>)}
    >
      <form onSubmit={submit} className="cv-field">
        <label htmlFor={inputId} className="cv-field__label">{label}</label>
        <input
          id={inputId}
          data-autofocus
          className={`cv-input${error ? " is-error" : ""}`}
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          autoComplete={type === "password" ? "off" : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-err` : undefined}
        />
        {error ? <p id={`${inputId}-err`} className="cv-field__error" role="alert">{error}</p> : hint ? <p className="cv-field__hint">{hint}</p> : null}
      </form>
    </Dialog>
  );
}

/* ── Crop ───────────────────────────────────────────────── */
const ASPECTS = [["Free", null], ["Square", 1], ["4:3", 4 / 3], ["3:2", 3 / 2], ["16:9", 16 / 9], ["3:4", 3 / 4], ["Passport", 35 / 45]];
const MIN = 24;

function fitRect(w, h, aspect) {
  if (!aspect) return { x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8 };
  let cw = w * 0.9;
  let ch = cw / aspect;
  if (ch > h * 0.9) { ch = h * 0.9; cw = ch * aspect; }
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}

export function CropEditor({ file, aspect: startAspect = null, onDone, onCancel }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState("");
  const [aspect, setAspect] = useState(startAspect);
  const [rect, setRect] = useState(null);
  const canvasRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    let live = true;
    import("./engines/image")
      .then(({ loadImage }) => loadImage(file))
      .then((s) => { if (live) setSrc(s); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [file]);

  // Display size: the whole image, as large as the dialog allows
  const maxW = Math.min(820, window.innerWidth - 64);
  const maxH = Math.min(520, window.innerHeight - 300);
  const k = src ? Math.min(maxW / src.width, maxH / src.height, 1) : 1;
  const dw = src ? Math.round(src.width * k) : 0;
  const dh = src ? Math.round(src.height * k) : 0;

  useEffect(() => {
    if (!src || !canvasRef.current) return;
    const c = canvasRef.current;
    c.width = dw * devicePixelRatio;
    c.height = dh * devicePixelRatio;
    c.getContext("2d").drawImage(src.img, 0, 0, c.width, c.height);
    setRect((r) => r || fitRect(dw, dh, aspect));
  }, [src, dw, dh, aspect]);

  const clamp = (r) => {
    const w = Math.max(MIN, Math.min(r.w, dw));
    const h = Math.max(MIN, Math.min(r.h, dh));
    return { w, h, x: Math.max(0, Math.min(r.x, dw - w)), y: Math.max(0, Math.min(r.y, dh - h)) };
  };

  // The box (data-mode="move") or a corner (data-mode="nw" …) was grabbed
  const grabBox = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode: e.currentTarget.dataset.mode, x: e.clientX, y: e.clientY, rect };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const r = d.rect;
    if (d.mode === "move") { setRect(clamp({ ...r, x: r.x + dx, y: r.y + dy })); return; }
    // Resize from a corner, the opposite corner stays put
    const left = d.mode.includes("w");
    const top = d.mode.includes("n");
    const ax = left ? r.x + r.w : r.x;
    const ay = top ? r.y + r.h : r.y;
    const px = Math.max(0, Math.min(dw, (left ? r.x : r.x + r.w) + dx));
    const py = Math.max(0, Math.min(dh, (top ? r.y : r.y + r.h) + dy));
    let w = Math.max(MIN, Math.abs(px - ax));
    let h = Math.max(MIN, Math.abs(py - ay));
    if (aspect) {
      h = w / aspect;
      const room = top ? ay : dh - ay;
      if (h > room) { h = room; w = h * aspect; }
      const roomX = left ? ax : dw - ax;
      if (w > roomX) { w = roomX; h = w / aspect; }
    }
    setRect({ x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
  };
  const end = () => { drag.current = null; };

  const nudge = (e) => {
    if (!rect || !e.key.startsWith("Arrow")) return;
    e.preventDefault();
    const s = e.shiftKey ? 10 : 2;
    const dx = e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0;
    const dy = e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0;
    setRect(clamp({ ...rect, x: rect.x + dx, y: rect.y + dy }));
  };

  const pick = (a) => { setAspect(a); setRect(fitRect(dw, dh, a)); };
  const confirm = () => {
    if (!src || !rect) return;
    const f = src.width / dw;
    onDone({ x: Math.round(rect.x * f), y: Math.round(rect.y * f), w: Math.round(rect.w * f), h: Math.round(rect.h * f) });
  };
  const outW = src && rect ? Math.round((rect.w * src.width) / dw) : 0;
  const outH = src && rect ? Math.round((rect.h * src.width) / dw) : 0;

  return (
    <Dialog
      title={`Crop ${file.name}`}
      wide
      onCancel={onCancel}
      footer={(<>
        <span className="cv-dialog__meta">{outW ? `${outW} × ${outH} px` : ""}</span>
        <button type="button" className="cv-btn cv-btn--ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="cv-btn cv-btn--primary" onClick={confirm} disabled={!rect} data-autofocus><Check size={16} /> Crop</button>
      </>)}
    >
      <div className="cv-aspects" role="radiogroup" aria-label="Shape">
        {ASPECTS.map(([label, a]) => (
          <button key={label} type="button" role="radio" aria-checked={aspect === a} className={`cv-chip${aspect === a ? " is-on" : ""}`} onClick={() => pick(a)}>{label}</button>
        ))}
      </div>
      {error ? <p className="cv-field__error" role="alert">{error}</p> : !src ? <p className="cv-dialog__loading">Opening the image…</p> : (
        <div className="cv-crop" style={{ width: dw, height: dh }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <canvas ref={canvasRef} style={{ width: dw, height: dh }} aria-hidden="true" />
          {rect && (
            <div
              className="cv-crop__box"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
              data-mode="move"
              onPointerDown={grabBox}
              tabIndex={0}
              role="slider"
              aria-label="Crop area: drag to move, arrow keys to nudge"
              aria-valuetext={`${outW} by ${outH} pixels`}
              onKeyDown={nudge}
            >
              <span className="cv-crop__grid" aria-hidden="true" />
              {["nw", "ne", "sw", "se"].map((h) => (
                <span key={h} className={`cv-crop__handle is-${h}`} data-mode={h} onPointerDown={grabBox} aria-hidden="true" />
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/* ── Trim / frame ───────────────────────────────────────── */
const fmt = (t) => {
  if (!Number.isFinite(t)) return "0:00.0";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
};
const parseTime = (text) => {
  const m = /^\s*(?:(\d+):)?(\d+(?:\.\d+)?)\s*$/.exec(text);
  return m ? Number(m[1] || 0) * 60 + Number(m[2]) : NaN;
};

export function TrimEditor({ file, kind, mode = "trim", onDone, onCancel }) {
  const url = useBlobUrl(file);
  const mediaRef = useRef(null);
  const trackRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState([0, 0]);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [noPreview, setNoPreview] = useState(false);
  const [typed, setTyped] = useState(["0:00.0", ""]);
  const drag = useRef(null);
  const frameMode = mode === "frame";

  const onMeta = () => {
    const d = mediaRef.current.duration;
    if (!Number.isFinite(d) || d <= 0) { setNoPreview(true); return; }
    setDuration(d);
    setRange([0, d]);
    setTyped([fmt(0), fmt(d)]);
  };
  const onTime = () => {
    const el = mediaRef.current;
    setNow(el.currentTime);
    if (!frameMode && playing && el.currentTime >= range[1]) { el.pause(); setPlaying(false); }
  };
  const seek = (t) => { const el = mediaRef.current; if (el) { el.currentTime = Math.max(0, Math.min(duration, t)); setNow(el.currentTime); } };

  const timeAt = (clientX) => {
    const box = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width)) * duration;
  };
  // A grip (data-grip="start" | "end") was grabbed
  const grab = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = e.currentTarget.dataset.grip;
  };
  const slide = (e) => {
    if (!drag.current) return;
    const t = timeAt(e.clientX);
    if (drag.current === "start") {
      const a = Math.min(t, range[1] - 0.2);
      setRange([a, range[1]]);
      setTyped([fmt(a), typed[1]]);
      seek(a);
    } else if (drag.current === "end") {
      const b = Math.max(t, range[0] + 0.2);
      setRange([range[0], b]);
      setTyped([typed[0], fmt(b)]);
      seek(b);
    } else {
      seek(t);
    }
  };
  const release = () => { drag.current = null; };

  const playSelection = async () => {
    const el = mediaRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); return; }
    if (!frameMode && (el.currentTime < range[0] || el.currentTime >= range[1] - 0.05)) el.currentTime = range[0];
    try { await el.play(); setPlaying(true); } catch { setPlaying(false); }
  };

  const typedRange = () => {
    const a = parseTime(typed[0]);
    const b = parseTime(typed[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
    return duration ? [Math.max(0, a), Math.min(duration, b)] : [a, b];
  };
  const commitTyped = () => { const r = typedRange(); if (r) setRange(r); };

  const confirm = async () => {
    if (frameMode) {
      const v = mediaRef.current;
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0);
      c.toBlob((b) => b && onDone(b), "image/png");
      return;
    }
    const r = noPreview ? typedRange() : range;
    if (r) onDone({ start: r[0], end: r[1] });
  };

  const pct = (t) => `${duration ? (t / duration) * 100 : 0}%`;
  const Tag = kind === "video" ? "video" : "audio";
  const canConfirm = frameMode ? !noPreview && duration > 0 : noPreview ? Boolean(typedRange()) : duration > 0;

  return (
    <Dialog
      title={frameMode ? `Pick a frame from ${file.name}` : `Trim ${file.name}`}
      wide
      onCancel={onCancel}
      footer={(<>
        <span className="cv-dialog__meta">{frameMode ? `At ${fmt(now)}` : !noPreview && duration ? `Keeps ${fmt(range[1] - range[0])} of ${fmt(duration)}` : ""}</span>
        <button type="button" className="cv-btn cv-btn--ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="cv-btn cv-btn--primary" onClick={confirm} disabled={!canConfirm} data-autofocus>
          <Check size={16} /> {frameMode ? "Save this frame" : "Trim"}
        </button>
      </>)}
    >
      {url && (
        <Tag
          ref={mediaRef}
          className={`cv-media cv-media--${kind}${noPreview ? " is-hidden" : ""}`}
          src={url}
          preload="metadata"
          playsInline
          onLoadedMetadata={onMeta}
          onTimeUpdate={onTime}
          onPause={() => setPlaying(false)}
          onError={() => setNoPreview(true)}
        />
      )}
      {noPreview ? (
        frameMode ? <p className="cv-field__error" role="alert">This browser can't show this video, so a frame can't be picked. Convert it to MP4 first.</p> : (
          <div className="cv-times">
            <p className="cv-field__hint">This browser can't preview this file. Type where to cut (minutes:seconds).</p>
            <label className="cv-field"><span className="cv-field__label">From</span><input className="cv-input" value={typed[0]} onChange={(e) => setTyped([e.target.value, typed[1]])} /></label>
            <label className="cv-field"><span className="cv-field__label">To</span><input className="cv-input" value={typed[1]} placeholder="e.g. 1:30" onChange={(e) => setTyped([typed[0], e.target.value])} /></label>
          </div>
        )
      ) : (
        <>
          <div className="cv-track" ref={trackRef} onPointerDown={(e) => { drag.current = "seek"; e.currentTarget.setPointerCapture(e.pointerId); seek(timeAt(e.clientX)); }} onPointerMove={slide} onPointerUp={release} onPointerCancel={release}>
            {!frameMode && <span className="cv-track__keep" style={{ left: pct(range[0]), width: `calc(${pct(range[1])} - ${pct(range[0])})` }} />}
            <span className="cv-track__head" style={{ left: pct(now) }} aria-hidden="true" />
            {!frameMode && (
              <>
                <span className="cv-track__grip is-start" style={{ left: pct(range[0]) }} data-grip="start" onPointerDown={grab} role="slider" tabIndex={0} aria-label="Start" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={range[0]} aria-valuetext={fmt(range[0])}
                  onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const t = Math.max(0, Math.min(range[1] - 0.2, range[0] + (e.key === "ArrowRight" ? 0.5 : -0.5))); setRange([t, range[1]]); setTyped([fmt(t), typed[1]]); seek(t); } }} />
                <span className="cv-track__grip is-end" style={{ left: pct(range[1]) }} data-grip="end" onPointerDown={grab} role="slider" tabIndex={0} aria-label="End" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={range[1]} aria-valuetext={fmt(range[1])}
                  onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const t = Math.min(duration, Math.max(range[0] + 0.2, range[1] + (e.key === "ArrowRight" ? 0.5 : -0.5))); setRange([range[0], t]); setTyped([typed[0], fmt(t)]); seek(t); } }} />
              </>
            )}
          </div>
          <div className="cv-trim-row">
            <button type="button" className="cv-btn cv-btn--ghost" onClick={playSelection}>
              {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pause" : frameMode ? "Play" : "Play selection"}
            </button>
            {!frameMode && (
              <>
                <button type="button" className="cv-btn cv-btn--ghost" onClick={() => { const a = Math.min(now, range[1] - 0.2); setRange([a, range[1]]); setTyped([fmt(a), typed[1]]); }}>Start here</button>
                <button type="button" className="cv-btn cv-btn--ghost" onClick={() => { const b = Math.max(now, range[0] + 0.2); setRange([range[0], b]); setTyped([typed[0], fmt(b)]); }}>End here</button>
                <label className="cv-time"><span className="sr-only">From</span><input className="cv-input" value={typed[0]} onChange={(e) => setTyped([e.target.value, typed[1]])} onBlur={commitTyped} /></label>
                <span aria-hidden="true">–</span>
                <label className="cv-time"><span className="sr-only">To</span><input className="cv-input" value={typed[1]} onChange={(e) => setTyped([typed[0], e.target.value])} onBlur={commitTyped} /></label>
              </>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
