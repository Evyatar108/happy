# Synthetic XML Tags Future Coverage

This document records the Claude Code synthetic XML tag survey conducted for the `task-notification` pill implementation. It is the stable reference for extending `processClaudeMetaTags(...)` in future work.

- Current shipped handling in Happy:
  - `<task-notification>` renders as a clickable pill with a detail modal.
  - `<system-reminder>` is stripped before markdown render/copy.
  - `<fork-boilerplate>` is stripped before markdown render/copy.
  - **Skill-body injection** (post-`Skill` tool — NOT an XML tag, plain `role:"user"` text on the wire). Detected by prefix and suppressed at BOTH `UserTextBlock` and `AgentTextBlock`. The wire role is `user` but Happy's `typesRaw.ts` normalizer routes most non-string-content user messages through the agent-text path, so the agent-text guard is the one that fires; the user-text guard is a defensive backstop. See `packages/happy-app/sources/components/markdown/skillBody.ts` and the "Claude Code injections that are NOT XML tags" section in `docs/fork-notes.md`.

Use this doc as the stable link target from [fork-notes.md](../fork-notes.md).

---

## Claude Code Synthetic XML Tag Survey

*Source: investigation of `claude-code` worktree on 2026-04-26.*

The Claude Code harness emits several synthetic XML tag families into the conversation stream. This survey lists each one, where it is constructed, whether it actually reaches a chat-client transcript (Happy), and the recommended treatment in Happy's preprocessor.

---

### Tags that DO reach the chat transcript

#### `<task-notification>` *(shipped in this PR; parser hardened 2026-04-29)*

- **Constructed in:** `claude-code/src/utils/task/framework.ts:274-290` (`enqueueTaskNotification()`), plus other Claude Code emitters that re-use the same wrapper (Monitor tool, bash-hook background-task, remote-review re-wrap).
- **Original schema (Task framework):** `<task-id>` → optional `<tool-use-id>` → `<task-type>` → `<output-file>` → `<status>` → `<summary>`.
- **Observed variants in the wild:**
  - **Bash-hook background-task** (Claude Code on Windows): drops `<task-type>` — `<task-id>`, `<tool-use-id>`, `<output-file>`, `<status>`, `<summary>`.
  - **Monitor tool events** (re-arm heartbeats and other long-running monitor pings): only `<task-id>` + `<summary>`, plus a free-form `<event>` inner tag carrying the heartbeat text — no `<task-type>`, no `<output-file>`, no `<status>`.
- **Stable contract for Happy's parser:** **only `<task-id>` and `<summary>` are required.** Every other recognized inner tag (`<tool-use-id>`, `<task-type>`, `<output-file>`, `<status>`) is optional, and unknown inner tags such as `<event>` are tolerated silently (they get dropped from the typed chip data, but the chip still renders). New emitters that add inner tags are non-breaking by default. See `parseTaskNotification(...)` in `packages/happy-app/sources/components/markdown/processClaudeMetaTags.ts`.
- **Status enum** (`claude-code/src/Task.ts:15-20`): `'pending' | 'running' | 'completed' | 'failed' | 'killed'`. When `<status>` is absent (Monitor variant) the pill renders an `information-circle-outline` glyph and the detail modal hides the status row; otherwise unknown status strings fall through to the hourglass-pending icon.
- **Escaping:** none — values inserted raw.
- **Atomic:** yes — full block constructed before enqueue, never split across streaming chunks.
- **Treatment in Happy:** pill render (icon + summary) opening a custom modal with copyable id / output-file rows. Detail-modal rows are conditional: only fields actually present in the source XML are surfaced.
- **When to revisit this doc:** if a future emitter introduces a brand-new inner tag that should be user-visible (e.g. surfacing the Monitor-variant `<event>` text inside the modal). The parser already tolerates unknown tags, but adding a typed field requires a one-line entry in `KNOWN_TAG_NAMES` plus the consumer plumbing.

#### `<system-reminder>` *(shipped in this PR)*

- **Constructed in:** Multiple sites — `claude-code/src/cli/print.ts` (SHUTDOWN_TEAM_PROMPT), `claude-code/src/commands/brief.ts:114-118`, `claude-code/src/memdir/memoryAge.ts` (`wrapInSystemReminder` utility), and several prompt constants in `claude-code/src/constants/prompts.ts`.
- **Schema:** plain text wrapper — `<system-reminder>...</system-reminder>`. No inner tags, no attributes.
- **Visibility:** Claude Code's own UI strips leading `<system-reminder>` blocks before render (`claude-code/src/components/messageActions.tsx:~275`, `stripSystemNotifications`). They DO appear in the raw conversation stream that Happy receives.
- **Treatment in Happy:** strip the wrapper before further preprocessing. Contents are operational metadata aimed at Claude, not the user.

#### `<fork-boilerplate>` *(shipped in this PR)*

- **Constant:** `claude-code/src/constants/xml.ts:63`.
- **Constructed in:** `claude-code/src/tools/AgentTool/forkSubagent.ts:172-197` (`buildChildMessage()`).
- **Detected in:** `claude-code/src/tools/AgentTool/forkSubagent.ts:78-88` (`isInForkChild()`).
- **Schema:** wrapper around a 10-rule boilerplate plus a `Your directive: ...` line. No inner XML.
- **Mode-gated:** only emitted when the fork subagent feature is on (Agent tool invocation without `subagent_type`).
- **Treatment in Happy:** strip the wrapper. The 10-rule boilerplate is scaffolding aimed at the fork child; the directive line survives the strip as plain text.

#### `<teammate-message>` *(deferred to its own future brief)*

- **Constant:** `claude-code/src/constants/xml.ts:52`.
- **Constructed in:** `claude-code/src/utils/teammateMailbox.ts:373-389` (`formatTeammateMessages()`).
- **Emission sites:** `claude-code/src/hooks/useInboxPoller.ts:810-820`, `:917-924`.
- **Rendered in:** `claude-code/src/components/messages/UserTeammateMessage.tsx`.
- **Schema:** `<teammate-message teammate_id="..." color="..." summary="...">content</teammate-message>`. Required: `teammate_id`. Optional: `color`, `summary`. Content is plain text or JSON (nested message types: permission requests, shutdown notifications).
- **Mode-gated:** swarm mode only (multi-agent collaboration).
- **Recommended treatment in Happy:** structured render — inline card with teammate name/color/summary, expandable detail. Nested content types need their own UI.
- **Reason for deferral:** substantial feature comparable in size to `<task-notification>`. Belongs in its own brief.

---

### Tags that DO NOT reach the chat transcript

#### `<remote-review>`

- **Constant:** `claude-code/src/constants/xml.ts:45`.
- **Extracted in:** `claude-code/src/tasks/RemoteAgentTask/RemoteAgentTask.tsx:254-283` (`extractReviewFromLog`), `:295-319`.
- **Notification path:** re-wrapped in a `<task-notification>` block before enqueue. The raw `<remote-review>` tag is a remote-session log artifact and never appears in the user's conversation transcript.
- **Treatment:** none required (covered transitively by `<task-notification>`).

#### `<remote-review-progress>`

- **Constant:** `claude-code/src/constants/xml.ts:49`.
- **Parsed in:** `claude-code/src/tasks/RemoteAgentTask/RemoteAgentTask.tsx:629-656` (poll heartbeat — JSON inside the tag drives a UI pill badge).
- **Visibility:** local poller only; never submitted to the conversation stream.
- **Treatment:** none required.

#### `<ultraplan>`

- **Constant:** `claude-code/src/constants/xml.ts:41`.
- **Extracted in:** `claude-code/src/tasks/RemoteAgentTask/RemoteAgentTask.tsx:208-218` (`extractPlanFromLog`).
- **Failure path:** re-wrapped in `<task-notification>`. Successful plans are stored in `RemoteAgentTaskState.ultraplanPhase` and surfaced via the browser approval UI, never submitted to the transcript.
- **Treatment:** none required.

#### `<channel-message>`

- **Constant:** `claude-code/src/constants/xml.ts:55-56`.
- **Status:** dead code — defined but never constructed or emitted.
- **Treatment:** none required.

#### `<cross-session-message>`

- **Constant:** `claude-code/src/constants/xml.ts:59`.
- **Status:** dead code — defined but never constructed or emitted.
- **Treatment:** none required.

---

### Decision summary

| Tag | In this PR? | Treatment |
|---|---|---|
| `<task-notification>` | Yes | Pill + modal |
| `<system-reminder>` | Yes | Strip |
| `<fork-boilerplate>` | Yes | Strip |
| `<teammate-message>` | **Deferred** | Future brief — structured render is its own feature |
| `<remote-review>`, `<remote-review-progress>`, `<ultraplan>` | No | Never reach transcript |
| `<channel-message>`, `<cross-session-message>` | No | Dead code |

The two new strips ride along on top of the architecture this PR introduces (structured preprocessor return + `KNOWN_TAG_NAMES` widening) at marginal cost — each is a thin wrapper over `stripWellFormedWrapper(...)` alongside `stripLocalCommandCaveats`, `stripSystemReminders`, `stripForkBoilerplate` in `processClaudeMetaTags.ts`.
