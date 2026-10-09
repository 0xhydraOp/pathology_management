import {useEffect, useState} from 'react';

export default function BackupHealth({compact=false, refreshKey=''}) {
  const [health,setHealth]=useState(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const [enabled,setEnabled]=useState(true), [days,setDays]=useState('7');
  useEffect(()=>{
    let mounted=true;
    const load=()=>window.db?.getBackupHealth?.().then(value=>{
      if(mounted){setHealth(value);setEnabled(value.enabled);setDays(String(value.days));setError('');}
    }).catch(e=>{if(mounted)setError(e.message);});
    load();
    const onRefresh=()=>load();
    window.addEventListener('patholy-backup-updated',onRefresh);
    return ()=>{mounted=false;window.removeEventListener('patholy-backup-updated',onRefresh);};
  },[refreshKey]);
  if(!health) return compact ? null : <p role={error?'alert':undefined}>{error || 'Loading backup status…'}</p>;
  const status=health.clockUncertain?'Check computer date and backup age':!health.lastExternalAt?'No verified user-selected backup recorded':!health.enabled?'Verified backup recorded':health.due?'Backup reminder due':'Backup reminder up to date';
  if(compact) return health.due ? <a className="backup-reminder" href="#/settings" style={{color:'#18283B',background:'#fff',fontSize:12,border:'1px solid #7C8DA1',borderRadius:5,padding:'5px 8px',textDecoration:'none'}} aria-label={`${status}. Open backup settings`}>Backup reminder</a> : null;
  async function save(event){
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try{setHealth(await window.db.configureBackupReminder({enabled,days:Number(days)}));window.dispatchEvent(new Event('patholy-backup-updated'));}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <div className="backup-health" style={{border:'1px solid var(--border, #DCE3EB)',borderRadius:8,padding:16,marginBottom:16}}>
    <h4 style={{margin:'0 0 8px'}}>Backup readiness</h4>
    <p><strong>{status}</strong>{!health.enabled?' · Reminders disabled':''}</p>
    {health.lastExternalAt && <p>Last verified user-selected copy: {new Date(health.lastExternalAt).toLocaleString('en-IN')} · {health.kind==='encrypted'?'Encrypted':'Unencrypted'}{health.ageDays!=null?` · ${health.ageDays} days ago`:''}</p>}
    <p>A verified copy outside the app data folder may still be on this computer. It is not proof of an offsite backup or successful restore. Keep an encrypted copy on separate protected storage and rehearse restoration.</p>
    <p>Local automatic recovery copies are separate: {health.localRecoveryAt?`latest local copy ${new Date(health.localRecoveryAt).toLocaleString('en-IN')}`:'none found'}. These do not satisfy this reminder.</p>
    {health.canConfigure && <form onSubmit={save} style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:12}}>
      <label htmlFor="backup-reminder-enabled"><input id="backup-reminder-enabled" type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={busy}/> Remind me to back up</label>
      <label htmlFor="backup-reminder-days">Interval (days)</label><input data-ui="input" id="backup-reminder-days" type="number" min="1" max="365" step="1" value={days} onChange={e=>setDays(e.target.value)} style={{maxWidth:100}} disabled={busy} required/>
      <button data-ui="btn" type="submit" disabled={busy}>{busy?'Saving…':'Save reminder'}</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
