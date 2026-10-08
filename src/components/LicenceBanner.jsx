import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
export default function LicenceBanner(){
 const [status,setStatus]=useState(null);
 useEffect(()=>{
  let live=true;const load=()=>window.licensing?.getStatus().then(s=>live&&setStatus(s)).catch(()=>{});
  load();const timer=setInterval(load,30000);const unsubscribe=window.licensing?.onStatus?.(s=>live&&setStatus(s));
  return()=>{live=false;clearInterval(timer);unsubscribe?.();};
 },[]);
 if(status?.syntheticFixture)return <div className="licence-banner no-print" role="region" aria-label="Synthetic QA notice"><strong>Synthetic licensing QA build</strong><span>For isolated synthetic fixtures only. Do not use this build for a lab.</span><Link to="/activation">Licence & activation</Link></div>;
 if(!status)return null;
 if(status.allowed)return status.validationReminder?<div className="licence-banner no-print" role="region" aria-label="Licence validation reminder"><strong>Online verification due soon</strong><span>Connect before {new Date(status.nextRequiredValidationAt*1000).toLocaleDateString()} to keep registration and result editing available. Verification runs quietly in the background.</span><Link to="/activation">Licence status</Link></div>:null;
 return <div className="licence-banner no-print" role="region" aria-label="Licence notice"><strong>{status.activationPendingPrerelease?'Activation-pending prerelease':'Licence action required'}</strong><span>{status.activationPendingPrerelease?'No production activation service is configured. New registration, result editing and finalization are unavailable.':status.message} Viewing, issued reprints and backups remain available.</span><Link to="/activation">Licence & activation</Link></div>;
}
