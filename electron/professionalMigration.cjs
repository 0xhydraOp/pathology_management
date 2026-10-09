const VERSION=2;
const schema={
 professional_migrations:['version','applied_at'],
 registration_requests:['request_id','actor_id','request_hash','order_id','patient_id','created_at'],
 report_versions:['order_id','version','parent_version','payload','issued_by','issued_at','reason','changed_fields'],
 report_amendment_drafts:['id','order_id','base_version','revision','payload','reason','created_by','state','created_at','updated_at','final_version'],
 report_amendment_requests:['request_id','actor_id','request','draft_id'],
 billing_accounts:['order_id','charge_minor','legacy_paid_minor','history_incomplete','created_at'],
 billing_events:['id','order_id','kind','amount_minor','related_event_id','method','reason','actor_id','actor_username','created_at','business_date','request_id','request_binding'],
 backup_health:['id','reminder_enabled','reminder_days','last_external_at','last_external_kind','last_external_name','last_external_size','last_external_digest']
};
function upgrade(db){
 if(db.get('PRAGMA user_version').user_version>=VERSION)return;
 db.db.run(`CREATE TABLE professional_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
 CREATE TABLE registration_requests(request_id TEXT PRIMARY KEY,actor_id INTEGER NOT NULL,request_hash TEXT NOT NULL,order_id INTEGER NOT NULL REFERENCES orders(id),patient_id TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE report_versions(order_id INTEGER NOT NULL REFERENCES orders(id),version INTEGER NOT NULL,parent_version INTEGER,payload TEXT NOT NULL,issued_by TEXT NOT NULL,issued_at TEXT NOT NULL,reason TEXT NOT NULL,changed_fields TEXT NOT NULL,PRIMARY KEY(order_id,version));
 CREATE TABLE report_amendment_drafts(id TEXT PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),base_version INTEGER NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,reason TEXT NOT NULL,created_by INTEGER NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,final_version INTEGER);
 CREATE UNIQUE INDEX one_report_amendment_draft ON report_amendment_drafts(order_id) WHERE state='draft';
 CREATE TABLE report_amendment_requests(request_id TEXT PRIMARY KEY,actor_id INTEGER NOT NULL,request TEXT NOT NULL,draft_id TEXT NOT NULL REFERENCES report_amendment_drafts(id));
 CREATE TABLE billing_accounts(order_id INTEGER PRIMARY KEY REFERENCES orders(id),charge_minor INTEGER NOT NULL,legacy_paid_minor INTEGER NOT NULL DEFAULT 0,history_incomplete INTEGER NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE billing_events(id TEXT PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),kind TEXT NOT NULL,amount_minor INTEGER NOT NULL,related_event_id TEXT REFERENCES billing_events(id),method TEXT,reason TEXT NOT NULL,actor_id INTEGER NOT NULL,actor_username TEXT NOT NULL,created_at TEXT NOT NULL,business_date TEXT NOT NULL,request_id TEXT NOT NULL UNIQUE,request_binding TEXT NOT NULL);
 CREATE INDEX billing_events_day ON billing_events(business_date);
 CREATE TABLE backup_health(id INTEGER PRIMARY KEY CHECK(id=1),reminder_enabled INTEGER NOT NULL,reminder_days INTEGER NOT NULL,last_external_at TEXT,last_external_kind TEXT,last_external_name TEXT,last_external_size INTEGER,last_external_digest TEXT);
 INSERT INTO backup_health(id,reminder_enabled,reminder_days) VALUES(1,1,7);
 ALTER TABLE order_results ADD COLUMN calculation_review TEXT;
 ALTER TABLE order_results ADD COLUMN calculation_snapshot TEXT;
 ALTER TABLE report_print_log ADD COLUMN report_version INTEGER NOT NULL DEFAULT 1;
 INSERT INTO report_versions(order_id,version,parent_version,payload,issued_by,issued_at,reason,changed_fields) SELECT order_id,1,NULL,payload,issued_by,issued_at,'','[]' FROM issued_reports;`);
 for(const order of db.all('SELECT id FROM orders'))require('./billingLedger.cjs').initializeAccount(db,order.id,{legacy:true});
 db.db.run('INSERT INTO professional_migrations VALUES(?,?)',[1,new Date().toISOString()]);
 db.db.run('PRAGMA user_version=2');
}
// Supported old portable backups are normalized in memory, before active data
// replacement. No source file, clinical value or existing snapshot is rewritten.
function normalize(SQL,bytes){
 const raw=new SQL.Database(Buffer.from(bytes));
 try{
  const get=(sql,args=[])=>{const st=raw.prepare(sql);try{st.bind(args);return st.step()?st.getAsObject():null;}finally{st.free();}};
  const all=(sql,args=[])=>{const st=raw.prepare(sql),rows=[];try{st.bind(args);while(st.step())rows.push(st.getAsObject());return rows;}finally{st.free();}};
  if(get('PRAGMA user_version').user_version===1){raw.run('BEGIN IMMEDIATE');try{upgrade({db:raw,get,all});raw.run('COMMIT');}catch(e){raw.run('ROLLBACK');throw e;}}
  return Buffer.from(raw.export());
 }finally{raw.close();}
}
module.exports={VERSION,schema,upgrade,normalize};
