// Video & audio engine — ffmpeg compiled to WebAssembly, running in a
// worker in this browser tab. The engine itself (~31 MB) is fetched once
// from jsDelivr the first time a video or audio tool runs; files are
// never uploaded anywhere.
import { baseOf, extOf, mimeFor, outName, output } from "../kinds";

const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

let ready = null;
let queue = Promise.resolve();

async function engine(status) {
  if (!ready) {
    ready = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
      const ff = new FFmpeg();
      status?.("Getting the video engine ready (one time, about 31 MB)…");
      const coreURL = await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm", true, ({ received, total }) => {
        if (total > 0) status?.(`Getting the video engine ready… ${Math.round((received / total) * 100)}%`);
      });
      await ff.load({ coreURL, wasmURL });
      return ff;
    })().catch((err) => {
      ready = null;
      throw new Error("The video and audio engine couldn't load. Check the internet connection and try again.", { cause: err });
    });
  }
  return ready;
}

// One ffmpeg run at a time: inputs in, `args`, one output file back
function exec(inputs, args, outFile, { progress, status } = {}) {
  const job = queue.then(async () => {
    const ff = await engine(status);
    status?.("Working on it…");
    const logs = [];
    const onLog = ({ message }) => { logs.push(message); if (logs.length > 40) logs.shift(); };
    const onProgress = ({ progress: p }) => { if (p >= 0 && p <= 1) progress?.(p); };
    ff.on("log", onLog);
    ff.on("progress", onProgress);
    const names = [];
    try {
      for (const [i, file] of inputs.entries()) {
        const name = `in${i}.${extOf(file.name) || "bin"}`;
        await ff.writeFile(name, new Uint8Array(await file.arrayBuffer()));
        names.push(name);
      }
      const code = await ff.exec(args(names));
      if (code !== 0) {
        const why = logs.reverse().find((l) => /error|invalid|not supported|unknown|no such/i.test(l));
        throw new Error(why ? `The file couldn't be converted: ${why.trim()}` : "The file couldn't be converted.");
      }
      const data = await ff.readFile(outFile);
      return new Blob([data], { type: mimeFor(extOf(outFile)) });
    } catch (err) {
      if (/memory|out of bounds|abort/i.test(err?.message || "")) {
        // A crashed engine can't be reused; start a fresh one next time
        ff.terminate();
        ready = null;
        throw new Error("That file is too large to convert in the browser. Try trimming it first.", { cause: err });
      }
      throw err;
    } finally {
      ff.off("log", onLog);
      ff.off("progress", onProgress);
      for (const n of [...names, outFile]) { try { await ff.deleteFile(n); } catch { /* not there */ } }
    }
  });
  queue = job.catch(() => {});
  return job;
}

// H.264 needs even dimensions
const EVEN = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
const H264 = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"];

const VIDEO = {
  mp4: [...H264, "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"],
  mov: [...H264, "-crf", "23", "-c:a", "aac", "-b:a", "128k"],
  mkv: [...H264, "-crf", "23", "-c:a", "aac", "-b:a", "128k"],
  webm: ["-c:v", "libvpx", "-b:v", "1500k", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libvorbis", "-b:a", "128k"],
  avi: ["-c:v", "mpeg4", "-q:v", "4", "-c:a", "libmp3lame", "-b:a", "160k"],
};
const AUDIO = {
  mp3: ["-c:a", "libmp3lame", "-q:a", "2"],
  wav: ["-c:a", "pcm_s16le"],
  ogg: ["-c:a", "libvorbis", "-q:a", "5"],
  m4a: ["-c:a", "aac", "-b:a", "192k"],
  flac: ["-c:a", "flac"],
  opus: ["-c:a", "libopus", "-b:a", "128k"],
};

const vidOut = (file) => (VIDEO[extOf(file.name)] ? extOf(file.name) : "mp4");
const audOut = (file) => (AUDIO[extOf(file.name)] ? extOf(file.name) : "m4a");
const needsEven = (ext) => ext !== "webm" && ext !== "avi";

export async function convertVideo(file, target, ctx) {
  if (target === "gif") return toGif(file, ctx);
  const out = `out.${target}`;
  const vf = needsEven(target) ? ["-vf", EVEN] : [];
  const blob = await exec([file], ([i]) => ["-i", i, ...vf, ...VIDEO[target], out], out, ctx);
  return output(blob, outName(file.name, target));
}

export async function toGif(file, ctx, { width = 640, fps = 12 } = {}) {
  const graph = `fps=${fps},scale='min(${width},iw)':-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`;
  const blob = await exec([file], ([i]) => ["-i", i, "-vf", graph, "-loop", "0", "out.gif"], "out.gif", ctx);
  return output(blob, outName(file.name, "gif"));
}

const SIZE = { high: [26, 1920], balanced: [30, 1280], small: [34, 854] };

export async function compressVideo(file, level, ctx) {
  const [crf, max] = SIZE[level];
  const blob = await exec([file], ([i]) => [
    "-i", i, "-vf", `scale='min(${max},iw)':-2,${EVEN}`, ...H264, "-crf", String(crf),
    "-c:a", "aac", "-b:a", level === "small" ? "64k" : "96k", "-movflags", "+faststart", "out.mp4",
  ], "out.mp4", ctx);
  return output(blob, outName(file.name, "mp4", "compressed"));
}

export async function resizeVideo(file, height, ctx) {
  const blob = await exec([file], ([i]) => [
    "-i", i, "-vf", `scale=-2:'min(${height},ih)',${EVEN}`, ...H264, "-crf", "24", "-c:a", "aac", "-b:a", "128k", "out.mp4",
  ], "out.mp4", ctx);
  return output(blob, outName(file.name, "mp4", `${height}p`));
}

export async function rotateVideo(file, turn, ctx) {
  const vf = { right: "transpose=1", left: "transpose=2", flip: "transpose=1,transpose=1" }[turn];
  const ext = vidOut(file);
  const out = `out.${ext}`;
  const blob = await exec([file], ([i]) => ["-i", i, "-vf", needsEven(ext) ? `${vf},${EVEN}` : vf, ...VIDEO[ext], out], out, ctx);
  return output(blob, outName(file.name, ext, "rotated"));
}

export async function muteVideo(file, ctx) {
  const ext = vidOut(file);
  const out = `out.${ext}`;
  const blob = await exec([file], ([i]) => ["-i", i, "-an", "-c:v", "copy", out], out, ctx);
  return output(blob, outName(file.name, ext, "muted"));
}

export async function extractAudio(file, fmt, ctx) {
  const out = `out.${fmt}`;
  const blob = await exec([file], ([i]) => ["-i", i, "-vn", ...AUDIO[fmt], out], out, ctx);
  return output(blob, outName(file.name, fmt));
}

// Cut out [start, end] seconds, re-encoded so the cut is exact
export async function trimMedia(file, start, end, kind, ctx) {
  const ext = kind === "video" ? vidOut(file) : audOut(file);
  const out = `out.${ext}`;
  const codec = kind === "video" ? [...(needsEven(ext) ? ["-vf", EVEN] : []), ...VIDEO[ext]] : AUDIO[ext];
  const blob = await exec([file], ([i]) => ["-ss", start.toFixed(2), "-to", end.toFixed(2), "-i", i, ...(kind === "audio" ? ["-vn"] : []), ...codec, out], out, ctx);
  return output(blob, outName(file.name, ext, "trimmed"));
}

export async function convertAudio(file, fmt, ctx) {
  const out = `out.${fmt}`;
  const blob = await exec([file], ([i]) => ["-i", i, "-vn", ...AUDIO[fmt], out], out, ctx);
  return output(blob, outName(file.name, fmt));
}

export async function compressAudio(file, kbps, ctx) {
  const blob = await exec([file], ([i]) => ["-i", i, "-vn", "-c:a", "libmp3lame", "-b:a", `${kbps}k`, "out.mp3"], "out.mp3", ctx);
  return output(blob, outName(file.name, "mp3", `${kbps}k`));
}

const EFFECT = {
  mono: { args: ["-ac", "1"], tag: "mono" },
  normalize: { args: ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"], tag: "normalized" },
  louder: { args: ["-af", "volume=1.8"], tag: "louder" },
  quieter: { args: ["-af", "volume=0.6"], tag: "quieter" },
  fast: { args: ["-af", "atempo=1.5"], tag: "1.5x" },
  faster: { args: ["-af", "atempo=1.25"], tag: "1.25x" },
  slow: { args: ["-af", "atempo=0.8"], tag: "0.8x" },
  fade: { args: ["-af", "afade=t=in:d=1.5"], tag: "fade-in" },
};

export async function audioEffect(file, effect, ctx) {
  const ext = audOut(file);
  const out = `out.${ext}`;
  const { args, tag } = EFFECT[effect];
  const blob = await exec([file], ([i]) => ["-i", i, "-vn", ...args, ...AUDIO[ext], out], out, ctx);
  return output(blob, outName(file.name, ext, tag));
}

export async function mergeAudio(files, ctx) {
  const n = files.length;
  const blob = await exec(files, (names) => [
    ...names.flatMap((nm) => ["-i", nm]),
    "-filter_complex", `${names.map((_, k) => `[${k}:a]`).join("")}concat=n=${n}:v=0:a=1[a]`,
    "-map", "[a]", ...AUDIO.mp3, "out.mp3",
  ], "out.mp3", ctx);
  return output(blob, `${baseOf(files[0].name)}-merged.mp3`);
}

// TIFF and other images the browser can't draw -> PNG (for the image engine)
export async function decodeToPng(file) {
  return exec([file], ([i]) => ["-i", i, "-frames:v", "1", "out.png"], "out.png");
}
