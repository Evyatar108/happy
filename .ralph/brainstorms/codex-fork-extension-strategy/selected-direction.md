## Direction
D-001 — Zero-fork happy-codex bridge — stock plugin + side-by-side TS/Node app-server consumer. Treat the gim-home/codex fork as frozen at "Copilot routing only" and deliver every happy-specific capability through stock Codex extension surfaces (plugin manifest, MCP servers, the 6 stock hook events, command-backed auth, external `codex app-server` JSON-RPC consumption).

## Goal
A `happy-bridge` artifact that runs against stock `@openai/codex` and delivers happy's core integration value (remote visibility, approval routing, device handoff cues, happy-side tooling) without requiring any new patches in the gim-home/codex fork. Identical UX for stock and fork users; flat rebase tax; concrete evidence (or refutation) that future fork patches are even needed.

## Scope

### In Scope
- A single `happy-bridge` deliverable composed of the stock-Codex extension surface, packaged as a Codex plugin (skills + MCP server(s)) per `core-plugins/src/manifest.rs:13`.
- An MCP server that proxies tool-approval prompts to happy-server over WebSocket, so a remote happy client can see and respond to approvals.
- A `SessionStart` hook (one of the 6 stock events at `hooks/src/registry.rs:33`) that registers the device and bootstraps the bridge for a session.
- Reuse of happy's existing `codexAppServerClient.ts` and `happyMcpStdioBridge.ts` rather than parallel infrastructure.
- Verification that command-backed auth (`login/src/auth/external_bearer.rs:30`) covers any bearer concerns the bridge raises.
- Three concrete dogfood workflows: (1) start a Codex session from happy, (2) resume context across sessions, (3) use happy-side tools without touching the fork.
- An explicit gap log: every must-have happy capability the bridge cannot express via stock surfaces gets recorded with the specific closed enum / lifecycle blind spot it would need.

### Out of Scope
- Any new fork patch in `gim-home/codex` (`hooks/registry.rs`, `protocol/protocol.rs`, `recorder.rs`, `slash_command.rs`, `model-provider-info/lib.rs`). These remain explicitly off-limits for D-001.
- The TUI socket exposure / joint local+remote control idea from the prior brainstorm (`codex-joint-local-remote-control`).
- Cross-device session continuity beyond what stock resume + `codexThreadId` already deliver.
- Custom slash commands (`/happy-resume`, etc.) — TUI slash enum is closed; deferred.
- Distribution work to detect `@gim-home/codex` vs `@openai/codex` — the bridge runs on either.

## Criteria
- happy-bridge plugin builds, installs, and runs against stock `@openai/codex` on Windows x64 without any modifications to the fork.
- Three dogfood workflows complete end-to-end: start-from-happy, resume-context, happy-side-tools — each with a recorded video/transcript proving stock Codex covers the workflow.
- Gap log lists every happy capability the bridge could not deliver via stock surfaces, with each gap pinned to a specific closed enum or unexposed lifecycle event in `codex-rs`. The log is the input that retroactively justifies (or doesn't) D-002 / D-003 / D-004.
- Pre-work artifact: `git log --oneline -- <file>` counts over the last 6 months for `hooks/registry.rs`, `protocol/protocol.rs`, `recorder.rs`, `slash_command.rs`, `model-provider-info/src/lib.rs` in upstream `openai/codex`. This data lives in the brainstorm directory and gates any future fork-patch decision.
- A short user-facing decision document explains why future fork patches will be evaluated against the gap log + churn data, not against architectural appeal.

## Context

### Brainstorm synthesis highlights
- All three lenses (devils-advocate, codex, copilot) converged on D-001. Devil's Advocate flagged the fork-extension framing as a red-flag premise.
- The Copilot routing patch was justified by a hard networking constraint stock Codex could not satisfy. None of the candidate fork-only capabilities (new hook events, remote approval transport, rollout backend, new slash commands, new WireApi providers, TUI socket) clear that bar — every one has a stock workaround via MCP / plugin manifest / hook shell-out / external app-server consumer.
- happy already has substantial Codex integration leverage from stock: `packages/happy-cli/src/codex/codexAppServerClient.ts`, `packages/happy-cli/src/codex/happyMcpStdioBridge.ts`, `packages/happy-cli/src/codex/utils/permissionHandler.ts`, and the resume/`codexThreadId` flow are all in place.

### Disconfirming observations to watch for
- A bridge prototype hits a must-have happy capability that genuinely cannot be expressed as MCP tools, current app-server callbacks, or one of the 6 stock hook events — *and* the missing piece is clearly inside a closed Codex enum (e.g., closed approval-event types, closed lifecycle enum). At that point one specific fork patch becomes justified by demonstrated need rather than speculation. The gap log is the trigger.
- Real-session telemetry shows users almost never hit approval prompts, OR mobile approval is consistently slower than terminal approval — would reduce D-002's expected value.
- Cross-device session handoff turns out not to be a top-5 user pain — would reduce D-003's expected value.

### Open questions to carry forward
- What concrete happy user-visible capability genuinely cannot be implemented via stock plugin / MCP / hook shell-out / external app-server consumer? (The gap log answers this empirically.)
- What is the measured upstream churn rate for the proposed patch surfaces? (Pre-work answers this — required before any fork-patch decision.)
- Why did the previous brainstorm's TUI-socket idea not ship? What changes structurally to ensure D-001 ships when D-003 of the prior brainstorm did not?
- Is happy already inferring most lifecycle signals it cares about from existing `turn/started`, `turn/completed`, `thread/status/changed`, MCP/tool events, and stored `codexThreadId`?

### Reference files in happy
- `packages/happy-cli/src/codex/codexAppServerClient.ts`
- `packages/happy-cli/src/codex/codexAppServerTypes.ts`
- `packages/happy-cli/src/codex/runCodex.ts`
- `packages/happy-cli/src/codex/happyMcpStdioBridge.ts`
- `packages/happy-cli/src/codex/utils/permissionHandler.ts`
- `packages/happy-cli/src/codex/utils/sessionProtocolMapper.ts`
- `packages/happy-cli/bin/happy-mcp.mjs`
- `packages/happy-cli/CLAUDE.md`

### Reference files in stock Codex (for the bridge to consume)
- `core-plugins/src/manifest.rs:13` — plugin manifest schema
- `hooks/src/registry.rs:33` — 6 stock hook events
- `config/src/mcp_types.rs:53` — MCP server config
- `login/src/auth/external_bearer.rs:30` — command-backed auth pattern
- `protocol/src/protocol.rs:939` — `AskForApproval` enum (read-only for D-001)

### Documentation to update
- `packages/happy-cli/CLAUDE.md` — note the bridge artifact and how happy integrates with stock Codex.
- New: `docs/plans/codex-fork-extension-strategy.md` — full synthesis + gap log + churn data + future-patch decision rules. Lives outside the brainstorm directory once planning starts.
