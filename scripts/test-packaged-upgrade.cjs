// Actual packaged main/preload/windows. Synthetic directories only. Native selection
// returns are controlled for repeatable backend integration; this is not driver QA.
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('node:assert/strict');
async function main() {
  const { _electron } = require(process.env.T001_PLAYWRIGHT_PATH || 'playwright');
  assert.ok(process.env.REFERENCE_TEST_PYTHON,'Set REFERENCE_TEST_PYTHON with pypdf and pypdfium2 for packaged PDF verification.');
  const executable = path.resolve(process.argv[2] || 'release/licensing-synthetic-qa/win-unpacked/Patholy Management System.exe');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patholy-upgrade-'));
  const data = path.join(root, 'Synthetic lab বাংলা'); fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'synthetic-qa.json'), JSON.stringify({ purpose: 'synthetic-packaged-qa', directory: data }));
  const artifacts = path.resolve(process.env.REFERENCE_TEST_ARTIFACT_DIR || 'release/dependency-upgrade-verification/packaged'); fs.mkdirSync(artifacts, { recursive: true });
  const env = { ...process.env, APPDATA: path.join(root, 'roaming'), LOCALAPPDATA: path.join(root, 'local'), ELECTRON_DEV: '1' };
  let app, page;
  async function launch(args = ['--isolated-data-dir=' + data]) {
    app = await _electron.launch({ executablePath: executable, args, env }); await app.firstWindow();
    for (let i = 0; i < 100; i++) { page = app.windows().find(p => p.url().startsWith('file:')); if (page) break; await new Promise(r => setTimeout(r, 50)); }
    assert.ok(page, 'Packaged local window required'); page.setDefaultTimeout(10000);
  }
  async function login(password) {
    await page.getByRole('button', { name: 'Login', exact: true }).waitFor();
    await page.getByLabel('Username', { exact: true }).fill('synthetic-admin'); await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click(); await page.getByRole('button', { name: 'Logout', exact: true }).waitFor();
  }
  async function selectFile(filename) {
    await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => filename ? ({ filePaths: [filename] }) : ({ canceled: true, filePaths: [] }); }, filename);
  }
  async function pdf(name, orderId, issued) {
    await page.waitForFunction(() => document.querySelector('.mm-print-layout')?.dataset.printReady === 'true');
    await page.waitForFunction(({orderId,issued,full}) => {
      const pages=document.querySelector('.mm-report-pages'),patient=pages?.querySelector('.mm-patient');
      return patient?.textContent.includes('Order #'+orderId) && Boolean(patient.querySelector('.mm-draft'))===!issued && Boolean(pages.querySelector('.mm-lab-header'))===full;
    }, {orderId,issued,full:(await page.getByLabel('Print mode').inputValue())==='full'});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.waitForTimeout(200); // Allow the native compositor to consume the committed report layout.
    const profile = await page.evaluate(() => window.db.getPrintProfile());
    profile.mode = await page.getByLabel('Print mode').inputValue();
    const bytes = await app.evaluate(async ({ app, BrowserWindow }, profile) => {
      const options = process.mainModule.require(app.getAppPath() + '/electron/printOptions.cjs').pdfPrintOptions(profile);
      return (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/app.asar/dist/index.html')).webContents.printToPDF(options)).toString('base64');
    }, profile);
    fs.writeFileSync(path.join(artifacts, name + '.pdf'), Buffer.from(bytes, 'base64'));
  }
  try {
    await launch(); await page.getByRole('button', { name: 'Create administrator', exact: true }).waitFor();
    await page.getByLabel('Username', { exact: true }).fill('synthetic-admin'); await page.getByLabel('New password', { exact: true }).fill('synthetic-original-password'); await page.getByLabel('Confirm new password', { exact: true }).fill('synthetic-original-password'); await page.getByRole('button', { name: 'Create administrator', exact: true }).click(); await login('synthetic-original-password');
    const runtime = await app.evaluate(() => ({ electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome })); assert.equal(runtime.electron, '44.7.0');
    assert.ok(process.env.PATHOLY_SYNTHETIC_LICENCE_KEY,'Run through the local synthetic licensing runner.');
    await page.evaluate(key=>window.licensing.activate(key),process.env.PATHOLY_SYNTHETIC_LICENCE_KEY);
    const created = await page.evaluate(async () => {
      const params = await window.db.read('catalogue.referenceParameters', []), numeric = params.find(p => p.code === 'HB'), qualitative = params.find(p => p.type === 'text');
      const order = await window.db.registerPatientOrder({ name: 'Synthetic upgraded runtime', age: 0, sex: 'unknown', tests: [numeric.id, qualitative.id], orderDate: '2026-10-08' });
      await window.db.saveOrderResults(order.orderId, [{ parameterId: numeric.id, value: 0 }, { parameterId: qualitative.id, value: 'Synthetic qualitative observation' }]); return order;
    });
    await page.evaluate(id => { location.hash = '/reports?order=' + id; }, created.orderId);
    await page.getByRole('button', { name: 'Preview report', exact: true }).waitFor(); await page.getByRole('button', { name: 'Preview report', exact: true }).click();
    for (let i = 0; i < 100 && app.windows().length < 2; i++) await new Promise(r => setTimeout(r, 50));
    assert.equal(app.windows().length, 2);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => !w.webContents.getURL().includes('/app.asar/dist/index.html')).forEach(w => w.close()));
    for(let i=0;i<100 && app.windows().length>1;i++)await new Promise(r=>setTimeout(r,30));
    assert.equal(app.windows().length,1);
    assert.equal((await page.evaluate(id => window.db.getReport(id), created.orderId)).issued, false);
    await pdf('draft',created.orderId,false); await page.getByRole('button', { name: 'Finalize report', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal((await page.evaluate(id => window.db.getReport(id), created.orderId)).issued, false);
    await page.getByRole('button', { name: 'Finalize report', exact: true }).click(); await page.getByRole('button', { name: 'Confirm finalization', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    const issued = await page.evaluate(id => window.db.getReport(id), created.orderId); assert.equal(issued.issued, true);
    await pdf('pad-short',created.orderId,true); await page.getByLabel('Print mode').selectOption('full'); await pdf('full-short',created.orderId,true);
    await page.evaluate(() => window.db.setLabConfig({ name: 'Synthetic later settings' }));
    assert.deepEqual(await page.evaluate(id => window.db.getReport(id), created.orderId), issued);
    const long = await page.evaluate(async () => {
      const params = (await window.db.read('catalogue.referenceParameters', [])).filter(p => p.type !== 'derived');
      const order = await window.db.registerPatientOrder({ name: 'Synthetic long upgraded report', age: 40, sex: 'female', tests: params.map(p => p.id), orderDate: '2026-10-08' });
      await window.db.saveOrderResults(order.orderId, params.map(p => ({ parameterId: p.id, value: p.type === 'text' ? 'Synthetic lengthy qualitative observation '.repeat(5) : p.id + .25 })));
      await window.db.issueReport(order.orderId); return order;
    });
    // A full reload avoids retaining a previous report selected by the route's UI state.
    await page.goto(page.url().split('#')[0] + '#/reports?order=' + long.orderId); await page.reload();
    await page.getByLabel('Print mode').waitFor();
    await page.getByLabel('Print mode').selectOption('preprinted'); await pdf('pad-multipage',long.orderId,true); await page.getByLabel('Print mode').selectOption('full'); await pdf('full-multipage',long.orderId,true);
    await page.screenshot({ path: path.join(artifacts, 'packaged-issued-report.png') });
    console.log(require('child_process').execFileSync(process.env.REFERENCE_TEST_PYTHON,[path.join(__dirname,'verify-packaged-pdfs.py'),artifacts],{encoding:'utf8'}));
    const exportPath = await page.evaluate(() => window.db.exportOrdersExcel({ dateFrom: '2026-10-08', dateTo: '2026-10-08' }));
    const workbook = require('xlsx').readFile(exportPath); assert.ok(require('xlsx').utils.sheet_to_json(workbook.Sheets.Orders).some(row => row.patient_name === 'Synthetic upgraded runtime'));
    const backup = await page.evaluate(() => window.db.backupEncrypted('synthetic-backup-passphrase'));
    assert.ok(fs.existsSync(backup)); await selectFile(backup);
    assert.match(await page.evaluate(async () => { try { await window.db.prepareRestore('synthetic-wrong-passphrase'); return 'FAIL'; } catch (e) { return e.message; } }), /authentication/);
    let candidate = await page.evaluate(() => window.db.prepareRestore('synthetic-backup-passphrase'));
    await page.evaluate(token => window.db.cancelRestore(token), candidate.token);
    assert.deepEqual(await page.evaluate(id => window.db.getReport(id), created.orderId), issued);
    await selectFile(null); assert.deepEqual(await page.evaluate(() => window.db.prepareRestore('synthetic-backup-passphrase')), { canceled: true });
    await selectFile(backup); candidate = await page.evaluate(() => window.db.prepareRestore('synthetic-backup-passphrase'));
    await page.evaluate(() => window.db.setLabConfig({ name: 'Synthetic restore mutation' }));
    assert.match(await page.evaluate(async token => { try { await window.db.confirmRestore(token, 'RESTORE'); return 'FAIL'; } catch (e) { return e.message; } }, candidate.token), /changed/);
    candidate = await page.evaluate(() => window.db.prepareRestore('synthetic-backup-passphrase'));
    await page.evaluate(token => window.db.confirmRestore(token, 'RESTORE'), candidate.token); assert.equal(await page.evaluate(() => window.db.getSession()), null);
    await page.reload(); await login('synthetic-original-password'); assert.deepEqual(await page.evaluate(id => window.db.getReport(id), created.orderId), issued);
    const second = require('child_process').spawn(executable, ['--isolated-data-dir=' + data], { env, windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Second instance failed to exit')), 10000); second.once('error', reject); second.once('exit', code => { clearTimeout(timeout); if (code !== 0) reject(new Error('Second instance exit: ' + code)); else resolve(); }); });
    assert.ok(await page.evaluate(() => window.db.getSession())); await app.close(); app = null;
    await launch(); await login('synthetic-original-password'); assert.deepEqual(await page.evaluate(id => window.db.getReport(id), created.orderId), issued);
    // Recovery refuses the same database while normal operation owns it.
    const normal = app; await launch(['--recover-administrator']); await selectFile(data);
    assert.match(await page.evaluate(async () => { try { await window.administratorRecovery.select(); return 'FAIL'; } catch (e) { return e.message; } }), /in use/);
    await app.close(); app = normal; await app.close(); app = null;
    const before = fs.readFileSync(path.join(data, 'lab.db'));
    await launch(['--recover-administrator']); await selectFile(data); await page.getByRole('button', { name: 'Select lab data directory', exact: true }).click(); await page.getByLabel('New password', { exact: true }).waitFor();
    assert.deepEqual(fs.readFileSync(path.join(data, 'lab.db')), before); await app.close(); app = null; assert.deepEqual(fs.readFileSync(path.join(data, 'lab.db')), before);
    await launch(['--recover-administrator']); await selectFile(data); await page.getByRole('button', { name: 'Select lab data directory', exact: true }).click();
    await page.getByLabel('New password', { exact: true }).fill('synthetic-recovered-password'); await page.getByLabel('Repeat new password', { exact: true }).fill('synthetic-recovered-password'); await page.getByLabel('Type RESET ADMINISTRATOR to confirm', { exact: true }).fill('RESET ADMINISTRATOR'); await page.getByRole('button', { name: 'Replace administrator password', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Password replaced' }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'packaged-recovery.png') }); await app.close(); app = null;
    await launch(); await login('synthetic-recovered-password'); assert.deepEqual(await page.evaluate(id => window.db.getReport(id), created.orderId), issued);
    fs.writeFileSync(path.join(artifacts, 'runtime.json'), JSON.stringify(runtime, null, 2));
    console.log('Packaged upgrade passed: runtime, preview/cancel/finalization, immutable PDFs, export, encrypted restore/cancel/stale candidate, restart/second instance and closed-app packaged recovery. Artifacts: ' + artifacts);
  } finally {
    await app?.close();
    if (!root.startsWith(os.tmpdir() + path.sep) || !path.basename(root).startsWith('patholy-upgrade-')) throw new Error('Unsafe fixture cleanup');
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
