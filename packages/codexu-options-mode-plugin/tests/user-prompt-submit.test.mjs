import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const config = require("../hooks/config.js");
const hookPath = fileURLToPath(new URL("../hooks/user-prompt-submit.js", import.meta.url));
const usage = "options mode: usage /options-mode on|off|strict|auto|status|default [on|off|strict|auto|clear|status]";

const tempRoots = [];

async function withPluginData() {
  const root = await mkdtemp(path.join(tmpdir(), "codex-options-user-prompt-"));
  tempRoots.push(root);
  process.env.PLUGIN_DATA = root;
  delete process.env.OPTIONS_DEFAULT_MODE;
  return root;
}

function runUserPromptSubmit(root, prompt, sessionId = "session-toggle") {
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt, session_id: sessionId }),
    encoding: "utf8",
    env: { ...process.env, PLUGIN_DATA: root },
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return result.stdout;
}

function expectBlock(out, reason) {
  expect(JSON.parse(out)).toEqual({ decision: "block", reason });
}

afterEach(async () => {
  delete process.env.PLUGIN_DATA;
  delete process.env.OPTIONS_DEFAULT_MODE;
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("UserPromptSubmit hook", () => {
  test("handles session toggle forms", async () => {
    const root = await withPluginData();
    const sessionId = "session-commands";

    for (const mode of ["on", "off", "strict", "auto"]) {
      expectBlock(runUserPromptSubmit(root, `/options-mode ${mode}`, sessionId), `options mode: ${mode}`);
      expect(config.getOptionsMode(sessionId)).toBe(mode);
    }

    expectBlock(
      runUserPromptSubmit(root, "/options-mode status", sessionId),
      "options mode: auto (session=auto, default=unset)",
    );
  });

  test("handles default toggle forms", async () => {
    const root = await withPluginData();

    for (const mode of ["on", "off", "strict", "auto"]) {
      expectBlock(runUserPromptSubmit(root, `/options-mode default ${mode}`), `options mode default: ${mode}`);
      expect(config.getDefaultModeRaw()).toBe(mode);
    }

    expectBlock(runUserPromptSubmit(root, "/options-mode default status"), "options mode default: auto");
    expectBlock(runUserPromptSubmit(root, "/options-mode default clear"), "options mode default: cleared");
    expect(config.getDefaultModeRaw()).toBeNull();
    expectBlock(runUserPromptSubmit(root, "/options-mode default status"), "options mode default: unset");
  });

  test("reports usage for unknown options-mode commands", async () => {
    const root = await withPluginData();

    expectBlock(runUserPromptSubmit(root, "/options-mode foo"), usage);
    expectBlock(runUserPromptSubmit(root, "/options-mode default foo"), usage);
  });

  test("does not intercept prompts that merely start with /options-mode without a space", async () => {
    const root = await withPluginData();

    expect(runUserPromptSubmit(root, "/options-modefoo")).toBe("");
    expect(runUserPromptSubmit(root, "/options-mode-help")).toBe("");
    expect(runUserPromptSubmit(root, "/options-modeoff")).toBe("");
  });

  test("passes through non-slash prompts while injecting rules for active modes", async () => {
    const root = await withPluginData();
    const sessionId = "session-non-slash";

    expect(runUserPromptSubmit(root, "ordinary prompt", sessionId)).toBe("");

    config.setOptionsMode(sessionId, "strict");
    const out = JSON.parse(runUserPromptSubmit(root, "ordinary prompt", sessionId));

    expect(out.decision).toBeUndefined();
    expect(out.hookSpecificOutput).toEqual({
      hookEventName: "UserPromptSubmit",
      additionalContext: config.OPTIONS_RULES_TEXT_STRICT,
    });
  });
});
