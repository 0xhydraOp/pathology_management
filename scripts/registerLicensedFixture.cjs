// Test-only dependency composition: real signature verification, explicit temporary
// installation and synthetic policy. Never packaged/imported by production code.
const path=require('path'),crypto=require('crypto');
const {createLicensingFixture}=require('./licensingFixture.cjs');
async function registerLicensedApplicationFixture(ipc,db,services={}){
 const licensing=services.licensing || await createLicensingFixture({directory:path.join(db.dataRoot,'synthetic-licence-'+crypto.randomUUID())});
 const result=require('../electron/applicationIpc.cjs').registerApplicationIpc(ipc,db,{...services,licensing});
 if(services.withLicenceIpc)require('../electron/licensingIpc.cjs').registerLicensingIpc(ipc,result.authorization,licensing);
 return {...result,licensing};
}
async function registerLicensedReferenceFixture(ipc,db,services={}){
 const licensing=services.licensing || await createLicensingFixture({directory:path.join(db.dataRoot,'synthetic-licence-'+crypto.randomUUID())});
 return require('../electron/referenceIpc.cjs').registerReferenceIpc(ipc,db,{...services,licensing});
}
module.exports={registerLicensedApplicationFixture,registerLicensedReferenceFixture};
