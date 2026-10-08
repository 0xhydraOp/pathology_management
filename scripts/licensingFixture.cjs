'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {LicenseManager,DOMAIN}=require('../electron/licensing.cjs');
async function createLicensingFixture(options={}) {
  const directory=options.directory||fs.mkdtempSync(path.join(os.tmpdir(),'patholy-licence-fixture-'));
  const pair=crypto.generateKeyPairSync('ed25519');
  const pair2=crypto.generateKeyPairSync('ed25519');
  const encryptionKey=crypto.randomBytes(32);
  let clock=options.now?options.now():Date.now();let mono=0;
  const publicKeys={synthetic:pair.publicKey.export({type:'spki',format:'pem'}),rotation:pair2.publicKey.export({type:'spki',format:'pem'})};
  const protect=plain=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey,iv);const bytes=Buffer.concat([cipher.update(plain),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]);};
  const unprotect=bytes=>{const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);};
  const licenseId=crypto.randomUUID(),activationId=crypto.randomUUID();
  const sign=(payload,kid='synthetic')=>{const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');return {kid,payload:encoded,signature:crypto.sign(null,Buffer.from(DOMAIN+kid+'.'+encoded),kid==='rotation'?pair2.privateKey:pair.privateKey).toString('base64url')};};
  let responder=async(url,init)=>{const body=JSON.parse(init.body);const now=Math.floor(clock/1000);return new Response(JSON.stringify({grant:sign({v:1,iss:'patholy-license',aud:'patholy-desktop',licenseId,activationId,deviceId:body.deviceId,policyRevision:1,issuedAt:now,expiresAt:now+3600,offlineUntil:now+600,status:'active'})}),{status:200});};
  const settings={directory,config:{serviceUrl:'https://synthetic.invalid',publicKeys,clockToleranceSeconds:2},protect,unprotect,fetch:(...args)=>responder(...args),now:()=>clock,monotonic:()=>mono,appVersion:'synthetic-test'};
  const manager=new LicenseManager(settings);await manager.init();await manager.activate('PTH-'+crypto.randomBytes(32).toString('base64url'));
  manager.fixture={settings,sign,licenseId,activationId,setClock:ms=>{clock=ms;},advance:ms=>{clock+=ms;mono+=ms;},now:()=>clock,setResponder:fn=>{responder=fn;},payload:()=>JSON.parse(Buffer.from(manager.data.grant.payload,'base64url').toString('utf8')),cleanup:()=>{manager.close();if(!options.directory)fs.rmSync(directory,{recursive:true,force:true});}};
  return manager;
}
module.exports={createLicensingFixture};
