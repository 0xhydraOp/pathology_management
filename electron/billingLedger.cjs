const crypto=require('crypto');
const money=require('./money.cjs');
const ops=require('./applicationOperations.cjs');
function localDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function initializeAccount(db,orderId,{legacy=true,actor=null}={}){
  if(db.get('SELECT order_id FROM billing_accounts WHERE order_id=?',[orderId]))return;
  const order=db.get('SELECT total_amount,payment_status FROM orders WHERE id=?',[ops.id(orderId)]);if(!order)throw new Error('Bill not found');
  const charge=money.legacyMoney(order.total_amount),paid=legacy&&order.payment_status==='paid'?charge:0,now=new Date().toISOString();
  db.db.run('INSERT INTO billing_accounts(order_id,charge_minor,legacy_paid_minor,history_incomplete,created_at) VALUES(?,?,?,?,?)',[orderId,charge,paid,legacy?1:0,now]);
  if(!legacy){const user=db._referenceActor(actor);db.db.run('INSERT INTO billing_events(id,order_id,kind,amount_minor,related_event_id,method,reason,actor_id,actor_username,created_at,business_date,request_id,request_binding) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[crypto.randomUUID(),orderId,'charge',charge,null,null,'Original bill',user.id,user.username,now,localDate(),`charge:${orderId}`,JSON.stringify({orderId,kind:'charge',actor:user.id})]);}
}
function account(db,orderId){
 const a=db.get('SELECT * FROM billing_accounts WHERE order_id=?',[ops.id(orderId)]);if(!a)throw new Error('Billing account is not initialized');
 const events=db.all('SELECT e.*,e.actor_username AS actor FROM billing_events e WHERE order_id=? ORDER BY created_at,id',[orderId]);
 let collected=a.legacy_paid_minor,refunds=0,cancelled=0;for(const e of events){if(e.kind==='payment')collected=money.add(collected,e.amount_minor);if(['refund','reversal'].includes(e.kind))refunds=money.add(refunds,e.amount_minor);if(e.kind==='cancellation')cancelled=money.add(cancelled,e.amount_minor);}
 const netCharge=money.add(a.charge_minor,-cancelled),netPaid=money.add(collected,-refunds),balance=money.add(netCharge,-netPaid);
 return {...a,events,collected_minor:collected,refund_minor:refunds,cancelled_minor:cancelled,net_charge_minor:netCharge,net_paid_minor:netPaid,balance_minor:balance,credit_minor:Math.max(0,-balance),balance:money.formatMoney(balance),charge:money.formatMoney(a.charge_minor)};
}
function getAccount(db,actor,orderId){db._referenceActor(actor);return account(db,orderId);}
function canonical(db,actor,input){
 const p=ops.object(input,['orderId','kind','amount','relatedEventId','reason','requestId','method']);ops.id(p.orderId);
 if(!['payment','refund','reversal','cancellation'].includes(p.kind))throw new Error('Invalid ledger operation');
 const user=db._referenceActor(actor);if(p.kind!=='payment'&&user.role!=='admin')throw new Error('Permission denied: administrator authorization is required for billing corrections');
 if(typeof p.requestId!=='string'||!/^[-a-zA-Z0-9_]{16,100}$/.test(p.requestId))throw new Error('Provide a unique request identity');
 const amount=money.parseMoney(p.amount);if(amount<=0)throw new Error('Amount must be greater than zero');
 const reason=ops.text(p.reason,500,p.kind!=='payment')||'',method=ops.text(p.method,50);
 const related=p.relatedEventId==null?null:ops.text(p.relatedEventId,100,true);
 return {user,p:{orderId:p.orderId,kind:p.kind,amount_minor:amount,relatedEventId:related,reason,method,actor:user.id},requestId:p.requestId};
}
function postEvent(db,actor,input){
 const c=canonical(db,actor,input),binding=JSON.stringify(c.p);
 return db._referenceAtomic(()=>{
  const old=db.get('SELECT * FROM billing_events WHERE request_id=?',[c.requestId]);if(old){if(old.request_binding!==binding)throw new Error('Request identity has already been used for a different operation');return {...account(db,c.p.orderId),eventId:old.id,replayed:true};}
  const a=account(db,c.p.orderId),p=c.p;
  if(p.kind==='payment'&&p.amount_minor>a.balance_minor)throw new Error('Payment exceeds the outstanding balance');
  if(['refund','reversal'].includes(p.kind)){
   const payment=a.events.find(e=>e.id===p.relatedEventId&&e.kind==='payment');if(!payment)throw new Error('Select a recorded payment from this bill; legacy baseline payments cannot be refunded automatically');
   const used=a.events.filter(e=>['refund','reversal'].includes(e.kind)&&e.related_event_id===payment.id).reduce((s,e)=>money.add(s,e.amount_minor),0);
   if(p.amount_minor>payment.amount_minor-used)throw new Error('Amount exceeds the unrefunded payment');
  }else if(p.relatedEventId)throw new Error('A related payment is only valid for refunds or reversals');
  if(p.kind==='cancellation'&&p.amount_minor>a.net_charge_minor)throw new Error('Cancellation exceeds the remaining bill charge');
  const eventId=crypto.randomUUID();db.db.run('INSERT INTO billing_events(id,order_id,kind,amount_minor,related_event_id,method,reason,actor_id,actor_username,created_at,business_date,request_id,request_binding) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[eventId,p.orderId,p.kind,p.amount_minor,p.relatedEventId,p.method,p.reason,p.actor,c.user.username,new Date().toISOString(),localDate(),c.requestId,binding]);
  const updated=account(db,p.orderId);db.db.run('UPDATE orders SET payment_status=? WHERE id=?',[updated.balance_minor<=0?'paid':'unpaid',p.orderId]);
  ops.audit(db,c.user,`billing-${p.kind}`,p.orderId,{eventId,amount_minor:p.amount_minor,relatedEventId:p.relatedEventId,reason:p.reason});
  return {...updated,eventId,replayed:false};
 });
}
function reconciliation(db,actor,input){db._referenceActor(actor);ops.object(input,['dateFrom','dateTo']);for(const k of ['dateFrom','dateTo'])if(typeof input[k]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input[k])||new Date(`${input[k]}T00:00:00Z`).toISOString().slice(0,10)!==input[k])throw new Error('Select valid local business dates');if(input.dateFrom>input.dateTo)throw new Error('Date range is reversed');
 const events=db.all('SELECT * FROM billing_events WHERE business_date>=? AND business_date<=? ORDER BY business_date,created_at,id',[input.dateFrom,input.dateTo]);let charges=0,collections=0,refunds=0,cancellations=0;for(const e of events){if(e.kind==='charge')charges=money.add(charges,e.amount_minor);if(e.kind==='payment')collections=money.add(collections,e.amount_minor);if(['refund','reversal'].includes(e.kind))refunds=money.add(refunds,e.amount_minor);if(e.kind==='cancellation')cancellations=money.add(cancellations,e.amount_minor);}
 let balances=0,credits=0;const accounts=db.all('SELECT order_id,history_incomplete FROM billing_accounts');for(const a of accounts){const b=account(db,a.order_id).balance_minor;if(b>0)balances=money.add(balances,b);else credits=money.add(credits,-b);}
 return {...input,charges_minor:charges,collections_minor:collections,refunds_minor:refunds,cancellations_minor:cancellations,net_collections_minor:money.add(collections,-refunds),current_outstanding_minor:balances,current_credit_minor:credits,incomplete_history_accounts:accounts.filter(a=>a.history_incomplete).length,events};
}
module.exports={initializeAccount,getAccount,postEvent,reconciliation,localDate};
