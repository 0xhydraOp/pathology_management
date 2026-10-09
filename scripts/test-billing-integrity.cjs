const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),{EventEmitter}=require('events');
const Database=require('../electron/database');
const {registerApplicationIpc:registerLocalApplicationFixture}=require('../electron/applicationIpc.cjs');
async function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-billing-integrity-'));let db=new Database(dir,{migrateLegacy:false});
 try{await db.init();db.setupAdmin('synthetic-admin','synthetic-billing-password');
 db.run("INSERT INTO parameters(id,code,name,type,unit) VALUES(9901,'SYNBILL','Synthetic billing test','numeric','mg/L')");
 db.run('INSERT INTO test_rates(parameter_id,rate) VALUES(9901,100)');
 db.run("INSERT INTO referrer_commission_pct(referrer_name,commission_percent) VALUES('Synthetic Referral',20)");
 const handlers=new Map(),event={sender:Object.assign(new EventEmitter(),{id:991})};
 await registerLocalApplicationFixture({handle:(name,fn)=>handlers.set(name,fn)},db);
 const invoke=(name,...args)=>handlers.get('db:'+name)(event,...args);invoke('verifyUser','synthetic-admin','synthetic-billing-password');
 db.run("INSERT INTO users(username,password_hash,role,display_name) SELECT 'synthetic-staff',password_hash,'staff','Synthetic Staff' FROM users WHERE username='synthetic-admin'");
 const staffEvent={sender:Object.assign(new EventEmitter(),{id:992})},staff=(name,...args)=>handlers.get('db:'+name)(staffEvent,...args);staff('verifyUser','synthetic-staff','synthetic-billing-password');
 const register=()=>invoke('registerPatientOrder',{name:'Synthetic Billing Patient',age:40,sex:'female',referred_by:'Synthetic Referral',tests:[9901],orderDate:'2026-10-08'}).orderId;
 const snapshot=id=>({order:db.get('SELECT total_amount,payment_status,status,report_status FROM orders WHERE id=?',[id]),rates:db.all('SELECT parameter_id,rate FROM order_tests WHERE order_id=?',[id]),commission:db.all('SELECT * FROM order_commission_log WHERE order_id=?',[id])});
 const reopen=async()=>{db.close();db=new Database(dir,{migrateLegacy:false});await db.init();return db;};
 await fn({get db(){return db;},invoke,staff,register,snapshot,reopen});
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('registration snapshots current rates including zero; posted original charges remain frozen',()=>fixture(async f=>{
 const first=f.register();assert.equal(f.snapshot(first).order.total_amount,100);assert.equal(f.snapshot(first).rates[0].rate,100);
 f.db.run('UPDATE test_rates SET rate=0 WHERE parameter_id=9901');const free=f.register();assert.equal(f.snapshot(free).order.total_amount,0);assert.equal(f.snapshot(free).rates[0].rate,0);
 f.db.run('UPDATE test_rates SET rate=125 WHERE parameter_id=9901');f.invoke('computeOrderBillAndCommission',first);assert.equal(f.snapshot(first).order.total_amount,100);assert.equal(f.snapshot(first).commission[0].commission_amount,20);const latest=f.register();assert.equal(f.snapshot(latest).order.total_amount,125);
}));
for(const state of ['complete','paid','issued'])test(state+' bills preserve stored prices and commissions after settings changes and restart',()=>fixture(async f=>{
 const order=f.register();if(state==='paid')f.invoke('setPaymentStatus',order,'paid');
 if(state==='complete')f.db.run("UPDATE orders SET status='complete' WHERE id=?",[order]);
 if(state==='issued'){f.invoke('saveOrderResults',order,[{parameterId:9901,value:'12.5'}]);f.invoke('issueReport',order);}
 const before=f.snapshot(order),report=state==='issued'?f.invoke('getReport',order):null;
 f.db.run('UPDATE test_rates SET rate=200 WHERE parameter_id=9901');f.db.run("UPDATE referrer_commission_pct SET commission_percent=75 WHERE referrer_name='Synthetic Referral'");
 f.invoke('computeOrderBillAndCommission',order);assert.deepEqual(f.snapshot(order),before);
 await f.reopen();assert.deepEqual(f.snapshot(order),before);if(report)assert.deepEqual(f.db.getReport(order),report);
}));
for (const statement of ['UPDATE order_tests SET rate', 'UPDATE orders SET total_amount']) {
test('failed '+statement+' rolls back prices, totals, commission and audit on restart',()=>fixture(async f=>{
 const order=f.register();f.db.run('DELETE FROM billing_events WHERE order_id=?',[order]);f.db.run('DELETE FROM billing_accounts WHERE order_id=?',[order]);const before=f.snapshot(order),audits=f.db.all('SELECT * FROM audit_log');
 f.db.run('UPDATE test_rates SET rate=150 WHERE parameter_id=9901');
 const original=f.db.run.bind(f.db);f.db.run=(sql,...args)=>{if(String(sql).startsWith(statement))throw new Error('Synthetic bill write failure');return original(sql,...args);};
 assert.throws(()=>f.invoke('computeOrderBillAndCommission',order),/Synthetic bill write failure/);
 assert.deepEqual(f.snapshot(order),before);assert.deepEqual(f.db.all('SELECT * FROM audit_log'),audits);
 await f.reopen();assert.deepEqual(f.snapshot(order),before);assert.deepEqual(f.db.all('SELECT * FROM audit_log'),audits);
}));
}

test('backend recalculation failure rolls back the bill, commission and audit after reopening',()=>fixture(async f=>{
 const order=f.register();f.db.run('DELETE FROM billing_events WHERE order_id=?',[order]);f.db.run('DELETE FROM billing_accounts WHERE order_id=?',[order]);const before=f.snapshot(order),audits=f.db.all('SELECT * FROM audit_log');f.db.run('UPDATE test_rates SET rate=150 WHERE parameter_id=9901');
 const original=f.db.run.bind(f.db);f.db.run=(sql,...args)=>{if(String(sql).startsWith('INSERT INTO order_commission_log'))throw new Error('Synthetic commission write failure');return original(sql,...args);};
 assert.throws(()=>f.invoke('computeOrderBillAndCommission',order),/Synthetic commission/);assert.deepEqual(f.snapshot(order),before);assert.deepEqual(f.db.all('SELECT * FROM audit_log'),audits);
 await f.reopen();assert.deepEqual(f.snapshot(order),before);assert.deepEqual(f.db.all('SELECT * FROM audit_log'),audits);
}));
test('staff reversing paid status cannot unfreeze historical prices or commissions',()=>fixture(async f=>{
 const order=f.register();f.staff('setPaymentStatus',order,'paid');const frozen=f.snapshot(order);
 assert.throws(()=>f.staff('setPaymentStatus',order,'unpaid'),/refund|reversal/i);const account=f.invoke('getBillingAccount',order),payment=account.events.find(e=>e.kind==='payment');f.invoke('postBillingEvent',{orderId:order,kind:'refund',amount:'100.00',relatedEventId:payment.id,reason:'Synthetic corrected collection',requestId:require('crypto').randomUUID()});
 assert.throws(()=>f.staff('setRates',[{parameterId:9901,rate:200}]),/Admin authorization/);
 f.invoke('setRates',[{parameterId:9901,rate:200}]);f.invoke('setCommissions',{entries:[{name:'Synthetic Referral',percent:75}]});
 f.staff('computeOrderBillAndCommission',order);
 const expected={...frozen,order:{...frozen.order,payment_status:'unpaid'}};
 assert.deepEqual(f.snapshot(order),expected);await f.reopen();assert.deepEqual(f.snapshot(order),expected);
}));
test('repeated paid-status requests do not create duplicate financial transactions',()=>fixture(async f=>{
 const order=f.register();f.staff('setPaymentStatus',order,'paid');const before=f.snapshot(order);
 f.staff('setPaymentStatus',order,'paid');assert.deepEqual(f.snapshot(order),before);
 await f.reopen();assert.deepEqual(f.snapshot(order),before);
}));
test('clearing a completed draft result cannot unfreeze its historical bill',()=>fixture(async f=>{
 const order=f.register();f.staff('saveOrderResults',order,[{parameterId:9901,value:'12.5'}]);const frozen=f.snapshot(order);
 f.staff('saveOrderResults',order,[{parameterId:9901,value:''}]);
 f.invoke('setRates',[{parameterId:9901,rate:200}]);f.staff('computeOrderBillAndCommission',order);
 assert.deepEqual(f.snapshot(order),{...frozen,order:{...frozen.order,status:'pending'}});
}));
test('authorized clearing does not transfer old financial freezes to reused order identities',()=>fixture(async f=>{
 const old=f.register();f.staff('setPaymentStatus',old,'paid');assert.throws(()=>f.invoke('clearAllPatientData'),/issued|posted|ledger|payment/i);f.db.run('DELETE FROM billing_events WHERE order_id=?',[old]);f.db.run('DELETE FROM billing_accounts WHERE order_id=?',[old]);f.invoke('clearAllPatientData');
 f.db.run("UPDATE sqlite_sequence SET seq=0 WHERE name IN ('orders','patients')");
 const current=f.register();assert.equal(current,old);
 f.invoke('setRates',[{parameterId:9901,rate:150}]);f.staff('computeOrderBillAndCommission',current);
 assert.equal(f.snapshot(current).order.total_amount,100);assert.equal(f.invoke('getBillingAccount',current).legacy_paid_minor,0);
}));

test('explicitly settling a zero-price bill records no invented payment and repeats safely',()=>fixture(async f=>{f.invoke('setRates',[{parameterId:9901,rate:0}]);const id=f.register();f.staff('setPaymentStatus',id,'paid');f.staff('setPaymentStatus',id,'paid');assert.equal(f.snapshot(id).order.payment_status,'paid');assert.equal(f.invoke('getBillingAccount',id).events.filter(e=>e.kind==='payment').length,0);assert.equal(f.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action='zero-outstanding-confirmed'").n,1);await f.reopen();assert.equal(f.snapshot(id).order.payment_status,'paid');}));
