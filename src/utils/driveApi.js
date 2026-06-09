// Google Drive via Apps Script Web App proxy.
// VITE_APPS_SCRIPT_URL must be set in .env

const SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

// ── Core POST ─────────────────────────────────────────────────────────────────
async function scriptPost(payload) {
  if (!SCRIPT_URL) throw new Error("VITE_APPS_SCRIPT_URL not set in .env");

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

  if (!data.success)
    throw new Error(data.error || "Apps Script returned failure");
  return data;
}

// ── Core GET ──────────────────────────────────────────────────────────────────
async function scriptGet(params) {
  if (!SCRIPT_URL) throw new Error("VITE_APPS_SCRIPT_URL not set in .env");

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

  if (!data.success) throw new Error(data.error || "Apps Script GET failed");
  return data;
}

// ── Folder key ────────────────────────────────────────────────────────────────
export function buildFolderKey(name, identifier = "") {
  const safeName = (name || "Unknown").trim();
  const safeId = (identifier || "").trim().replace(/[^a-zA-Z0-9@._+-]/g, "");
  return safeId ? `${safeName}__${safeId}` : safeName;
}

// ── Input validators ──────────────────────────────────────────────────────────
export function isValidPhone(phone) {
  if (!phone || phone.trim() === "") return true;
  return /^(\+91|0)?[6-9]\d{9}$/.test(phone.trim().replace(/\s+/g, ""));
}

export function isValidEmail(email) {
  if (!email || email.trim() === "") return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── Clear ALL localStorage keys for a student ────────────────────────────────
// Centralised so every caller (delete, logout, etc.) uses the same logic.
export function clearStudentFromLocalStorage(
  studentName,
  studentIdentifier = "",
) {
  // 1. Current session key used by StudentContext
  localStorage.removeItem("abroad_student");

  // 2. Meta key by plain name
  localStorage.removeItem(`student_meta_${studentName}`);

  // 3. Meta key by collision-safe folder key (Name__identifier)
  const folderKey = buildFolderKey(studentName, studentIdentifier);
  if (folderKey !== studentName) {
    localStorage.removeItem(`student_meta_${folderKey}`);
  }

  // 4. Sweep for any other student_meta_ keys whose parsed name matches
  //    (handles edge cases where name was stored with slight variation)
  Object.keys(localStorage)
    .filter((k) => k.startsWith("student_meta_"))
    .forEach((k) => {
      try {
        const m = JSON.parse(localStorage.getItem(k));
        if (m?.name === studentName) localStorage.removeItem(k);
      } catch {
        /* skip malformed */
      }
    });
}

// ── Upload a file ─────────────────────────────────────────────────────────────
export async function uploadDocument({
  studentName,
  studentIdentifier,
  subFolder,
  fileName,
  file,
  onProgress,
}) {
  if (!SCRIPT_URL) throw new Error("VITE_APPS_SCRIPT_URL not set in .env");

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

  return { id: data.fileId, name: finalName, webViewLink: data.webViewLink };
}

// ── Save student metadata ─────────────────────────────────────────────────────
export function saveStudentMeta(studentName, meta, studentIdentifier = "") {
  // Synchronous local save
  localStorage.setItem(`student_meta_${studentName}`, JSON.stringify(meta));

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
  // FIX: Drive is the source of truth. Local cache is only used when Drive
  // is unreachable. We no longer merge local-only records back in after a
  // successful Drive fetch — that caused deleted students to reappear.
  if (SCRIPT_URL) {
    try {
      const data = await scriptGet({ action: "listStudents" });
      const students = data.students || [];

      // Sync Drive results into localStorage (so offline fallback stays fresh)
      students.forEach((s) => {
        localStorage.setItem(`student_meta_${s.name}`, JSON.stringify(s));
      });

      // Remove any localStorage keys that are no longer in Drive
      const driveNames = new Set(students.map((s) => s.name));
      Object.keys(localStorage)
        .filter((k) => k.startsWith("student_meta_"))
        .forEach((k) => {
          try {
            const m = JSON.parse(localStorage.getItem(k));
            if (m?.name && !driveNames.has(m.name)) {
              localStorage.removeItem(k);
            }
          } catch {
            localStorage.removeItem(k);
          }
        });

      return students;
    } catch (e) {
      console.warn(
        "getAllStudentsFromDrive failed, using local cache:",
        e.message,
      );
    }
  }

  // Offline fallback
  const local = [];
  Object.keys(localStorage)
    .filter((k) => k.startsWith("student_meta_"))
    .forEach((k) => {
      try {
        local.push(JSON.parse(localStorage.getItem(k)));
      } catch {
        /* skip */
      }
    });
  return local;
}

// ── Find student by email or phone ────────────────────────────────────────────
export async function searchStudentByIdentifier(identifier) {
  const id = identifier.trim();

  // Check localStorage first (instant)
  for (const key of Object.keys(localStorage).filter((k) =>
    k.startsWith("student_meta_"),
  )) {
    try {
      const m = JSON.parse(localStorage.getItem(key));
      if (m?.email === id || m?.phone === id) return m;
    } catch {
      /* skip */
    }
  }

  if (!SCRIPT_URL) return null;

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
  // FIX: wipe ALL localStorage traces first (including abroad_student session)
  clearStudentFromLocalStorage(studentName, studentIdentifier);

  if (!SCRIPT_URL) return;

  try {
    const folderKey = buildFolderKey(studentName, studentIdentifier);
    await scriptPost({ action: "deleteStudent", studentName: folderKey });
  } catch (e) {
    console.warn("deleteStudent Drive call failed:", e.message);
    // localStorage already cleared — UI will reflect deletion regardless
  }
}
