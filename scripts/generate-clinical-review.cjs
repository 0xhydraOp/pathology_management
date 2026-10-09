/* Reads shipped catalogue/source only. Never opens a laboratory database. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function buildPack() {
  const bytes = fs.readFileSync(path.join(root, 'pathology_parameters.json'));
  const catalogue = JSON.parse(bytes);
  const byCode = new Map(catalogue.parameters.map(p => [p.code, p]));
  return {
    status: 'PENDING QUALIFIED LAB APPROVAL — software inventory only',
    input: 'pathology_parameters.json', catalogueVersion: catalogue.version,
    catalogueSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    sourceClaimUnverified: catalogue.reference_source,
    scope: 'Shipped catalogue, not a customer lab database; local approved intervals may differ.',
    rounding: 'JavaScript Number binary64; derived results use Number.toFixed(decimal), then numeric storage. Derived dependencies use their stored rounded results. Classification uses raw final calculation. Human review required for near-boundary differences.',
    parameters: catalogue.parameters.map(p => ({
      code:p.code, name:p.name, type:p.type, unit:p.unit || '', decimals:p.decimal ?? 0,
      formula:p.formula ?? null,
      dependencies:(p.depends_on || []).map(code => ({code,unit:byCode.get(code)?.unit || '',type:byCode.get(code)?.type || 'MISSING'})),
      applicability:p.code === 'LDL' ? 'Existing code withholds calculation when TG > 400; threshold provenance unknown. No additional unapproved clinical applicability criteria are inferred.' : p.code === 'AGRATIO' ? 'Existing code withholds when GLOB = 0; all non-finite calculations withheld.' : p.type === 'derived' ? 'All ordered dependencies must be valid finite numbers; non-finite calculations withheld.' : null,
      ranges:p.ranges || [], critical:p.critical || null,
      diagnosticCutoffs: 'No separate diagnostic-cutoff rules present in shipped catalogue; reference intervals are not diagnostic cutoffs.',
      minAllowedValue:p.min_allowed_value ?? null,maxAllowedValue:p.max_allowed_value ?? null,
      clinicalProvenance:'Unknown/unverified per-rule provenance. Catalogue-wide source claim does not establish clinical approval.',
      softwareSources:['electron/database.js:saveOrderResults','electron/referenceIntervals.cjs','src/pages/ResultEntrySimple.jsx','src/utils/referenceIntervals.js'],
    })),
    syntheticWorkedExamples:[
      {formula:'GLOB',inputs:{TP:7.25,ALB:4.13},raw:3.12,display:'3.12'},
      {formula:'AGRATIO',inputs:{ALB:4.13,GLOB:3.12},raw:4.13/3.12,display:'1.32'},
      {formula:'LDL',inputs:{TC:200,HDL:50,TG:150},raw:120,display:'120'},
      {formula:'VLDL',inputs:{TG:150},raw:30,display:'30'},
      {formula:'LDL',inputs:{TC:200,HDL:50,TG:400},raw:70,display:'70',note:'Existing code threshold accepts 400; not clinical endorsement.'},
      {formula:'LDL',inputs:{TC:200,HDL:50,TG:400.01},raw:null,display:'Not calculable'},
      {formula:'AGRATIO',inputs:{ALB:4,GLOB:0},raw:null,display:'Missing/not calculable'},
      {formula:'ANY',inputs:{dependency:''},raw:null,display:'Missing/not calculable'},
      {formula:'ANY',inputs:{dependency:'12abc'},outcome:'Reject entire save; keep previous saved state'},
      {formula:'SYNTHETIC_ONLY',inputs:{A:1.004,B:1},raw:1.004,display:'1.00',referenceHigh:1.003,classification:'H',note:'Flag raw calculation, not displayed rounded text; never use this invented range clinically.'},
      {formula:'LDL/VLDL',inputs:{TG:150},unit:'mmol/L',outcome:'Must withhold derived calculation; no automatic unit conversion'},
    ],
  };
}
if (require.main === module) {
  const output = path.join(root,'docs','CLINICAL_RULE_INVENTORY.json');
  fs.writeFileSync(output,`${JSON.stringify(buildPack(),null,2)}\n`);
  console.log('Generated docs/CLINICAL_RULE_INVENTORY.json from shipped catalogue only.');
}
module.exports = {buildPack};
