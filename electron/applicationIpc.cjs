const {createAuthorization}=require('./authorization.cjs');
const {registerReferenceIpc,guardGenericSql,permissions:referencePermissions}=require('./referenceIpc.cjs');
const ops=require('./applicationOperations.cjs');
const appPermissions={print:'staff',printPreview:'staff',setTitle:'staff',setAlwaysOnTop:'staff',getAlwaysOnTop:'staff',getVersion:'public',getPath:'admin'};
function registerAppIpc(ipcMain,auth,operations){
 if(Object.keys(operations).length!==Object.keys(appPermissions).length || Object.keys(operations).some(name=>!Object.hasOwn(appPermissions,name)))throw new Error('Every application operation needs an explicit permission');
 for(const [name,permission]of Object.entries(appPermissions))ipcMain.handle('app:'+name,(event,...args)=>{auth.trusted(event);if(permission!=='public')auth.requireActor(event,permission);return operations[name](event,...args);});
}
const permissions={...referencePermissions,read:'staff',registerPatientOrder:'staff',setPaymentStatus:'staff',saveOrderResults:'staff',nextPatientId:'disabled',logPrint:'staff',computeOrderBillAndCommission:'staff',getLabConfig:'staff',getDatabaseSize:'staff',getLastBackupDate:'staff',exportOrdersExcel:'staff',exportReferralsExcel:'staff',setRates:'admin',setCommissions:'admin',setLabConfig:'admin',listUsers:'admin',manageUser:'admin',deleteUser:'admin',backup:'admin',backupEncrypted:'admin',backupChooseLocation:'admin',backupEncryptedChooseLocation:'admin',clearAllPatientData:'admin',prepareRestore:'admin',confirmRestore:'admin',cancelRestore:'admin',restore:'admin',restoreBackup:'admin',init:'disabled',query:'disabled',run:'disabled',get:'disabled',all:'disabled'};
function registerApplicationIpc(ipcMain,db,services={}){
 const candidates=new Map();
 const auth=services.authorization || createAuthorization(db,{onRevoke:services.onRevoke,isTrusted:services.isTrusted});
 registerReferenceIpc(ipcMain,db,{authorization:auth});
 const handle=(name,fn)=>ipcMain.handle('db:'+name,(event,...args)=>{auth.trusted(event);const permission=permissions[name];if(permission==='disabled')return guardGenericSql();const actor=auth.requireActor(event,permission);return fn(event,actor,...args);});
 const audited=(actor,action,fn)=>{ops.atomic(db,()=>ops.audit(db,actor,action+'-requested'));const result=fn();ops.atomic(db,()=>ops.audit(db,actor,action+'-completed'));return result;};
 for(const name of ['init','query','run','get','all'])handle(name,()=>{});
 handle('read',(event,actor,name,args)=>{const reads=require('./readCatalogue.json');if(Object.hasOwn(reads,name))auth.requireActor(event,reads[name].permission);return ops.read(db,name,args);});
 handle('registerPatientOrder',(_,actor,input)=>ops.registerPatientOrder(db,actor,input));
 handle('setPaymentStatus',(_,actor,id,status)=>ops.setPaymentStatus(db,actor,id,status));
 handle('setRates',(_,actor,rows)=>ops.setRates(db,actor,rows));handle('setCommissions',(_,actor,input)=>ops.setCommissions(db,actor,input));
 handle('saveOrderResults',(_,actor,id,changes)=>db.saveOrderResults(id,changes,actor));
 handle('nextPatientId',()=>{});
 handle('logPrint',(_,actor,id)=>{ops.id(id);if(!db.get('SELECT order_id FROM issued_reports WHERE order_id=?',[id]))throw new Error('Only issued report print requests may be recorded');return ops.atomic(db,()=>{db.logPrint(id,actor.displayName || actor.username);ops.audit(db,actor,'print-issued-report',id);});});
 handle('computeOrderBillAndCommission',(_,actor,id)=>{ops.id(id);if(!db.get('SELECT id FROM orders WHERE id=?',[id]))throw new Error('Order not found');return ops.atomic(db,()=>{db.computeOrderBillAndCommission(id);ops.audit(db,actor,'recalculate-bill',id);return {ok:true};});});
 handle('getLabConfig',()=>db.get('SELECT name,address,phone,email,registration_no,pathologist_name,default_printed_by,staff_list,clinical_correlation_text FROM lab WHERE id=1'));
 handle('setLabConfig',(_,actor,input)=>{const keys=['name','address','phone','email','registration_no','pathologist_name','default_printed_by','staff_list','clinical_correlation_text'];ops.object(input,keys);const values=keys.map(key=>ops.text(input[key],2000));values[0] ||= 'MONDAL DIAGNOSTIC CENTRE';values[5] ||= 'Pathologist';values[6] ||= 'Admin';values[8] ||= 'Please correlate clinically';return ops.atomic(db,()=>{db.run(`UPDATE lab SET ${keys.map(k=>k+'=?').join(',')} WHERE id=1`,values);ops.audit(db,actor,'configure-lab',1,{fields:keys});return {ok:true};});});
 handle('getDatabaseSize',()=>db.getDatabaseSize());handle('getLastBackupDate',()=>db.getLastBackupDate());
 for(const method of ['exportOrdersExcel','exportReferralsExcel'])handle(method,(_,actor,filters={})=>{ops.object(filters,['dateFrom','dateTo']);for(const value of Object.values(filters))if(value!==undefined && value!==null && !/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Invalid export date');return audited(actor,method,()=>db[method](filters));});
 handle('backup',(_,actor)=>audited(actor,'backup',()=>db.backup()));
 handle('backupEncrypted',(_,actor,password)=>{ops.text(password,1024);return audited(actor,'encrypted-backup',()=>db.backupEncrypted(password));});
 for(const method of ['backupChooseLocation','backupEncryptedChooseLocation'])handle(method,async(event,actor,password)=>{
  if(method==='backupEncryptedChooseLocation')ops.text(password,1024);const token=auth.lease(event,'admin');
  if(!services.chooseBackupPath)throw new Error('Backup file dialog is unavailable');
  const chosen=await services.chooseBackupPath(event,method==='backupEncryptedChooseLocation');if(chosen.canceled || !chosen.filePath)return {ok:false,canceled:true};
  const current=auth.requireLease(event,token,'admin');
  const saved=audited(current,method,()=>method==='backupChooseLocation'?db.backupToPath(chosen.filePath):db.backupEncryptedToPath(chosen.filePath,password));return {ok:true,path:saved};
 });
 handle('clearAllPatientData',(_,actor)=>ops.atomic(db,()=>{const count=db.get('SELECT COUNT(*) AS n FROM patients').n;db.clearAllPatients();ops.audit(db,actor,'clear-patient-data',null,{patientCount:count});return {ok:true};}));
 handle('prepareRestore',async(event,actor,passphrase)=>{
  const recovery=require('./recovery.cjs'),fs=require('fs'),crypto=require('crypto');recovery.passphrase(passphrase);const lease=auth.lease(event,'admin');
  if(!services.chooseRestorePath)throw new Error('Restore file dialog unavailable');const choice=await services.chooseRestorePath(event);auth.requireLease(event,lease,'admin');if(choice.canceled || !choice.filePaths?.[0])return {canceled:true};
  const filename=choice.filePaths[0];if(fs.statSync(filename).size>256*1024*1024)throw new Error('Backup exceeds supported size');const bytes=recovery.decrypt(fs.readFileSync(filename),passphrase);const summary=recovery.inspect(db.SQL,bytes,{current:true,expected:db.db});if(!summary.users)throw new Error('Backup must contain an administrator');const token=crypto.randomUUID();for(const [key,value]of candidates)if(value.sender===event.sender.id||value.expires<Date.now())candidates.delete(key);candidates.set(token,{bytes,lease,sender:event.sender.id,expires:Date.now()+5*60*1000,generation:crypto.createHash('sha256').update(db.db.export()).digest('hex')});return {token,summary};
 });
 handle('cancelRestore',(event,actor,token)=>{const entry=candidates.get(token);if(entry?.sender===event.sender.id)candidates.delete(token);return {canceled:true};});
 handle('confirmRestore',(event,actor,token,confirmation)=>{const entry=candidates.get(token);if(!entry||entry.sender!==event.sender.id||entry.expires<Date.now())throw new Error('Restore selection expired. Select the backup again.');const current=auth.requireLease(event,entry.lease,'admin');if(confirmation!=='RESTORE')throw new Error('Explicit restore confirmation is required');if(require('crypto').createHash('sha256').update(db.db.export()).digest('hex')!==entry.generation)throw new Error('Database changed since preview. Select the backup again.');candidates.delete(token);const result=db.restoreValidated(entry.bytes,current);auth.invalidateAll();return result;});
 for(const method of ['restore','restoreBackup'])handle(method,()=>{throw new Error('Legacy restore calls are disabled. Use Select and validate backup, then explicit confirmation. No data was changed.');});
 handle('listUsers',()=>db.all('SELECT id,username,role,display_name AS displayName FROM users ORDER BY username'));
 handle('manageUser',(_,actor,input)=>{
  const p=ops.object(input,['id','username','role','displayName','password']);if(!['admin','staff'].includes(p.role))throw new Error('Invalid user role');const username=ops.text(p.username,100,true);if(!/^[A-Za-z0-9._-]+$/.test(username))throw new Error('Invalid username');const display=ops.text(p.displayName,200);
  const existing=p.id==null?null:db.get('SELECT id,role FROM users WHERE id=?',[ops.id(p.id)]);if(p.id!=null && !existing)throw new Error('User not found');
  if(existing?.role==='admin' && p.role!=='admin' && db.get("SELECT COUNT(*) AS n FROM users WHERE role='admin'").n<=1)throw new Error('At least one admin must remain');
  if(!existing || p.password!==undefined){ops.text(p.password,1024,true);require('./credentials.cjs').validate(p.password);}
  const result=ops.atomic(db,()=>{let userId=existing?.id;if(existing){db.run('UPDATE users SET username=?,role=?,display_name=? WHERE id=?',[username,p.role,display,userId]);if(p.password!==undefined)db.run('UPDATE users SET password_hash=? WHERE id=?',[db.constructor.hashPassword(p.password),userId]);}else {db.run('INSERT INTO users(username,password_hash,role,display_name) VALUES(?,?,?,?)',[username,db.constructor.hashPassword(p.password),p.role,display]);userId=db.get('SELECT last_insert_rowid() AS id').id;}ops.audit(db,actor,existing?'update-user':'create-user',userId,{beforeRole:existing?.role || null,afterRole:p.role,passwordChanged:p.password!==undefined});return {id:userId};});auth.invalidateUser(result.id);return result;
 });
 handle('deleteUser',(_,actor,id)=>{ops.id(id);const user=db.get('SELECT id,role FROM users WHERE id=?',[id]);if(!user)throw new Error('User not found');if(user.role==='admin' && db.get("SELECT COUNT(*) AS n FROM users WHERE role='admin'").n<=1)throw new Error('At least one admin must remain');const result=ops.atomic(db,()=>{db.run('DELETE FROM users WHERE id=?',[id]);ops.audit(db,actor,'delete-user',id,{role:user.role});return {ok:true};});auth.invalidateUser(id);return result;});
 return {authorization:auth,permissions};
}
module.exports={registerApplicationIpc,registerAppIpc,permissions,appPermissions};
