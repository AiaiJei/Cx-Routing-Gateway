param(
  [string]$OutputDirectory = "apps/desktop/release/1.1.0-final-reviewed"
)

$ErrorActionPreference = "Stop"
$package = Get-Content -Raw "apps/desktop/package.json" | ConvertFrom-Json
$version = $package.version
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$desktopProjectPath = (Resolve-Path -LiteralPath "apps/desktop").Path
$unpackedPath = Join-Path $outputPath "win-unpacked"
$unpackedExe = Join-Path $unpackedPath "Cx-Routing Gateway.exe"
$portableName = "Cx-Routing Gateway Portable $version.exe"
$portablePath = Join-Path $outputPath $portableName

if (Test-Path -LiteralPath $portablePath) { throw "Portable executable already exists; preserving it: $portablePath" }
foreach ($file in @(
  $unpackedExe,
  (Join-Path $unpackedPath "resources/app.asar"),
  (Join-Path $unpackedPath "resources/runtime/services/local-control/src/server.mjs"),
  (Join-Path $unpackedPath "resources/runtime/services/gateway/src/server.mjs"),
  (Join-Path $unpackedPath "resources/runtime/packages/shared/src/config-store.mjs"),
  (Join-Path $unpackedPath "resources/runtime/scripts/check-update.mjs")
)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -eq 0) {
    throw "Missing or empty portable runtime file: $file"
  }
}

function Get-PeMachine([string]$FilePath) {
  $stream = [System.IO.File]::OpenRead($FilePath)
  try {
    $reader = [System.IO.BinaryReader]::new($stream)
    $stream.Position = 0x3c
    $peOffset = $reader.ReadInt32()
    $stream.Position = $peOffset
    if ($reader.ReadUInt32() -ne 0x00004550) { throw "Invalid Windows PE executable: $FilePath" }
    return [int]$reader.ReadUInt16()
  } finally {
    $stream.Dispose()
  }
}

if ((Get-PeMachine $unpackedExe) -ne 0x8664) { throw "Unpacked application must be Windows x64 (AMD64): $unpackedExe" }
$relativeOutput = [System.IO.Path]::GetRelativePath($desktopProjectPath, $outputPath)
if ($relativeOutput.StartsWith("..")) { throw "Output directory must stay under apps/desktop: $outputPath" }
Push-Location $desktopProjectPath
try {
  & npx electron-builder --win portable --x64 "--config.directories.output=$relativeOutput"
  if ($LASTEXITCODE -ne 0) { throw "electron-builder portable target failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $portablePath -PathType Leaf) -or (Get-Item -LiteralPath $portablePath).Length -eq 0) {
  throw "Portable executable was not created: $portablePath"
}
$launcherMachine = Get-PeMachine $portablePath
if ($launcherMachine -notin @(0x014c, 0x8664)) { throw "Portable launcher has an unsupported Windows architecture: $portablePath" }
Get-FileHash -LiteralPath $portablePath -Algorithm SHA256 | Select-Object Algorithm, Hash, Path
