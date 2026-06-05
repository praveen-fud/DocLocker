# 🚀 AbroadDocs — Quick Setup Guide

## The only thing you need to do: Deploy the Apps Script

This app uses a **Google Apps Script Web App** as the backend.
It runs as YOU (the Google account owner), so it has full access to your Drive with no quota issues.

---

## Step 1 — Create a Drive Folder

1. Go to [drive.google.com](https://drive.google.com)
2. Create a new folder, e.g. **"AbroadDocs Students"**
3. Copy the folder ID from the URL:
   `https://drive.google.com/drive/folders/` **`← COPY THIS PART`**

---

## Step 2 — Deploy the Apps Script

1. Go to [script.google.com](https://script.google.com) → **New Project**
2. Delete any existing code
3. Paste the **entire contents** of `apps-script/Code.gs` (included in this zip)
4. On **line 14**, replace `PASTE_YOUR_DRIVE_FOLDER_ID_HERE` with your folder ID from Step 1
5. Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** → **Authorize** (allow access to Drive)
7. Copy the **Web App URL** (looks like `https://script.google.com/macros/s/AKfycb.../exec`)

---

## Step 3 — Configure .env

Edit the `.env` file in the project root:

```
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec
VITE_ADMIN_PASSWORD=your_password_here
VITE_GOOGLE_DRIVE_FOLDER_ID=your_folder_id  (optional, for the "Open Drive" button)
```

---

## Step 4 — Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## How it works

```
Browser  ──POST (base64 file)──►  Apps Script Web App  ──►  Your Google Drive
Browser  ──GET  listStudents  ──►  Apps Script Web App  ──►  Reads student_meta.json files
```

- Files are auto-renamed (e.g. `image.pdf` → `Passport.pdf`)
- Stored in: `YourFolder / StudentName / Applicant / Passport.pdf`
- Student data (progress, info) saved as `student_meta.json` per student folder
- Admin dashboard reads all `student_meta.json` files directly from Drive

## Admin Login

Go to `/admin-login`  
Default password: `admin@2024` (change via `VITE_ADMIN_PASSWORD` in .env)
