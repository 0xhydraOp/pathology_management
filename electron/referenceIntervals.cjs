const fs = require('fs');
const crypto = require('crypto');
const {parseNumericResult} = require('./resultValidation.cjs');
const MISSING = 'Reference interval not configured';
const PRECISE_AGE = 'Precise age required for reference interval review; automatic flags withheld';
function within(age,r) {
  return Number.isFinite(age) && (age>r.min_age || (age===r.min_age && r.min_age_inclusive)) && (age<r.max_age || (age===r.max_age && r.max_age_inclusive));
}
function demographicMatch(rules,patient,unit,critical=false) {
  const age=patient?.age;
  if (age==null || !Number.isFinite(age)) return {rule:null,message:'Age is missing or invalid; review demographics'};
  if (!Number.isInteger(age) || age<1) return {rule:null,message:PRECISE_AGE};
  // Registration stores completed years: the true age may be anywhere in [age, age+1).
  const candidates=rules.filter(r=>r.unit===unit && (r.sex==='any' || (['male','female'].includes(patient.sex) && r.sex===patient.sex)) &&
    r.min_age<age+1 && (r.max_age>age || (r.max_age===age && (critical || r.max_age_inclusive))));
  const covers=r=>(r.min_age<age || (r.min_age===age && (critical || r.min_age_inclusive))) && r.max_age>=age+1;
  if (!candidates.length) return {rule:null,message:''};
  if (critical) {
    const keys=new Set(candidates.map(r=>JSON.stringify([r.critical_low,r.critical_high])));
    if (keys.size!==1) return {rule:null,message:'Conflicting critical rules; manual review required'};
    const whole=candidates.find(covers);
    return whole?{rule:whole,message:''}:{rule:null,message:PRECISE_AGE};
  }
  if (candidates.length!==1) return {rule:null,message:'Ambiguous reference rules; manual review required'};
  return covers(candidates[0])?{rule:candidates[0],message:''}:{rule:null,message:PRECISE_AGE};
}
function match(rules,patient,unit) {
  return demographicMatch(rules,patient,unit).rule;
}
function format(r) {
  if(!r)return MISSING;
  if(r.reference_text)return r.reference_text;
  if(r.low_value!=null && r.high_value!=null)return `${r.low_inclusive?'[':'('}${r.low_value} – ${r.high_value}${r.high_inclusive?']':')'}`;
  if(r.low_value!=null)return `${r.low_inclusive?'≥':'>'} ${r.low_value}`;
  return `${r.high_inclusive?'≤':'<'} ${r.high_value}`;
}
function classify(value,r,critical) {
  let n;try{n=parseNumericResult(value);}catch{return '';}
  if(n==null)return '';
  if(critical && ((critical.critical_low!=null && n<critical.critical_low) || (critical.critical_high!=null && n>critical.critical_high)))return 'C';
  if(!r || r.reference_text)return '';
  if(r.low_value!=null && (n<r.low_value || (n===r.low_value && !r.low_inclusive)))return 'L';
  if(r.high_value!=null && (n>r.high_value || (n===r.high_value && !r.high_inclusive)))return 'H';
  return 'N';
}
function validate(rules,parameter) {
  if(!Array.isArray(rules) || rules.length>100)throw new Error('Provide at most 100 interval rules');
  const clean=rules.map(r=> {
    if(!r || !['any','male','female'].includes(r.sex))throw new Error('Select a valid sex');
    const keys=['sex','min_age','max_age','min_age_inclusive','max_age_inclusive','low_value','high_value','low_inclusive','high_inclusive','unit','reference_text'];
    if(Object.keys(r).some(key=>!keys.includes(key)))throw new Error('Only reference-interval fields are allowed; critical thresholds and diagnostic cutoffs are separate');
    const ageMin=parseNumericResult(r.min_age),ageMax=parseNumericResult(r.max_age);
    if(ageMin==null || ageMax==null || ageMin<0 || ageMax<ageMin)throw new Error('Age limits are required and must not be reversed');
    for(const key of ['min_age_inclusive','max_age_inclusive','low_inclusive','high_inclusive'])if(typeof r[key]!=='boolean')throw new Error('Boundary inclusivity is required');
    if(ageMin===ageMax && (!r.min_age_inclusive || !r.max_age_inclusive))throw new Error('Empty age interval');
    if(typeof r.unit!=='string' || r.unit!==parameter.unit)throw new Error(`Incompatible units: use ${parameter.unit || '(unitless)'}; conversions are not supported`);
    const low=parseNumericResult(r.low_value),high=parseNumericResult(r.high_value);
    const text=typeof r.reference_text==='string'?r.reference_text.trim():'';
    if(text.length>1000)throw new Error('Reference text is too long');
    if(text && (low!=null || high!=null))throw new Error('Use numeric limits or qualitative reference text, not both');
    if(!text && low==null && high==null)throw new Error('Provide numeric limits or reference text');
    if(parameter.type==='text' && !text)throw new Error('Text parameters require qualitative reference text');
    if(low!=null && high!=null && (low>high || (low===high && (!r.low_inclusive || !r.high_inclusive))))throw new Error('Reversed or empty numeric limits');
    return {sex:r.sex,min_age:ageMin,max_age:ageMax,min_age_inclusive:r.min_age_inclusive,max_age_inclusive:r.max_age_inclusive,low_value:low,high_value:high,low_inclusive:r.low_inclusive,high_inclusive:r.high_inclusive,unit:r.unit,reference_text:text};
  });
  for(let i=0;i<clean.length;i++)for(let j=i+1;j<clean.length;j++) {
    const a=clean[i],b=clean[j];
    const sex=a.sex==='any' || b.sex==='any' || a.sex===b.sex;
    const lo=Math.max(a.min_age,b.min_age),hi=Math.min(a.max_age,b.max_age);
    if(sex && (lo<hi || (lo===hi && within(lo,a) && within(lo,b))))throw new Error(`Overlapping age/sex rules ${i+1} and ${j+1}`);
  }
  return clean;
}
module.exports = {
  _referenceAtomic(fn) {
    if(this._restoring)throw new Error('Database recovery is in progress');
    if(this._initializing)return fn();
    const before=this.db.export(),temporary=`${this.dbPath}.${crypto.randomUUID()}.tmp`;
    try {
      this.db.run('BEGIN');const result=fn();this.db.run('COMMIT');
      require('./recovery.cjs').replace(this.dbPath,Buffer.from(this.db.export()));return result;
    }catch(e){try{this.db.run('ROLLBACK');}catch{}this.db.close();this.db=new this.SQL.Database(before);throw e;}
    finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  },
  _referenceActor(actor,admin=false) {
    const user=actor && this.get('SELECT id,username,role,display_name AS displayName FROM users WHERE id=?',[actor.id]);
    if(!user || !['admin','staff'].includes(user.role) || (admin && user.role!=='admin'))throw new Error(admin?'Only authorized admin users may edit or approve reference intervals':'An authorized user is required');
    return user;
  },
  migrateReferenceIntervals() {
    this._referenceAtomic(()=> {
      this.db.run(`CREATE TABLE IF NOT EXISTS reference_interval_sets(id INTEGER PRIMARY KEY AUTOINCREMENT,parameter_id INTEGER NOT NULL,previous_id INTEGER,rules TEXT NOT NULL,status TEXT NOT NULL,edited_by TEXT NOT NULL,edited_at TEXT NOT NULL,approved_by TEXT,approved_at TEXT);
        CREATE UNIQUE INDEX IF NOT EXISTS one_approved_reference ON reference_interval_sets(parameter_id) WHERE status='approved';
        CREATE TABLE IF NOT EXISTS parameter_critical_rules(id INTEGER PRIMARY KEY AUTOINCREMENT,parameter_id INTEGER,sex TEXT,min_age REAL,max_age REAL,critical_low REAL,critical_high REAL);
        CREATE TABLE IF NOT EXISTS issued_reports(order_id INTEGER PRIMARY KEY,payload TEXT NOT NULL,issued_by TEXT NOT NULL,issued_at TEXT NOT NULL,provenance TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reference_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);`);
      if (!this.all('PRAGMA table_info(parameter_critical_rules)').some(c => c.name === 'unit')) this.db.run('ALTER TABLE parameter_critical_rules ADD COLUMN unit TEXT');
      if (!this.all('PRAGMA table_info(orders)').some(c => c.name === 'report_status')) this.db.run("ALTER TABLE orders ADD COLUMN report_status TEXT DEFAULT 'draft'");
      if (!this.get('SELECT version FROM reference_migrations WHERE version=1')) {
      const now=new Date().toISOString();
      const legacy=this.all('SELECT r.*,p.unit FROM parameter_ranges r JOIN parameters p ON p.id=r.parameter_id');
      for(const r of legacy)if(r.critical_low!=null || r.critical_high!=null)this.db.run('INSERT INTO parameter_critical_rules(parameter_id,sex,min_age,max_age,critical_low,critical_high) VALUES(?,?,?,?,?,?)',[r.parameter_id,r.sex,r.min_age,r.max_age,r.critical_low,r.critical_high]);
      for(const p of this.all('SELECT id,unit FROM parameters')) {
        const rules=legacy.filter(r=>r.parameter_id===p.id && (r.low_value!=null || r.high_value!=null)).map(r=>({sex:r.sex,min_age:r.min_age,max_age:r.max_age,min_age_inclusive:true,max_age_inclusive:true,low_value:r.low_value,high_value:r.high_value,low_inclusive:true,high_inclusive:true,unit:p.unit || '',reference_text:''}));
        if(rules.length)this.db.run('INSERT INTO reference_interval_sets(parameter_id,previous_id,rules,status,edited_by,edited_at) VALUES(?,NULL,?,?,?,?)',[p.id,JSON.stringify(rules),'pending','legacy migration',now]);
      }
      for(const o of this.all('SELECT DISTINCT order_id FROM report_print_log')) {
        const report=this._reportPreview(o.order_id,true);
        if(report)this.db.run('INSERT OR IGNORE INTO issued_reports(order_id,payload,issued_by,issued_at,provenance) VALUES(?,?,?,?,?)',[o.order_id,JSON.stringify({...report,issued:true,issued_at:now,provenance:'legacy-at-upgrade'}),'legacy migration',now,'legacy-at-upgrade']);
      }
      this.db.run('INSERT INTO reference_migrations VALUES(1,?)',[now]);
      }
      if (!this.get('SELECT version FROM reference_migrations WHERE version=2')) {
        // Retain source-unit provenance without altering any threshold or reference value.
        this.db.run("UPDATE parameter_critical_rules SET unit=(SELECT COALESCE(unit,'') FROM parameters p WHERE p.id=parameter_id) WHERE unit IS NULL");
        const labConfig = this.get('SELECT * FROM lab WHERE id=1');
        for (const row of this.all('SELECT * FROM issued_reports')) {
          const report = JSON.parse(row.payload);
          if (!report.lab_config) {
            report.lab_config = labConfig;
            report.report_date = report.issued_at || row.issued_at;
            report.report_printed_by = report.issued_by || row.issued_by;
            report.presentation_provenance = 'captured-at-upgrade';
          }
          report.report_status = 'issued';
          this.db.run('UPDATE issued_reports SET payload=? WHERE order_id=?',[JSON.stringify(report),row.order_id]);
          this.db.run("UPDATE orders SET report_status='issued' WHERE id=?",[row.order_id]);
        }
        this.db.run('INSERT INTO reference_migrations VALUES(2,?)',[new Date().toISOString()]);
      }
      if(!this.get('SELECT version FROM reference_migrations WHERE version=3')) {
        this.db.run('CREATE TABLE IF NOT EXISTS lab_print_profile(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)');
        this.db.run('INSERT INTO reference_migrations VALUES(3,?)',[new Date().toISOString()]);
      }
    });
  },
  listReferenceSets(parameterId) {
    return this.all('SELECT * FROM reference_interval_sets WHERE parameter_id=? ORDER BY id DESC',[parameterId]).map(s=>({...s,rules:JSON.parse(s.rules)}));
  },
  _auditReference(id,action,oldValue,newValue,user) {
    this.db.run('INSERT INTO audit_log(table_name,record_id,action,old_value,new_value,changed_by) VALUES(?,?,?,?,?,?)',['reference_interval_sets',id,action,oldValue?JSON.stringify(oldValue):null,JSON.stringify(newValue),user.username]);
  },
  saveReferenceDraft(actor,parameterId,rules,previousId,sourceId=null) {
    const user=this._referenceActor(actor,true);
    const p=this.get('SELECT * FROM parameters WHERE id=?',[parameterId]);if(!p)throw new Error('Parameter not found');
    const normalized=validate(rules,{...p,unit:p.unit || ''});
    const active=this.listReferenceSets(parameterId).find(s=>s.status==='approved');
    const source=sourceId==null?active:this.listReferenceSets(parameterId).find(s=>s.id===sourceId);
    if(sourceId!=null && !source)throw new Error('Source version does not belong to this parameter');
    if((active?.id ?? null)!==(previousId ?? null))throw new Error('Approved interval changed; reload before editing');
    return this._referenceAtomic(()=> {
      this.db.run('INSERT INTO reference_interval_sets(parameter_id,previous_id,rules,status,edited_by,edited_at) VALUES(?,?,?,?,?,?)',[parameterId,previousId ?? null,JSON.stringify(normalized),'pending',user.username,new Date().toISOString()]);
      const id=this.get('SELECT last_insert_rowid() AS id').id;
      const draft=this.listReferenceSets(parameterId).find(s=>s.id===id);
      this._auditReference(id,'draft',source,draft,user);return draft;
    });
  },
  approveReferenceDraft(actor,id) {
    const user=this._referenceActor(actor,true);
    const row=this.get('SELECT * FROM reference_interval_sets WHERE id=?',[id]);if(!row || row.status!=='pending')throw new Error('Pending draft not found');
    const draft={...row,rules:JSON.parse(row.rules)};
    const p=this.get('SELECT * FROM parameters WHERE id=?',[draft.parameter_id]);validate(draft.rules,{...p,unit:p.unit || ''});
    const active=this.listReferenceSets(p.id).find(s=>s.status==='approved');
    if((active?.id ?? null)!==draft.previous_id)throw new Error('Stale draft: approved interval changed');
    return this._referenceAtomic(()=> {
      if(active){this.db.run("UPDATE reference_interval_sets SET status='superseded' WHERE id=?",[active.id]);this._auditReference(active.id,'supersede',active,{...active,status:'superseded'},user);}
      this.db.run("UPDATE reference_interval_sets SET status='approved',approved_by=?,approved_at=? WHERE id=?",[user.username,new Date().toISOString(),id]);
      const approved=this.listReferenceSets(p.id).find(s=>s.id===id);this._auditReference(id,'approve',draft,approved,user);return approved;
    });
  },
  getReferenceContext() {
    return { intervals:this.all("SELECT parameter_id,id,rules FROM reference_interval_sets WHERE status='approved'").flatMap(s=>JSON.parse(s.rules).map(r=>({...r,parameter_id:s.parameter_id,version_id:s.id}))),critical:this.all('SELECT * FROM parameter_critical_rules') };
  },
  referenceFor(parameterId,patient,unit) {
    const context=this.getReferenceContext();
    const selected=demographicMatch(context.intervals.filter(r=>r.parameter_id===parameterId),patient,unit);
    const critical=demographicMatch(context.critical.filter(r=>r.parameter_id===parameterId),patient,unit,true);
    return {interval:selected.rule,critical:critical.rule,refRange:format(selected.rule),unit,reviewMessage:[selected.message,critical.message].filter((message,i,all)=>message && all.indexOf(message)===i).join('; ')};
  },
  _reportPreview(orderId,legacy=false) {
    const order=this.get('SELECT o.*,p.patient_id AS pt_id,p.name AS patient_name,p.age,p.sex,p.phone,p.address,p.referred_by FROM orders o JOIN patients p ON p.id=o.patient_id WHERE o.id=?',[orderId]);
    if(!order)return null;
    const results=this.all(`SELECT p.id AS parameter_id,p.code,p.name AS test_name,p.unit,p.decimal_places,p.section,r.result_value,r.raw_result_value,r.result_text,r.flag FROM order_results r JOIN parameters p ON p.id=r.parameter_id WHERE r.order_id=? ${legacy?'':'AND EXISTS(SELECT 1 FROM order_tests t WHERE t.order_id=r.order_id AND t.parameter_id=r.parameter_id)'} ORDER BY p.section,p.display_order`,[orderId]).map(r=> {
      if(legacy) {
        const old=this.all('SELECT * FROM parameter_ranges WHERE parameter_id=?',[r.parameter_id]).filter(x=>(x.sex==='any'||x.sex===order.sex) && Number.isFinite(order.age) && order.age>=(x.min_age ?? 0) && order.age<=(x.max_age ?? 150)).sort((a,b)=>(a.sex==='any')-(b.sex==='any'))[0];
        const interval=old && (old.low_value!=null || old.high_value!=null)?{...old,low_inclusive:true,high_inclusive:true,unit:r.unit}:null;
        return {...r,refRange:format(interval),reference_interval:interval};
      }
      const ref=this.referenceFor(r.parameter_id,order,r.unit || '');
      return {...r,refRange:ref.refRange,reference_interval:ref.interval,review_message:ref.reviewMessage,flag:classify(r.raw_result_value ?? r.result_value,ref.interval,ref.critical)};
    });
    return {...order,results,issued:false};
  },
  getReport(orderId) {
    const issued=this.get('SELECT payload FROM issued_reports WHERE order_id=?',[orderId]);
    return issued?JSON.parse(issued.payload):this._reportPreview(orderId);
  },
  issueReport(actor,orderId) {
    const user=this._referenceActor(actor);
    if (!Number.isSafeInteger(orderId)) throw new Error('Invalid order identity');
    const existing=this.get('SELECT payload FROM issued_reports WHERE order_id=?',[orderId]);
    if(existing)return JSON.parse(existing.payload);
    return this._referenceAtomic(() => {
      if (this.get('SELECT 1 AS missing FROM order_tests t LEFT JOIN parameters p ON p.id=t.parameter_id WHERE t.order_id=? AND p.id IS NULL LIMIT 1',[orderId])) throw new Error('Invalid ordered catalogue identity');
      const tests=this.all('SELECT DISTINCT p.id,p.type FROM order_tests t JOIN parameters p ON p.id=t.parameter_id WHERE t.order_id=?',[orderId]);
      const saved=new Map(this.all('SELECT * FROM order_results WHERE order_id=?',[orderId]).map(r=>[r.parameter_id,r]));
      if (!tests.length) throw new Error('No saved results to issue');
      for (const test of tests) {
        const result=saved.get(test.id);
        if (!result) throw new Error('Missing ordered result: save valid results before issuing');
        if (test.type === 'numeric' || test.type === 'derived') {
          if (parseNumericResult(result.result_value) === null) throw new Error('Missing or invalid numeric result');
          if (result.raw_result_value != null) parseNumericResult(result.raw_result_value);
        } else if (test.type !== 'text' || typeof result.result_text !== 'string' || !result.result_text.trim()) throw new Error('Missing or invalid text result');
      }
      const preview=this._reportPreview(orderId);
      if (!preview) throw new Error('Order not found');
      const now=new Date().toISOString();
      const report={...preview,status:'complete',report_status:'issued',issued:true,issued_at:now,report_date:now,issued_by:user.username,report_printed_by:user.displayName || user.username,lab_config:this.get('SELECT * FROM lab WHERE id=1'),provenance:'issued-snapshot',presentation_provenance:'saved-at-issuance'};
      for (const result of report.results) {
        const test=tests.find(t=>t.id===result.parameter_id);
        const value=test.type==='text'?null:parseNumericResult(result.result_value);
        const text=test.type==='text'?result.result_text:null;
        result.result_value=value;result.result_text=text;
        this.db.run('UPDATE order_results SET result_value=?,result_text=?,flag=? WHERE order_id=? AND parameter_id=?',[value,text,result.flag,orderId,result.parameter_id]);
      }
      this.db.run("UPDATE orders SET status='complete',report_status='issued' WHERE id=?",[orderId]);
      this.db.run('INSERT INTO issued_reports VALUES(?,?,?,?,?)',[orderId,JSON.stringify(report),user.username,report.issued_at,report.provenance]);
      require('./applicationOperations.cjs').audit(this,user,'issue-report',orderId,{testCount:tests.length});
      return report;
    });
  },};
module.exports.rules={match,format,classify,validate};
