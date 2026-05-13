#!/bin/bash
# options-mode statusline badge for Claude Code.
# Mirrors hooks/config.js::getOptionsMode() — per-session flag wins; on missing
# flag, defer to global default (env -> file -> off). Renders [OPTIONS MODE] for
# on, [OPTIONS MODE: strict] for strict (v0.15.0+), silent otherwise.

set -u

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

read_flag_file() {
  # Refuse symlinks and oversized files; normalize and validate the value.
  local path="$1"
  [ -L "$path" ] && return 1
  [ ! -f "$path" ] && return 1
  local mode
  mode=$(head -c 64 "$path" 2>/dev/null | tr -d '\n\r' | tr '[:upper:]' '[:lower:]')
  mode=$(printf '%s' "$mode" | tr -cd 'a-z0-9-')
  case "$mode" in
    on|off|strict|auto) printf '%s' "$mode"; return 0 ;;
    *) return 1 ;;
  esac
}

sha256_hex() {
  # Portable sha256: sha256sum (Git Bash/Linux) or shasum -a 256 (macOS).
  local input="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$input" | sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' "$input" | shasum -a 256 | awk '{print $1}'
  else
    return 1
  fi
}

extract_session_id() {
  # Pull session_id from stdin JSON without requiring jq. Fall back to a
  # forgiving regex that handles the {"session_id":"..."} shape Claude Code
  # emits to statuslines. Fail-silent on bad input.
  local raw="$1"
  [ -z "$raw" ] && return 1
  if command -v jq >/dev/null 2>&1; then
    local sid
    sid=$(printf '%s' "$raw" | jq -r '.session_id // empty' 2>/dev/null)
    if [ -n "$sid" ] && [ "$sid" != "null" ]; then
      printf '%s' "$sid"
      return 0
    fi
    return 1
  fi
  local match
  match=$(printf '%s' "$raw" | grep -Eo '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1)
  [ -z "$match" ] && return 1
  # Strip the prefix (key + colon + whitespace + opening quote) and the trailing quote.
  match=${match#*\"session_id\"}
  match=${match#*:}
  match=${match#*\"}
  match=${match%\"}
  [ -z "$match" ] && return 1
  printf '%s' "$match"
}

get_default_mode() {
  # env -> file -> none. Returns "on", "off", "strict", or empty.
  local env_mode
  env_mode=$(printf '%s' "${OPTIONS_DEFAULT_MODE:-}" | tr '[:upper:]' '[:lower:]')
  case "$env_mode" in
    on|off|strict|auto) printf '%s' "$env_mode"; return 0 ;;
  esac
  local cfg="$CLAUDE_DIR/options.json"
  [ -L "$cfg" ] && return 1
  [ ! -f "$cfg" ] && return 1
  local raw
  raw=$(head -c 4096 "$cfg" 2>/dev/null) || return 1
  local match
  match=$(printf '%s' "$raw" | grep -Eo '"defaultMode"[[:space:]]*:[[:space:]]*"(on|off|strict|auto)"' | head -n 1)
  [ -z "$match" ] && return 1
  case "$match" in
    *'"on"') printf 'on'; return 0 ;;
    *'"off"') printf 'off'; return 0 ;;
    *'"strict"') printf 'strict'; return 0 ;;
    *'"auto"') printf 'auto'; return 0 ;;
  esac
  return 1
}

STDIN_RAW=""
if [ ! -t 0 ]; then
  STDIN_RAW=$(cat 2>/dev/null || true)
fi
SESSION_ID=$(extract_session_id "$STDIN_RAW" || true)

MODE=""
if [ -n "$SESSION_ID" ]; then
  HEX=$(sha256_hex "$SESSION_ID" || true)
  if [ -n "$HEX" ]; then
    SUFFIX=${HEX:0:32}
    SESSION_FLAG="$CLAUDE_DIR/options-mode/sessions-configs/$SUFFIX"
    MODE=$(read_flag_file "$SESSION_FLAG" || true)
  fi
else
  # Legacy fallback: only consult the machine-wide flag when stdin lacks a
  # session_id (older Claude Code builds, harness scripts).
  LEGACY_FLAG="$CLAUDE_DIR/.options-active"
  MODE=$(read_flag_file "$LEGACY_FLAG" || true)
fi

if [ -z "$MODE" ]; then
  MODE=$(get_default_mode || true)
fi

[ -z "$MODE" ] && exit 0

case "$MODE" in
  on) printf '\033[38;5;172m[OPTIONS MODE]\033[0m' ;;
  strict) printf '\033[38;5;172m[OPTIONS MODE: strict]\033[0m' ;;
  auto) printf '\033[38;5;172m[OPTIONS MODE: auto]\033[0m' ;;
  *) exit 0 ;;
esac
