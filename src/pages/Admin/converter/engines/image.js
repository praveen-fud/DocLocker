// Image engine — the browser's own canvas: decode, transform, encode.
// No library and nothing leaves the computer.
import { isHeic, needsMediaDecode, outName, output } from "../kinds";

const MAX_SIDE = 16384;
const MAX_PIXELS = 120e6;

// Decode any image the browser can draw (TIFF goes through the media engine)
export async function loadImage(file) {
  if (isHeic(file)) throw new Error("This browser can't read HEIC photos. Export it as JPG on the phone first.");
  let blob = file;
  if (needsMediaDecode(file)) {
    const { decodeToPng } = await import("./media");
    blob = await decodeToPng(file);
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    // SVGs without a size come back as 0×0; give them a sensible one
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    return { img, width: w, height: h };
  } catch (err) {
    throw new Error(`${file.name} couldn't be read as an image.`, { cause: err });
  } finally {
    // The decoded image stays usable after the URL is revoked
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function canvasOf(w, h) {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new Error("That would be too large an image for the browser to make. Try a smaller size.");
  }
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

// Draw a decoded image with optional crop (source px), scale, rotation and flips
export function draw(src, { crop, scale = 1, width, height, rotate = 0, flipH = false, flipV = false, background } = {}) {
  const sx = crop ? crop.x : 0;
  const sy = crop ? crop.y : 0;
  const sw = crop ? crop.w : src.width;
  const sh = crop ? crop.h : src.height;
  let dw = width ?? sw * scale;
  let dh = height ?? (width ? (sh * width) / sw : sh * scale);
  const turned = rotate % 180 !== 0;
  const c = canvasOf(turned ? dh : dw, turned ? dw : dh);
  const ctx = c.getContext("2d");
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(src.img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  return c;
}

let avifSupport;
export function canEncodeAvif() {
  if (avifSupport === undefined) {
    try { avifSupport = document.createElement("canvas").toDataURL("image/avif").startsWith("data:image/avif"); }
    catch { avifSupport = false; }
  }
  return avifSupport;
}

const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser couldn't save that image."))), type, quality);
});

// 24-bit BMP, written by hand (canvas can't make one)
function encodeBmp(canvas) {
  const { width: w, height: h } = canvas;
  const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = new ArrayBuffer(54 + row * h);
  const v = new DataView(buf);
  v.setUint16(0, 0x4d42, true); v.setUint32(2, buf.byteLength, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * h, true);
  v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  const out = new Uint8Array(buf);
  for (let y = 0; y < h; y += 1) {
    const dst = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x += 1) {
      const s = (y * w + x) * 4;
      // Transparent pixels land on white
      const a = px[s + 3] / 255;
      out[dst + x * 3] = Math.round(px[s + 2] * a + 255 * (1 - a));
      out[dst + x * 3 + 1] = Math.round(px[s + 1] * a + 255 * (1 - a));
      out[dst + x * 3 + 2] = Math.round(px[s] * a + 255 * (1 - a));
    }
  }
  return new Blob([buf], { type: "image/bmp" });
}

// Windows icon: PNG images at the standard sizes, in one .ico
async function encodeIco(src) {
  const sizes = [16, 32, 48, 64, 128, 256].filter((s) => s <= Math.max(src.width, src.height, 16));
  const pngs = [];
  for (const s of sizes) {
    const ratio = Math.min(s / src.width, s / src.height);
    const c = canvasOf(s, s);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    const dw = src.width * ratio;
    const dh = src.height * ratio;
    ctx.drawImage(src.img, (s - dw) / 2, (s - dh) / 2, dw, dh);
    pngs.push(new Uint8Array(await (await toBlob(c, "image/png")).arrayBuffer()));
  }
  const head = 6 + sizes.length * 16;
  const total = head + pngs.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true); v.setUint16(4, sizes.length, true);
  let offset = head;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    out[e] = s >= 256 ? 0 : s; out[e + 1] = s >= 256 ? 0 : s;
    v.setUint16(e + 4, 1, true); v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, pngs[i].length, true); v.setUint32(e + 12, offset, true);
    out.set(pngs[i], offset);
    offset += pngs[i].length;
  });
  return new Blob([out], { type: "image/x-icon" });
}

const TYPE = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", avif: "image/avif" };

// Canvas -> file of the given format
export async function encode(canvas, fmt, quality = 0.9) {
  if (fmt === "bmp") return encodeBmp(canvas);
  if (fmt === "ico") return encodeIco({ img: canvas, width: canvas.width, height: canvas.height });
  if (fmt === "avif" && !canEncodeAvif()) throw new Error("This browser can't save AVIF. Chrome or Edge on a recent version can.");
  if (fmt === "jpg") {
    // JPG has no transparency: put the image on white first
    const flat = canvasOf(canvas.width, canvas.height);
    const ctx = flat.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    return toBlob(flat, TYPE.jpg, quality);
  }
  return toBlob(canvas, TYPE[fmt] || TYPE.png, quality);
}

// Smallest file that stays under `maxBytes`: lower quality first, then size
export async function encodeUnder(canvas, maxBytes, fmt = "jpg") {
  let current = canvas;
  for (let round = 0; round < 8; round += 1) {
    let lo = 0.3;
    let hi = 0.95;
    let best = null;
    for (let i = 0; i < 7; i += 1) {
      const q = (lo + hi) / 2;
      const b = await encode(current, fmt, q);
      if (b.size <= maxBytes) { best = b; lo = q; } else { hi = q; }
    }
    if (best) return best;
    const next = canvasOf(current.width * 0.8, current.height * 0.8);
    const ctx = next.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, next.width, next.height);
    current = next;
  }
  return encode(current, fmt, 0.3);
}

// Pixel adjustments that work in every browser (no ctx.filter needed)
export function adjust(canvas, mode) {
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = data.data;
  if (mode === "grayscale" || mode === "bw") {
    for (let i = 0; i < p.length; i += 4) {
      const y = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
      const v = mode === "bw" ? (y > 150 ? 255 : 0) : y;
      p[i] = v; p[i + 1] = v; p[i + 2] = v;
    }
  } else if (mode === "enhance") {
    // Stretch contrast between the 1st and 99th percentile: crisper scans
    const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) hist[Math.round(0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2])] += 1;
    const n = p.length / 4;
    let acc = 0; let low = 0; let high = 255;
    for (let i = 0; i < 256; i += 1) { acc += hist[i]; if (acc > n * 0.01) { low = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i -= 1) { acc += hist[i]; if (acc > n * 0.01) { high = i; break; } }
    const span = Math.max(1, high - low);
    for (let i = 0; i < p.length; i += 4) {
      for (let c = 0; c < 3; c += 1) p[i + c] = Math.max(0, Math.min(255, ((p[i + c] - low) * 255) / span));
    }
  } else if (mode === "invert") {
    for (let i = 0; i < p.length; i += 4) { p[i] = 255 - p[i]; p[i + 1] = 255 - p[i + 1]; p[i + 2] = 255 - p[i + 2]; }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

// The format an image keeps when an operation doesn't change it
export function keepFormat(file) {
  const t = file.type;
  if (t === "image/png" || /\.png$/i.test(file.name)) return "png";
  if (t === "image/webp" || /\.webp$/i.test(file.name)) return "webp";
  if (t === "image/avif" && canEncodeAvif()) return "avif";
  if (t === "image/bmp") return "bmp";
  return "jpg";
}

// One image through a transform, saved in `fmt` (or its own format)
export async function transformImage(file, opts, { fmt, quality, tag, maxBytes, filter } = {}) {
  const src = await loadImage(file);
  const canvas = draw(src, opts);
  if (filter) adjust(canvas, filter);
  const target = fmt || keepFormat(file);
  const blob = maxBytes ? await encodeUnder(canvas, maxBytes, target === "png" ? "jpg" : target) : await encode(canvas, target, quality);
  const ext = maxBytes && target === "png" ? "jpg" : target;
  return output(blob, outName(file.name, ext, tag));
}

// Several images side by side or stacked, as one PNG
export async function combineImages(files, direction) {
  const srcs = [];
  for (const f of files) srcs.push(await loadImage(f));
  const across = direction === "row";
  const edge = across ? Math.min(...srcs.map((s) => s.height)) : Math.min(...srcs.map((s) => s.width));
  const sized = srcs.map((s) => (across ? { s, w: (s.width * edge) / s.height, h: edge } : { s, w: edge, h: (s.height * edge) / s.width }));
  const c = canvasOf(across ? sized.reduce((n, x) => n + x.w, 0) : edge, across ? edge : sized.reduce((n, x) => n + x.h, 0));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  let at = 0;
  for (const { s, w, h } of sized) {
    ctx.drawImage(s.img, across ? at : 0, across ? 0 : at, w, h);
    at += across ? w : h;
  }
  return output(await encode(c, "png"), `combined-${across ? "side-by-side" : "stacked"}.png`);
}

// A PNG of any image (used by the PDF engine for formats pdf-lib can't embed)
export async function toPngBytes(file) {
  const src = await loadImage(file);
  const blob = await encode(draw(src), "png");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: src.width, height: src.height };
}
