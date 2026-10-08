import { useEffect, useRef, useState } from 'react';

const newRule = unit => ({sex:'any',min_age:'',max_age:'',min_age_inclusive:true,max_age_inclusive:false,low_value:'',high_value:'',low_inclusive:true,high_inclusive:true,unit,reference_text:''});
export default function ReferenceIntervalEditor() {
  const [parameters,setParameters]=useState([]),[parameterId,setParameterId]=useState('');
  const [sets,setSets]=useState([]),[rules,setRules]=useState([]),[selectedVersion,setSelectedVersion]=useState(null);
  const [sourceVersion,setSourceVersion]=useState(null);
  const [user,setUser]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  const request=useRef(0);
  const parameter=parameters.find(p=>p.id===Number(parameterId));
  const canEdit=user?.role==='admin';
  const active=sets.find(s=>s.status==='approved');
  const pending=sets.find(s=>s.id===selectedVersion && s.status==='pending');
  useEffect(()=>{
    if(!window.db?.listReferenceSets)return;
    window.db.getSession().then(setUser).catch(()=>setUser(null));
    window.db.read('catalogue.referenceParameters', []).then(rows=>{setParameters(rows);if(rows.length)setParameterId(String(rows[0].id));}).catch(e=>setMessage(e.message));
  },[]);
  const load=async id=>{
    const revision=++request.current;setLoaded(false);setMessage('');
    try{
      const versions=await window.db.listReferenceSets(Number(id));
      if(revision!==request.current)return;
      setSets(versions);
      const source=versions.find(s=>s.status==='pending') || versions.find(s=>s.status==='approved');
      setRules(source?.rules || []);setSelectedVersion(source?.id ?? null);setSourceVersion(source?.id ?? null);setLoaded(true);
    }catch(e){if(revision===request.current)setMessage(e.message);}
  };
  useEffect(()=>{if(parameterId)load(parameterId);},[parameterId]);
  const edit=(index,key,value)=>{setSelectedVersion(null);setRules(prev=>prev.map((r,i)=>i===index?{...r,[key]:value}:r));};
  const save=async()=>{
    setBusy(true);setMessage('');
    try{await window.db.saveReferenceDraft(Number(parameterId),rules,active?.id ?? null,sourceVersion);await load(parameterId);setMessage('Draft saved. Approval is required before use.');}
    catch(e){setMessage(e.message);}finally{setBusy(false);}
  };
  const approve=async()=>{
    setBusy(true);setMessage('');
    try{await window.db.approveReferenceDraft(pending.id);await load(parameterId);setMessage('Reference intervals approved. Issued reports remain unchanged.');}
    catch(e){setMessage(e.message);}finally{setBusy(false);}
  };
  const input=(r,index,key,label,type='text')=><label className="reference-field">{label}<input aria-label={`${label} rule ${index+1}`} type={type} step={type==='number'?'any':undefined} value={r[key] ?? ''} onChange={e=>edit(index,key,e.target.value)} /></label>;
  const boundary=(r,index,key,label)=><label className="reference-check"><input type="checkbox" checked={Boolean(r[key])} onChange={e=>edit(index,key,e.target.checked)} />{label}</label>;
  return <section className="settings-section reference-editor" aria-labelledby="reference-editor-title">
    <h3 id="reference-editor-title">Parameter reference intervals</h3>
    <p>Local to this lab. Approved rules are used in review and saved with each issued report. Critical thresholds and diagnostic cutoffs are separate and are not edited here.</p>
    {!window.db?.listReferenceSets?<p>Reference settings are available in the desktop app.</p>:<>
      <label className="reference-field">Parameter<select aria-label="Parameter" value={parameterId} disabled={busy} onChange={e=>setParameterId(e.target.value)}>{parameters.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
      <p>Catalogue unit: <strong>{parameter?.unit || 'unitless'}</strong>. Units must match exactly; this editor does not convert results.</p>
      {!canEdit && <p>Read-only. Sign in as an admin to edit and approve intervals.</p>}
      {active?<p>Active approval: version {active.id}, {active.approved_by}, {active.approved_at}</p>:<p className="reference-warning">Reference interval not configured: no approved version.</p>}
      <fieldset disabled={!canEdit || busy || !loaded}>
        <legend>Age is recorded in years. All overlapping sex/age rules are rejected.</legend>
        {rules.map((r,index)=><div className="reference-rule" key={index}>
          <div className="reference-rule-heading"><strong>Rule {index+1}</strong><button type="button" onClick={()=>{setSelectedVersion(null);setRules(prev=>prev.filter((_,i)=>i!==index));}}>Remove rule</button></div>
          <div className="reference-fields">
            <label className="reference-field">Sex<select aria-label={`Sex rule ${index+1}`} value={r.sex} onChange={e=>edit(index,'sex',e.target.value)}><option value="any">Any</option><option value="male">Male</option><option value="female">Female</option></select></label>
            {input(r,index,'min_age','Minimum age','number')}{input(r,index,'max_age','Maximum age','number')}{input(r,index,'unit','Unit')}
            {input(r,index,'low_value','Lower limit')}{input(r,index,'high_value','Upper limit')}
          </div>
          <div className="reference-boundaries">{boundary(r,index,'min_age_inclusive','Include minimum age')}{boundary(r,index,'max_age_inclusive','Include maximum age')}{boundary(r,index,'low_inclusive','Include lower limit')}{boundary(r,index,'high_inclusive','Include upper limit')}</div>
          <label className="reference-field">Qualitative reference text<textarea aria-label={`Qualitative reference text rule ${index+1}`} value={r.reference_text || ''} onChange={e=>edit(index,'reference_text',e.target.value)} placeholder="Use text instead of numeric limits" /></label>
        </div>)}
        <div className="reference-actions"><button type="button" onClick={()=>{setSelectedVersion(null);setRules(prev=>[...prev,newRule(parameter?.unit || '')]);}}>Add interval rule</button><button type="button" onClick={save}>Save draft</button><button type="button" onClick={approve} disabled={!pending}>Approve selected draft</button></div>
      </fieldset>
      <p role="status" aria-live="polite">{message || (busy?'Saving…':'')}</p>
      <details><summary>Version and approval history ({sets.length})</summary>{sets.map(s=><div className="reference-history" key={s.id}><button type="button" disabled={busy} onClick={()=>{setSelectedVersion(s.id);setSourceVersion(s.id);setRules(s.rules);}}>View version {s.id}</button> <strong>{s.status}</strong> — edited by {s.edited_by} at {s.edited_at}{s.approved_by && `; approved by ${s.approved_by} at ${s.approved_at}`}</div>)}</details>
    </>}
  </section>;
}
