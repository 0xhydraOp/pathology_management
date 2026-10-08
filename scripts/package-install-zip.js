// Exact current-version installer only. Never choose a stale or synthetic QA build.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const pkg=require('../package.json'),root=path.resolve(__dirname,'..'),dir=path.join(root,'release');
const name=pkg.build.win.artifactName,setup=path.join(dir,name);
if(!fs.existsSync(setup))throw Error('Expected exact installer is missing; build it first.');
if(process.platform!=='win32')throw Error('Installer archive creation requires Windows.');
const notes=path.join(dir,'READ_ME_FIRST_Windows_Install.txt');fs.copyFileSync(path.join(root,'WINDOWS_INSTALL.txt'),notes);
const prerelease=path.join(dir,'PRERELEASE.md');fs.copyFileSync(path.join(root,'docs/PRERELEASE.md'),prerelease);
const dest=path.join(dir,'Patholy Management System Activation-Pending Prerelease '+pkg.version+' Windows-Install-Package.zip');
if(fs.existsSync(dest))throw Error('Refusing to overwrite an existing install archive.');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath @('+[setup,notes,prerelease].map(quote).join(',')+') -DestinationPath '+quote(dest)],{stdio:'inherit',windowsHide:true});
console.log('Created exact-version prerelease installer archive.');
