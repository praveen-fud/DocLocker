# DocLocker — Student Document Portal

A production-ready, no-backend document portal for students applying to universities abroad.
Built with React + Vite. All files go directly to Google Drive via a Google Apps Script proxy.

## Architecture

```
Browser (React) → Google Apps Script Web App → Google Drive
```

No Express server, no Node backend, no OAuth tokens in the browser.
The Apps Script runs as **you** (the owner) and has full Drive access.

## Quick Start

### 1. Set up Google Drive

1. Create a folder in your Google Drive (e.g. "AbroadDocs Students")
2. Copy the folder ID from the URL: `drive.google.com/drive/folders/**FOLDER_ID**`

### 2. Deploy the Apps Script

1. Go to [script.google.com](https://script.google.com) → New Project
2. Paste the contents of `apps-script/Code.gs`
3. Replace `PASTE_YOUR_DRIVE_FOLDER_ID_HERE` on line 17 with your folder ID
4. Click **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the Web App URL

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec
VITE_GOOGLE_DRIVE_FOLDER_ID=YOUR_FOLDER_ID
VITE_ADMIN_PASSWORD=your_secure_password
```

### 4. Install & run

```bash
npm install
npm run dev        # development
npm run build      # production build
npm run preview    # preview production build
```

## Deploy to Production (Netlify / Vercel)

### Netlify

1. `npm run build`
2. Deploy `dist/` folder
3. Add environment variables in Netlify dashboard
4. Add `public/_redirects` with: `/* /index.html 200`

### Vercel

1. Connect repo, set framework to Vite
2. Add environment variables
3. Vercel auto-handles SPA routing

## Why Apps Script proxy?

| Approach                | CORS           | Auth              | Backend needed |
| ----------------------- | -------------- | ----------------- | -------------- |
| Apps Script proxy ✅    | ✅ None        | ✅ Runs as owner  | ❌ No          |
| Drive REST API directly | ❌ CORS issues | ❌ OAuth required | ❌ No          |
| Express + googleapis    | ✅             | ✅                | ✅ Yes         |

## Features

- 📁 **7 document sections**: Personal, Applicant, Academics, Loan/Co-applicants, Visa, References, Guarantor
- 👨‍👩‍👧 **Up to 5 co-applicants** with employment-type-specific document lists
- 🔄 **Auto-rename** files to standard names
- 💾 **Offline-first**: localStorage fallback if Drive is unavailable
- 👀 **Admin dashboard**: search, filter, view progress, open Drive folders, delete students
- 📊 **Upload progress** bar with per-section tracking

## Project Structure

```
src/
  components/
    FileUploadBox/     # Drag-and-drop upload widget
    Navbar/            # Top navigation
    ProgressBar/       # Section progress tracker
  context/
    StudentContext.jsx # Global auth + student state
    schemas.js         # Document field definitions
  pages/
    Home.jsx           # Landing + new/returning student
    Portal.jsx         # Student document upload portal
    Admin.jsx          # Admin dashboard
    AdminLogin.jsx     # Admin login
  utils/
    driveApi.js        # All Google Drive operations
apps-script/
  Code.gs              # Deploy this to Google Apps Script
```
