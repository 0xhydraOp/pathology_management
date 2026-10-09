const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const Database=require('../electron/database'),XLSX=require('xlsx');
async function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pathology-release-review-')),db=new Database(dir,{migrateLegacy:false});try{await db.init();db.setupAdmin('synthetic-admin','synthetic-review-password');await fn(db);}finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}}
test('order exports include the complete selected period beyond 5000 records and never overwrite a simultaneous export',()=>fixture(async db=>{
 db._referenceAtomic(()=>{db.db.run("INSERT INTO patients(id,patient_id,name) VALUES(9911,'SYNEXPORT','Synthetic export patient')");for(let n=0;n<5001;n++)db.db.run("INSERT INTO orders(patient_id,order_date,status) VALUES(9911,'2026-10-10','pending')");});
 const a=db.exportOrdersExcel({dateFrom:'2026-10-10',dateTo:'2026-10-10'}),b=db.exportOrdersExcel({dateFrom:'2026-10-10',dateTo:'2026-10-10'});assert.notEqual(a,b);
 const sheet=XLSX.readFile(a).Sheets.Orders;assert.equal(XLSX.utils.sheet_to_json(sheet).length,5001);assert.equal(XLSX.utils.sheet_to_json(XLSX.readFile(b).Sheets.Orders).length,5001);
 const empty=XLSX.readFile(db.exportOrdersExcel({dateFrom:'2026-10-11',dateTo:'2026-10-11'}));assert.equal(XLSX.utils.sheet_to_json(empty.Sheets.Orders).length,0);
}));
test('local dashboard counts include the UTC creation instant on its local business day without changing stored timestamps',()=>fixture(async db=>{
 const originalTZ=process.env.TZ;process.env.TZ='Asia/Kolkata';try{
 db.run("INSERT INTO patients(id,patient_id,name,created_at) VALUES(9912,'SYNTIME','Synthetic clock patient','2026-10-09 20:30:00')");
 const specs=require('../electron/readCatalogue.json');assert.equal(db.get(specs['dashboard.todayPatients'].sql,['2026-10-10']).c,1);assert.equal(db.get(specs['dashboard.todayPatients'].sql,['2026-10-09']).c,0);assert.equal(db.get(specs['dashboard.periodPatients'].sql,['2026-10-10','2026-10-10']).c,1);assert.equal(db.get('SELECT created_at FROM patients WHERE id=9912').created_at,'2026-10-09 20:30:00');
 }finally{if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ;}
}));
test('concurrent preview files keep distinct content even under a fixed millisecond clock',()=>{
 const files=[],now=Date.now;Date.now=()=>0;try{for(let n=0;n<8;n++)files.push(require('../electron/previewFile.cjs').create(Buffer.from('Synthetic preview '+n)));assert.equal(new Set(files).size,8);files.forEach((file,n)=>assert.equal(fs.readFileSync(file,'utf8'),'Synthetic preview '+n));}finally{Date.now=now;for(const file of files)fs.unlinkSync(file);}
});

test('registration retries are persistent, actor-bound and do not duplicate patients, orders, bills or audits',()=>fixture(async db=>{
 db.run("INSERT INTO parameters(id,code,name,type) VALUES(9913,'SYNRETRY','Synthetic retry','numeric')");
 const ops=require('../electron/applicationOperations.cjs'),actor={id:1},input={name:'Synthetic retry patient',age:30,sex:'unknown',tests:[9913],orderDate:'2026-10-10',requestId:require('crypto').randomUUID()};
 const first=ops.registerPatientOrder(db,actor,input);assert.deepEqual(ops.registerPatientOrder(db,actor,input),first);assert.throws(()=>ops.registerPatientOrder(db,actor,{...input,name:'Different synthetic input'}),/already saved/);
 db.run("INSERT INTO users(id,username,password_hash,role) SELECT 9913,'synthetic-other',password_hash,'staff' FROM users WHERE id=1");assert.throws(()=>ops.registerPatientOrder(db,{id:9913},input),/different operator/);
 const bytes=fs.readFileSync(db.dbPath);require('../electron/recovery.cjs').inspect(db.SQL,bytes,{current:true});db.close();await db.init();assert.deepEqual(ops.registerPatientOrder(db,actor,input),first);
 for(const table of ['patients','orders','billing_accounts','registration_requests'])assert.equal(db.get('SELECT COUNT(*) AS n FROM '+table).n,1);assert.equal(db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action='register-order'").n,1);assert.equal(db.get("SELECT COUNT(*) AS n FROM billing_events WHERE kind='charge'").n,1);
}));
