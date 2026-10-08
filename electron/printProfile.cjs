const schema=require('./printProfileSchema.json');
function validatePrintProfile(input){
 if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Print profile is required');
 const allowed=Object.keys(schema.defaults);if(Object.keys(input).some(k=>!allowed.includes(k)))throw new Error('Unknown print setting');
 const p={...schema.defaults,...input};
 if(p.version!==1 || !['preprinted','full'].includes(p.mode) || ![...Object.keys(schema.papers),'custom'].includes(p.paper))throw new Error('Invalid print mode or paper');
 for(const key of Object.keys(schema.fields))if(typeof p[key]!=='number' || !Number.isFinite(p[key]))throw new Error(`${schema.fields[key]} must be a finite number in millimetres`);
 if(p.paper!=='custom')[p.paperWidthMm,p.paperHeightMm]=schema.papers[p.paper];
 if(p.paperWidthMm<120 || p.paperWidthMm>500 || p.paperHeightMm<150 || p.paperHeightMm>1000)throw new Error('Paper must be 120–500 mm wide and 150–1000 mm high');
 if(p.fontSizeMm<2.5 || p.fontSizeMm>6 || p.rowSpacingMm<0 || p.rowSpacingMm>10)throw new Error('Font must be 2.5–6 mm; row spacing 0–10 mm');
 if(!Array.isArray(p.columnWidthsMm) || p.columnWidthsMm.length!==4 || p.columnWidthsMm.some(n=>typeof n!=='number' || !Number.isFinite(n) || n<12))throw new Error('Provide four column widths of at least 12 mm');
 if(p.reservedHeaderMm<0 || p.reservedFooterMm<0 || p.patientXmm<0 || p.tableXmm<0 || Math.abs(p.offsetXmm)>30 || Math.abs(p.offsetYmm)>30)throw new Error('Positions/reserved spaces must be nonnegative; offsets must be within ±30 mm');
 const x=p.tableXmm+p.offsetXmm,y=p.tableYmm+p.offsetYmm,px=p.patientXmm+p.offsetXmm,py=p.patientYmm+p.offsetYmm;
 const bottom=p.paperHeightMm-p.reservedFooterMm;
 if(x<0 || px<0 || px>p.paperWidthMm-60 || x+p.columnWidthsMm.reduce((a,b)=>a+b,0)>p.paperWidthMm-2)throw new Error('Columns or patient details extend beyond the paper after offsets');
 if(py<p.reservedHeaderMm || y<py+12 || bottom-y<4*p.fontSizeMm+2*p.rowSpacingMm+10)throw new Error('Insufficient printable space: check header/footer, patient position and table start');
 if(p.mode==='full' && (p.reservedHeaderMm<18 || p.reservedFooterMm<12))throw new Error('Full-report mode needs at least 18 mm for its header and 12 mm for its footer');
 return p;
}
module.exports={validatePrintProfile,schema,methods:{
 getPrintProfile(){const row=this.get('SELECT payload FROM lab_print_profile WHERE id=1');return validatePrintProfile(row?JSON.parse(row.payload):schema.defaults);},
 setPrintProfile(actor,input){const user=this._referenceActor(actor,true),profile=validatePrintProfile(input),before=this.getPrintProfile();return this._referenceAtomic(()=>{this.db.run('INSERT INTO lab_print_profile(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',[JSON.stringify(profile)]);this.db.run('INSERT INTO audit_log(table_name,record_id,action,old_value,new_value,changed_by) VALUES(?,1,?,?,?,?)',['lab_print_profile','configure',JSON.stringify(before),JSON.stringify(profile),user.username]);return profile;});}
}};
