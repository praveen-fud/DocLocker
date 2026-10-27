// Password-protected PDFs. Bank statements, payslips and ITRs often come
// with a password; we can't read those, so the student unlocks the file on
// Nexfile first and uploads the unlocked copy.
export const PDF_UNLOCK_URL = "https://nexfile.up.railway.app/pdf/unlock";

// Document slots whose PDFs usually arrive locked
export const OFTEN_LOCKED = /salary|bank_stmt|itr|form16/i;

const isPdf = (file) => /pdf$/i.test(file?.type || "") || /\.pdf$/i.test(file?.name || "");

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

// True only when the PDF can't be opened without its password. A quick look
// for the encryption dictionary first; pdf.js loads only for files that have
// one, to tell an open-password (locked) from a permissions-only lock, which
// opens fine and uploads as normal. Anything unclear is left to the server.
export async function isLockedPdf(file) {
  if (!isPdf(file)) return false;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!new TextDecoder("latin1").decode(bytes).includes("/Encrypt")) return false;
    const lib = await pdfjs();
    try {
      const doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
      await doc.destroy();
      return false;
    } catch (err) {
      return err?.name === "PasswordException";
    }
  } catch {
    return false;
  }
}
