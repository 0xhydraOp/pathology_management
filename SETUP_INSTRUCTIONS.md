# Setup Instructions — Pathology Lab Management System

## What You Need

| Program | Purpose |
|---------|---------|
| **Node.js** | Run JavaScript, npm (v18+ recommended) |
| **npm** | Comes with Node.js |

No Visual Studio or C++ build tools required — the project uses sql.js (pure JavaScript SQLite).

---

## Step 1: Install Dependencies

1. Open PowerShell or Command Prompt.
2. Go to the project folder:

```powershell
cd "c:\Users\iamro\OneDrive\Desktop\pathologycal lab managment system"
```

3. Install:

```powershell
npm install
```

---

## Step 2: Run the Application

```powershell
npm run electron:dev
```

**Important:** Use `electron:dev`, not `npm run dev`. The app needs Electron for the database — running only Vite (dev) shows a blank/broken screen.

**Login:** admin / admin123

---

## Step 3: Build Windows Installer (Optional)

```powershell
npm run electron:build
```

The installer (`.exe`) will be in the `dist/` folder. The app icon is generated from `assets/icon.png`.

---

## Troubleshooting

### Port 5173 already in use

Close any previous instance, then:

```powershell
taskkill /F /IM electron.exe 2>$null
taskkill /F /IM node.exe 2>$null
```

Then run `npm run electron:dev` again.

### "EPERM: operation not permitted" during npm install

- Close programs using the project folder.
- Run the terminal as Administrator.
- Try again.

### OneDrive sync issues

- Pause OneDrive sync while running `npm install`.
- Or move the project to a non-synced folder (e.g. `C:\Projects\`).
