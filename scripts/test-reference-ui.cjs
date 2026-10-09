const {registerApplicationFixture}=require('./registerApplicationFixture.cjs');
// Optional browser/PDF integration: T001_PLAYWRIGHT_PATH and REFERENCE_TEST_PYTHON select installed tools.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
const {execFileSync}=require('child_process');
const {EventEmitter}=require('events');
const Database=require('../electron/database');
const {registerApplicationIpc}=require('../electron/applicationIpc.cjs');
async function main(){
 const {chromium}=require(process.env.T001_PLAYWRIGHT_PATH || 'playwright');const {createServer}=await import('vite');
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-reference-ui-'));
 const harness=path.join(root,`.reference-test-${process.pid}.html`);let browser,server;
 const db=new Database(dir,{migrateLegacy:false});
 try{
  await db.init();if(db.credentialState().setupRequired)db.setupAdmin('admin','synthetic-admin-password');
  db.run("UPDATE lab SET pathologist_name='Synthetic original reader',clinical_correlation_text='Synthetic original footer' WHERE id=1");
  db.run("INSERT INTO parameters(id,code,name,type,unit,section,decimal_places) VALUES(9001,'SYNREF','Synthetic reference','numeric','mg/L','Synthetic',2)");
  db.run("INSERT INTO patients(id,patient_id,name,age,sex) VALUES(9001,'SYNREF','Synthetic Patient',30,'female')");
  db.run("INSERT INTO orders(id,patient_id,status,order_date) VALUES(9001,9001,'complete','2026-10-08')");
  db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,9001)');db.saveOrderResults(9001,[{parameterId:9001,value:3}]);
  const handlers=new Map(),sender=Object.assign(new EventEmitter(),{id:1}),event={sender};
  await registerApplicationFixture({handle:(name,fn)=>handlers.set(name,fn)},db,{});
  const invoke=(method,...args)=>handlers.get('db:'+method)(event,...args);
  invoke('verifyUser','admin','synthetic-admin-password');
  fs.writeFileSync(harness,`<div id="root"></div><script type="module">
   import React from 'react';import{createRoot}from'react-dom/client';import{HashRouter,Routes,Route}from'react-router-dom';
   import Settings from '/src/pages/Settings.jsx';import Reports from '/src/pages/Reports.jsx';import Results from '/src/pages/ResultEntrySimple.jsx';import ToastProvider from '/src/components/ToastProvider.jsx';import '/src/index.css';
   createRoot(document.getElementById('root')).render(React.createElement(HashRouter,null,React.createElement(ToastProvider,null,React.createElement(Routes,null,React.createElement(Route,{path:'/settings',element:React.createElement(Settings)}),React.createElement(Route,{path:'/reports',element:React.createElement(Reports)}),React.createElement(Route,{path:'/result-entry',element:React.createElement(Results)})))));
  </script>`);
  server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let prints=0,directPrints=0,failPreview=false;
  await page.exposeFunction('referenceTestDb',({method,args})=>{
   assert.ok(handlers.has('db:'+method));return invoke(method,...args);
  });
  await page.exposeFunction('referenceTestPrint',()=>{prints++;return failPreview?{ok:false,error:'Synthetic preview failure'}:{ok:true};});
  await page.exposeFunction('referenceDirectPrint',()=>{directPrints++;return {ok:false,cancelled:true};});
  await page.addInitScript(()=>{
   window.db=Object.fromEntries(['read','getPrintProfile','validatePrintProfile','setPrintProfile','getSession','listReferenceSets','saveReferenceDraft','approveReferenceDraft','getReferenceContext','getReport','issueReport','getLabConfig','getDatabaseSize','getLastBackupDate','logPrint','saveOrderResults'].map(method=>[method,(...args)=>window.referenceTestDb({method,args})]));
   window.electronPrintPreview=()=>window.referenceTestPrint();
   window.electronPrint=()=>window.referenceDirectPrint();
  });
  const url=server.resolvedUrls.local[0]+path.basename(harness);
  const goto=async route=>{
   const sameDocument=page.url().split('#')[0]===url;
   await page.goto(url+'#'+route);
   // Do not interrupt Vite's first dependency load with an immediate second navigation.
   if(sameDocument)await page.reload();
   if(route==='/settings'){await page.locator('details').filter({has:page.locator('.reference-editor').first()}).locator('summary').first().click();await page.locator('details').filter({has:page.locator('.print-profile-settings')}).locator('summary').first().click();}
  };
  await goto('/settings');await page.getByLabel('Parameter',{exact:true}).selectOption('9001');
  await page.getByRole('button',{name:'Add interval rule',exact:true}).click();
  for(const [label,value]of [['Minimum age rule 1','0'],['Maximum age rule 1','150'],['Lower limit rule 1','1'],['Upper limit rule 1','5']])await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Draft saved. Approval is required before use.',{exact:true}).waitFor();
  await goto('/result-entry?order=9001');await page.locator('table input').waitFor();
  assert.ok((await page.locator('table').innerText()).includes('Reference interval not configured'));
  assert.equal((await page.locator('table tbody tr').last().locator('td').last().innerText()).trim(),'');
  await goto('/settings');await page.getByLabel('Parameter',{exact:true}).selectOption('9001');
  await page.getByRole('button',{name:'Approve selected draft',exact:true}).click();await page.getByText('Reference intervals approved. Issued reports remain unchanged.',{exact:true}).waitFor();
  await page.setViewportSize({width:480,height:900});
  assert.ok(await page.locator('.reference-editor').first().isVisible());
  if(process.env.REFERENCE_TEST_ARTIFACT_DIR){fs.mkdirSync(process.env.REFERENCE_TEST_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.REFERENCE_TEST_ARTIFACT_DIR,'reference-editor.png'),fullPage:true});}
  await page.setViewportSize({width:1200,height:900});
  await page.getByLabel('Horizontal offset (+ right) (mm)',{exact:true}).fill('1');await page.getByRole('button',{name:'Save print profile',exact:true}).click();await page.getByText('Print profile saved locally. Issued clinical content is unchanged.',{exact:true}).waitFor();assert.equal(db.getPrintProfile().offsetXmm,1);
  await page.getByRole('button',{name:'Open calibration page',exact:true}).click();await page.getByRole('dialog',{name:'Patient-free print calibration'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('button',{name:'Open calibration page',exact:true}).evaluate(e=>e===document.activeElement),true);
  await goto('/reports?order=9001');await page.locator('.report-print table').waitFor();
  assert.ok((await page.locator('.report-print table').innerText()).includes('[1 – 5]'));
  await page.getByRole('button',{name:'Preview report',exact:true}).click();await page.getByText(/Preview opened/).waitFor();assert.equal(prints,1);
  assert.equal(db.getReport(9001).issued,false);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM report_print_log WHERE order_id=9001').n,0);
  await page.getByRole('button',{name:'Print report',exact:true}).click();await page.getByText('Print cancelled.',{exact:true}).waitFor();assert.equal(db.getReport(9001).issued,false);
  await page.getByRole('button',{name:'Finalize report',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(db.getReport(9001).issued,false);
  db.saveOrderResults(9001,[{parameterId:9001,value:3}]);
  await page.getByRole('button',{name:'Finalize report',exact:true}).click();
  db.run("CREATE TRIGGER synthetic_preview_issue_failure BEFORE INSERT ON issued_reports BEGIN SELECT RAISE(ABORT,'Synthetic finalization failure'); END");
  await page.getByRole('button',{name:'Confirm finalization',exact:true}).click();await page.getByText(/Report was not finalized: Synthetic finalization failure/).waitFor();assert.equal(db.getReport(9001).issued,false);assert.equal(db.get("SELECT report_status FROM orders WHERE id=9001").report_status,'draft');
  db.run('DROP TRIGGER synthetic_preview_issue_failure');await page.getByRole('button',{name:'Confirm finalization',exact:true}).click();await page.getByText(/Report finalized/).waitFor();
  const snapshot=db.getReport(9001);assert.equal(snapshot.results[0].unit,'mg/L');
  const printedBefore=await page.locator('.report-print').innerText();
  await page.getByLabel('Print mode',{exact:true}).selectOption('full');await page.waitForFunction(()=>document.querySelector('.mm-print-layout')?.dataset.printReady==='true' && document.querySelector('.mm-lab-header'));const printedFullBefore=await page.locator('.report-print').innerText();assert.ok(printedFullBefore.includes('Synthetic original footer'));
  await page.getByLabel('Print mode',{exact:true}).selectOption('preprinted');await page.waitForFunction(()=>document.querySelector('.mm-print-layout')?.dataset.printReady==='true' && !document.querySelector('.mm-lab-header'));
  const active=db.listReferenceSets(9001).find(s=>s.status==='approved');const rules=active.rules.map(r=>({...r,high_value:2}));
  const draft=invoke('saveReferenceDraft',9001,rules,active.id);invoke('approveReferenceDraft',draft.id);
  db.run("UPDATE order_results SET result_value=99,flag='C' WHERE order_id=9001");
  db.run("UPDATE parameters SET name='Synthetic changed test',unit='other' WHERE id=9001");
  db.run("UPDATE lab SET pathologist_name='Synthetic changed reader',clinical_correlation_text='Synthetic changed footer',default_printed_by='Synthetic changed printer' WHERE id=1");
  await page.clock.setFixedTime(new Date(Date.now()+2*86400000));
  await page.reload();await page.locator('.report-print table').waitFor();assert.ok((await page.locator('.report-print table').innerText()).includes('[1 – 5]'));
  assert.equal(await page.locator('.report-print').innerText(),printedBefore);
  await page.getByLabel('Print mode',{exact:true}).selectOption('full');await page.waitForFunction(()=>document.querySelector('.mm-print-layout')?.dataset.printReady==='true' && document.querySelector('.mm-lab-header'));assert.equal(await page.locator('.report-print').innerText(),printedFullBefore);
  await page.getByLabel('Print mode',{exact:true}).selectOption('preprinted');await page.waitForFunction(()=>document.querySelector('.mm-print-layout')?.dataset.printReady==='true' && !document.querySelector('.mm-lab-header'));
  await page.emulateMedia({media:'print'});assert.ok(await page.locator('.report-print table').isVisible());
  if(process.env.REFERENCE_TEST_PYTHON){
   const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});
   const inspected=JSON.parse(execFileSync(process.env.REFERENCE_TEST_PYTHON,['-c',"import sys,io,json;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()));print(json.dumps({'text':'\\n'.join(p.extract_text() for p in r.pages),'pages':len(r.pages)}))"],{input:pdf,encoding:'utf8'}));
   assert.ok(inspected.text.includes('mg/L'));assert.ok(/\[1\s*[–-]\s*5\]/.test(inspected.text));assert.ok(inspected.text.includes('Synthetic reference'));assert.ok(!inspected.text.includes('Parameter reference intervals'));
   const pdfPath=path.join(process.env.REFERENCE_TEST_ARTIFACT_DIR || dir,'reference-pad-report.pdf');fs.writeFileSync(pdfPath,pdf);
   if(process.env.REFERENCE_TEST_ARTIFACT_DIR)execFileSync(process.env.REFERENCE_TEST_PYTHON,['-c','import sys,pypdfium2 as pdfium;doc=pdfium.PdfDocument(sys.argv[1]);doc[0].render(scale=1.5).to_pil().save(sys.argv[2])',pdfPath,path.join(process.env.REFERENCE_TEST_ARTIFACT_DIR,'reference-pad-report.png')]);
   console.log(`Print PDF verified: ${inspected.pages} page(s); saved unit and interval retained in pad output.`);
  }
  await page.emulateMedia({media:'screen'});
  await goto('/reports?order=9001&print=1');await page.getByText(/Preview opened/).waitFor();assert.equal(prints,2);
  failPreview=true;await goto('/reports?order=9001&print=1&fallback=1');await page.getByText('Synthetic preview failure',{exact:true}).waitFor();assert.equal(directPrints,1);
  assert.equal(await page.locator('.report-print').innerText(),printedBefore);
  db.run("UPDATE parameters SET name='Synthetic reference',unit='mg/L' WHERE id=9001");
  db.run('UPDATE patients SET age=0 WHERE id=9001');
  db.run("INSERT INTO orders(id,patient_id,status,order_date) VALUES(9002,9001,'pending','2026-10-08')");
  db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9002,9001)');db.saveOrderResults(9002,[{parameterId:9001,value:3}]);
  await goto('/result-entry?order=9002');await page.locator('table input').waitFor();
  assert.ok((await page.locator('table').innerText()).includes('Precise age required'));
  assert.equal((await page.locator('table tbody tr').last().locator('td').last().innerText()).trim(),'');
  await goto('/reports?order=9002');await page.locator('.report-print table').waitFor();assert.ok((await page.locator('.report-print table').innerText()).includes('Precise age required'));
  db.run("INSERT INTO users(id,username,password_hash,role) SELECT 9009,'synthetic-staff',password_hash,'staff' FROM users WHERE id=1");invoke('logout');invoke('verifyUser','synthetic-staff','synthetic-admin-password');await goto('/settings');await page.getByLabel('Parameter',{exact:true}).selectOption('9001');assert.equal(await page.getByRole('button',{name:'Add interval rule',exact:true}).isDisabled(),true);
  assert.deepEqual(db.getReport(9001),snapshot);assert.deepEqual(errors,[]);
  console.log('Browser checks passed: draft/approval, missing interval, responsive editor, issued/reprinted interval, read-only preview/cancellation and explicit finalization, and read-only settings. No page errors.');
 }finally{await browser?.close();await server?.close();db.close();if(fs.existsSync(harness))fs.unlinkSync(harness);fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
