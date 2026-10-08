// Builds a separately labelled, pinned-key synthetic QA package. Production never
// reads test keys/URLs from a file, flag or environment variable.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict'),{execFileSync}=require('child_process');
async function main(){
 const {startSyntheticWorker}=await import('../licensing-worker/test/fixture.mjs');
 const server=await startSyntheticWorker({seats:20,offlineSeconds:600,expiresAt:Math.floor(Date.now()/1000)+86400});
 const artifact=path.resolve('release/licensing-verification'),publicDir=path.join(artifact,'synthetic-public-config');fs.mkdirSync(publicDir,{recursive:true});
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patholy-packaged-licensing-')),data=path.join(root,'Synthetic activation বাংলা');fs.mkdirSync(data);fs.writeFileSync(path.join(data,'synthetic-qa.json'),JSON.stringify({purpose:'synthetic-packaged-qa',directory:data}));
 const env={...process.env,APPDATA:path.join(root,'roaming'),LOCALAPPDATA:path.join(root,'local'),PATHOLY_SYNTHETIC_LICENCE_KEY:server.key,REFERENCE_TEST_ARTIFACT_DIR:path.join(artifact,'packaged-pdf')};
 const exe=path.resolve('release/licensing-synthetic-qa/win-unpacked/Patholy Management System.exe');let app,serverClosed=false;
 try{
  fs.writeFileSync(path.join(publicDir,'licensing-config.json'),JSON.stringify({serviceUrl:server.url,publicKeys:{[server.kid]:server.publicKey},clockToleranceSeconds:120,syntheticFixture:true},null,2));
  const config=path.join(artifact,'synthetic-builder.json');fs.writeFileSync(config,JSON.stringify({directories:{output:'release/licensing-synthetic-qa'},productName:'Patholy Management System Synthetic QA',appId:'com.patholy.syntheticlicensingqa',win:{executableName:'Patholy Management System'},extraMetadata:{patholySyntheticLicensingFixture:true},files:[...require('../package.json').build.files,'!electron/licensing-config.json',{from:publicDir,to:'electron',filter:['licensing-config.json']}]},null,2));
  execFileSync(process.execPath,[require.resolve('electron-builder/cli.js'),'--win','--dir','--config',config],{stdio:'inherit',env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'},windowsHide:true});
  execFileSync(process.execPath,[path.resolve('scripts/test-packaged-smoke.cjs'),exe],{stdio:'inherit',env,windowsHide:true});
  execFileSync(process.execPath,[path.resolve('scripts/test-packaged-upgrade.cjs'),exe],{stdio:'inherit',env,windowsHide:true});
  const {_electron}=require(process.env.T001_PLAYWRIGHT_PATH||'playwright');
  app=await _electron.launch({executablePath:exe,args:['--isolated-data-dir='+data],env});await app.firstWindow();let page;for(let i=0;i<100&&!page;i++){page=app.windows().find(p=>p.url().includes('/app.asar/dist/index.html'));if(!page)await new Promise(r=>setTimeout(r,50));}
  page.setDefaultTimeout(10000);await page.getByRole('button',{name:'Create administrator',exact:true}).waitFor();await page.getByLabel('Username',{exact:true}).fill('synthetic-admin');await page.getByLabel('New password',{exact:true}).fill('synthetic-licensing-password');await page.getByLabel('Confirm new password',{exact:true}).fill('synthetic-licensing-password');await page.getByRole('button',{name:'Create administrator',exact:true}).click();await page.getByLabel('Password',{exact:true}).fill('synthetic-licensing-password');await page.getByRole('button',{name:'Login',exact:true}).click();await page.getByRole('button',{name:'Logout',exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>window.licensing.getStatus())).allowed,false);
  assert.match(await page.evaluate(async()=>{try{await window.db.registerPatientOrder({name:'Synthetic blocked patient',tests:[1]});return 'FAIL';}catch(e){return e.message;}}),/Licence allowance ended/);
  await page.getByRole('link',{name:'Licence & activation',exact:true}).click();await page.getByLabel('Licence key',{exact:true}).fill(server.key);await page.getByRole('button',{name:'Activate licence',exact:true}).click();await page.waitForFunction(async()=> (await window.licensing.getStatus()).allowed);
  const active=await page.evaluate(()=>window.licensing.getStatus());assert.match(active.installationId,/^[a-f0-9]{64}$/);assert.equal(active.allowed,true);
  await page.setViewportSize({width:1366,height:768});await page.screenshot({path:path.join(artifact,'activation-1366.png')});await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:path.join(artifact,'activation-1920.png')});
  const order=await page.evaluate(async()=>{const params=await window.db.read('catalogue.referenceParameters',[]),p=params.find(p=>p.code==='HB');const order=await window.db.registerPatientOrder({name:'Synthetic activated patient',age:40,sex:'female',tests:[p.id],orderDate:'2026-10-08'});await window.db.saveOrderResults(order.orderId,[{parameterId:p.id,value:0}]);await window.db.issueReport(order.orderId);return order;});
  const issued=await page.evaluate(id=>window.db.getReport(id),order.orderId);const encrypted=await page.evaluate(()=>window.db.backupEncrypted('synthetic-backup-passphrase'));
  const directoryBefore=fs.readFileSync(path.join(data,'activation-material','activation.enc'));
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({filePaths:[file]});},encrypted);const candidate=await page.evaluate(()=>window.db.prepareRestore('synthetic-backup-passphrase'));await page.evaluate(token=>window.db.confirmRestore(token,'RESTORE'),candidate.token);assert.deepEqual(fs.readFileSync(path.join(data,'activation-material','activation.enc')),directoryBefore);
  await page.reload();await page.getByLabel('Username',{exact:true}).fill('synthetic-admin');await page.getByLabel('Password',{exact:true}).fill('synthetic-licensing-password');await page.getByRole('button',{name:'Login',exact:true}).click();await page.getByRole('button',{name:'Logout',exact:true}).waitFor();assert.deepEqual(await page.evaluate(id=>window.db.getReport(id),order.orderId),issued);
  // Separate synthetic licence proves renewal and signed revocation in the actual executable.
  const created=await (await server.post('/v1/admin/create',{expiresAt:Math.floor(Date.now()/1000)+3600,seats:2,offlineSeconds:120},server.adminHeaders)).json();
  await page.evaluate(key=>window.licensing.activate(key),created.key);const second=await page.evaluate(()=>window.licensing.getStatus());
  assert.equal((await server.post('/v1/admin/renew',{licenseId:created.licenseId,expiresAt:Math.floor(Date.now()/1000)+7200,seats:2,offlineSeconds:240},server.adminHeaders)).status,200);
  const renewed=await page.evaluate(()=>window.licensing.refresh());assert.ok(renewed.offlineUntil>second.offlineUntil);
  assert.equal((await server.post('/v1/admin/revoke',{licenseId:created.licenseId},server.adminHeaders)).status,200);const revoked=await page.evaluate(()=>window.licensing.refresh());assert.equal(revoked.state,'revoked');
  assert.match(await page.evaluate(async()=>{try{await window.db.registerPatientOrder({name:'Synthetic revoked patient',tests:[1]});return 'FAIL';}catch(e){return e.message;}}),/Licence allowance ended/);
  assert.deepEqual(await page.evaluate(id=>window.db.getReport(id),order.orderId),issued);assert.ok(await page.evaluate(()=>window.db.backupEncrypted('synthetic-backup-passphrase')));
  await app.close();app=null;
  app=await _electron.launch({executablePath:exe,args:['--isolated-data-dir='+data],env});await app.firstWindow();await new Promise(r=>setTimeout(r,800));page=app.windows().find(p=>p.url().includes('/app.asar/dist/index.html'));await page.evaluate(()=>window.db.verifyUser('synthetic-admin','synthetic-licensing-password'));assert.equal((await page.evaluate(()=>window.licensing.getStatus())).state,'revoked');assert.deepEqual(await page.evaluate(id=>window.db.getReport(id),order.orderId),issued);
  const short=await (await server.post('/v1/admin/create',{expiresAt:Math.floor(Date.now()/1000)+3600,seats:2,offlineSeconds:3},server.adminHeaders)).json();
  await page.evaluate(key=>window.licensing.activate(key),short.key);await server.close();serverClosed=true;
  assert.equal((await page.evaluate(()=>window.licensing.getStatus())).allowed,true);
  assert.match(await page.evaluate(async()=>{try{await window.licensing.refresh();return 'FAIL';}catch(e){return e.message;}}),/verification failed/);
  assert.equal((await page.evaluate(()=>window.licensing.getStatus())).allowed,true);
  await page.waitForTimeout(3500);assert.equal((await page.evaluate(()=>window.licensing.getStatus())).state,'offline-ended');
  await app.evaluate(()=>{globalThis.syntheticRealClock=Date.now;Date.now=()=>syntheticRealClock()-300000;});
  assert.equal((await page.evaluate(()=>window.licensing.getStatus())).state,'clock-review');
  await app.evaluate(()=>{Date.now=syntheticRealClock;delete globalThis.syntheticRealClock;});
  assert.deepEqual(await page.evaluate(id=>window.db.getReport(id),order.orderId),issued);
  await app.close();app=null;
  const copied=path.join(root,'Synthetic restored database only');fs.mkdirSync(copied);fs.copyFileSync(path.join(data,'lab.db'),path.join(copied,'lab.db'));fs.writeFileSync(path.join(copied,'synthetic-qa.json'),JSON.stringify({purpose:'synthetic-packaged-qa',directory:copied}));
  app=await _electron.launch({executablePath:exe,args:['--isolated-data-dir='+copied],env});await app.firstWindow();await new Promise(r=>setTimeout(r,700));page=app.windows().find(p=>p.url().includes('/app.asar/dist/index.html'));await page.evaluate(()=>window.db.verifyUser('synthetic-admin','synthetic-licensing-password'));
  assert.equal((await page.evaluate(()=>window.licensing.getStatus())).state,'inactive');assert.deepEqual(await page.evaluate(id=>window.db.getReport(id),order.orderId),issued);
  const review={version:require('../package.json').version,syntheticExecutable:exe,service:'Local Miniflare only',activation:true,renewal:true,revocation:true,backupDoesNotTransferActivation:true,restart:true,serverFailurePreservesAllowance:true,actualOfflineDeadline:true,processClockRollback:true};fs.writeFileSync(path.join(artifact,'packaged-licensing.json'),JSON.stringify(review,null,2));
  console.log('Packaged licensing passed: activation, DPAPI, renewal/revocation, restart, server failure/offline deadline, process-clock rollback, clinical-backup isolation and safe retained records.');
 }finally{await app?.close();if(!serverClosed)await server.close();if(!root.startsWith(os.tmpdir()+path.sep)||!path.basename(root).startsWith('patholy-packaged-licensing-'))throw new Error('Unsafe fixture cleanup');fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
