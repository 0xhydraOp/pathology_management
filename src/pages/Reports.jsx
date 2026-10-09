import { useState, useEffect, useCallback, useRef } from 'react';

import { useSearchParams, useNavigate } from 'react-router-dom';

import ReportPrintLayout from '../components/ReportPrintLayout.jsx';

import printSchema from '../../electron/printProfileSchema.json';



/** USB scanners type alnum + Enter — lookup order by bill barcode (orders.access_code). */

async function fetchOrderByAccessCode(raw) {

  const q = (raw || '').trim().toUpperCase();

  if (q.length < 8 || q.length > 14 || !/^[A-Z2-9]+$/.test(q) || !window.db) return null;

  return window.db.read('reports.byBarcode', [q]);

}



function toLocalDateStr(d) {

  const y = d.getFullYear();

  const m = String(d.getMonth() + 1).padStart(2, '0');

  const day = String(d.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;

}



function getDatePreset(preset) {

  const d = new Date();

  const today = toLocalDateStr(d);

  if (preset === 'today') return { dateFrom: today, dateTo: today };

  const y = new Date(d);

  y.setDate(y.getDate() - 1);

  const yesterday = toLocalDateStr(y);

  if (preset === 'yesterday') return { dateFrom: yesterday, dateTo: yesterday };

  const w = new Date(d);

  w.setDate(w.getDate() - 6);

  const weekAgo = toLocalDateStr(w);

  if (preset === 'last7') return { dateFrom: weekAgo, dateTo: today };

  const m = new Date(d.getFullYear(), d.getMonth(), 1);

  const monthStart = toLocalDateStr(m);

  if (preset === 'month') return { dateFrom: monthStart, dateTo: today };

  const lastMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);

  const lastMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0);

  if (preset === 'lastmonth') return { dateFrom: toLocalDateStr(lastMonthStart), dateTo: toLocalDateStr(lastMonthEnd) };

  return null;

}



export default function Reports() {

  const [searchParams] = useSearchParams();

  const navigate = useNavigate();

  const orderId = searchParams.get('order');

  const shouldPrint = searchParams.get('print') === '1';

  const [orders, setOrders] = useState([]);

  const [isAdmin,setIsAdmin]=useState(false),[versions,setVersions]=useState([]),[amendment,setAmendment]=useState(null),[amendReason,setAmendReason]=useState(''),[amendValues,setAmendValues]=useState({}),[amendBusy,setAmendBusy]=useState(false),[amendError,setAmendError]=useState('');

  const amendmentDialog=useRef(null);

  useEffect(()=>{window.db?.getSession?.().then(u=>setIsAdmin(u?.role==='admin')).catch(()=>{});},[]);

  useEffect(()=>{if(amendment)amendmentDialog.current?.showModal();},[amendment]);

  const [ordersLoading, setOrdersLoading] = useState(true);

  const [selectedOrder, setSelectedOrder] = useState(null);

  const [reportData, setReportData] = useState(null);

  const [labConfig, setLabConfig] = useState({ name: 'MONDAL DIAGNOSTIC CENTRE', address: '', phone: '', email: '', pathologist_name: 'Pathologist', default_printed_by: 'Admin', clinical_correlation_text: 'Please correlate clinically' });

  const [printCopies, setPrintCopies] = useState(1);

  const [search, setSearch] = useState('');

  const [printFeedback, setPrintFeedback] = useState('');

  const [profile,setProfile] = useState(printSchema.defaults);

  const [layout,setLayout] = useState({ready:false});

  const [finalizeReview,setFinalizeReview] = useState(null);

  const [finalizing,setFinalizing] = useState(false);

  const [printing,setPrinting] = useState(false);

  const finalizeDialog = useRef(null);

  const printingRef = useRef(false);

  const searchInputRef = useRef(null);

  const autoPrintFiredRef = useRef(false);

  const today = toLocalDateStr(new Date());

  const [orderFilter, setOrderFilter] = useState({ dateFrom: today, dateTo: today });



  useEffect(() => { window.db?.getPrintProfile?.().then(setProfile).catch(e=>setPrintFeedback(e.message)); }, []);

  useEffect(() => { if(finalizeReview) finalizeDialog.current?.showModal(); }, [finalizeReview]);



  useEffect(() => {

    if (window.db?.getLabConfig) {

      window.db.getLabConfig().then((c) => {

        if (c) setLabConfig((prev) => ({

          ...prev,

          name: c.name || prev.name,

          address: c.address || prev.address || '',

          phone: c.phone || prev.phone || '',

          email: c.email || prev.email || '',

          pathologist_name: c.pathologist_name || prev.pathologist_name,

          default_printed_by: c.default_printed_by || prev.default_printed_by,

          clinical_correlation_text: c.clinical_correlation_text || prev.clinical_correlation_text,

        }));

      }).catch(() => {});

    }

  }, []);



  useEffect(() => {

    if (!window.db) {

      setOrdersLoading(false);

      return;

    }

    setOrdersLoading(true);

    window.db.read('reports.orders', {dateFrom:orderFilter.dateFrom,dateTo:orderFilter.dateTo}).then((rows) => {

      setOrders(rows || []);

      setOrdersLoading(false);

      // Do not setSelectedOrder from ?order= here — date refetch would override barcode pick.

      // Deep link is handled in the effect below when selectedOrder is still null.

    }).catch((e) => {

      console.error(e);

      setOrdersLoading(false);

    });

  }, [orderId, orderFilter.dateFrom, orderFilter.dateTo]);



  useEffect(() => {

    const t = setTimeout(() => searchInputRef.current?.focus?.(), 400);

    return () => clearTimeout(t);

  }, []);



  useEffect(() => {

    if (!orderId || !window.db || selectedOrder) return;

    const id = parseInt(orderId, 10);

    if (isNaN(id)) return;

    window.db.read('reports.order', [id]).then((ord) => ord && setSelectedOrder(ord)).catch(() => {});

  }, [orderId, selectedOrder]);



  const selectedOrderIdRef = useRef(null);

  useEffect(() => {

    if (!selectedOrder || !window.db) {

      setReportData(null);

      selectedOrderIdRef.current = null;

      return;

    }

    const orderId = selectedOrder.id;

    setAmendment(null);setAmendError('');setVersions([]);

    selectedOrderIdRef.current = orderId;

    window.db.getReport(orderId).then(report => {

      if (selectedOrderIdRef.current !== orderId) return;

      setReportData(report);

      window.db.listReportVersions?.(orderId).then(v=>{if(selectedOrderIdRef.current===orderId)setVersions(v);}).catch(()=>setVersions([]));

    }).catch(() => {

      if (selectedOrderIdRef.current === orderId) setReportData({ ...selectedOrder, results: [] });

    });

  }, [selectedOrder]);



  const openAmendment=async()=>{if(amendBusy)return;setAmendBusy(true);setAmendError('');try{const existing=await window.db.getReportAmendment(reportData.id);const draft=existing || await window.db.createReportAmendment({orderId:reportData.id,baseVersion:reportData.report_version || 1,reason:amendReason,requestId:crypto.randomUUID()});setAmendment(draft);setAmendValues(Object.fromEntries(draft.report.results.map(r=>[r.parameter_id,String(r.result_value ?? r.result_text ?? '')])));}catch(e){setAmendError(e.message);}finally{setAmendBusy(false);}};

  const saveAmendment=async(finalize=false)=>{if(amendBusy || !amendment)return;setAmendBusy(true);setAmendError('');try{const changes=amendment.report.results.filter(r=>String(r.result_value ?? r.result_text ?? '')!==amendValues[r.parameter_id]).map(r=>({parameterId:r.parameter_id,value:amendValues[r.parameter_id]}));if(finalize && changes.length)throw new Error('Save the draft first, then review the corrected values and flags before finalizing');const d=changes.length?await window.db.saveReportAmendment({draftId:amendment.id,revision:amendment.revision,changes}):amendment;setAmendment(d);if(finalize){const issued=await window.db.finalizeReportAmendment({draftId:d.id,revision:d.revision});setReportData(issued);setVersions(await window.db.listReportVersions(issued.id));amendmentDialog.current?.close();setAmendment(null);setPrintFeedback('Amended version finalized. Earlier versions remain available.');}}catch(e){setAmendError(e.message);}finally{setAmendBusy(false);}};

  const reviewFinalize = async () => {

    const id=reportData.id;

    try {

      const report=await window.db.getReport(id);

      if(selectedOrderIdRef.current!==id)return;

      setReportData(report);

      if(!report.issued){setPrintFeedback('');setFinalizeReview(report);}

    } catch(e){setPrintFeedback(e.message);}

  };

  const finalize = async () => {

    if(finalizing || !finalizeReview)return;

    const id=finalizeReview.id;setFinalizing(true);

    try {

      const issued=await window.db.issueReport(id);

      if(selectedOrderIdRef.current===id){setReportData(issued);setPrintFeedback('Report finalized. Issued content is preserved for reprints.');}

      finalizeDialog.current?.close();setFinalizeReview(null);

    } catch(e){setPrintFeedback('Report was not finalized: '+e.message);}

    finally{setFinalizing(false);}

  };

  const handlePrint = useCallback(async (preview=true) => {

    if(!reportData?.results?.length || !layout.ready || printingRef.current || finalizing)return;

    const id=reportData.id;printingRef.current=true;setPrinting(true);

    try {

      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

      if(selectedOrderIdRef.current!==id)return;

      let result;

      if(preview && window.electronPrintPreview) result=await window.electronPrintPreview(printCopies,profile);

      else if(window.electronPrint) result=await window.electronPrint(printCopies,profile);

      else {window.print();result={ok:true};}

      if(result?.cancelled)setPrintFeedback('Print cancelled.');

      else if(result?.ok===false)setPrintFeedback(result.error || 'Printing failed');

      else {

        setPrintFeedback(preview?'Preview opened — use Ctrl+P in that window to print.':'Print dialog completed.');

        if(!preview && reportData.issued && window.db?.logPrint){

          await window.db.logPrint(id,reportData.report_version || 1);

        }

      }

    }catch(e){setPrintFeedback('Printing failed: '+e.message);}

    finally{printingRef.current=false;setPrinting(false);}

  },[reportData,layout.ready,finalizing,printCopies,profile]);

  useEffect(()=>{

    if(!shouldPrint || !layout.ready || autoPrintFiredRef.current)return;

    autoPrintFiredRef.current=true;void handlePrint(true);

  },[shouldPrint,layout.ready,handlePrint]);

  useEffect(()=>{

    const trigger=()=>void handlePrint(false);

    window.addEventListener('app-print-trigger',trigger);

    return()=>window.removeEventListener('app-print-trigger',trigger);

  },[handlePrint]);



  const filteredOrders = (() => {

    const list = orders.filter((o) => {

      if (!search || !search.trim()) return true;

      const q = search.trim().toLowerCase();

      const qRaw = search.trim();

      if (/^\d+$/.test(qRaw) && String(o.id) === qRaw) return true;

      return (

        (o.patient_name && o.patient_name.toLowerCase().includes(q)) ||

        (o.pt_id && o.pt_id.toLowerCase().includes(q)) ||

        (o.phone && o.phone.includes(qRaw)) ||

        (o.referred_by && o.referred_by.toLowerCase().includes(q)) ||

        (o.access_code && o.access_code.toLowerCase().includes(q))

      );

    });

    const pinId = selectedOrder?.id;

    const sorted = pinId

      ? [...list].sort((a, b) => {

          if (a.id === pinId) return -1;

          if (b.id === pinId) return 1;

          return 0;

        })

      : list;

    if (selectedOrder && !sorted.some((o) => o.id === selectedOrder.id)) {

      return [selectedOrder, ...sorted];

    }

    return sorted;

  })();



  return (

    <div data-ui="container" style={styles.container} className="ui-page ui-reports reports-print-container reports-page">

      <div data-ui="pageHeader" style={styles.pageHeader} className="no-print">

        <div data-ui="pageHeaderIcon" style={styles.pageHeaderIcon} aria-hidden="true">▤</div>

        <div>

          <h1 data-ui="title" style={styles.title}>Reports</h1>

          <p data-ui="subtitle" style={styles.subtitle}>

            Search <strong>order #</strong>, name, mobile, Ref. by, or <strong>scan bill barcode</strong> (focus here; Enter opens). Selected report stays at top of the list. Ctrl+P to print.

          </p>

        </div>

      </div>



      <div data-ui="card" style={styles.card} className="no-print reports-filter-card">

        <div data-ui="presetCardGrid" style={styles.presetCardGrid}>

          {[

            { id: 'today', label: 'Today' },

            { id: 'yesterday', label: 'Yesterday' },

            { id: 'last7', label: 'This Week' },

            { id: 'month', label: 'This Month' },

            { id: 'lastmonth', label: 'Last Month' },

          ].map(({ id, label }) => {

            const preset = getDatePreset(id);

            const isActive = orderFilter.dateFrom === preset?.dateFrom && orderFilter.dateTo === preset?.dateTo;

            return (

              <button data-ui={['presetCard',(isActive)?'presetCardActive':''].filter(Boolean).join(' ')}

                key={id}

                type="button"

                className={`reports-preset-card ${isActive ? 'reports-preset-active' : ''}`}

                style={{

                  ...styles.presetCard,

                  ...(isActive ? styles.presetCardActive : {}),

                }}

                onClick={() => preset && setOrderFilter(preset)}

              >

                <span data-ui="presetCardLabel" style={styles.presetCardLabel}>{label}</span>

              </button>

            );

          })}

        </div>

        <div data-ui="filterRow" style={styles.filterRow}>

          <div data-ui="filterCol" style={styles.filterCol}>

            <label data-ui="label" htmlFor="reports-field-1" style={styles.label}>From</label>

            <input data-ui="input" id="reports-field-1"

              type="date"

              value={orderFilter.dateFrom}

              onChange={(e) => {

                const v = e.target.value;

                setOrderFilter((f) => {

                  const next = { ...f, dateFrom: v };

                  if (next.dateTo && v > next.dateTo) next.dateTo = v;

                  return next;

                });

              }}

              style={styles.input}

            />

          </div>

          <div data-ui="filterCol" style={styles.filterCol}>

            <label data-ui="label" htmlFor="reports-field-2" style={styles.label}>To</label>

            <input data-ui="input" id="reports-field-2"

              type="date"

              value={orderFilter.dateTo}

              onChange={(e) => {

                const v = e.target.value;

                setOrderFilter((f) => {

                  const next = { ...f, dateTo: v };

                  if (next.dateFrom && v < next.dateFrom) next.dateFrom = v;

                  return next;

                });

              }}

              style={styles.input}

            />

          </div>

          <div data-ui="filterCol" style={{ ...styles.filterCol, flex: 1 }}>

            <label data-ui="label" htmlFor="reports-field-3" style={styles.label}>Search or barcode scan</label>

            <input data-ui="searchInput" id="reports-field-3"

              ref={searchInputRef}

              type="text"

              autoComplete="off"

              placeholder="Order #, name, mobile, referrer, or scan barcode…"

              value={search}

              onChange={(e) => setSearch(e.target.value)}

              onKeyDown={(e) => {

                if (e.key !== 'Enter') return;

                e.preventDefault();

                void (async () => {

                  const qRaw = search.trim();

                  const byCode = await fetchOrderByAccessCode(qRaw);

                  if (byCode) {

                    let od = '';

                    if (byCode.order_date) {

                      const s = String(byCode.order_date);

                      od = s.length >= 10 ? s.slice(0, 10) : s;

                    }

                    if (!od) od = toLocalDateStr(new Date());

                    setOrderFilter((f) => {

                      const curFrom = f.dateFrom || od;

                      const curTo = f.dateTo || od;

                      return {

                        dateFrom: curFrom <= od ? curFrom : od,

                        dateTo: curTo >= od ? curTo : od,

                      };

                    });

                    setSelectedOrder(byCode);

                    setSearch('');

                    navigate('/reports', { replace: true });

                    setPrintFeedback(`Loaded order #${byCode.id} from barcode`);

                    setTimeout(() => setPrintFeedback(''), 3500);

                    window.scrollTo({ top: 0, behavior: 'smooth' });

                    setTimeout(() => searchInputRef.current?.focus?.(), 100);

                    return;

                  }

                  const qEnter = search.trim();

                  const qLower = qEnter.toLowerCase();

                  const list = orders.filter((o) => {

                    if (!qEnter) return true;

                    if (/^\d+$/.test(qEnter) && String(o.id) === qEnter) return true;

                    return (

                      (o.patient_name?.toLowerCase().includes(qLower))

                      || (o.pt_id?.toLowerCase().includes(qLower))

                      || (o.phone?.includes(qEnter))

                      || (o.referred_by?.toLowerCase().includes(qLower))

                      || (o.access_code?.toLowerCase().includes(qLower))

                    );

                  });

                  if (list.length > 0) setSelectedOrder(list[0]);

                })();

              }}

              style={styles.searchInput}

            />

          </div>

        </div>

        <div data-ui="filterRow" style={styles.filterRow}>

          <div data-ui="filterCol" style={{ ...styles.filterCol, flex: 1 }}>

            <label data-ui="label" htmlFor="reports-field-4" style={styles.label}>Select order</label>

            <select data-ui="select" id="reports-field-4"

              value={selectedOrder?.id || ''}

              onChange={(e) => {

                const id = parseInt(e.target.value, 10);

                const ord = filteredOrders.find((o) => o.id === id) || orders.find((o) => o.id === id);

                setSelectedOrder(ord || null);

              }}

              style={styles.select}

            >

              <option value="">— Choose order —</option>

              {filteredOrders.map((o) => (

                <option key={o.id} value={o.id}>

                  #{o.id}{o.access_code ? ` [${o.access_code}]` : ''} — {o.pt_id} — {o.patient_name}

                </option>

              ))}

            </select>

            {orders.length > 0 && <span data-ui="resultCount" style={styles.resultCount}>{filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</span>}

            {!ordersLoading && orders.length > 0 && filteredOrders.length === 0 && (

              <div data-ui="inlineEmpty" style={styles.inlineEmpty} className="no-print">

                <p data-ui="inlineEmptyText" style={styles.inlineEmptyText}>

                  <strong>No orders match your search.</strong> Clear the search box, widen the date range, or scan the bill barcode again.

                </p>

                <button data-ui="inlineEmptyBtn" type="button" style={styles.inlineEmptyBtn} onClick={() => setSearch('')}>Clear search</button>

              </div>

            )}

            {!ordersLoading && orders.length === 0 && (

              <div data-ui="inlineEmpty" style={styles.inlineEmpty} className="no-print">

                <p data-ui="inlineEmptyText" style={styles.inlineEmptyText}>

                  <strong>No orders in this date range.</strong> Choose <em>Last 7 days</em> / <em>This month</em> above, or register a patient first.

                </p>

                <button data-ui="inlineEmptyBtn" type="button" style={styles.inlineEmptyBtn} onClick={() => navigate('/new-registration')}>New Registration</button>

              </div>

            )}

          </div>

        </div>

      </div>



      {reportData && <>

        <div className="report-identity no-print" role="status">

          <strong>{reportData.patient_name}</strong>

          <span>Patient ID: {reportData.pt_id} · Order #{reportData.id}</span>

          <span className="clinical-state">{reportData.issued?`Issued version ${reportData.report_version || 1}`:'Draft preview'}</span>

        </div>

        {reportData.presentation_provenance === 'captured-at-upgrade' && <p className="no-print" role="status">Historical lab presentation was not archived at issuance; this report preserves the lab settings available at upgrade.</p>}

        {reportData.provenance === 'legacy-at-upgrade' && <p className="no-print" role="status">Historical report preserved at upgrade. The original printed interval was not recorded; this snapshot uses the legacy values available at migration.</p>}

        <div data-ui="actions" style={styles.actions} className="no-print reports-actions-bar">

          {reportData.issued && versions.length>0 && <select aria-label="Issued report version" value={reportData.report_version || 1} disabled={printing || finalizing} onChange={async e=>{try{setReportData(await window.db.getReportVersion(reportData.id,Number(e.target.value)));}catch(err){setPrintFeedback(err.message);}}}>{versions.map(v=><option key={v.version} value={v.version}>Version {v.version}{v.version===1?' — Original':' — Amended'}</option>)}</select>}

          <select aria-label="Print copies" value={printCopies} onChange={e=>setPrintCopies(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} {n===1?'copy':'copies'}</option>)}</select>

          <select aria-label="Print mode" value={profile.mode} onChange={e=>setProfile({...profile,mode:e.target.value})}><option value="preprinted">Preprinted pad</option><option value="full">Full report</option></select>

          <button data-ui="previewBtn" style={styles.previewBtn} onClick={()=>handlePrint(true)} disabled={!layout.ready || printing || finalizing}>Preview report</button>

          <button data-ui="printBtn" style={styles.printBtn} onClick={()=>handlePrint(false)} disabled={!layout.ready || printing || finalizing}>Print report</button>

          {!reportData.issued && <button data-ui="printBtn" style={styles.printBtn} className="finalize-action" onClick={reviewFinalize} disabled={printing || finalizing || !reportData.results?.length}>Finalize report</button>}

          <span role="status">{!finalizeReview && printFeedback}</span>

        </div>

        {isAdmin && reportData.issued && <section className="no-print" aria-label="Report corrections"><h2>Controlled correction</h2><p>Correct existing results in a separate draft. Original reports and billing remain unchanged.</p><label htmlFor="amendment-reason">Reason for correction (required for new draft)</label><textarea style={{display:'block',width:'100%',maxWidth:600,minHeight:72,marginBottom:12}} id="amendment-reason" value={amendReason} onChange={e=>setAmendReason(e.target.value)} maxLength={1000}/><button onClick={openAmendment} disabled={amendBusy || printing}>{amendBusy?'Opening…':'Create or resume amendment'}</button>{amendError && !amendment && <p role="alert">{amendError}</p>}</section>}

        {amendment && <dialog ref={amendmentDialog} className="no-print finalize-dialog" aria-labelledby="amendment-title" onCancel={e=>{if(amendBusy)e.preventDefault();else setAmendment(null);}}><h2 id="amendment-title">Amend issued report</h2><p><strong>{amendment.report.patient_name}</strong> · Patient ID: {amendment.report.pt_id} · Order #{amendment.order_id}</p><p>Version {amendment.base_version} → {amendment.base_version+1}. Reason: {amendment.reason}</p><p>Review corrected results and saved reference intervals before explicit finalization. Older reports may require manual clinical review. Derived results use captured formula provenance; older incomplete formulas require separate validated review.</p>{amendment.report.results.map(r=><div key={r.parameter_id} style={{display:'grid',gap:6,marginBottom:16}}><label htmlFor={`amend-result-${r.parameter_id}`}>{r.test_name} ({r.unit || 'unitless'})</label><input id={`amend-result-${r.parameter_id}`} value={amendValues[r.parameter_id] ?? ''} onChange={e=>setAmendValues({...amendValues,[r.parameter_id]:e.target.value})}/><small>{r.refRange || 'Reference interval not configured'} · {r.review_message || 'Review before finalization'}{r.flag ? ` · Flag: ${r.flag}` : ''}</small></div>)}{amendError && <p role="alert">{amendError}</p>}<button disabled={amendBusy} onClick={()=>{amendmentDialog.current.close();setAmendment(null);}}>Close (keep saved draft)</button><button disabled={amendBusy} onClick={()=>saveAmendment(false)}>Save draft</button><button disabled={amendBusy} className="confirm-action" onClick={()=>saveAmendment(true)}>Finalize amended version</button><button disabled={amendBusy} onClick={async()=>{setAmendBusy(true);try{await window.db.cancelReportAmendment({draftId:amendment.id,revision:amendment.revision});amendmentDialog.current.close();setAmendment(null);}catch(e){setAmendError(e.message);}finally{setAmendBusy(false);}}}>Discard draft</button></dialog>}

        <ReportPrintLayout report={reportData.issued?reportData:{...reportData,lab_config:labConfig}} profile={profile} onReady={setLayout} />

        {finalizeReview && <dialog aria-labelledby="finalization-title" ref={finalizeDialog} className="no-print finalize-dialog" onCancel={e=>{if(finalizing)e.preventDefault();else setFinalizeReview(null);}}>

          <h2 id="finalization-title">Finalize report</h2>{printFeedback.startsWith('Report was not finalized:') && <p role="alert">{printFeedback}</p>}<p>Review these results before issuing. Finalized clinical content cannot be edited in this workflow.</p>

          <ul>{finalizeReview.results.map((r,i)=><li key={i}><strong>{r.test_name}</strong>: {r.result_value ?? r.result_text} {r.unit}<br/>{r.refRange || 'Reference interval not configured'}{r.review_message && <p>{r.review_message}</p>}{r.flag && <p>Flag: {r.flag}</p>}</li>)}</ul>

          <button disabled={finalizing} onClick={()=>{finalizeDialog.current.close();setFinalizeReview(null);}}>Cancel</button>

          <button disabled={finalizing} className="confirm-action" onClick={finalize}>{finalizing?'Finalizing…':'Confirm finalization'}</button>

        </dialog>}

      </>}



      {!reportData && selectedOrder && <p data-ui="loading" style={styles.loading} className="no-print">Loading...</p>}

      {!ordersLoading && !selectedOrder && orders.length > 0 && filteredOrders.length > 0 && (

        <div data-ui="hintWrap" className="no-print" style={styles.hintWrap}>

          <p data-ui="hint" style={styles.hint}>Select an order above to view and print.</p>

          <button data-ui="actionBtn" type="button" style={styles.actionBtn} onClick={() => navigate('/new-registration')}>New Registration</button>

        </div>

      )}

    </div>

  );

}



const styles = {

  container: { maxWidth: 780 },

  pageHeader: {

    display: 'flex',

    alignItems: 'center',

    gap: 20,

    marginBottom: 24,

    padding: '24px 28px',

    background: 'linear-gradient(135deg, #1e3a5f 0%, #0d7377 50%, #14a3a8 100%)',

    borderRadius: 16,

    color: '#fff',

    boxShadow: '0 8px 24px rgba(13,115,119,0.25)',

  },

  pageHeaderIcon: {

    width: 56,

    height: 56,

    borderRadius: 14,

    background: 'rgba(255,255,255,0.2)',

    display: 'flex',

    alignItems: 'center',

    justifyContent: 'center',

    fontSize: 28,

  },

  title: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' },

  subtitle: { fontSize: 14, margin: '6px 0 0', opacity: 0.95 },

  card: {

    background: '#fff',

    padding: 24,

    borderRadius: 14,

    boxShadow: '0 4px 20px rgba(0,0,0,0.06)',

    marginBottom: 20,

    border: '1px solid rgba(0,0,0,0.04)',

  },

  reportCardWrap: { display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24 },

  reportCard: {

    background: '#fff',

    padding: 14,

    borderRadius: 10,

    boxShadow: '0 4px 20px rgba(0,0,0,0.06)',

    border: '1px solid #e8ecef',

  },

  presetCardGrid: {

    display: 'grid',

    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',

    gap: 16,

    marginBottom: 20,

  },

  presetCard: {

    display: 'flex',

    flexDirection: 'column',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 8,

    padding: '20px 16px',

    borderRadius: 14,

    border: '2px solid #e2e8f0',

    background: '#fff',

    cursor: 'pointer',

    transition: 'all 0.2s ease',

    minHeight: 44,

    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',

    color: '#475569',

  },

  presetCardActive: {

    background: 'linear-gradient(135deg, #0d7377 0%, #14a3a8 100%)',

    borderColor: 'transparent',

    color: '#fff',

    boxShadow: '0 4px 16px rgba(13,115,119,0.35)',

  },

  presetCardIcon: { fontSize: 28, lineHeight: 1 },

  presetCardLabel: { fontSize: 14, fontWeight: 600, letterSpacing: '0.3px' },

  filterRow: { display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 },

  filterCol: { minWidth: 120 },

  row: { marginBottom: 12 },

  label: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' },

  input: { width: '100%', minWidth: 140, padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, transition: 'border-color 0.2s' },

  searchInput: { width: '100%', minWidth: 180, padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, transition: 'border-color 0.2s' },

  select: { width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, transition: 'border-color 0.2s' },

  reportHeader: { marginTop: 0, marginBottom: 8, paddingBottom: 4 },

  patientCard: {

    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',

    border: '1px solid #e2e8f0',

    borderRadius: 6,

    padding: '5px 8px',

    marginBottom: 6,

    borderLeft: '2px solid #0d7377',

  },

  patientCardMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2px 8px', marginBottom: 4 },

  patientName: { fontSize: 12, fontWeight: 700, color: '#1e293b', letterSpacing: '0.15px', lineHeight: 1.2 },

  patientId: { fontSize: 9, fontWeight: 600, color: '#0d7377', backgroundColor: 'rgba(13,115,119,0.1)', padding: '1px 5px', borderRadius: 3, lineHeight: 1.2 },

  patientCardGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px 8px', marginBottom: 3 },

  patientItem: { display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 },

  patientLabel: { fontSize: 7, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.2px', lineHeight: 1.2 },

  patientValue: { fontSize: 10, fontWeight: 500, color: '#334155', lineHeight: 1.25 },

  patientAddress: {

    display: 'flex',

    flexDirection: 'row',

    flexWrap: 'wrap',

    alignItems: 'baseline',

    gap: '4px 6px',

    paddingTop: 3,

    marginTop: 2,

    borderTop: '1px solid #e8ecef',

  },

  patientAddressLabel: { fontSize: 7, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.2px', flexShrink: 0 },

  patientAddressValue: { fontSize: 10, fontWeight: 500, color: '#334155', lineHeight: 1.25, flex: '1 1 120px', minWidth: 0 },

  reportBarcodeSection: {

    display: 'flex',

    flexDirection: 'column',

    gap: 2,

    alignItems: 'center',

    paddingTop: 4,

    marginTop: 3,

    borderTop: '1px solid #e8ecef',

  },

  reportDate: { fontSize: 9, fontWeight: 600, color: '#0d7377', marginTop: 3, paddingTop: 2, lineHeight: 1.2 },

  departmentTitle: { fontSize: 13, fontWeight: 700, marginTop: 6, marginBottom: 8, color: '#0d7377', borderBottom: '2px solid #0d7377', paddingBottom: 4, textAlign: 'center', letterSpacing: '0.4px', textTransform: 'uppercase' },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },

  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #e2e8f0', fontWeight: 600, fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },

  td: { padding: '8px 12px', borderBottom: '1px solid #f1f5f9' },

  footer: { marginTop: 16, paddingTop: 10, fontSize: 11, color: '#64748b' },

  footerReadBy: { marginBottom: 8 },

  footerClinical: { fontStyle: 'italic', marginBottom: 4 },

  pageNumber: { marginTop: 6, fontSize: 11, color: '#64748b', textAlign: 'right', width: '100%', alignSelf: 'flex-end' },

  actions: { display: 'flex', gap: 14, alignItems: 'center', marginTop: 20, padding: '18px 20px', background: 'linear-gradient(to right, #f8fafc 0%, #f1f5f9 100%)', borderRadius: 12, border: '1px solid #e2e8f0' },

  copiesSelect: { padding: '10px 16px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, background: '#fff' },

  previewBtn: { background: 'linear-gradient(135deg, #475569 0%, #64748b 100%)', color: '#fff', border: 'none', padding: '12px 22px', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 2px 8px rgba(71,85,105,0.25)' },

  printBtn: { background: 'linear-gradient(135deg, #0d7377 0%, #14a3a8 100%)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 14px rgba(13,115,119,0.35)' },

  printFeedback: { color: '#0d7377', fontWeight: 600, fontSize: 14 },

  shortcutHint: { fontSize: 12, color: '#94a3b8', marginLeft: 8 },

  resultCount: { fontSize: 12, color: '#64748b', marginLeft: 12 },

  inlineEmpty: {

    marginTop: 12,

    padding: '14px 16px',

    background: '#f8fafc',

    borderRadius: 10,

    border: '1px solid #e2e8f0',

    display: 'flex',

    flexDirection: 'column',

    gap: 10,

    alignItems: 'flex-start',

  },

  inlineEmptyText: { margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 },

  inlineEmptyBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 13, fontWeight: 600, cursor: 'pointer' },

  loading: { color: '#64748b', padding: 20 },

  hint: { color: '#94a3b8', fontSize: 14, marginBottom: 12 },

  hintWrap: { padding: 20 },

  actionBtn: { padding: '10px 20px', borderRadius: 10, border: '2px solid #0d7377', background: '#fff', color: '#0d7377', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },

};
