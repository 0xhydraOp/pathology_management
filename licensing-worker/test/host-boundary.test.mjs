import test from 'node:test';
import assert from 'node:assert/strict';
import { permitsHost } from '../src/hostBoundary.js';
import { startSyntheticWorker } from './fixture.mjs';
const env={OWNER_ORIGIN:'https://admin.molladigital.com',API_ORIGIN:'https://license.molladigital.com',CUSTOMER_PORTAL_ENABLED:'true'};
test('two exact origins: no alternate-host, cross-origin, wildcard or method bypass',()=>{
 const check=(origin,path,method='POST',headers={})=>permitsHost(new Request(origin+path,{method,headers}),env);
 assert(check(env.OWNER_ORIGIN,'/owner','GET'));
 assert(check(env.OWNER_ORIGIN,'/v1/owner/customers/list'));
 assert(check(env.API_ORIGIN,'/v1/activate'));
 assert(check(env.API_ORIGIN,'/invite','GET'));
 for(const origin of ['https://molladigital.com','https://www.molladigital.com','https://future.molladigital.com','https://patholy.workers.dev','https://preview.patholy.workers.dev','http://license.molladigital.com','https://license.molladigital.com:444'])for(const path of ['/v1/activate','/v1/owner/customers/list','/owner'])assert.equal(check(origin,path),false);
 assert.equal(check(env.API_ORIGIN,'/v1/owner/customers/list'),false);
 assert.equal(check(env.OWNER_ORIGIN,'/v1/activate'),false);
 assert.equal(check(env.API_ORIGIN,'/v1/activate','OPTIONS'),false);
 assert.equal(check(env.API_ORIGIN,'/v1/activate/'),false);
 for(const origin of [env.OWNER_ORIGIN,'https://molladigital.com','null'])assert.equal(check(env.API_ORIGIN,'/v1/refresh','POST',{origin}),false);
 assert(check(env.API_ORIGIN,'/v1/refresh','POST',{origin:env.API_ORIGIN}));
 assert.equal(check('https://attacker.example','/v1/activate','POST',{'x-forwarded-host':'license.molladigital.com'}),false);
 assert.equal(permitsHost(new Request(env.API_ORIGIN+'/v1/activate',{method:'POST'}),{}),false);
});
test('real Worker applies host boundary before privileged or public operations',{timeout:60000},async()=>{
 const f=await startSyntheticWorker();
 try{
  for(const origin of ['https://alternate.example.invalid',f.apiUrl]){
   const r=await f.mf.dispatchFetch(origin+'/v1/owner/customers/list',{method:'POST',headers:{...f.adminHeaders,origin,'x-patholy-owner-action':'1'},body:'{}'});
   assert.equal(r.status,404);assert.equal(r.headers.get('access-control-allow-origin'),null);
  }
  const r=await f.mf.dispatchFetch(f.apiUrl+'/v1/activate',{method:'POST',headers:{'content-type':'application/json',origin:f.url},body:'{}'});assert.equal(r.status,404);
  const owner=await f.mf.dispatchFetch(f.url+'/owner',{headers:{'cf-access-jwt-assertion':f.jwt()}});assert.equal(owner.status,200);assert.match(await owner.text(),new RegExp(f.apiUrl.replaceAll('.','\\.')));
  const landing=await f.mf.dispatchFetch(f.url+'/',{redirect:'manual',headers:{'cf-access-jwt-assertion':f.jwt()}});assert.equal(landing.status,302);assert.equal(landing.headers.get('location'),'/owner');
  assert.equal((await f.mf.dispatchFetch(f.url+'/',{redirect:'manual'})).status,403);
  assert.equal((await f.db.prepare('SELECT count(*) n FROM customers').first()).n,0);
 }finally{await f.close();}
});
