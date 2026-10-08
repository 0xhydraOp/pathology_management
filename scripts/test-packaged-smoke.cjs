// Real packaged executable/main/preload. No IPC stubs, SQL bypasses or real lab data.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
async function main(){
 const {_electron}=require(process.env.T001_PLAYWRIGHT_PATH||'playwright');
 const executable=path.resolve(process.argv[2]||'release/licensing-synthetic-qa/win-unpacked/Patholy Management System.exe');
 if(!fs.existsSync(executable))throw new Error('Packaged executable missing');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patholy-packaged-smoke-')),data=path.join(root,'Synthetic বাংলা lab');
 fs.mkdirSync(data);fs.writeFileSync(path.join(data,'synthetic-qa.json'),JSON.stringify({purpose:'synthetic-packaged-qa',directory:data}));
 for(const dir of ['roaming','local'])fs.mkdirSync(path.join(root,dir));let app;
 try{
  app=await _electron.launch({executablePath:executable,args:['--isolated-data-dir='+data],env:{...process.env,APPDATA:path.join(root,'roaming'),LOCALAPPDATA:path.join(root,'local'),ELECTRON_DEV:'1'},timeout:20000});
  await app.firstWindow();let page;for(let attempt=0;attempt<100&&!page;attempt++){page=app.windows().find(p=>p.url().startsWith('file:'));if(!page)await new Promise(r=>setTimeout(r,50));}
  if(!page)throw new Error('Production application window missing');page.setDefaultTimeout(8000);
  await page.getByRole('button',{name:'Create administrator',exact:true}).waitFor();
  assert.ok((await page.title()).endsWith('v'+require('../package.json').version));
  assert.ok((await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('file:')).getTitle())).endsWith('v'+require('../package.json').version));
  const runtime=await app.evaluate(({app,BrowserWindow})=>({packaged:app.isPackaged,version:app.getVersion(),data:app.getPath('userData'),prefs:BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('file:')).webContents.getLastWebPreferences()}));
  assert.equal(runtime.packaged,true);assert.equal(path.resolve(runtime.data),path.resolve(data));assert.equal(runtime.prefs.sandbox,true);assert.equal(runtime.prefs.contextIsolation,true);assert.equal(runtime.prefs.nodeIntegration,false);assert.ok(page.url().includes('/app.asar/dist/index.html'));
  assert.deepEqual(await page.evaluate(()=>({require:typeof require,process:typeof process,sql:typeof window.db.run})),{require:'undefined',process:'undefined',sql:'undefined'});
  await page.getByLabel('Username',{exact:true}).fill('synthetic-admin');await page.getByLabel('New password',{exact:true}).fill('synthetic-packaged-password');await page.getByLabel('Confirm new password',{exact:true}).fill('synthetic-packaged-password');await page.getByRole('button',{name:'Create administrator',exact:true}).click();await page.getByRole('button',{name:'Login',exact:true}).waitFor();
  async function login(username,password){await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Login',exact:true}).click();await page.getByRole('button',{name:'Logout',exact:true}).waitFor();}
  await login('synthetic-admin','synthetic-packaged-password');assert.ok((await page.locator('header').innerText()).includes('v'+require('../package.json').version));
  assert.ok(process.env.PATHOLY_SYNTHETIC_LICENCE_KEY,'Run through the local synthetic licensing runner.');
  await page.evaluate(key=>window.licensing.activate(key),process.env.PATHOLY_SYNTHETIC_LICENCE_KEY);
  await page.evaluate(()=>window.db.manageUser({username:'synthetic-staff',role:'staff',password:'synthetic-staff-password'}));await page.getByRole('button',{name:'Logout',exact:true}).click();await login('synthetic-staff','synthetic-staff-password');
  assert.match(await page.evaluate(async()=>{try{await window.db.setLabConfig({name:'spoofed-admin'});return 'FAIL';}catch(e){return e.message;}}),/Admin authorization/);
  const record=await page.evaluate(async()=>{const params=await window.db.read('catalogue.referenceParameters',[]),hb=params.find(p=>p.code==='HB'),text=params.find(p=>p.type==='text');const created=await window.db.registerPatientOrder({name:'Synthetic packaged fixture',age:0,sex:'unknown',tests:[hb.id,text.id],orderDate:'2026-10-08'});const saved=await window.db.saveOrderResults(created.orderId,[{parameterId:hb.id,value:0},{parameterId:text.id,value:'Synthetic qualitative observation'}]);return {created,saved};});assert.equal(record.saved.status,'complete');
  const issued=await page.evaluate(id=>window.db.issueReport(id),record.created.orderId);assert.equal(issued.issued,true);assert.equal(issued.issued_by,'synthetic-staff');
  assert.match(await page.evaluate(async id=>{try{await window.db.saveOrderResults(id,[]);return 'FAIL';}catch(e){return e.message;}},record.created.orderId),/read-only/);
  const before=page.url();await page.evaluate(()=>{window.open('https://blocked.invalid/');const a=document.createElement('a');a.href='https://blocked.invalid/';document.body.append(a);a.click();a.remove();});assert.equal(page.url(),before);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  console.log('Packaged smoke passed: fresh setup, branded identity, production assets, actual main/preload, sandbox/Node isolation, staff denial, registration, zero/qualitative results, atomic issuance, immutable edits and navigation/new-window denial.');
 }finally{await app?.close();const resolved=path.resolve(root);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('patholy-packaged-smoke-'))throw new Error('Unsafe fixture cleanup');fs.rmSync(resolved,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
