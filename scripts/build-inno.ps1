param(
    [Parameter(Mandatory=$true)][string]$CompilerPath,
    [Parameter(Mandatory=$true)][string]$PackagedDirectory,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$taskRepository = Split-Path -Parent $PSScriptRoot
$taskPackage = Get-Content -LiteralPath (Join-Path $taskRepository 'package.json') -Raw | ConvertFrom-Json
$taskVersion = [string]$taskPackage.version
if ($taskVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Inno candidate requires a numeric three-part version from package.json.' }
$taskCompiler = (Resolve-Path -LiteralPath $CompilerPath).Path
$taskSource = (Resolve-Path -LiteralPath $PackagedDirectory).Path
if ([IO.Path]::GetFileName($taskCompiler) -ne 'ISCC.exe') { throw 'Use the verified ISCC.exe compiler.' }
$taskExe = Join-Path $taskSource 'Pathology Management System.exe'
if (-not (Test-Path -LiteralPath $taskExe -PathType Leaf)) { throw 'The expected packaged application executable is missing.' }
foreach ($taskRequired in @('LICENSE','Recover Administrator.cmd','RECOVERY.md','resources\app.asar')) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskSource $taskRequired) -PathType Leaf)) { throw "Missing packaged prerequisite: $taskRequired" }
}
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskScript = Join-Path $taskRepository 'build\installer.iss'
$taskIcon = Join-Path $taskRepository 'build\icon.ico'
if (-not (Test-Path -LiteralPath $taskIcon -PathType Leaf)) { throw 'Build the application icon before compiling the installer.' }
& $taskCompiler --no-signing "/DSourceDir=$taskSource" "/DCandidateOutputDir=$taskOutput" "/DAppVersion=$taskVersion" "/DSetupIcon=$taskIcon" $taskScript
if ($LASTEXITCODE -ne 0) { throw "Inno compilation failed with exit code $LASTEXITCODE." }
$taskInstaller = Join-Path $taskOutput "Pathology Management System Offline Setup $taskVersion.exe"
if (-not (Test-Path -LiteralPath $taskInstaller -PathType Leaf)) { throw 'Compiler did not produce the expected installer.' }
$taskHasher = [Security.Cryptography.SHA256]::Create()
$taskStream = [IO.File]::OpenRead($taskInstaller)
try { $taskDigest = [BitConverter]::ToString($taskHasher.ComputeHash($taskStream)).Replace('-','').ToLowerInvariant() } finally { $taskStream.Dispose(); $taskHasher.Dispose() }
[PSCustomObject]@{ Algorithm='SHA256'; Hash=$taskDigest; Path=$taskInstaller }
