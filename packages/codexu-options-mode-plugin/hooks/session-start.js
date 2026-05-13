#!/usr/bin/env node

const {
  OPTIONS_RULES_TEXT,
  OPTIONS_RULES_TEXT_STRICT,
  OPTIONS_RULES_TEXT_AUTO,
  getOptionsMode
} = require('./config');

function readStdin(callback) {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => callback(input));
}

function parseInput(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}

readStdin(raw => {
  const input = parseInput(raw);
  if (input.agent_id || input.agent_type) return;

  const sessionId = input.session_id;
  const mode = getOptionsMode(sessionId);
  let rulesBlock = '';
  if (mode === 'strict') rulesBlock = OPTIONS_RULES_TEXT_STRICT;
  else if (mode === 'auto') rulesBlock = OPTIONS_RULES_TEXT_AUTO;
  else if (mode === 'on') rulesBlock = OPTIONS_RULES_TEXT;

  if (!rulesBlock) return;
  process.stdout.write(`options-mode: ${mode}\n${rulesBlock}`);
});
