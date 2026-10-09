const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Database=require('../electron/database'),{createAuthorization,LOGIN_FAILURE_LIMIT,LOGIN_COOLDOWN_MS}=require('../electron/authorization.cjs');
test('main-process failed login budget cannot be reset by changing sender or username; cooldown and success recover',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'patholy-login-throttle-')),db=new Database(dir,{migrateLegacy:false});
 try{await db.init();db.setupAdmin('synthetic-admin','synthetic-local-password');let time=1000;const auth=createAuthorization(db,{now:()=>time}),event=id=>({sender:Object.assign(new EventEmitter(),{id})});
 for(let i=0;i<LOGIN_FAILURE_LIMIT;i++)assert.equal(auth.login(event(i+1),i%2?'synthetic-admin':'unknown','incorrect-synthetic-password'),null);
 assert.throws(()=>auth.login(event(99),'synthetic-admin','synthetic-local-password'),/Too many sign-in attempts/);
 time+=LOGIN_COOLDOWN_MS-1;assert.throws(()=>auth.login(event(100),'unknown','incorrect'),/Too many sign-in attempts/);
 time++;const valid=event(101);assert.equal(auth.login(valid,'synthetic-admin','synthetic-local-password').role,'admin');assert.ok(auth.getSession(valid));auth.clear(valid.sender);assert.equal(auth.getSession(valid),null);
 for(let i=0;i<LOGIN_FAILURE_LIMIT-1;i++)assert.equal(auth.login(event(200+i),'unknown','incorrect'),null);
 assert.ok(auth.login(valid,'synthetic-admin','synthetic-local-password'));assert.equal(auth.login(valid,'synthetic-admin','incorrect'),null);assert.equal(auth.getSession(valid),null);
 assert.ok(auth.login(valid,'synthetic-admin','synthetic-local-password'));
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
