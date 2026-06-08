// Google Drive via Apps Script Web App proxy.
// VITE_APPS_SCRIPT_URL must be set in .env

const SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

// ── Core POST ─────────────────────────────────────────────────────────────────
async function scriptPost(payload) {
  if (!SCRIPT_URL) {
    throw new Error("VITE_APPS_SCRIPT_URL not set in .env");
  }

  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "cors",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Bad response from Apps Script: " + text.slice(0, 200));
  }

  if (!data.success) {
    throw new Error(data.error || "Apps Script returned failure");
  }

  return data;
}

// ── Core GET ──────────────────────────────────────────────────────────────────
async function scriptGet(params) {
  if (!SCRIPT_URL) {
    throw new Error("VITE_APPS_SCRIPT_URL not set in .env");
  }

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SCRIPT_URL}?${qs}`, {
    method: "GET",
    mode: "cors",
    redirect: "follow",
  });

  const text = await res.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Bad GET response: " + text.slice(0, 200));
  }

  if (!data.success) {
    throw new Error(data.error || "Apps Script GET failed");
  }

  return data;
}

// ── Folder key ────────────────────────────────────────────────────────────────
/**
 * FIX: Use "Name__email-or-phone" as the Drive folder key to prevent
 * two students with the same name from colliding in Drive.
 * Falls back to name-only if no identifier is present (legacy records).
 */
export function buildFolderKey(name, identifier = "") {
  const safeName = (name || "Unknown").trim();
  const safeId = (identifier || "").trim().replace(/[^a-zA-Z0-9@._+-]/g, "");
  return safeId ? `${safeName}__${safeId}` : safeName;
}

// ── Input validators ──────────────────────────────────────────────────────────
/**
 * FIX: Added phone validation. Returns true for valid Indian mobile numbers
 * (10 digits, optionally prefixed with +91 or 0).
 * Returns true for empty string so the field remains optional.
 */
export function isValidPhone(phone) {
  if (!phone || phone.trim() === "") return true; // optional field
  return /^(\+91|0)?[6-9]\d{9}$/.test(phone.trim().replace(/\s+/g, ""));
}

/**
 * Basic email format check.
 * Returns true for empty string so the field remains optional.
 */
export function isValidEmail(email) {
  if (!email || email.trim() === "") return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── Upload a file ─────────────────────────────────────────────────────────────
export async function uploadDocument({
  studentName,
  studentIdentifier, // email or phone — used to build collision-safe folder key
  subFolder,
  fileName,
  file,
  onProgress,
}) {
  if (!SCRIPT_URL) {
    throw new Error("VITE_APPS_SCRIPT_URL not set in .env");
  }

  const ext = file.name.split(".").pop().toLowerCase();
  const finalName = `${fileName}.${ext}`;

  if (onProgress) onProgress(10);

  const arrayBuf = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  const chunkSz = 8192;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSz) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSz));
  }

  const base64 = btoa(binary);

  if (onProgress) onProgress(40);

  // FIX: pass folderKey (collision-safe) instead of raw studentName
  const folderKey = buildFolderKey(studentName, studentIdentifier);

  const data = await scriptPost({
    action: "upload",
    studentName: folderKey,
    subFolder: subFolder.trim(),
    fileName: finalName,
    mimeType: file.type || "application/octet-stream",
    base64Data: base64,
  });

  if (onProgress) onProgress(100);

  return {
    id: data.fileId,
    name: finalName,
    webViewLink: data.webViewLink,
  };
}

// ── Save student metadata ─────────────────────────────────────────────────────
/**
 * FIX: This function intentionally does NOT return a Promise.
 * Callers must NOT await it for error-handling purposes.
 * Drive sync is fire-and-forget. Local save always succeeds.
 *
 * The previous version was documented as "safe to await" which was
 * misleading — awaiting a void function silently swallows Drive errors.
 */
export function saveStudentMeta(studentName, meta, studentIdentifier = "") {
  // Synchronous local save — always succeeds immediately
  const localKey = `student_meta_${studentName}`;
  localStorage.setItem(localKey, JSON.stringify(meta));

  // Background Drive sync — fire-and-forget, never throws to caller
  if (SCRIPT_URL) {
    const folderKey = buildFolderKey(studentName, studentIdentifier);
    scriptPost({
      action: "saveMeta",
      studentName: folderKey,
      metaJson: JSON.stringify(meta),
    }).catch((e) =>
      console.warn("[DriveSync] saveMeta failed silently:", e.message),
    );
  }
}

// ── List all students ─────────────────────────────────────────────────────────
export async function getAllStudentsFromDrive() {
  const local = [];

  Object.keys(localStorage)
    .filter((k) => k.startsWith("student_meta_"))
    .forEach((k) => {
      try {
        local.push(JSON.parse(localStorage.getItem(k)));
      } catch {
        // Ignore malformed localStorage entries
      }
    });

  if (!SCRIPT_URL) {
    return local;
  }

  try {
    const data = await scriptGet({ action: "listStudents" });
    const map = {};

    for (const s of data.students) {
      map[s.name] = s;
      localStorage.setItem(`student_meta_${s.name}`, JSON.stringify(s));
    }

    for (const s of local) {
      if (!map[s.name]) {
        map[s.name] = s;
      }
    }

    return Object.values(map);
  } catch (e) {
    console.warn("getAllStudentsFromDrive failed, using local:", e.message);
    return local;
  }
}

// ── Find student by email or phone ────────────────────────────────────────────
export async function searchStudentByIdentifier(identifier) {
  const id = identifier.trim();

  // Search localStorage first
  for (const key of Object.keys(localStorage).filter((k) =>
    k.startsWith("student_meta_"),
  )) {
    try {
      const m = JSON.parse(localStorage.getItem(key));
      if (m?.email === id || m?.phone === id) {
        return m;
      }
    } catch {
      // Ignore malformed entries
    }
  }

  if (!SCRIPT_URL) {
    return null;
  }

  try {
    const data = await scriptGet({ action: "findStudent", identifier: id });

    if (data.student) {
      localStorage.setItem(
        `student_meta_${data.student.name}`,
        JSON.stringify(data.student),
      );
      return data.student;
    }
  } catch (e) {
    console.warn("searchStudentByIdentifier:", e.message);
  }

  return null;
}

// ── Check if identifier exists ────────────────────────────────────────────────
export async function checkIdentifierExists(identifier) {
  const student = await searchStudentByIdentifier(identifier);
  return !!student;
}

// ── Delete student ────────────────────────────────────────────────────────────
export async function deleteStudent(studentName, studentIdentifier = "") {
  // Remove from localStorage (both old key formats)
  localStorage.removeItem(`student_meta_${studentName}`);
  const folderKey = buildFolderKey(studentName, studentIdentifier);
  if (folderKey !== studentName) {
    localStorage.removeItem(`student_meta_${folderKey}`);
  }

  if (!SCRIPT_URL) {
    return;
  }

  try {
    await scriptPost({
      action: "deleteStudent",
      studentName: folderKey,
    });
  } catch (e) {
    console.warn("deleteStudent:", e.message);
  }
}
