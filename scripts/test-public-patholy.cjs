'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
async function main(){
 const {chromium}=require(process.env.T001_PLAYWRIGHT_PATH||'playwright');
 const root=path.resolve(__dirname,'../website');
 const allowed=new Map([['/',['index.html','text/html']],['/patholy/',['patholy/index.html','text/html']],['/patholy/style.css',['patholy/style.css','text/css']],['/patholy/app.js',['patholy/app.js','text/javascript']],['/patholy/assets/app-dashboard.png',['patholy/assets/app-dashboard.png','image/png']],['/patholy/assets/app-results.png',['patholy/assets/app-results.png','image/png']]]);
 const server=http.createServer((req,res)=>{const item=allowed.get(new URL(req.url,'http://local').pathname);if(!item){res.writeHead(404);res.end();return;}const file=path.join(root,item[0]);if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':item[1],'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"});res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const output=path.resolve(__dirname,'../release/predeployment-verification/public-patholy');fs.mkdirSync(output,{recursive:true});let browser;
 try{
  browser=await chromium.launch({headless:true});
  for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:320,height:640}]){
   const page=await browser.newPage({viewport}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
   await page.goto(origin+'/patholy/');await page.locator('footer').scrollIntoViewIfNeeded();
   assert.equal(await page.getByRole('link',{name:'Download evaluation installer (.exe)'}).getAttribute('href'),'https://github.com/0xhydraOp/pathology_management/releases/download/v1.1.0-rc.1/Patholy.Management.System.Activation-Pending.Prerelease.Setup.1.1.0-rc.1.exe');assert.equal(await page.locator('.checksum').innerText(),'8cded59fad7e16a996e8f06d6bd2e0f7cd7652412e1c277b00fd9fbbeea7904a');await page.getByText('Version 1.1.0-rc.1 · Unsigned · Activation-pending prerelease',{exact:true}).waitFor();assert.equal(await page.locator('img').count(),2);for(const img of await page.locator('img').all())assert(await img.evaluate(e=>e.complete&&e.naturalWidth>0));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const button=page.getByRole('button',{name:'Obtain licence key for activation'});await button.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'Contact the developer'});await dialog.waitFor();
   assert.equal(await dialog.locator('#dialog-description').innerText(),'To obtain a licence key for activation, contact the developer: iamrobiul94@gmail.com');
   assert.equal(await dialog.getByRole('link',{name:'Email developer'}).getAttribute('href'),'mailto:iamrobiul94@gmail.com');
   for(let i=0;i<5;i++){await page.keyboard.press(i===0?'Shift+Tab':'Tab');assert(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)));}
   await page.screenshot({path:path.join(output,'contact-'+viewport.width+'.png')});await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert(await button.evaluate(e=>e===document.activeElement));
   await button.click();await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await dialog.isVisible(),false);assert(await button.evaluate(e=>e===document.activeElement));
   assert.equal(await page.locator('form').count(),0);await page.waitForFunction(()=>!document.documentElement.classList.contains('modal-open'));const developer=page.getByRole('link',{name:'Developer area',exact:true});assert.equal(await developer.getAttribute('href'),'https://admin.molladigital.com');await developer.focus();assert(await developer.evaluate(e=>e===document.activeElement));assert.equal(await page.locator('a[href*="admin.molladigital"]').count(),1);assert.equal(await page.locator('a[href*="license.molladigital"]').count(),0);assert.deepEqual(errors,[]);assert(requests.every(u=>u.startsWith(origin+'/patholy/')));
   assert.equal(await page.evaluate(()=>Object.keys(localStorage).length+Object.keys(sessionStorage).length),0);
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,'briefing-'+viewport.width+'.png'),fullPage:true});await page.goto(origin+'/');assert.equal(await page.getByRole('link',{name:'Developer area',exact:true}).getAttribute('href'),'https://admin.molladigital.com');assert.equal(await page.getByRole('link',{name:'Explore Patholy',exact:true}).getAttribute('href'),'/patholy/');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('form,input').count(),0);await page.screenshot({path:path.join(output,'molla-digital-'+viewport.width+'.png'),fullPage:true});await page.close();
  }
  console.log('PASS public Patholy briefing: desktop/mobile/320px, synthetic images, contact modal keyboard/Escape/Close, mailto, discreet keyboard-focusable HTTPS Developer area, no external requests/keys/storage.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
