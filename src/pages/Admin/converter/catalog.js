// File Converter — every tool, grouped into the radial menu's rings.
// buildMenu(files) returns the inner ring (categories) for what was dropped;
// each category holds the outer ring (options). An option's run(files, ctx)
// returns the outputs; ctx opens editors (crop, trim, prompt) when needed.
import {
  ArrowRightLeft, Scaling, Shrink, Crop, RotateCw, SlidersHorizontal, Layers, FileStack, Stamp,
  Scissors, AudioLines, Sparkles, FileText,
} from "lucide-react";
import { extOf, kindOf, outName, output, KIND_LABEL } from "./kinds";

const img = () => import("./engines/image");
const pdf = () => import("./engines/pdf");
const media = () => import("./engines/media");
const docs = () => import("./engines/docs");
const zip = () => import("./engines/zip");

// Apply one operation to each file in turn
const each = (fn) => async (files, ctx) => {
  const outs = [];
  for (const [i, f] of files.entries()) {
    const r = await fn(f, { ...ctx, progress: (p) => ctx.progress?.((i + p) / files.length) });
    outs.push(...(Array.isArray(r) ? r : [r]));
    ctx.progress?.((i + 1) / files.length);
  }
  return outs;
};

const opt = (id, label, title, run, extra = {}) => ({ id, label, title, run, ...extra, keywords: `${label} ${title} ${extra.keywords || ""}`.toLowerCase() });

const KB = 1024;

/* ── Images ─────────────────────────────────────────────── */
function imageCats(files) {
  const multi = files.length > 1;
  const conv = (fmt, label, hint) => opt(`img-to-${fmt}`, label, `Convert to ${label}`,
    each(async (f) => (await img()).transformImage(f, {}, { fmt, quality: 0.92 })), { hint });
  const scale = (s) => opt(`img-scale-${s}`, `${Math.round(s * 100)}%`, `Resize to ${Math.round(s * 100)}%`,
    each(async (f) => (await img()).transformImage(f, { scale: s }, { tag: `${Math.round(s * 100)}pct` })), { keywords: "resize scale percent" });
  const width = (w) => opt(`img-w-${w}`, `${w} px`, `Resize to ${w} px wide`,
    each(async (f) => (await img()).transformImage(f, { width: w }, { tag: `${w}w` })), { keywords: "resize width pixels" });
  const quality = (q, label, hint) => opt(`img-q-${label.toLowerCase()}`, label, `Compress: ${label.toLowerCase()} (${Math.round(q * 100)}% quality)`,
    each(async (f) => {
      const { transformImage, keepFormat } = await img();
      const fmt = keepFormat(f) === "png" || keepFormat(f) === "bmp" ? "jpg" : keepFormat(f);
      return transformImage(f, {}, { fmt, quality: q, tag: "compressed" });
    }), { hint, keywords: "compress smaller quality reduce size" });
  const under = (kb) => opt(`img-under-${kb}`, kb >= KB ? `< ${kb / KB} MB` : `< ${kb} KB`, `Compress to under ${kb >= KB ? `${kb / KB} MB` : `${kb} KB`}`,
    each(async (f) => (await img()).transformImage(f, {}, { maxBytes: kb * KB, tag: kb >= KB ? `${kb / KB}mb` : `${kb}kb` })),
    { hint: "Lowers quality, then size, until the file fits. Useful for upload limits.", keywords: "compress under limit kb mb upload" });
  const crop = (aspect, label) => opt(`img-crop-${label.toLowerCase().replace(/\W+/g, "")}`, label, `Crop${aspect ? ` to ${label}` : ""}`,
    each(async (f, ctx) => {
      const rect = await ctx.crop(f, aspect);
      return (await img()).transformImage(f, { crop: rect }, { tag: "cropped" });
    }), { keywords: "crop cut trim aspect", opensEditor: true });
  const turn = (id, label, opts, tag) => opt(`img-${id}`, label, label,
    each(async (f) => (await img()).transformImage(f, opts, { tag })), { keywords: "rotate flip turn mirror" });
  const filter = (id, label, mode, hint) => opt(`img-${id}`, label, label,
    each(async (f) => (await img()).transformImage(f, {}, { filter: mode, tag: id })), { hint, keywords: "adjust filter colour" });

  const cats = [
    { id: "convert", label: "Convert", icon: ArrowRightLeft, options: [
      conv("png", "PNG", "Lossless; keeps transparency"),
      conv("jpg", "JPG", "Smallest for photos; no transparency"),
      conv("webp", "WEBP", "Modern and small; keeps transparency"),
      conv("avif", "AVIF", "Smallest of all; newer browsers"),
      conv("bmp", "BMP", "Uncompressed bitmap"),
      conv("ico", "ICO", "Windows icon, 16 to 256 px"),
      opt("img-to-pdf", "PDF", multi ? "Each image as its own PDF" : "Convert to PDF",
        each(async (f) => (await pdf()).mergeToPdf([f])), { keywords: "pdf document" }),
      opt("img-to-pdf-a4", "PDF (A4)", multi ? "Each image on an A4 PDF page" : "Place on an A4 PDF page",
        each(async (f) => (await pdf()).mergeToPdf([f], { fit: "a4" })), { keywords: "pdf a4 page print" }),
    ] },
    { id: "resize", label: "Resize", icon: Scaling, options: [
      scale(0.25), scale(0.5), scale(0.75), scale(1.5), scale(2),
      width(512), width(1024), width(1600), width(1920), width(2560),
      opt("img-passport", "Passport", "Passport photo, 35 × 45 mm (413 × 531 px)",
        each(async (f, ctx) => {
          const rect = await ctx.crop(f, 35 / 45);
          return (await img()).transformImage(f, { crop: rect, width: 413, height: 531 }, { fmt: "jpg", quality: 0.92, tag: "passport" });
        }), { keywords: "passport photo visa 35x45", opensEditor: true }),
      opt("img-custom-width", "Custom…", "Resize to a width you choose",
        each(async (f, ctx) => {
          const v = await ctx.prompt({ title: "Resize", label: "Width in pixels", placeholder: "e.g. 1200", inputMode: "numeric",
            validate: (s) => (/^\d{2,5}$/.test(s.trim()) && Number(s) <= 16384 ? "" : "Enter a width between 10 and 16384.") });
          return (await img()).transformImage(f, { width: Number(v) }, { tag: `${v}w` });
        }), { keywords: "resize custom width", opensEditor: true }),
    ] },
    { id: "compress", label: "Compress", icon: Shrink, options: [
      quality(0.85, "High", "Hardly any visible change"),
      quality(0.7, "Balanced", "Good quality, much smaller"),
      quality(0.5, "Small", "Visibly softer, very small"),
      quality(0.35, "Tiny", "For previews only"),
      under(100), under(200), under(500), under(1024), under(2048),
    ] },
    { id: "crop", label: "Crop", icon: Crop, options: [
      crop(null, "Free"), crop(1, "Square"), crop(4 / 3, "4:3"), crop(3 / 2, "3:2"), crop(16 / 9, "16:9"), crop(3 / 4, "3:4"), crop(35 / 45, "35:45"),
    ] },
    { id: "rotate", label: "Rotate", icon: RotateCw, options: [
      turn("rot-right", "Right 90°", { rotate: 90 }, "rotated"),
      turn("rot-left", "Left 90°", { rotate: -90 }, "rotated"),
      turn("rot-180", "180°", { rotate: 180 }, "rotated"),
      turn("flip-h", "Flip ↔", { flipH: true }, "flipped"),
      turn("flip-v", "Flip ↕", { flipV: true }, "flipped"),
    ] },
    { id: "adjust", label: "Adjust", icon: SlidersHorizontal, options: [
      filter("enhance", "Enhance", "enhance", "Crisper contrast for scanned documents"),
      filter("grayscale", "Grayscale", "grayscale"),
      filter("bw", "B & W", "bw", "Pure black and white, like a photocopy"),
      filter("invert", "Invert", "invert"),
      opt("img-strip", "No metadata", "Remove location and camera details",
        each(async (f) => (await img()).transformImage(f, {}, { quality: 0.95, tag: "clean" })), { hint: "Saves a fresh copy without EXIF data", keywords: "metadata exif gps privacy strip" }),
    ] },
  ];
  if (multi) {
    cats.push({ id: "combine", label: "Combine", icon: Layers, options: [
      opt("img-merge-pdf", "One PDF", "All images in one PDF", async (files) => [await (await pdf()).mergeToPdf(files, { name: "images.pdf" })], { keywords: "merge combine pdf" }),
      opt("img-merge-pdf-a4", "One PDF (A4)", "All images in one A4 PDF", async (files) => [await (await pdf()).mergeToPdf(files, { fit: "a4", name: "images-a4.pdf" })], { keywords: "merge combine pdf a4" }),
      opt("img-row", "Side by side", "Join into one image, side by side", async (files) => [await (await img()).combineImages(files, "row")], { keywords: "combine join horizontal" }),
      opt("img-col", "Stacked", "Join into one image, top to bottom", async (files) => [await (await img()).combineImages(files, "col")], { keywords: "combine join vertical" }),
      zipAll(),
    ] });
  }
  return cats;
}

/* ── PDFs ───────────────────────────────────────────────── */
function pdfCats(files) {
  const multi = files.length > 1;
  const pages = (fmt, label, dpi, title) => opt(`pdf-to-${fmt}-${dpi}`, label, title,
    each(async (f, ctx) => (await pdf()).toImages(f, fmt, { dpi, progress: ctx.progress })), { keywords: "pdf to image pages export" });
  const rot = (deg, label) => opt(`pdf-rot-${deg}`, label, `Rotate every page ${label}`, each(async (f) => (await pdf()).rotatePages(f, deg)), { keywords: "rotate turn pages" });
  const squeeze = (level, label, hint) => opt(`pdf-compress-${level}`, label, `Compress: ${label.toLowerCase()}`,
    each(async (f, ctx) => (await pdf()).compressPdf(f, level, ctx.progress)), { hint, keywords: "compress smaller reduce size" });
  const askPages = (ctx, f, title, label) => ctx.prompt({ title, label, placeholder: "e.g. 1-3, 5, 8-", hint: `${f.name}` ,
    validate: (s) => (s.trim() ? "" : "Enter at least one page.") });

  const cats = [
    { id: "convert", label: "Convert", icon: ArrowRightLeft, options: [
      pages("png", "PNG", 150, "Each page as a PNG"),
      pages("jpg", "JPG", 150, "Each page as a JPG"),
      pages("webp", "WEBP", 150, "Each page as a WEBP"),
      pages("png", "PNG (HD)", 300, "Each page as a sharp PNG (300 dpi)"),
      opt("pdf-to-txt", "Text", "Extract the text", each(async (f) => (await pdf()).toText(f)), { keywords: "text txt extract copy" }),
    ] },
    { id: "pages", label: "Pages", icon: FileStack, options: [
      opt("pdf-split", "Split all", "Every page as its own PDF", each(async (f) => (await pdf()).splitPages(f)), { keywords: "split separate pages" }),
      opt("pdf-pick", "Pick…", "Keep only some pages", each(async (f, ctx) => (await pdf()).selectPages(f, await askPages(ctx, f, "Keep pages", "Pages to keep"))), { keywords: "extract select pages", opensEditor: true }),
      opt("pdf-remove", "Remove…", "Remove some pages", each(async (f, ctx) => (await pdf()).selectPages(f, await askPages(ctx, f, "Remove pages", "Pages to remove"), { remove: true })), { keywords: "delete remove pages", opensEditor: true }),
      opt("pdf-reverse", "Reverse", "Reverse the page order", each(async (f) => (await pdf()).reversePages(f)), { keywords: "reverse order" }),
    ] },
    { id: "rotate", label: "Rotate", icon: RotateCw, options: [rot(90, "Right 90°"), rot(-90, "Left 90°"), rot(180, "180°")] },
    { id: "compress", label: "Compress", icon: Shrink, options: [
      squeeze("light", "Light", "Sharp text, a little smaller"),
      squeeze("balanced", "Balanced", "Readable, much smaller"),
      squeeze("strong", "Strong", "Smallest; for email limits"),
    ] },
    { id: "stamp", label: "Stamp", icon: Stamp, options: [
      opt("pdf-numbers", "Page no.", "Add page numbers", each(async (f) => (await pdf()).numberPages(f)), { keywords: "page numbers number" }),
      opt("pdf-watermark", "Watermark…", "Add a watermark", each(async (f, ctx) => (await pdf()).watermark(f, await ctx.prompt({
        title: "Watermark", label: "Text across each page", placeholder: "e.g. COPY FOR LENDER", initial: "CONFIDENTIAL",
        validate: (s) => (s.trim().length && s.trim().length <= 40 ? "" : "Use 1 to 40 characters."),
      }))), { keywords: "watermark stamp text", opensEditor: true }),
      opt("pdf-confidential", "Confidential", "Stamp CONFIDENTIAL on every page", each(async (f) => (await pdf()).watermark(f, "CONFIDENTIAL")), { keywords: "watermark confidential" }),
      opt("pdf-unlock", "Unlock…", "Remove the password", each(async (f, ctx) => {
        const { needsPassword, unlockPdf } = await pdf();
        const password = (await needsPassword(f))
          ? await ctx.prompt({ title: "Unlock PDF", label: "Password", type: "password", hint: f.name, validate: (s) => (s ? "" : "Enter the password.") })
          : undefined;
        return unlockPdf(f, password, ctx.progress);
      }), { hint: "Redraws the pages without the password; the text becomes an image", keywords: "unlock password decrypt remove protection", opensEditor: true }),
    ] },
  ];
  if (multi) {
    cats.push({ id: "merge", label: "Merge", icon: Layers, options: [
      opt("pdf-merge", "Merge", "Merge into one PDF, in this order", async (files) => [await (await pdf()).mergeToPdf(files, { name: "merged.pdf" })], { keywords: "merge combine join" }),
      zipAll(),
    ] });
  }
  return cats;
}

/* ── Video ──────────────────────────────────────────────── */
function videoCats() {
  const conv = (fmt, label, hint) => opt(`vid-to-${fmt}`, label, `Convert to ${label}`, each(async (f, ctx) => (await media()).convertVideo(f, fmt, ctx)), { hint, keywords: "video convert" });
  const squeeze = (level, label, hint) => opt(`vid-compress-${level}`, label, `Compress: ${label.toLowerCase()}`, each(async (f, ctx) => (await media()).compressVideo(f, level, ctx)), { hint, keywords: "compress smaller video" });
  const res = (h) => opt(`vid-${h}p`, `${h}p`, `Resize to ${h}p`, each(async (f, ctx) => (await media()).resizeVideo(f, h, ctx)), { keywords: "resize resolution video" });
  const aud = (fmt, label) => opt(`vid-audio-${fmt}`, label, `Extract the audio as ${label}`, each(async (f, ctx) => (await media()).extractAudio(f, fmt, ctx)), { keywords: "extract audio sound" });
  const rot = (turn, label) => opt(`vid-rot-${turn}`, label, `Rotate ${label}`, each(async (f, ctx) => (await media()).rotateVideo(f, turn, ctx)), { keywords: "rotate video" });
  return [
    { id: "convert", label: "Convert", icon: ArrowRightLeft, options: [
      conv("mp4", "MP4", "Plays everywhere"), conv("webm", "WEBM", "For the web"), conv("mov", "MOV", "Apple QuickTime"),
      conv("mkv", "MKV", "Matroska"), conv("avi", "AVI", "Older players"), conv("gif", "GIF", "Short silent loop; best under 20 seconds"),
    ] },
    { id: "compress", label: "Compress", icon: Shrink, options: [
      squeeze("high", "High", "Up to 1080p, close to the original"), squeeze("balanced", "Balanced", "Up to 720p, much smaller"),
      squeeze("small", "Small", "Up to 480p, smallest"), res(1080), res(720), res(480),
    ] },
    { id: "trim", label: "Trim", icon: Scissors, options: [
      opt("vid-trim", "Trim…", "Keep only part of the video", each(async (f, ctx) => {
        const { start, end } = await ctx.trim(f, "video");
        return (await media()).trimMedia(f, start, end, "video", ctx);
      }), { keywords: "trim cut clip shorten", opensEditor: true }),
      opt("vid-frame", "Frame…", "Save one frame as a PNG", each(async (f, ctx) => output(await ctx.frame(f), outName(f.name, "png", "frame"))), { keywords: "frame screenshot still image snapshot", opensEditor: true }),
      opt("vid-clip-gif", "Clip to GIF…", "Trim, then make a GIF", each(async (f, ctx) => {
        const { start, end } = await ctx.trim(f, "video");
        const m = await media();
        const clip = await m.trimMedia(f, start, end, "video", { ...ctx, progress: (p) => ctx.progress?.(p / 2) });
        const clipFile = new File([clip.blob], clip.name, { type: clip.type });
        URL.revokeObjectURL(clip.url);
        return m.toGif(clipFile, { ...ctx, progress: (p) => ctx.progress?.(0.5 + p / 2) });
      }), { keywords: "gif clip animation", opensEditor: true }),
    ] },
    { id: "audio", label: "Audio", icon: AudioLines, options: [
      aud("mp3", "MP3"), aud("wav", "WAV"), aud("m4a", "M4A"),
      opt("vid-mute", "Mute", "Remove the sound", each(async (f, ctx) => (await media()).muteVideo(f, ctx)), { keywords: "mute silent remove audio" }),
    ] },
    { id: "rotate", label: "Rotate", icon: RotateCw, options: [rot("right", "right 90°"), rot("left", "left 90°"), rot("flip", "180°")].map((o) => ({ ...o, label: o.label.replace(/^\w/, (c) => c.toUpperCase()) })) },
  ];
}

/* ── Audio ──────────────────────────────────────────────── */
function audioCats(files) {
  const multi = files.length > 1;
  const conv = (fmt, label, hint) => opt(`aud-to-${fmt}`, label, `Convert to ${label}`, each(async (f, ctx) => (await media()).convertAudio(f, fmt, ctx)), { hint, keywords: "audio convert" });
  const rate = (k) => opt(`aud-${k}k`, `${k} kbps`, `Compress to ${k} kbps MP3`, each(async (f, ctx) => (await media()).compressAudio(f, k, ctx)), { keywords: "compress bitrate smaller" });
  const fx = (id, label, title) => opt(`aud-fx-${id}`, label, title, each(async (f, ctx) => (await media()).audioEffect(f, id, ctx)), { keywords: "effect audio volume speed" });
  const cats = [
    { id: "convert", label: "Convert", icon: ArrowRightLeft, options: [
      conv("mp3", "MP3", "Plays everywhere"), conv("wav", "WAV", "Uncompressed"), conv("m4a", "M4A", "AAC; small and clear"),
      conv("ogg", "OGG", "Vorbis"), conv("flac", "FLAC", "Lossless"), conv("opus", "OPUS", "Best for voice"),
    ] },
    { id: "compress", label: "Compress", icon: Shrink, options: [rate(64), rate(96), rate(128), rate(192)] },
    { id: "trim", label: "Trim", icon: Scissors, options: [
      opt("aud-trim", "Trim…", "Keep only part of the recording", each(async (f, ctx) => {
        const { start, end } = await ctx.trim(f, "audio");
        return (await media()).trimMedia(f, start, end, "audio", ctx);
      }), { keywords: "trim cut clip shorten", opensEditor: true }),
    ] },
    { id: "effects", label: "Effects", icon: Sparkles, options: [
      fx("normalize", "Normalize", "Even out the loudness"), fx("louder", "Louder", "Turn it up"), fx("quieter", "Quieter", "Turn it down"),
      fx("mono", "Mono", "Mix down to one channel"), fx("faster", "1.25×", "Play 1.25× faster"), fx("fast", "1.5×", "Play 1.5× faster"),
      fx("slow", "0.8×", "Play slower"), fx("fade", "Fade in", "Fade in over 1.5 seconds"),
    ] },
  ];
  if (multi) {
    cats.push({ id: "merge", label: "Join", icon: Layers, options: [
      opt("aud-merge", "Join", "Join into one MP3, in this order", async (files, ctx) => [await (await media()).mergeAudio(files, ctx)], { keywords: "merge join combine" }),
      zipAll(),
    ] });
  }
  return cats;
}

/* ── Documents ──────────────────────────────────────────── */
function docCats(files) {
  const exts = new Set(files.map((f) => extOf(f.name)));
  const only = (...e) => [...exts].every((x) => e.includes(x));
  const o = [];
  const toPdf = opt("doc-to-pdf", "PDF", "Convert to PDF", each(async (f) => (await docs()).docToPdf(f)), { keywords: "pdf print" });
  const toHtml = opt("doc-to-html", "HTML", "Convert to a web page", each(async (f) => (await docs()).docToHtml(f)), { keywords: "html web page" });
  const toTxt = opt("doc-to-txt", "Text", "Plain text only", each(async (f) => (await docs()).docToText(f)), { keywords: "text txt plain" });
  if (only("docx")) o.push(toPdf, toHtml, toTxt);
  else if (only("md", "markdown")) o.push(toHtml, toPdf, toTxt);
  else if (only("html", "htm")) o.push(toPdf, toTxt);
  else if (only("csv")) o.push(
    opt("csv-to-json", "JSON", "Convert to JSON", each(async (f) => (await docs()).csvToJson(f)), { keywords: "json data" }),
    { ...toPdf, title: "As a table in a PDF" }, { ...toHtml, title: "As a table on a web page" });
  else if (only("json")) o.push(
    opt("json-to-csv", "CSV", "Convert to CSV (Excel)", each(async (f) => (await docs()).jsonToCsv(f)), { keywords: "csv excel spreadsheet" }),
    opt("json-pretty", "Tidy", "Format neatly", each(async (f) => (await docs()).prettyJson(f)), { keywords: "format pretty indent" }),
    toPdf);
  else o.push(toPdf, toHtml, toTxt);
  const cats = [{ id: "convert", label: "Convert", icon: ArrowRightLeft, options: o }];
  if (files.length > 1) cats.push({ id: "combine", label: "Combine", icon: Layers, options: [zipAll()] });
  return cats;
}

function zipAll() {
  return opt("zip-all", "Zip", "Put them all in one .zip", async (files) => {
    const { zipOutputs } = await zip();
    return [await zipOutputs(files.map((f) => ({ name: f.name, blob: f })), "files.zip")];
  }, { keywords: "zip archive compress bundle" });
}

const CATS = { image: imageCats, pdf: pdfCats, video: videoCats, audio: audioCats, docx: docCats, text: docCats };
const KIND_ICON = { image: Crop, pdf: FileStack, video: Scissors, audio: AudioLines, docx: FileText, text: FileText };

// The rings for whatever was dropped. Options of a category apply to the
// files of that kind; for a mix, each kind gets one category.
export function buildMenu(files) {
  const kinds = [...new Set(files.map(kindOf))];
  const known = kinds.filter((k) => CATS[k]);
  const ofKind = (k) => files.filter((f) => kindOf(f) === k || (k === "text" && kindOf(f) === "docx"));
  const bind = (cats, subset) => cats.map((c) => ({ ...c, files: subset }));

  if (known.length === 0) {
    return { categories: [{ id: "combine", label: "Combine", icon: Layers, files, options: [zipAll()] }], unsupported: true };
  }
  if (known.length === 1 && kinds.length === 1) {
    const k = known[0];
    return { categories: bind(CATS[k](files), files) };
  }
  // A mix: what can be combined, then each kind's own conversions
  const combine = [];
  if (files.every((f) => ["image", "pdf"].includes(kindOf(f)))) {
    combine.push(opt("mix-merge-pdf", "One PDF", "PDFs and images in one PDF", async (fs) => [await (await pdf()).mergeToPdf(fs, { name: "merged.pdf" })], { keywords: "merge combine pdf" }));
  }
  combine.push(zipAll());
  const cats = [{ id: "combine", label: "Combine", icon: Layers, files, options: combine }];
  for (const k of known) {
    if (k === "docx" && known.includes("text")) continue;
    const subset = ofKind(k);
    const first = CATS[k](subset)[0];
    cats.push({ ...first, id: `${k}-convert`, label: KIND_LABEL[k] === "Word document" ? "Word" : `${KIND_LABEL[k]}s`, icon: KIND_ICON[k], files: subset });
  }
  return { categories: cats };
}

// Every option, flattened, for typing to search
export function searchOptions(menu, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const all = menu.categories.flatMap((c) => c.options.map((o) => ({ ...o, category: c })));
  return all
    .map((o) => ({ o, score: words.every((w) => o.keywords.includes(w)) ? (o.label.toLowerCase().startsWith(words[0]) ? 2 : 1) : 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.o);
}
