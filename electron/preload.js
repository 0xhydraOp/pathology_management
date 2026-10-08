const { contextBridge, ipcRenderer } = require('electron');
const permissionListeners=new Set();
const licenceListeners=new Set();
const invoke=async(...args)=>{try{return await ipcRenderer.invoke(...args);}catch(error){const message=String(error.message || error);if(message.includes('Permission denied:'))for(const listener of permissionListeners){try{listener(message.slice(message.indexOf('Permission denied:')));}catch{}}throw error;}};

ipcRenderer.on('licensing:status',(_,status)=>{for(const listener of licenceListeners)listener(status);});
contextBridge.exposeInMainWorld('licensing', {
  getStatus:()=>invoke('licensing:status'),
  activate:key=>invoke('licensing:activate',key),
  refresh:()=>invoke('licensing:refresh'),
  onStatus:listener=>{licenceListeners.add(listener);return ()=>licenceListeners.delete(listener);}
});

contextBridge.exposeInMainWorld('electronApp', {
  onPermissionDenied: cb=>{permissionListeners.add(cb);return ()=>permissionListeners.delete(cb);},
  setTitle: (title) => invoke('app:setTitle', title),
  setAlwaysOnTop: (on) => invoke('app:setAlwaysOnTop', on),
  getAlwaysOnTop: () => invoke('app:getAlwaysOnTop'),
  getVersion: () => invoke('app:getVersion'),
  getPath: (name) => invoke('app:getPath', name),
  onPrintTrigger: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('app:print-trigger', handler);
    return () => ipcRenderer.removeListener('app:print-trigger', handler);
  },
});

contextBridge.exposeInMainWorld('db', {
  credentialState: ()=>invoke('db:credentialState'),
  setupAdmin: (username,password)=>invoke('db:setupAdmin',username,password),
  changePassword: (current,next)=>invoke('db:changePassword',current,next),
  prepareRestore: passphrase=>invoke('db:prepareRestore',passphrase),
  confirmRestore: (token,confirmation)=>invoke('db:confirmRestore',token,confirmation),
  cancelRestore: token=>invoke('db:cancelRestore',token),
  read: (name,args) => invoke('db:read',name,args),
  registerPatientOrder: input=>invoke('db:registerPatientOrder',input),
  setPaymentStatus: (id,status)=>invoke('db:setPaymentStatus',id,status),
  setRates: rows=>invoke('db:setRates',rows),
  setCommissions: input=>invoke('db:setCommissions',input),
  listUsers: ()=>invoke('db:listUsers'),
  manageUser: input=>invoke('db:manageUser',input),
  deleteUser: id=>invoke('db:deleteUser',id),

  saveOrderResults: (orderId, changes) => invoke('db:saveOrderResults', orderId, changes),
  logPrint: (orderId) => invoke('db:logPrint', orderId),
  backup: () => invoke('db:backup'),
  backupEncrypted: (password) => invoke('db:backupEncrypted', password),
  backupChooseLocation: () => invoke('db:backupChooseLocation'),
  backupEncryptedChooseLocation: (password) => invoke('db:backupEncryptedChooseLocation', password),
  verifyUser: (username, password) => invoke('db:verifyUser', username, password),
  getSession: () => invoke('db:getSession'),
  logout: () => invoke('db:logout'),
  listReferenceSets: (id) => invoke('db:listReferenceSets', id),
  getReferenceContext: () => invoke('db:getReferenceContext'),
  saveReferenceDraft: (id, rules, previousId, sourceId) => invoke('db:saveReferenceDraft', id, rules, previousId, sourceId),
  approveReferenceDraft: (id) => invoke('db:approveReferenceDraft', id),
  getReport: (id) => invoke('db:getReport', id),
  issueReport: (id) => invoke('db:issueReport', id),
  getPrintProfile: () => invoke('db:getPrintProfile'),
  validatePrintProfile: (profile) => invoke('db:validatePrintProfile', profile),
  setPrintProfile: (profile) => invoke('db:setPrintProfile', profile),
  getLabConfig: () => invoke('db:getLabConfig'),
  setLabConfig: (cfg) => invoke('db:setLabConfig', cfg),
  exportOrdersExcel: (params) => invoke('db:exportOrdersExcel', params),
  exportReferralsExcel: (params) => invoke('db:exportReferralsExcel', params),
  getDatabaseSize: () => invoke('db:getDatabaseSize'),
  getLastBackupDate: () => invoke('db:getLastBackupDate'),
  computeOrderBillAndCommission: (orderId) => invoke('db:computeOrderBillAndCommission', orderId),
  clearAllPatientData: () => invoke('db:clearAllPatientData'),
});

contextBridge.exposeInMainWorld('electronPrint', (copies, profile) =>
  invoke('app:print', copies || 1, profile)
);

contextBridge.exposeInMainWorld('electronPrintPreview', (copies, profile) =>
  invoke('app:printPreview', copies || 1, profile)
);


