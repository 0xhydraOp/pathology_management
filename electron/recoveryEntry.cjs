const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
function start({ app, BrowserWindow, ipcMain, dialog }) {
  // Recovery has its own temporary browser storage and never starts the normal application.
  const session = fs.mkdtempSync(path.join(os.tmpdir(), 'patholy-recovery-session-'));
  app.setPath('userData', session); app.setPath('sessionData', session);
  let window, selected, busy = false, quitPending = false;
  const url = pathToFileURL(path.join(__dirname, 'recovery.html')).href;
  function authorize(event) {
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== url) throw new Error('Permission denied: trusted recovery window required.');
  }
  for (const operation of ['select', 'reset']) ipcMain.handle('recovery:' + operation, async (event, ...args) => {
    authorize(event);
    if (busy) throw new Error('Recovery operation already in progress.');
    busy = true;
    try {
      if (operation === 'select') {
        const choice = await dialog.showOpenDialog(window, { title: 'Select existing lab data directory', properties: ['openDirectory'] });
        authorize(event);
        if (choice.canceled || !choice.filePaths.length) return { canceled: true };
        selected?.close(); selected = null;
        selected = await require('./administratorRecovery.cjs').openRecovery(choice.filePaths[0]);
        if (!window || window.isDestroyed()) { selected.close(); selected = null; throw new Error('Recovery window closed.'); }
        authorize(event);
        return { directory: selected.directory, admins: selected.admins.map(user => user.username) };
      }
      if (!selected) throw new Error('Select and validate a database first.');
      const [username, password, repeated, confirmation] = args;
      if (password !== repeated) throw new Error('Passwords do not match.');
      return selected.reset(username, password, confirmation);
    } finally { busy = false; if (quitPending) { selected?.close(); selected = null; app.quit(); } }
  });
  app.whenReady().then(() => {
    window = new BrowserWindow({ width: 780, height: 740, title: `Patholy Management System — v${app.getVersion()} · Administrator recovery`, webPreferences: { preload: path.join(__dirname, 'recoveryPreload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, target) => { if (target !== url) event.preventDefault(); });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.on('closed', () => { selected?.close(); selected = null; });
    window.loadURL(url);
  });
  app.on('window-all-closed', () => { if (busy) quitPending = true; else app.quit(); });
  app.on('before-quit', event => { if (busy) { event.preventDefault(); quitPending = true; } });
  app.on('will-quit', () => { selected?.close(); selected = null; });
  // Browser cache cleanup is best effort; never includes a selected database directory.
  app.on('quit', () => { try { fs.rmSync(session, { recursive: true, force: true }); } catch {} });
}
module.exports = { start };
