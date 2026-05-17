# Codex Agent Parity Audit — Claude-Code conventions the codex agent under happy doesn't match

*Generated 2026-05-13. Research-only deliverable: NO code changes. Surface to operator for review before opening any fix ralph commands.*

## Why this doc exists

The project-cwd `.mcp.json` discovery gap was found by accident on 2026-05-13 (see
`plans/codexu-roadmap.md` Sprint E follow-on bullets — "Codex agent project-`.mcp.json` parity").
That bullet alone documents one concrete gap; the operator then asked for a structured
survey to find every other Claude-Code feature the codex agent under `happy` silently
drops today, so the next gap doesn't have to be found accidentally.

Scope of this audit:

- **Reference Claude path**: `packages/happy-cli/src/claude/{runClaude,claudeLocalLauncher,claudeRemoteLauncher,claudeRemote,claudeLocal,loop}.ts` + `utils/{generateHookSettings,permissionMode,sessionScanner}.ts` and the Claude Code SDK conventions they wire up.
- **Subject Codex path**: `packages/happy-cli/src/codex/{runCodex,codexAppServerClient,resumeExistingThread,executionPolicy}.ts` + `utils/{permissionHandler,reasoningProcessor,diffProcessor,sessionProtocolMapper}.ts` and the `codex app-server` JSON-RPC wire surface exposed in `codexAppServerTypes.ts`.
- **Codex submodule**: `codex/codex-rs-overlay/` overlay-crate area (precedents: `codex-copilot/`, `codex-copilot-launcher/`, `codex-invariant-tests/`) and `codex/external/repos/codex-patched/codex-rs/` upstream-canonical subtree. **Read-only** for this audit — the audit proposes fix-sites; actual fixes will be separate ralph commands.

Every gap below was verified against current code with file:line evidence; no claims-by-recollection.

## How to read each gap section

| Field | Meaning |
|---|---|
| **Current state** | What runs today on each side. File:line evidence for both. |
| **Proposed fix site** | One of: (a) happy-cli — read project files + plumb to codex JSON-RPC params; (b) overlay crate under `codex/codex-rs-overlay/` (fork-exclusive, zero conflict surface); (c) upstream-canonical patch inside `codex/external/repos/codex-patched/codex-rs/` (last resort per the [minimize-conflict-surface tenet](#minimize-conflict-surface-tenet) in `codex/CLAUDE.md` and `plans/codexu-roadmap.md` §"Codex changes — minimize upstream conflict surface"). |
| **Effort** | Quick (<1h), Small (1–4h), Medium (4–16h), Large (>16h). Counts research + impl + test. |
| **Severity** | Low / Medium / High — combines user-visible impact + frequency. |
| **Ralph-command shape** | A one-paragraph sketch suitable for the operator to paste into `plans/parallel-assignments.md` later as the head of a `/plan-with-ralph` invocation. |

## Minimize-conflict-surface tenet

Quick reminder of the codex-side preference order (full text in `codex/CLAUDE.md` §"Core engineering tenants" and `plans/codexu-roadmap.md` §190 "Codex changes — minimize upstream conflict surface"):

1. Prefer happy-cli-side fixes when the codex wire protocol already supports the feature (zero codex changes — best possible outcome).
2. If new behavior IS needed inside codex, default to a NEW package in `codex/codex-rs-overlay/` (fork-exclusive, zero conflict surface).
3. New file inside `codex/external/repos/codex-patched/codex-rs/<crate>/` called from a 1–3 line edit at an upstream seam (the call site is the only conflict candidate).
4. Inline edit to upstream-canonical code — only when the seam genuinely cannot be moved out.

Every proposed fix-site below explicitly states the tier and why.

---

## Gap index

| # | Gap | Fix site | Effort | Severity |
|---|---|---|---|---|
| 1 | Project-cwd `.mcp.json` discovery | happy-cli (a) | Quick | **High** |
| 2 | Project-cwd `CLAUDE.md` auto-load | happy-cli (a) | Quick | **High** |
| 3 | Attachments (images) never reach codex turn input | happy-cli (a) | Small | **High** |
| 4 | Hook system (`SessionStart`/`Stop`/`UserPromptSubmit`/`Notification`/`PreCompact`/`PostCompact`) | happy-cli (a) | Medium | Medium |
| 5 | Slash commands (`/clear`, `/compact`) ignored on codex path | happy-cli (a) + thin codex-side `compactPrompt` plumb | Small | Medium |
| 6 | Plan mode / `ExitPlanMode` not honored | happy-cli (a) — defensive; (b) overlay for full parity | Small | Medium |
| 7 | Custom / appended system prompts (`baseInstructions` / `developerInstructions`) | happy-cli (a) | Small | Medium |
| 8 | `allowedTools` / `disallowedTools` per-message gating | happy-cli (a) — partial; full needs codex MCP filter | Small | Low |
| 9 | `claudeArgs`-style passthrough for codex CLI | happy-cli (a) — argv passthrough at spawn | Quick | Low |
| 10 | `.claude/skills/` discovery | n/a — Codex has its own plugin/skills system; document mismatch only | Small (docs) | Low |
| 11 | Statusline parity (statusline metadata in `system.init`) | happy-cli (a) — synthesize from `NewConversationResponse` | Quick | Low |
| 12 | SDK init-metadata mirror (tools list, slash-command list, model defaults) | happy-cli (a) | Small | Low |

---

## Gap 1 — Project-cwd `.mcp.json` discovery

**Gap.** Claude Code reads `<cwd>/.mcp.json` natively at session start (project-MCP convention); the codex app-server path does NOT.

**Current state.**
- *Claude side:* `packages/happy-cli/src/claude/runClaude.ts:723` constructs `mcpServers: { happy: {...} }` and passes it to `loop({ mcpServers })`; from there `claudeLocal.ts:215-216` adds `--mcp-config '{ mcpServers: ... }'` argv to the Claude spawn. The user's `<cwd>/.mcp.json` is independently discovered by Claude Code SDK from `cwd` — happy-cli does not have to forward it.
- *Codex side:* `packages/happy-cli/src/codex/runCodex.ts:700-705` builds `mcpServers: { happy: { command, args } }` with ONLY the `happy` bridge entry and hands it to `client.startThread({ mcpServers })` (line 794) and `resumeExistingThread({ mcpServers })` (line 725). The codex JSON-RPC `NewConversationParams` / `ResumeConversationParams` (`codexAppServerTypes.ts:19,49`) accept arbitrary `mcpServers`, but happy-cli never reads `<cwd>/.mcp.json`. Codex submodule reads `.mcp.json` only in (i) `external-agent-migration/src/lib.rs` (one-shot migrator) and (ii) `core-plugins/src/loader.rs:715` (plugin-internal). Neither is runtime-cwd-scoped.
- *Empirical effect:* `codexu/.mcp.json` declaring the `paper` MCP server is silently dropped on the codex agent path.

**Proposed fix site.** (a) happy-cli. Read `<cwd>/.mcp.json` at session start, Zod-validate (skip + log on malformed), merge entries into the `mcpServers` object passed to BOTH `client.startThread(...)` AND `resumeExistingThread(...)`. Codex's wire protocol already supports it — zero codex changes.

**Effort.** Quick (~30–45 min including a Zod schema + a colocated test).

**Severity.** **High.** Direct user-visible feature loss — every project that ships `.mcp.json` for Claude expects it to light up for codex too.

**Ralph-command shape.**
> `mcp-discovery — codex project-.mcp.json parity`
> Read `<cwd>/.mcp.json`, Zod-validate, merge `mcpServers` into `client.startThread` (`runCodex.ts:794`) and `resumeExistingThread` (`runCodex.ts:725`). Use `@/utils/configFile` patterns from happy-cli. Acceptance: with `codexu/.mcp.json` containing `paper`, a fresh `happy codex` session shows `paper` MCP tools available to the model; malformed entries are skipped + logged at debug level, not fatal.

> **Note.** This gap is already tracked as the `mcp-discovery` ralph command in `plans/overview-data.js` and rendered by `plans/overview.html`; see `plans/codexu-roadmap.md` line 472–489. Listed here for completeness and so the audit doc captures the full inventory in one place.

---

## Gap 2 — Project-cwd `CLAUDE.md` auto-load

**Gap.** Claude Code auto-loads `<cwd>/CLAUDE.md` as a project doc; the codex app-server invocation does NOT, even though codex-core's `project_doc_fallback_filenames` config knob exists and the codex-copilot launcher already understands it.

**Current state.**
- *Claude side:* Claude Code SDK natively reads `<cwd>/CLAUDE.md` at session start. happy-cli does no special plumbing — it just sets `cwd` correctly via the spawn working directory. The presence of `D:\harness-efforts\codexu\CLAUDE.md` (and `packages/happy-cli/CLAUDE.md` for the nested package) on the Claude path is automatic.
- *Codex side:* The codex-copilot launcher (`codex/codex-rs-overlay/codex-copilot-launcher/`) gates this behavior behind `auto_load_claude_md` in `~/.codex-copilot/config.toml` and, when true, appends `-c project_doc_fallback_filenames=["CLAUDE.md"]` to its codex-core child argv (see `codex/CLAUDE.md` confusion-points table). **happy-cli spawns `codex app-server` directly** — via `crossSpawn('codex', ['app-server', '--listen', ...])` in `packages/happy-cli/src/codex/codexAppServerClient.ts` — **bypassing the codex-copilot-launcher** and therefore bypassing the `-c project_doc_fallback_filenames=...` injection. Codex's native default project-doc filename remains `AGENTS.md`; users with only `CLAUDE.md` get no project doc.
- *Wire protocol*: `NewConversationParams.config: Record<string, unknown> | null` (`codexAppServerTypes.ts:26`) and `ResumeConversationParams.config` (line 56) accept config overrides. happy-cli currently passes `null` for both (never set).

**Proposed fix site.** (a) happy-cli. Pass `config: { project_doc_fallback_filenames: ["CLAUDE.md"] }` in `NewConversationParams` / `ResumeConversationParams` to recover `CLAUDE.md` for CLAUDE-only projects. The wire spike resolved the ordering question: same-directory CLAUDE-first cannot be achieved via this knob when `AGENTS.md` is also present because codex prepends `AGENTS.override.md` and `AGENTS.md` before configured fallback names in `agents_md.rs:285-319`. Mixed-file projects need an alternative path, such as generating a temporary merged instruction file, upstreaming a true precedence override, or documenting `AGENTS.md` as the codex-primary project doc.

**Effort.** Quick (~30 min — single config field, no parsing logic) for CLAUDE-only recovery; mixed-file CLAUDE-first requires a separate design choice.

**Severity.** **High.** The vast majority of codexu's project-specific guidance for agents lives in `CLAUDE.md` files; losing them on the codex path means the codex agent flies blind on every cross-cutting concern.

**Wire-spike resolution.** `project_doc_fallback_filenames: ["CLAUDE.md"]` loads `CLAUDE.md` when it is the only project doc. `project_doc_fallback_filenames: ["CLAUDE.md", "AGENTS.md"]` does not make `CLAUDE.md` win when both files exist in the same directory; codex still loads `AGENTS.md` first. See [Wire spike results](#wire-spike-results-2026-05-13-codex-cli-01250-copilot-api8), §2.

**Ralph-command shape.**
> `codex-claude-md-autoload — project CLAUDE.md auto-load on codex path`
> Pass `config: { project_doc_fallback_filenames: ["CLAUDE.md"] }` in `client.startThread`'s `NewConversationParams` and `resumeExistingThread`'s `ResumeConversationParams`. Add a happy CLI flag `--codex-project-doc <name>` (default unset → `CLAUDE.md`) so power users can override. Acceptance: with only `CLAUDE.md` present in cwd, codex agent reports awareness of the project doc in a smoke prompt; with both `CLAUDE.md` and `AGENTS.md` present, the PR either accepts codex-native `AGENTS.md` precedence or implements a separate mixed-file CLAUDE-first mechanism.

---

## Gap 3 — Attachments (images) never reach codex turn input

**Gap.** Image attachments sent through happy's wire protocol reach Claude as `image` content blocks; on the codex path they are silently dropped.

**Current state.**
- *Claude side:* `packages/happy-cli/src/claude/claudeRemote.ts:65-90` (`toClaudeUserContent`) inspects `MessageQueueAttachment[]` and produces `ContentBlockParam[]` with `{ type: 'image', source: { type: 'base64', media_type, data } }` for PNG/JPEG/GIF/WebP. Unsupported types are logged + skipped. Attachments flow through `messageQueue.push(text, mode, delivery)` (Claude path uses `OutgoingMessageQueue` and pulls attachments per-message).
- *Codex side:* `packages/happy-cli/src/codex/runCodex.ts:321` does `messageQueue.push(message.content.text, enhancedMode, getMessageDelivery(message))` — `message.content.attachments` is read NOWHERE in the codex path. `sendTurnAndWait` (`codexAppServerClient.ts:1338-1341`) hardcodes `input: InputItem[] = [{ type: 'text', text: prompt }]`. The wire `InputItem` type (`codexAppServerTypes.ts:134-137`) DOES support `{ type: "image", url }` and `{ type: "localImage", path }`, but happy-cli never produces them.

**Proposed fix site.** (a) happy-cli. Plumb attachments through `MessageQueue2`'s payload to `runCodex.ts`'s main loop, then synthesize `InputItem[]` in `sendTurnAndWait` (or a new wrapper). The wire spike confirmed codex accepts both base64 data URLs as `{ type: "image", url: "data:image/png;base64,..." }` and tmp-file paths as `{ type: "localImage", path }`; prefer data URLs unless payload size or API behavior forces a tmp-file fallback. See [Wire spike results](#wire-spike-results-2026-05-13-codex-cli-01250-copilot-api8), §1.

**Effort.** Small (~2–3h). Includes spike + a colocated integration test that exercises a PNG attachment end-to-end against a real codex app-server.

**Severity.** **High.** Mobile clients routinely send screenshots; on the codex path users would see the text body but never the image, with no error surfacing.

**Ralph-command shape.**
> `codex-attachments — image attachments on codex path`
> Plumb `MessageQueueAttachment[]` through the codex turn input. Path: extend `MessageQueue2` payload (or use `MessageBatch.attachments` from the existing claude path), build `InputItem[]` in `runCodex.ts` before calling `client.sendTurnAndWait`. Use `{ type: "image", url: "data:..." }` for supported image MIME types, with `{ type: "localImage", path }` available as a fallback. Acceptance: send a PNG screenshot from the mobile app to a `happy codex` session; the codex agent acknowledges seeing it (e.g., describes contents in a smoke prompt). Unsupported MIME types are skipped + logged, not fatal.

---

## Gap 4 — Hook system parity (`SessionStart`/`Stop`/`UserPromptSubmit`/`Notification`/`PreCompact`/`PostCompact`)

**Gap.** happy-cli wires six Claude Code hooks to drive turn-active tracking, auto-compact boundaries, idle detection, and `pendingSwitch` resolution. The codex path has none of these primitives — events are inferred from the codex JSON-RPC stream instead.

**Current state.**
- *Claude side:* `packages/happy-cli/src/claude/utils/generateHookSettings.ts:42-49` enumerates `HAPPY_HOOK_EVENTS = ['SessionStart', 'PreCompact', 'PostCompact', 'Stop', 'UserPromptSubmit', 'Notification']`. The tmpfile is passed to `claude --settings <path>`. `runClaude.ts:265-314` registers handlers for each, driving:
  - `onSessionHook` → updates `currentSession.sessionId` when Claude rolls JSONL files (incl. `--continue`/`--resume`).
  - `onCompactHook` (PostCompact, `trigger: 'auto'`) → emits `sendContextBoundary({ kind: 'autocompact', ... })`.
  - `onUserPromptSubmitHook` → `session.onTurnStarted()` (local-mode turn lifecycle).
  - `onStopHook` → `session.onTurnCompleted()` (fires deferred switch).
  - `onNotificationHook` → `session.onNotification()` (permission/idle prompts also fire deferred switch — fixes v1 stall gap, see `packages/happy-cli/CLAUDE.md` "pendingSwitch clear paths").
- *Codex side:* No hook plumbing. `runCodex.ts` infers turn lifecycle from `task_started` / `task_complete` / `turn_aborted` events on the JSON-RPC stream (lines 605-642). Compact boundaries are NOT emitted (codex has a `compactPrompt` field on `NewConversationParams` at `codexAppServerTypes.ts:29` and a `/compact` semantic in codex-core but happy-cli never plumbs it — see Gap 5). `SessionStart` has no analog because codex's threadId is returned synchronously from `client.startThread` — happy-cli already has it without a hook.

**Proposed fix site.** (a) happy-cli. **Most Claude hooks have direct JSON-RPC equivalents on the codex side already**; the gap is that happy-cli doesn't fan those events to the same downstream handlers (`onTurnStarted` / `onTurnCompleted` / `onNotification` / `sendContextBoundary({ kind: 'autocompact' })`). Concretely:
  - `task_started` → equivalent to `UserPromptSubmit`'s turn-start. Codex path already toggles `thinking = true` (runCodex.ts:628-633) but does NOT call any equivalent of `session.onTurnStarted()`.
  - `task_complete` / `turn_aborted` → equivalent to `Stop`. Codex path does NOT fire any deferred-switch-equivalent (the codex path has no Claude-style deferred-switch protocol; see `packages/happy-cli/CLAUDE.md` "Codex exclusion" — but the operator may want it later, tracked in `.ralph/jobs/preserve-turn-on-mode-switch/plan.md` open Codex question).
  - Permission-request events (codex's `client.setApprovalHandler` path at `runCodex.ts:563-583`) → equivalent to `Notification`. The codex permission handler already manages this internally but doesn't emit a context-boundary-style signal.
  - Auto-compact: codex has `turn_diff` and compact RPC semantics, but happy-cli doesn't emit `sendContextBoundary({ kind: 'autocompact', ... })` on the codex side. Today there's no codex-side trigger for auto-compact in happy-cli (codex-core handles its own compaction internally without notifying the client).

**Effort.** Medium (~6–10h). Split into: turn-lifecycle parity (~2h), context-boundary auto-compact emission (~3h — requires understanding codex's internal compaction signal), `Notification`-equivalent permission-request boundary (~1h), tests (~2h).

**Severity.** Medium. The `UserPromptSubmit`/`Stop` parity is mostly a v2 concern (no codex deferred-switch protocol yet), but the missing auto-compact context boundary means codexu's UI doesn't get the same "context compacted" visual signal for codex sessions that it does for Claude.

**Ralph-command shape.**
> `codex-hooks-parity — fan codex events to happy turn-lifecycle handlers`
> Audit each Claude hook (`SessionStart`/`UserPromptSubmit`/`Stop`/`Notification`/`PreCompact`/`PostCompact`) and identify the codex JSON-RPC event closest in semantics. For each pair where a happy downstream behavior depends on the Claude hook (auto-compact context-boundary, idle detection, permission-prompt notification), wire the codex event to the same handler. Defer the deferred-switch protocol question to the operator (see `.ralph/jobs/preserve-turn-on-mode-switch/plan.md`). Acceptance: a `happy codex` session that hits the codex internal compaction threshold emits a `sendContextBoundary({ kind: 'autocompact', ... })` envelope visible in the wire log; permission-prompt events fire a notification path equivalent to Claude's.

---

## Gap 5 — Slash commands (`/clear`, `/compact`) ignored on codex path

**Gap.** happy-cli intercepts `/clear` and `/compact` for Claude (both inbound and JSONL-replay detection); on the codex path nothing parses the user message text for slash commands and `compactPrompt`/clear-context semantics never reach codex-core.

**Current state.**
- *Claude side:* `packages/happy-cli/src/claude/runClaude.ts:541-577` calls `parseSpecialCommand(message.content.text)` and special-cases `/compact` and `/clear` — for `/compact`, the message is pushed with `pushIsolateAndClear` so it forms its own isolation batch; for `/clear`, the SDK is asked to reset session. Wrapped form `<command-name>/clear</command-name>` is also handled in `sessionProtocolMapper.ts` (`detectWrappedSlashCommandBoundary`) for the JSONL-replay path. See `packages/happy-cli/CLAUDE.md` "Wrapped-slash-command detection (F-012 / F-013)".
- *Codex side:* `runCodex.ts:280-334` (`session.onUserMessage`) pushes the message text into `messageQueue` with no slash-command parsing. `parseSpecialCommand` is never imported in the codex path. Even if a user types `/compact` on a codex session, codex-core sees it as a literal string `/compact` in the user turn — codex-core's own slash-command handling may or may not fire (this is plugin-loaded into codex-core; outside the scope of happy-cli wire protocol).
- Codex's wire surface supports compact through nested config plus `thread/compact/start`, not through happy-cli's current top-level type. The wire spike found `NewConversationParams.compactPrompt: string | null` (`codexAppServerTypes.ts:29`) is silently dropped by installed codex app-server, while `config: { compact_prompt: ... }` is honored. Fix both the stale type in `packages/happy-cli/src/codex/codexAppServerTypes.ts:29` and the start-thread/request plumbing in `packages/happy-cli/src/codex/codexAppServerClient.ts:1137`.

**Proposed fix site.** (a) happy-cli — primary fix. Either:
1. Match `/clear` on the codex path → call a codex-side reset (likely `client.disconnect()` + start a fresh thread; verify with a codex maintainer that this is the intended UX).
2. Match `/compact` on the codex path → either let codex-core's own slash-command handling fire (verify it does), OR plumb a happy-side compact path that sets `config.compact_prompt` and calls `thread/compact/start`. Do not rely on top-level `compactPrompt`; it is not honored by the current app-server wire shape.

Optionally (b) overlay-crate enhancement if codex doesn't natively understand `/compact` from the user turn text — but that's a codex-core concern, not happy-cli's. The compact-prompt placement is resolved; the remaining slash-command spike is only about whether raw `/clear` and `/compact` user turns trigger codex-core behavior.

**Effort.** Small (~2–4h) if codex-core natively handles `/clear` and `/compact` from user turn text (likely — codex's TUI does this). Larger if happy-cli has to implement codex-side equivalents.

**Severity.** Medium. `/clear` and `/compact` are common user actions; today on codex they may work by accident (codex-core sees the string and acts on it) or silently fail.

**Ralph-command shape.**
> `codex-slash-commands — /clear and /compact parity on codex path`
> Spike: does codex-core's own slash-command handling fire when the user message is `/clear` or `/compact`? If yes, document and add a smoke test. If no, implement happy-cli-side interception via `parseSpecialCommand` (already shared with Claude) and a codex-side reset/compact mechanism. For manual compact, fix `packages/happy-cli/src/codex/codexAppServerTypes.ts:29` and `packages/happy-cli/src/codex/codexAppServerClient.ts:1137` to use nested `config.compact_prompt`, then call `thread/compact/start`. Coordinate with Gap 4's auto-compact context-boundary emission so manual `/compact` also emits `sendContextBoundary({ kind: 'compact', triggeredBy: 'user' })`.

---

## Gap 6 — Plan mode / `ExitPlanMode` not honored

**Gap.** The Claude path implements the `plan` permission mode and the SDK exposes an `ExitPlanMode` tool that lets the model signal "I'm done planning". On the codex path the `plan` mode is degraded to `untrusted+workspace-write` (essentially default-mode with safer defaults), and there is no `ExitPlanMode` tool.

**Current state.**
- *Claude side:* `runClaude.ts:386-394` includes `'plan'` in `VALID_CLAUDE_PERMISSION_MODES`. The SDK mapping in `packages/happy-cli/src/claude/utils/permissionMode.ts` (`mapToClaudeMode`) translates `'plan'` to Claude's native plan-mode. The Claude SDK injects an `ExitPlanMode` tool and the model decides when to call it. UI surfaces a "plan" mode badge.
- *Codex side:* `packages/happy-cli/src/codex/cliArgs.ts` `VALID_CODEX_REMOTE_PERMISSION_MODES` (re-exported as `VALID_REMOTE_PERMISSION_MODES` in `runCodex.ts:251`) is restricted to `default`, `read-only`, `safe-yolo`, `yolo` — `plan` arriving from the mobile UI is silently ignored (`runCodex.ts:287-294`). The local CLI flag path can still pass `'plan'` to `resolveCodexExecutionPolicy(...)` via opts.permissionMode, where it falls into the defensive branch (`executionPolicy.ts:24,39`) returning `untrusted+workspace-write`. There is no `ExitPlanMode` codex tool.

**Proposed fix site.** Two-tier:
- (a) happy-cli — defensive parity. Either (i) explicitly map `'plan'` → codex's `read-only` sandbox (closer to plan semantics — agent can't write), or (ii) leave `plan` as Claude-only and surface a UX "plan mode is not supported on codex sessions" hint so users don't think it's working.
- (b) overlay crate — full parity (deferred). Define a codex `plan` mode in a new overlay crate `codex/codex-rs-overlay/codex-plan-mode/`. The overlay would inject an `exit_plan_mode` tool into the model's tool list AND constrain the sandbox to `read-only` for the duration. Out of scope for v1; flag for v2.

**Effort.** Small (~2h) for (a) defensive parity. Medium-to-Large for (b) overlay crate (spike codex tool-injection seam first).

**Severity.** Medium. `plan` mode is a common workflow on Claude; users who switch a session to plan mode on the mobile UI and then drop into codex get surprised behavior.

**Ralph-command shape.**
> `codex-plan-mode-defensive — defensive plan-mode mapping on codex path`
> Map `'plan'` → codex `read-only` sandbox in `executionPolicy.ts`, AND emit a UI hint (session-event `'message'`) on first plan-mode entry: "Plan mode on codex is approximated as read-only; ExitPlanMode tool is not available." Acceptance: switching a codex session to plan mode results in `sandbox: read-only`, `approvalPolicy: never`, and the user sees the explanatory message.

> **Defer for v2.** A separate ralph command `codex-plan-mode-overlay` would land an overlay-crate `codex-plan-mode` providing real plan-mode parity (model gets an `exit_plan_mode` tool, mode transitions on tool call). Spike upstream codex's tool-registration seam first.

---

## Gap 7 — Custom / appended system prompts not plumbed

**Gap.** The Claude path lets the mobile UI inject `customSystemPrompt` and `appendSystemPrompt` per-message; the codex wire protocol has `baseInstructions` / `developerInstructions` fields that map cleanly, but happy-cli never sets them.

**Current state.**
- *Claude side:* `runClaude.ts:376-377, 490-518` tracks `currentCustomSystemPrompt` and `currentAppendSystemPrompt` and includes them in `EnhancedMode`; the Claude SDK accepts them on `query({ customSystemPrompt, appendSystemPrompt })` — happy-cli passes them through `OutgoingMessageQueue` → `claudeRemote.ts` → SDK.
- *Codex side:* `runCodex.ts`'s `EnhancedMode` is restricted to `{ permissionMode, model, thinkingLevel }` (line 96-100). `customSystemPrompt` / `appendSystemPrompt` are not tracked. `client.startThread` is called without `baseInstructions` or `developerInstructions` (codexAppServerClient.ts), even though `NewConversationParams.baseInstructions: string | null` and `developerInstructions: string | null` are part of the wire protocol (codexAppServerTypes.ts:27-28).

**Proposed fix site.** (a) happy-cli. Track `customSystemPrompt` and `appendSystemPrompt` in the codex `EnhancedMode`. Plumb them to `client.startThread` (`baseInstructions = customSystemPrompt`, `developerInstructions = appendSystemPrompt`) and ALSO to `resumeExistingThread` (the wire has `ResumeConversationParams.baseInstructions` and `developerInstructions` too — codexAppServerTypes.ts:57-58). Decide whether mid-session changes restart the thread or are deferred to next thread start (recommend: deferred, matches Claude's "next turn only" semantics).

**Effort.** Small (~2h) including a test that exercises a `customSystemPrompt` round-trip.

**Severity.** Medium. Power users who shape Claude's system prompt mid-session lose that capability on codex.

**Ralph-command shape.**
> `codex-system-prompts — customSystemPrompt + appendSystemPrompt parity on codex path`
> Extend codex `EnhancedMode` with `customSystemPrompt?: string; appendSystemPrompt?: string`. In `runCodex.ts:280-334` mirror the Claude side's per-message tracking. Pass through to `client.startThread(..., { baseInstructions, developerInstructions })` on first turn AND `resumeExistingThread(..., { baseInstructions, developerInstructions })` on resume. Acceptance: send a message with `meta.customSystemPrompt = "You are a pirate"` to a fresh codex session; codex thread starts with that as baseInstructions; subsequent turn responses reflect the persona.

---

## Gap 8 — `allowedTools` / `disallowedTools` per-message gating

**Gap.** The Claude path supports per-message `allowedTools` / `disallowedTools` to gate which tools the model can call. The codex path doesn't track these and codex's wire protocol gates tools via approval-policy + MCP-server enable/disable, not a per-turn tool allowlist.

**Current state.**
- *Claude side:* `runClaude.ts:378-379, 520-538` tracks `currentAllowedTools` / `currentDisallowedTools` in `EnhancedMode`; passed through SDK.
- *Codex side:* `EnhancedMode` doesn't include these fields. `sendTurnAndWait` (`codexAppServerClient.ts:1388`) takes only `{ model, cwd, approvalPolicy, sandbox, effort }`. Codex's `NewConversationParams.includeApplyPatchTool: boolean | null` (codexAppServerTypes.ts:30) is a one-off flag for one specific tool, not a generic allowlist. Per-turn tool gating in codex would require either (i) constructing MCP-server config dynamically with only allowed tools, or (ii) an overlay-crate that filters the tool list seen by the model.

**Proposed fix site.** (a) happy-cli — partial fix only. Track the fields in codex `EnhancedMode` for symmetry, and use them at startThread to filter the `mcpServers` object (drop entries whose tools are entirely disallowed). True per-tool gating within an MCP server requires a codex-side filter and is deferred.

**Effort.** Small (~2h) for the partial fix.

**Severity.** Low. This is a rarely-used field; most users don't constrain tool lists per-message.

**Ralph-command shape.**
> `codex-tool-gating-partial — partial allowedTools parity on codex path`
> Track `allowedTools`/`disallowedTools` in codex `EnhancedMode`; at startThread, filter `mcpServers` entries (whole-server granularity). Defer per-tool-within-server filtering to a follow-up overlay crate. Acceptance: `meta.disallowedTools: ['happy.*']` results in the `happy` MCP bridge being omitted from `client.startThread`'s mcpServers; the model can't call any `happy.*` tool.

---

## Gap 9 — `claudeArgs`-style passthrough for codex CLI

**Gap.** The Claude path lets the user pass arbitrary `--claude-arg <...>` to the underlying `claude` spawn. The codex path has no equivalent — happy codex CLI args are fixed (`--effort`, `--model`, `--permission-mode`, `--codex-transport`, `--resume`).

**Current state.**
- *Claude side:* `runClaude.ts` accepts `claudeArgs` and forwards them to `claudeLocal.ts:224-225` (`args.push(...opts.claudeArgs)`) and to the SDK config.
- *Codex side:* `runCodex.ts` options accept only `noSandbox`, `resumeThreadId`, `effortLevel`, `model`, `permissionMode`, `codexTransport`. There's no `codexArgs` passthrough to the `codex app-server` spawn.

**Proposed fix site.** (a) happy-cli. Add `--codex-arg <flag>` (repeatable) to the codex command parser and forward to the `codex app-server` spawn. Document in `packages/happy-cli/CLAUDE.md` that this is escape-hatch territory — most users should use the structured flags.

**Effort.** Quick (~30 min).

**Severity.** Low. Power-user feature; today there's no known need.

**Ralph-command shape.**
> `codex-args-passthrough — --codex-arg passthrough flag`
> Add repeatable `--codex-arg <flag>` to the codex CLI parser. Forward to `codex app-server` spawn argv. Acceptance: `happy codex --codex-arg --some-flag --codex-arg value` results in `--some-flag value` appearing in the spawned `codex app-server` argv.

---

## Gap 10 — `.claude/skills/` discovery

**Gap.** Claude Code auto-discovers `<cwd>/.claude/skills/<name>/SKILL.md` per-project; codex has its own `.agents/skills/` convention and a separate plugin/skills system.

**Current state.**
- *Claude side:* Claude Code SDK natively discovers `.claude/skills/`. happy-cli does no plumbing — the skills appear in the model's tool catalog automatically. Project has `.claude/skills/{agent-browser,control-flow,happy-release-to-fork,maintain,metrics-graphana,release,terminal-emulator,run-tests}`.
- *Codex side:* Codex's project-local skill discovery is via `.agents/skills/<name>/SKILL.md` per `codex/CLAUDE.md` references; the global plugin system is at `~/.codex/plugins/`. Codex does NOT auto-discover `.claude/skills/` — these are Claude-format skills.
- **This is a category mismatch, not a happy-cli gap.** happy-cli shouldn't try to convert `.claude/skills/` into codex-native skills on-the-fly — that's the `3a-skills` ralph job's territory (currently paused; see `plans/codexu-roadmap.md` line 180-188).

**Proposed fix site.** None at the happy-cli layer. **Document the category mismatch** so future audits don't flag it as a happy-cli bug. The actual cross-format port is tracked elsewhere (Phase 3a `3a-skills` ralph job — paused 2026-05-13 pending prerequisite re-establishment).

**Effort.** Small (~30 min) — just document the mismatch in `packages/happy-cli/CLAUDE.md` "Codex Agent Feature Parity" section.

**Severity.** Low. Not a happy-cli issue; the operator already has Phase 3a as the workstream that addresses this.

**Ralph-command shape.** None at happy-cli level. Cross-reference Phase 3a in roadmap.

---

## Gap 11 — Statusline parity

**Gap.** Claude Code exposes statusline-relevant metadata (e.g., available tools, slash commands, current model defaults) through its `system.init` SDK message, which happy-cli merges into session metadata. Codex's `NewConversationResponse` returns equivalent fields but happy-cli doesn't propagate them to session metadata as fully.

**Current state.**
- *Claude side:* `claudeRemoteLauncher.ts:395-398` → `onSDKMetadata` callback → `mergeSDKInitMetadata` writes tools-list / model-defaults / slash-command list into session metadata. UI uses this for the statusline.
- *Codex side:* `client.startThread` returns `NewConversationResponse` with `{ thread.id, model, modelProvider, cwd, approvalPolicy, sandbox, reasoningEffort }` (codexAppServerTypes.ts:35-47). `runCodex.ts:796-800` only writes `codexThreadId` into metadata. The other returned fields (model defaults, reasoningEffort) are dropped on the floor.
- *resumeExistingThread* (resumeExistingThread.ts:35-39) is even narrower — only writes `codexThreadId`.

**Proposed fix site.** (a) happy-cli. Extend the metadata-merge in both `runCodex.ts:796-800` and `resumeExistingThread.ts` to include `model`, `modelProvider`, `approvalPolicy`, `sandbox`, `reasoningEffort` — match the Claude side's `mergeSDKInitMetadata` semantics where applicable. Discover what additional metadata fields the codex `initialize` RPC returns (server capabilities, available tools) and propagate those too.

**Effort.** Quick (~45 min) if the wire surface is sufficient. Small (~2h) if a discovery RPC for tools-list is needed.

**Severity.** Low. Statusline is cosmetic; users mostly don't notice the difference.

**Ralph-command shape.**
> `codex-statusline-parity — propagate codex thread metadata to session metadata`
> Extend metadata-merge in `runCodex.ts:796-800` and `resumeExistingThread.ts` to write `model`, `modelProvider`, `approvalPolicy`, `sandbox`, `reasoningEffort` from `NewConversationResponse` / `ResumeConversationResponse`. Acceptance: a fresh codex session shows the resolved model + reasoningEffort in the statusline (same visual treatment as Claude); resumed sessions show the same.

---

## Gap 12 — SDK init-metadata mirror (tools list, slash-command list)

**Gap.** Closely related to Gap 11 but specifically about the tool/slash-command catalog. Claude's `system.init` includes `tools[]` and `slash_commands[]`; codex's `initialize` / `newConversation` returns model defaults but not an enumerated tools-list.

**Current state.**
- *Claude side:* `system.init` → `mergeSDKInitMetadata` writes tools + slash-commands into session metadata; app uses for autocomplete/preview.
- *Codex side:* Tools list comes from the `mcpServers` object handed at startThread AND from codex's built-in tool set; there's no equivalent of `system.init.tools[]`. Slash-commands on codex are owned by codex-core's plugin loader; happy-cli has no enumeration path.

**Proposed fix site.** (a) happy-cli. Synthesize a `tools[]` from the resolved `mcpServers` object (the keys + a hardcoded list of built-in codex tools like `shell`, `apply_patch`). Slash-command enumeration likely requires a codex JSON-RPC RPC if one exists — defer until codex exposes it.

**Effort.** Small (~2h).

**Severity.** Low. Same family as Gap 11 — cosmetic until UX features actively read it.

**Ralph-command shape.**
> `codex-init-metadata-mirror — synthesize tools[] for codex sessions`
> In `runCodex.ts` after `client.startThread`, synthesize a `tools[]` metadata field from the resolved `mcpServers` keys plus a hardcoded list of codex built-ins (`shell`, `apply_patch`, `update_plan` if exposed, etc.). Defer slash-commands until codex exposes an enumeration RPC. Acceptance: a fresh codex session's metadata includes a `tools[]` field with at least `happy` (the bridge) plus codex built-ins.

---

## Summary

12 gaps surveyed. Severity breakdown: 3 High (Gaps 1, 2, 3), 4 Medium (4, 5, 6, 7), 5 Low (8, 9, 10, 11, 12). Effort total: ~25–40 hours if all are fixed in sequence; most can be parallelized (almost all are isolated to `runCodex.ts`).

All proposed fix sites are **on the happy-cli side** with two exceptions:
- Gap 6 (plan mode) has a v2 overlay-crate option deferred behind a v1 defensive mapping.
- Gap 4 (hook parity) has a residual codex-internal-compaction signal that may eventually require an overlay-crate listener.

**No upstream-canonical codex edits are proposed by this audit** — every gap either has a happy-cli fix, an overlay-crate option, or is a category mismatch (Gap 10) that belongs to a separate workstream.

## Recommended next ralph commands

In order of recommended landing:

1. **Gap 1 — `mcp-discovery`** — already tracked in `plans/parallel-assignments.md`. Ship first; clears the known accidental discovery.
2. **Gap 2 — `codex-claude-md-autoload`** — quick + high severity. Should be a separate small PR because it touches `NewConversationParams.config` which `mcp-discovery` doesn't.
3. **Gap 3 — `codex-attachments`** — high severity, contained to `MessageQueue2` plumb + `sendTurnAndWait` synthesis. The wire spike confirmed both data URL and local-file image inputs are accepted.
4. **Gap 7 — `codex-system-prompts`** — medium severity, small effort, similar shape to Gap 2 (`NewConversationParams.baseInstructions`).
5. **Gap 4 — `codex-hooks-parity`** — medium, larger; sequence after Gaps 1-3 land so the codex path is otherwise feature-complete.
6. **Gap 5 — `codex-slash-commands`** — depends on Gap 4's auto-compact emission.
7. **Gap 6 — `codex-plan-mode-defensive`** — defensive only; v2 overlay deferred.
8. Gaps 8, 9, 11, 12 are all small and can land in a single polish PR if desired.
9. Gap 10 is docs-only; bundle with whichever PR rewrites `packages/happy-cli/CLAUDE.md` next.

**Cross-cutting verification.** Completed by the [Wire spike results](#wire-spike-results-2026-05-13-codex-cli-01250-copilot-api8) against a real `codex app-server` build.

---

## Open questions surfaced by this audit

1. **CLAUDE.md vs AGENTS.md precedence on codex** — source and wire evidence show `project_doc_fallback_filenames` can recover CLAUDE-only projects but cannot make same-directory `CLAUDE.md` beat `AGENTS.md`. See Gap 2 and [Wire spike results](#wire-spike-results-2026-05-13-codex-cli-01250-copilot-api8), §2.
2. **Plan mode parity strategy** — is the defensive `read-only` mapping acceptable for v1, or does the operator want a v2 overlay-crate immediately? See Gap 6.
3. **Deferred-switch protocol for codex** — orthogonal to this audit but adjacent to Gap 4. Tracked in `.ralph/jobs/preserve-turn-on-mode-switch/plan.md` under the Codex open question.
4. **Skill-format port direction** — Gap 10 is a category mismatch, not a happy-cli bug. Phase 3a's eventual scope (port Claude skills → codex plugin format, or vice versa, or both) is the right place for this. Mentioned here only so future audits don't re-flag.

---

## Wire spike results (2026-05-13, codex-cli 0.125.0-copilot-api.8)

Harness: `tasks/spikes/codex-wire-spike.mjs` against a real `codex app-server` over JSON-RPC stdio. `.gitignore` decision: left unchanged because `tasks/` is not ignored in this worktree; the spike harness is committed directly.

### §1 Image input - Gap 3

Request payloads:

```json
[
  {
    "variant": "data-url",
    "input": [
      {
        "type": "text",
        "text": "This is an image transport probe. If the attached image is visible and predominantly red, reply exactly IMAGE_ACCEPTED_RED_CANARY. If no image is visible, reply exactly NO IMAGE RECEIVED."
      },
      {
        "type": "image",
        "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAMElEQVR4nO3OIQEAAAgDMGIg6Z+JLhDjZmJ+tT2XVAICAgICAgICAgICAgICAunAA9mpTHl4No2FAAAAAElFTkSuQmCC"
      }
    ]
  },
  {
    "variant": "local-file",
    "input": [
      {
        "type": "text",
        "text": "This is an image transport probe. If the attached image is visible and predominantly red, reply exactly IMAGE_ACCEPTED_RED_CANARY. If no image is visible, reply exactly NO IMAGE RECEIVED."
      },
      {
        "type": "localImage",
        "path": "C:\\Users\\evmitran\\AppData\\Local\\Temp\\codex-wire-spike-99rB4d\\q1-local-file\\q1-red-canary.png"
      }
    ]
  }
]
```

Response/notification evidence:

```json
[
  {
    "variant": "data-url",
    "eventMethods": ["turn/started", "item/completed", "item/completed", "item/agentMessage/delta", "item/completed", "turn/completed"],
    "verdict": {
      "status": "accepted",
      "content": "IMAGE_ACCEPTED_RED_CANARY"
    }
  },
  {
    "variant": "local-file",
    "eventMethods": ["turn/started", "item/completed", "item/completed", "item/agentMessage/delta", "item/completed", "turn/completed"],
    "verdict": {
      "status": "accepted",
      "content": "IMAGE_ACCEPTED_RED_CANARY"
    }
  }
]
```

**Verdict:** Codex accepts both `{ "type": "image", "url": "data:image/png;base64,..." }` and `{ "type": "localImage", "path": "..." }` inputs.

Implication for Gap 3: `codex-attachments` can synthesize data URL image `InputItem`s directly, keeping tmp-file local images as a fallback rather than a prerequisite.

### §2 `project_doc_fallback_filenames` - Gap 2

Request payloads:

```json
[
  {
    "id": "3a",
    "title": "CLAUDE-only with project_doc_fallback_filenames",
    "request": {
      "config": {
        "project_doc_fallback_filenames": ["CLAUDE.md"]
      },
      "ephemeral": true,
      "sessionStartSource": "startup",
      "threadSource": "local"
    }
  },
  {
    "id": "3b",
    "title": "CLAUDE-only without project_doc_fallback_filenames",
    "request": {
      "config": null,
      "ephemeral": true,
      "sessionStartSource": "startup",
      "threadSource": "local"
    }
  },
  {
    "id": "3c",
    "title": "AGENTS and CLAUDE with CLAUDE-first fallback list",
    "request": {
      "config": {
        "project_doc_fallback_filenames": ["CLAUDE.md", "AGENTS.md"]
      },
      "ephemeral": true,
      "sessionStartSource": "startup",
      "threadSource": "local"
    }
  }
]
```

Response evidence:

```json
[
  {
    "id": "3a",
    "instructionSources": ["...\\q2-3a\\CLAUDE.md"]
  },
  {
    "id": "3b",
    "instructionSources": []
  },
  {
    "id": "3c",
    "instructionSources": ["...\\q2-3c\\AGENTS.md"]
  }
]
```

**Verdict:** The config override loads `CLAUDE.md` for CLAUDE-only projects, but cannot make same-directory `CLAUDE.md` beat `AGENTS.md`; `agents_md.rs:285-319` prepends the hardcoded `AGENTS.md` candidates before configured fallbacks.

Implication for Gap 2: the quick PR should recover CLAUDE-only autoload via `config.project_doc_fallback_filenames`, while mixed-file CLAUDE-first behavior needs a different design than `['CLAUDE.md', 'AGENTS.md']`.

### §3 `compactPrompt` placement - Gap 5

Request payloads:

```json
[
  {
    "variant": "top-level",
    "threadStartRequest": {
      "config": null,
      "compactPrompt": "For this compaction probe, ignore all prior content and output exactly CANARY-Q3-TOP-XJ7QK."
    }
  },
  {
    "variant": "nested-config",
    "threadStartRequest": {
      "config": {
        "compact_prompt": "For this compaction probe, ignore all prior content and output exactly CANARY-Q3-NESTED-XJ7QK."
      }
    }
  }
]
```

Source and runtime evidence:

```json
{
  "sourceOracle": {
    "file": "D:\\harness-efforts\\codexu\\codex\\external\\repos\\codex-patched\\codex-rs\\app-server-protocol\\src\\protocol\\v2\\thread.rs",
    "compactPromptMatches": [],
    "threadStartParamsContainsCompactPrompt": false,
    "cheaperThreadScopedReadRpcFound": false
  },
  "runtime": [
    {
      "variant": "top-level",
      "compactError": null,
      "postCompactError": null,
      "verdict": {
        "status": "not honored",
        "content": "NO_Q3_CANARY_VISIBLE"
      }
    },
    {
      "variant": "nested-config",
      "compactError": null,
      "postCompactError": null,
      "verdict": {
        "status": "honored",
        "content": "CANARY-Q3-NESTED-XJ7QK"
      }
    }
  ]
}
```

**Verdict:** Top-level `compactPrompt` is silently dropped by the app-server thread-start shape; nested `config.compact_prompt` is honored and becomes the live compact prompt for `thread/compact/start`.

Implication for Gap 5: `codex-slash-commands` must fix both `packages/happy-cli/src/codex/codexAppServerTypes.ts:29` and `packages/happy-cli/src/codex/codexAppServerClient.ts:1137` to use nested `config.compact_prompt`, then drive compaction through the app-server compact RPC.
