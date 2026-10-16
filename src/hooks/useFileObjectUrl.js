import { useEffect, useState } from "react";
import { fetchFileBlob } from "../utils/driveApi";

// Types the app will render itself. Anything else (HTML, SVG, Word…) is
// offered as a download only — a blob: URL is same-origin, so rendering an
// uploaded HTML/SVG file would run its scripts inside DocLocker.
export const RENDERABLE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Loads a document privately (login in the request header, never in a URL)
// and returns a temporary in-memory URL for it, released automatically
// when the component unmounts or the file changes.
//
// enabled: false defers loading (e.g. until a thumbnail scrolls into view).
export default function useFileObjectUrl(fileId, { thumbnail = false, enabled = true } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null });
  const key = fileId && enabled ? `${fileId}|${thumbnail}|${attempt}` : null;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    let objectUrl = null;
    fetchFileBlob(fileId, { thumbnail })
      .then((blob) => {
        if (cancelled) return;
        const type = (blob.type || "").split(";")[0].trim().toLowerCase();
        if (!RENDERABLE_TYPES.has(type)) {
          setResult({ key, url: null, type, error: "" });
          return;
        }
        objectUrl = URL.createObjectURL(new Blob([blob], { type }));
        setResult({ key, url: objectUrl, type, error: "" });
      })
      .catch((err) => {
        if (!cancelled) setResult({ key, url: null, type: "", error: err.message || "Could not open the document" });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, fileId, thumbnail]);

  const current = result.key === key ? result : null;
  return {
    url: current?.url || null,
    type: current?.type || "",
    error: current?.error || "",
    loading: Boolean(key) && !current,
    retry: () => setAttempt((n) => n + 1),
  };
}
