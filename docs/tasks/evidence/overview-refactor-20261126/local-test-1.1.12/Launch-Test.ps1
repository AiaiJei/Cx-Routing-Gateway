param(
  [switch]$NoDialogs,
  [ValidateRange(0, 65535)][int]$DebugPort = 0
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
  $executable = Join-Path $PSScriptRoot 'Cx-Routing Gateway Portable 1.1.12.exe'
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw '找不到 1.1.12 测试版程序。请保留测试文件夹内的文件。' }
  $profileRoot = Join-Path $PSScriptRoot 'Profile'
  $runtimeRoot = Join-Path $profileRoot 'runtime'
  $codexProfile = Join-Path $profileRoot 'Codex'
  [IO.Directory]::CreateDirectory($runtimeRoot) | Out-Null
  [IO.Directory]::CreateDirectory($codexProfile) | Out-Null
  $configPath = Join-Path $runtimeRoot 'config.json'
  if (-not (Test-Path -LiteralPath $configPath)) {
    $config = [ordered]@{version=1; upstreams=@(); routes=@(); clientKeys=@(); usage=@(); settings=[ordered]@{gatewayHost='127.0.0.1'; gatewayPort=18418; usageRetentionCount=1000}}
    $stream = [IO.File]::Open($configPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
      $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($config | ConvertTo-Json -Depth 5))
      $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
  }
  $savedConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($savedConfig.settings.gatewayPort -ne 18418) { throw '测试版配置端口与独立启动端口不一致，已停止启动以保护现有配置。' }
  $env:CXRG_GATEWAY_PORT = '18418'
  $env:CXRG_CONTROL_PORT = '18419'
  $env:CXRG_USER_DATA_DIR = $profileRoot
  $env:CODEX_HOME = $codexProfile
  $env:CXRG_MASTER_KEY = $null
  $env:CXRG_CONTROL_TOKEN = $null
  $env:CXRG_DEV_SERVER_URL = $null
  $env:ELECTRON_RUN_AS_NODE = $null
  $arguments = '--user-data-dir="' + $profileRoot + '"'
  if ($DebugPort -gt 0) { $arguments += ' --remote-debugging-address=127.0.0.1 --remote-debugging-port=' + $DebugPort }
  $started = Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
  [pscustomobject]@{processId=$started.Id; executable=$executable; profile=$profileRoot; gatewayPort=18418; controlPort=18419; debugPort=$DebugPort} | ConvertTo-Json -Compress
} catch {
  if ($NoDialogs) { [Console]::Error.WriteLine($_.Exception.Message) }
  else {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, '1.1.12 测试版启动失败') | Out-Null
  }
  exit 1
}
