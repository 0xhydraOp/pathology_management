import { parseNumericResult } from './resultValidation';
export const MISSING_REFERENCE='Reference interval not configured';
function demographicMatch(rules,patient,unit,critical=false) {
  const age=patient?.age;
  if(age==null || !Number.isFinite(age))return {rule:null,message:'Age is missing or invalid; review demographics'};
  const precise='Precise age required for reference interval review; automatic flags withheld';
  if(!Number.isInteger(age) || age<1)return {rule:null,message:precise};
  const candidates=rules.filter(r=>r.unit===unit && (r.sex==='any'||(['male','female'].includes(patient.sex) && r.sex===patient.sex)) && r.min_age<age+1 && (r.max_age>age || (r.max_age===age && (critical||r.max_age_inclusive))));
  const covers=r=>(r.min_age<age || (r.min_age===age && (critical||r.min_age_inclusive))) && r.max_age>=age+1;
  if(!candidates.length)return {rule:null,message:''};
  if(critical){
    const keys=new Set(candidates.map(r=>JSON.stringify([r.critical_low,r.critical_high])));
    if(keys.size!==1)return {rule:null,message:'Conflicting critical rules; manual review required'};
    const whole=candidates.find(covers);
    return whole?{rule:whole,message:''}:{rule:null,message:precise};
  }
  if(candidates.length!==1)return {rule:null,message:'Ambiguous reference rules; manual review required'};
  return covers(candidates[0])?{rule:candidates[0],message:''}:{rule:null,message:precise};
}
export function selectReference(patient,rules=[],unit='') {
  const selected=demographicMatch(rules.filter(r=>!r.critical),patient,unit);
  const threshold=demographicMatch(rules.filter(r=>r.critical),patient,unit,true);
  const interval=selected.rule,critical=threshold.rule;
  return {configured:Boolean(interval),low:interval?.low_value,high:interval?.high_value,lowInclusive:interval?.low_inclusive,highInclusive:interval?.high_inclusive,text:interval?.reference_text,criticalLow:critical?.critical_low,criticalHigh:critical?.critical_high,reviewMessage:[selected.message,threshold.message].filter((message,i,all)=>message && all.indexOf(message)===i).join('; ')};
}
export function referenceFlag(value,range) {
  let n;try{n=parseNumericResult(value);}catch{return '';}
  if(n==null)return '';
  if((range?.criticalLow!=null && n<range.criticalLow)||(range?.criticalHigh!=null && n>range.criticalHigh))return 'C';
  if(!range?.configured || range.text)return '';
  if(range.low!=null && (n<range.low||(n===range.low && !range.lowInclusive)))return 'L';
  if(range.high!=null && (n>range.high||(n===range.high && !range.highInclusive)))return 'H';
  return 'N';
}
export function referenceText(range) {
  if(!range?.configured)return MISSING_REFERENCE;
  if(range.text)return range.text;
  if(range.low!=null && range.high!=null)return `${range.lowInclusive?'[':'('}${range.low} – ${range.high}${range.highInclusive?']':')'}`;
  if(range.low!=null)return `${range.lowInclusive?'≥':'>'} ${range.low}`;
  return `${range.highInclusive?'≤':'<'} ${range.high}`;
}
export function referenceRows(context) {
  return [...context.intervals,...context.critical.map(r=>({...r,critical:true}))];
}
