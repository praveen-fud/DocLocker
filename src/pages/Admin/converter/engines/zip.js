// Several outputs as one .zip (JSZip, loaded only when needed)
import { output } from "../kinds";

export async function zipOutputs(items, zipName) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set();
  for (const it of items) {
    // Same name twice in one zip: number the later ones
    let name = it.name;
    for (let n = 2; used.has(name); n += 1) name = it.name.replace(/(\.[^.]+)?$/, `-${n}$1`);
    used.add(name);
    zip.file(name, it.blob);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return output(blob, zipName);
}

// One output stays a file; several become a zip
export async function oneOrZip(items, zipName) {
  if (items.length === 1) return [output(items[0].blob, items[0].name)];
  return [await zipOutputs(items, zipName)];
}
