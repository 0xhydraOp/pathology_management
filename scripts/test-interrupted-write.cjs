const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const Database=require('../electron/database');
async function main(){
 if(process.argv[2]==='child'){
  const db=new Database(process.argv[3],{migrateLegacy:false});await db.init();db.setupAdmin('synthetic-admin','synthetic-interruption-password');
  fs.renameSync=(source,destination)=>{if(destination!==db.dbPath)throw new Error('Unexpected replacement');process.stdout.write('FLUSHED_BEFORE_RENAME\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
  db.run("UPDATE lab SET name='Synthetic uncommitted replacement' WHERE id=1");return;
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-process-interruption-'));let child,db;
 try{
  child=spawn(process.execPath,[__filename,'child',dir],{stdio:['ignore','pipe','pipe'],windowsHide:true});let stderr='';child.stderr.on('data',d=>stderr+=d);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Child interruption stage timeout: '+stderr)),15000);child.stdout.on('data',d=>{if(String(d).includes('FLUSHED_BEFORE_RENAME')){clearTimeout(timer);resolve();}});child.on('exit',code=>{clearTimeout(timer);reject(new Error('Child exited before interruption: '+code+' '+stderr));});});
  const original=fs.readFileSync(path.join(dir,'lab.db'));assert.ok(fs.readdirSync(dir).some(f=>f.endsWith('.tmp')));
  const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;
  assert.deepEqual(fs.readFileSync(path.join(dir,'lab.db')),original);db=new Database(dir,{migrateLegacy:false});await db.init();assert.notEqual(db.get('SELECT name FROM lab').name,'Synthetic uncommitted replacement');assert.ok(db.verifyUser('synthetic-admin','synthetic-interruption-password'));assert.ok(fs.readdirSync(dir).some(f=>f.endsWith('.tmp')));console.log('Actual process interruption after flushed temporary write: original retained, stale PID lock recovered, orphan temp not promoted, restart/login passed. This is not a power-loss test.');
 }finally{if(child?.exitCode===null)child.kill('SIGKILL');db?.close();const resolved=path.resolve(dir);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('lab-process-interruption-'))throw new Error('Unsafe fixture cleanup');fs.rmSync(resolved,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
