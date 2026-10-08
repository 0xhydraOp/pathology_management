import {useEffect,useState,useRef} from 'react';
import schema from '../../electron/printProfileSchema.json';
import PrintCalibration from './PrintCalibration';
export default function PrintProfileSettings(){
 const calibrationTrigger=useRef(null);
 const[form,setForm]=useState(schema.defaults),[user,setUser]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[calibration,setCalibration]=useState(null);
 useEffect(()=>{window.db?.getPrintProfile?.().then(setForm).catch(e=>setMessage(e.message));window.db?.getSession?.().then(setUser).catch(()=>{});},[]);
 const candidate=()=>({...form,...Object.fromEntries(Object.keys(schema.fields).map(key=>[key,form[key]===''?NaN:Number(form[key])])),columnWidthsMm:form.columnWidthsMm.map(value=>value===''?NaN:Number(value))});
 const save=async()=>{setBusy(true);try{const saved=await window.db.setPrintProfile(candidate());setForm(saved);setMessage('Print profile saved locally. Issued clinical content is unchanged.');}catch(e){setMessage(e.message);}finally{setBusy(false);}};
 const calibrate=async(event)=>{calibrationTrigger.current=event.currentTarget;setBusy(true);try{const checked=await window.db.validatePrintProfile(candidate());setCalibration(checked);}catch(e){setMessage(e.message);}finally{setBusy(false);}};
 return <section className="settings-section reference-editor print-profile-settings" aria-labelledby="print-profile-title">
  <h3 id="print-profile-title">Paper &amp; preprinted-pad profile</h3>
  <p>All dimensions are millimetres. Positive offsets move patient details and the table right/down. Reserved areas remain fixed. This profile controls physical layout; it never changes an issued result.</p>
  {user?.role!=='admin' && <p>Read-only. Sign in as an admin to save printer settings.</p>}
  <fieldset disabled={user?.role!=='admin' || busy}><legend>Lab-specific print geometry</legend>
   <div className="reference-fields"><label className="reference-field">Default print mode<select value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})}><option value="preprinted">Preprinted pad</option><option value="full">Full report</option></select></label>
    <label className="reference-field">Paper size<select value={form.paper} onChange={e=>{const size=schema.papers[e.target.value];setForm({...form,paper:e.target.value,...(size?{paperWidthMm:size[0],paperHeightMm:size[1]}:{})});}}>{Object.keys(schema.papers).map(p=><option key={p}>{p}</option>)}<option value="custom">custom</option></select></label>
    {Object.entries(schema.fields).map(([key,label])=><label className="reference-field" key={key}>{label} (mm)<input aria-label={`${label} (mm)`} type="number" step="any" value={form[key]} disabled={key.startsWith('paper') && form.paper!=='custom'} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
    {['Test','Result','Unit','Reference'].map((label,i)=><label className="reference-field" key={label}>{label} column (mm)<input aria-label={`${label} column (mm)`} type="number" step="any" value={form.columnWidthsMm[i]} onChange={e=>setForm({...form,columnWidthsMm:form.columnWidthsMm.map((v,index)=>index===i?e.target.value:v)})}/></label>)}
   </div><button type="button" onClick={save}>Save print profile</button>
  </fieldset>
  <div className="reference-actions"><button type="button" disabled={busy || !window.db?.validatePrintProfile} onClick={calibrate}>Open calibration page</button></div>
  <p role="status" aria-live="polite">{message}</p>
  <details><summary>Printer setup guide</summary><p>Select the same paper size in this profile and the printer driver. Use 100% / Actual size; turn off Fit to page and browser headers/footers. Use zero software margins where supported. The printer may impose unprintable hardware margins; adjust positions and offsets within the reserved areas. Print this patient-free calibration page, measure its 100 mm line with a ruler, then compare the origin marks with the letterhead. Correct scaling in the driver before adjusting offsets. Physical alignment has not been verified without your printer.</p></details>
  {calibration && <PrintCalibration profile={calibration} returnFocus={calibrationTrigger.current} onClose={()=>setCalibration(null)}/>}
 </section>;
}
