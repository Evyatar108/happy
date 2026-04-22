# scripts/fork-setup/setup-services.ps1 -- run in ELEVATED PowerShell
# Sets up happy-server + cloudflared as Windows services on a fresh machine.
# Idempotent: re-running overwrites the service configs cleanly.
#
# Prerequisites:
# - cloudflared installed: winget install Cloudflare.cloudflared
# - nssm installed:        winget install NSSM.NSSM
# - jq installed:          winget install jqlang.jq   (for ralph-orchestration)
# - A named Cloudflare Tunnel already created:
#     cloudflared tunnel login                         (pick your zone)
#     cloudflared tunnel create happy                  (creates credentials JSON)
#     cloudflared tunnel route dns happy happy.evyatar.dev
#   Config at ~/.cloudflared/config.yml pointing at http://localhost:3005.
# - happy-server installed in the primary clone at D:\harness-efforts\happy
#   with .env.dev already set up.
#
# What this script does:
#   1. Check prereqs are present.
#   2. Stop + kill any running cloudflared / happy-server.
#   3. Uninstall any existing HappyServer / cloudflared services.
#   4. Copy ~/.cloudflared/{cert.pem, config.yml, <UUID>.json} into the
#      LocalSystem profile and rewrite config.yml paths.
#   5. Register HappyServer via nssm (wraps pnpm --filter happy-server standalone:dev).
#   6. Register cloudflared via nssm (wraps cloudflared --config <sys> tunnel run).
#   7. Start both, probe the tunnel.

$ErrorActionPreference = "Continue"

$exe        = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$userDir    = Join-Path $env:USERPROFILE ".cloudflared"
$systemDir  = "C:\Windows\System32\config\systemprofile\.cloudflared"
$systemCfg  = Join-Path $systemDir "config.yml"
$logDir     = "D:\harness-efforts\happy\packages\happy-server\logs"
$appDir     = "D:\harness-efforts\happy"

Write-Host "`n=== 1. Prerequisite check ===" -ForegroundColor Cyan
if (-not (Test-Path $exe)) {
    Write-Host "ERROR: cloudflared not at $exe  (run: winget install Cloudflare.cloudflared)" -ForegroundColor Red
    exit 1
}
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: nssm not on PATH  (run: winget install NSSM.NSSM)" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $userDir "cert.pem"))) {
    Write-Host "ERROR: $userDir is missing cert.pem" -ForegroundColor Red
    Write-Host "       Run: & '$exe' tunnel login  (choose your zone)" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $userDir "config.yml"))) {
    Write-Host "ERROR: $userDir is missing config.yml" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $appDir)) {
    Write-Host "ERROR: $appDir does not exist (primary clone of the fork)" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 2. Stop + kill running instances ===" -ForegroundColor Cyan
& sc.exe stop cloudflared 2>&1 | Out-Null
& sc.exe stop HappyServer 2>&1 | Out-Null
Start-Sleep -Seconds 2
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "`n=== 3. Uninstall any existing services ===" -ForegroundColor Cyan
# Native cloudflared install (if this is not the first run)
& $exe service uninstall 2>&1 | Out-Null
Start-Sleep -Seconds 2
# nssm-managed versions
if (Get-Service cloudflared -ErrorAction SilentlyContinue) {
    & nssm remove cloudflared confirm 2>&1 | Out-Null
}
if (Get-Service HappyServer -ErrorAction SilentlyContinue) {
    & nssm remove HappyServer confirm 2>&1 | Out-Null
}
Start-Sleep -Seconds 2

Write-Host "`n=== 4. Copy .cloudflared to system profile + rewrite config.yml ===" -ForegroundColor Cyan
# The service runs as LocalSystem, which reads from the system profile, not
# the user's. Copy and rewrite any user-profile paths in config.yml.
New-Item -ItemType Directory -Path $systemDir -Force | Out-Null
Get-ChildItem $userDir -File | ForEach-Object {
    Copy-Item $_.FullName -Destination (Join-Path $systemDir $_.Name) -Force
    Write-Host ("  copied " + $_.Name)
}
$config = Get-Content $systemCfg -Raw
$config = $config -replace [regex]::Escape($userDir), ($systemDir -replace '\\','\\')
$config = $config -replace '\\\\', '\'   # collapse any double-backslash artifact
$config | Set-Content -Path $systemCfg -Encoding ASCII
Write-Host "System-profile config.yml:"
Get-Content $systemCfg | ForEach-Object { Write-Host ("  " + $_) }

Write-Host "`n=== 5. Register HappyServer (nssm) ===" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
& nssm install HappyServer "C:\Windows\System32\cmd.exe" "/c pnpm --filter happy-server standalone:dev"
& nssm set HappyServer AppDirectory $appDir
& nssm set HappyServer DisplayName "Happy Server (local fork)"
& nssm set HappyServer Description "pnpm --filter happy-server standalone:dev. Fronted by cloudflared at happy.evyatar.dev."
& nssm set HappyServer Start SERVICE_AUTO_START
& nssm set HappyServer AppStdout "$logDir\service-stdout.log"
& nssm set HappyServer AppStderr "$logDir\service-stderr.log"
& nssm set HappyServer AppRotateFiles 1
& nssm set HappyServer AppRotateBytes 10485760

Write-Host "`n=== 6. Register cloudflared (nssm) ===" -ForegroundColor Cyan
# nssm sidesteps two Windows-specific landmines of the native cloudflared
# service installer:
#   (a) 'cloudflared service install' on Windows registers binPath WITHOUT
#       'tunnel run' for locally-created named tunnels, so the service
#       starts, prints help, and exits.
#   (b) PowerShell 5.1 mangles 'sc.exe config binPath=' quoted strings,
#       so post-hoc fixes of the native binPath don't stick.
& nssm install cloudflared $exe "--config" $systemCfg "tunnel" "run"
& nssm set cloudflared AppDirectory "C:\Program Files (x86)\cloudflared"
& nssm set cloudflared DisplayName "Cloudflare Tunnel (named: happy)"
& nssm set cloudflared Description "cloudflared tunnel run with config $systemCfg. Serves happy.evyatar.dev."
& nssm set cloudflared Start SERVICE_AUTO_START
& nssm set cloudflared AppStdout "$logDir\cloudflared-stdout.log"
& nssm set cloudflared AppStderr "$logDir\cloudflared-stderr.log"
& nssm set cloudflared AppRotateFiles 1
& nssm set cloudflared AppRotateBytes 10485760

Write-Host "`n=== 7. Verify binPath + start ===" -ForegroundColor Cyan
Write-Host "HappyServer: " -NoNewline
(Get-WmiObject Win32_Service -Filter "Name='HappyServer'").PathName
Write-Host "cloudflared: " -NoNewline
(Get-WmiObject Win32_Service -Filter "Name='cloudflared'").PathName

Start-Service HappyServer
Start-Service cloudflared
Start-Sleep -Seconds 12

Get-Service HappyServer, cloudflared | Format-Table Name, Status, StartType -AutoSize

Write-Host "`n=== 8. Probe ===" -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri "https://happy.evyatar.dev" -TimeoutSec 20 -UseBasicParsing
    Write-Host ("  OK -- HTTP " + $resp.StatusCode + ", " + $resp.RawContentLength + " bytes") -ForegroundColor Green
} catch {
    Write-Host ("  FAILED: " + $_) -ForegroundColor Yellow
    Write-Host "  Check: Get-Content '$logDir\cloudflared-stderr.log' -Tail 40" -ForegroundColor Yellow
}

Write-Host "`nDone. Both services auto-start on boot." -ForegroundColor Green
Write-Host "Ops skill: .agents/skills/happy-service-manage/SKILL.md" -ForegroundColor DarkGray
