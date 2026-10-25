// File Converter for the staff workspace. Hold Shift while dropping files
// anywhere in DocLocker (or use the File Converter page) and a radial menu
// of tools opens where they land. Every tool runs in this browser; files
// are never uploaded.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConverterContext } from "./converterContext";
import RadialMenu from "./RadialMenu";
import DropOverlay from "./DropOverlay";
import ResultsTray from "./ResultsTray";
import { CropEditor, PromptDialog, TrimEditor } from "./Editors";
import "./Converter.css";

const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
const cancelled = () => Object.assign(new Error("Cancelled"), { cancelled: true });

export default function ConverterProvider({ children }) {
  const [menu, setMenu] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [editor, setEditor] = useState(null);
  const [drag, setDrag] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [announce, setAnnounce] = useState("");
  const seq = useRef(0);
  const dragTimer = useRef(0);
  const frame = useRef(0);
  const jobsRef = useRef(jobs);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  const open = useCallback((fileList, point) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const p = point || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setMenu({ files, x: p.x, y: p.y, key: Date.now() });
  }, []);

  // Shift + drop, anywhere in the workspace. Capture phase, so it wins over
  // the upload areas underneath; without Shift, drops behave as before.
  useEffect(() => {
    const hide = () => setDrag(null);
    const onOver = (e) => {
      if (!isFileDrag(e)) return;
      clearTimeout(dragTimer.current);
      dragTimer.current = setTimeout(hide, 250);
      const next = { shift: e.shiftKey, x: e.clientX, y: e.clientY };
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setDrag(next));
      if (e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        // Always a copy: the original file is never moved
        e.dataTransfer.dropEffect = "copy";
      }
    };
    const onDrop = (e) => {
      if (!isFileDrag(e)) return;
      clearTimeout(dragTimer.current);
      cancelAnimationFrame(frame.current);
      hide();
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      open(e.dataTransfer.files, { x: e.clientX, y: e.clientY });
    };
    window.addEventListener("dragover", onOver, true);
    window.addEventListener("drop", onDrop, true);
    window.addEventListener("dragend", hide, true);
    return () => {
      window.removeEventListener("dragover", onOver, true);
      window.removeEventListener("drop", onDrop, true);
      window.removeEventListener("dragend", hide, true);
      clearTimeout(dragTimer.current);
      cancelAnimationFrame(frame.current);
    };
  }, [open]);

  // Leaving the workspace releases every converted file from memory
  useEffect(() => () => {
    for (const j of jobsRef.current) for (const o of j.outputs || []) URL.revokeObjectURL(o.url);
  }, []);

  const update = useCallback((id, patch) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j))), []);

  // An editor as a promise: resolves with the choice, rejects on cancel
  const ask = useCallback((type, props, id) => new Promise((resolve, reject) => {
    update(id, { note: "Waiting for your choice…" });
    setEditor({
      type,
      props,
      done: (value) => { setEditor(null); update(id, { note: "" }); resolve(value); },
      cancel: () => { setEditor(null); reject(cancelled()); },
    });
  }), [update]);

  const runOption = useCallback(async (option, files) => {
    setMenu(null);
    seq.current += 1;
    const id = seq.current;
    setJobs((js) => [{
      id, title: option.title, sources: files.map((f) => f.name), inputSize: files.reduce((n, f) => n + f.size, 0),
      status: "running", progress: null, note: "", outputs: [],
    }, ...js]);
    const ctx = {
      progress: (p) => update(id, { progress: p }),
      status: (text) => update(id, { note: text }),
      crop: (file, aspect) => ask("crop", { file, aspect }, id),
      trim: (file, kind) => ask("trim", { file, kind }, id),
      frame: (file) => ask("trim", { file, kind: "video", mode: "frame" }, id),
      prompt: (opts) => ask("prompt", opts, id),
    };
    try {
      const outputs = await option.run(files, ctx);
      update(id, { status: "done", outputs, progress: 1, note: "" });
      setFocusId(id);
      setAnnounce(`${option.title}: ${outputs.length === 1 ? outputs[0].name : `${outputs.length} files`} ready to download.`);
    } catch (err) {
      if (err?.cancelled) setJobs((js) => js.filter((j) => j.id !== id));
      else update(id, { status: "error", error: err?.message || "Something went wrong." });
    }
  }, [ask, update]);

  const dismiss = useCallback((id) => setJobs((js) => {
    const j = js.find((x) => x.id === id);
    for (const o of j?.outputs || []) URL.revokeObjectURL(o.url);
    return js.filter((x) => x.id !== id);
  }), []);
  const clearDone = useCallback(() => setJobs((js) => {
    for (const j of js) if (j.status !== "running") for (const o of j.outputs || []) URL.revokeObjectURL(o.url);
    return js.filter((j) => j.status === "running");
  }), []);

  const value = useMemo(() => ({ open, jobs }), [open, jobs]);

  // Drops onto the menu or an editor's backdrop: take the new files instead
  // of letting the browser open them
  const catchDrop = {
    onDragOver: (e) => { if (isFileDrag(e)) e.preventDefault(); },
    onDrop: (e) => { if (!isFileDrag(e)) return; e.preventDefault(); if (!editor) open(e.dataTransfer.files, { x: e.clientX, y: e.clientY }); },
  };

  return (
    <ConverterContext.Provider value={value}>
      {children}
      {drag && !menu && !editor && <DropOverlay {...drag} />}
      {menu && (
        <div {...catchDrop}>
          <RadialMenu key={menu.key} files={menu.files} x={menu.x} y={menu.y} onRun={runOption} onClose={() => setMenu(null)} />
        </div>
      )}
      {editor && (
        <div {...catchDrop}>
          {editor.type === "crop" && <CropEditor {...editor.props} onDone={editor.done} onCancel={editor.cancel} />}
          {editor.type === "trim" && <TrimEditor {...editor.props} onDone={editor.done} onCancel={editor.cancel} />}
          {editor.type === "prompt" && <PromptDialog {...editor.props} onDone={editor.done} onCancel={editor.cancel} />}
        </div>
      )}
      {jobs.length > 0 && <ResultsTray jobs={jobs} focusId={focusId} onDismiss={dismiss} onClear={clearDone} />}
      <p className="sr-only" aria-live="polite">{announce}</p>
    </ConverterContext.Provider>
  );
}
