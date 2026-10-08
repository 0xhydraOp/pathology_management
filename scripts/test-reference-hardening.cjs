const {registerLicensedReferenceFixture}=require('./registerLicensedFixture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const Database=require('../electron/database');
const {EventEmitter}=require('events');
const {registerReferenceIpc}=require('../electron/referenceIpc.cjs');
const rule=extra=>({sex:'any',min_age:0,max_age:150,min_age_inclusive:true,max_age_inclusive:true,low_value:1,high_value:5,low_inclusive:true,high_inclusive:true,unit:'mg/L',reference_text:'',...extra});
async function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-reference-hardening-'));
 let db=new Database(dir,{migrateLegacy:false});
 const admin={id:1};
 try{
  await db.init();if(db.credentialState().setupRequired)db.setupAdmin('admin','synthetic-admin-password');
  db.run("INSERT INTO parameters(id,code,name,type,unit,section) VALUES(9001,'SYNHARD','Synthetic hardening','numeric','mg/L','Synthetic')");
  db.run("INSERT INTO patients(id,patient_id,name,age,sex) VALUES(9001,'SYNHARD','Synthetic Patient',30,'female')");
  db.run("INSERT INTO orders(id,patient_id,status) VALUES(9001,9001,'pending')");
  db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,9001)');
  db.ensureOrderAccessCode(9001);
  const draft=db.saveReferenceDraft(admin,9001,[rule()],null);db.approveReferenceDraft(admin,draft.id);
  const reopen=async()=>{db.close();db=new Database(dir,{migrateLegacy:false});await db.init();return db;};
  await fn(db,admin,reopen,dir);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('issuance reconciles flags, completion, issued marker and snapshots in one operation',()=>fixture(async(db,admin,reopen)=>{
 db.saveOrderResults(9001,[{parameterId:9001,value:3}]);
 const active=db.listReferenceSets(9001).find(s=>s.status==='approved');
 const draft=db.saveReferenceDraft(admin,9001,[rule({high_value:2})],active.id);db.approveReferenceDraft(admin,draft.id);
 const report=db.issueReport(admin,9001);
 assert.equal(report.results[0].flag,'H');
 assert.equal(db.get('SELECT flag FROM order_results WHERE order_id=9001').flag,'H');
 assert.equal(db.get('SELECT * FROM orders WHERE id=9001').report_status,'issued');
 assert.equal(db.get('SELECT status FROM orders WHERE id=9001').status,'complete');
 db=await reopen();assert.deepEqual(db.getReport(9001),report);
}));
test('malformed, non-finite and missing ordered results cannot be issued',()=>fixture(async(db,admin)=>{
 for(const value of ['12abc',Infinity,null]){
  db.run('INSERT OR REPLACE INTO order_results(order_id,parameter_id,result_value) VALUES(9001,9001,?)',[value]);
  assert.throws(()=>db.issueReport(admin,9001),/invalid|missing|finite/i);
  assert.equal(db.get('SELECT * FROM issued_reports WHERE order_id=9001'),null);
 }
 db.run('DELETE FROM order_results WHERE order_id=9001');
 assert.throws(()=>db.issueReport(admin,9001),/missing|saved results/i);
}));
test('SQL and disk failures leave no partially issued report, including after reopen',()=>fixture(async(db,admin,reopen)=>{
 db.saveOrderResults(9001,[{parameterId:9001,value:3}]);
 const before=db.get('SELECT * FROM orders WHERE id=9001'),result=db.get('SELECT * FROM order_results WHERE order_id=9001');
 db.run("CREATE TRIGGER synthetic_issue_failure BEFORE INSERT ON issued_reports BEGIN SELECT RAISE(ABORT,'Synthetic issue failure'); END");
 assert.throws(()=>db.issueReport(admin,9001),/Synthetic issue failure/);
 assert.deepEqual(db.get('SELECT * FROM orders WHERE id=9001'),before);
 assert.deepEqual(db.get('SELECT * FROM order_results WHERE order_id=9001'),result);
 db.run('DROP TRIGGER synthetic_issue_failure');
 const rename=fs.renameSync;fs.renameSync=()=>{throw new Error('Synthetic issuance disk failure');};
 try{assert.throws(()=>db.issueReport(admin,9001),/issuance disk failure/);}finally{fs.renameSync=rename;}
 assert.equal(db.get('SELECT * FROM issued_reports WHERE order_id=9001'),null);
 db=await reopen();assert.deepEqual(db.get('SELECT * FROM orders WHERE id=9001'),before);assert.deepEqual(db.get('SELECT * FROM order_results WHERE order_id=9001'),result);
}));
test('issued presentation survives results, interval, unit, name and lab-setting edits',()=>fixture(async(db,admin,reopen)=>{
 db.run("UPDATE lab SET pathologist_name='Synthetic original reader',clinical_correlation_text='Synthetic original footer' WHERE id=1");
 db.saveOrderResults(9001,[{parameterId:9001,value:3}]);const issued=db.issueReport(admin,9001);
 assert.equal(issued.lab_config.pathologist_name,'Synthetic original reader');assert.ok(issued.report_date);
 db.run("UPDATE order_results SET result_value=99,flag='C' WHERE order_id=9001");
 db.run("UPDATE parameters SET name='Synthetic changed name',unit='other' WHERE id=9001");
 db.run("UPDATE lab SET pathologist_name='Synthetic changed reader',clinical_correlation_text='Synthetic changed footer' WHERE id=1");
 db=await reopen();assert.deepEqual(db.getReport(9001),issued);assert.deepEqual(db.issueReport(admin,9001),issued);
}));
test('backend catalogue reload rejects before deletion and approval survives restart',()=>fixture(async(db,admin,reopen)=>{
 const parameters=db.all('SELECT * FROM parameters'),versions=db.listReferenceSets(9001);
 assert.throws(()=>db.loadCatalogueFromJson(),/catalogue|identit|initializ/i);
 assert.deepEqual(db.all('SELECT * FROM parameters'),parameters);
 db=await reopen();assert.deepEqual(db.listReferenceSets(9001),versions);
 assert.throws(()=>db.loadCatalogueFromJson(),/catalogue|identit|initializ/i);
}));
test('failed startup keeps exact original file and a readable pre-mutation backup',()=>fixture(async(db,admin,reopen,dir)=>{
 const catalogue=db.get("SELECT id FROM parameters WHERE code='HB'");
 db.run('UPDATE parameters SET name=? WHERE id=?',['Synthetic local name',catalogue.id]);
 db.run('PRAGMA user_version=0');
 for(const table of ['reference_migrations','reference_interval_sets','parameter_critical_rules','issued_reports'])db.run(`DROP TABLE ${table}`);
 db.close();const original=fs.readFileSync(path.join(dir,'lab.db'));
 const rename=fs.renameSync;fs.renameSync=()=>{throw new Error('Synthetic startup replacement failure');};
 try{await assert.rejects(reopen(),/startup replacement failure/);}finally{fs.renameSync=rename;}
 assert.deepEqual(fs.readFileSync(path.join(dir,'lab.db')),original);
 const backups=fs.readdirSync(path.join(dir,'backups')).map(name=>fs.readFileSync(path.join(dir,'backups',name)));
 const bytes=backups.find(data=>data.equals(original));assert.ok(bytes,'exact original backup exists');
 const backup=new db.SQL.Database(bytes);
 try{assert.equal(backup.exec("SELECT name FROM parameters WHERE code='HB'")[0].values[0][0],'Synthetic local name');assert.equal(backup.exec('PRAGMA integrity_check')[0].values[0][0],'ok');}finally{backup.close();}
 db=await reopen();assert.equal(db.get("SELECT name FROM parameters WHERE code='HB'").name,'Synthetic local name');
 const stamps=db.all('SELECT * FROM reference_migrations');db=await reopen();assert.deepEqual(db.all('SELECT * FROM reference_migrations'),stamps);
}));
test('rounded infant ages and fractional boundaries cannot produce automatic flags',()=>fixture(async(db,admin)=>{
 let active=db.listReferenceSets(9001).find(s=>s.status==='approved');
 let draft=db.saveReferenceDraft(admin,9001,[rule({max_age:0.25})],active.id);db.approveReferenceDraft(admin,draft.id);
 db.run('UPDATE patients SET age=0 WHERE id=9001');db.saveOrderResults(9001,[{parameterId:9001,value:3}]);
 let report=db.getReport(9001);assert.equal(report.results[0].flag,'');assert.match(report.results[0].review_message,/precise age/i);
 active=db.listReferenceSets(9001).find(s=>s.status==='approved');draft=db.saveReferenceDraft(admin,9001,[rule({min_age:1,max_age:1.5})],active.id);db.approveReferenceDraft(admin,draft.id);
 db.run('UPDATE patients SET age=1 WHERE id=9001');report=db.getReport(9001);assert.equal(report.results[0].flag,'');assert.match(report.results[0].review_message,/precise age/i);
 const issued=db.issueReport(admin,9001);assert.equal(issued.results[0].flag,'');assert.match(issued.results[0].review_message,/precise age/i);
}));
test('one-sided limits, unknown sex, incompatible units and ambiguity fail closed',()=>fixture(async(db,admin)=>{
 const rules=require('../electron/referenceIntervals.cjs').rules;
 for(const [r,value,expected] of [[rule({high_value:null,low_inclusive:false}),1,'L'],[rule({high_value:null}),1,'N'],[rule({low_value:null,high_inclusive:false}),5,'H']])assert.equal(rules.classify(value,r),expected);
 assert.equal(rules.match([rule({sex:'female'})],{age:30,sex:null},'mg/L'),null);
 assert.ok(rules.match([rule()],{age:30,sex:null},'mg/L'));
 assert.equal(rules.match([rule()],{age:30,sex:'female'},'mmol/L'),null);
 assert.equal(rules.match([rule(),rule()],{age:30,sex:'female'},'mg/L'),null);
}));
test('critical unit mismatch and conflicting thresholds do not select the first row',()=>fixture(async(db)=>{
 db.run("INSERT INTO parameter_critical_rules(parameter_id,sex,min_age,max_age,critical_high,unit) VALUES(9001,'any',0,150,9,'mg/L')");
 assert.equal(db.referenceFor(9001,{age:30,sex:'female'},'mmol/L').critical,null);
 db.run("INSERT INTO parameter_critical_rules(parameter_id,sex,min_age,max_age,critical_high,unit) VALUES(9001,'female',0,150,20,'mg/L')");
 assert.equal(db.referenceFor(9001,{age:30,sex:'female'},'mg/L').critical,null);
 db.run("DELETE FROM parameter_critical_rules WHERE parameter_id=9001 AND critical_high=20");
 db.run("INSERT INTO parameter_critical_rules(parameter_id,sex,min_age,max_age,critical_high,unit) VALUES(9001,'female',0,150,9,'mg/L')");
 assert.equal(db.referenceFor(9001,{age:30,sex:'female'},'mg/L').critical.critical_high,9);
 db.run('DELETE FROM parameter_critical_rules WHERE parameter_id=9001');
 db.run("INSERT INTO parameter_critical_rules(parameter_id,sex,min_age,max_age,critical_high,unit) VALUES(9001,NULL,0,150,9,'mg/L')");
 assert.equal(db.referenceFor(9001,{age:30,sex:null},'mg/L').critical,null);
}));
test('direct IPC calls require a session and audit the authenticated actor',()=>fixture(async(db)=>{
 const handlers=new Map();await registerLicensedReferenceFixture({handle:(name,fn)=>handlers.set(name,fn)},db);
 const sender=Object.assign(new EventEmitter(),{id:91}),event={sender};const invoke=(name,...args)=>handlers.get('db:'+name)(event,...args);
 assert.throws(()=>invoke('approveReferenceDraft',1),/authorized/i);assert.throws(()=>invoke('issueReport',9001),/authorized/i);
 invoke('verifyUser','admin','synthetic-admin-password');const active=db.listReferenceSets(9001).find(s=>s.status==='approved');
 const draft=invoke('saveReferenceDraft',9001,[rule({high_value:6})],active.id);invoke('approveReferenceDraft',draft.id);
 const audit=db.get("SELECT changed_by FROM audit_log WHERE record_id=? ORDER BY id DESC LIMIT 1",[draft.id]);assert.equal(audit.changed_by,'admin');
 invoke('verifyUser','admin','invalid');assert.equal(invoke('getSession'),null);assert.throws(()=>invoke('approveReferenceDraft',draft.id),/authorized/i);
 assert.throws(()=>invoke('reloadCatalogue'),/disabled|identit/i);
 db.run("INSERT INTO users(id,username,password_hash,role) SELECT 9001,'synthetic-staff',password_hash,'staff' FROM users WHERE id=1");
 assert.equal(invoke('verifyUser','synthetic-staff','synthetic-admin-password').role,'staff');
 assert.throws(()=>invoke('saveReferenceDraft',9001,[rule()],draft.id),/admin/i);
 assert.throws(()=>invoke('approveReferenceDraft',draft.id),/admin/i);
 assert.throws(()=>invoke('reloadCatalogue'),/disabled|identit/i);
 const {guardGenericSql}=require('../electron/referenceIpc.cjs');
 assert.throws(()=>guardGenericSql("UPDATE orders SET report_status='issued' WHERE id=9001",true),/issu|protected/i);
 assert.throws(()=>guardGenericSql("INSERT INTO orders VALUES(9002,9001,NULL,NULL,NULL,'complete',NULL,NULL,NULL,NULL,'issued')",true),/column|issu|protected/i);
 assert.throws(()=>guardGenericSql('INSERT OR REPLACE INTO orders(id,patient_id) VALUES(9001,9001)',true),/issu|protected/i);
}));

test('missing catalogue identities cannot be silently omitted during issuance',()=>fixture(async(db,admin)=>{
 db.saveOrderResults(9001,[{parameterId:9001,value:3}]);
 db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,999999)');
 const order=db.get('SELECT * FROM orders WHERE id=9001');
 assert.throws(()=>db.issueReport(admin,9001),/invalid|catalogue|identity/i);
 assert.equal(db.get('SELECT * FROM issued_reports WHERE order_id=9001'),null);
 assert.deepEqual(db.get('SELECT * FROM orders WHERE id=9001'),order);
}));

test('version-1 report upgrade preserves old content and labels unavailable historical lab presentation',()=>fixture(async(db,admin,reopen)=>{
 db.saveOrderResults(9001,[{parameterId:9001,value:3}]);const original=db.issueReport(admin,9001);
 const old={...original};delete old.lab_config;delete old.report_date;delete old.report_printed_by;delete old.presentation_provenance;
 db.run('UPDATE issued_reports SET payload=? WHERE order_id=9001',[JSON.stringify(old)]);
 db.run('PRAGMA user_version=0');db.run('DELETE FROM reference_migrations WHERE version=2');
 db.run("UPDATE lab SET pathologist_name='Synthetic upgrade reader' WHERE id=1");
 db=await reopen();const upgraded=db.getReport(9001);
 assert.deepEqual(upgraded.results,original.results);assert.equal(upgraded.presentation_provenance,'captured-at-upgrade');
 assert.equal(upgraded.lab_config.pathologist_name,'Synthetic upgrade reader');
 db.run("UPDATE lab SET pathologist_name='Synthetic later reader' WHERE id=1");
 db=await reopen();assert.deepEqual(db.getReport(9001),upgraded);
}));

test('backup failure stops startup before touching the original file',()=>fixture(async(db,admin,reopen,dir)=>{
 db.run('PRAGMA user_version=0');db.run('DELETE FROM reference_migrations WHERE version=2');db.close();const original=fs.readFileSync(path.join(dir,'lab.db'));
 const write=fs.writeFileSync;fs.writeFileSync=(target,...args)=>{if(typeof target==='number')throw new Error('Synthetic backup write failure');return write(target,...args);};
 try{await assert.rejects(reopen(),/backup write failure/);}finally{fs.writeFileSync=write;}
 assert.deepEqual(fs.readFileSync(path.join(dir,'lab.db')),original);
 db=await reopen();assert.equal(db.get('SELECT version FROM reference_migrations WHERE version=2').version,2);
}));

test('infant review and critical ambiguity/unit flags agree between frontend and backend',()=>fixture(async(db)=>{
 const numeric=require('../electron/resultValidation.cjs').parseNumericResult;
 const pattern=require('../electron/numericResult.json').pattern;
 const source=fs.readFileSync(path.join(__dirname,'../src/utils/referenceIntervals.js'),'utf8').replace("import { parseNumericResult } from './resultValidation';",`const decimal=new RegExp(${JSON.stringify(pattern)});${numeric.toString()}`);
 const frontend=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 db.run("INSERT INTO parameter_critical_rules(parameter_id,sex,min_age,max_age,critical_high,unit) VALUES(9001,'any',0,150,9,'mg/L')");
 const cases=[{age:0,sex:'female'},{age:1,sex:'female'},{age:30,sex:null},{age:null,sex:null}];
 for(const patient of cases)for(const unit of ['mg/L','mmol/L']) {
  const backend=db.referenceFor(9001,patient,unit);const selected=frontend.selectReference(patient,frontend.referenceRows(db.getReferenceContext()).filter(r=>r.parameter_id===9001),unit);
  assert.equal(frontend.referenceText(selected),backend.refRange);assert.equal(selected.reviewMessage,backend.reviewMessage);
  assert.equal(frontend.referenceFlag(10,selected),require('../electron/referenceIntervals.cjs').rules.classify(10,backend.interval,backend.critical));
 }
}));
