# Pathological Lab Management System

Offline-first desktop application for pathology laboratories in India. Handles patient registration, investigation management, report generation, and pad-based printing.

## Project Structure

```
pathologycal lab managment system/
├── assets/
│   ├── logo.png             # Fallback logo
│   └── icon.png             # App icon (magnifying glass + blood drop)
├── build/
│   └── icon.ico             # Windows app icon (generated)
├── electron/
│   ├── main.js              # Electron main process
│   ├── preload.js           # IPC bridge
│   └── database.js          # SQLite via sql.js
├── public/
│   └── assets/logo.png      # Web logo
├── scripts/
│   ├── build-icon.mjs       # PNG → ICO converter
│   ├── create-release.js    # gh release upload (after electron:build)
│   └── test-system.js       # Smoke tests
├── src/                     # React app (Vite)
├── pathology_parameters.json # Master test catalogue
├── test_profiles.json       # Panels (CBC, LFT, Lipid Profile, etc.)
├── project_spec.md          # Full specification
└── README.md                # This file
```

## Tech Stack

- **Desktop:** Electron + React + Vite
- **Database:** sql.js (SQLite in JavaScript — no native build required)
- **Reports:** HTML/CSS → Print (A4, pre-printed letterhead support)

## Key Features

- **New Registration** — Patient details + Ref. By + tests in one form
- **Enter Results & Print** — Select patient → enter values → print report
- Patient ID format: PT{seq}-{MON}-{YEAR}
- Derived tests (LDL, VLDL, GLOB, A/G Ratio)
- Pad-based printing (content below pre-printed header)
- Referral/commission tracking
- Offline, no internet required

## Getting Started

```powershell
npm install
npm run electron:dev
```

**Login:** `admin` / `admin123` — initial account only; **no sample patients or orders** are included. Use a strong password in production.

## Windows ZIP in repo (Git LFS)

The packaged **`lfs-releases/*-win.zip`** is tracked with **[Git LFS](https://git-lfs.github.com/)** (too large for normal Git on GitHub).

**Clone with the real ZIP:**

```bash
git lfs install
git clone https://github.com/0xhydraOp/pathology_management.git
cd pathology_management
git lfs pull
```

Or download the ZIP from the repo browser on GitHub (GitHub serves LFS files in the UI when LFS is set up).

## Build Windows installer + ZIP

```powershell
npm run electron:build
```

Artifacts (gitignored) are written to **`release/`**:

- **`MONDAL DIAGNOSTIC CENTRE Setup <version>.exe`** — NSIS installer (recommended; shortcuts + uninstaller)
- **`MONDAL DIAGNOSTIC CENTRE-<version>-win.zip`** — packaged folder as ZIP (optional)

The web UI is built to **`dist/`** first; Electron bundles that into the app.

### Publish to GitHub Releases

1. [Install GitHub CLI](https://cli.github.com/) and run **`gh auth login`** once.
2. After `npm run electron:build`, run:

```powershell
node scripts/create-release.js
```

This creates tag **`v<version>`** (from `package.json`) and uploads the **Setup .exe** and **.zip** assets. If the release already exists, it re-uploads assets (`--clobber`).

## Backup & data folder (Windows)

- The installer puts the app under **Program Files** (or a folder you choose). Your **database, backups, and exports** live in **Electron user data** (typically `%APPDATA%\<app name>\`: subfolders `backups`, `exports`, and file `lab.db`). Open **Settings → Support** to see the exact path.
- **NSIS uninstall** can remove that app data folder when you uninstall (so back up first if you need to keep data).
- Older builds (before v1.0.2) used `%APPDATA%\MondalDiagnosticCentre\` — on first run the app **copies `lab.db`** from there if the new location has no database yet. You may delete the old folder manually after verifying the app.
- **Save to PC…** in **Settings → Backup** still lets you copy backups anywhere (Desktop, USB, etc.).

## License

Proprietary — for lab use.
