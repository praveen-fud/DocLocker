// ═════════════════════════════════════════════════════════════════════════════
// AbroadDocs — Google Apps Script Web App
//
// SETUP (one-time):
//   1. Go to https://script.google.com → New Project
//   2. Paste this entire file (replace any existing code)
//   3. Line 14: replace PASTE_YOUR_DRIVE_FOLDER_ID_HERE with your folder ID
//   4. Deploy → New deployment → Web app
//        Execute as: Me   |   Who has access: Anyone
//   5. Copy the Web App URL → paste into VITE_APPS_SCRIPT_URL in your .env
// ═════════════════════════════════════════════════════════════════════════════

var ROOT_FOLDER_ID = 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE';

// ── Router: GET ──────────────────────────────────────────────────────────────
function doGet(e) {
  var p      = e.parameter || {};
  var result;
  try {
    if      (p.action === 'listStudents') result = listStudents();
    else if (p.action === 'findStudent')  result = findStudent(p.identifier || '');
    else result = { success: false, error: 'Unknown GET action: ' + p.action };
  } catch (err) {
    result = { success: false, error: err.message };
  }
  return json(result);
}

// ── Router: POST ─────────────────────────────────────────────────────────────
function doPost(e) {
  var result;
  try {
    var p = JSON.parse(e.postData.contents);
    if      (p.action === 'upload')        result = uploadFile(p);
    else if (p.action === 'saveMeta')      result = saveMeta(p);
    else if (p.action === 'deleteStudent') result = deleteStudent(p);
    else result = { success: false, error: 'Unknown POST action: ' + p.action };
  } catch (err) {
    result = { success: false, error: err.message };
  }
  return json(result);
}

// ── Upload a file ────────────────────────────────────────────────────────────
function uploadFile(p) {
  var root    = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var stuDir  = getOrCreate(root, sanitize(p.studentName));
  var subDir  = getOrCreate(stuDir, sanitize(p.subFolder));

  // Remove old version with same name
  var old = subDir.getFilesByName(p.fileName);
  while (old.hasNext()) old.next().setTrashed(true);

  var bytes = Utilities.base64Decode(p.base64Data);
  var blob  = Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream', p.fileName);
  var file  = subDir.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    success:     true,
    fileId:      file.getId(),
    webViewLink: file.getUrl(),
    fileName:    p.fileName,
  };
}

// ── Save student_meta.json ───────────────────────────────────────────────────
function saveMeta(p) {
  var root   = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var stuDir = getOrCreate(root, sanitize(p.studentName));

  var old = stuDir.getFilesByName('student_meta.json');
  while (old.hasNext()) old.next().setTrashed(true);

  var blob = Utilities.newBlob(p.metaJson, 'application/json', 'student_meta.json');
  var file = stuDir.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { success: true, fileId: file.getId() };
}

// ── List all students ────────────────────────────────────────────────────────
// Returns each student's parsed meta + driveUrl (their folder URL).
function listStudents() {
  var root     = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var it       = root.getFolders();
  var students = [];

  while (it.hasNext()) {
    var folder = it.next();
    var obj    = { name: folder.getName(), driveUrl: folder.getUrl() };

    var metas = folder.getFilesByName('student_meta.json');
    if (metas.hasNext()) {
      try {
        var parsed = JSON.parse(metas.next().getBlob().getDataAsString());
        obj = Object.assign(obj, parsed); // merge meta fields
      } catch (e) {
        obj._parseError = e.message;
      }
    }
    // Always ensure driveUrl is present (meta merge may overwrite it)
    obj.driveUrl = folder.getUrl();
    students.push(obj);
  }

  return { success: true, students: students };
}

// ── Find student by email or phone ───────────────────────────────────────────
function findStudent(identifier) {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var it   = root.getFolders();

  while (it.hasNext()) {
    var folder = it.next();
    var metas  = folder.getFilesByName('student_meta.json');
    if (metas.hasNext()) {
      try {
        var meta = JSON.parse(metas.next().getBlob().getDataAsString());
        if (meta.email === identifier || meta.phone === identifier) {
          meta.driveUrl = folder.getUrl();
          return { success: true, student: meta };
        }
      } catch (e) {}
    }
  }
  return { success: false, student: null };
}

// ── Delete student folder ────────────────────────────────────────────────────
function deleteStudent(p) {
  var safeName = sanitize(p.studentName);
  var root     = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var it       = root.getFoldersByName(safeName);
  var deleted  = 0;

  while (it.hasNext()) {
    it.next().setTrashed(true);
    deleted++;
  }

  return { success: true, deleted: deleted };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getOrCreate(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sanitize(name) {
  return (name || 'Unknown').replace(/[^a-zA-Z0-9 _\-\.]/g, '_').trim() || 'Unknown';
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
