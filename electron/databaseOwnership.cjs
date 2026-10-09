// All cooperating database writers acquire/release under the same exclusive gate.
// An abandoned gate is not automatically reaped: uncertain ownership fails closed.
const fs=require('fs'),crypto=require('crypto');
const guidance='Database is in use or its ownership is uncertain. Close other instances. An abandoned ownership gate requires validated local OS recovery; do not delete a live or ambiguous lock.';
function sameFile(file,identity){try{const stat=fs.lstatSync(file);return stat.isFile()&&!stat.isSymbolicLink()&&stat.dev===identity.dev&&stat.ino===identity.ino;}catch{return false;}}
function read(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw Error(guidance);const bytes=fs.readFileSync(file);let value;try{value=JSON.parse(bytes);}catch{throw Error(guidance);}return {value,bytes,identity:stat};}
function alive(pid){if(!Number.isSafeInteger(pid)||pid<=0)throw Error(guidance);try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw Error(guidance);}}
function exclusive(file,body){
 let fd,identity;
 try{fd=fs.openSync(file,'wx',0o600);identity=fs.fstatSync(fd);fs.writeFileSync(fd,JSON.stringify(body));fs.fsyncSync(fd);}
 catch(e){if(identity&&sameFile(file,identity))fs.unlinkSync(file);throw e;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 return identity;
}
function withGate(lock,fn){
 const gate=lock+'.gate',token=crypto.randomBytes(32).toString('hex');let acquired=false;
 for(let attempt=0;attempt<30;attempt++){
  try{exclusive(gate,{pid:process.pid,token,createdAt:new Date().toISOString()});acquired=true;break;}
  catch(e){if(e.code!=='EEXIST')throw e;const entry=read(gate);if(!alive(entry.value.pid))throw Error(guidance);if(attempt===29)throw Error(guidance);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}
 }
 if(!acquired)throw Error(guidance);
 try{return fn();}
 finally{const entry=read(gate);if(entry.value.pid!==process.pid||entry.value.token!==token)throw Error(guidance);fs.unlinkSync(gate);}
}
function acquire(lock){return withGate(lock,()=>{
 if(fs.existsSync(lock)){
  const prior=read(lock);if(alive(prior.value.pid))throw Error(guidance);
  if(prior.value.token!==undefined&&!/^[a-f0-9]{64}$/.test(prior.value.token))throw Error(guidance);
  // Recheck identity and content while holding the gate. All module acquisitions
  // and releases are serialized; an uncoordinated OS editor is outside this boundary.
  if(!sameFile(lock,prior.identity)||!fs.readFileSync(lock).equals(prior.bytes))throw Error(guidance);
  fs.unlinkSync(lock);
 }
 const token=crypto.randomBytes(32).toString('hex');exclusive(lock,{pid:process.pid,token});return {file:lock,pid:process.pid,token};
});}
function release(ownership){if(!ownership)return;if(typeof ownership.file!=='string'||! /^[a-f0-9]{64}$/.test(ownership.token||''))throw Error(guidance);return withGate(ownership.file,()=>{
 const entry=read(ownership.file);if(ownership.pid!==process.pid||entry.value.pid!==ownership.pid||entry.value.token!==ownership.token)throw Error(guidance);fs.unlinkSync(ownership.file);
});}
module.exports={acquire,release,guidance};
