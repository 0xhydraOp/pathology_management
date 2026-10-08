// Synthetic browser/PDF integration. Requires Playwright and pypdf/pypdfium2 Python.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict');
const {execFileSync}=require('child_process');
async function main(){
 const {chromium}=require(process.env.T001_PLAYWRIGHT_PATH || 'playwright');
 const {createServer}=await import('vite');
 const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'lab-print-layout-'));
 const artifacts=process.env.REFERENCE_TEST_ARTIFACT_DIR || temp;fs.mkdirSync(artifacts,{recursive:true});
 const harness=path.join(root,`.print-test-${process.pid}.html`);let browser,server;
 const base=require('../electron/printProfileSchema.json').defaults;
 const report={id:9001,pt_id:'SYNTHETIC-9001',patient_name:'Synthetic Patient',age:30,sex:'female',issued:true,report_date:'2026-10-08',issued_by:'Synthetic issuer',lab_config:{name:'Synthetic Laboratory',address:'Synthetic address',pathologist_name:'Synthetic reader',clinical_correlation_text:'Synthetic saved footer'}};
 const row=i=>({test_name:`Synthetic test ${i}`,result_value:i,unit:'mg/L',flag:i===0?'L':'',refRange:'[1 – 5]',review_message:i===0?'Manual review required: Reference interval not configured':''});
 const python=process.env.REFERENCE_TEST_PYTHON;
 assert.ok(python,'Set REFERENCE_TEST_PYTHON for PDF verification');
 try{
  fs.writeFileSync(harness,`<div id="root"></div><script type="module">
   import React from 'react';import {createRoot} from 'react-dom/client';import Layout from '/src/components/ReportPrintLayout.jsx';import Calibration from '/src/components/PrintCalibration.jsx';import '/src/index.css';
   const root=createRoot(document.getElementById('root'));window.fixture=async(report,profile,calibration=false)=>{root.render(calibration?React.createElement(Calibration,{profile,onClose:()=>root.render(null)}):React.createElement(Layout,{report,profile}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
  </script>`);
  server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1300,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+path.basename(harness));await page.waitForFunction(()=>window.fixture);
  const cases=[
   ['pad-short',{...base},{...report,results:[row(0)]}],
   ['full-short',{...base,mode:'full'},{...report,results:[row(0)]}],
   ['pad-multipage',{...base},{...report,results:Array.from({length:80},(_,i)=>row(i))}],
   ['full-multipage',{...base,mode:'full'},{...report,results:Array.from({length:80},(_,i)=>row(i))}],
   ['long-reference',{...base},{...report,results:[{...row(0),test_name:'LONGNAME '+('Long name '.repeat(40)),refRange:'LONGREF '+('Synthetic reference text '.repeat(220))+' ENDREF',review_message:'Manual review '+('Synthetic review message '.repeat(140))+' ENDREVIEW'}]}],
   ['custom-offset',{...base,paper:'custom',paperWidthMm:180,paperHeightMm:240,columnWidthsMm:[50,20,20,70],offsetXmm:2,offsetYmm:3},{...report,results:Array.from({length:45},(_,i)=>row(i))}],
   ['draft',{...base},{...report,issued:false,results:[row(0)]}],
  ];
  for(const [name,profile,data]of cases){
   await page.emulateMedia({media:'screen'});await page.evaluate(({data,profile})=>window.fixture(data,profile),{data,profile});await page.waitForFunction(()=>document.querySelector('.mm-print-layout')?.dataset.printReady==='true');
   await page.emulateMedia({media:'print'});
   const bounds=await page.locator('.mm-report-page').evaluateAll((pages,p)=>pages.map(page=>{
    const b=page.getBoundingClientRect(),patient=page.querySelector('.mm-patient-position').getBoundingClientRect(),table=page.querySelector('table').getBoundingClientRect();
    return {patientTop:(patient.top-b.top)*25.4/96,patientLeft:(patient.left-b.left)*25.4/96,patientBottom:(patient.bottom-b.top)*25.4/96,tableTop:(table.top-b.top)*25.4/96,tableBottom:(table.bottom-b.top)*25.4/96,tableRight:(table.right-b.left)*25.4/96,rows:page.querySelectorAll('tbody tr').length};
   }),profile);
   assert.ok(bounds.length>0);for(const b of bounds){assert.ok(b.rows>0,'No empty pages');assert.ok(b.patientTop>=profile.reservedHeaderMm-.1);assert.ok(b.patientBottom+1<b.tableTop);assert.ok(b.tableBottom<profile.paperHeightMm-profile.reservedFooterMm-4);assert.ok(b.tableRight<=profile.paperWidthMm-1);assert.ok(Math.abs(b.patientLeft-profile.patientXmm-profile.offsetXmm)<.1);assert.ok(Math.abs(b.patientTop-profile.patientYmm-profile.offsetYmm)<.1);}
   const pdfPath=path.join(artifacts,name+'.pdf');await page.pdf({path:pdfPath,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,margin:{top:0,bottom:0,left:0,right:0},scale:1});
   const inspected=JSON.parse(execFileSync(python,['-c',"import sys,json;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);print(json.dumps({'texts':[p.extract_text() for p in r.pages],'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages]}))",pdfPath],{encoding:'utf8'}));
   assert.equal(inspected.texts.length,bounds.length,'PDF page count equals measured plan');if(name.includes('short') || name==='draft')assert.equal(bounds.length,1);else assert.ok(bounds.length>1);
   inspected.texts.forEach((text,i)=>{assert.ok(text.includes('SYNTHETIC-9001'));assert.ok(text.includes(`Page ${i+1} of ${bounds.length}`));assert.ok(text.includes('DRAFT')===!data.issued);assert.ok(text.includes('Synthetic Laboratory')===(profile.mode==='full'));assert.ok(text.includes('Synthetic saved footer')===(profile.mode==='full'));assert.ok(Math.abs(inspected.sizes[i][0]-profile.paperWidthMm*72/25.4)<1);assert.ok(Math.abs(inspected.sizes[i][1]-profile.paperHeightMm*72/25.4)<1);});
   const text=inspected.texts.join('\n');assert.ok(text.includes('mg/L'));assert.ok(text.includes('Flag: L'));assert.ok(text.includes('Manual review'));if(name==='long-reference'){assert.ok(text.includes('ENDREF'));assert.ok(text.includes('ENDREVIEW'));assert.ok(text.includes('Continued'));}else for(const r of data.results)assert.ok(text.includes(r.test_name));
   execFileSync(python,['-c','import sys,pypdfium2 as pdfium;d=pdfium.PdfDocument(sys.argv[1]);d[0].render(scale=1.5).to_pil().save(sys.argv[2]);d[len(d)-1].render(scale=1.5).to_pil().save(sys.argv[3])',pdfPath,path.join(artifacts,name+'-first.png'),path.join(artifacts,name+'-last.png')]);
   console.log(`${name}: ${bounds.length} PDF page(s); text, geometry and identifiers verified.`);
  }
  await page.emulateMedia({media:'screen'});await page.evaluate(p=>window.fixture(null,p,true),base);await page.locator('[data-measurement-line]').waitFor();
  assert.ok(Math.abs(await page.locator('[data-measurement-line]').evaluate(e=>e.getBoundingClientRect().width)-100*96/25.4)<.1);
  await page.emulateMedia({media:'print'});const pdfPath=path.join(artifacts,'calibration.pdf');await page.pdf({path:pdfPath,preferCSSPageSize:true,printBackground:true,margin:{top:0,bottom:0,left:0,right:0}});
  const calibration=JSON.parse(execFileSync(python,['-c',"import sys,json,pdfplumber;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);p=pdfplumber.open(sys.argv[1]).pages[0];print(json.dumps({'pages':len(r.pages),'text':r.pages[0].extract_text(),'lines':[l['x1']-l['x0'] for l in p.lines if abs(l['y1']-l['y0'])<.1]}))",pdfPath],{encoding:'utf8'}));assert.equal(calibration.pages,1);assert.ok(calibration.lines.some(length=>Math.abs(length-100*72/25.4)<.1),'PDF ruler is physically 100 mm');assert.ok(calibration.text.includes('100 mm'));assert.ok(!calibration.text.includes('Synthetic Patient'));assert.ok(!calibration.text.includes('SYNTHETIC-9001'));
  execFileSync(python,['-c','import sys,pypdfium2 as pdfium;d=pdfium.PdfDocument(sys.argv[1]);d[0].render(scale=1.5).to_pil().save(sys.argv[2])',pdfPath,path.join(artifacts,'calibration.png')]);
  await page.emulateMedia({media:'screen'});const customCalibration={...base,paper:'custom',paperWidthMm:180,paperHeightMm:240,columnWidthsMm:[50,20,20,70],offsetXmm:2,offsetYmm:3};await page.evaluate(p=>window.fixture(null,p,true),customCalibration);await page.locator('[data-measurement-line]').waitFor();await page.emulateMedia({media:'print'});const customPdf=path.join(artifacts,'calibration-custom.pdf');await page.pdf({path:customPdf,preferCSSPageSize:true,printBackground:true,margin:{top:0,bottom:0,left:0,right:0}});
  const customText=JSON.parse(execFileSync(python,['-c',"import sys,json;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);print(json.dumps({'pages':len(r.pages),'text':r.pages[0].extract_text(),'width':float(r.pages[0].mediabox.width),'height':float(r.pages[0].mediabox.height)}))",customPdf],{encoding:'utf8'}));assert.equal(customText.pages,1);assert.ok(Math.abs(customText.width-180*72/25.4)<1);assert.ok(Math.abs(customText.height-240*72/25.4)<1);assert.ok(customText.text.includes('X 12, Y 58 mm'));assert.ok(customText.text.includes('X 12, Y 83 mm'));
  execFileSync(python,['-c','import sys,pypdfium2 as pdfium;d=pdfium.PdfDocument(sys.argv[1]);d[0].render(scale=1.5).to_pil().save(sys.argv[2])',customPdf,path.join(artifacts,'calibration-custom.png')]);
  await page.emulateMedia({media:'screen'});await page.evaluate(p=>window.fixture({...p.report,results:[p.row]}, {...p.base,tableYmm:60}),{report,row:row(0),base});await page.getByRole('alert').waitFor();assert.ok((await page.getByRole('alert').innerText()).includes('overlap'));assert.equal(await page.locator('.mm-report-page').count(),0);
  assert.deepEqual(errors,[]);console.log('Calibration: patient-free, one PDF page, 100 mm SVG/PDF ruler; custom calibration dimensions and offsets. Overlap blocks rendering. No browser errors.');console.log('PDF artifacts: '+artifacts);
 }finally{await browser?.close();await server?.close();fs.unlinkSync(harness);if(!process.env.REFERENCE_TEST_ARTIFACT_DIR)fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
