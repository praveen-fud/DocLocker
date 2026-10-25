// The File Converter page: drop or choose files and the radial menu opens.
// Also explains the shortcut: Shift + drop anywhere in DocLocker.
import { useMemo, useRef, useState } from "react";
import { ArrowRightLeft, FileAudio, FileImage, FileText, FileType, FileVideo, ShieldCheck, Upload } from "lucide-react";
import { useConverter } from "./converterContext";
import { buildMenu } from "./catalog";

const fake = (name, type = "") => ({ name, type, size: 0 });

const KINDS = [
  { id: "image", label: "Images", icon: FileImage, tone: "sapphire", accept: "image/*,.tif,.tiff", sample: [fake("a.png", "image/png"), fake("b.png", "image/png")],
    examples: ["PNG", "JPG", "WEBP", "AVIF", "ICO", "PDF", "Resize", "Under 200 KB", "Crop", "Passport photo", "Enhance scan"] },
  { id: "pdf", label: "PDFs", icon: FileText, tone: "midnight", accept: "application/pdf,.pdf", sample: [fake("a.pdf"), fake("b.pdf")],
    examples: ["Merge", "Split", "Pick pages", "Compress", "Unlock", "Page numbers", "Watermark", "To images", "To text"] },
  { id: "video", label: "Video", icon: FileVideo, tone: "iris", accept: "video/*,.mkv,.avi", sample: [fake("a.mp4")],
    examples: ["MP4", "WEBM", "MOV", "GIF", "Trim", "Compress", "720p", "Extract audio", "Mute", "Save a frame"] },
  { id: "audio", label: "Audio", icon: FileAudio, tone: "teal", accept: "audio/*", sample: [fake("a.mp3"), fake("b.mp3")],
    examples: ["MP3", "WAV", "M4A", "FLAC", "OPUS", "Trim", "Compress", "Normalize", "Join"] },
  { id: "docs", label: "Documents", icon: FileType, tone: "gold", accept: ".docx,.txt,.md,.html,.htm,.csv,.json", sample: [fake("a.docx"), fake("a.md"), fake("a.csv"), fake("a.json")],
    examples: ["Word to PDF", "Word to text", "Markdown to HTML", "HTML to PDF", "CSV to JSON", "JSON to CSV"] },
];

const countFor = (k) => (k.id === "docs"
  ? k.sample.reduce((n, f) => n + buildMenu([f]).categories.reduce((m, c) => m + c.options.length, 0), 0)
  : buildMenu(k.sample).categories.reduce((m, c) => m + c.options.length, 0));

export default function ConverterSection() {
  const { open } = useConverter();
  const stageRef = useRef(null);
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [accept, setAccept] = useState("");
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.id, countFor(k)])), []);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const centre = () => {
    const r = stageRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 260) } : undefined;
  };
  const choose = (acc = "") => {
    setAccept(acc);
    // Let the accept attribute update before the picker opens
    requestAnimationFrame(() => inputRef.current?.click());
  };

  return (
    <div className="cv-page">
      <div
        ref={stageRef}
        className={`cv-stage${over ? " is-over" : ""}`}
        onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          open(e.dataTransfer.files, { x: e.clientX, y: e.clientY });
        }}
      >
        <span className="cv-stage__orbit is-a" aria-hidden="true" />
        <span className="cv-stage__orbit is-b" aria-hidden="true" />
        <span className="cv-stage__disc" aria-hidden="true"><ArrowRightLeft size={30} /></span>
        <h2 className="cv-stage__title">{over ? "Drop to open the tools" : "Drop files here to convert"}</h2>
        <p className="cv-stage__text">
          {total}+ tools for images, PDFs, video, audio and documents: convert, compress, crop, trim and merge.
        </p>
        <div className="cv-stage__actions">
          <button type="button" className="cv-btn cv-btn--primary cv-btn--lg" onClick={() => choose("")}>
            <Upload size={17} /> Choose files
          </button>
        </div>
        <p className="cv-stage__tip">
          On any page of the workspace: hold <kbd>⇧ Shift</kbd> while you drop a file, and the tools open where it lands.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept || undefined}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { open(e.target.files, centre()); e.target.value = ""; }}
        />
      </div>

      <ul className="cv-kinds" aria-label="What it can do">
        {KINDS.map((k) => {
          const Icon = k.icon;
          return (
            <li key={k.id}>
              <button type="button" className={`cv-kind is-${k.tone}`} onClick={() => choose(k.accept)}>
                <span className="cv-kind__icon" aria-hidden="true"><Icon size={20} /></span>
                <span className="cv-kind__head">
                  <span className="cv-kind__label">{k.label}</span>
                  <span className="cv-kind__count">{counts[k.id]} tools</span>
                </span>
                <span className="cv-kind__examples">
                  {k.examples.map((x) => <span key={x} className="cv-kind__chip">{x}</span>)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="cv-privacy">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          Files are converted on this computer and never uploaded. The video and audio tools fetch their engine (about 31 MB) the first time you use one.
        </span>
      </p>
    </div>
  );
}
