# Thin PowerShell wrapper around verify-refresh-supported.mjs.
#
# Usage from repo root (C:\harness-efforts\codexu):
#
#   # Full Phase 0 + 1 + 2 gate (takes ~16 min total because of Phase 2's
#   # post-expires_in sleep):
#   .\packages\happy-app\scripts\verify-refresh-supported.ps1 `
#       -TunnelUrl "https://abc1234.devtunnels.ms"
#
#   # Skip Phase 2's long wait (still verifies R-D18 + R-D17 immediate reuse;
#   # leaves R-D17 post-expires_in durability UNVERIFIED — only do this for a
#   # smoke run, not for the real AC-D16 gate):
#   .\packages\happy-app\scripts\verify-refresh-supported.ps1 `
#       -TunnelUrl "https://abc1234.devtunnels.ms" -SkipPhase2
#
# Prerequisite (NOT done by this script):
#   1. Start happy-server in another terminal:
#        cd <HAPPY_SERVER_WORKTREE>; pnpm standalone:dev
#   2. Expose port 3005 over a public Dev Tunnels tunnel.
#   3. Pass that public URL as -TunnelUrl.

param(
    [Parameter(Mandatory = $true)]
    [string]$TunnelUrl,

    [string]$Worktree = "",

    [switch]$SkipPhase2
)

$ErrorActionPreference = "Stop"

# Resolve repo root: this script lives at packages/happy-app/scripts/, three dirs up.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$scriptPath = Join-Path $repoRoot "packages\happy-app\scripts\verify-refresh-supported.mjs"

if (-not (Test-Path $scriptPath)) {
    Write-Error "verify-refresh-supported.mjs not found at $scriptPath"
    exit 2
}

$env:DEV_TUNNELS_URL = $TunnelUrl
if ($Worktree) {
    $env:HAPPY_SERVER_WORKTREE = $Worktree
}
if ($SkipPhase2) {
    # Force Phase 2's "elapsed >= expires_in + 60" check to be trivially
    # satisfied immediately after Phase 1, so the script skips its long sleep.
    # Phase 2 still calls /pair/status once; if the daemon caches the access
    # token, that call returns authorized. If you really want to skip Phase 2
    # entirely, this is the closest non-destructive escape hatch.
    $env:PHASE_2_MIN_TOTAL_SECONDS = "0"
}

Write-Host ""
Write-Host "Running verify-refresh-supported.mjs"
Write-Host "  DEV_TUNNELS_URL    = $($env:DEV_TUNNELS_URL)"
if ($env:HAPPY_SERVER_WORKTREE) {
    Write-Host "  HAPPY_SERVER_WORKTREE = $($env:HAPPY_SERVER_WORKTREE)"
}
if ($SkipPhase2) {
    Write-Host "  SkipPhase2         = true  (PHASE_2_MIN_TOTAL_SECONDS=0)"
}
Write-Host ""

Push-Location $repoRoot
try {
    & node $scriptPath
    $code = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($code -eq 0) {
    Write-Host ""
    Write-Host "Gate PASSED. Reply to Claude: 'Gates passed, launch Ralph'"
}
else {
    Write-Host ""
    Write-Host "Gate FAILED (exit $code). See output above and packages/happy-app/scripts/sprint-a-gap.md for the verdict log."
}
exit $code
