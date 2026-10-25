// File Converter — what a file is, and how its outputs are named.
// Everything here runs in the browser; files are never uploaded.

const EXT = {
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "svg", "ico"],
  // Read through the media engine (the browser can't draw these itself)
  rawImage: ["tif", "tiff"],
  pdf: ["pdf"],
  video: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "3gp", "wmv", "flv", "mpeg", "mpg"],
  audio: ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus", "weba", "wma", "amr", "aiff", "aif"],
  docx: ["docx"],
  text: ["txt", "md", "markdown", "csv", "json", "html", "htm", "xml", "log"],
};

export const KIND_LABEL = {
  image: "Image",
  pdf: "PDF",
  video: "Video",
  audio: "Audio",
  docx: "Word document",
  text: "Text",
  other: "File",
};

export function extOf(name = "") {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function baseOf(name = "file") {
  return name.replace(/\.[a-z0-9]+$/i, "") || "file";
}

export function kindOf(file) {
  const ext = extOf(file.name);
  const type = file.type || "";
  if (EXT.rawImage.includes(ext)) return "image";
  if (EXT.image.includes(ext) || (type.startsWith("image/") && !/heic|heif|tiff/.test(type))) return "image";
  if (EXT.pdf.includes(ext) || type === "application/pdf") return "pdf";
  if (EXT.video.includes(ext) || type.startsWith("video/")) return "video";
  if (EXT.audio.includes(ext) || type.startsWith("audio/")) return "audio";
  if (EXT.docx.includes(ext)) return "docx";
  if (EXT.text.includes(ext) || type.startsWith("text/") || type === "application/json") return "text";
  return "other";
}

// Images the browser can't draw (TIFF) are first read by the media engine
export const needsMediaDecode = (file) => EXT.rawImage.includes(extOf(file.name));

// HEIC (iPhone photos) can't be read in most browsers at all
export const isHeic = (file) => /heic|heif/i.test(file.type) || ["heic", "heif"].includes(extOf(file.name));

export const MIME = {
  png: "image/png", jpg: "image/jpeg", webp: "image/webp", avif: "image/avif", bmp: "image/bmp",
  ico: "image/x-icon", gif: "image/gif", pdf: "application/pdf", zip: "application/zip",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac", opus: "audio/ogg",
  txt: "text/plain", html: "text/html", json: "application/json", csv: "text/csv", md: "text/markdown",
};

export const mimeFor = (ext) => MIME[ext] || "application/octet-stream";

// "passport.jpg" + ("png") -> "passport.png"; with a tag -> "passport-compressed.jpg"
export function outName(name, ext, tag = "") {
  return `${baseOf(name)}${tag ? `-${tag}` : ""}.${ext}`;
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function describeFiles(files) {
  if (files.length === 1) {
    const f = files[0];
    return `${(extOf(f.name) || KIND_LABEL[kindOf(f)]).toUpperCase()} · ${formatBytes(f.size)}`;
  }
  // Several: what they are (the count is shown beside it)
  const NOUN = { image: "image", pdf: "PDF", video: "video", audio: "audio file", docx: "Word file", text: "text file", other: "other file" };
  const counts = {};
  for (const f of files) counts[kindOf(f)] = (counts[kindOf(f)] || 0) + 1;
  return Object.entries(counts).map(([k, n]) => `${n} ${NOUN[k]}${n === 1 ? "" : "s"}`).join(", ");
}

// An output: a named blob, ready to download
export function output(blob, name) {
  return { blob, name, size: blob.size, url: URL.createObjectURL(blob), type: blob.type };
}

// "1-3, 5, 8-" (1-based, inclusive) -> sorted unique 0-based indexes
export function parsePages(text, count) {
  const set = new Set();
  for (const raw of String(text).split(/[,\s]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    if (m) {
      const a = m[1] ? Number(m[1]) : 1;
      const b = m[2] ? Number(m[2]) : count;
      if (a < 1 || b < a) throw new Error(`"${part}" isn't a page range.`);
      for (let i = a; i <= Math.min(b, count); i += 1) set.add(i - 1);
    } else if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (n < 1 || n > count) throw new Error(`There's no page ${n} (this PDF has ${count}).`);
      set.add(n - 1);
    } else {
      throw new Error(`"${part}" isn't a page number.`);
    }
  }
  if (!set.size) throw new Error("Enter at least one page.");
  return [...set].sort((x, y) => x - y);
}

// Save an output to the computer's downloads
export function download(o) {
  const a = document.createElement("a");
  a.href = o.url;
  a.download = o.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
