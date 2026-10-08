const { app, BrowserWindow, ipcMain, screen, globalShortcut, Menu, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const Database = require('./database');

if (process.argv.includes('--recover-administrator')) {
  require('./recoveryEntry.cjs').start({ app, BrowserWindow, ipcMain, dialog });
} else {

// Explicit isolated QA storage never consults the legacy lab directory.
const isolatedArgument=process.argv.find(arg=>arg.startsWith('--isolated-data-dir='));
let isolatedDataDir=null;
if(isolatedArgument){
  isolatedDataDir=isolatedArgument.slice('--isolated-data-dir='.length);
  if(!path.isAbsolute(isolatedDataDir))throw new Error('Isolated QA data directory must be absolute');
  isolatedDataDir=fs.realpathSync(isolatedDataDir);
  const marker=JSON.parse(fs.readFileSync(path.join(isolatedDataDir,'synthetic-qa.json'),'utf8'));
  if(marker.purpose!=='synthetic-packaged-qa'||path.resolve(marker.directory)!==isolatedDataDir)throw new Error('Isolated QA directory marker is invalid');
  app.setPath('userData',isolatedDataDir);
  app.setPath('sessionData',isolatedDataDir);
}
function restrictWindow(window,allowed){
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url.split('#')[0]!==allowed)event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
}
let mainWindow;
let splashWindow;
let previewWindow;
let db;
const previewPrintOptions = new Map();
const previewPermissions = new Map();
let allowedRendererURL;
const { nativePrintOptions, pdfPrintOptions } = require("./printOptions.cjs");

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

/** Resolve after app is ready — avoid reading userData path at module load. */
function stateFilePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}
function previewStateFilePath() {
  return path.join(app.getPath('userData'), 'preview-state.json');
}

function getIconPath() {
  const ico = path.join(__dirname, '../build/icon.ico');
  const png = path.join(__dirname, '../assets/icon.png');
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return path.join(__dirname, '../assets/logo.png');
}

function loadWindowState() {
  try {
    const sf = stateFilePath();
    if (fs.existsSync(sf)) {
      const data = JSON.parse(fs.readFileSync(sf, 'utf8'));
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
    fs.writeFileSync(stateFilePath(), JSON.stringify(state, null, 0));
  } catch (_) {}
}

function loadPreviewState() {
  try {
    const pf = previewStateFilePath();
    if (fs.existsSync(pf)) {
      const data = JSON.parse(fs.readFileSync(pf, 'utf8'));
      if (data.width > 400 && data.height > 300) return data;
    }
  } catch (_) {}
  return null;
}

function savePreviewState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    fs.writeFileSync(previewStateFilePath(), JSON.stringify({ width: b.width, height: b.height }));
  } catch (_) {}
}

function showAboutDialog() {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
  dialog.showMessageBox(parent || null, {
    type: 'info',
    title: 'About',
    message: `Patholy Management System — v${app.getVersion()}`,
    detail: `Patholy Management System\n\nVersion ${app.getVersion()}`,
    buttons: ['OK'],
  }).catch(() => {});
}

function createApplicationMenu() {
  const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
  const helpSubmenu = [
    {
      label: 'About Patholy Management System',
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
    webPreferences: { nodeIntegration: false,contextIsolation:true,sandbox:true,devTools:!app.isPackaged },
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
  <div class="logo">Patholy</div>
  <div class="sub">Pathology Lab Management System</div>
  <div class="spinner"></div>
  <div class="sub">Loading...</div>
</body></html>`;
  restrictWindow(splashWindow,'data:');
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));
  splashWindow.center();
  return splashWindow;
}

function createWindow() {
  const state = loadWindowState();
  const defaults = { width: 1280, height: 800, x: undefined, y: undefined };

  mainWindow = new BrowserWindow({
    title: `Patholy Management System — v${app.getVersion()}`,
    width: state?.width ?? defaults.width,
    height: state?.height ?? defaults.height,
    x: state?.x,
    y: state?.y,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox:true,
      devTools:!app.isPackaged,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: getIconPath(),
    show: false,
  });

  if (state?.isAlwaysOnTop) mainWindow.setAlwaysOnTop(true, 'floating');

  const distPath = path.join(__dirname, '../dist/index.html');
  const useDevServer = !app.isPackaged && process.env.ELECTRON_DEV === '1';
  if(!useDevServer && !fs.existsSync(distPath))throw new Error('Production assets are missing. Reinstall the application; no development server fallback is allowed.');
  allowedRendererURL=useDevServer?'http://localhost:5173/':pathToFileURL(distPath).href;
  restrictWindow(mainWindow,allowedRendererURL);
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

function doPrint(copies = 1, profile) {
  const win=mainWindow || BrowserWindow.getFocusedWindow();
  if(!win?.webContents)return {ok:false,error:'No window'};
  const options=nativePrintOptions(copies,profile);
  return new Promise(resolve=>win.webContents.print(options,(ok,error)=>resolve({ok,cancelled:!ok && /cancel/i.test(error || ''),error:ok?undefined:error})));
}

async function doPrintPreview(copies = 1, profile, access) {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  if (!win || !win.webContents) return { ok: false, error: 'No window' };
  let pdfPath;
  let pdfWin;
  try {
    const windowPrintOptions = nativePrintOptions(copies,profile);
    const options=pdfPrintOptions(profile);
    const pdfData = await win.webContents.printToPDF(options);
    pdfPath = path.join(os.tmpdir(), `mondal-report-preview-${Date.now()}.pdf`);
    fs.writeFileSync(pdfPath, pdfData);
    const prevState = loadPreviewState();
    const pw = prevState?.width ?? 900;
    const ph = prevState?.height ?? 700;
    pdfWin = new BrowserWindow({
      width: pw,
      height: ph,
      minWidth: 500,
      minHeight: 400,
      show: false,
      title: `Print Preview — Patholy Management System v${app.getVersion()} (Ctrl+P to print)`,
      icon: getIconPath(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools:!app.isPackaged,
      },
    });
    previewWindow = pdfWin;
    previewPrintOptions.set(pdfWin.id,windowPrintOptions);
    if(access)previewPermissions.set(pdfWin.id,{...access,window:pdfWin});
    if (!prevState) pdfWin.center();
    pdfWin.on('close', () => {
      savePreviewState(pdfWin);
    });
    pdfWin.on('closed', () => {
      previewPrintOptions.delete(pdfWin.id);
      previewPermissions.delete(pdfWin.id);
      if(previewWindow===pdfWin)previewWindow = null;
      try {
        if (pdfPath) fs.unlinkSync(pdfPath);
      } catch (_) {}
    });

    const fileUrl = pathToFileURL(pdfPath).href;
    restrictWindow(pdfWin,fileUrl);
    await new Promise((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Print preview timed out loading PDF'));
      }, 25000);
      const done = (fn) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        fn();
      };
      pdfWin.webContents.once('did-finish-load', () => done(() => resolve()));
      pdfWin.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
        done(() => reject(new Error(errorDescription || `Preview failed to load (code ${errorCode})`)));
      });
      pdfWin.loadURL(fileUrl).catch((e) => done(() => reject(e)));
    });

    access?.authorize();
    pdfWin.show();
    return { ok: true };
  } catch (err) {
    console.warn('[printPreview]', err);
    if (pdfWin && !pdfWin.isDestroyed()) {
      previewWindow = null;
      try {
        pdfWin.destroy();
      } catch (_) {}
      // Temp file removed in pdfWin "closed" handler
    } else if (pdfPath) {
      try {
        fs.unlinkSync(pdfPath);
      } catch (_) {}
    }
    return { ok: false, error: String(err?.message || err) };
  }
}

function printFocusedWindow() {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.webContents && previewPrintOptions.has(win.id)) {
      try { previewPermissions.get(win.id)?.authorize(); } catch(error) { win.destroy();return; }
      win.webContents.print(previewPrintOptions.get(win.id));
    } else if (mainWindow?.webContents) {
      mainWindow.webContents.send('app:print-trigger');
      if (win !== mainWindow) mainWindow.focus();
    }
}

app.whenReady().then(async () => {
  const userDataDir = app.getPath('userData');
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
  } catch (e) {
    console.error('[app] Could not create user data folder:', userDataDir, e);
  }

  createSplashWindow();

  db = new Database(userDataDir,{migrateLegacy:!isolatedDataDir});
  try {await db.init();}catch(error){
    const recoveryWindow=new BrowserWindow({width:740,height:500,title:`Patholy Management System — v${app.getVersion()} · Recovery`,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:!app.isPackaged}});
    restrictWindow(recoveryWindow,'data:');splashWindow?.destroy();
    const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    recoveryWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<html><body style="background:#F5F7FA;color:#18283B;font:16px Segoe UI;padding:40px"><h1>Database recovery required</h1><p>${escape(error.message)}</p><p>The original database has not been replaced. Close the app, preserve the data folder, and follow RECOVERY.md. Do not delete lab.db or create a fresh database over it.</p><p>Data folder: ${escape(userDataDir)}</p><p>Restore a verified local recovery copy with the app closed, or ask your administrator for assistance.</p></body></html>`));return;
  }

  const licensing=await require('./licensingRuntime.cjs').createAppLicensing(app,safeStorage,isolatedDataDir);
  app.on('will-quit',()=>licensing.close());
  const {authorization:auth}=require('./applicationIpc.cjs').registerApplicationIpc(ipcMain,db,{
    licensing,
    isTrusted:event=>event.sender===mainWindow?.webContents && (event.senderFrame?.url || event.sender.getURL()).split('#')[0]===allowedRendererURL,
    onRevoke:senderId=>{for(const access of [...previewPermissions.values()])if(access.senderId===senderId && !access.window.isDestroyed())access.window.destroy();},
    chooseRestorePath:event=>dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{title:'Select encrypted backup to validate',defaultPath:isolatedDataDir || undefined,properties:['openFile'],filters:[{name:'Encrypted lab backup',extensions:['enc']}]}),
    chooseBackupPath:async(event,encrypted)=>{
      const timestamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
      return dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender),{title:encrypted?'Save encrypted backup on your PC':'Save backup on your PC',defaultPath:path.join(isolatedDataDir || app.getPath('desktop'),encrypted?`lab_backup_${timestamp}.db.enc`:`lab_backup_${timestamp}.db`),filters:[{name:encrypted?'Encrypted backup':'SQLite backup',extensions:[encrypted?'enc':'db']}]});
    },
  });
  let licenceRefreshTimer;
  const scheduleLicenceRefresh=()=>{
    clearTimeout(licenceRefreshTimer);if(!licensing.configured())return;
    const status=licensing.status(),remaining=(status.offlineUntil || 0)-Date.now()/1000;
    const seconds=status.allowed?Math.max(1,Math.min(300,Math.floor(remaining/2))):60;
    licenceRefreshTimer=setTimeout(async()=>{try{if(licensing.data?.key)await licensing.refresh();}catch{}scheduleLicenceRefresh();},seconds*1000);
  };
  app.on('will-quit',()=>clearTimeout(licenceRefreshTimer));
  require('./licensingIpc.cjs').registerLicensingIpc(ipcMain,auth,licensing,{onChange:scheduleLicenceRefresh});
  // Startup revalidation is main-process initiated; network failure retains the
  // signed cached allowance and cannot lengthen it or affect clinical data.
  if(licensing.configured())void licensing.refresh().catch(()=>{}).finally(scheduleLicenceRefresh);
  const appOperations={};
  const appHandle=(name,permission,fn)=>{if(require('./applicationIpc.cjs').appPermissions[name]!==permission)throw new Error('Application permission mismatch');appOperations[name]=fn;};
  appHandle('print','staff', (_, copies, profile) => doPrint(copies || 1,profile));
  appHandle('printPreview','staff', (event,copies,profile)=>{const token=auth.lease(event);return doPrintPreview(copies || 1,profile,{senderId:event.sender.id,authorize:()=>auth.requireLease(event,token)});});
  appHandle('setTitle','staff', (_, title) => {
    const w = mainWindow || BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) w.setTitle(title || `Patholy Management System — v${app.getVersion()}`);
  });
  appHandle('setAlwaysOnTop','staff', (_, on) => {
    const w = mainWindow || BrowserWindow.getFocusedWindow();
    if (w && !w.isDestroyed()) w.setAlwaysOnTop(!!on, 'floating');
  });
  appHandle('getAlwaysOnTop','staff', () => {
    const w = mainWindow || BrowserWindow.getFocusedWindow();
    return w && !w.isDestroyed() ? w.isAlwaysOnTop() : false;
  });
  appHandle('getVersion','public', () => app.getVersion());
  appHandle('getPath','admin', (_, name) => {
    try {
      if(name && name!=='userData')throw new Error('Only the lab data folder is exposed');
      return app.getPath('userData');
    } catch (_) {
      return null;
    }
  });

  require('./applicationIpc.cjs').registerAppIpc(ipcMain,auth,appOperations);
  createWindow();

  globalShortcut.register('CommandOrControl+P', printFocusedWindow);
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

}

