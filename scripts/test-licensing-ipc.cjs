const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{EventEmitter}=require('events');
const Database=require('../electron/database'),{registerApplicationIpc,registerAppIpc}=require('../electron/applicationIpc.cjs');
const {registerLicensingIpc}=require('../electron/licensingIpc.cjs'),{createLicensingFixture}=require('./licensingFixture.cjs');
async function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'patholy-licensing-ipc-')),db=new Database(dir,{migrateLegacy:false});let licensing;
 try{
  await db.init();db.setupAdmin('synthetic-admin','synthetic-admin-password');
  db.run("INSERT INTO users(username,password_hash,role) SELECT 'synthetic-staff',password_hash,'staff' FROM users WHERE username='synthetic-admin'");
  db.run("INSERT INTO parameters(id,code,name,type,unit) VALUES(9901,'SYNLIC','Synthetic licence fixture','numeric','synthetic-unit')");
  licensing=await createLicensingFixture({directory:path.join(dir,'activation-material')});
  const handlers=new Map(),admin={sender:Object.assign(new EventEmitter(),{id:1,send(){}})},staff={sender:Object.assign(new EventEmitter(),{id:2,send(){}})},anonymous={sender:Object.assign(new EventEmitter(),{id:3})};
  const {authorization:auth}=registerApplicationIpc({handle:(n,f)=>handlers.set(n,f)},db,{licensing});registerLicensingIpc({handle:(n,f)=>handlers.set(n,f)},auth,licensing);
  registerAppIpc({handle:(n,f)=>handlers.set(n,f)},auth,{print:()=>({ok:true}),printPreview:()=>({ok:true}),setTitle(){},setAlwaysOnTop(){},getAlwaysOnTop:()=>false,getVersion:()=> 'synthetic',getPath:()=>dir});
  const call=(event,name,...args)=>handlers.get(name)(event,...args);
  call(admin,'db:verifyUser','synthetic-admin','synthetic-admin-password');call(staff,'db:verifyUser','synthetic-staff','synthetic-admin-password');
  await fn({dir,db,licensing,handlers,admin,staff,anonymous,auth,call});
 }finally{licensing?.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
const input={name:'Synthetic licence patient',age:30,sex:'female',tests:[9901],orderDate:'2026-10-08'};
test('unlicensed registration, normal/batch editing and finalization fail in backend without data changes',()=>fixture(async f=>{
 const order=f.call(f.staff,'db:registerPatientOrder',input);f.call(f.staff,'db:saveOrderResults',order.orderId,[{parameterId:9901,value:0}]);
 f.licensing.fixture.advance(700000);const before=fs.readFileSync(f.db.dbPath);
 for(const [name,args]of [['registerPatientOrder',[input]],['saveOrderResults',[order.orderId,[{parameterId:9901,value:4}]]],['issueReport',[order.orderId]]])assert.throws(()=>f.call(f.staff,'db:'+name,...args),/Licence allowance ended/);
 assert.deepEqual(fs.readFileSync(f.db.dbPath),before);assert.equal(f.db.getReport(order.orderId).issued,false);
}));
test('expired licence keeps login, existing records, issued reprints, backup/export and settings available',()=>fixture(async f=>{
 const order=f.call(f.admin,'db:registerPatientOrder',input);f.call(f.admin,'db:saveOrderResults',order.orderId,[{parameterId:9901,value:0}]);const issued=f.call(f.admin,'db:issueReport',order.orderId);
 f.licensing.fixture.advance(700000);assert.deepEqual(f.call(f.staff,'db:getReport',order.orderId),issued);assert.ok(f.call(f.admin,'db:backupEncrypted','synthetic-backup-passphrase'));assert.ok(f.call(f.staff,'db:exportOrdersExcel',{}));assert.equal(f.call(f.staff,'app:print').ok,true);assert.equal(f.call(f.staff,'app:printPreview').ok,true);
 f.call(f.admin,'db:logout');assert.ok(f.call(f.admin,'db:verifyUser','synthetic-admin','synthetic-admin-password'));assert.ok(f.call(f.admin,'db:getLabConfig'));
}));
test('missing licence service is failclosed for clinical writes and does not prevent authentication/read access',()=>fixture(async f=>{
 const handlers=new Map();registerApplicationIpc({handle:(n,fn)=>handlers.set(n,fn)},f.db);handlers.get('db:verifyUser')(f.admin,'synthetic-admin','synthetic-admin-password');
 assert.throws(()=>handlers.get('db:registerPatientOrder')(f.admin,input),/Licence allowance ended/);assert.ok(handlers.get('db:getLabConfig')(f.admin));
}));
test('licensing IPC rejects unauthenticated/staff activation and ignores client-supplied identity',()=>fixture(async f=>{
 assert.throws(()=>f.call(f.anonymous,'licensing:status'),/Permission denied/);
 await assert.rejects(f.call(f.staff,'licensing:activate','PTH-synthetic-invalid',{role:'admin'}),/Admin authorization/);
 assert.equal(f.call(f.staff,'licensing:status').allowed,true);
 const status=f.call(f.admin,'licensing:status');assert.equal(Object.hasOwn(status,'key'),false);assert.equal(Object.hasOwn(status,'grant'),false);
}));
test('logout during activation response cannot commit activation material',()=>fixture(async f=>{
 let resolve;f.licensing.fixture.setResponder(()=>new Promise(r=>resolve=r));const before=fs.readFileSync(f.licensing.file);
 const pending=f.call(f.admin,'licensing:activate','PTH-'+require('crypto').randomBytes(32).toString('base64url'));f.call(f.admin,'db:logout');
 const payload=f.licensing.fixture.payload();resolve(new Response(JSON.stringify({grant:f.licensing.fixture.sign({...payload,policyRevision:2})}),{status:200}));
 await assert.rejects(pending,/Permission denied/);assert.deepEqual(fs.readFileSync(f.licensing.file),before);
}));
