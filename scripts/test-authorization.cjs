const {registerApplicationIpc:registerLocalApplicationFixture}=require('../electron/applicationIpc.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),{EventEmitter}=require('events');
const Database=require('../electron/database'),{registerApplicationIpc,permissions}=require('../electron/applicationIpc.cjs'),{createAuthorization,SESSION_MAX_AGE_MS}=require('../electron/authorization.cjs');
async function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-authorization-'));let db=new Database(dir,{migrateLegacy:false});try{
 await db.init();if(db.credentialState().setupRequired)db.setupAdmin('admin','synthetic-admin-password');db.run("INSERT INTO users(id,username,password_hash,role,display_name) SELECT 9001,'synthetic-staff',password_hash,'staff','Synthetic Staff' FROM users WHERE id=1");
 db.run("INSERT INTO parameters(id,code,name,type,unit,section,decimal_places) VALUES(9001,'SYNAUTH','Synthetic test','numeric','mg/L','Synthetic',2)");
 db.run("INSERT INTO patients(id,patient_id,name,age,sex) VALUES(9001,'SYN-AUTH','Synthetic Patient',30,'female')");db.run("INSERT INTO orders(id,patient_id,order_date,status) VALUES(9001,9001,'2026-10-08','pending')");db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,9001)');
 const handlers=new Map(),event=id=>({sender:Object.assign(new EventEmitter(),{id})}),admin=event(1),staff=event(2),anonymous=event(3);
 const {authorization:auth}=await registerLocalApplicationFixture({handle:(name,fn)=>{assert.ok(!handlers.has(name));handlers.set(name,fn);}},db,{chooseBackupPath:async()=>({filePath:path.join(dir,'chosen.db')})});const invoke=(e,method,...args)=>handlers.get('db:'+method)(e,...args);invoke(admin,'verifyUser','admin','synthetic-admin-password');invoke(staff,'verifyUser','synthetic-staff','synthetic-admin-password');
 const reopen=async()=>{auth.invalidateAll();db.close();db=new Database(dir,{migrateLegacy:false});await db.init();return db;};await fn({db,dir,handlers,admin,staff,anonymous,invoke,auth,event,reopen});
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}}
test('every registered database channel has a policy and denies unauthenticated protected calls',()=>fixture(async f=>{
 assert.deepEqual([...f.handlers.keys()].sort(),Object.keys(permissions).map(n=>'db:'+n).sort());assert.equal(f.invoke(f.anonymous,'getSession'),null);
 for(const [name,permission]of Object.entries(permissions))if(permission!=='public')assert.throws(()=>f.invoke(f.anonymous,name),/Permission denied/,'Unauthenticated '+name);
}));
test('application channels and real preload propagate permissions without exposing generic SQL',()=>fixture(async f=>{
 const {registerAppIpc,appPermissions}=require('../electron/applicationIpc.cjs'),vm=require('vm');let calls=0;const operations=Object.fromEntries(Object.keys(appPermissions).map(name=>[name,()=>{calls++;return true;}]));registerAppIpc({handle:(name,fn)=>f.handlers.set(name,fn)},f.auth,operations);
 for(const [name,permission]of Object.entries(appPermissions))if(permission!=='public')assert.throws(()=>f.handlers.get('app:'+name)(f.anonymous),/Permission denied/);assert.throws(()=>f.handlers.get('app:getPath')(f.staff,'userData'),/Admin authorization/);
 for(const name of ['print','printPreview','setTitle','setAlwaysOnTop','getAlwaysOnTop'])assert.equal(f.handlers.get('app:'+name)(f.staff),true);assert.equal(calls,5);
 const exposed={},context={require:()=>({contextBridge:{exposeInMainWorld:(name,api)=>exposed[name]=api},ipcRenderer:{invoke:(name,...args)=>Promise.resolve().then(()=>f.handlers.get(name)(f.staff,...args)),on(){},removeListener(){}}})};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../electron/preload.js'),'utf8'),context);
 for(const name of ['get','all','run','query','init','nextPatientId'])assert.equal(exposed.db[name],undefined);const messages=[];exposed.electronApp.onPermissionDenied(message=>messages.push(message));await assert.rejects(exposed.db.backup(),/Admin authorization/);assert.equal(messages.length,1);assert.ok(messages[0].startsWith('Permission denied:'));
}));
test('all admin operations reject staff even with forged roles or actor IDs',()=>fixture(async f=>{
 for(const [name,permission]of Object.entries(permissions))if(permission==='admin')assert.throws(()=>f.invoke(f.staff,name,{id:1,role:'admin',username:'admin'}),/Admin authorization/,'Staff bypass '+name);
 assert.throws(()=>f.invoke(f.staff,'registerPatientOrder',{name:'Synthetic',tests:[9001],orderDate:'2026-10-08',role:'admin'}),/fields/);
 assert.throws(()=>f.invoke(f.admin,'restore'),/disabled/);assert.throws(()=>f.invoke(f.admin,'restoreBackup'),/disabled/);
}));
test('generic SQL, credential reads, schema commands and audit/issuance writes are disabled for all roles',()=>fixture(async f=>{
 const attacks=["SELECT * FROM users","SELECT name,(SELECT password_hash FROM users LIMIT 1) FROM patients","SELECT name FROM patients UNION SELECT password_hash FROM users","SELECT u.* FROM patients p JOIN users u","UPDATE orders SET report_status='issued'","DELETE FROM audit_log","DELETE FROM issued_reports","PRAGMA table_info(users)","ATTACH DATABASE 'x' AS x","CREATE TRIGGER x AFTER INSERT ON orders BEGIN DELETE FROM issued_reports; END"];
 for(const actor of [f.admin,f.staff,f.anonymous])for(const method of ['get','all','run','query'])for(const sql of attacks)assert.throws(()=>f.invoke(actor,method,sql),/disabled/);
 for(const name of ['users','SELECT * FROM users','__proto__','constructor','audit_log'])assert.throws(()=>f.invoke(f.staff,'read',name,[]),/Unknown read/);
 const catalogue=require('../electron/readCatalogue.json');for(const [name,query]of Object.entries(catalogue)){assert.ok(!/\busers\b|password_hash|audit_log/i.test(query.sql));const args=(query.sql.match(/\?/g)||[]).map(()=>9001);f.invoke(f.staff,'read',name,args);}
 assert.throws(()=>f.invoke(f.staff,'read','results.savedValues',[9001,{role:'admin'}]),/arguments/);
}));
test('allowed staff registration, results, issuance, billing and export preserve issued snapshots and actor audits',()=>fixture(async f=>{
 const registered=f.invoke(f.staff,'registerPatientOrder',{name:'Synthetic New Patient',age:0,sex:'unknown',phone:null,address:null,referred_by:'Self',tests:[9001],orderDate:'2026-10-08'});assert.ok(registered.orderId);assert.equal(f.db.get('SELECT age FROM patients WHERE patient_id=?',[registered.patientId]).age,0);
 const save=f.invoke(f.staff,'saveOrderResults',registered.orderId,[{parameterId:9001,value:0}],{id:1,username:'forged'});assert.equal(save.status,'complete');const issued=f.invoke(f.staff,'issueReport',registered.orderId);assert.equal(issued.issued_by,'synthetic-staff');assert.equal(issued.results[0].result_value,0);
 f.invoke(f.staff,'setPaymentStatus',registered.orderId,'paid');f.invoke(f.staff,'computeOrderBillAndCommission',registered.orderId);f.invoke(f.staff,'logPrint',registered.orderId,'forged-admin');assert.equal(f.db.get('SELECT printed_by FROM report_print_log WHERE order_id=?',[registered.orderId]).printed_by,'Synthetic Staff');
 assert.throws(()=>f.invoke(f.staff,'logPrint',9001),/Only issued/);assert.throws(()=>f.invoke(f.staff,'saveOrderResults',registered.orderId,[{parameterId:9001,value:4}]),/read-only/);
 assert.deepEqual(f.invoke(f.staff,'getReport',registered.orderId),issued);assert.ok(fs.existsSync(f.invoke(f.staff,'exportOrdersExcel',{dateFrom:'2026-10-08',dateTo:'2026-10-08'})));assert.ok(fs.existsSync(f.invoke(f.staff,'exportReferralsExcel',{dateFrom:'2026-10-08',dateTo:'2026-10-08'})));
 const audits=f.db.all("SELECT * FROM audit_log WHERE table_name='application_security' AND action!='administrator-setup'");assert.ok(audits.length>=8);assert.ok(audits.every(a=>a.changed_by==='synthetic-staff'));const serialized=JSON.stringify(audits);assert.ok(!serialized.includes('Synthetic New Patient'));assert.ok(!serialized.includes('password_hash'));assert.ok(!serialized.includes('forged-admin'));
 const db=await f.reopen();assert.deepEqual(db.getReport(registered.orderId),issued);
}));
test('admin configuration, user management and backup omit credentials from responses/audits',()=>fixture(async f=>{
 f.invoke(f.admin,'setRates',[{parameterId:9001,rate:125}]);f.invoke(f.admin,'setCommissions',{defaultPercent:45,entries:[{name:'Synthetic referrer',percent:40}]});f.invoke(f.admin,'setLabConfig',{name:'Synthetic Laboratory'});
 assert.equal(f.db.get('SELECT rate FROM test_rates WHERE parameter_id=9001').rate,125);assert.equal(f.db.get('SELECT name FROM lab WHERE id=1').name,'Synthetic Laboratory');
 const target=f.invoke(f.admin,'manageUser',{username:'synthetic-new-user',role:'staff',displayName:'Synthetic User',password:'synthetic-password'});const users=f.invoke(f.admin,'listUsers');assert.ok(users.some(u=>u.id===target.id));assert.ok(users.every(u=>!Object.hasOwn(u,'password_hash')));
 f.invoke(f.admin,'manageUser',{id:target.id,username:'synthetic-new-user',role:'admin',displayName:'Synthetic User',password:'synthetic-replacement'});f.invoke(f.admin,'deleteUser',target.id);assert.throws(()=>f.invoke(f.admin,'deleteUser',1),/one admin/);
 const backup=f.invoke(f.admin,'backup');assert.ok(fs.existsSync(backup));assert.ok(fs.existsSync(f.invoke(f.admin,'backupEncrypted','synthetic-backup-secret')));const selected=await f.invoke(f.admin,'backupChooseLocation');assert.ok(selected.ok);assert.ok(fs.existsSync(selected.path));
 const audit=JSON.stringify(f.db.all('SELECT * FROM audit_log'));for(const secret of ['synthetic-password','synthetic-replacement','synthetic-backup-secret',f.db.get('SELECT password_hash FROM users WHERE id=1').password_hash])assert.ok(!audit.includes(secret));
}));
test('a failed audit prevents registration/configuration changes from committing',()=>fixture(async f=>{
 const patients=f.db.get('SELECT COUNT(*) AS n FROM patients').n,rates=f.db.all('SELECT * FROM test_rates');f.db.run("CREATE TRIGGER synthetic_auth_audit_failure BEFORE INSERT ON audit_log WHEN NEW.table_name='application_security' BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END");
 assert.throws(()=>f.invoke(f.staff,'registerPatientOrder',{name:'Synthetic Failed Registration',age:30,sex:'male',tests:[9001],orderDate:'2026-10-08'}),/audit failure/);assert.equal(f.db.get('SELECT COUNT(*) AS n FROM patients').n,patients);
 assert.throws(()=>f.invoke(f.admin,'setRates',[{parameterId:9001,rate:5}]),/audit failure/);assert.deepEqual(f.db.all('SELECT * FROM test_rates'),rates);f.db.run('DROP TRIGGER synthetic_auth_audit_failure');const db=await f.reopen();assert.equal(db.get('SELECT COUNT(*) AS n FROM patients').n,patients);assert.deepEqual(db.all('SELECT * FROM test_rates'),rates);
}));
test('sessions reject logout, destruction, ID reuse, role/password/deletion changes and expire',()=>fixture(async f=>{
 f.invoke(f.staff,'logout');assert.throws(()=>f.invoke(f.staff,'getReport',9001),/Sign in again/);f.invoke(f.staff,'verifyUser','synthetic-staff','synthetic-admin-password');f.staff.sender.emit('destroyed');assert.equal(f.invoke(f.staff,'getSession'),null);
 f.invoke(f.staff,'verifyUser','synthetic-staff','synthetic-admin-password');const replacement=f.event(2);assert.throws(()=>f.invoke(replacement,'getReport',9001),/Sign in again/);
 f.invoke(f.staff,'verifyUser','synthetic-staff','synthetic-admin-password');f.db.run("UPDATE users SET role='admin' WHERE id=9001");assert.throws(()=>f.invoke(f.staff,'setLabConfig',{}),/Sign in again/);f.invoke(f.staff,'verifyUser','synthetic-staff','synthetic-admin-password');f.db.run("UPDATE users SET role='staff' WHERE id=9001");assert.throws(()=>f.invoke(f.staff,'getReport',9001),/Sign in again/);
 f.invoke(f.staff,'verifyUser','synthetic-staff','synthetic-admin-password');f.invoke(f.admin,'manageUser',{id:9001,username:'synthetic-staff',role:'staff',password:'synthetic-reset'});assert.equal(f.invoke(f.staff,'getSession'),null);f.invoke(f.staff,'verifyUser','synthetic-staff','synthetic-reset');f.invoke(f.admin,'deleteUser',9001);assert.equal(f.invoke(f.staff,'getSession'),null);
 let clock=1;const auth=createAuthorization(f.db,{now:()=>clock});auth.login(f.admin,'admin','synthetic-admin-password');clock+=SESSION_MAX_AGE_MS;assert.throws(()=>auth.requireActor(f.admin),/Sign in again/);
}));
test('pending backup dialogs cannot survive logout or a different login',()=>fixture(async f=>{
 let resolve;const handlers=new Map();const {authorization:auth}=await registerLocalApplicationFixture({handle:(name,fn)=>handlers.set(name,fn)},f.db,{chooseBackupPath:()=>new Promise(r=>resolve=r)});const invoke=(method,...args)=>handlers.get('db:'+method)(f.admin,...args);invoke('verifyUser','admin','synthetic-admin-password');const destination=path.join(f.dir,'stale-dialog.db');
 const pending=invoke('backupChooseLocation');invoke('logout');invoke('verifyUser','admin','synthetic-admin-password');resolve({filePath:destination});await assert.rejects(pending,/session changed/);assert.ok(!fs.existsSync(destination));auth.invalidateAll();
}));
test('main-frame and origin/session binding reject other frames and close sensitive sessions',()=>fixture(async f=>{
 const revoked=[],auth=createAuthorization(f.db,{onRevoke:id=>revoked.push(id)}),sender=Object.assign(new EventEmitter(),{id:55,getURL:()=>frame.url}),frame={url:'file:///synthetic-app/index.html'};sender.mainFrame=frame;const event={sender,senderFrame:frame};auth.login(event,'admin','synthetic-admin-password');assert.throws(()=>auth.requireActor({sender,senderFrame:{url:frame.url}}),/main application frame/);frame.url='https://untrusted.invalid/';assert.throws(()=>auth.requireActor(event),/Sign in again/);assert.deepEqual(revoked,[55]);
}));
test('destructive clear is atomic, keeps security/configuration audits and records authenticated actor',()=>fixture(async f=>{
 f.invoke(f.admin,'setPrintProfile',{...f.db.getPrintProfile(),offsetXmm:1});const count=f.db.get('SELECT COUNT(*) AS n FROM audit_log').n;
 f.db.run("CREATE TRIGGER synthetic_wipe_failure BEFORE DELETE ON patients BEGIN SELECT RAISE(ABORT,'Synthetic wipe failure'); END");assert.throws(()=>f.invoke(f.admin,'clearAllPatientData'),/wipe failure/);assert.equal(f.db.get('SELECT COUNT(*) AS n FROM patients').n,1);assert.equal(f.db.get('SELECT COUNT(*) AS n FROM audit_log').n,count);f.db.run('DROP TRIGGER synthetic_wipe_failure');
 assert.equal(f.invoke(f.admin,'clearAllPatientData').ok,true);assert.equal(f.db.get('SELECT COUNT(*) AS n FROM patients').n,0);assert.equal(f.db.get('SELECT COUNT(*) AS n FROM audit_log').n,count+1);assert.equal(f.db.get("SELECT changed_by FROM audit_log WHERE action='clear-patient-data'").changed_by,'admin');assert.ok(f.db.get("SELECT id FROM audit_log WHERE table_name='lab_print_profile'"));const db=await f.reopen();assert.equal(db.get('SELECT COUNT(*) AS n FROM patients').n,0);
}));
test('restart cannot recreate a deleted or renamed bootstrap administrator',()=>fixture(async f=>{
 f.invoke(f.admin,'manageUser',{username:'synthetic-second-admin',role:'admin',password:'synthetic-other-password'});f.invoke(f.admin,'deleteUser',1);let db=await f.reopen();assert.equal(db.verifyUser('admin','synthetic-admin-password'),null);assert.ok(db.verifyUser('synthetic-second-admin','synthetic-other-password'));
 db.run('DELETE FROM users');const preserved=fs.readFileSync(db.dbPath);await assert.rejects(f.reopen(),/administrator recovery/);assert.deepEqual(fs.readFileSync(path.join(f.dir,'lab.db')),preserved);
}));
