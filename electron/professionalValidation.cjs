// Validate domain history before startup/restore; SQL integrity alone is not
// sufficient to certify report lineage or payment eligibility.
function validate(db){
 const rows=sql=>{const result=db.exec(sql);if(!result.length)return [];return result[0].values.map(values=>Object.fromEntries(result[0].columns.map((key,i)=>[key,values[i]])));};
 const fail=()=>{throw new Error('Professional report, ledger or backup metadata is invalid');};
 const integer=n=>Number.isSafeInteger(n)&&n>=0;
 const json=s=>{try{return JSON.parse(s);}catch{fail();}};
 const time=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
 const unique=(table,columns)=>{const primary=rows(`PRAGMA table_info(${table})`).filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);if(JSON.stringify(primary)===JSON.stringify(columns))return;const indices=rows(`PRAGMA index_list(${table})`).filter(i=>i.unique&&i.partial===0);if(!indices.some(i=>JSON.stringify(rows(`PRAGMA index_info("${i.name.replaceAll('"','""')}")`).map(c=>c.name))===JSON.stringify(columns)))fail();};
 unique('registration_requests',['request_id']);unique('billing_accounts',['order_id']);unique('billing_events',['id']);unique('report_amendment_drafts',['id']);unique('report_versions',['order_id','version']);unique('report_amendment_requests',['request_id']);unique('billing_events',['request_id']);
 const draftIndexes=rows('PRAGMA index_list(report_amendment_drafts)');if(!draftIndexes.some(i=>i.name==='one_report_amendment_draft'&&i.unique===1&&i.partial===1))fail();if(JSON.stringify(rows('PRAGMA index_info(one_report_amendment_draft)').map(c=>c.name))!==JSON.stringify(['order_id']))fail();
 const active=rows("SELECT sql FROM sqlite_master WHERE type='index' AND name='one_report_amendment_draft'")[0];if(!active||! /where\s+state\s*=\s*'draft'/i.test(active.sql))fail();
 const orders=new Map(rows('SELECT id,total_amount FROM orders').map(o=>[o.id,o]));
 const registrationIds=new Set();for(const r of rows('SELECT r.*,p.patient_id AS stored_patient_id FROM registration_requests r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN patients p ON p.id=o.patient_id')){if(registrationIds.has(r.request_id)||! /^[a-f0-9-]{36}$/i.test(r.request_id)||!integer(r.actor_id)||r.actor_id<1||! /^[a-f0-9]{64}$/.test(r.request_hash)||!orders.has(r.order_id)||r.patient_id!==r.stored_patient_id||!time(r.created_at))fail();registrationIds.add(r.request_id);}
 const originals=new Map(rows('SELECT order_id,payload FROM issued_reports').map(r=>[r.order_id,r.payload]));
 const versions=new Map();
 for(const r of rows('SELECT * FROM report_versions ORDER BY order_id,version')){
  if(!orders.has(r.order_id)||!integer(r.version)||r.version<1||!time(r.issued_at)||!r.issued_by)fail();
  const prior=versions.get(r.order_id)||[],report=json(r.payload),changes=json(r.changed_fields);
  if(r.version!==prior.length+1||r.parent_version!==(r.version===1?null:r.version-1)||!report?.issued||report.id!==r.order_id||!Array.isArray(report.results)||!Array.isArray(changes))fail();
  if(r.version===1){if(originals.get(r.order_id)!==r.payload||changes.length)fail();}
  else if(!(r.reason?.trim().length>=3&&r.reason.length<=1000)||report.report_version!==r.version||report.parent_version!==r.parent_version||report.amendment_reason!==r.reason||JSON.stringify(report.amendment_changed_fields)!==JSON.stringify(changes)||report.issued_by!==r.issued_by||report.issued_at!==r.issued_at||!changes.length)fail();
  const identities=report.results.map(x=>x.parameter_id);if(identities.some(n=>!integer(n)||n<1)||new Set(identities).size!==identities.length)fail();
  if(changes.some(n=>!identities.includes(n)))fail();
  if(prior.length){const parent=json(prior.at(-1).payload);require('./reportVersionIntegrity.cjs').validate(parent,report);const actualChanges=report.results.filter((row,i)=>JSON.stringify(row)!==JSON.stringify(parent.results[i])).map(row=>row.parameter_id);if(JSON.stringify(actualChanges)!==JSON.stringify(changes))fail();const old=json(prior[0].payload);if(JSON.stringify(old.results.map(x=>x.parameter_id))!==JSON.stringify(identities))fail();for(const k of ['patient_name','pt_id','age','sex','lab_config'])if(JSON.stringify(report[k])!==JSON.stringify(old[k]))fail();}
  prior.push(r);versions.set(r.order_id,prior);
 }
 for(const order of originals.keys())if(!versions.has(order))fail();
 const drafts=new Map(),activeOrders=new Set();
 for(const d of rows('SELECT * FROM report_amendment_drafts')){
  if(drafts.has(d.id))fail();const chain=versions.get(d.order_id),report=json(d.payload);if(!chain||!chain[d.base_version-1]||!integer(d.revision)||d.revision<1||!d.reason?.trim()||!integer(d.created_by)||!time(d.created_at)||!time(d.updated_at)||!['draft','finalized','cancelled'].includes(d.state)||report.id!==d.order_id||!Array.isArray(report.results))fail();
  require('./reportVersionIntegrity.cjs').validate(json(chain[d.base_version-1].payload),report,{draft:true});if(d.state==='draft'){if(d.base_version!==chain.length||activeOrders.has(d.order_id))fail();activeOrders.add(d.order_id);}if(d.state==='finalized'&&(!integer(d.final_version)||d.final_version!==d.base_version+1||!chain[d.final_version-1]))fail();drafts.set(d.id,d);
 }
 const requests=new Set();for(const r of rows('SELECT * FROM report_amendment_requests')){if(requests.has(r.request_id))fail();requests.add(r.request_id);const d=drafts.get(r.draft_id),request=json(r.request);if(!d||r.actor_id!==d.created_by||!Array.isArray(request)||request[0]!==d.order_id||request[1]!==d.base_version||request[2]!==d.reason)fail();}
 const accountRows=rows('SELECT * FROM billing_accounts'),accounts=new Map(accountRows.map(a=>[a.order_id,a]));if(accounts.size!==accountRows.length)fail();
 for(const a of accounts.values()){if(!orders.has(a.order_id)||!integer(a.charge_minor)||!integer(a.legacy_paid_minor)||a.legacy_paid_minor>a.charge_minor||![0,1].includes(a.history_incomplete)||!time(a.created_at))fail();}
 const eventRequests=new Set();const events=new Map(),refunds=new Map(),cancelled=new Map(),payments=new Map(),collections=new Map(),returns=new Map(),chargeCounts=new Map();
 for(const e of rows('SELECT * FROM billing_events')){
  if(!accounts.has(e.order_id)||!['charge','payment','refund','reversal','cancellation'].includes(e.kind)||!integer(e.amount_minor)||(e.kind!=='charge'&&e.amount_minor===0)||!integer(e.actor_id)||!e.actor_username||!time(e.created_at)||!/^\d{4}-\d{2}-\d{2}$/.test(e.business_date)||!e.request_id||events.has(e.id))fail();
  if(eventRequests.has(e.request_id))fail();eventRequests.add(e.request_id);const binding=json(e.request_binding);if(binding.orderId!==e.order_id||binding.kind!==e.kind||binding.actor!==e.actor_id)fail();
  if(e.kind!=='charge'&&(binding.amount_minor!==e.amount_minor||(binding.relatedEventId??null)!==e.related_event_id||binding.reason!==e.reason||binding.method!==e.method))fail();
  if(e.kind==='charge'&&e.amount_minor!==accounts.get(e.order_id).charge_minor)fail();
  if(e.kind==='charge')chargeCounts.set(e.order_id,(chargeCounts.get(e.order_id)||0)+1);if(e.kind==='payment'){payments.set(e.id,e);collections.set(e.order_id,(collections.get(e.order_id)||0n)+BigInt(e.amount_minor));}if(['refund','reversal'].includes(e.kind))returns.set(e.order_id,(returns.get(e.order_id)||0n)+BigInt(e.amount_minor));
  if(e.kind==='cancellation')cancelled.set(e.order_id,(cancelled.get(e.order_id)||0n)+BigInt(e.amount_minor));
  if(!['refund','reversal'].includes(e.kind)&&e.related_event_id!==null)fail();events.set(e.id,e);
 }
 for(const e of events.values())if(['refund','reversal'].includes(e.kind)){const p=payments.get(e.related_event_id);if(!p||p.order_id!==e.order_id)fail();refunds.set(p.id,(refunds.get(p.id)||0n)+BigInt(e.amount_minor));if(refunds.get(p.id)>BigInt(p.amount_minor))fail();}
 for(const a of accounts.values()){const collection=(collections.get(a.order_id)||0n)+BigInt(a.legacy_paid_minor),returned=returns.get(a.order_id)||0n;if(collection>BigInt(Number.MAX_SAFE_INTEGER)||collection-returned>BigInt(a.charge_minor))fail();}
 for(const [id,total] of cancelled)if(total>BigInt(accounts.get(id).charge_minor))fail();
 for(const a of accounts.values())if(!a.history_incomplete && chargeCounts.get(a.order_id)!==1)fail();
 const health=rows('SELECT * FROM backup_health');if(health.length!==1||health[0].id!==1||![0,1].includes(health[0].reminder_enabled)||!integer(health[0].reminder_days)||health[0].reminder_days<1||health[0].reminder_days>365)fail();
 const h=health[0];if(h.last_external_at!==null&&(!time(h.last_external_at)||!['raw','encrypted'].includes(h.last_external_kind)||!integer(h.last_external_size)||h.last_external_size<100||!/^[a-f0-9]{64}$/.test(h.last_external_digest)))fail();
 return {reportVersions:[...versions.values()].reduce((n,v)=>n+v.length,0),billingEvents:events.size};
}
module.exports={validate};
