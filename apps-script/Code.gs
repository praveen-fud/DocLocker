// ═════════════════════════════════════════════════════════════════════════════
// AbroadDocs — Google Apps Script Web App
// ═════════════════════════════════════════════════════════════════════════════

var ROOT_FOLDER_ID = "1SBKlegK4jQ_UatLT8KS_O-yhuACA-pwq";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function corsOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function log(msg) {
  Logger.log(msg);
}

function sanitize(name) {
  return (
    String(name || "Unknown")
      .replace(/[^a-zA-Z0-9 _\-\.]/g, "_")
      .trim() || "Unknown"
  );
}

function getOrCreate(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function parsePost(e) {
  try {
    var raw = "";
    if (e.postData) {
      try {
        raw = e.postData.contents;
      } catch (_) {}
      if (!raw) {
        try {
          raw = e.postData.getDataAsString();
        } catch (_) {}
      }
    }
    if (raw) return JSON.parse(raw);
    if (e.parameter && e.parameter.payload)
      return JSON.parse(e.parameter.payload);
    return null;
  } catch (err) {
    log("PARSE ERROR: " + err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET ROUTER
// ─────────────────────────────────────────────────────────────────────────────
function doGet(e) {
  var p = e && e.parameter ? e.parameter : {};
  try {
    if (p.action === "listStudents") return corsOutput(listStudents());
    if (p.action === "findStudent")
      return corsOutput(findStudent(p.identifier || ""));
    return corsOutput({
      success: false,
      error: "Unknown GET action: " + p.action,
    });
  } catch (err) {
    return corsOutput({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST ROUTER
// ─────────────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var p = parsePost(e);
    if (!p)
      return corsOutput({
        success: false,
        error: "Could not parse request body",
      });

    if (p.action === "upload") return corsOutput(uploadFile(p));
    if (p.action === "saveMeta") return corsOutput(saveMeta(p));
    if (p.action === "deleteStudent") return corsOutput(deleteStudentFolder(p));
    if (p.action === "saveSummaryPdf") return corsOutput(saveSummaryPdf(p));

    return corsOutput({ success: false, error: "Unknown action: " + p.action });
  } catch (err) {
    log("ERROR: " + err.message);
    return corsOutput({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload File — with PDF conversion for images & docx
// ─────────────────────────────────────────────────────────────────────────────
function uploadFile(p) {
  if (!p.studentName) throw new Error("Missing studentName");
  if (!p.subFolder) throw new Error("Missing subFolder");
  if (!p.fileName) throw new Error("Missing fileName");
  if (!p.base64Data) throw new Error("Missing base64Data");

  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var stuDir = getOrCreate(root, sanitize(p.studentName));
  var subDir = getOrCreate(stuDir, sanitize(p.subFolder));

  var cleanNameNoExt = p.fileName.replace(/\.[^/.]+$/, "");

  // Trash existing versions
  var old = subDir.getFilesByName(p.fileName);
  while (old.hasNext()) old.next().setTrashed(true);
  var oldPdf = subDir.getFilesByName(cleanNameNoExt + ".pdf");
  while (oldPdf.hasNext()) oldPdf.next().setTrashed(true);

  var bytes = Utilities.base64Decode(p.base64Data);
  var originalBlob = Utilities.newBlob(
    bytes,
    p.mimeType || "application/octet-stream",
    p.fileName,
  );

  var finalBlob = originalBlob;
  var finalFileName = p.fileName;

  var convertible = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (convertible.indexOf(p.mimeType) !== -1) {
    var tempFile = null;
    try {
      var resource = {
        title: "Temp_" + cleanNameNoExt,
        mimeType: MimeType.GOOGLE_DOCS,
      };
      tempFile = Drive.Files.insert(resource, originalBlob);
      var pdfBlob = DriveApp.getFileById(tempFile.id).getAs("application/pdf");
      if (pdfBlob) {
        finalBlob = pdfBlob;
        finalFileName = cleanNameNoExt + ".pdf";
      }
    } catch (convErr) {
      log("Conversion failed: " + convErr.message);
    } finally {
      if (tempFile) {
        try {
          Drive.Files.remove(tempFile.id);
        } catch (cleanErr) {
          log("WARN: temp file cleanup failed — " + cleanErr.message);
        }
      }
    }
  }

  var file = subDir.createFile(finalBlob);
  if (finalFileName !== p.fileName) file.setName(finalFileName);

  return {
    success: true,
    fileId: file.getId(),
    webViewLink: file.getUrl(),
    fileName: file.getName(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Save Meta JSON
// ─────────────────────────────────────────────────────────────────────────────
function saveMeta(p) {
  if (!p.studentName) throw new Error("Missing studentName");
  if (!p.metaJson) throw new Error("Missing metaJson");

  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var stuDir = getOrCreate(root, sanitize(p.studentName));

  var old = stuDir.getFilesByName("student_meta.json");
  while (old.hasNext()) old.next().setTrashed(true);

  var blob = Utilities.newBlob(
    p.metaJson,
    "application/json",
    "student_meta.json",
  );
  var file = stuDir.createFile(blob);

  return { success: true, fileId: file.getId() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Save Summary PDF — converts HTML → Google Doc → PDF
// ─────────────────────────────────────────────────────────────────────────────
function saveSummaryPdf(p) {
  if (!p.studentName) throw new Error("Missing studentName");
  if (!p.htmlContent) throw new Error("Missing htmlContent");

  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var stuDir = getOrCreate(root, sanitize(p.studentName));

  // Trash existing summary
  var old = stuDir.getFilesByName("Student_Summary.pdf");
  while (old.hasNext()) old.next().setTrashed(true);

  // Convert HTML → Google Doc → PDF
  var htmlBytes = Utilities.newBlob(
    p.htmlContent,
    "text/html",
    "Student_Summary.html",
  );
  var tempDoc = null;
  try {
    var resource = {
      title: "Temp_Summary_" + sanitize(p.studentName),
      mimeType: MimeType.GOOGLE_DOCS,
    };
    tempDoc = Drive.Files.insert(resource, htmlBytes);
    var pdfBlob = DriveApp.getFileById(tempDoc.id).getAs("application/pdf");
    pdfBlob.setName("Student_Summary.pdf");
    var pdfFile = stuDir.createFile(pdfBlob);

    return {
      success: true,
      fileId: pdfFile.getId(),
      webViewLink: pdfFile.getUrl(),
    };
  } finally {
    if (tempDoc) {
      try {
        Drive.Files.remove(tempDoc.id);
      } catch (cleanErr) {
        log("WARN: temp doc cleanup failed — " + cleanErr.message);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List Students — cache-friendly, parallel-style using batch read
// ─────────────────────────────────────────────────────────────────────────────
function listStudents() {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var folders = root.getFolders();
  var students = [];

  while (folders.hasNext()) {
    var folder = folders.next();
    var obj = { name: folder.getName(), driveUrl: folder.getUrl() };
    var metas = folder.getFilesByName("student_meta.json");
    if (metas.hasNext()) {
      try {
        var parsed = JSON.parse(metas.next().getBlob().getDataAsString());
        obj = Object.assign(obj, parsed);
      } catch (err) {
        obj._parseError = err.message;
      }
    }
    students.push(obj);
  }
  return { success: true, students: students };
}

// ─────────────────────────────────────────────────────────────────────────────
// Find Student
// ─────────────────────────────────────────────────────────────────────────────
function findStudent(identifier) {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var folders = root.getFolders();

  while (folders.hasNext()) {
    var folder = folders.next();
    var metas = folder.getFilesByName("student_meta.json");
    if (metas.hasNext()) {
      try {
        var meta = JSON.parse(metas.next().getBlob().getDataAsString());
        if (meta.email === identifier || meta.phone === identifier) {
          meta.driveUrl = folder.getUrl();
          return { success: true, student: meta };
        }
      } catch (_) {}
    }
  }
  return { success: false, student: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete Student
// ─────────────────────────────────────────────────────────────────────────────
function deleteStudentFolder(p) {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var it = root.getFoldersByName(sanitize(p.studentName));
  var deleted = 0;
  while (it.hasNext()) {
    it.next().setTrashed(true);
    deleted++;
  }
  return { success: true, deleted: deleted };
}
