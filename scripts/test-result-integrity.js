const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-result-env-'));
process.env.APPDATA = sandbox;
process.env.USERPROFILE = sandbox;
process.env.HOME = sandbox;
process.on('exit', () => fs.rmSync(sandbox, { recursive: true, force: true }));
const Database = require('../electron/database');

async function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-results-'));
  let db = new Database(dir, { migrateLegacy: false });
  try {
    await db.init();
    db.run("INSERT INTO patients(id,patient_id,name) VALUES(9001,'SYNTHETIC','Synthetic Patient')");
    db.run("INSERT INTO orders(id,patient_id,status) VALUES(9001,9001,'pending')");
    for (const [id, type] of [[9001,'numeric'],[9002,'numeric'],[9003,'text'],[9004,'derived'],[9005,'numeric']]) {
      db.run('INSERT INTO parameters(id,code,name,type,decimal_places) VALUES(?,?,?,?,2)', [id,`SYN${id}`,`Synthetic ${id}`,type]);
    }
    for (const id of [9001,9002]) db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,?)',[id]);
    const reopen = async () => {
      db.close();
      db = new Database(dir, { migrateLegacy: false });
      await db.init();
      return db;
    };
    await fn(db, reopen);
  } finally { db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
}
const change = (parameterId, value) => ({ parameterId, value, flag:'N' });
const status = db => db.get('SELECT status FROM orders WHERE id=9001').status;

test('blank, zero, decimals, abnormal values, clearing and reopen', () => fixture(async (db,reopen) => {
  db.saveOrderResults(9001,[change(9001,'  ')]);
  assert.equal(status(db),'pending');
  db.saveOrderResults(9001,[change(9001,'0')]);
  assert.equal(status(db),'partial');
  db.saveOrderResults(9001,[change(9002,'-12345.67')]);
  assert.equal(status(db),'complete');
  db = await reopen();
  assert.equal(status(db),'complete');
  assert.equal(db.get('SELECT result_value FROM order_results WHERE parameter_id=9001').result_value,0);
  assert.equal(db.get('SELECT result_value FROM order_results WHERE parameter_id=9002').result_value,-12345.67);
  db.saveOrderResults(9001,[change(9001,'')]);
  db = await reopen();
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT * FROM order_results WHERE parameter_id=9001'),null);
}));

test('malformed and non-finite values reject the entire save', () => fixture(async db => {
  assert.equal(typeof db.saveOrderResults, 'function');
  for (const value of ['12abc','1.2.3','NaN','Infinity','-Infinity','1e999',NaN,Infinity,-Infinity,{},true,'0x12']) {
    assert.throws(() => db.saveOrderResults(9001,[change(9001,'12.25'),change(9002,value)]));
    assert.equal(status(db),'pending');
    assert.equal(db.get('SELECT COUNT(*) AS n FROM order_results WHERE order_id=9001').n,0);
  }
}));

test('frontend and backend numeric validation agree', async () => {
  const { parseNumericResult: backend } = require('../electron/resultValidation.cjs');
  const source = fs.readFileSync(path.join(__dirname,'../src/utils/resultValidation.js'),'utf8')
    .replace("import schema from '../../electron/numericResult.json';", `const schema = ${JSON.stringify(require('../electron/numericResult.json'))};`);
  const frontend = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  for (const value of ['', '  ',null,undefined,0,'0','12.25','-.25','1e2','12abc','NaN','Infinity',Infinity,NaN,'0x12',true]) {
    let expected;
    try { expected=backend(value); } catch { assert.throws(()=>frontend.parseNumericResult(value)); continue; }
    assert.equal(frontend.parseNumericResult(value),expected);
    assert.equal(frontend.isValidNumericResult(value),expected!==null);
  }
});

test('explicit migration opt-out does not inspect the legacy location', async () => {
  const legacy = Database.legacyAppDataDir;
  Database.legacyAppDataDir = () => { throw new Error('Legacy data must not be inspected'); };
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-no-migration-'));
  const db=new Database(dir,{migrateLegacy:false});
  try { await db.init(); assert.equal(db.get('SELECT COUNT(*) AS n FROM patients').n,0); }
  finally { Database.legacyAppDataDir=legacy; db.close(); fs.rmSync(dir,{recursive:true,force:true}); }
});

test('text, no ordered tests, and invalid saved numeric rows', () => fixture(async (db,reopen) => {
  db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,9003)');
  db.run("INSERT INTO order_results(order_id,parameter_id,result_value) VALUES(9001,9001,'12abc')");
  db.saveOrderResults(9001,[change(9002,'1.25'),change(9003,'  ')]);
  assert.equal(status(db),'partial');
  db.saveOrderResults(9001,[change(9001,'0'),change(9003,'Synthetic text')]);
  assert.equal(status(db),'complete');
  db.saveOrderResults(9001,[change(9003,'')]);
  db=await reopen();
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT * FROM order_results WHERE parameter_id=9003'),null);
  db.run('DELETE FROM order_tests WHERE order_id=9001');
  assert.equal(db.saveOrderResults(9001,[]).status,'pending');
}));

test('unrelated results never complete an order and unrelated edits reject', () => fixture(async db => {
  db.run('INSERT INTO order_results(order_id,parameter_id,result_value) VALUES(9001,9005,42)');
  db.saveOrderResults(9001,[change(9001,'1')]);
  assert.equal(status(db),'partial');
  assert.throws(() => db.saveOrderResults(9001,[change(9005,'2')]));
}));

test('SQL failure rolls back values and status, including on reopen', () => fixture(async (db,reopen) => {
  db.saveOrderResults(9001,[change(9001,'1')]);
  db.run("CREATE TRIGGER fail_result BEFORE INSERT ON order_results WHEN NEW.parameter_id=9002 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  assert.throws(() => db.saveOrderResults(9001,[change(9001,'9'),change(9002,'2')]), /synthetic failure/);
  db = await reopen();
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT result_value FROM order_results WHERE parameter_id=9001').result_value,1);
}));

test('persistence failure restores memory and leaves committed file unchanged', () => fixture(async (db,reopen) => {
  db.saveOrderResults(9001,[change(9001,'1')]);
  const write = fs.renameSync;
  fs.renameSync = () => { throw new Error('synthetic disk failure'); };
  try { assert.throws(() => db.saveOrderResults(9001,[change(9001,'9'),change(9002,'2')]), /synthetic disk failure/); }
  finally { fs.renameSync = write; }
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT result_value FROM order_results WHERE parameter_id=9001').result_value,1);
  db = await reopen();
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT result_value FROM order_results WHERE parameter_id=9001').result_value,1);
}));

test('status update failure rolls back all related result changes', () => fixture(async (db,reopen) => {
  db.saveOrderResults(9001,[change(9001,'1')]);
  db.run("CREATE TRIGGER fail_status BEFORE UPDATE OF status ON orders BEGIN SELECT RAISE(ABORT,'synthetic status failure'); END");
  assert.throws(()=>db.saveOrderResults(9001,[change(9001,''),change(9002,'2')]),/synthetic status failure/);
  db=await reopen();
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT result_value FROM order_results WHERE parameter_id=9001').result_value,1);
  assert.equal(db.get('SELECT * FROM order_results WHERE parameter_id=9002'),null);
}));

test('snapshot flush failure rolls back memory and persistence', () => fixture(async (db,reopen) => {
  db.saveOrderResults(9001,[change(9001,'1')]);
  const flush=fs.fsyncSync;
  fs.fsyncSync=()=>{throw new Error('synthetic flush failure');};
  try { assert.throws(()=>db.saveOrderResults(9001,[change(9001,'9'),change(9002,'2')]),/synthetic flush failure/); }
  finally { fs.fsyncSync=flush; }
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT result_value FROM order_results WHERE parameter_id=9001').result_value,1);
  db=await reopen();
  assert.equal(db.get('SELECT result_value FROM order_results WHERE parameter_id=9001').result_value,1);
  assert.ok(!fs.readdirSync(db.dataRoot).some(name=>name.endsWith('.tmp')));
}));

test('abnormal results ignore bounds and derived flags use unrounded calculations', () => fixture(async db => {
  db.run('UPDATE parameters SET min_allowed_value=10,max_allowed_value=20 WHERE id=9001');
  db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,9004)');
  db.run("INSERT INTO formulas(parameter_id,formula_expression,dependencies) VALUES(9004,'SYN9001 / SYN9002','SYN9001,SYN9002')");
  db.run("INSERT INTO parameter_ranges(parameter_id,sex,min_age,max_age,high_value) VALUES(9004,'any',0,150,1.003)");
  db.saveOrderResults(9001,[change(9001,'1.004'),change(9002,'1')]);
  assert.equal(status(db),'complete');
  const result=db.get('SELECT result_value,flag FROM order_results WHERE parameter_id=9004');
  assert.equal(result.result_value,1);
  assert.equal(result.flag,'H');
}));

test('batch and normal saves refresh derived results; missing and infinity stay incomplete', () => fixture(async (db,reopen) => {
  db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,9004)');
  db.run("INSERT INTO formulas(parameter_id,formula_expression,dependencies) VALUES(9004,'SYN9001 / SYN9002','SYN9001,SYN9002')");
  db.saveOrderResults(9001,[change(9001,'10'),change(9002,'2')]);
  assert.equal(status(db),'complete');
  assert.equal(db.get('SELECT result_value FROM order_results WHERE parameter_id=9004').result_value,5);
  db.saveOrderResults(9001,[change(9002,'0')]);
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT * FROM order_results WHERE parameter_id=9004'),null);
  db.saveOrderResults(9001,[change(9002,'')]);
  db = await reopen();
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT * FROM order_results WHERE parameter_id=9004'),null);
}));

test('backend derived calculation rejects executable expressions', () => fixture(async db => {
  db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(9001,9004)');
  db.run("INSERT INTO formulas(parameter_id,formula_expression,dependencies) VALUES(9004,'process.exit(99)','')");
  db.saveOrderResults(9001,[change(9001,'1'),change(9002,'2')]);
  assert.equal(status(db),'partial');
  assert.equal(db.get('SELECT * FROM order_results WHERE parameter_id=9004'),null);
}));
