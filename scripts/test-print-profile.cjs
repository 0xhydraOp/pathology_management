const {registerReferenceFixture}=require('./registerApplicationFixture.cjs');
const{test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');const Database=require('../electron/database');
async function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-print-profile-'));let db=new Database(dir,{migrateLegacy:false});try{await db.init();if(db.credentialState().setupRequired)db.setupAdmin('admin','synthetic-admin-password');const reopen=async()=>{db.close();db=new Database(dir,{migrateLegacy:false});await db.init();return db;};await fn(db,reopen,dir);}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}}
test('local print profile validates geometry, authorizes updates and survives reopen',()=>fixture(async(db,reopen)=>{
 const base=db.getPrintProfile();assert.equal(base.mode,'preprinted');
 assert.throws(()=>db.setPrintProfile(null,base),/authorized/i);
 for(const change of [{paperWidthMm:NaN},{fontSizeMm:Infinity},{reservedHeaderMm:280},{columnWidthsMm:[90,90,90,90]},{tableYmm:30},{offsetYmm:-40}])assert.throws(()=>db.setPrintProfile({id:1},{...base,paper:'custom',...change}));
 const profile={...base,paper:'custom',paperWidthMm:180,paperHeightMm:240,columnWidthsMm:[50,20,20,70],offsetXmm:2,offsetYmm:2};
 const saved=db.setPrintProfile({id:1},profile);db=await reopen();assert.deepEqual(db.getPrintProfile(),saved);
 const audit=db.get("SELECT * FROM audit_log WHERE table_name='lab_print_profile' ORDER BY id DESC LIMIT 1");assert.equal(audit.changed_by,'admin');
}));
test('direct profile IPC rejects unauthenticated/staff calls and audits the authenticated admin',()=>fixture(async db=>{
 const {EventEmitter}=require('events'),{registerReferenceIpc,guardGenericSql}=require('../electron/referenceIpc.cjs');
 const handlers=new Map(),event={sender:Object.assign(new EventEmitter(),{id:77})};await registerReferenceFixture({handle:(name,fn)=>handlers.set(name,fn)},db);
 const invoke=(method,...args)=>handlers.get('db:'+method)(event,...args),profile=db.getPrintProfile();
 assert.throws(()=>invoke('setPrintProfile',profile),/authorized/i);
 db.run("INSERT INTO users(id,username,password_hash,role) SELECT 9001,'synthetic-staff',password_hash,'staff' FROM users WHERE id=1");invoke('verifyUser','synthetic-staff','synthetic-admin-password');assert.throws(()=>invoke('setPrintProfile',profile),/admin/i);
 invoke('verifyUser','admin','synthetic-admin-password');invoke('setPrintProfile',{...profile,offsetXmm:1,columnWidthsMm:[55,25,25,75]});assert.equal(db.get("SELECT changed_by FROM audit_log WHERE table_name='lab_print_profile' ORDER BY id DESC LIMIT 1").changed_by,'admin');
 assert.throws(()=>guardGenericSql("UPDATE lab_print_profile SET payload='{}'",true),/authorized/i);
}));
test('profile migration backs up version-2 bytes, recovers from failure and runs only once',()=>fixture(async(db,reopen,dir)=>{
 const parameterCount=db.get('SELECT COUNT(*) AS n FROM parameters').n;db.run('DROP TABLE lab_print_profile');require('./legacy-schema-fixture.cjs')(db,0);db.run('DELETE FROM reference_migrations WHERE version=3');db.close();const before=fs.readFileSync(path.join(dir,'lab.db'));
 const rename=fs.renameSync;fs.renameSync=()=>{throw new Error('Synthetic profile migration failure');};
 try{await assert.rejects(reopen(),/profile migration failure/);}finally{fs.renameSync=rename;}
 assert.deepEqual(fs.readFileSync(path.join(dir,'lab.db')),before);
 const bytes=fs.readdirSync(path.join(dir,'backups')).map(name=>fs.readFileSync(path.join(dir,'backups',name))).find(bytes=>bytes.equals(before));assert.ok(bytes);
 const copy=new db.SQL.Database(bytes);try{assert.equal(copy.exec('PRAGMA integrity_check')[0].values[0][0],'ok');assert.equal(copy.exec('SELECT COUNT(*) FROM parameters')[0].values[0][0],parameterCount);}finally{copy.close();}
 db=await reopen();assert.equal(db.getPrintProfile().version,1);const stamps=db.all('SELECT * FROM reference_migrations');db=await reopen();assert.deepEqual(db.all('SELECT * FROM reference_migrations'),stamps);
}));
test('native/PDF custom paper options preserve physical dimensions and fixed scale',()=>{
 const {nativePrintOptions,pdfPrintOptions}=require('../electron/printOptions.cjs');const p={...require('../electron/printProfileSchema.json').defaults,paper:'custom',paperWidthMm:180,paperHeightMm:240,columnWidthsMm:[50,20,20,70]};
 const native=nativePrintOptions(2,p),pdf=pdfPrintOptions(p);assert.deepEqual(native.pageSize,{width:180000,height:240000});assert.equal(native.copies,2);assert.equal(native.scaleFactor,100);assert.equal(native.margins.marginType,'none');assert.ok(Math.abs(pdf.pageSize.width*25.4-180)<.0001);assert.ok(Math.abs(pdf.pageSize.height*25.4-240)<.0001);assert.equal(pdf.scale,1);assert.deepEqual(pdf.margins,{top:0,bottom:0,left:0,right:0});assert.equal(pdf.displayHeaderFooter,false);
});
test('native cancellation and multiple preview windows keep their own PDF and paper profile',async()=>{
 const vm=require('vm'),{EventEmitter}=require('events'),{createRequire}=require('module');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-print-dispatch-'));const windows=[];let focused;
 class FakeWindow extends EventEmitter{
  constructor(){super();this.id=windows.length+1;windows.push(this);this.prints=[];this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=fn=>{this.windowOpenHandler=fn;};this.webContents.print=(options,callback)=>{this.prints.push(options);callback?.(false,'Print job cancelled');};this.webContents.printToPDF=async options=>{this.pdfOptions=options;return Buffer.from('Synthetic fake PDF');};this.webContents.send=()=>{throw new Error('Preview must not dispatch main-page printing');};}
  loadURL(){queueMicrotask(()=>this.webContents.emit('did-finish-load'));return Promise.resolve();}center(){}show(){}isDestroyed(){return false;}destroy(){this.emit('closed');}static getFocusedWindow(){return focused;}
 }
 const filename=path.resolve(__dirname,'../electron/main.js'),localRequire=createRequire(filename);
 const context={require:name=>name==='electron'?{BrowserWindow:FakeWindow,app:{requestSingleInstanceLock:()=>true,on(){},whenReady:()=>({then(){}}),getPath:()=>dir,getVersion:()=> 'synthetic-test'},globalShortcut:{},ipcMain:{}}:localRequire(name),__dirname:path.dirname(filename),console,process,setTimeout,clearTimeout,Buffer};vm.createContext(context);
 vm.runInContext(fs.readFileSync(filename,'utf8').replace(/\}\s*$/, '\nthis.dispatch={doPrint,doPrintPreview,printFocusedWindow,setMain:win=>mainWindow=win};\n}'),context);
 try{
  const main=new FakeWindow();context.dispatch.setMain(main);const p=require('../electron/printProfileSchema.json').defaults;
  const cancelled=await context.dispatch.doPrint(1,p);assert.equal(cancelled.ok,false);assert.equal(cancelled.cancelled,true);
  assert.equal((await context.dispatch.doPrintPreview(2,p)).ok,true);const first=windows.at(-1);
  const custom={...p,paper:'custom',paperWidthMm:180,paperHeightMm:240,columnWidthsMm:[50,20,20,70]};assert.equal((await context.dispatch.doPrintPreview(3,custom)).ok,true);const second=windows.at(-1);
  focused=first;context.dispatch.printFocusedWindow();assert.equal(first.prints[0].pageSize.width,210000);assert.equal(first.prints[0].copies,2);first.destroy();
  focused=second;context.dispatch.printFocusedWindow();assert.equal(second.prints[0].pageSize.width,180000);assert.equal(second.prints[0].copies,3);second.destroy();assert.equal(main.prints.length,1);
  let revoked=false;const access={senderId:77,authorize:()=>{if(revoked)throw new Error('Permission denied: synthetic revoked session');}};
  assert.equal((await context.dispatch.doPrintPreview(1,p,access)).ok,true);const guarded=windows.at(-1);revoked=true;focused=guarded;context.dispatch.printFocusedWindow();assert.equal(guarded.prints.length,0);
  const expired=await context.dispatch.doPrintPreview(1,p,access);assert.equal(expired.ok,false);assert.match(expired.error,/revoked session/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('changing physical calibration never modifies an issued clinical snapshot',()=>fixture(async(db)=>{
 db.run("INSERT INTO patients(id,patient_id,name,age,sex) VALUES(9001,'SYNPRINT','Synthetic Patient',30,'female')");
 const parameter=db.get("SELECT id FROM parameters WHERE type='numeric' LIMIT 1");
 db.run('INSERT INTO orders(id,patient_id) VALUES(9001,9001)');db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,?)',[parameter.id]);
 db.saveOrderResults(9001,[{parameterId:parameter.id,value:3}]);const report=db.issueReport({id:1},9001);
 db.setPrintProfile({id:1},{...db.getPrintProfile(),offsetXmm:2,columnWidthsMm:[55,25,25,75]});assert.deepEqual(db.getReport(9001),report);
}));
