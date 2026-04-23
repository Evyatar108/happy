#!/usr/bin/env node
/**
 * US-000 cost probe — manual dashboard gate
 *
 * Usage:
 *   node scripts/probe-shadow-session-cost.mjs
 * from packages/happy-cli/. Optionally set HAPPY_SETTINGS_PATH to point at a
 * specific claude settings file (defaults to undefined, letting the SDK use its
 * own default).
 *
 * Manual pass/fail criteria:
 *   1. Check your Anthropic dev-account usage dashboard BEFORE running this script.
 *   2. Run the script and inspect the logged message types below.
 *   3. Check the dashboard again AFTER.
 *
 * Expected (zero-cost): you see ONLY "system/init" then close — no LLM tokens billed.
 * Failure signal: if you see "assistant", "stream_event", or "result" messages,
 * the abort fired too late and the feature is NOT zero-cost. Do NOT mark US-000
 * passes:true — it requires a code fix first.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

const settingsPath = process.env.HAPPY_SETTINGS_PATH || undefined;
const cwd = process.cwd();

function ts() {
  return new Date().toISOString();
}

async function main() {
  const abortController = new AbortController();
  const queryHandle = query({
    prompt: '.',
    options: {
      cwd,
      settings: settingsPath,
      abortController,
    },
  });

  console.log(`[${ts()}] probe started  cwd=${cwd} settingsPath=${settingsPath ?? '(default)'}`);

  try {
    for await (const message of queryHandle) {
      const subtype = message.subtype ? `/${message.subtype}` : '';
      console.log(`[${ts()}] message: ${message.type}${subtype}`);

      if (message.type === 'system' && message.subtype === 'init') {
        console.log(`[${ts()}] system/init received — calling initializationResult + reloadPlugins`);

        await Promise.all([
          queryHandle.initializationResult().then(() => {
            console.log(`[${ts()}] initializationResult resolved`);
          }),
          queryHandle.reloadPlugins().then(() => {
            console.log(`[${ts()}] reloadPlugins resolved`);
          }),
        ]);

        console.log(`[${ts()}] aborting shadow session`);
        abortController.abort('shadow session metadata captured');
      }
    }
  } finally {
    try {
      await queryHandle.close();
    } catch (err) {
      console.log(`[${ts()}] close error (expected after abort): ${err && err.message}`);
    }
    console.log(`[${ts()}] probe complete`);
  }
}

function isExpectedAbortError(err) {
  if (!err) return false;
  const msg = err.message || String(err);
  return /abort/i.test(msg);
}

main().catch((err) => {
  if (isExpectedAbortError(err)) {
    console.log(`[${ts()}] expected abort error after shadow-session teardown: ${err.message}`);
    process.exit(0);
  }
  console.error(`[${ts()}] fatal:`, err);
  process.exit(1);
});
