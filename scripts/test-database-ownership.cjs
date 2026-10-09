const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process');
const ownership=require('../electron/databaseOwnership.cjs');
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'patholy-ownership-'));try{return fn(path.join(root,'lab.db.lock'),root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
function deadPid(){let pid=2147483000;try{process.kill(pid,0);throw Error('Unexpected live fixture PID');}catch(e){if(e.code!=='ESRCH')throw e;}return pid;}
test('active ownership and wrong-token release fail closed; own release allows fresh writer',()=>fixture(lock=>{
 const first=ownership.acquire(lock);assert.throws(()=>ownership.acquire(lock),/ownership/);assert.throws(()=>ownership.release({...first,token:undefined}),/ownership/);assert.throws(()=>ownership.release({...first,token:'0'.repeat(64)}),/ownership/);assert.equal(JSON.parse(fs.readFileSync(lock)).token,first.token);ownership.release(first);const second=ownership.acquire(lock);assert.notEqual(second.token,first.token);assert.throws(()=>ownership.release(first),/ownership/);ownership.release(second);
}));
test('legacy dead PID reclaims safely but abandoned gate and uncertain PID never auto-delete',()=>fixture(lock=>{
 fs.writeFileSync(lock,JSON.stringify({pid:deadPid()}));const handle=ownership.acquire(lock);ownership.release(handle);
 const stale=JSON.stringify({pid:deadPid(),token:'f'.repeat(64)});fs.writeFileSync(lock+'.gate',stale);assert.throws(()=>ownership.acquire(lock),/validated local OS recovery/);assert.equal(fs.readFileSync(lock+'.gate','utf8'),stale);fs.unlinkSync(lock+'.gate');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token:'f'.repeat(64)}));assert.throws(()=>ownership.acquire(lock),/ownership/);assert.equal(JSON.parse(fs.readFileSync(lock)).pid,process.pid);
}));
test('failed exclusive write cleans only its own file and gate, allowing retry',()=>fixture(lock=>{
 const write=fs.writeFileSync;fs.writeFileSync=(fd,...args)=>{if(typeof fd==='number'&&fs.fstatSync(fd).size===0)throw Error('Synthetic write failure');return write(fd,...args);};try{assert.throws(()=>ownership.acquire(lock),/write failure/);}finally{fs.writeFileSync=write;}assert.equal(fs.existsSync(lock),false);assert.equal(fs.existsSync(lock+'.gate'),false);const handle=ownership.acquire(lock);ownership.release(handle);
}));
test('replacement detected during stale revalidation is never unlinked',()=>fixture(lock=>{
 fs.writeFileSync(lock,JSON.stringify({pid:deadPid()}));const read=fs.readFileSync;let count=0;fs.readFileSync=(file,...args)=>{if(file===lock&&++count===2){fs.unlinkSync(lock);fs.writeFileSync(lock,JSON.stringify({pid:process.pid,token:'a'.repeat(64)}));}return read(file,...args);};try{assert.throws(()=>ownership.acquire(lock),/ownership/);}finally{fs.readFileSync=read;}assert.equal(JSON.parse(fs.readFileSync(lock)).pid,process.pid);
}));
test('concurrent processes claiming one legacy dead lock admit exactly one writer',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patholy-ownership-concurrent-')),lock=path.join(root,'lab.db.lock'),start=path.join(root,'start'),stop=path.join(root,'stop');fs.writeFileSync(lock,JSON.stringify({pid:deadPid()}));const children=[];
 try{
  const modulePath=require.resolve('../electron/databaseOwnership.cjs');
  const code=`const fs=require('fs'),o=require(process.argv[1]);while(!fs.existsSync(process.argv[3]))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);let h;try{h=o.acquire(process.argv[2]);console.log('OWNER');while(!fs.existsSync(process.argv[4]))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);o.release(h);}catch(e){console.log('DENIED');}`;
  const decisions=[];const pending=Array.from({length:4},(_,index)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',code,modulePath,lock,start,stop],{stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(child);let output='';child.stdout.on('data',b=>{output+=b;decisions[index]=output.trim();});child.on('error',reject);child.on('exit',code=>code===0?resolve(output.trim()):reject(Error('Synthetic child failed '+code)));}));
  fs.writeFileSync(start,'start');for(let i=0;i<400&&decisions.filter(Boolean).length<4;i++)await new Promise(r=>setTimeout(r,25));assert.equal(decisions.filter(Boolean).length,4,'All contenders must decide while winning lock remains held');const winning=JSON.parse(fs.readFileSync(lock));assert.ok(children.some(c=>c.pid===winning.pid));fs.writeFileSync(stop,'stop');const results=await Promise.all(pending);assert.equal(results.filter(s=>s==='OWNER').length,1);assert.equal(results.filter(s=>s==='DENIED').length,3);assert.equal(fs.existsSync(lock),false);assert.equal(fs.existsSync(lock+'.gate'),false);
 }finally{for(const c of children)if(c.exitCode===null)c.kill();fs.rmSync(root,{recursive:true,force:true});}
});
