const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const Database=require('../electron/database'), health=require('../electron/backupHealth.cjs'), recovery=require('../electron/recovery.cjs');
async function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'patholy-backup-health-')),dir=path.join(root,'database');let db=new Database(dir,{migrateLegacy:false});try{await db.init();db.setupAdmin('synthetic-admin','synthetic-backup-password');const actor=db.get('SELECT id,username,role FROM users WHERE username=?',['synthetic-admin']);const reopen=async()=>{db.close();db=new Database(dir,{migrateLegacy:false});await db.init();};await fn({root,dir,actor,get db(){return db;},reopen});}finally{db.close();fs.rmSync(root,{recursive:true,force:true});}}
test('reminders distinguish local recovery copies and persist verified selected encrypted copies',()=>fixture(async f=>{
 assert.equal(health.getHealth(f.db,f.actor).due,true);
 const plain=Buffer.from(f.db.db.export()),file=path.join(f.root,'Synthetic portable copy.db.enc'),encrypted=recovery.encrypt(plain,'synthetic-backup-passphrase');fs.writeFileSync(file,encrypted);
 assert.deepEqual(recovery.decrypt(fs.readFileSync(file),'synthetic-backup-passphrase'),plain);
 assert.equal(health.recordVerifiedBackup(f.db,f.actor,file,'encrypted',{databaseBytes:plain,expectedFileBytes:encrypted}).recorded,true);
 const before=health.getHealth(f.db,f.actor);assert.equal(before.due,false);assert.equal(before.kind,'encrypted');assert.equal(before.name,'Synthetic portable copy.db.enc');
 await f.reopen();assert.equal(health.getHealth(f.db,f.actor).lastExternalAt,before.lastExternalAt);assert.equal(f.db.all("SELECT * FROM audit_log WHERE action='verified-user-selected-backup'").length,1);
 const timestamp=Date.parse(before.lastExternalAt);assert.equal(health.getHealth(f.db,f.actor,timestamp+7*86400000).due,true);assert.equal(health.getHealth(f.db,f.actor,timestamp-1).clockUncertain,true);
 health.configureReminder(f.db,f.actor,{enabled:false,days:30});assert.equal(health.getHealth(f.db,f.actor,timestamp+60*86400000).due,false);
}));
test('local copies, missing or changed files and canceled writes cannot advance external status',()=>fixture(async f=>{
 const plain=Buffer.from(f.db.db.export()),local=path.join(f.dir,'local.db');fs.writeFileSync(local,plain);
 assert.equal(health.recordVerifiedBackup(f.db,f.actor,local,'raw',{databaseBytes:plain,expectedFileBytes:plain}).recorded,false);
 assert.equal(health.getHealth(f.db,f.actor).lastExternalAt,null);
 assert.throws(()=>health.recordVerifiedBackup(f.db,f.actor,path.join(f.root,'never-created.db'),'raw',{databaseBytes:plain,expectedFileBytes:plain}),/ENOENT/);
 const file=path.join(f.root,'changed.db');fs.writeFileSync(file,plain);const changed=Buffer.from(plain);changed[changed.length-1]^=1;fs.writeFileSync(file,changed);
 assert.throws(()=>health.recordVerifiedBackup(f.db,f.actor,file,'raw',{databaseBytes:plain,expectedFileBytes:plain}),/bytes changed/);
 assert.throws(()=>health.recordVerifiedBackup(f.db,f.actor,file,'encrypted',{databaseBytes:plain,expectedFileBytes:plain}),/format/);
 assert.equal(health.getHealth(f.db,f.actor).lastExternalAt,null);
}));
test('staff can read but cannot change reminder policy or record verified backups; actor spoofing fails',()=>fixture(async f=>{
 f.db.db.run("INSERT INTO users(username,password_hash,role) SELECT 'synthetic-staff',password_hash,'staff' FROM users WHERE id=?",[f.actor.id]);const staff=f.db.get("SELECT id FROM users WHERE username='synthetic-staff'");
 assert.equal(health.getHealth(f.db,staff).canConfigure,false);
 assert.throws(()=>health.configureReminder(f.db,{...staff,role:'admin',username:'spoofed'},{enabled:false,days:7}),/Permission denied/);
 assert.throws(()=>health.recordVerifiedBackup(f.db,staff,'unused','raw'),/Permission denied/);
 assert.throws(()=>health.getHealth(f.db,{id:999999}),/Permission denied/);
 for(const input of [{enabled:true,days:0},{enabled:true,days:366},{enabled:true,days:1.5},{enabled:'true',days:7},{enabled:true,days:7,actor:1}])assert.throws(()=>health.configureReminder(f.db,f.actor,input),/1 to 365/);
}));
test('metadata commit failure rolls back backup status and audit while keeping verified file',()=>fixture(async f=>{
 const plain=Buffer.from(f.db.db.export()),file=path.join(f.root,'synthetic.db');fs.writeFileSync(file,plain);const replace=recovery.replace;recovery.replace=()=>{throw new Error('Synthetic persistence failure');};
 try{assert.throws(()=>health.recordVerifiedBackup(f.db,f.actor,file,'raw',{databaseBytes:plain,expectedFileBytes:plain}),/persistence failure/);}finally{recovery.replace=replace;}
 assert.equal(health.getHealth(f.db,f.actor).lastExternalAt,null);assert.equal(f.db.all("SELECT * FROM audit_log WHERE action='verified-user-selected-backup'").length,0);assert.deepEqual(fs.readFileSync(file),plain);
 await f.reopen();assert.equal(health.getHealth(f.db,f.actor).lastExternalAt,null);
}));
