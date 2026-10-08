import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSyntheticWorker} from './fixture.mjs';

function headers(f,overrides){return {'content-type':'application/json',origin:new URL(f.url).origin,'x-patholy-owner-action':'1','cf-access-jwt-assertion':f.jwt(overrides)};}
for(const contract of ['access-idp-amr-top-level-v1','access-oidc-custom-amr-v1']){
 test('explicit '+contract+' accepts only its signed human application-token MFA evidence',async()=>{
  const f=await startSyntheticWorker({mfaContract:contract});
  try{
   assert.equal((await f.post('/v1/owner/customers/list',{},headers(f,{}))).status,200);
   const absent=contract==='access-idp-amr-top-level-v1'?{amr:undefined,custom:{amr:['mfa']}}:{custom:undefined,amr:['mfa']};
   const invalidMethods=[undefined,'mfa',[],['pwd'],['otp'],['hwk'],['pwd','hwk'],['MFA'],['mfa',false],{mfa:true}];
   for(const value of invalidMethods){const overrides=contract==='access-idp-amr-top-level-v1'?{amr:value}:{custom:{amr:value}};assert.equal((await f.post('/v1/owner/customers/list',{},headers(f,overrides))).status,403);}
   for(const overrides of [absent,{type:'org'},{type:undefined},{email:undefined},{email_verified:false},{non_identity:true},{sub:'lab-admin'},{aud:['synthetic-customer-audience']},{exp:1}])assert.equal((await f.post('/v1/owner/customers/list',{},headers(f,overrides))).status,403);
   const token=f.jwt();const parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({iss:'https://synthetic.cloudflareaccess.com',aud:['synthetic-audience'],sub:'synthetic-admin',type:'app',email:'synthetic@example.invalid',amr:['mfa'],custom:{amr:['mfa']},iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
   assert.equal((await f.post('/v1/owner/customers/list',{}, {...headers(f,{}),'cf-access-jwt-assertion':parts.join('.')})).status,403);
   assert.equal((await f.db.prepare('SELECT count(*) n FROM customers').first()).n,0);
  }finally{await f.close();}
 });
}
test('missing or unknown MFA contract denies owner UI, API and CLI even with signed mfa',async()=>{
 for(const mfaContract of ['', 'UNVERIFIED', 'anything-goes']){
  const f=await startSyntheticWorker({mfaContract,createLicense:false});
  try{
   assert.equal((await f.post('/v1/owner/customers/list',{},headers(f,{}))).status,403);
   assert.equal((await f.post('/v1/admin/create',{expiresAt:Math.floor(Date.now()/1000)+600,seats:1,offlineSeconds:60},f.adminHeaders)).status,403);
   assert.equal((await f.mf.dispatchFetch(f.url+'/owner',{headers:{'cf-access-jwt-assertion':f.jwt()}})).status,403);
   assert.equal((await f.db.prepare('SELECT count(*) n FROM licenses').first()).n,0);
  }finally{await f.close();}
 }
});
