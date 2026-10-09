// Local, unsigned Electron directory + Inno installer, from the reviewed commit.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
if(process.platform!=='win32')throw Error('Windows packaging requires Windows and Inno Setup.');
const output=path.resolve(root,process.argv[2]||`release/final-${pkg.version}`),releaseRoot=path.join(root,'release')+path.sep;
if(!output.startsWith(releaseRoot))throw Error('Output must be inside this repository release directory.');
if(fs.existsSync(path.join(output,pkg.build.win.artifactName.replace('${version}',pkg.version))))throw Error('Refusing to overwrite an existing versioned installer.');
const compiler=[process.env.INNO_COMPILER,path.join(process.env.ProgramFiles||'C:/Program Files','Inno Setup 7','ISCC.exe'),path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Inno Setup 6','ISCC.exe')].find(p=>p&&fs.existsSync(p));
if(!compiler)throw Error('Inno Setup compiler not found. Install it and set INNO_COMPILER to ISCC.exe.');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())throw Error('Final packaging requires a clean reviewed commit.');
const run=(file,args)=>execFileSync(file,args,{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'}});
run(process.execPath,[path.join(root,'scripts/build-icon.mjs')]);
run(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build']);
run(process.execPath,[path.join(root,'node_modules/electron-builder/out/cli/cli.js'),'--dir',`--config.directories.output=${output}`,`--config.extraMetadata.patholySourceCommit=${commit}`]);
run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/build-inno.ps1'),'-CompilerPath',compiler,'-PackagedDirectory',path.join(output,'win-unpacked'),'-OutputDirectory',output]);
run(process.execPath,[path.join(root,'scripts/package-install-zip.js'),output]);
