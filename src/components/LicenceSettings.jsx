import {useEffect,useState} from 'react';
export default function LicenceSettings(){
 const [status,setStatus]=useState(null),[admin,setAdmin]=useState(false),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{window.licensing?.getStatus().then(setStatus).catch(e=>setError(e.message));window.db?.getSession().then(user=>setAdmin(user?.role==='admin'));return window.licensing?.onStatus?.(setStatus);},[]);
 const time=value=>value?new Date(value*1000).toLocaleString():'—';
 async function run(action){setBusy(true);setError('');try{setStatus(await action());setKey('');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="settings-section licence-settings" aria-label="Licence status">
  <h2>Installation licence</h2><p>Licensing sends installation and licence metadata only. Patient records, results and reports stay local.</p>
  <p role="status"><strong>{status?.allowed?'Active':status?.state==='unconfigured'?'Configuration required':'Activation or renewal required'}</strong>{status?.message&&' · '+status.message}</p>
  <dl><dt>Licence expiry</dt><dd>{time(status?.expiresAt)}</dd><dt>Offline use until</dt><dd>{time(status?.offlineUntil)}</dd><dt>Last verified</dt><dd>{time(status?.lastCheckedAt)}</dd></dl>
  {status?.installationId&&<details className="licence-support-id"><summary>Support identifiers</summary><p>Installation ID: <code>{status.installationId}</code></p>{status.licenseId&&<p>Licence ID: <code>{status.licenseId}</code></p>}{status.activationId&&<p>Activation ID: <code>{status.activationId}</code></p>}</details>}
  <p>When an allowance ends, existing-record viewing, issued-report reprinting, backups, exports and recovery remain available. New registration, result editing and finalization require a valid allowance.</p>
  {admin?<form onSubmit={e=>{e.preventDefault();void run(()=>window.licensing.activate(key.trim()));}}><label htmlFor="licence-key">Licence key</label><input id="licence-key" data-ui="input" type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} disabled={busy} required/><button data-ui="btn" type="submit" disabled={busy||!key.trim()}>Activate licence</button></form>:<p>Ask your lab administrator to activate or renew this installation.</p>}
  <button data-ui="btnSecondary" type="button" disabled={busy||!status?.lastCheckedAt} onClick={()=>run(()=>window.licensing.refresh())}>{busy?'Verifying…':'Verify licence online'}</button>
  <p>For renewal or a device transfer, contact your licence administrator. Offline revocation takes effect when this app reconnects or its signed offline allowance ends.</p>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
