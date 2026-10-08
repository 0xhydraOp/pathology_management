// Optional real-browser regression. Set T001_PLAYWRIGHT_PATH to a Playwright module path.
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const Database = require('../electron/database');

async function main() {
  const { chromium } = require(process.env.T001_PLAYWRIGHT_PATH || 'playwright');
  const { createServer } = await import('vite');
  const root = path.resolve(__dirname,'..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'lab-ui-'));
  const db = new Database(dir,{migrateLegacy:false});
  const harness = path.join(root,`.t001-${process.pid}.html`);
  const baselineSource = process.env.T001_BASELINE === '1' ? path.join(root,'src/pages',`.t001-baseline-${process.pid}.jsx`) : null;
  let server, browser;
  try {
    await db.init();
    db.run("INSERT INTO patients(id,patient_id,name,age,sex) VALUES(9001,'SYNTHETIC','Synthetic Patient',30,'male')");
    db.run("INSERT INTO orders(id,patient_id,order_date,status) VALUES(9001,9001,'2026-10-07','pending')");
    for (const id of [9001,9002]) {
      db.run("INSERT INTO parameters(id,code,name,type,section,display_order,decimal_places) VALUES(?,?,?,'numeric','Synthetic',?,2)",[id,`SYN${id}`,`Synthetic ${id}`,id]);
      db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,?)',[id]);
    }
    if (baselineSource) fs.writeFileSync(baselineSource,execFileSync('git',['show','902cebda:src/pages/ResultEntrySimple.jsx'],{cwd:root}));
    const component = baselineSource ? `/src/pages/${path.basename(baselineSource)}` : '/src/pages/ResultEntrySimple.jsx';
    fs.writeFileSync(harness,`<div id="root"></div><script type="module">
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {HashRouter} from 'react-router-dom';
      import ResultEntry from '${component}';
      import ToastProvider from '/src/components/ToastProvider.jsx';
      createRoot(document.getElementById('root')).render(React.createElement(HashRouter,null,React.createElement(ToastProvider,null,React.createElement(ResultEntry))));
    </script>`);
    server=await createServer({root,server:{host:'127.0.0.1',port:0}});
    await server.listen();
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.exposeFunction('testDb',({method,args})=> {
      assert.ok(['all','get','run','saveOrderResults'].includes(method));
      return db[method](...args);
    });
    await page.addInitScript(()=> {
      window.db=Object.fromEntries(['all','get','run','saveOrderResults'].map(method=>[method,(...args)=>window.testDb({method,args})]));
    });
    const url=server.resolvedUrls.local[0]+path.basename(harness);
    await page.goto(url+'#/result-entry?order=9001');
    const inputs=page.locator('table input');
    await inputs.first().waitFor();
    await inputs.nth(0).fill('0');
    await inputs.nth(1).fill('12.25');
    await page.getByRole('button',{name:'Save only',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('button[title="Save without printing, stay on current order"]')?.disabled===false);
    assert.equal(db.get('SELECT status FROM orders WHERE id=9001').status,'complete');
    await inputs.nth(0).fill('');
    const clearedProgress = await page.locator('body').innerText();
    await page.getByRole('button',{name:'Save only',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('button[title="Save without printing, stay on current order"]')?.disabled===false);
    assert.equal(db.get('SELECT status FROM orders WHERE id=9001').status,'partial');
    assert.ok(clearedProgress.includes('1 / 2 tests entered'));
    assert.equal(db.get('SELECT * FROM order_results WHERE parameter_id=9001'),null);
    await inputs.nth(0).fill('12abc');
    await page.getByRole('button',{name:'Save only',exact:true}).click();
    await page.getByText('Enter a finite decimal number',{exact:true}).waitFor();
    assert.equal(await inputs.nth(0).inputValue(),'12abc');
    assert.equal(db.get('SELECT status FROM orders WHERE id=9001').status,'partial');
    await page.goto(url+'#/result-entry');
    await page.reload();
    await page.getByRole('button',{name:/Batch entry/}).click();
    await page.locator('select').selectOption('9001');
    const batch=page.locator('input[inputmode="decimal"]');
    await batch.fill('0');
    await page.getByRole('button',{name:'Save & Next',exact:true}).click();
    await page.getByRole('button',{name:/Batch entry/}).waitFor();
    assert.equal(db.get('SELECT status FROM orders WHERE id=9001').status,'complete');
    await page.goto(url+'#/result-entry?order=9001');
    await page.reload();
    await page.getByRole('button',{name:'Save & Print Report',exact:true}).click();
    await page.waitForURL(/#\/reports\?order=9001&print=1$/);
    assert.deepEqual(errors,[]);
    db.close();
    const reopened=new Database(dir,{migrateLegacy:false});
    try { await reopened.init(); assert.equal(reopened.get('SELECT status FROM orders WHERE id=9001').status,'complete'); }
    finally { reopened.close(); }
    console.log('Browser regression: normal entry, clearing, malformed text, batch zero, and reopened state passed; no page errors.');
  } finally {
    await browser?.close(); await server?.close(); db.close();
    if(fs.existsSync(harness)) fs.unlinkSync(harness);
    if(baselineSource && fs.existsSync(baselineSource)) fs.unlinkSync(baselineSource);
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
