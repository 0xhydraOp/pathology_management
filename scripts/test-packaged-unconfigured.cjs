// Real production package, explicit synthetic historical records. No licensing bypass.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
async function main(){
 const {_electron}=require(process.env.T001_PLAYWRIGHT_PATH||'playwright');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patholy-unconfigured-')),data=path.join(root,'Synthetic existing lab বাংলা');fs.mkdirSync(data);fs.writeFileSync(path.join(data,'synthetic-qa.json'),JSON.stringify({purpose:'synthetic-packaged-qa',directory:data}));
 // An external test-config file and conventional env flags must not change trust.
 fs.writeFileSync(path.join(data,'licensing-fixture.json'),JSON.stringify({syntheticFixture:true,allowed:true,serviceUrl:'http://127.0.0.1:1',publicKeys:{}}));
 const Database=require('../electron/database'),db=new Database(data,{migrateLegacy:false});let app,issued;
 try{
  await db.init();db.setupAdmin('synthetic-admin','synthetic-unconfigured-password');const parameter=db.get("SELECT id FROM parameters WHERE code='HB'").id;
  db.run("INSERT INTO patients(id,patient_id,name,age,sex) VALUES(9901,'SYNTHETIC-HISTORY','Synthetic historical patient',40,'female')");db.run("INSERT INTO orders(id,patient_id,order_date,status) VALUES(9901,9901,'2026-10-08','pending')");db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9901,?)',[parameter]);db.saveOrderResults(9901,[{parameterId:parameter,value:0}]);db.issueReport({id:1,username:'synthetic-admin'},9901);issued=db.getReport(9901);db.close();
  app=await _electron.launch({executablePath:path.resolve('release/licensed-product/win-unpacked/Patholy Management System.exe'),args:['--isolated-data-dir='+data],env:{...process.env,APPDATA:path.join(root,'roaming'),LOCALAPPDATA:path.join(root,'local'),PATHOLY_LICENSING_DISABLED:'1',ELECTRON_DEV:'1'}});await app.firstWindow();await new Promise(r=>setTimeout(r,700));const page=app.windows().find(p=>p.url().includes('/app.asar/dist/index.html'));
  await page.getByLabel('Username',{exact:true}).fill('synthetic-admin');await page.getByLabel('Password',{exact:true}).fill('synthetic-unconfigured-password');await page.getByRole('button',{name:'Login',exact:true}).click();await page.getByRole('button',{name:'Logout',exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>window.licensing.getStatus())).state,'unconfigured');assert.equal((await page.evaluate(()=>window.licensing.getStatus())).activationPendingPrerelease,true);await page.getByText('Activation-pending prerelease',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.db.getReport(9901)),issued);
  for(const name of ['registerPatientOrder','saveOrderResults','issueReport'])assert.match(await page.evaluate(async name=>{try{await window.db[name](9901,[]);return 'FAIL';}catch(e){return e.message;}},name),/Licence allowance ended/);
  assert.ok(await page.evaluate(()=>window.db.backupEncrypted('synthetic-backup-passphrase')));assert.ok(await page.evaluate(()=>window.db.exportOrdersExcel({})));
  await page.evaluate(()=>{location.hash='/reports?order=9901';});await page.getByRole('button',{name:'Preview report',exact:true}).waitFor();await page.getByRole('button',{name:'Preview report',exact:true}).click();for(let i=0;i<100&&app.windows().length<2;i++)await new Promise(r=>setTimeout(r,50));assert.equal(app.windows().length,2);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>!w.webContents.getURL().includes('/app.asar/dist/index.html')).forEach(w=>w.close()));
  console.log('Unconfigured production package passed: no flag/file bypass; authenticated historical viewing/reprint/backup/export remain available; clinical mutations denied.');
 }finally{await app?.close();if(db.db)db.close();if(!root.startsWith(os.tmpdir()+path.sep)||!path.basename(root).startsWith('patholy-unconfigured-'))throw new Error('Unsafe fixture cleanup');fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
