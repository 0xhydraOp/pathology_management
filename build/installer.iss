; Offline Windows candidate. No data-directory manipulation or automatic app launch.
#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef CandidateOutputDir
  #error CandidateOutputDir is required
#endif
#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef SetupIcon
  #error SetupIcon is required
#endif
#define AppName "Pathology Management System"
#define AppExe "Pathology Management System.exe"

[Setup]
AppId=com.mondal.diagnostic
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Robiul Islam Molla
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#CandidateOutputDir}
OutputBaseFilename={#AppName} Offline Setup {#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile={#SetupIcon}
UninstallDisplayIcon={app}\{#AppExe}
CloseApplications=no
RestartApplications=no
LicenseFile={#SourceDir}\LICENSE
VersionInfoVersion={#AppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\Recover Administrator"; Filename: "{app}\Recover Administrator.cmd"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Code]
const
  LegacyUninstallBase = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\';
  LegacyNSISId = 'a2ad19b7-4173-58fc-a15b-17fed176f679';

function LegacyKeyPresent(Root: Integer): Boolean;
begin
  Result := RegKeyExists(Root, LegacyUninstallBase + LegacyNSISId) or
    RegKeyExists(Root, LegacyUninstallBase + '{' + LegacyNSISId + '}');
end;

function LegacyInstallerPresent(): Boolean;
begin
  Result := LegacyKeyPresent(HKLM64) or LegacyKeyPresent(HKLM32) or
    LegacyKeyPresent(HKCU64) or LegacyKeyPresent(HKCU32);
end;

function AppProcessPresent(): Boolean;
var
  Locator, Services, Processes: Variant;
begin
  { Read-only process inventory. A failed inventory does not imply a safe update. }
  Result := True;
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Services := Locator.ConnectServer('', 'root\CIMV2');
    Processes := Services.ExecQuery('SELECT ProcessId FROM Win32_Process WHERE Name = ''Patholy Management System.exe'' OR Name = ''Pathology Management System.exe''');
    Result := Processes.Count > 0;
  except
    Log('Could not verify that application processes are closed.');
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if LegacyInstallerPresent() then
    Result := 'A previous NSIS installation was found. Back up your lab data, close the application and manually uninstall the previous application without deleting lab data. Then run this installer again. No uninstaller has been run automatically.'
  else if AppProcessPresent() then
    Result := 'Close every Patholy/Pathology application and recovery window before continuing. If process checking is unavailable, resolve that Windows issue first. The installer will not force-close any process.';
end;

function InitializeUninstall(): Boolean;
begin
  Result := not AppProcessPresent();
  if not Result then
    MsgBox('Close the application and recovery windows before uninstalling. Lab data and backups are not deleted by this uninstaller.', mbError, MB_OK);
end;
