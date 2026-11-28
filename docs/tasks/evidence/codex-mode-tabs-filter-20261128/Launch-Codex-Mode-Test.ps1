$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root "Cx-Routing Gateway Portable 1.1.15.exe"
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Portable app is missing: $exe" }

foreach ($name in @("CXRG_MASTER_KEY", "CXRG_CONTROL_TOKEN", "CXRG_DATA_DIR", "CXRG_DEV_SERVER_URL", "ELECTRON_RUN_AS_NODE")) {
  Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
}

function Get-FreeLoopbackPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

$controlPort = Get-FreeLoopbackPort
$gatewayPort = Get-FreeLoopbackPort
while ($gatewayPort -eq $controlPort) { $gatewayPort = Get-FreeLoopbackPort }
$env:CXRG_USER_DATA_DIR = Join-Path $root "isolated-user-data"
$env:CODEX_HOME = Join-Path $root "isolated-codex-home"
$env:CXRG_CONTROL_PORT = [string]$controlPort
$env:CXRG_GATEWAY_PORT = [string]$gatewayPort
New-Item -ItemType Directory -Force -Path $env:CXRG_USER_DATA_DIR, $env:CODEX_HOME | Out-Null
Start-Process -FilePath $exe -WorkingDirectory $root
Write-Host "Codex Mode Test 1.1.15 started with isolated data directories."
Write-Host "Gateway port: $gatewayPort; Local Control port: $controlPort"
Write-Host "Close this test app normally when finished. Existing Gateway data was not copied or changed."
