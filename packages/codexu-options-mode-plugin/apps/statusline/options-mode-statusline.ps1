#!/usr/bin/env pwsh
# options-mode statusline badge for Claude Code.
# Mirrors hooks/config.js::getOptionsMode() — per-session flag wins; on missing
# flag, defer to global default (env -> file -> off). Renders [OPTIONS MODE] for
# on, [OPTIONS MODE: strict] for strict (v0.15.0+), silent otherwise.

$ErrorActionPreference = 'SilentlyContinue'

$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }

# Read stdin JSON ({ session_id, model, workspace, transcript_path, ... }) and
# extract session_id without invoking jq/Newtonsoft. Fail-silent on bad JSON.
$SessionId = $null
try {
    $StdinRaw = [Console]::In.ReadToEnd()
    if ($StdinRaw -and $StdinRaw.Trim().Length -gt 0) {
        $Parsed = $StdinRaw | ConvertFrom-Json -ErrorAction Stop
        if ($Parsed -and $Parsed.session_id) {
            $Candidate = [string]$Parsed.session_id
            if ($Candidate.Length -gt 0) { $SessionId = $Candidate }
        }
    }
} catch {
    $SessionId = $null
}

function Read-FlagFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try {
        $Item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
        if ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { return $null }
        if ($Item.Length -gt 64) { return $null }
        $Raw = Get-Content -LiteralPath $Path -TotalCount 1 -ErrorAction Stop
        if ($null -eq $Raw) { return $null }
        $Mode = ([string]$Raw).Trim().ToLowerInvariant()
        $Mode = ($Mode -replace '[^a-z0-9-]', '')
        if ($Mode -ne 'on' -and $Mode -ne 'off' -and $Mode -ne 'strict' -and $Mode -ne 'auto') { return $null }
        return $Mode
    } catch {
        return $null
    }
}

function Get-DefaultMode {
    param([string]$ConfigDir)
    $EnvMode = $env:OPTIONS_DEFAULT_MODE
    if ($EnvMode) {
        $EnvLower = $EnvMode.ToLowerInvariant()
        if ($EnvLower -eq 'on' -or $EnvLower -eq 'off' -or $EnvLower -eq 'strict' -or $EnvLower -eq 'auto') { return $EnvLower }
    }
    $ConfigPath = Join-Path $ConfigDir 'options.json'
    if (-not (Test-Path -LiteralPath $ConfigPath)) { return $null }
    try {
        $Item = Get-Item -LiteralPath $ConfigPath -Force -ErrorAction Stop
        if ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { return $null }
        $Json = Get-Content -LiteralPath $ConfigPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        if ($Json -and $Json.defaultMode) {
            $DefaultLower = ([string]$Json.defaultMode).ToLowerInvariant()
            if ($DefaultLower -eq 'on' -or $DefaultLower -eq 'off' -or $DefaultLower -eq 'strict' -or $DefaultLower -eq 'auto') { return $DefaultLower }
        }
    } catch {
        return $null
    }
    return $null
}

# Per-session flag wins. Legacy single-file path is fallback only when no
# session_id arrived on stdin (older Claude Code builds, harness scripts).
$Mode = $null
if ($SessionId) {
    $Hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        $Bytes = [System.Text.Encoding]::UTF8.GetBytes($SessionId)
        $HashBytes = $Hasher.ComputeHash($Bytes)
        $Hex = [System.BitConverter]::ToString($HashBytes).Replace('-', '').ToLowerInvariant()
        $Suffix = $Hex.Substring(0, 32)
    } finally {
        $Hasher.Dispose()
    }
    $SessionFlag = Join-Path $ClaudeDir "options-mode\sessions-configs\$Suffix"
    $Mode = Read-FlagFile -Path $SessionFlag
} else {
    $LegacyFlag = Join-Path $ClaudeDir '.options-active'
    $Mode = Read-FlagFile -Path $LegacyFlag
}

if ($null -eq $Mode) {
    $Default = Get-DefaultMode -ConfigDir $ClaudeDir
    if ($null -eq $Default) { exit 0 }
    $Mode = $Default
}

$Esc = [char]27
if ($Mode -eq 'on') {
    [Console]::Write("${Esc}[38;5;172m[OPTIONS MODE]${Esc}[0m")
} elseif ($Mode -eq 'strict') {
    [Console]::Write("${Esc}[38;5;172m[OPTIONS MODE: strict]${Esc}[0m")
} elseif ($Mode -eq 'auto') {
    [Console]::Write("${Esc}[38;5;172m[OPTIONS MODE: auto]${Esc}[0m")
}
