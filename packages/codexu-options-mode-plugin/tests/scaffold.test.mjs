import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("codex Stop hook fixture", () => {
  test("uses plain string NullableString fields", async () => {
    const fixture = JSON.parse(
      await readFile(new URL("./fixtures/codex-stop-spike.json", import.meta.url), "utf8"),
    );

    expect(typeof fixture.transcript_path).toBe("string");
    expect(typeof fixture.last_assistant_message).toBe("string");
    expect(fixture.transcript_path).not.toEqual(expect.any(Object));
    expect(fixture.last_assistant_message).not.toEqual(expect.any(Object));
  });
});

describe("Codex hook registry", () => {
  test("registers only SessionStart, UserPromptSubmit, and Stop hooks", async () => {
    const registry = JSON.parse(
      await readFile(new URL("../hooks/hooks.json", import.meta.url), "utf8"),
    );

    expect(Object.keys(registry.hooks).sort()).toEqual([
      "SessionStart",
      "Stop",
      "UserPromptSubmit",
    ]);
    expect(registry.hooks).not.toHaveProperty("PreToolUse");

    expect(registry.hooks.SessionStart).toEqual([
      {
        matcher: "startup|resume|compact|clear",
        hooks: [
          {
            type: "command",
            command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/session-start.js",
            timeout: 5,
          },
        ],
      },
    ]);
    expect(registry.hooks.UserPromptSubmit).toEqual([
      {
        hooks: [
          {
            type: "command",
            command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-submit.js",
            timeout: 5,
          },
        ],
      },
    ]);
    expect(registry.hooks.Stop).toEqual([
      {
        hooks: [
          {
            type: "command",
            command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/stop.js",
            timeout: 35,
          },
        ],
      },
    ]);
  });

  test("plugin manifest points at the hook registry", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../.codex-plugin/plugin.json", import.meta.url), "utf8"),
    );

    expect(manifest.hooks).toBe("./hooks/hooks.json");
  });
});
