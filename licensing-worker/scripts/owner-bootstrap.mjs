// Deployment-operator bootstrap. Never accepts or prints passwords or bearer values.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const workerRoot=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const repoRoot=path.dirname(workerRoot);
const EMAIL='iamrobiul94@gmail.com';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest=/^[A-Za-z0-9_-]{43}$/;

export function buildBootstrapSql({id,tokenHash,createdAt,expiresAt}){
 if(!uuid.test(id)||!digest.test(tokenHash)||!Number.isSafeInteger(createdAt)||createdAt<0||expiresAt!==createdAt+900)throw Error('Invalid bootstrap metadata.');
 // Remote Wrangler --file imports are transactional. The NOT NULL guard aborts
 // the entire import if an identity is already provisioning/active.
 return `INSERT INTO owner_auth_identity(id,email,user_id,state,epoch) VALUES(1,'${EMAIL}',NULL,'unclaimed',1) ON CONFLICT(id) DO NOTHING;
UPDATE owner_auth_bootstrap SET consumed_at=${createdAt} WHERE consumed_at IS NULL;
INSERT INTO owner_auth_bootstrap(id,token_hash,expires_at,consumed_at) VALUES('${id}',CASE WHEN EXISTS(SELECT 1 FROM owner_auth_identity WHERE id=1 AND email='${EMAIL}' AND state='unclaimed' AND user_id IS NULL) THEN '${tokenHash}' ELSE NULL END,${expiresAt},NULL);
INSERT INTO owner_audit(id,actor,action,customer_id,license_id,created_at,details) VALUES('${crypto.randomUUID()}','deployment-operator','owner.bootstrap.register',NULL,NULL,${createdAt},'{"expiresAt":${expiresAt}}');
`;
}

export function privateDirectory(parent){
 const resolved=fs.realpathSync(parent);
 const relative=path.relative(repoRoot,resolved);
 if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Bootstrap material must be outside the repository.');
 if(/(?:^|[\\/])(?:OneDrive[^\\/]*|Dropbox|Google Drive)(?:[\\/]|$)/i.test(resolved))throw Error('Use a non-synchronized protected directory.');
 const directory=fs.mkdtempSync(path.join(resolved,'patholy-owner-bootstrap-'));
 if(process.platform==='win32'){
  try{execFileSync('icacls',[directory,'/inheritance:r','/grant:r',`${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`,'SYSTEM:(OI)(CI)F'],{stdio:'ignore',windowsHide:true});}
  catch{throw Error('Private directory permissions could not be established; no token was written.');}
 }else fs.chmodSync(directory,0o700);
 return directory;
}

export function prepareBootstrap(config){
 if(!config||config.ownerEmailControlVerified!==true||config.ownerOrigin!=='https://admin.molladigital.com'||typeof config.outputParent!=='string'||Object.keys(config).some(k=>!['ownerEmailControlVerified','ownerOrigin','outputParent'].includes(k)))throw Error('Provide the fixed owner origin, a protected output parent and verified owner-email control attestation.');
 const directory=privateDirectory(config.outputParent);
 const token=crypto.randomBytes(32).toString('base64url'),createdAt=Math.floor(Date.now()/1000),expiresAt=createdAt+900;
 const metadata={id:crypto.randomUUID(),tokenHash:crypto.createHash('sha256').update(token).digest('base64url'),createdAt,expiresAt};
 const sqlFile=path.join(directory,'register-bootstrap.sql'),linkFile=path.join(directory,'owner-setup.secret.json');
 fs.writeFileSync(sqlFile,buildBootstrapSql(metadata),{flag:'wx',mode:0o600});
 fs.writeFileSync(linkFile,JSON.stringify({setupLink:config.ownerOrigin+'/owner/setup#token='+token,expiresAt,ownerEmail:EMAIL,registration:'Not registered. Use authenticated deployment administration before opening.'},null,2)+'\n',{flag:'wx',mode:0o600});
 return {directory,sqlFile,linkFile,expiresAt};
}

async function main(){
 const [configFile,operation]=process.argv.slice(2);
 if(!configFile||!['--prepare-only','--register-remote'].includes(operation)||process.argv.length!==4)throw Error('Usage: node scripts/owner-bootstrap.mjs config-file --prepare-only|--register-remote');
 if(operation==='--register-remote'){
  const text=fs.readFileSync(path.join(workerRoot,'wrangler.jsonc'),'utf8');
  const database=text.match(/"binding"\s*:\s*"DB"[\s\S]*?"database_id"\s*:\s*"([a-f0-9-]+)"/i)?.[1];
  if(!database||database==='00000000-0000-0000-0000-000000000000'||!uuid.test(database))throw Error('A reviewed deployed D1 binding and applied owner-auth migration are required.');
 }
 const prepared=prepareBootstrap(JSON.parse(fs.readFileSync(configFile,'utf8')));
 if(operation==='--register-remote'){
  try{execFileSync(process.execPath,[path.join(workerRoot,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--remote','--file',prepared.sqlFile,'--config',path.join(workerRoot,'wrangler.jsonc'),'--yes','--json'],{cwd:workerRoot,stdio:['ignore','pipe','pipe'],windowsHide:true,maxBuffer:1024*1024});}
  catch{throw Error('Authenticated D1 registration failed or has an uncertain outcome. Do not deliver the link; inspect deployment state privately. No secret was printed.');}
  const record=JSON.parse(fs.readFileSync(prepared.linkFile,'utf8'));record.registration='Registered through authenticated D1 deployment administration.';
  fs.writeFileSync(prepared.linkFile,JSON.stringify(record,null,2)+'\n',{mode:0o600});
 }
 console.log(operation==='--prepare-only'?'Protected preparation files created; no remote registration occurred. Locate the newest patholy-owner-bootstrap directory under the configured private parent.':'Bootstrap registered. Deliver the protected one-time link privately; expires 15 minutes after generation. No bearer value was printed.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Owner bootstrap could not complete safely. Review configuration, private directory permissions and authenticated deployment state; no credentials were logged.');process.exitCode=1;});
