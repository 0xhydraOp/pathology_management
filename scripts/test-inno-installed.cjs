// Real per-user Inno install/reinstall/uninstall. Refuses existing operational registrations.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const registryScript=`$ErrorActionPreference='Stop';$found=@();foreach($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryHive]::LocalMachine)){foreach($view in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)){$base=[Microsoft.Win32.RegistryKey]::OpenBaseKey($hive,$view);try{foreach($id in @('com.mondal.diagnostic_is1','a2ad19b7-4173-58fc-a15b-17fed176f679','{a2ad19b7-4173-58fc-a15b-17fed176f679}')){$key=$base.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+$id);if($null-ne $key){$found+=@{id=$id;hive=$hive.ToString();view=$view.ToString()};$key.Dispose()}}}finally{$base.Dispose()}}};ConvertTo-Json -Compress -InputObject @($found)`;
function shell(script,env=process.env){return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',env,timeout:20000}).trim();}
function registrations(){return JSON.parse(shell(registryScript));}
function appRunning(){return shell("$ErrorActionPreference='Stop';$p=Get-CimInstance Win32_Process -Filter \"Name='Patholy Management System.exe' OR Name='Pathology Management System.exe'\";if(@($p).Count -gt 0){'yes'}else{'no'}")==='yes';}
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
async function main(){
 assert.equal(process.platform,'win32');assert.ok(process.argv[2]&&process.argv[3],'Provide exact installer and unpacked application directory');
 const installer=path.resolve(process.argv[2]),packaged=path.resolve(process.argv[3]),sourceExe=path.join(packaged,'Pathology Management System.exe');assert.ok(fs.statSync(installer).isFile()&&fs.statSync(sourceExe).isFile());
 const before=registrations();if(before.length||appRunning()){console.log('NOT TESTED: an existing Inno/NSIS registration or application/recovery process makes actual installer QA unsafe. Nothing installed or uninstalled.');return;}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pathology-inno-qa-')),install=path.join(root,'Synthetic install বাংলা with spaces'),data=path.join(root,'Synthetic lab data বাংলা'),group='Pathology Synthetic QA '+crypto.randomUUID();fs.mkdirSync(data);fs.writeFileSync(path.join(data,'synthetic-qa.json'),JSON.stringify({purpose:'synthetic-packaged-qa',directory:data}));
 const programs=shell("[Environment]::GetFolderPath('Programs')"),groupPath=path.join(programs,group);assert.ok(!fs.existsSync(groupPath),'Unique QA shortcut group must not exist');
 let app,installed=false,uninstalled=false;
 const { _electron }=require(process.env.T001_PLAYWRIGHT_PATH||'playwright');
 const env={...process.env,APPDATA:path.join(root,'roaming'),LOCALAPPDATA:path.join(root,'local')};
 function runSetup(){assert.equal(appRunning(),false);installed=true;execFileSync(installer,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/DIR='+install,'/GROUP='+group,'/TASKS='],{timeout:120000,stdio:'pipe'});}
 async function launch(){app=await _electron.launch({executablePath:path.join(install,'Pathology Management System.exe'),args:['--isolated-data-dir='+data],env,timeout:30000});await app.firstWindow();let page;for(let i=0;i<100;i++){page=app.windows().find(w=>w.url().includes('/app.asar/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,50));}assert.ok(page);assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),path.resolve(data));page.setDefaultTimeout(15000);return page;}
 async function login(page){await page.getByLabel('Username',{exact:true}).fill('synthetic-inno-admin');await page.getByLabel('Password',{exact:true}).fill('synthetic-inno-password');await page.getByRole('button',{name:'Login',exact:true}).click();await page.getByRole('button',{name:'Logout',exact:true}).waitFor();}
 try{
  runSetup();const installedExe=path.join(install,'Pathology Management System.exe');assert.equal(hash(installedExe),hash(sourceExe),'Installed executable must equal exact candidate');
  const own=registrations();assert.ok(own.length>0&&own.every(r=>r.id==='com.mondal.diagnostic_is1'&&r.hive==='CurrentUser'),'Only new per-user Inno registration is allowed');
  let page=await launch();await page.getByLabel('Username',{exact:true}).fill('synthetic-inno-admin');await page.getByLabel('New password',{exact:true}).fill('synthetic-inno-password');await page.getByLabel('Confirm new password',{exact:true}).fill('synthetic-inno-password');await page.getByRole('button',{name:'Create administrator',exact:true}).click();await login(page);const version=await app.evaluate(({app})=>app.getVersion());assert.equal(version,require('../package.json').version);await app.close();app=null;
  const database=path.join(data,'lab.db'),original=fs.readFileSync(database);runSetup();assert.deepEqual(fs.readFileSync(database),original,'Reinstall must not touch lab bytes');assert.equal(hash(installedExe),hash(sourceExe));page=await launch();await login(page);assert.equal(await page.getByRole('button',{name:'Create administrator',exact:true}).count(),0);await app.close();app=null;
  const finalData=fs.readFileSync(database),uninstaller=path.join(install,'unins000.exe');assert.ok(fs.statSync(uninstaller).isFile());assert.equal(appRunning(),false);execFileSync(uninstaller,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],{timeout:120000,stdio:'pipe'});uninstalled=true;
  assert.deepEqual(fs.readFileSync(database),finalData,'Uninstall must preserve separate lab data');assert.ok(!fs.existsSync(installedExe));assert.deepEqual(registrations(),before);assert.ok(!fs.existsSync(groupPath),'Unique QA shortcut group must be removed');
  console.log(JSON.stringify({status:'PASS',version,installerSHA256:hash(installer),executableSHA256:hash(sourceExe),scope:'actual per-user Inno fresh/reinstall/uninstall, synthetic local setup/login/restart, spaces/Bengali installation and data paths, matching candidate bytes, database untouched by reinstall/uninstall, registry/shortcut cleanup; elevated upgrade/cancellation/Windows10 NOT TESTED'}));
 }finally{
  await app?.close();
  if(installed&&!uninstalled){console.error('QA installation left intact for inspection; do not automatically uninstall after a failed safety assertion. Synthetic root: '+root);}
  else{assert.ok(root.startsWith(os.tmpdir()+path.sep)&&path.basename(root).startsWith('pathology-inno-qa-'));fs.rmSync(root,{recursive:true,force:true});}
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
