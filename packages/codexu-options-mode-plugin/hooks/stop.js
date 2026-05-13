#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const {
  appendLog,
  getConfigRoot,
  isOptionsActive,
  getOptionsMode,
  FUNCTION_CALL_NAMES,
  OPTIONS_NO_QUESTION_TAG,
  OPTIONS_BACKGROUND_TASK_TAG,
  OPTIONS_BACKGROUND_AGENT_TAG,
  OPTIONS_TASK_COMPLETE_TAG
} = require('./config');

const BLOCK_REASON = `Add ${OPTIONS_NO_QUESTION_TAG} tag if this turn is not asking the user, or use AskUserQuestion with concrete choices.`;
const BLOCK_REASON_STRICT = `Strict options mode: use AskUserQuestion with concrete choices, or append ${OPTIONS_BACKGROUND_TASK_TAG} or ${OPTIONS_BACKGROUND_AGENT_TAG} when polling.`;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (e) {
    return '';
  }
}

function parseInput(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function hasTrailingFunctionCall(transcriptPath) {
  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch (e) {
    return false;
  }

  const envelopes = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      envelopes.push(JSON.parse(line));
    } catch (e) {}
  }

  for (let i = envelopes.length - 1; i >= 0; i -= 1) {
    const payload = envelopes[i] && envelopes[i].payload;
    if (!payload || typeof payload !== 'object') continue;
    if (payload.type === 'message') return false;
    if (payload.type === 'function_call' && FUNCTION_CALL_NAMES.includes(payload.name)) return true;
  }

  return false;
}

function assistantKey(text) {
  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
  return `${hash}:${text.length}`;
}

function counterPath(transcriptPath, key) {
  const id = crypto.createHash('sha256').update(`${transcriptPath}\n${key}`).digest('hex').slice(0, 32);
  return path.join(getConfigRoot(), `.options-stop-counter-${id}`);
}

function incrementLoopCounter(transcriptPath, key) {
  const file = counterPath(transcriptPath, key);
  let count = 0;
  try { count = Number(fs.readFileSync(file, 'utf8')) || 0; } catch (e) {}
  count += 1;
  try { fs.writeFileSync(file, String(count)); } catch (e) {}
  return count;
}

function sanitizeReason(reason) {
  const DEFAULT = BLOCK_REASON;
  const cleaned = String(reason || '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return DEFAULT;
  return cleaned.slice(0, 200);
}

async function main() {
  const input = parseInput(readStdin());

  if (input.stop_hook_active === true) return;
  if (input.agent_id || input.agent_type) return;

  try {
    if (!isOptionsActive(input.session_id)) return;
  } catch (e) {
    if (e && e.code === 'ERR_OPTIONS_PLUGIN_DATA_REQUIRED') {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: 'options-mode misconfigured: PLUGIN_DATA env var is not set; codex normally sets this. Set PLUGIN_DATA before continuing.'
      }));
      return;
    }
  }

  const transcriptPath = typeof input.transcript_path === 'string' ? input.transcript_path : null;

  const lastAssistantMessage = typeof input.last_assistant_message === 'string'
    ? input.last_assistant_message
    : '';

  if (!lastAssistantMessage || !lastAssistantMessage.trim()) {
    if (hasTrailingFunctionCall(transcriptPath)) return;
  }

  let mode = 'on';
  try { mode = getOptionsMode(input.session_id); } catch (e) {}
  const reason = mode === 'strict' ? BLOCK_REASON_STRICT
    : mode === 'auto' ? `Auto options mode: use AskUserQuestion if a human is present, or append ${OPTIONS_TASK_COMPLETE_TAG} when done, or use a background tag when polling.`
    : BLOCK_REASON;

  if (lastAssistantMessage.includes(OPTIONS_BACKGROUND_TASK_TAG)) return;
  if (lastAssistantMessage.includes(OPTIONS_BACKGROUND_AGENT_TAG)) return;
  if (mode === 'auto' && lastAssistantMessage.includes(OPTIONS_TASK_COMPLETE_TAG)) return;
  if (mode !== 'strict' && mode !== 'auto' && lastAssistantMessage.includes(OPTIONS_NO_QUESTION_TAG)) return;

  const key = assistantKey(lastAssistantMessage);
  const count = incrementLoopCounter(transcriptPath, key);
  if (count > 5) {
    appendLog(`WARN options Stop hook gave up after ${count} blocks for ${transcriptPath} ${key}`);
    try { fs.unlinkSync(counterPath(transcriptPath, key)); } catch (e) {}
    return;
  }

  appendLog(`INFO options Stop hook blocked missing continue tag: ${reason}`);
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: sanitizeReason(reason)
  }));
}

if (require.main === module) {
  main().catch(err => {
    if (err && err.code === 'ERR_OPTIONS_PLUGIN_DATA_REQUIRED') {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: 'options-mode misconfigured: PLUGIN_DATA env var is not set; codex normally sets this. Set PLUGIN_DATA before continuing.'
      }));
      return;
    }
    appendLog(`WARN options Stop hook failed open: ${err && err.message ? err.message : err}`);
  });
}

module.exports = {
  BLOCK_REASON,
  BLOCK_REASON_STRICT,
  hasTrailingFunctionCall,
  assistantKey,
  counterPath,
  incrementLoopCounter,
  sanitizeReason
};
