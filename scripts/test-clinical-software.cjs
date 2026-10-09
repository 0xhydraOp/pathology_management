const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {buildPack} = require('./generate-clinical-review.cjs');
const {rules} = require('../electron/referenceIntervals.cjs');
const Database = require('../electron/database');
async function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'patholy-clinical-synthetic-'));
  let db = new Database(dir,{migrateLegacy:false});
  try {
    await db.init(); db.setupAdmin('reviewer','synthetic-clinical-password');
    db.run("INSERT INTO patients(id,patient_id,name,age,sex) VALUES(900001,'SYNTHETIC_CLINICAL','Synthetic only',30,'male')");
    db.run("INSERT INTO orders(id,patient_id,status) VALUES(900001,900001,'pending')");
    const codes=['TP','ALB','GLOB','AGRATIO','TC','HDL','TG','LDL','VLDL'];
    const params=Object.fromEntries(codes.map(code=>[code,db.get('SELECT * FROM parameters WHERE code=?',[code])]));
    for(const p of Object.values(params))db.run('INSERT INTO order_tests(order_id,parameter_id) VALUES(900001,?)',[p.id]);
    const save = values => db.saveOrderResults(900001,Object.entries(values).map(([code,value])=>({parameterId:params[code].id,value})));
    const result = code => db.get('SELECT * FROM order_results WHERE order_id=900001 AND parameter_id=?',[params[code].id]);
    const reopen=async()=>{db.close(); db=new Database(dir,{migrateLegacy:false}); await db.init();};
    await fn({save,result,reopen,params,getDb:()=>db});
  } finally {db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
function unavailable(row) {
  assert.ok(row,'A review placeholder should remain');
  assert.equal(row.result_value,null);assert.equal(row.raw_result_value,null);assert.equal(row.flag,'');
  assert.match(row.calculation_review,/review/);
}
test('review inventory exhaustively reproduces shipped values and has deterministic provenance',()=>{
  const pack=buildPack(), source=require('../pathology_parameters.json');
  assert.deepEqual(pack,buildPack());
  assert.equal(pack.parameters.length,source.parameters.length);
  assert.equal(new Set(pack.parameters.map(p=>p.code)).size,source.parameters.length);
  assert.equal(pack.catalogueSha256.length,64);
  assert.match(pack.status,/PENDING/);
  for(const p of source.parameters){
    const row=pack.parameters.find(x=>x.code===p.code);
    assert.deepEqual(row.ranges,p.ranges || []);assert.deepEqual(row.critical,p.critical || null);
    assert.equal(row.formula,p.formula || null);assert.equal(row.unit,p.unit || '');
    assert.match(row.clinicalProvenance,/Unknown/);
  }
  assert.deepEqual(pack.parameters.filter(p=>p.type==='derived').map(p=>p.code),['GLOB','AGRATIO','LDL','VLDL']);
});
test('all shipped calculated parameters, chained rounding and restart preserve software outputs',()=>fixture(async({save,result,reopen})=>{
  assert.equal(save({TP:'7.25',ALB:'4.13',TC:'200',HDL:'50',TG:'150'}).status,'complete');
  assert.equal(result('GLOB').result_value,3.12);
  assert.equal(result('AGRATIO').result_value,1.32);
  assert.equal(result('LDL').result_value,120);
  assert.equal(result('VLDL').result_value,30);
  await reopen();assert.equal(result('AGRATIO').result_value,1.32);
  save({TP:'7.255',ALB:'4.131'});
  assert.equal(result('GLOB').result_value,3.12);
  assert.equal(result('AGRATIO').raw_result_value,4.131/3.12);
  assert.equal(result('AGRATIO').result_value,Number((4.131/3.12).toFixed(2)));
}));
test('existing LDL applicability boundary and zero globulin withhold only unavailable calculations',()=>fixture(async({save,result,reopen})=>{
  save({TP:'7',ALB:'4',TC:'200',HDL:'50',TG:'400'});
  assert.equal(result('LDL').result_value,70);
  const state=save({TG:'400.01',TP:'4'});
  assert.equal(state.status,'partial');unavailable(result('LDL'));unavailable(result('AGRATIO'));
  assert.equal(result('GLOB').result_value,0);
  assert.equal(result('VLDL').result_value,80);
  await reopen();unavailable(result('LDL'));unavailable(result('AGRATIO'));
}));
test('cycles in ordered formula dependencies never complete and clear previous derived values',()=>fixture(async({save,result,getDb,params})=>{
  save({TP:'7',ALB:'4',TC:'200',HDL:'50',TG:'150'});
  getDb().run("UPDATE formulas SET formula_expression='AGRATIO + 1',dependencies='AGRATIO' WHERE parameter_id=?",[params.GLOB.id]);
  assert.equal(save({ALB:'4.1'}).status,'partial');
  unavailable(result('GLOB'));unavailable(result('AGRATIO'));
}));
test('changed known input/output units withhold calculated results, survive restart and resume safely',()=>fixture(async({save,result,reopen,getDb,params})=>{
  assert.equal(save({TP:'7',ALB:'4',TC:'200',HDL:'50',TG:'150'}).status,'complete');
  getDb().run("UPDATE parameters SET unit='mmol/L' WHERE id=?",[params.TG.id]);
  assert.equal(save({TG:'150'}).status,'partial');
  for(const code of ['LDL','VLDL']){unavailable(result(code));assert.match(result(code).calculation_review,/units differ/);}
  assert.throws(()=>getDb().issueReport({id:1},900001),/Missing or invalid numeric result/);
  await reopen();unavailable(result('LDL'));unavailable(result('VLDL'));
  getDb().run("UPDATE parameters SET unit='mg/dL' WHERE id=?",[params.TG.id]);
  assert.equal(save({TG:'150'}).status,'complete');
  assert.equal(result('LDL').result_value,120);assert.equal(result('LDL').calculation_review,null);
  const snapshot=JSON.parse(result('LDL').calculation_snapshot);
  assert.equal(snapshot.expression,'TC - HDL - (TG / 5)');assert.equal(snapshot.input_units.TG,'mg/dL');
  assert.equal(snapshot.output_unit,'mg/dL');assert.equal(snapshot.precision,0);assert.equal(snapshot.raw_value,120);
  getDb().run("UPDATE parameters SET unit='OTHER' WHERE id=?",[params.LDL.id]);
  assert.equal(save({TG:'150'}).status,'partial');unavailable(result('LDL'));
  assert.equal(result('VLDL').result_value,30);
}));
test('frontend/backend match and classification agree on boundaries, demographics, units and ambiguity',async()=>{
  const parseSource=fs.readFileSync(path.join(__dirname,'../src/utils/resultValidation.js'),'utf8').replace("import schema from '../../electron/numericResult.json';",`const schema=${JSON.stringify(require('../electron/numericResult.json'))};`);
  const parseUrl=`data:text/javascript;base64,${Buffer.from(parseSource).toString('base64')}`;
  const source=fs.readFileSync(path.join(__dirname,'../src/utils/referenceIntervals.js'),'utf8').replace("'./resultValidation'",JSON.stringify(parseUrl));
  const frontend=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const base={sex:'any',unit:'SYN',min_age:18,max_age:50,min_age_inclusive:true,max_age_inclusive:false,low_value:2,high_value:4,low_inclusive:true,high_inclusive:false,reference_text:''};
  const cases=[
    {rules:[base],patient:{age:30,sex:'unknown'},unit:'SYN'},
    {rules:[{...base,sex:'male'}],patient:{age:30,sex:'unknown'},unit:'SYN'},
    {rules:[base],patient:{age:null,sex:'male'},unit:'SYN'},
    {rules:[base],patient:{age:0,sex:'female'},unit:'SYN'},
    {rules:[base],patient:{age:0.5,sex:'female'},unit:'SYN'},
    {rules:[base],patient:{age:50,sex:'male'},unit:'SYN'},
    {rules:[base],patient:{age:18,sex:'male'},unit:'SYN'},
    {rules:[{...base,min_age_inclusive:false}],patient:{age:18,sex:'male'},unit:'SYN'},
    {rules:[base],patient:{age:30,sex:'male'},unit:'OTHER'},
    {rules:[base,{...base,sex:'male'}],patient:{age:30,sex:'male'},unit:'SYN'},
    {rules:[{...base,low_value:null}],patient:{age:30,sex:'male'},unit:'SYN'},
    {rules:[{...base,high_value:null}],patient:{age:30,sex:'male'},unit:'SYN'},
    {rules:[{...base,low_value:null,high_value:null,reference_text:'Synthetic reference text'}],patient:{age:30,sex:'male'},unit:'SYN'},
  ];
  for(const c of cases){
    const interval=rules.match(c.rules,c.patient,c.unit);
    const selected=frontend.selectReference(c.patient,c.rules,c.unit);
    assert.equal(selected.configured,Boolean(interval));
    assert.equal(frontend.referenceText(selected),rules.format(interval));
    for(const v of ['',0,1,2,3,4,5,'12abc',Infinity])assert.equal(frontend.referenceFlag(v,selected),rules.classify(v,interval,null));
  }
});
