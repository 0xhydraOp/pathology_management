const catalogue=require('../pathology_parameters.json');
const source=new Map(catalogue.parameters.map(p=>[p.code,p]));
function capture(test,formula,tests){
 const dependencies=(formula.dependencies||'').split(',').map(s=>s.trim()).filter(Boolean);
 const shipped=source.get(test.code),known=shipped?.formula===formula.formula_expression && JSON.stringify(shipped.depends_on)===JSON.stringify(dependencies);
 const input_units=Object.fromEntries(dependencies.map(code=>[code,tests.find(p=>p.code===code)?.unit||'']));
 const expected=known?Object.fromEntries(dependencies.map(code=>[code,source.get(code)?.unit||''])):null;
 const result={expression:formula.formula_expression,dependencies,input_units,output_unit:test.unit||'',precision:test.decimal_places??0,provenance:known?`shipped-catalogue-${catalogue.version}`:'configured-formula-source-unknown'};
 if(known && ((test.unit||'')!==(shipped.unit||'') || dependencies.some(code=>input_units[code]!==expected[code])))throw new Error('Formula units differ from the existing source; calculation withheld for manual review');
 return result;
}
module.exports={capture};
