const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronApp', {
  setTitle: (title) => ipcRenderer.invoke('app:setTitle', title),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('app:setAlwaysOnTop', on),
  getAlwaysOnTop: () => ipcRenderer.invoke('app:getAlwaysOnTop'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),
  onPrintTrigger: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('app:print-trigger', handler);
    return () => ipcRenderer.removeListener('app:print-trigger', handler);
  },
});

contextBridge.exposeInMainWorld('db', {
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  run: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
  get: (sql, params) => ipcRenderer.invoke('db:get', sql, params),
  all: (sql, params) => ipcRenderer.invoke('db:all', sql, params),
  init: () => ipcRenderer.invoke('db:init'),
  reloadCatalogue: () => ipcRenderer.invoke('db:reloadCatalogue'),
  nextPatientId: () => ipcRenderer.invoke('db:nextPatientId'),
  logPrint: (orderId, printedBy) => ipcRenderer.invoke('db:logPrint', orderId, printedBy),
  backup: () => ipcRenderer.invoke('db:backup'),
  backupEncrypted: (password) => ipcRenderer.invoke('db:backupEncrypted', password),
  backupChooseLocation: () => ipcRenderer.invoke('db:backupChooseLocation'),
  backupEncryptedChooseLocation: (password) => ipcRenderer.invoke('db:backupEncryptedChooseLocation', password),
  verifyUser: (username, password) => ipcRenderer.invoke('db:verifyUser', username, password),
  getLabConfig: () => ipcRenderer.invoke('db:getLabConfig'),
  setLabConfig: (cfg) => ipcRenderer.invoke('db:setLabConfig', cfg),
  exportOrdersExcel: (params) => ipcRenderer.invoke('db:exportOrdersExcel', params),
  exportReferralsExcel: (params) => ipcRenderer.invoke('db:exportReferralsExcel', params),
  getDatabaseSize: () => ipcRenderer.invoke('db:getDatabaseSize'),
  getLastBackupDate: () => ipcRenderer.invoke('db:getLastBackupDate'),
  computeOrderBillAndCommission: (orderId) => ipcRenderer.invoke('db:computeOrderBillAndCommission', orderId),
  clearAllPatientData: () => ipcRenderer.invoke('db:clearAllPatientData'),
});

contextBridge.exposeInMainWorld('electronPrint', (copies) =>
  ipcRenderer.invoke('app:print', copies || 1)
);

contextBridge.exposeInMainWorld('electronPrintPreview', () =>
  ipcRenderer.invoke('app:printPreview')
);
