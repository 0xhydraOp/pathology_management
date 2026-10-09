// Explicit reviewed assets only; no arbitrary selection, default-branch tag or clobber.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const [manifestFile,notesFile]=process.argv.slice(2);
if(!manifestFile||!notesFile)throw Error('Usage: node scripts/create-release.js reviewed-manifest.json release-notes.md');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
if(git('status','--porcelain'))throw Error('Release requires a clean reviewed working tree.');
const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),sha=git('rev-parse','HEAD');
if(manifest.commit!==sha||manifest.version!==pkg.version||typeof manifest.prerelease!=='boolean'||manifest.prerelease!==pkg.version.includes('-')||manifest.verificationPassed!==true)throw Error('Exact reviewed commit, matching release version/type and successful verification required.');
if(!fs.readFileSync(notesFile,'utf8').includes('offline'))throw Error('Offline readiness must be described in release notes.');
if(!Array.isArray(manifest.assets)||!manifest.assets.length)throw Error('Explicit reviewed assets required.');
const releaseRoot=path.join(root,'release')+path.sep;
const assets=manifest.assets.map(a=>{const file=path.resolve(root,a.path);if(!file.startsWith(releaseRoot)||!fs.statSync(file).isFile())throw Error('Asset outside release directory.');if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==a.sha256)throw Error('Asset hash mismatch.');return file;});
const tag='v'+pkg.version;
try{execFileSync('gh',['release','view',tag],{cwd:root,stdio:'pipe'});throw Error('Release already exists; refusing overwrite.');}catch(e){if(e.status===undefined)throw e;}
if(git('rev-parse',tag+'^{commit}')!==sha)throw Error('Release tag must identify the exact reviewed commit.');
const typeArgs=manifest.prerelease?['--prerelease','--latest=false']:['--latest'];
execFileSync('gh',['release','create',tag,...assets,'--verify-tag','--target',sha,...typeArgs,'--title',tag+' — Pathology Management System (offline, unsigned)','--notes-file',path.resolve(notesFile)],{cwd:root,stdio:'inherit',windowsHide:true});
