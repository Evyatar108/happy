import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const config = require("../hooks/config.js");
const hookPath = fileURLToPath(new URL("../hooks/session-start.js", import.meta.url));

const tempRoots = [];

async function withPluginData() {
  const root = await mkdtemp(path.join(tmpdir(), "codex-options-session-start-"));
  tempRoots.push(root);
  process.env.PLUGIN_DATA = root;
  delete process.env.OPTIONS_DEFAULT_MODE;
  return root;
}

function runSessionStart(root, payload) {
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, PLUGIN_DATA: root },
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return result.stdout;
}

afterEach(async () => {
  delete process.env.PLUGIN_DATA;
  delete process.env.OPTIONS_DEFAULT_MODE;
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("SessionStart hook", () => {
  test("injects active-mode rules with the options-mode status prefix", async () => {
    const root = await withPluginData();
    const cases = [
      ["on", config.OPTIONS_RULES_TEXT],
      ["strict", config.OPTIONS_RULES_TEXT_STRICT],
      ["auto", config.OPTIONS_RULES_TEXT_AUTO],
    ];

    for (const [mode, rules] of cases) {
      const sessionId = `session-${mode}`;
      config.setOptionsMode(sessionId, mode);

      const out = runSessionStart(root, {
        hook_event_name: "SessionStart",
        source: "startup",
        session_id: sessionId,
      });

      expect(out).toBe(`options-mode: ${mode}\n${rules}`);
      expect(out).toContain("OPTIONS MODE ACTIVE");
      expect(out).toContain("AskUserQuestion choice prompt");
      expect(out).toContain("Recommended");
    }
  });

  test("omits additional context when options mode is off", async () => {
    const root = await withPluginData();
    const sessionId = "session-off";

    expect(runSessionStart(root, {
      hook_event_name: "SessionStart",
      source: "startup",
      session_id: sessionId,
    })).toBe("");

    config.setOptionsMode(sessionId, "off");

    expect(runSessionStart(root, {
      hook_event_name: "SessionStart",
      source: "resume",
      session_id: sessionId,
    })).toBe("");
  });
});
