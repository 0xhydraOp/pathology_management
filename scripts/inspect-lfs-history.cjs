// Static historical-artifact inspection. Never execute archived apps or print matches.
// Python stdlib reads ZIP entries; @electron/asar reads archived source only.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),cp=require('child_process'),asar=require('@electron/asar');
const python=process.env.REFERENCE_TEST_PYTHON;
if(!python)throw Error('Set REFERENCE_TEST_PYTHON to the trusted Python interpreter.');
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const common=path.resolve(git('rev-parse','--git-common-dir'));
const base=path.join(process.env.LOCALAPPDATA||os.tmpdir(),'PatholySecurityReview');fs.mkdirSync(base,{recursive:true});
const quarantine=fs.mkdtempSync(path.join(base,'lfs-'));
if(process.platform==='win32'){
 const user=process.env.USERDOMAIN+'\\'+process.env.USERNAME;
 try{cp.execFileSync('icacls',[quarantine,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'ignore',windowsHide:true});}
 catch{throw Error('Unable to restrict inspection directory access.');}
}
const zipScript=`import zipfile,json,os,hashlib,sys,re
z=zipfile.ZipFile(sys.argv[1]); q=sys.argv[2]; counts={'entries':0,'databaseOrReportCandidates':0,'unsafePaths':0,'oversizeSkipped':0,'unreadableEntries':0,'secretPatterns':0,'patientLiteralCandidates':0}; asars=[]
patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\\s+[A-Za-z0-9+/=]{48,}',rb'\\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{70,})\\b',rb'\\bAKIA[A-Z0-9]{16}\\b']
for i in z.infolist():
 if i.is_dir(): continue
 counts['entries']+=1; n=i.filename.replace('\\\\','/'); parts=n.split('/')
 if n.startswith('/') or any(x=='..' for x in parts) or re.match(r'^[A-Za-z]:',n): counts['unsafePaths']+=1; continue
 candidate=n.lower().endswith(('.db','.sqlite','.sqlite3','.enc','.pdf','.xlsx','.docx'))
 if i.file_size>512*1024*1024: counts['oversizeSkipped']+=1; continue
 try: data=z.read(i)
 except Exception: counts['unreadableEntries']+=1; continue
 if candidate or data.startswith(b'SQLite format 3\\x00'): counts['databaseOrReportCandidates']+=1
 counts['secretPatterns']+=sum(bool(re.search(p,data)) for p in patterns)
 if n.lower().endswith(('.js','.cjs','.json','.sql')) and re.search(rb'INSERT\\s+INTO\\s+patients\\s*\\([^)]*\\)\\s*VALUES\\s*\\(\\s*[\\\"\\\']',data,re.I): counts['patientLiteralCandidates']+=1
 if n.lower().endswith('/app.asar') or n.lower()=='app.asar':
  p=os.path.join(q,'archive-'+str(len(asars))+'.asar'); open(p,'wb').write(data); asars.append(p)
print(json.dumps({'counts':counts,'asars':asars}))`;
const patternTests=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{48,}/],['api-token',/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{70,}|AKIA[A-Z0-9]{16})\b/]];
const objects=[...new Set(git('lfs','ls-files','--all','--long').split('\n').map(s=>s.match(/^[a-f0-9]{64}/)?.[0]).filter(Boolean))];
const report={date:'2026-10-08',method:'static ZIP/ASAR byte inspection; no archived application or database executed',objects:[],unavailable:[]};
for(const oid of objects){
 const file=path.join(common,'lfs','objects',oid.slice(0,2),oid.slice(2,4),oid);
 if(!fs.existsSync(file)){report.unavailable.push({oid,reason:'not in local LFS cache'});continue;}
 const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(hash!==oid){report.unavailable.push({oid,reason:'object hash mismatch'});continue;}
 let archive;try{archive=JSON.parse(cp.execFileSync(python,['-c',zipScript,file,quarantine],{encoding:'utf8',maxBuffer:1024*1024,windowsHide:true,stdio:['ignore','pipe','ignore']}));}catch{report.unavailable.push({oid,reason:'archive unreadable or unsupported'});continue;}
 const object={oid,size:fs.statSync(file).size,zip:archive.counts,asarFiles:0,textFiles:0,databaseOrReportCandidates:0,patientLiteralCandidates:0,secretPatternCandidates:[],legacyDefaultCredential:false,legacySharedBackupSecret:false,readErrors:0};
 for(const app of archive.asars){for(const entry of asar.listPackage(app)){
  const name=entry.replace(/^[/\\]+/,'');if(name.split(/[/\\]/).includes('..')){object.readErrors++;continue;}
  let stat;try{stat=asar.statFile(app,name);}catch{object.readErrors++;continue;}if(stat.files||stat.link)continue;object.asarFiles++;
  if(/\.(?:db|sqlite3?|enc|pdf|xlsx|docx)$/i.test(name))object.databaseOrReportCandidates++;
  if(stat.size>128*1024*1024){object.readErrors++;continue;}
  let data;try{data=asar.extractFile(app,name);}catch{object.readErrors++;continue;}
  if(data.subarray(0,16).equals(Buffer.from('SQLite format 3\0')))object.databaseOrReportCandidates++;
  if(!/\.(?:js|cjs|mjs|json|html|md|txt|sql)$/i.test(name))continue;
  const text=data.toString('utf8');object.textFiles++;
  for(const [category,p]of patternTests)if(p.test(text))object.secretPatternCandidates.push({pathHash:crypto.createHash('sha256').update(name).digest('hex'),category});
  if(/INSERT\s+INTO\s+patients\s*\([^)]*\)\s*VALUES\s*\(\s*['"]/i.test(text))object.patientLiteralCandidates++;
  if(name.replaceAll('\\','/')==='electron/database.js'){
   object.legacyDefaultCredential=/INSERT\s+INTO\s+users/.test(text)&&/hashPassword\(\s*['"][^'"]+['"]\s*\)/.test(text);
   object.legacySharedBackupSecret=/ENCRYPTION_KEY|BACKUP_KEY/.test(text)&&/createCipheriv/.test(text);
  }
 }}report.objects.push(object);
}
const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
// Quarantined source stays outside the workspace with restricted OS permissions.
// The public report contains counts/categories and object hashes, never matches.
