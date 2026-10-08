import {useEffect,useRef,useState} from 'react';
import {paginateReport} from '../utils/paginateReport';
import '../print-layout.css';
const PX_PER_MM=96/25.4;
const heading=['Test','Result','Unit','Reference interval'];
function Patient({report}){
 return <div className="mm-patient"><strong>{!report.issued && <span className="mm-draft">DRAFT — not finalized · </span>}{report.patient_name}</strong><span>Patient ID: {report.pt_id} · Order #{report.id}</span><span>Age: {report.age ?? 'unknown'} years · Sex: {report.sex || 'unknown'} · Referrer: {report.referred_by || '—'}</span>{(report.phone || report.address) && <span>{[report.phone,report.address].filter(Boolean).join(' · ')}</span>}</div>;
}
function LabHeader({report}){const lab=report.lab_config || {};return <div className="mm-lab-header"><img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Lab logo" /><div><strong>{lab.name}</strong>{lab.address && <span>{lab.address}</span>}{(lab.phone || lab.registration_no) && <span>{[lab.phone,lab.registration_no].filter(Boolean).join(' · ')}</span>}</div></div>;}
function LabFooter({report}){const lab=report.lab_config || {};return <div className="mm-lab-footer"><span>Read by: {lab.pathologist_name || '—'} · Issued by: {report.report_printed_by || report.issued_by || '—'} · {report.report_date || 'DRAFT'}</span><span>{lab.clinical_correlation_text || ''}</span></div>;}
function Columns({widths}){return <colgroup>{widths.map((width,i)=><col key={i} style={{width:`${width}mm`}} />)}</colgroup>;}
export default function ReportPrintLayout({report,profile,onReady}){
 const measurement=useRef(null),[pages,setPages]=useState([]),[error,setError]=useState(''),[plannedKey,setPlannedKey]=useState('');
 const callback=useRef(onReady);callback.current=onReady;
 const reportKey=JSON.stringify(report),profileKey=JSON.stringify(profile);
 const key=reportKey+profileKey;
 const visiblePages=plannedKey===key?pages:[];
 const width=profile.columnWidthsMm.reduce((a,b)=>a+b,0);
 const common={'--mm-font':`${profile.fontSizeMm}mm`,'--mm-spacing':`${profile.rowSpacingMm/2}mm`};
 const numberHeight=profile.fontSizeMm*1.35;
 const bottom=profile.paperHeightMm-profile.reservedFooterMm-numberHeight-4;
 const rows=(report.results || []).map((r,index)=>({index,cells:[r.test_name,String(r.result_value ?? r.result_text ?? '—')+(r.flag?`\nFlag: ${r.flag}`:''),r.unit || '—',[r.refRange || 'Reference interval not configured',r.review_message].filter(Boolean).join('\n')]}));
 useEffect(()=>{
  let cancelled=false;setError('');callback.current?.({ready:false,pages:0});
  void(async()=>{
   try{
    await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(resolve));if(cancelled)return;
    const root=measurement.current;
    const mm=element=>element.getBoundingClientRect().height/PX_PER_MM;
    const patientHeight=mm(root.querySelector('.mm-patient'));
    if(profile.patientYmm+patientHeight+2>profile.tableYmm)throw new Error('Patient details overlap the table. Move the table start lower or reduce font size.');
    if(profile.mode==='full'){
     if(mm(root.querySelector('.mm-lab-header'))>profile.reservedHeaderMm-4)throw new Error('Lab header does not fit. Increase reserved header space.');
     if(mm(root.querySelector('.mm-lab-footer'))>profile.reservedFooterMm-3)throw new Error('Lab footer does not fit. Increase reserved footer space.');
    }
    const tableHead=mm(root.querySelector('thead'));
    const capacity=bottom-(profile.tableYmm+profile.offsetYmm)-tableHead-1;
    const tr=root.querySelector('tbody tr');
    const measure=(cells,label='')=>{Array.from(tr.cells).forEach((td,i)=>{
      td.replaceChildren();
      if(label && i===0){const marker=document.createElement('span');marker.className='mm-continued';marker.append(label,document.createElement('br'));td.append(marker);}
      td.append(document.createTextNode(cells[i]));
    });return mm(tr);};
    const planned=paginateReport(rows,measure,capacity);
    if(!cancelled){setPages(planned);setPlannedKey(key);callback.current?.({ready:true,pages:planned.length});}
   }catch(e){if(!cancelled){setPages([]);setError(e.message);callback.current?.({ready:false,pages:0,error:e.message});}}
  })();return()=>{cancelled=true;};
 },[reportKey,profileKey]);
 return <div className="mm-print-layout" style={common} data-print-ready={!error && visiblePages.length>0}>
  <style>{`@page pathology-report { size: ${profile.paperWidthMm}mm ${profile.paperHeightMm}mm; margin: 0; }`}</style>
  {error && <p role="alert" className="no-print">{error}</p>}
  <div ref={measurement} className="mm-measure no-print" aria-hidden="true" style={{width:`${profile.paperWidthMm-profile.patientXmm-profile.offsetXmm-2}mm`}}>
   <Patient report={report}/>{profile.mode==='full' && <><LabHeader report={report}/><LabFooter report={report}/></>}
   <table className="mm-table" style={{width:`${width}mm`}}><Columns widths={profile.columnWidthsMm}/><thead><tr>{heading.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody><tr>{heading.map(h=><td key={h}/>)}</tr></tbody></table>
  </div>
  <div className="mm-report-pages">{visiblePages.map((page,index)=><div className="report-print mm-report-page" key={index} data-page={index+1} style={{width:`${profile.paperWidthMm}mm`,height:`${profile.paperHeightMm}mm`}}>
   {profile.mode==='full' && <div className="mm-header-region" style={{left:`${profile.patientXmm+profile.offsetXmm}mm`,top:'2mm',width:`${profile.paperWidthMm-profile.patientXmm-profile.offsetXmm-2}mm`}}><LabHeader report={report}/></div>}
   <div className="mm-patient-position" style={{left:`${profile.patientXmm+profile.offsetXmm}mm`,top:`${profile.patientYmm+profile.offsetYmm}mm`,width:`${profile.paperWidthMm-profile.patientXmm-profile.offsetXmm-2}mm`}}><Patient report={report}/></div>
   <table className="mm-table mm-positioned-table" style={{left:`${profile.tableXmm+profile.offsetXmm}mm`,top:`${profile.tableYmm+profile.offsetYmm}mm`,width:`${width}mm`}}><Columns widths={profile.columnWidthsMm}/><thead><tr>{heading.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{page.map((r,i)=><tr key={`${r.index}-${i}`} data-result-index={r.index} data-continued={r.continued || undefined}>{r.cells.map((text,c)=><td key={c}>{r.continued && c===0 && <span className="mm-continued">{r.label}<br/></span>}{text}</td>)}</tr>)}</tbody></table>
   <div className="mm-page-number" style={{left:`${profile.tableXmm+profile.offsetXmm}mm`,top:`${profile.paperHeightMm-profile.reservedFooterMm-numberHeight-1}mm`,width:`${width}mm`}}>Patient {report.pt_id} · Order #{report.id} · Page {index+1} of {visiblePages.length}{!report.issued?' · DRAFT':''}</div>
   {profile.mode==='full' && <div className="mm-footer-region" style={{left:`${profile.patientXmm+profile.offsetXmm}mm`,top:`${profile.paperHeightMm-profile.reservedFooterMm+1}mm`,width:`${profile.paperWidthMm-profile.patientXmm-profile.offsetXmm-2}mm`}}><LabFooter report={report}/></div>}
  </div>)}</div>
 </div>;
}
