// PDF engine — pdf-lib to build and edit, pdf.js to draw pages and read
// text. Both load only when a PDF tool runs; nothing is uploaded.
import { baseOf, extOf, outName, output, parsePages } from "../kinds";
import { encode, toPngBytes } from "./image";
import { oneOrZip } from "./zip";

const lib = () => import("pdf-lib");

let pdfjsReady;
function pdfjs() {
  if (!pdfjsReady) {
    pdfjsReady = (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjsLib;
    })();
  }
  return pdfjsReady;
}

const bytesOf = async (file) => new Uint8Array(await file.arrayBuffer());

// pdf-lib document, with a clear message for password-protected files
async function openDoc(file) {
  const { PDFDocument } = await lib();
  try {
    return await PDFDocument.load(await bytesOf(file));
  } catch (err) {
    if (/encrypt/i.test(err?.message || "")) throw new Error(`${file.name} has a password. Use "Unlock" first.`, { cause: err });
    throw new Error(`${file.name} couldn't be read as a PDF.`, { cause: err });
  }
}

// pdf.js document (for drawing pages); asks for nothing, reports a password
async function openView(file, password) {
  const pdfjsLib = await pdfjs();
  try {
    return await pdfjsLib.getDocument({ data: await bytesOf(file), password, isEvalSupported: false }).promise;
  } catch (err) {
    if (err?.name === "PasswordException") {
      throw new Error(err.code === 2 ? "That password isn't right." : `${file.name} needs its password. Use "Unlock".`, { cause: err });
    }
    throw new Error(`${file.name} couldn't be read as a PDF.`, { cause: err });
  }
}

const saved = async (doc, name) => output(new Blob([await doc.save()], { type: "application/pdf" }), name);

// True when the PDF can't even be opened without its password
export async function needsPassword(file) {
  const pdfjsLib = await pdfjs();
  try {
    const view = await pdfjsLib.getDocument({ data: await bytesOf(file), isEvalSupported: false }).promise;
    await view.destroy();
    return false;
  } catch (err) {
    if (err?.name === "PasswordException") return true;
    throw new Error(`${file.name} couldn't be read as a PDF.`, { cause: err });
  }
}

// Add one image as a page: its own size, or centred on A4 with a margin
async function addImagePage(doc, file, fit) {
  const ext = extOf(file.name);
  let img;
  if (ext === "jpg" || ext === "jpeg" || file.type === "image/jpeg") img = await doc.embedJpg(await bytesOf(file));
  else if (ext === "png" || file.type === "image/png") img = await doc.embedPng(await bytesOf(file));
  else img = await doc.embedPng((await toPngBytes(file)).bytes);
  const w = img.width * 0.75;
  const h = img.height * 0.75;
  if (fit === "a4") {
    const [pw, ph] = w > h ? [841.89, 595.28] : [595.28, 841.89];
    const r = Math.min((pw - 72) / w, (ph - 72) / h, 1);
    const page = doc.addPage([pw, ph]);
    page.drawImage(img, { x: (pw - w * r) / 2, y: (ph - h * r) / 2, width: w * r, height: h * r });
  } else {
    doc.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
}

// PDFs and images, in order, as one PDF
export async function mergeToPdf(files, { fit = "original", name } = {}) {
  const { PDFDocument } = await lib();
  const doc = await PDFDocument.create();
  for (const f of files) {
    if (extOf(f.name) === "pdf" || f.type === "application/pdf") {
      const src = await openDoc(f);
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
    } else {
      await addImagePage(doc, f, fit);
    }
  }
  return saved(doc, name || (files.length === 1 ? outName(files[0].name, "pdf") : `${baseOf(files[0].name)}-merged.pdf`));
}

export async function splitPages(file) {
  const { PDFDocument } = await lib();
  const src = await openDoc(file);
  const items = [];
  for (const i of src.getPageIndices()) {
    const doc = await PDFDocument.create();
    const [p] = await doc.copyPages(src, [i]);
    doc.addPage(p);
    items.push({ blob: new Blob([await doc.save()], { type: "application/pdf" }), name: `${baseOf(file.name)}-page-${i + 1}.pdf` });
  }
  return oneOrZip(items, `${baseOf(file.name)}-pages.zip`);
}

// Keep only the given pages (or drop them), in the given order
export async function selectPages(file, text, { remove = false } = {}) {
  const { PDFDocument } = await lib();
  const src = await openDoc(file);
  const picked = parsePages(text, src.getPageCount());
  const keep = remove ? src.getPageIndices().filter((i) => !picked.includes(i)) : picked;
  if (!keep.length) throw new Error("That would leave no pages.");
  const doc = await PDFDocument.create();
  (await doc.copyPages(src, keep)).forEach((p) => doc.addPage(p));
  return saved(doc, outName(file.name, "pdf", remove ? "trimmed" : "pages"));
}

export async function reversePages(file) {
  const { PDFDocument } = await lib();
  const src = await openDoc(file);
  const doc = await PDFDocument.create();
  (await doc.copyPages(src, src.getPageIndices().reverse())).forEach((p) => doc.addPage(p));
  return saved(doc, outName(file.name, "pdf", "reversed"));
}

export async function rotatePages(file, deg) {
  const { degrees } = await lib();
  const doc = await openDoc(file);
  doc.getPages().forEach((p) => p.setRotation(degrees((p.getRotation().angle + deg + 360) % 360)));
  return saved(doc, outName(file.name, "pdf", "rotated"));
}

export async function numberPages(file) {
  const { StandardFonts, rgb } = await lib();
  const doc = await openDoc(file);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `${i + 1} / ${pages.length}`;
    const { width } = p.getSize();
    p.drawText(label, { x: (width - font.widthOfTextAtSize(label, 10)) / 2, y: 18, size: 10, font, color: rgb(0.29, 0.34, 0.45) });
  });
  return saved(doc, outName(file.name, "pdf", "numbered"));
}

export async function watermark(file, text) {
  const { StandardFonts, rgb, degrees } = await lib();
  const doc = await openDoc(file);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    const size = Math.min(64, (Math.hypot(width, height) * 0.7) / Math.max(1, text.length) / 0.6);
    const w = font.widthOfTextAtSize(text, size);
    const a = Math.atan2(height, width);
    p.drawText(text, {
      x: width / 2 - (w / 2) * Math.cos(a) + (size / 3) * Math.sin(a),
      y: height / 2 - (w / 2) * Math.sin(a) - (size / 3) * Math.cos(a),
      size, font, color: rgb(0.14, 0.28, 0.79), opacity: 0.16, rotate: degrees((a * 180) / Math.PI),
    });
  }
  return saved(doc, outName(file.name, "pdf", "watermarked"));
}

// Draw every page to a canvas at `dpi`
async function renderPages(view, dpi, onPage) {
  for (let n = 1; n <= view.numPages; n += 1) {
    const page = await view.getPage(n);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    await onPage(canvas, n, page.getViewport({ scale: 1 }));
    page.cleanup();
  }
}

export async function toImages(file, fmt, { dpi = 150, progress } = {}) {
  const view = await openView(file);
  const items = [];
  await renderPages(view, dpi, async (canvas, n) => {
    items.push({ blob: await encode(canvas, fmt, 0.9), name: `${baseOf(file.name)}-page-${n}.${fmt}` });
    progress?.(n / view.numPages);
  });
  return oneOrZip(items, `${baseOf(file.name)}-${fmt}.zip`);
}

// The PDF redrawn as page images: smaller (compress) or without its password (unlock)
async function redraw(file, { dpi, quality, password, tag, progress }) {
  const { PDFDocument } = await lib();
  const view = await openView(file, password);
  const doc = await PDFDocument.create();
  await renderPages(view, dpi, async (canvas, n, base) => {
    const jpg = await doc.embedJpg(new Uint8Array(await (await encode(canvas, "jpg", quality)).arrayBuffer()));
    doc.addPage([base.width, base.height]).drawImage(jpg, { x: 0, y: 0, width: base.width, height: base.height });
    progress?.(n / view.numPages);
  });
  return saved(doc, outName(file.name, "pdf", tag));
}

const LEVEL = { light: { dpi: 150, quality: 0.75 }, balanced: { dpi: 120, quality: 0.62 }, strong: { dpi: 90, quality: 0.5 } };

export async function compressPdf(file, level, progress) {
  const out = await redraw(file, { ...LEVEL[level], tag: "compressed", progress });
  if (out.size >= file.size) {
    URL.revokeObjectURL(out.url);
    throw new Error("This PDF is already compact; compressing it made it larger. Keep the original.");
  }
  return out;
}

export async function unlockPdf(file, password, progress) {
  // A PDF without a password needs no unlocking
  const { PDFDocument } = await lib();
  try {
    await PDFDocument.load(await bytesOf(file));
    throw Object.assign(new Error(`${file.name} has no password.`), { plain: true });
  } catch (err) {
    if (err.plain) throw err;
  }
  return redraw(file, { dpi: 150, quality: 0.88, password, tag: "unlocked", progress });
}

export async function toText(file) {
  const view = await openView(file);
  const pages = [];
  for (let n = 1; n <= view.numPages; n += 1) {
    const content = await (await view.getPage(n)).getTextContent();
    let lastY = null;
    let line = "";
    const lines = [];
    for (const item of content.items) {
      const y = Math.round(item.transform?.[5] ?? 0);
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ""; }
      line += item.str;
      lastY = y;
    }
    lines.push(line);
    pages.push(lines.join("\n").trim());
  }
  const text = pages.join("\n\n").trim();
  if (!text) throw new Error("There's no text in this PDF (it may be a scan). Convert it to images instead.");
  return output(new Blob([text], { type: "text/plain" }), outName(file.name, "txt"));
}
