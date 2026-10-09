// Exact current-version installer only. Never choose a stale or synthetic QA build.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const pkg=require('../package.json'),root=path.resolve(__dirname,'..'),dir=path.resolve(root,process.argv[2]||'release');
if(dir!==path.join(root,'release')&&!dir.startsWith(path.join(root,'release')+path.sep))throw Error('Installer archive output must be inside release.');
const name=pkg.build.win.artifactName.replace('${version}',pkg.version),setup=path.join(dir,name);
if(!fs.existsSync(setup))throw Error('Expected exact installer is missing; build it first.');
if(process.platform!=='win32')throw Error('Installer archive creation requires Windows.');
const notes=path.join(dir,'READ_ME_FIRST_Windows_Install.txt');fs.copyFileSync(path.join(root,'WINDOWS_INSTALL.txt'),notes);
const prerelease=path.join(dir,'OFFLINE_RELEASE.md');fs.copyFileSync(path.join(root,'docs/OFFLINE_RELEASE.md'),prerelease);
const dest=path.join(dir,'Patholy Management System Offline Prerelease '+pkg.version+' Windows-Install-Package.zip');
if(fs.existsSync(dest))throw Error('Refusing to overwrite an existing install archive.');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
// Use the Windows .NET ZIP API directly; the optional Archive module may be absent.
const command = 'Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; '+
  '$taskArchive=[IO.Compression.ZipFile]::Open('+quote(dest)+',[IO.Compression.ZipArchiveMode]::Create); '+
  'try { foreach($taskArchiveFile in @('+[setup,notes,prerelease].map(quote).join(',')+')) { '+
  '[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive,$taskArchiveFile,[IO.Path]::GetFileName($taskArchiveFile),[IO.Compression.CompressionLevel]::Optimal) | Out-Null } } finally { $taskArchive.Dispose() }';
execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{stdio:'inherit',windowsHide:true});
console.log('Created exact-version offline prerelease installer archive.');
