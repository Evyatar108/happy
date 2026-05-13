import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const config = require("../hooks/config.js");

const tempRoots = [];

async function withPluginData() {
  const root = await mkdtemp(path.join(tmpdir(), "codex-options-config-"));
  tempRoots.push(root);
  process.env.PLUGIN_DATA = root;
  delete process.env.OPTIONS_DEFAULT_MODE;
  return root;
}

afterEach(async () => {
  delete process.env.PLUGIN_DATA;
  delete process.env.OPTIONS_DEFAULT_MODE;
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("options-mode config", () => {
  test("requires PLUGIN_DATA and has no fallback config root", () => {
    delete process.env.PLUGIN_DATA;

    expect(() => config.getConfigRoot()).toThrow("PLUGIN_DATA is required");
    expect(() => config.getOptionsMode("missing-env")).toThrow("PLUGIN_DATA is required");
  });

  test("reads and writes per-session modes under PLUGIN_DATA", async () => {
    const root = await withPluginData();
    const sessionId = "session-a";

    expect(config.getOptionsMode(sessionId)).toBe("off");
    expect(config.isOptionsActive(sessionId)).toBe(false);

    config.setOptionsMode(sessionId, "on");

    expect(config.getConfigRoot()).toBe(root);
    expect(config.getOptionsMode(sessionId)).toBe("on");
    expect(config.isOptionsActive(sessionId)).toBe(true);
    expect(config.getOptionsMode("session-b")).toBe("off");
    await expect(stat(config.getFlagPath(sessionId))).resolves.toMatchObject({ size: 2 });
  });

  test("uses global default state when no per-session flag exists", async () => {
    await withPluginData();

    expect(config.getDefaultModeRaw()).toBeNull();
    expect(config.getDefaultMode()).toBe("off");

    config.setDefaultMode("strict");

    expect(config.getDefaultModeRaw()).toBe("strict");
    expect(config.getOptionsMode("inherits-default")).toBe("strict");
    expect(config.isOptionsActive("inherits-default")).toBe(true);

    config.setOptionsMode("inherits-default", "off");

    expect(config.getOptionsMode("inherits-default")).toBe("off");

    config.clearDefaultMode();

    expect(config.getDefaultModeRaw()).toBeNull();
  });

  test("keeps counter and flag SHA path derivation stable", async () => {
    await withPluginData();

    expect(config.sessionFlagSuffix("stable-session")).toBe("e18c78136e8ee72d10e2af231794072c");
    expect(config.getFlagPath("stable-session").replace(/\\/g, "/")).toContain(
      "options-mode/sessions-configs/e18c78136e8ee72d10e2af231794072c",
    );
  });

  test("exports byte-identical tag constants and function-call names", () => {
    expect(config.OPTIONS_NO_QUESTION_TAG).toBe("<options-mode>no-question</options-mode>");
    expect(config.OPTIONS_BACKGROUND_TASK_TAG).toBe("<options-mode>background-task</options-mode>");
    expect(config.OPTIONS_BACKGROUND_AGENT_TAG).toBe("<options-mode>background-agent</options-mode>");
    expect(config.OPTIONS_TASK_COMPLETE_TAG).toBe("<options-mode>task-complete</options-mode>");
    expect(config.FUNCTION_CALL_NAMES).toEqual(["request_user_input", "ask_user_question"]);
  });

  test("exports appendLog and writes sanitized log lines under PLUGIN_DATA", async () => {
    const root = await withPluginData();

    config.appendLog("hello\r\nworld");

    await expect(readFile(path.join(root, "options.log"), "utf8")).resolves.toBe("hello world\n");
  });

  test("keeps hooks package metadata aligned with upstream CommonJS boundary", () => {
    const hooksPackage = require("../hooks/package.json");

    expect(hooksPackage).toEqual({ type: "commonjs" });
  });
});
