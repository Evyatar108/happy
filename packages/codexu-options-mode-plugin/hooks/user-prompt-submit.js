#!/usr/bin/env node

const {
  OPTIONS_RULES_TEXT,
  OPTIONS_RULES_TEXT_STRICT,
  OPTIONS_RULES_TEXT_AUTO,
  VALID_MODES,
  getFlagPath,
  getOptionsMode,
  safeWriteFlag,
  readFlag,
  getDefaultModeRaw,
  setDefaultMode,
  clearDefaultMode
} = require('./config');

function readStdin(callback) {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => callback(input));
}

function parseInput(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

readStdin(raw => {
  const data = parseInput(raw);
  const prompt = String(data.prompt || '').trim();
  const lower = prompt.toLowerCase();
  const sessionId = data.session_id;

  if (lower === '/options-mode' || lower.startsWith('/options-mode ')) {
    const tokens = lower.split(/\s+/);
    const arg = tokens[1] || 'status';
    if (VALID_MODES.includes(arg)) {
      safeWriteFlag(getFlagPath(sessionId), arg);
      block(`options mode: ${arg}`);
      return;
    }
    if (arg === 'status') {
      const effective = getOptionsMode(sessionId);
      const sessionRaw = readFlag(getFlagPath(sessionId));
      const session = sessionRaw === null ? 'unset' : sessionRaw;
      const defaultRaw = getDefaultModeRaw();
      const defaultLabel = defaultRaw === null ? 'unset' : defaultRaw;
      block(`options mode: ${effective} (session=${session}, default=${defaultLabel})`);
      return;
    }
    if (arg === 'default') {
      const sub = tokens[2] || 'status';
      if (VALID_MODES.includes(sub)) {
        setDefaultMode(sub);
        block(`options mode default: ${sub}`);
        return;
      }
      if (sub === 'clear') {
        clearDefaultMode();
        block('options mode default: cleared');
        return;
      }
      if (sub === 'status') {
        const defaultRaw = getDefaultModeRaw();
        block(`options mode default: ${defaultRaw === null ? 'unset' : defaultRaw}`);
        return;
      }
      block('options mode: usage /options-mode on|off|strict|auto|status|default [on|off|strict|auto|clear|status]');
      return;
    }
    block('options mode: usage /options-mode on|off|strict|auto|status|default [on|off|strict|auto|clear|status]');
    return;
  }

  const mode = getOptionsMode(sessionId);
  if (mode === 'on' || mode === 'strict' || mode === 'auto') {
    const rules = mode === 'strict' ? OPTIONS_RULES_TEXT_STRICT
      : mode === 'auto' ? OPTIONS_RULES_TEXT_AUTO
      : OPTIONS_RULES_TEXT;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: rules
      }
    }));
  }
});
