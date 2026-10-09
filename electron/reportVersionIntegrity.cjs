// Changes are confined to results and issuance metadata. Patient identity,
// presentation, parameter identities, units and saved intervals stay immutable.
function validate(base, report, {draft=false}={}) {
 const fail=()=>{throw new Error('Report amendment snapshot is inconsistent');};
 const metadata=new Set(['results','issued','report_version','parent_version','amendment_reason','amendment_changed_fields','issued_at','report_date','issued_by','report_printed_by']);
 const top=o=>Object.fromEntries(Object.entries(o).filter(([k])=>!metadata.has(k)));
 if(JSON.stringify(top(base))!==JSON.stringify(top(report)))fail();
 if(!Array.isArray(report.results)||report.results.length!==base.results.length)fail();
 const editable=new Set(['result_value','raw_result_value','result_text','flag','review_message','amendment_provenance','clinical_provenance']);
 const fixed=o=>Object.fromEntries(Object.entries(o).filter(([k])=>!editable.has(k)));
 report.results.forEach((row,i)=>{
  const prior=base.results[i];if(JSON.stringify(fixed(prior))!==JSON.stringify(fixed(row)))fail();
  // Old unchanged results may lack provenance. Validate corrected content only.
  if(JSON.stringify(row)===JSON.stringify(prior))return;
  const before=prior.clinical_provenance,after=row.clinical_provenance;
  if(before){
   if(!after||JSON.stringify(before.parameter)!==JSON.stringify(after.parameter)||JSON.stringify(before.critical_rule)!==JSON.stringify(after.critical_rule))fail();
   if(before.parameter?.type!=='derived'&&JSON.stringify(before)!==JSON.stringify(after))fail();
   if(before.parameter?.type==='derived'){
    const formula=o=>Object.fromEntries(Object.entries(o||{}).filter(([k])=>!['raw_value','provenance'].includes(k)));
    if(JSON.stringify(formula(before.formula))!==JSON.stringify(formula(after.formula)))fail();
   }
  }else if(after)fail();
  const type=before?.parameter?.type;
  if(type==='text'||(row.result_value===null&&typeof row.result_text==='string')){if(!row.result_text?.trim())fail();}
  else if(typeof row.result_value!=='number'||!Number.isFinite(row.result_value)||typeof row.raw_result_value!=='number'||!Number.isFinite(row.raw_result_value))fail();
  if(!before&&row.flag)fail();
 });
 if(draft&&report.issued!==false)fail();
}
module.exports={validate};
