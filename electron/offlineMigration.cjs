'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Only obsolete activation files are touched. Clinical data and database tables
// remain unchanged; archived activation bytes need no decryption or network call.
function migrateOfflineInstallation(db,{licensingDirectory}={}){
 if(!licensingDirectory)return {migrated:false};
 if(!path.isAbsolute(licensingDirectory))throw new Error('Offline migration requires an absolute activation directory.');
 if(!fs.existsSync(licensingDirectory))return {migrated:false};
 if(!db.db||!db._lockFile)throw new Error('Offline migration requires an initialized database ownership lock.');
 if(!fs.lstatSync(licensingDirectory).isDirectory()||fs.lstatSync(licensingDirectory).isSymbolicLink())throw new Error('Activation migration requires a regular local directory.');
 const names=fs.readdirSync(licensingDirectory).filter(n=>n==='activation.enc'||/^activation\.enc\.[a-f0-9-]+\.tmp$/i.test(n));
 if(!names.length)return {migrated:false};
 const entries=names.map(name=>{const filename=path.join(licensingDirectory,name),stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw new Error('Obsolete activation file cannot be safely archived.');return {name,filename,bytes:fs.readFileSync(filename)};});
 const original=Buffer.from(db.db.export());
 const recoveryPath=db._backupReferenceUpgrade(original,'before-offline-conversion');
 const archive=path.join(db._backupDir(),'offline-activation-archive-'+Date.now()+'-'+crypto.randomUUID());
 fs.mkdirSync(archive,{mode:0o700});
 for(const entry of entries){const target=path.join(archive,entry.name),fd=fs.openSync(target,'wx',0o600);try{fs.writeFileSync(fd,entry.bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(!fs.readFileSync(target).equals(entry.bytes))throw new Error('Activation archive verification failed. Original activation state was preserved.');}
 // Verify every original again before beginning removal; never copy back an old
 // database or promote activation material into the offline application.
 for(const entry of entries)if(!fs.readFileSync(entry.filename).equals(entry.bytes))throw new Error('Activation state changed during migration. Retry after closing other versions.');
 for(const entry of entries)fs.unlinkSync(entry.filename);
 return {migrated:true,recoveryPath,archive,archivedFiles:names};
}
module.exports={migrateOfflineInstallation};
