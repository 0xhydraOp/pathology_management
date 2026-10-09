const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../build/installer.iss'),'utf8'),builder=fs.readFileSync(path.join(__dirname,'build-inno.ps1'),'utf8');
test('Inno is a local non-elevated x64 installer preserving identity and avoiding autorun/data deletion',()=>{
 for(const setting of ['AppId=com.mondal.diagnostic','PrivilegesRequired=lowest','ArchitecturesAllowed=x64compatible','ArchitecturesInstallIn64BitMode=x64compatible','MinVersion=10.0','CloseApplications=no','RestartApplications=no','DefaultDirName={localappdata}\\Programs\\{#AppName}'])assert.ok(source.includes(setting),setting);
 assert.ok(!/^\[(Run|UninstallRun|UninstallDelete)\]/mi.test(source));
 assert.ok(!/DelTree|DeleteFile|TaskKill|TerminateProcess|Exec\(/i.test(source));
 assert.ok(!source.includes('{userappdata}'));assert.ok(!source.includes('lab.db'));
});
test('Legacy NSIS installations and open app/recovery processes fail closed',()=>{
 assert.ok(source.includes('a2ad19b7-4173-58fc-a15b-17fed176f679'));
 for(const hive of ['HKLM64','HKLM32','HKCU64','HKCU32'])assert.ok(source.includes(`LegacyKeyPresent(${hive})`));
 assert.ok(source.includes("LegacyUninstallBase + '{' + LegacyNSISId + '}'"));
 assert.ok(source.includes("Result := True;"));assert.ok(source.includes('Patholy Management System.exe'));assert.ok(source.includes('Pathology Management System.exe'));
 assert.ok(source.includes('function PrepareToInstall'));assert.ok(source.includes('function InitializeUninstall'));assert.ok(source.includes('No uninstaller has been run automatically'));
});
test('Compiler build inputs are explicit and current package version is authoritative',()=>{
 assert.equal((builder.match(/\[Parameter\(Mandatory=\$true\)\]/g)||[]).length,3);
 assert.ok(builder.includes("'package.json'"));assert.ok(builder.includes('ISCC.exe'));assert.ok(builder.includes('Get-FileHash -Algorithm SHA256'));
 assert.ok(!/SignTool|CertificatePassword|private.key|password/i.test(builder));
});
