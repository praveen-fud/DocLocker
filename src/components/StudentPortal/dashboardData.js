// Builds the dashboard's document list from the same uploads + reader results
// the upload cards use, so a tile's status always matches its card.
import { docAnchorId, splitLabel, statusFromExtraction } from "../FileUploadBox/docMeta";

const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// Files stored for one slot; multi-file slots keep extra pages as <id>_1, <id>_2…
function fileCount(sectionUploads, field) {
  return Object.keys(sectionUploads).filter((k) =>
    sectionUploads[k] && (k === field.id || (field.multiple && k.startsWith(`${field.id}_`) && /^\d+$/.test(k.slice(field.id.length + 1)))),
  ).length;
}

// verified | uploaded | attention | pending (required, missing) | upload (optional, missing)
export function docStatus(field, sectionUploads = {}, extraction) {
  const files = fileCount(sectionUploads, field);
  if (!files) return field.optional ? "upload" : "pending";
  if (field.pages) {
    // Same rule as the card's page checklist: a page counts once the reader
    // found a detail printed only on it, or once every page has a file.
    const flat = statusFromExtraction(extraction) ? extraction.flat : null;
    const covered = files >= field.pages.length
      || (flat && field.pages.every((p) => p.readKeys.some((k) => hasValue(flat[k]))));
    if (!covered) return "attention";
  }
  const read = statusFromExtraction(extraction);
  if (read === "read") return "verified";
  if (read === "review" || read === "manual") return "attention";
  return "uploaded";
}

function item(sectionKey, sectionId, field, uploads, extractions) {
  const sectionUploads = uploads[sectionKey] || {};
  return {
    key: `${sectionKey}.${field.id}`,
    anchorId: docAnchorId(sectionKey, field.id),
    sectionId,
    field,
    title: splitLabel(field.label).title,
    status: docStatus(field, sectionUploads, extractions[`${sectionKey}.${field.id}`]),
  };
}

// Required documents always; optional ones only once something is uploaded.
const shown = (it) => !it.field.optional || it.status !== "upload";

// sections: [{ key, sectionId, fields }]; co: [{ key, title, fields }]
export function buildDocGroups({ sections, co, uploads, extractions, otherDocs = {} }) {
  const own = sections.flatMap((s) => s.fields.map((f) => item(s.key, s.sectionId, f, uploads, extractions)));
  const ownItems = [...own.filter((it) => !it.field.optional), ...own.filter((it) => it.field.optional && shown(it))];

  for (const [id, rec] of Object.entries(otherDocs)) {
    if (!rec) continue;
    ownItems.push({
      key: `otherDocs.${id}`,
      anchorId: docAnchorId("otherDocs", id),
      sectionId: "sec-review",
      field: { id, optional: true },
      title: rec.customName || "Other document",
      status: "uploaded",
    });
  }

  return [
    { key: "student", title: "Your documents", items: ownItems },
    ...co.map((c) => ({
      key: c.key,
      title: c.title,
      items: c.fields.map((f) => item(c.key, "sec-financial", f, uploads, extractions)).filter(shown),
    })),
  ];
}

export function countStatuses(groups) {
  const counts = { verified: 0, uploaded: 0, attention: 0, pending: 0, upload: 0 };
  for (const g of groups) for (const it of g.items) counts[it.status] += 1;
  return counts;
}
