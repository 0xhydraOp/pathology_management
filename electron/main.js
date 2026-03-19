const { app, BrowserWindow, ipcMain, screen, globalShortcut, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const Database = require('./database');

let mainWindow;
let splashWindow;
let previewWindow;
let db;

/** One process = one DB file; second launch focuses the existing window (Windows/Linux). */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const PREVIEW_STATE_FILE = path.join(app.getPath('userData'), 'preview-state.json');

function getIconPath() {
  const ico = path.join(__dirname, '../build/icon.ico');
  const png = path.join(__dirname, '../assets/icon.png');
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return path.join(__dirname, '../assets/logo.png');
}

function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      const { width, height, x, y, isMaximized, isAlwaysOnTop } = data;
      const display = screen.getPrimaryDisplay();
      const { width: dw, height: dh } = display.workAreaSize;
      if (width > 0 && height > 0 && width <= dw + 100 && height <= dh + 100) {
        return { width, height, x, y, isMaximized: !!isMaximized, isAlwaysOnTop: !!isAlwaysOnTop };
      }
    }
  } catch (_) {}
  return null;
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const state = {
      width: mainWindow.getBounds().width,
      height: mainWindow.getBounds().height,
      x: mainWindow.getBounds().x,
      y: mainWindow.getBounds().y,
      isMaximized: mainWindow.isMaximized(),
      isAlwaysOnTop: mainWindow.isAlwaysOnTop(),
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 0));
  } catch (_) {}
}

function loadPreviewState() {
  try {
    if (fs.existsSync(PREVIEW_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PREVIEW_STATE_FILE, 'utf8'));
      if (data.width > 400 && data.height > 300) return data;
    }
  } catch (_) {}
  return null;
}

function savePreviewState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    fs.writeFileSync(PREVIEW_STATE_FILE, JSON.stringify({ width: b.width, height: b.height }));
  } catch (_) {}
}

function showAboutDialog() {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
  dialog.showMessageBox(parent || null, {
    type: 'info',
    title: 'About',
    message: 'MONDAL DIAGNOSTIC CENTRE',
    detail: `Pathology Lab Management System\n\nVersion ${app.getVersion()}`,
    buttons: ['OK'],
  }).catch(() => {});
}

function createApplicationMenu() {
  const isDev = process.env.ELECTRON_DEV === '1';
  const helpSubmenu = [
    {
      label: 'About MONDAL DIAGNOSTIC CENTRE',
      click: () => showAboutDialog(),
    },
  ];
  const viewSubmenu = [
    ...(isDev
      ? [
          { role: 'reload', label: 'Reload' },
          { role: 'forceReload', label: 'Force reload' },
          { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
          { type: 'separator' },
        ]
      : []),
    { role: 'resetZoom', label: 'Actual size' },
    { role: 'zoomIn', label: 'Zoom in' },
    { role: 'zoomOut', label: 'Zoom out' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Toggle full screen' },
  ];

  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { label: `About ${app.name}`, click: () => showAboutDialog() },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu:
        process.platform === 'darwin'
          ? [{ role: 'close', label: 'Close window' }]
          : [{ role: 'quit', label: 'Exit' }],
    },
    {
      label: 'View',
      submenu: viewSubmenu,
    },
    {
      label: 'Help',
      submenu: helpSubmenu,
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 280,
    frame: false,
    transparent: false,
    resizable: false,
    icon: getIconPath(),
    webPreferences: { nodeIntegration: false },
  });
  const splashHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  *{margin:0;padding:0}body{font-family:system-ui,sans-serif;background:linear-gradient(135deg,#1e3a5f 0%,#0d7377 100%);color:#fff;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px}
  .logo{font-size:48px;font-weight:700;letter-spacing:2px}
  .sub{font-size:14px;opacity:.9}
  .spinner{border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;width:36px;height:36px;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
  <div class="logo">MONDAL</div>
  <div class="sub">Pathology Lab Management System</div>
  <div class="spinner"></div>
  <div class="sub">Loading...</div>
</body></html>`;
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));
  splashWindow.center();
  return splashWindow;
}

function createWindow() {
  const state = loadWindowState();
  const defaults = { width: 1280, height: 800, x: undefined, y: undefined };

  mainWindow = new BrowserWindow({
    width: state?.width ?? defaults.width,
    height: state?.height ?? defaults.height,
    x: state?.x,
    y: state?.y,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: getIconPath(),
    show: false,
  });

  if (state?.isAlwaysOnTop) mainWindow.setAlwaysOnTop(true, 'floating');

  const distPath = path.join(__dirname, '../dist/index.html');
  const useDevServer = process.env.ELECTRON_DEV === '1';
  if (useDevServer) {
    mainWindow.loadURL('http://localhost:5173');
  } else if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.once('ready-to-show', () => {
    if (state?.isMaximized) mainWindow.maximize();
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  mainWindow.on('close', () => saveWindowState());
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (db) { db.close(); db = null; }
  });
}

function doPrint(copies = 1) {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  if (win && win.webContents) {
    win.webContents.print({
      silent: false,
      printBackground: true,
      copies: Math.max(1, parseInt(copies, 10) || 1),
    });
  }
}

async function doPrintPreview() {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  if (!win || !win.webContents) return { ok: false, error: 'No window' };
  try {
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
      margins: { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25 }, // inches
    });
    const tmpDir = os.tmpdir();
    const pdfPath = path.join(tmpDir, `mondal-report-preview-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, pdfData);
    const prevState = loadPreviewState();
    const pw = prevState?.width ?? 900;
    const ph = prevState?.height ?? 700;
    const pdfWin = new BrowserWindow({
      width: pw,
      height: ph,
      minWidth: 500,
      minHeight: 400,
      title: 'Print Preview - MONDAL DIAGNOSTIC CENTRE (Ctrl+P to print)',
      icon: getIconPath(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    previewWindow = pdfWin;
    if (!prevState) pdfWin.center();
    pdfWin.loadURL(pathToFileURL(pdfPath).href);
    pdfWin.on('close', () => {
      savePreviewState(pdfWin);
    });
    pdfWin.on('closed', () => {
      previewWindow = null;
      try { fs.unlinkSync(pdfPath); } catch (_) {}
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

app.whenReady().then(async () => {
  createSplashWindow();

  db = new Database();
  await db.init();

  const safeDb = (fn) => (...args) => { try { return fn(...args); } catch (e) { console.error('DB error:', e); throw e; } };
  ipcMain.handle('db:query', (_, sql, params = []) => safeDb(db.query.bind(db))(sql, params));
  ipcMain.handle('db:run', (_, sql, params = []) => safeDb(db.run.bind(db))(sql, params));
  ipcMain.handle('db:get', (_, sql, params = []) => safeDb(db.get.bind(db))(sql, params));
  ipcMain.handle('db:all', (_, sql, params = []) => safeDb(db.all.bind(db))(sql, params));
  ipcMain.handle('db:init', () => db.init());
  ipcMain.handle('db:seed', () => db.seedFromJson());
  ipcMain.handle('db:nextPatientId', () => {
    const DatabaseManager = require('./database');
    return DatabaseManager.getNextPatientId(db);
  });
  ipcMain.handle('db:logPrint', (_, orderId, printedBy) => db.logPrint(orderId, printedBy));
  ipcMain.handle('db:backup', () => db.backup());
  ipcMain.handle('db:backupEncrypted', (_, password) => db.backupEncrypted(password));
  ipcMain.handle('db:verifyUser', (_, username, password) => db.verifyUser(username, password));
  ipcMain.handle('db:getLabConfig', () => db.get('SELECT name, address, phone, email, registration_no, pathologist_name, default_printed_by, staff_list, clinical_correlation_text FROM lab WHERE id = 1'));
  ipcMain.handle('db:setLabConfig', (_, cfg) => {
    db.run(`UPDATE lab SET name=?, address=?, phone=?, email=?, registration_no=?,
      pathologist_name=?, default_printed_by=?, staff_list=?, clinical_correlation_text=? WHERE id = 1`,
      [cfg.name || 'MONDAL DIAGNOSTIC CENTRE', cfg.address || null, cfg.phone || null, cfg.email || null, cfg.registration_no || null,
        cfg.pathologist_name || 'Pathologist', cfg.default_printed_by || 'Admin', cfg.staff_list || null, cfg.clinical_correlation_text || 'Please correlate clinically']);
  });
  ipcMain.handle('db:exportOrdersExcel', (_, params) => db.exportOrdersExcel(params));
  ipcMain.handle('db:exportReferralsExcel', (_, params) => db.exportReferralsExcel(params));
  ipcMain.handle('db:getDatabaseSize', () => db.getDatabaseSize());
  ipcMain.handle('db:getLastBackupDate', () => db.getLastBackupDate());
  ipcMain.handle('db:computeOrderBillAndCommission', (_, orderId) => db.computeOrderBillAndCommission(orderId));
  ipcMain.handle('app:print', (_, copies) => doPrint(copies || 1));
  ipcMain.handle('app:printPreview', () => doPrintPreview());
  ipcMain.handle('app:setTitle', (_, title) => {
    const w = mainWindow || BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) w.setTitle(title || 'MONDAL DIAGNOSTIC CENTRE');
  });
  ipcMain.handle('app:setAlwaysOnTop', (_, on) => {
    const w = mainWindow || BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) w.setAlwaysOnTop(!!on, 'floating');
  });
  ipcMain.handle('app:getAlwaysOnTop', () => {
    const w = mainWindow || BrowserWindow.getFocusedWindow();
    return w && !w.isDestroyed() ? w.isAlwaysOnTop() : false;
  });
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getPath', (_, name) => {
    try {
      return app.getPath(name || 'userData');
    } catch (_) {
      return null;
    }
  });

  createWindow();

  globalShortcut.register('CommandOrControl+P', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win === previewWindow && win?.webContents) {
      win.webContents.print({ silent: false, printBackground: true });
    } else if (mainWindow?.webContents) {
      mainWindow.webContents.send('app:print-trigger');
      if (win !== mainWindow) mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
