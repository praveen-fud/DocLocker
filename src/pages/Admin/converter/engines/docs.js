// Documents engine — Word (.docx), text, Markdown, HTML, CSV and JSON.
// Runs in the browser. HTML from a file is never trusted: it is rebuilt
// from an allow-list of tags and attributes before it is ever drawn, so a
// document can't run code in the staff workspace.
import { baseOf, extOf, outName, output } from "../kinds";

const TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "b", "strong", "i", "em", "u", "s", "br", "hr", "span", "div", "img", "a", "blockquote", "pre", "code", "sup", "sub", "small", "figure", "figcaption"]);
const ATTRS = { a: ["href"], img: ["src", "alt", "width", "height"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] };
// Links may point anywhere safe; images only to data the document carries
// itself, so drawing a file never fetches from the internet
const SAFE_HREF = /^(https?:|mailto:)/i;
const SAFE_SRC = /^data:image\/(png|jpe?g|gif|webp);/i;

export function sanitizeHtml(html) {
  const src = new DOMParser().parseFromString(html, "text/html");
  const out = document.implementation.createHTMLDocument("");
  const copy = (node, parent) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { parent.appendChild(out.createTextNode(child.textContent)); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();
      if (["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "link", "meta", "form"].includes(tag)) continue;
      if (!TAGS.has(tag)) { copy(child, parent); continue; } // keep the text, drop the wrapper
      const el = out.createElement(tag);
      for (const name of ATTRS[tag] || []) {
        const v = child.getAttribute(name);
        if (v == null) continue;
        if (name === "href" && !SAFE_HREF.test(v.trim())) continue;
        if (name === "src" && !SAFE_SRC.test(v.trim())) continue;
        el.setAttribute(name, v);
      }
      copy(child, el);
      parent.appendChild(el);
    }
  };
  const wrap = out.createElement("div");
  copy(src.body, wrap);
  return wrap.innerHTML;
}

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// A small Markdown reader: headings, emphasis, code, lists, quotes, links
export function markdownToHtml(md) {
  const inline = (t) => escape(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let list = null;
  let para = [];
  let code = null;
  const flush = () => { if (para.length) { html.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    if (code !== null) {
      if (/^```/.test(line)) { html.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`); code = null; } else code.push(line);
      continue;
    }
    if (/^```/.test(line)) { flush(); closeList(); code = []; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (h) { flush(); closeList(); html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
    else if (li) {
      flush();
      const kind = /\d/.test(li[1]) ? "ol" : "ul";
      if (list !== kind) { closeList(); html.push(`<${kind}>`); list = kind; }
      html.push(`<li>${inline(li[2])}</li>`);
    } else if (/^>\s?/.test(line)) { flush(); closeList(); html.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`); }
    else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flush(); closeList(); html.push("<hr>"); }
    else if (!line.trim()) { flush(); closeList(); }
    else { closeList(); para.push(line.trim()); }
  }
  if (code !== null) html.push(`<pre><code>${escape(code.join("\n"))}</code></pre>`);
  flush(); closeList();
  return html.join("\n");
}

const PAGE_CSS = `body{font:15px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b1e4a;max-width:760px;margin:40px auto;padding:0 24px}
h1,h2,h3{line-height:1.25}table{border-collapse:collapse;width:100%}td,th{border:1px solid #c9d1e4;padding:6px 8px;text-align:left}
th{background:#eef1f7}pre{background:#f3f5fb;padding:12px;border-radius:8px;overflow:auto}img{max-width:100%}blockquote{border-left:3px solid #f2a623;margin:0;padding-left:14px;color:#4a5673}`;

const htmlPage = (title, body) => `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escape(title)}</title><style>${PAGE_CSS}</style></head><body>\n${body}\n</body></html>\n`;

// Clean HTML drawn off-screen, then laid onto A4 pages
async function htmlToPdfBlob(cleanHtml) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;padding:56px 64px;background:#fff;box-sizing:border-box";
  host.innerHTML = `<style>${PAGE_CSS.replace(/body\{[^}]*\}/, "")}</style><div style="font:14px/1.6 Arial,sans-serif;color:#0b1e4a">${cleanHtml}</div>`;
  document.body.appendChild(host);
  try {
    const canvas = await html2canvas(host, { scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: false });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const slice = Math.floor((canvas.width * ph) / pw);
    for (let y = 0, n = 0; y < canvas.height; y += slice, n += 1) {
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = Math.min(slice, canvas.height - y);
      const ctx = part.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, part.width, part.height);
      ctx.drawImage(canvas, 0, -y);
      if (n) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, (part.height * pw) / part.width);
    }
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}

const readText = (file) => file.text();

async function docxToHtml(file) {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return sanitizeHtml(value);
}

// Body HTML for any document kind, already clean
async function bodyHtml(file) {
  const ext = extOf(file.name);
  if (ext === "docx") return docxToHtml(file);
  const text = await readText(file);
  if (ext === "md" || ext === "markdown") return markdownToHtml(text);
  if (ext === "html" || ext === "htm") return sanitizeHtml(text);
  if (ext === "csv") return tableHtml(parseCsv(text));
  if (ext === "json") return `<pre><code>${escape(JSON.stringify(JSON.parse(text), null, 2))}</code></pre>`;
  return `<pre style="white-space:pre-wrap;font:13px/1.55 Consolas,monospace">${escape(text)}</pre>`;
}

export async function docToPdf(file) {
  const ext = extOf(file.name);
  if (ext === "txt" || ext === "log") return output(await textPdf(await readText(file)), outName(file.name, "pdf"));
  return output(await htmlToPdfBlob(await bodyHtml(file)), outName(file.name, "pdf"));
}

export async function docToHtml(file) {
  return output(new Blob([htmlPage(baseOf(file.name), await bodyHtml(file))], { type: "text/html" }), outName(file.name, "html"));
}

export async function docToText(file) {
  const ext = extOf(file.name);
  let text;
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (ext === "html" || ext === "htm") {
    text = new DOMParser().parseFromString(sanitizeHtml(await readText(file)), "text/html").body.textContent;
  } else {
    text = await readText(file);
  }
  return output(new Blob([text.trim() + "\n"], { type: "text/plain" }), outName(file.name, "txt"));
}

// Plain text as a real (selectable) PDF
async function textPdf(text) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  pdf.setFont("courier", "normal");
  pdf.setFontSize(10.5);
  const margin = 54;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin;
  for (const line of pdf.splitTextToSize(text.replace(/\t/g, "    "), width)) {
    if (y > bottom) { pdf.addPage(); y = margin; }
    pdf.text(line, margin, y);
    y += 14;
  }
  return pdf.output("blob");
}

// CSV: quoted fields, commas and new lines inside quotes
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

const tableHtml = (rows) => {
  if (!rows.length) return "<p>(empty)</p>";
  const [head, ...body] = rows;
  return `<table><thead><tr>${head.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${
    body.map((r) => `<tr>${r.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
};

export async function csvToJson(file) {
  const [head = [], ...rows] = parseCsv(await readText(file));
  const data = rows.map((r) => Object.fromEntries(head.map((h, i) => [h || `column${i + 1}`, r[i] ?? ""])));
  return output(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), outName(file.name, "json"));
}

export async function jsonToCsv(file) {
  let data;
  try { data = JSON.parse(await readText(file)); } catch { throw new Error(`${file.name} isn't valid JSON.`); }
  const list = Array.isArray(data) ? data : [data];
  const cols = [...new Set(list.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : ["value"])))];
  const cell = (v) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(cell).join(","), ...list.map((r) => cols.map((c) => cell(r && typeof r === "object" ? r[c] : r)).join(","))];
  return output(new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv" }), outName(file.name, "csv"));
}

export async function prettyJson(file) {
  let data;
  try { data = JSON.parse(await readText(file)); } catch { throw new Error(`${file.name} isn't valid JSON.`); }
  return output(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }), outName(file.name, "json", "formatted"));
}
