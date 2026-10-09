// Safe binary-to-binary upgrade rehearsal. Not an NSIS/elevated install test.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const baseline = path.resolve(process.argv[2] || '');
  const candidate = path.resolve(process.argv[3] || '');
  assert.ok(process.argv[2] && process.argv[3], 'Provide explicit baseline and candidate packaged executables');
  assert.ok(fs.statSync(baseline).isFile() && fs.statSync(candidate).isFile(), 'Both executables must exist');
  const {_electron} = require(process.env.T001_PLAYWRIGHT_PATH || 'playwright');
  const SQL=await require('sql.js')();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patholy-version-upgrade-'));
  const data = path.join(root, 'Synthetic lab বাংলা with spaces');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'synthetic-qa.json'), JSON.stringify({purpose:'synthetic-packaged-qa', directory:data}));
  const env = {...process.env, APPDATA:path.join(root,'roaming'), LOCALAPPDATA:path.join(root,'local'), ELECTRON_DEV:'1'};
  const licensedBaseline = process.argv.includes('--licensed-baseline');
  let legacySaved;
  if (licensedBaseline) {
    // Build the fixture using the published commit's database code, never production SQL IPC.
    const {execFileSync}=require('node:child_process');
    const oldSource=path.join(root,'published-42db0dc');fs.mkdirSync(oldSource);
    const paths=execFileSync('git',['ls-tree','-r','--name-only','42db0dc','--','electron','pathology_parameters.json','rate_chart.json','test_profiles.json'],{encoding:'utf8'}).trim().split(/\r?\n/);
    for(const relative of paths){const destination=path.join(oldSource,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,execFileSync('git',['show','42db0dc:'+relative]));}
    const Module=require('node:module');process.env.NODE_PATH=path.resolve('node_modules');Module._initPaths();
    const Database=require(path.join(oldSource,'electron/database.js'));
    const db=new Database(data,{migrateLegacy:false});
    try {
      await db.init();db.setupAdmin('upgrade-synthetic-admin','synthetic-upgrade-password');
      db.run("INSERT INTO parameters(id,code,name,type,unit) VALUES(9901,'SYNUPGRADE','Synthetic Upgrade Test','numeric','mg/L')");
      db.run("INSERT INTO patients(id,patient_id,name,age,sex) VALUES(9901,'SYN-UPGRADE','Synthetic licensed-code patient',38,'unknown')");
      db.run("INSERT INTO orders(id,patient_id,order_date) VALUES(9901,9901,'2026-10-10')");
      db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9901,9901)');
      const actor={id:db.get('SELECT id FROM users WHERE username=?',['upgrade-synthetic-admin']).id};
      db.saveOrderResults(9901,[{parameterId:9901,value:'0'}],actor);
      legacySaved={orderId:9901,report:db.issueReport(actor,9901),profile:db.getPrintProfile()};
    } finally {db.close();}
  }
  let app;
  function rawIssued(orderId){const database=new SQL.Database(fs.readFileSync(path.join(data,'lab.db')));try{const statement=database.prepare('SELECT payload FROM issued_reports WHERE order_id=?');try{statement.bind([orderId]);assert.ok(statement.step());return statement.getAsObject().payload;}finally{statement.free();}}finally{database.close();}}
  function assertOriginalReport(actual,expected){
    const content={...actual};
    for(const key of ['report_version','parent_version','amendment_reason','amendment_changed_fields'])delete content[key];
    assert.deepEqual(content,expected,'Only new read-only version wrapper fields may differ');
    if(actual.report_version!==undefined)assert.equal(actual.report_version,1,'Migrated original is version 1');
  }
  async function launch(executable) {
    app = await _electron.launch({executablePath:executable,args:['--isolated-data-dir='+data],env,timeout:30000});
    await app.firstWindow();
    let page;
    for (let i=0;i<100;i++) {
      page=app.windows().find(p=>p.url().includes('/app.asar/dist/index.html'));
      if(page) break;
      await new Promise(r=>setTimeout(r,50));
    }
    assert.ok(page, 'Packaged production assets must load');
    assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),path.resolve(data));
    page.setDefaultTimeout(15000);
    return page;
  }
  async function login(page) {
    await page.getByLabel('Username',{exact:true}).fill('upgrade-synthetic-admin');
    await page.getByLabel('Password',{exact:true}).fill('synthetic-upgrade-password');
    await page.getByRole('button',{name:'Login',exact:true}).click();
    await page.getByRole('button',{name:'Logout',exact:true}).waitFor();
  }
  try {
    let page=await launch(baseline);
    if(!licensedBaseline){await page.getByLabel('Username',{exact:true}).fill('upgrade-synthetic-admin');
    await page.getByLabel('New password',{exact:true}).fill('synthetic-upgrade-password');
    await page.getByLabel('Confirm new password',{exact:true}).fill('synthetic-upgrade-password');
    await page.getByRole('button',{name:'Create administrator',exact:true}).click();}
    await login(page);
    const saved=legacySaved || await page.evaluate(async()=>{
      const parameter=(await window.db.read('catalogue.referenceParameters',[])).find(p=>p.code==='HB');
      const order=await window.db.registerPatientOrder({name:'Synthetic binary upgrade patient',age:38,sex:'unknown',tests:[parameter.id],orderDate:'2026-10-10'});
      await window.db.saveOrderResults(order.orderId,[{parameterId:parameter.id,value:0}]);
      return {orderId:order.orderId,report:await window.db.issueReport(order.orderId),profile:await window.db.getPrintProfile()};
    });
    if(licensedBaseline){assert.deepEqual(await page.evaluate(id=>window.db.getReport(id),saved.orderId),saved.report,'Actual licensed-code binary must view the synthetic original');assert.equal(await page.evaluate(()=>window.licensing.getStatus().then(s=>s.activationPendingPrerelease)),true,'Published baseline must retain its configured prerelease restriction');}
    const baselineVersion=await app.evaluate(({app})=>app.getVersion());
    await app.close(); app=null;
    const originalPayload=rawIssued(saved.orderId);
    const legacyBytes=Buffer.from('Synthetic opaque obsolete activation material; no valid licence or secret');
    if(licensedBaseline){fs.mkdirSync(path.join(data,'activation-material'),{recursive:true});fs.writeFileSync(path.join(data,'activation-material','activation.enc'),legacyBytes);}
    page=await launch(candidate);
    assert.equal(await page.getByRole('button',{name:'Create administrator',exact:true}).count(),0,'Existing users must not return to bootstrap');
    await login(page);
    assertOriginalReport(await page.evaluate(id=>window.db.getReport(id),saved.orderId),saved.report);
    assert.deepEqual(await page.evaluate(()=>window.db.getPrintProfile()),saved.profile,'Print profile must survive');
    const candidateVersion=await app.evaluate(({app})=>app.getVersion());
    await app.close(); app=null;
    page=await launch(candidate); await login(page);
    assertOriginalReport(await page.evaluate(id=>window.db.getReport(id),saved.orderId),saved.report);
    await app.close(); app=null;
    assert.equal(rawIssued(saved.orderId),originalPayload,'Raw issued_reports.payload bytes must remain identical');
    if(licensedBaseline){
      assert.equal(fs.existsSync(path.join(data,'activation-material','activation.enc')),false,'Recognized obsolete activation material must be removed after verified archive');
      const archives=fs.readdirSync(path.join(data,'backups')).filter(name=>name.startsWith('offline-activation-archive-'));
      assert.equal(archives.length,1);assert.deepEqual(fs.readFileSync(path.join(data,'backups',archives[0],'activation.enc')),legacyBytes);
    }
    console.log(JSON.stringify({status:'PASS',baselineVersion,candidateVersion,licensedBaseline,scope:'isolated packaged binary replacement and restart; existing credentials, zero result, issued snapshot, print profile, spaces/Bengali path; NOT installer/uninstaller/elevation or power-loss testing'}));
  } finally {
    await app?.close();
    assert.ok(root.startsWith(os.tmpdir()+path.sep)&&path.basename(root).startsWith('patholy-version-upgrade-'));
    fs.rmSync(root,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
