const {registerLicensedReferenceFixture}=require('./registerLicensedFixture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const Database=require('../electron/database');
async function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-reference-'));
 let db=new Database(dir,{migrateLegacy:false});
 try{
  await db.init();if(db.credentialState().setupRequired)db.setupAdmin('admin','synthetic-admin-password');
  db.run("INSERT INTO parameters(id,code,name,type,unit,section) VALUES(9001,'SYNREF','Synthetic reference','numeric','mg/L','Synthetic')");
  db.run("INSERT INTO patients(id,patient_id,name,age,sex) VALUES(9001,'SYNREF','Synthetic Patient',30,'female')");
  db.run("INSERT INTO orders(id,patient_id,status) VALUES(9001,9001,'pending')");
  db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,9001)');
  const admin={id:1,username:'admin',role:'admin'};
  const reopen=async()=>{db.close();db=new Database(dir,{migrateLegacy:false});await db.init();return db;};
  await fn(db,admin,reopen);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
const rule=(extra={})=>({sex:'any',min_age:0,max_age:150,min_age_inclusive:true,max_age_inclusive:true,low_value:1,high_value:5,low_inclusive:true,high_inclusive:true,unit:'mg/L',reference_text:'',...extra});
function approve(db,admin,rules){const draft=db.saveReferenceDraft(admin,9001,rules,null);return db.approveReferenceDraft(admin,draft.id);}

test('approved matching, inclusive/exclusive boundaries and no guessed age',()=>fixture(async(db,admin)=>{
 approve(db,admin,[rule({low_inclusive:false})]);
 for(const [value,flag] of [[1,'L'],[1.1,'N'],[5,'N'],[5.01,'H']]){db.saveOrderResults(9001,[{parameterId:9001,value}]);assert.equal(db.getReport(9001).results[0].flag,flag);}
 db.run('UPDATE patients SET age=NULL WHERE id=9001');
 assert.equal(db.getReport(9001).results[0].refRange,'Reference interval not configured');
 assert.equal(db.getReport(9001).results[0].flag,'');
}));
test('drafts do not affect flagging; authorization and audit',()=>fixture(async(db,admin)=>{
 assert.throws(()=>db.saveReferenceDraft(null,9001,[rule()],null),/authorized|admin/i);
 db.run("INSERT INTO users(id,username,password_hash,role) VALUES(9001,'synthetic-staff','unused','staff')");
 assert.throws(()=>db.saveReferenceDraft({id:9001,role:'admin'},9001,[rule()],null),/admin/i);
 const draft=db.saveReferenceDraft(admin,9001,[rule()],null);
 db.saveOrderResults(9001,[{parameterId:9001,value:2}]);
 assert.equal(db.getReport(9001).results[0].flag,'');
 db.approveReferenceDraft(admin,draft.id);
 const audit=db.all("SELECT * FROM audit_log WHERE table_name='reference_interval_sets'");
 assert.equal(audit.length,2);assert.equal(audit[0].changed_by,'admin');assert.ok(audit[0].changed_at);
 assert.equal(JSON.parse(audit[1].new_value).status,'approved');
}));
test('overlap, reversed limits, units and stale revisions reject',()=>fixture(async(db,admin)=>{
 assert.equal(typeof db.saveReferenceDraft,'function');
 for(const rules of [[rule({low_value:6})],[rule({unit:'mmol/L'})],[rule(),rule({sex:'female'})],[rule({min_age:40,max_age:20})],[rule({low_value:'12abc'})],[rule({critical_high:10})],[rule({diagnostic_cutoff:2})]])assert.throws(()=>db.saveReferenceDraft(admin,9001,rules,null));
 const a=db.saveReferenceDraft(admin,9001,[rule()],null);
 const b=db.saveReferenceDraft(admin,9001,[rule({high_value:6})],null);
 db.approveReferenceDraft(admin,a.id);
 assert.throws(()=>db.approveReferenceDraft(admin,b.id),/changed|stale/i);
}));
test('adjacent age groups, sex groups and qualitative reference text',()=>fixture(async(db,admin)=>{
 approve(db,admin,[rule({sex:'female',max_age:18,max_age_inclusive:false}),rule({sex:'female',min_age:18}),rule({sex:'male'})]);
 db.saveOrderResults(9001,[{parameterId:9001,value:3}]);assert.equal(db.getReport(9001).results[0].flag,'N');
 const active=db.listReferenceSets(9001).find(s=>s.status==='approved');
 const draft=db.saveReferenceDraft(admin,9001,[rule({low_value:null,high_value:null,reference_text:'Synthetic qualitative reference'})],active.id);
 db.approveReferenceDraft(admin,draft.id);
 assert.equal(db.getReport(9001).results[0].refRange,'Synthetic qualitative reference');
 assert.equal(db.getReport(9001).results[0].flag,'');
}));
test('issued snapshot retains interval, units, result, and flag after settings changes and reopen',()=>fixture(async(db,admin,reopen)=>{
 approve(db,admin,[rule()]);db.saveOrderResults(9001,[{parameterId:9001,value:3}]);
 const issued=db.issueReport(admin,9001);
 const current=db.listReferenceSets(9001).find(s=>s.status==='approved');
 const draft=db.saveReferenceDraft(admin,9001,[rule({high_value:2})],current.id);db.approveReferenceDraft(admin,draft.id);
 db.run("UPDATE parameters SET unit='changed' WHERE id=9001");
 assert.deepEqual(db.getReport(9001),issued);
 assert.throws(()=>db.saveOrderResults(9001,[{parameterId:9001,value:9}]),/issued/i);
 db=await reopen();assert.deepEqual(db.getReport(9001),issued);
 assert.equal(issued.results[0].unit,'mg/L');assert.equal(issued.results[0].flag,'N');
}));
test('missing approval stays explicit on an issued report',()=>fixture(async(db,admin)=>{
 db.saveOrderResults(9001,[{parameterId:9001,value:0,flag:'N'}]);
 const issued=db.issueReport(admin,9001);
 assert.equal(issued.results[0].flag,'');assert.equal(issued.results[0].refRange,'Reference interval not configured');
 approve(db,admin,[rule()]);assert.deepEqual(db.getReport(9001),issued);
}));
test('failed approval persistence rolls back audit and active interval',()=>fixture(async(db,admin,reopen)=>{
 const draft=db.saveReferenceDraft(admin,9001,[rule()],null);
 const rename=fs.renameSync;fs.renameSync=()=>{throw new Error('Synthetic disk failure');};
 try{assert.throws(()=>db.approveReferenceDraft(admin,draft.id),/disk failure/);}finally{fs.renameSync=rename;}
 db=await reopen();assert.equal(db.listReferenceSets(9001)[0].status,'pending');
 assert.equal(db.all("SELECT * FROM audit_log WHERE table_name='reference_interval_sets'").length,1);
}));

test('migration preserves IDs, clinical values and legacy printed snapshots; runs only once',()=>fixture(async(db,admin,reopen)=>{
 db.run('INSERT INTO parameter_ranges(parameter_id,sex,min_age,max_age,low_value,high_value,critical_low,critical_high) VALUES(9001,?,0,150,1,5,0.5,9)',['any']);
 db.saveOrderResults(9001,[{parameterId:9001,value:3}]);db.logPrint(9001,'Synthetic Editor');
 const patients=db.all('SELECT * FROM patients'),parameters=db.all('SELECT id,code,unit FROM parameters');
 const ranges=db.all('SELECT * FROM parameter_ranges');
 db.run('PRAGMA user_version=0');
 for(const table of ['reference_migrations','reference_interval_sets','parameter_critical_rules','issued_reports'])db.run(`DROP TABLE ${table}`);
 db=await reopen();
 assert.deepEqual(db.all('SELECT * FROM patients'),patients);assert.deepEqual(db.all('SELECT id,code,unit FROM parameters'),parameters);assert.deepEqual(db.all('SELECT * FROM parameter_ranges'),ranges);
 assert.equal(db.listReferenceSets(9001)[0].status,'pending');
 assert.equal(db.getReferenceContext().critical.find(r=>r.parameter_id===9001).critical_high,9);
 const legacy=db.getReport(9001);assert.equal(legacy.provenance,'legacy-at-upgrade');assert.equal(legacy.results[0].refRange,'[1 – 5]');
 assert.ok(fs.readdirSync(path.join(db.dataRoot,'backups')).some(name=>name.startsWith('before-reference-intervals-')));
 const versions=db.all('SELECT * FROM reference_interval_sets');
 db=await reopen();assert.deepEqual(db.all('SELECT * FROM reference_interval_sets'),versions);assert.deepEqual(db.getReport(9001),legacy);
 const approved=db.approveReferenceDraft(admin,db.listReferenceSets(9001)[0].id);assert.equal(approved.status,'approved');assert.deepEqual(db.getReport(9001),legacy);
}));

test('critical thresholds are separate and do not manufacture a normal flag',()=>fixture(async(db,admin)=>{
 db.run("INSERT INTO parameter_critical_rules(parameter_id,sex,min_age,max_age,critical_high,unit) VALUES(9001,'any',0,150,9,'mg/L')");
 db.saveOrderResults(9001,[{parameterId:9001,value:10}]);assert.equal(db.getReport(9001).results[0].flag,'C');
 assert.equal(db.getReport(9001).results[0].refRange,'Reference interval not configured');
 const critical=db.all('SELECT * FROM parameter_critical_rules');approve(db,admin,[rule({high_value:12})]);assert.deepEqual(db.all('SELECT * FROM parameter_critical_rules'),critical);
 db.saveOrderResults(9001,[{parameterId:9001,value:8}]);assert.equal(db.getReport(9001).results[0].flag,'N');
}));

test('main-process sessions bind authorization and SQL cannot bypass interval operations',()=>fixture(async(db)=>{
 const {EventEmitter}=require('events');const {registerReferenceIpc,guardGenericSql}=require('../electron/referenceIpc.cjs');
 const handlers=new Map();await registerLicensedReferenceFixture({handle:(name,fn)=>handlers.set(name,fn)},db);
 const sender=Object.assign(new EventEmitter(),{id:77});const event={sender};
 const call=(name,...args)=>handlers.get('db:'+name)(event,...args);
 assert.throws(()=>call('saveReferenceDraft',9001,[rule()],null),/authorized/i);
 assert.ok(call('verifyUser','admin','synthetic-admin-password'));assert.equal(call('getSession').role,'admin');
 const draft=call('saveReferenceDraft',9001,[rule()],null);call('approveReferenceDraft',draft.id);
 call('logout');assert.equal(call('getSession'),null);assert.throws(()=>call('saveReferenceDraft',9001,[rule()],draft.id),/authorized/i);
 for(const sql of ["UPDATE reference_interval_sets SET status='approved'","DELETE FROM issued_reports","INSERT INTO users(id) VALUES(90)","CREATE TRIGGER malicious AFTER INSERT ON orders BEGIN DELETE FROM issued_reports; END","UPDATE orders SET status='complete'; DELETE FROM issued_reports"] )assert.throws(()=>guardGenericSql(sql,true));
 assert.throws(()=>guardGenericSql("DELETE FROM reference_interval_sets"));
 assert.throws(()=>guardGenericSql('SELECT * FROM orders'),/disabled/i);
 assert.throws(()=>guardGenericSql('UPDATE orders SET payment_status=? WHERE id=?',true),/disabled/i);
}));

test('frontend and backend reference matching and flags agree',async()=>{
 const backend=require('../electron/referenceIntervals.cjs').rules;
 const numeric=require('../electron/resultValidation.cjs').parseNumericResult;
 const pattern=require('../electron/numericResult.json').pattern;
 const source=fs.readFileSync(path.join(__dirname,'../src/utils/referenceIntervals.js'),'utf8').replace("import { parseNumericResult } from './resultValidation';",`const decimal=new RegExp(${JSON.stringify(pattern)});${numeric.toString()}`);
 const frontend=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 for(const lowInclusive of [true,false])for(const highInclusive of [true,false]){
  const r=rule({low_inclusive:lowInclusive,high_inclusive:highInclusive});
  for(const age of [0,30,150,null])for(const sex of ['male','female',null]){
   const patient={age,sex};const interval=backend.match([r],patient,'mg/L');const ref=frontend.selectReference(patient,[r],'mg/L');
   assert.equal(frontend.referenceText(ref),backend.format(interval));
   for(const value of [0,1,3,5,6,'',Infinity])assert.equal(frontend.referenceFlag(value,ref),backend.classify(value,interval));
  }
 }
 assert.equal(frontend.referenceText(frontend.selectReference({age:30,sex:'female'},[rule()],'mmol/L')),'Reference interval not configured');
});

test('editing a pending source records its previous value in the audit',()=>fixture(async(db,admin)=>{
 const source=db.saveReferenceDraft(admin,9001,[rule()],null);
 const edited=db.saveReferenceDraft(admin,9001,[rule({high_value:6})],null,source.id);
 const audit=db.get("SELECT * FROM audit_log WHERE table_name='reference_interval_sets' AND record_id=?",[edited.id]);
 assert.equal(JSON.parse(audit.old_value).rules[0].high_value,5);
 assert.equal(JSON.parse(audit.new_value).rules[0].high_value,6);
}));

test('failed first migration keeps original data and can be retried',()=>fixture(async(db,admin,reopen)=>{
 const original=db.all('SELECT id,code,unit FROM parameters');
 db.run('PRAGMA user_version=0');
 for(const table of ['reference_migrations','reference_interval_sets','parameter_critical_rules','issued_reports'])db.run(`DROP TABLE ${table}`);
 db.close();
 const rename=fs.renameSync;fs.renameSync=()=>{throw new Error('Synthetic migration write failure');};
 try{await assert.rejects(reopen(),/migration write failure/);}finally{fs.renameSync=rename;}
 db=await reopen();assert.deepEqual(db.all('SELECT id,code,unit FROM parameters'),original);
 assert.equal(db.get('SELECT COUNT(*) AS n FROM reference_migrations').n,3);
 assert.equal(db.get('SELECT name FROM patients WHERE id=9001').name,'Synthetic Patient');
}));
