import {useEffect,useState,useRef} from 'react';
import {createPortal} from 'react-dom';
import '../print-layout.css';
export default function PrintCalibration({profile,onClose,returnFocus}){
 const[message,setMessage]=useState('');const panel=useRef(null);
 useEffect(()=>{const previous=returnFocus || document.activeElement;panel.current?.querySelector('button')?.focus();return()=>previous?.focus?.();},[]);
 useEffect(()=>{const old=document.body.dataset.printTarget;document.body.dataset.printTarget='calibration';return()=>{if(old)document.body.dataset.printTarget=old;else delete document.body.dataset.printTarget;};},[]);
 const marks=[['Patient details',profile.patientXmm+profile.offsetXmm,profile.patientYmm+profile.offsetYmm],['Table origin',profile.tableXmm+profile.offsetXmm,profile.tableYmm+profile.offsetYmm]];
 const preview=async()=>{try{if(window.electronPrintPreview){const result=await window.electronPrintPreview(1,profile);if(!result?.ok)setMessage(result?.error || 'Preview cancelled');}else window.print();}catch(e){setMessage(e.message);}};
 return createPortal(<div ref={panel} role="dialog" aria-modal="true" aria-label="Patient-free print calibration" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){const buttons=panel.current.querySelectorAll('button'),first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}}}} className="mm-calibration-root" style={{'--mm-font':`${profile.fontSizeMm}mm`}}>
  <style>{`@page pathology-report {size:${profile.paperWidthMm}mm ${profile.paperHeightMm}mm;margin:0;}`}</style>
  <div className="mm-calibration-controls no-print"><button type="button" onClick={preview}>Preview calibration page</button><button type="button" onClick={onClose}>Close calibration</button><span role="status">{message}</span></div>
  <div className="mm-calibration-page" style={{width:`${profile.paperWidthMm}mm`,height:`${profile.paperHeightMm}mm`}}>
   <div style={{position:'absolute',top:'3mm',left:'5mm',right:'5mm'}}>CALIBRATION — NO PATIENT DATA<br/>{profile.paperWidthMm} × {profile.paperHeightMm} mm · {profile.mode}<br/>Print at 100% / Actual size. Disable browser headers/footers.</div>
   <div style={{position:'absolute',top:`${profile.reservedHeaderMm}mm`,left:0,right:0,borderTop:'.2mm dashed #555'}}>Reserved header ends at {profile.reservedHeaderMm} mm</div>
   <div style={{position:'absolute',top:`${profile.paperHeightMm-profile.reservedFooterMm}mm`,left:0,right:0,borderTop:'.2mm dashed #555'}}>Reserved footer begins</div>
   {marks.map(([label,x,y])=><div key={label} style={{position:'absolute',left:`${x}mm`,top:`${y}mm`}}><svg width="6mm" height="6mm" viewBox="-3 -3 6 6" style={{position:'absolute',left:'-3mm',top:'-3mm'}}><path d="M-3 0H3 M0 -3V3" stroke="black" strokeWidth=".2"/></svg><span style={{position:'absolute',left:'3mm',width:'85mm'}}>{label}: X {x}, Y {y} mm</span></div>)}
   <div style={{position:'absolute',left:`${(profile.paperWidthMm-100)/2}mm`,top:`${Math.min(profile.tableYmm+profile.offsetYmm+30,profile.paperHeightMm-profile.reservedFooterMm-18)}mm`}}><span style={{display:'block'}}>100 mm measurement line</span><svg data-measurement-line="100mm" width="100mm" height="8mm" viewBox="0 0 100 8"><path d="M0 4H100 M0 1V7 M100 1V7" stroke="black" strokeWidth=".2"/></svg></div>
  </div>
 </div>,document.body);
}
