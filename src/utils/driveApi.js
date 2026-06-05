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

// ── Upload a file ─────────────────────────────────────────────────────────────
// ONLY does the file upload. Never touches metadata. Never throws on meta errors.
export async function uploadDocument({
  studentName,
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

  const data = await scriptPost({
    action: "upload",
    studentName: studentName.trim(),
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
// NEVER throws. NEVER awaited by callers that care about upload success.
// Saves locally always. Syncs to Drive silently in background.
export function saveStudentMeta(studentName, meta) {
  // Synchronous local save — always succeeds
  localStorage.setItem(`student_meta_${studentName}`, JSON.stringify(meta));

  // Background Drive sync — completely fire-and-forget, no await, no throw
  if (SCRIPT_URL) {
    scriptPost({
      action: "saveMeta",
      studentName: studentName.trim(),
      metaJson: JSON.stringify(meta),
    }).catch((e) =>
      console.warn("[DriveSync] saveMeta failed silently:", e.message),
    );
  }
  // Returns nothing — callers must not await this for error handling
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
        // Ignore malformed localStorage entries (non-JSON or corrupted data)
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

  // Search in localStorage first
  for (const key of Object.keys(localStorage).filter((k) =>
    k.startsWith("student_meta_"),
  )) {
    try {
      const m = JSON.parse(localStorage.getItem(key));
      if (m?.email === id || m?.phone === id) {
        return m;
      }
    } catch {
      // Ignore malformed entries (non-JSON or corrupted data)
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
export async function deleteStudent(studentName) {
  // Remove from localStorage
  localStorage.removeItem(`student_meta_${studentName}`);

  if (!SCRIPT_URL) {
    return;
  }

  try {
    await scriptPost({
      action: "deleteStudent",
      studentName: studentName.trim(),
    });
  } catch (e) {
    console.warn("deleteStudent:", e.message);
  }
}
