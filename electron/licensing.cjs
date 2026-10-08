'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE = /^[a-f0-9]{64}$/;
const DOMAIN = 'patholy-grant-v1\n';
function verifyGrant(grant, keys, deviceId) {
  if (!grant || typeof grant.kid !== 'string' || !Object.hasOwn(keys, grant.kid) || !/^[A-Za-z0-9_-]{1,80}$/.test(grant.kid) || typeof grant.payload !== 'string' || !/^[A-Za-z0-9_-]{1,12000}$/.test(grant.payload) || typeof grant.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(grant.signature)) throw new Error('Invalid signed licence grant.');
  const key = crypto.createPublicKey(keys[grant.kid]);
  if (key.asymmetricKeyType !== 'ed25519' || !crypto.verify(null, Buffer.from(DOMAIN + grant.kid + '.' + grant.payload), key, Buffer.from(grant.signature, 'base64url'))) throw new Error('Invalid licence signature.');
  const p = JSON.parse(Buffer.from(grant.payload, 'base64url').toString('utf8'));
  const fields = ['v','iss','aud','licenseId','activationId','deviceId','policyRevision','issuedAt','expiresAt','offlineUntil','status'];
  if (Object.keys(p).length !== fields.length || fields.some(k => !Object.hasOwn(p,k)) || p.v !== 1 || p.iss !== 'patholy-license' || p.aud !== 'patholy-desktop' || !UUID.test(p.licenseId) || !UUID.test(p.activationId) || !DEVICE.test(p.deviceId) || p.deviceId !== deviceId || !Number.isSafeInteger(p.policyRevision) || p.policyRevision < 1 || !['active','revoked','expired'].includes(p.status) || ['issuedAt','expiresAt','offlineUntil'].some(k => !Number.isSafeInteger(p[k]) || p[k] < 0) || p.offlineUntil > p.expiresAt || (p.status === 'active' && (p.issuedAt > p.offlineUntil || p.issuedAt > p.expiresAt))) throw new Error('Invalid licence grant contents.');
  return p;
}
class LicenseManager {
  constructor({directory,config,protect,unprotect,fetch:fetchImpl=globalThis.fetch,now=()=>Date.now(),monotonic=()=>Number(process.hrtime.bigint()/1000000n),appVersion='unknown'}) {
    this.directory=directory; this.file=path.join(directory,'activation.enc'); this.config=config||{}; this.protect=protect; this.unprotect=unprotect; this.fetch=fetchImpl; this.now=now; this.monotonic=monotonic; this.appVersion=appVersion; this.busy=false; this.dirty=false; this.error=null; this.data=null; this.startWall=this.now(); this.startMono=this.monotonic();
  }
  async init() {
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    try {
      if (fs.existsSync(this.file)) { const bytes=fs.readFileSync(this.file); if(bytes.length>100000)throw new Error('Activation storage is invalid.'); this.data=JSON.parse(Buffer.from(this.unprotect(bytes)).toString('utf8')); if(!this.data||!DEVICE.test(this.data.secret)||!Number.isSafeInteger(this.data.highWater)||this.data.highWater<0||typeof this.data.key!=='string')throw new Error('Activation storage is invalid.'); if(this.data.grant)verifyGrant(this.data.grant,this.config.publicKeys||{},this.deviceId()); }
      else { this.data={secret:crypto.randomBytes(32).toString('hex'),key:'',grant:null,highWater:Math.floor(this.now()/1000),lastCheckedAt:null,clockBlocked:false}; this.persist(); }
    } catch { this.data=null; this.error='Activation storage could not be verified. Contact licence support; clinical records remain available.'; }
    return this.status();
  }
  deviceId(){return crypto.createHash('sha256').update(Buffer.from(this.data.secret,'hex')).digest('hex');}
  persist(){if(typeof this.protect!=='function')throw new Error('Secure activation storage is unavailable.'); const buffer=Buffer.from(this.protect(Buffer.from(JSON.stringify(this.data)))); const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';let fd;try{fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,buffer);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;fs.renameSync(tmp,this.file);}finally{if(fd!==undefined&&fd!==null)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
  configured(){return typeof this.config.serviceUrl==='string' && this.config.serviceUrl.length>0 && Object.keys(this.config.publicKeys||{}).length>0;}
  status(){
    const out=(state,message,p)=>({state,allowed:state==='active',message,expiresAt:p?.expiresAt||null,offlineUntil:p?.offlineUntil||null,lastCheckedAt:this.data?.lastCheckedAt||null,licenseId:p?.licenseId||null,activationId:p?.activationId||null,installationId:this.data?this.deviceId():null});
    if(this.error)return out('storage-error',this.error);
    if(!this.configured())return out('unconfigured','Licensing service is not configured. Existing records, issued reports and recovery remain available.');
    if(!this.data?.grant)return out('inactive','Activate this installation to register patients and enter or finalize results.');
    let p;try{p=verifyGrant(this.data.grant,this.config.publicKeys,this.deviceId());}catch{return out('invalid','The saved licence could not be verified. Contact licence support.');}
    const wall=Math.floor(this.now()/1000); const elapsed=Math.max(0,(this.monotonic()-this.startMono)/1000); const expected=Math.floor(this.startWall/1000+elapsed); const tolerance=this.config.clockToleranceSeconds??120;
    if(!Number.isSafeInteger(tolerance)||tolerance<0||tolerance>300)return out('invalid','Invalid licensing clock configuration.');
    const rollback=wall+tolerance<this.data.highWater||wall+tolerance<expected||wall+tolerance<p.issuedAt;
    const prior=JSON.stringify([this.data.highWater,this.data.clockBlocked]);
    this.data.highWater=Math.max(this.data.highWater,wall,expected);
    if(rollback)this.data.clockBlocked=true;
    if(prior!==JSON.stringify([this.data.highWater,this.data.clockBlocked]))this.dirty=true;
    try{if(this.dirty){this.persist();this.dirty=false;}}catch{return out('storage-error','Licence state could not be saved safely. Retry after checking storage access.');}
    if(this.data.clockBlocked)return out('clock-review','System clock changed unexpectedly. Correct the clock and reconnect to verify the licence.',p);
    if(p.status!=='active')return out(p.status,'Licence '+p.status+'. Contact your licence administrator for renewal or transfer.',p);
    if(this.data.highWater>=p.expiresAt)return out('expired','Licence expired. Contact your licence administrator for renewal.',p);
    if(this.data.highWater>=p.offlineUntil)return out('offline-ended','Offline allowance ended. Reconnect to verify the licence.',p);
    return out('active','Licence active.',p);
  }
  requireOperation(name){const s=this.status();if(!s.allowed)throw new Error('Licence allowance ended: '+s.message);return true;}
  async activate(key,{authorize}={}){if(typeof key!=='string'||key.length<32||key.length>256||!/^PTH-[A-Za-z0-9_-]+$/.test(key))throw new Error('Enter a valid licence key.');return this.request('activate',key,authorize);}
  async refresh({authorize}={}){if(!this.data?.key)throw new Error('Activate this installation first.');return this.request('refresh',this.data.key,authorize);}
  async request(action,key,authorize){
    if(authorize)authorize();
    if(this.busy)throw new Error('Licence verification is already in progress.');if(!this.data||!this.configured())throw new Error('Licensing service or secure storage is unavailable.');
    const url=new URL(this.config.serviceUrl); const local=url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&this.config.syntheticFixture===true;
    if((url.protocol!=='https:'&&!local)||url.username||url.password||url.search||url.hash)throw new Error('Invalid licensing service address.');
    // Synthetic HTTP fixtures are constructed directly by tests. Production main must never accept renderer configuration.
    this.busy=true;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const requestId=crypto.randomUUID();const response=await this.fetch(new URL('/v1/'+action,url),{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({key,deviceId:this.deviceId(),requestId,appVersion:this.appVersion})});
      if(!response.ok)throw new Error('Licence verification failed. Check the key or contact your licence administrator.');
      const declared=Number(response.headers?.get?.('content-length')||0);if(declared>20000)throw new Error('Invalid licensing response.');
      let text=''; if(response.body?.getReader){const reader=response.body.getReader();let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000){await reader.cancel();throw new Error('Invalid licensing response.');}text+=Buffer.from(value).toString('utf8');}}finally{reader.releaseLock();}}else{text=await response.text();if(Buffer.byteLength(text)>20000)throw new Error('Invalid licensing response.');}
      const result=JSON.parse(text);const payload=verifyGrant(result.grant,this.config.publicKeys,this.deviceId()); const current=this.data.grant?verifyGrant(this.data.grant,this.config.publicKeys,this.deviceId()):null;
      if(current&&payload.licenseId===current.licenseId&&(payload.policyRevision<current.policyRevision||payload.issuedAt<current.issuedAt||(current.status!=='active'&&payload.status==='active'&&payload.policyRevision<=current.policyRevision)))throw new Error('Outdated licensing response.');
      const wall=Math.floor(this.now()/1000);const tolerance=this.config.clockToleranceSeconds??120;if(Math.abs(payload.issuedAt-wall)>tolerance)throw new Error('Correct the system clock before verifying the licence.');
      if(authorize)authorize();
      const old=this.data;this.data={...old,key,grant:result.grant,lastCheckedAt:wall,highWater:wall,clockBlocked:false};try{this.persist();this.dirty=false;}catch(e){this.data=old;throw e;}this.startWall=this.now();this.startMono=this.monotonic();return this.status();
    }catch(e){if(e.message?.startsWith('Permission denied')||e.message?.startsWith('Sign in')||e.message?.startsWith('Correct the system clock')||e.message==='Outdated licensing response.')throw e;throw new Error('Licence verification failed. Check your connection or contact your licence administrator.');}finally{clearTimeout(timer);this.busy=false;}
  }
  close(){if(this.data)this.status();}
}
module.exports={LicenseManager,verifyGrant,DOMAIN};
