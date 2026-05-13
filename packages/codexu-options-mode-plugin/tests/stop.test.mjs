import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const config = require("../hooks/config.js");
const stop = require("../hooks/stop.js");
const hookPath = fileURLToPath(new URL("../hooks/stop.js", import.meta.url));

const tempRoots = [];

async function makeRoot(prefix) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function makePluginData() {
  const root = await makeRoot("codex-options-stop-data-");
  process.env.PLUGIN_DATA = root;
  delete process.env.OPTIONS_DEFAULT_MODE;
  return root;
}

async function makeTranscript(lines = []) {
  const root = await makeRoot("codex-options-stop-transcript-");
  const transcriptPath = path.join(root, "transcript.jsonl");
  await writeFile(transcriptPath, lines.map((line) => JSON.stringify(line)).join("\n"));
  return transcriptPath;
}

function runStop(root, payload) {
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, PLUGIN_DATA: root },
  });

  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return result.stdout;
}

function basePayload(transcriptPath, lastAssistantMessage) {
  return {
    hook_event_name: "Stop",
    session_id: "stop-session",
    transcript_path: transcriptPath,
    last_assistant_message: lastAssistantMessage,
    stop_hook_active: false,
  };
}

async function setMode(root, mode, sessionId = "stop-session") {
  process.env.PLUGIN_DATA = root;
  config.setOptionsMode(sessionId, mode);
}

afterEach(async () => {
  delete process.env.PLUGIN_DATA;
  delete process.env.OPTIONS_DEFAULT_MODE;
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Stop hook", () => {
  test("blocks missing tag in on mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "on");

    const out = JSON.parse(runStop(root, basePayload(transcriptPath, "Plain prose.")));

    expect(out).toEqual({ decision: "block", reason: stop.BLOCK_REASON });
  });

  test("passes no-question tag in on mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "on");

    expect(runStop(root, basePayload(
      transcriptPath,
      `Done.\n${config.OPTIONS_NO_QUESTION_TAG}`,
    ))).toBe("");
  });

  test("passes background tags in on, strict, and auto modes", async () => {
    const root = await makePluginData();

    for (const mode of ["on", "strict", "auto"]) {
      await setMode(root, mode, `session-${mode}-task`);
      let transcriptPath = await makeTranscript();
      expect(runStop(root, {
        ...basePayload(transcriptPath, `Still running.\n${config.OPTIONS_BACKGROUND_TASK_TAG}`),
        session_id: `session-${mode}-task`,
      })).toBe("");

      await setMode(root, mode, `session-${mode}-agent`);
      transcriptPath = await makeTranscript();
      expect(runStop(root, {
        ...basePayload(transcriptPath, `Waiting on subagent.\n${config.OPTIONS_BACKGROUND_AGENT_TAG}`),
        session_id: `session-${mode}-agent`,
      })).toBe("");
    }
  });

  test("blocks no-question tag in strict mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "strict");

    const out = JSON.parse(runStop(root, basePayload(
      transcriptPath,
      `Plain prose.\n${config.OPTIONS_NO_QUESTION_TAG}`,
    )));

    expect(out).toEqual({ decision: "block", reason: stop.BLOCK_REASON_STRICT });
  });

  test("passes task-complete tag in auto mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "auto");

    expect(runStop(root, basePayload(
      transcriptPath,
      `Complete.\n${config.OPTIONS_TASK_COMPLETE_TAG}`,
    ))).toBe("");
  });

  test("blocks no-question tag in auto mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "auto");

    const out = JSON.parse(runStop(root, basePayload(
      transcriptPath,
      `Plain prose.\n${config.OPTIONS_NO_QUESTION_TAG}`,
    )));

    expect(out).toEqual({
      decision: "block",
      reason: `Auto options mode: use AskUserQuestion if a human is present, or append ${config.OPTIONS_TASK_COMPLETE_TAG} when done, or use a background tag when polling.`,
    });
  });

  test("passes through when state is off regardless of message content", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "off");

    expect(runStop(root, basePayload(transcriptPath, "Plain prose."))).toBe("");
  });

  test("blocks empty last assistant message with no trailing function call in on mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript([
      { payload: { type: "message", role: "assistant", content: [] } },
    ]);
    await setMode(root, "on");

    const out = JSON.parse(runStop(root, basePayload(transcriptPath, "")));
    expect(out).toEqual({ decision: "block", reason: stop.BLOCK_REASON });
  });

  test("blocks empty last assistant message with no trailing function call in strict mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript([
      { payload: { type: "message", role: "assistant", content: [] } },
    ]);
    await setMode(root, "strict");

    const out = JSON.parse(runStop(root, basePayload(transcriptPath, "")));
    expect(out).toEqual({ decision: "block", reason: stop.BLOCK_REASON_STRICT });
  });

  test("blocks empty last assistant message with no trailing function call in auto mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript([
      { payload: { type: "message", role: "assistant", content: [] } },
    ]);
    await setMode(root, "auto");

    const out = JSON.parse(runStop(root, basePayload(transcriptPath, "")));
    expect(out.decision).toBe("block");
  });

  test("passes empty last assistant message with trailing function calls", async () => {
    const root = await makePluginData();
    await setMode(root, "on");

    for (const name of ["request_user_input", "ask_user_question"]) {
      const transcriptPath = await makeTranscript([
        { payload: { type: "message", role: "assistant", content: [] } },
        { payload: { type: "function_call", name } },
      ]);

      expect(runStop(root, basePayload(transcriptPath, ""))).toBe("");
      expect(runStop(root, basePayload(transcriptPath, null))).toBe("");
    }
  });

  test("sixth call with same transcript and message passes and logs warning", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    const payload = basePayload(transcriptPath, "Repeated prose.");
    await setMode(root, "on");

    for (let i = 0; i < 5; i += 1) {
      expect(JSON.parse(runStop(root, payload))).toEqual({ decision: "block", reason: stop.BLOCK_REASON });
    }

    expect(runStop(root, payload)).toBe("");
    await expect(readFile(path.join(root, "options.log"), "utf8")).resolves.toContain(
      `WARN options Stop hook gave up after 6 blocks for ${transcriptPath}`,
    );
  });

  test("stop_hook_active true early-returns with empty stdout", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "on");

    expect(runStop(root, {
      ...basePayload(transcriptPath, "Plain prose."),
      stop_hook_active: true,
    })).toBe("");
  });

  test("stop_hook_active false runs normal enforcement", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "on");

    const out = JSON.parse(runStop(root, {
      ...basePayload(transcriptPath, "Plain prose."),
      stop_hook_active: false,
    }));

    expect(out).toEqual({ decision: "block", reason: stop.BLOCK_REASON });
  });

  test("fixtures use plain string transcript_path and last_assistant_message fields", async () => {
    const fixture = JSON.parse(
      await readFile(new URL("./fixtures/codex-stop-spike.json", import.meta.url), "utf8"),
    );

    expect(typeof fixture.transcript_path).toBe("string");
    expect(typeof fixture.last_assistant_message).toBe("string");
    expect(fixture.transcript_path).not.toEqual(expect.any(Object));
    expect(fixture.last_assistant_message).not.toEqual(expect.any(Object));
  });

  test("codex-shape fixtures have correct wire shape (INV-1 NullableString serde transparent)", async () => {
    const fixtureNames = [
      "codex-stop-tag-present.json",
      "codex-stop-tag-missing.json",
      "codex-stop-disabled.json",
      "codex-stop-strict-bg-task.json",
      "codex-stop-auto-task-complete.json",
      "codex-stop-function-call.json",
      "codex-stop-loop-counter.json",
      "codex-stop-first-run.json",
      "codex-stop-continuation.json",
    ];

    for (const name of fixtureNames) {
      const fixture = JSON.parse(
        await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
      );

      expect(typeof fixture.transcript_path).toBe("string");
      expect(fixture.transcript_path).not.toEqual(expect.any(Object));

      expect(fixture.last_assistant_message === null || typeof fixture.last_assistant_message === "string").toBe(true);
      if (fixture.last_assistant_message !== null) {
        expect(typeof fixture.last_assistant_message).toBe("string");
      }

      expect(typeof fixture.stop_hook_active).toBe("boolean");
    }
  });

  test("tag-present fixture passes in on mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "on");
    const fixture = JSON.parse(
      await readFile(new URL("./fixtures/codex-stop-tag-present.json", import.meta.url), "utf8"),
    );

    expect(runStop(root, { ...fixture, transcript_path: transcriptPath, session_id: "stop-session" })).toBe("");
  });

  test("tag-missing fixture blocks in on mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "on");
    const fixture = JSON.parse(
      await readFile(new URL("./fixtures/codex-stop-tag-missing.json", import.meta.url), "utf8"),
    );

    const out = JSON.parse(runStop(root, { ...fixture, transcript_path: transcriptPath, session_id: "stop-session" }));
    expect(out).toEqual({ decision: "block", reason: stop.BLOCK_REASON });
  });

  test("blocks with misconfigured message when PLUGIN_DATA is unset", async () => {
    const transcriptPath = await makeRoot("codex-options-stop-transcript-noplugin-");
    const payload = {
      hook_event_name: "Stop",
      session_id: "stop-session-noplugin",
      transcript_path: path.join(transcriptPath, "transcript.jsonl"),
      last_assistant_message: "Plain prose.",
      stop_hook_active: false,
    };

    const result = spawnSync(process.execPath, [hookPath], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, PLUGIN_DATA: "" },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const out = JSON.parse(result.stdout);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("PLUGIN_DATA");
  });

  test("strict-bg-task fixture passes in strict mode", async () => {
    const root = await makePluginData();
    const transcriptPath = await makeTranscript();
    await setMode(root, "strict");
    const fixture = JSON.parse(
      await readFile(new URL("./fixtures/codex-stop-strict-bg-task.json", import.meta.url), "utf8"),
    );

    expect(runStop(root, { ...fixture, transcript_path: transcriptPath, session_id: "stop-session" })).toBe("");
  });
});
