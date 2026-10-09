const {createAuthorization}=require('./authorization.cjs');
const permissions={credentialState:'public',setupAdmin:'public',changePassword:'credential',verifyUser:'public',getSession:'public',logout:'public',listReferenceSets:'staff',getReferenceContext:'staff',saveReferenceDraft:'admin',approveReferenceDraft:'admin',getReport:'staff',listReportVersions:'staff',getReportVersion:'staff',getReportAmendment:'admin',createReportAmendment:'admin',saveReportAmendment:'admin',finalizeReportAmendment:'admin',cancelReportAmendment:'admin',issueReport:'staff',getPrintProfile:'staff',validatePrintProfile:'staff',setPrintProfile:'admin',reloadCatalogue:'disabled'};
function guardGenericSql(){throw new Error('Permission denied: generic SQL is disabled; use an authorized operation. Issued status and explicit order columns are protected.');}
function registerReferenceIpc(ipcMain,db,{authorization=createAuthorization(db)}={}){
 const auth=authorization;
 const handle=(name,fn)=>ipcMain.handle('db:'+name,(event,...args)=>{auth.trusted(event);const permission=permissions[name];const actor=permission==='public'?null:permission==='disabled'?null:auth.requireActor(event,permission);return fn(event,actor,...args);});
 handle('credentialState',()=>{const state=db.credentialState(),freshInstallation=require('./onboarding.cjs').isFreshInstall(db);return {...state,freshInstallation,recoveryRequired:state.setupRequired&&!freshInstallation};});
 handle('setupAdmin',(_,actor,username,password)=>db.setupAdmin(username,password));
 handle('changePassword',(event,actor,current,next)=>{const credentials=require('./credentials.cjs');const row=db.get('SELECT password_hash FROM users WHERE id=?',[actor.id]);if(!credentials.verify(current,row.password_hash))throw new Error('Current password is incorrect');credentials.validate(next);if(credentials.verify(next,row.password_hash))throw new Error('Choose a different password');const result=db._referenceAtomic(()=>{db.db.run('UPDATE users SET password_hash=? WHERE id=?',[credentials.hash(next),actor.id]);require('./applicationOperations.cjs').audit(db,actor,'change-password',actor.id);return {ok:true};});auth.invalidateUser(actor.id);return result;});
 handle('verifyUser',(event,_,username,password)=>auth.login(event,username,password));
 handle('getSession',event=>auth.getSession(event));handle('logout',event=>auth.clear(event.sender));
 handle('listReferenceSets',(_,actor,id)=>db.listReferenceSets(id));handle('getReferenceContext',()=>db.getReferenceContext());
 handle('saveReferenceDraft',(_,actor,id,rules,previousId,sourceId)=>db.saveReferenceDraft(actor,id,rules,previousId,sourceId));
 handle('approveReferenceDraft',(_,actor,id)=>db.approveReferenceDraft(actor,id));handle('getReport',(_,actor,id)=>db.getReport(id));handle('issueReport',(_,actor,id)=>db.issueReport(actor,id));
 handle('getPrintProfile',()=>db.getPrintProfile());handle('validatePrintProfile',(_,actor,profile)=>require('./printProfile.cjs').validatePrintProfile(profile));handle('setPrintProfile',(_,actor,profile)=>db.setPrintProfile(actor,profile));
 handle('reloadCatalogue',()=>{throw new Error('Permission denied: Catalogue reload is disabled to preserve parameter IDs and local intervals.');});
 for(const name of ['listReportVersions','getReportVersion'])handle(name,(_,actor,...args)=>db[name](...args));
 for(const name of ['getReportAmendment','createReportAmendment','saveReportAmendment','finalizeReportAmendment','cancelReportAmendment'])handle(name,(_,actor,...args)=>db[name](actor,...args));
 return {guardGenericSql,authorization:auth};
}
module.exports={registerReferenceIpc,guardGenericSql,permissions};
