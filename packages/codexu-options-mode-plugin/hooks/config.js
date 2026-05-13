#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const VALID_MODES = ['on', 'off', 'strict', 'auto'];
const MAX_FLAG_BYTES = 64;
const LEGACY_FLAG_NAME = '.options-active';
const SESSION_FLAGS_SUBDIR = path.join('options-mode', 'sessions-configs');
const MAX_LOG_BYTES = 64 * 1024;
const OPTIONS_NO_QUESTION_TAG = '<options-mode>no-question</options-mode>';
const OPTIONS_BACKGROUND_TASK_TAG = '<options-mode>background-task</options-mode>';
const OPTIONS_BACKGROUND_AGENT_TAG = '<options-mode>background-agent</options-mode>';
const OPTIONS_TASK_COMPLETE_TAG = '<options-mode>task-complete</options-mode>';
const FUNCTION_CALL_NAMES = ['request_user_input', 'ask_user_question'];

const OPTIONS_RULES_TEXT = [
  'OPTIONS MODE ACTIVE.',
  '',
  'When you need the user to make a decision or answer a question, end your turn with an AskUserQuestion choice prompt instead of plain prose. Never leave the user with no choices to pick from when you are asking for input.',
  'Offer 2-4 concrete choices the user can reasonably pick from. Use short, mutually exclusive labels. Keep explanations factual and specific.',
  'Always put the recommended or default option first (as Option 1). Label it "Recommended" to make the best choice obvious.',
  'Use free-form Other only when the available choices may not cover the user intent; do not rely on it as a default fallback.',
  `When you are not asking the user for input and are returning plain prose, append ${OPTIONS_NO_QUESTION_TAG} as the final line of your response. This tag asserts the turn is not a question and should not be converted into an AskUserQuestion prompt.`,
  `Do NOT append ${OPTIONS_NO_QUESTION_TAG} when your turn ends with a question to the user (last sentence ending with "?", or imperative asks like "Want me to...", "Should I...", "Let me know..."). Use AskUserQuestion with concrete choices instead.`,
  'If options mode is off, do not enforce AskUserQuestion choice prompts.',
  '',
  `Canonical anchors: OPTIONS MODE ACTIVE; AskUserQuestion choice prompt; Recommended; mutually exclusive labels; ${OPTIONS_NO_QUESTION_TAG}.`
].join('\n');

const OPTIONS_RULES_TEXT_STRICT = [
  'OPTIONS MODE ACTIVE (strict).',
  '',
  'Every turn MUST end with one of three states: an AskUserQuestion tool call, the background-task tag, or the background-agent tag. Plain prose without one of those three is forbidden in strict mode and will be blocked.',
  'When you need the user to make a decision or answer a question, end your turn with an AskUserQuestion choice prompt instead of plain prose. Never leave the user with no choices to pick from when you are asking for input.',
  'ALWAYS provide 2-4 concrete choices. Use short, mutually exclusive labels. Keep explanations factual and specific.',
  'Always put the recommended or default option first (as Option 1). Label it "Recommended" to make the best choice obvious.',
  'Even for an opening turn with no prior context (e.g., "what task would you like me to help with?"), provide 2-4 broad category labels (for example: Bug fix, New feature, Refactor, Explain code, Other). DO NOT emit a tool call that leaves only a free-form text input — strict mode rejects the spirit of that even when the hook does not.',
  'Free-form Other is allowed as ONE of the 2-4 labels (last position) for unforeseen intents. Do not make it the only option.',
  `When you are polling a background task (build, test run, long-running command) and waiting for it to finish, append ${OPTIONS_BACKGROUND_TASK_TAG} as the final line of your response. This tag asserts the turn is a status update on a background task, not a question.`,
  `When you are polling a background agent (subagent, peer agent, orchestrator) and waiting for it to report back, append ${OPTIONS_BACKGROUND_AGENT_TAG} as the final line of your response. This tag asserts the turn is a status update on a background agent, not a question.`,
  `The non-strict ${OPTIONS_NO_QUESTION_TAG} tag is NOT a valid bypass in strict mode. There is no plain-prose escape hatch: every turn must be either an AskUserQuestion call (with concrete choices) or one of the two background tags above.`,
  'If options mode is off, do not enforce AskUserQuestion choice prompts.',
  '',
  `Canonical anchors: OPTIONS MODE ACTIVE; strict; AskUserQuestion choice prompt; Recommended; mutually exclusive labels; ${OPTIONS_BACKGROUND_TASK_TAG}; ${OPTIONS_BACKGROUND_AGENT_TAG}.`
].join('\n');

const OPTIONS_RULES_TEXT_AUTO = [
  'OPTIONS MODE ACTIVE (auto).',
  '',
  'The user may not be present to respond. Every turn MUST end with one of four states:',
  '1. An AskUserQuestion tool call — use this when a human is present and you need a decision. If the user is not present, do not rely on a reply; proceed autonomously using your best judgment.',
  `2. ${OPTIONS_TASK_COMPLETE_TAG} — append this when the task is genuinely finished and there is nothing more to do. Do NOT use AskUserQuestion for post-task suggestions; use this tag and stop.`,
  `3. ${OPTIONS_BACKGROUND_TASK_TAG} — when polling a background task (build, test run, long-running command).`,
  `4. ${OPTIONS_BACKGROUND_AGENT_TAG} — when polling a background agent (subagent, peer agent, orchestrator).`,
  '',
  `Plain prose without one of those four is forbidden in auto mode. The no-question tag is NOT valid in auto mode.`,
  'When you use AskUserQuestion, always put the recommended or default option first (as Option 1). Label it "Recommended". Offer 2-4 concrete, mutually exclusive choices.',
  'If options mode is off, do not enforce choice prompts.',
  '',
  `Canonical anchors: OPTIONS MODE ACTIVE; auto; AskUserQuestion choice prompt; Recommended; ${OPTIONS_TASK_COMPLETE_TAG}; ${OPTIONS_BACKGROUND_TASK_TAG}.`
].join('\n');

function escapeForBashSingleQuote(s) {
  return "'" + String(s).replace(/'/g, `'\\''`) + "'";
}

function getConfigRoot() {
  if (!process.env.PLUGIN_DATA) {
    const err = new Error('PLUGIN_DATA is required for options-mode config');
    err.code = 'ERR_OPTIONS_PLUGIN_DATA_REQUIRED';
    throw err;
  }
  return process.env.PLUGIN_DATA;
}

function rethrowMissingPluginData(e) {
  if (e && e.code === 'ERR_OPTIONS_PLUGIN_DATA_REQUIRED') throw e;
}

function sessionFlagSuffix(sessionId) {
  return crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 32);
}

function getFlagPath(sessionId) {
  if (sessionId && typeof sessionId === 'string' && sessionId.length > 0) {
    return path.join(getConfigRoot(), SESSION_FLAGS_SUBDIR, sessionFlagSuffix(sessionId));
  }
  return path.join(getConfigRoot(), LEGACY_FLAG_NAME);
}

function getConfigPath() {
  return path.join(getConfigRoot(), 'options.json');
}

function getDefaultModeRaw() {
  const envMode = process.env.OPTIONS_DEFAULT_MODE;
  if (envMode && VALID_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }

  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    if (config.defaultMode && VALID_MODES.includes(config.defaultMode.toLowerCase())) {
      return config.defaultMode.toLowerCase();
    }
  } catch (e) { rethrowMissingPluginData(e); }

  return null;
}

function getDefaultMode() {
  return getDefaultModeRaw() || 'off';
}

function _readConfigJson() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (e) { rethrowMissingPluginData(e); }
  return {};
}

function _writeConfigJsonAtomic(obj) {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);
  fs.mkdirSync(configDir, { recursive: true });

  try {
    if (fs.lstatSync(configDir).isSymbolicLink()) return;
  } catch (e) {
    return;
  }

  try {
    if (fs.lstatSync(configPath).isSymbolicLink()) return;
  } catch (e) {
    if (e.code !== 'ENOENT') return;
  }

  const tempPath = path.join(configDir, `.options.json.${process.pid}.${Date.now()}`);
  const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
  let fd;
  try {
    fd = fs.openSync(tempPath, flags, 0o600);
    fs.writeSync(fd, JSON.stringify(obj));
    try { fs.fchmodSync(fd, 0o600); } catch (e) {}
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  // SEE: options-mode CLAUDE.md Global Default (TOCTOU acceptance - same boundary as
  // safeWriteFlag()). Symlink swap window between lstatSync and renameSync is accepted
  // as out-of-threat-model: a local attacker with write access to PLUGIN_DATA already
  // owns this plugin's state.
  try {
    fs.renameSync(tempPath, configPath);
  } catch (renameErr) {
    if (renameErr && (renameErr.code === 'EEXIST' || renameErr.code === 'EBUSY' || renameErr.code === 'EACCES')) {
      appendLog(`WARN options.json rename failed code=${renameErr.code} path=${configPath}`);
    }
    try { fs.unlinkSync(tempPath); } catch (e) {}
  }
}

function setDefaultMode(mode) {
  try {
    if (!VALID_MODES.includes(mode)) return;
    const obj = _readConfigJson();
    obj.defaultMode = mode;
    _writeConfigJsonAtomic(obj);
  } catch (e) { rethrowMissingPluginData(e); }
}

function clearDefaultMode() {
  try {
    const obj = _readConfigJson();
    delete obj.defaultMode;
    if (Object.keys(obj).length === 0) {
      try { fs.unlinkSync(getConfigPath()); } catch (e) {}
      return;
    }
    _writeConfigJsonAtomic(obj);
  } catch (e) { rethrowMissingPluginData(e); }
}

function safeWriteFlag(flagPath, content) {
  try {
    const flagDir = path.dirname(flagPath);
    fs.mkdirSync(flagDir, { recursive: true });

    try {
      if (fs.lstatSync(flagDir).isSymbolicLink()) return;
    } catch (e) {
      return;
    }

    try {
      if (fs.lstatSync(flagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }

    const tempPath = path.join(flagDir, `.options-active.${process.pid}.${Date.now()}`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(content));
      try { fs.fchmodSync(fd, 0o600); } catch (e) {}
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    // SEE: options-mode CLAUDE.md Flag Contract (TOCTOU acceptance).
    // TOCTOU between the lstatSync symlink check above and this rename. renameSync does
    // not carry O_NOFOLLOW semantics on the destination, so a concurrent attacker who can
    // write to flagDir could replace flagPath with a symlink between the two syscalls.
    // Accepted as out-of-threat-model: a local attacker with write access to
    // PLUGIN_DATA already has full control of this plugin's state.
    try {
      fs.renameSync(tempPath, flagPath);
    } catch (renameErr) {
      if (renameErr && (renameErr.code === 'EEXIST' || renameErr.code === 'EBUSY' || renameErr.code === 'EACCES')) {
        appendLog(`WARN safeWriteFlag rename failed code=${renameErr.code} path=${flagPath}`);
      }
      try { fs.unlinkSync(tempPath); } catch (e) {}
    }
  } catch (e) { rethrowMissingPluginData(e); }
}

function setOptionsMode(sessionId, mode) {
  if (!VALID_MODES.includes(mode)) return;
  safeWriteFlag(getFlagPath(sessionId), mode);
}

function _readFlagInternal(flagPath) {
  if (process.env.OPTIONS_TEST_INJECT_FS_ERROR === '1') {
    throw new Error('injected flag read failure');
  }

  let st;
  try {
    st = fs.lstatSync(flagPath);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  if (st.isSymbolicLink() || !st.isFile()) return null;
  if (st.size > MAX_FLAG_BYTES) return null;

  const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const flags = fs.constants.O_RDONLY | O_NOFOLLOW;
  let fd;
  let out;
  try {
    fd = fs.openSync(flagPath, flags);
    const buf = Buffer.alloc(MAX_FLAG_BYTES);
    const n = fs.readSync(fd, buf, 0, MAX_FLAG_BYTES, 0);
    out = buf.slice(0, n).toString('utf8');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }

  const raw = out.trim().toLowerCase();
  if (!VALID_MODES.includes(raw)) return null;
  return raw;
}

function readFlag(flagPath) {
  try {
    return _readFlagInternal(flagPath);
  } catch (e) {
    return null;
  }
}

function hasValidFlag(sessionId) {
  try {
    const flagPath = getFlagPath(sessionId);
    const st = fs.lstatSync(flagPath);
    if (st.isSymbolicLink() || !st.isFile()) return false;
    return readFlag(flagPath) !== null;
  } catch (e) {
    rethrowMissingPluginData(e);
    return false;
  }
}

function getOptionsMode(sessionId) {
  try {
    const mode = _readFlagInternal(getFlagPath(sessionId));
    if (mode === null) return getDefaultMode();
    return mode;
  } catch (e) {
    rethrowMissingPluginData(e);
    return 'on';
  }
}

function isOptionsActive(sessionId) {
  const mode = getOptionsMode(sessionId);
  return mode === 'on' || mode === 'strict' || mode === 'auto';
}

function appendLog(line) {
  try {
    const logPath = path.join(getConfigRoot(), 'options.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    try {
      const st = fs.statSync(logPath);
      if (st.size >= MAX_LOG_BYTES) {
        try { fs.unlinkSync(`${logPath}.1`); } catch (e) {}
        fs.renameSync(logPath, `${logPath}.1`);
      }
    } catch (e) {}
    fs.appendFileSync(logPath, line.replace(/[\r\n]+/g, ' ') + '\n');
  } catch (e) { rethrowMissingPluginData(e); }
}

module.exports = {
  SESSION_FLAGS_SUBDIR,
  sessionFlagSuffix,
  OPTIONS_NO_QUESTION_TAG,
  OPTIONS_BACKGROUND_TASK_TAG,
  OPTIONS_BACKGROUND_AGENT_TAG,
  OPTIONS_TASK_COMPLETE_TAG,
  FUNCTION_CALL_NAMES,
  OPTIONS_RULES_TEXT,
  OPTIONS_RULES_TEXT_STRICT,
  OPTIONS_RULES_TEXT_AUTO,
  MAX_LOG_BYTES,
  VALID_MODES,
  escapeForBashSingleQuote,
  getConfigRoot,
  getFlagPath,
  getConfigPath,
  getDefaultMode,
  getDefaultModeRaw,
  setDefaultMode,
  clearDefaultMode,
  safeWriteFlag,
  setOptionsMode,
  readFlag,
  hasValidFlag,
  isOptionsActive,
  getOptionsMode,
  appendLog
};
