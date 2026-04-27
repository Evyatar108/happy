# Brainstorm synthesis: Codex fork-extension strategy for happy

Lenses: ran=[devils-advocate, codex, copilot]; skipped=[]

## Problem framing (cross-lens)

All three lenses converged on the same finding: **the framing "what's the highest-leverage *additional* fork patch" smuggles in an unexamined premise — that another fork patch is warranted at all.** The Copilot routing patch was justified by a hard networking constraint stock Codex could not satisfy. None of the proposed fork-only capabilities (new hook events, remote approval transport, rollout backend, slash commands, new WireApi providers, TUI socket) clear that bar — every one of them has a stock-Codex-shaped or out-of-process workaround via MCP servers, the plugin manifest, command-backed auth, profiles, or external `codex app-server` JSON-RPC consumers.

Devil's Advocate flagged this as a **red-flag premise**, surfacing two underweighted data points:

1. The previous brainstorm produced the TUI-socket joint-control idea and **it was never shipped**. Adding a five-patch bundle to a backlog that already holds one un-shipped fork idea will not produce a five-patch fork — it will produce a six-item un-shipped backlog.
2. **Rebase decay across the proposed patch surfaces is unmeasured.** None of the proposed files (`hooks/registry.rs`, `protocol/protocol.rs`, `recorder.rs`, `slash_command.rs`, `model-provider-info/lib.rs`) has had its upstream churn rate counted. A 30-minute `git log --oneline -- <file>` audit on each would either qualify or kill the bundle before any code is written.

A second consensus point: happy already has substantial Codex leverage from stock surfaces — `happyMcpStdioBridge.ts` already exists, `codexAppServerClient.ts` speaks the protocol directly, `CodexPermissionHandler` routes approvals, and `codexThreadId` resume works. The user is closer to a zero-fork solution than they may realize.

## Candidate directions

### D-001: Zero-fork happy-codex bridge — stock plugin + side-by-side TS/Node app-server consumer
- Contributing lenses: [devils-advocate, codex, copilot]
- Why this might work: Treat the fork as frozen at "Copilot routing only." Move every happy-specific capability into the stock extension surface: bundle as a plugin via the stock manifest (`core-plugins/src/manifest.rs:13`) carrying MCP servers + skills + apps; use command-backed auth (`login/src/auth/external_bearer.rs:30`) for any bearer concerns; let happy-cli's existing `codexAppServerClient.ts` continue to consume the protocol directly. Remote approval, rollout fan-out, custom commands, telemetry — all expressible as either an MCP server, a hook shell-out (one of stock's 6 events), or an external app-server JSON-RPC consumer. Result: stock `@openai/codex` users and `@gim-home/codex` users get identical happy UX, distribution fragmentation evaporates, rebase tax stays flat.
- Risks / friction: Risk that the bridge feels like "setup glue" rather than a compelling product improvement — adoption depends on it removing daily friction, not just being clever architecture. Some happy capabilities may legitimately need lifecycle visibility stock can't expose (e.g. `OnApprovalDenied`, `OnContextCompact`); those become genuine fork-patch candidates *only after* the bridge has been built and the gap has been measured against real workflows.
- Cheapest validation: Build one concrete bridge artifact — e.g. `happy-bridge` plugin: an MCP server that proxies tool-approval prompts to happy-server over WebSocket, plus a SessionStart hook that registers the device, plus a skill bundle. Ship against stock `@openai/codex`. Dogfood three concrete workflows (start from happy, resume context, use happy-side tools without touching the fork). Days to ~1 week.
- Disconfirming observation: A bridge prototype hits a must-have happy capability that genuinely cannot be expressed as MCP tools, current app-server callbacks, or one of the 6 stock hook events — and the missing piece is clearly inside a closed Codex enum (e.g. closed approval-event types, closed lifecycle enum). At that point one specific fork patch becomes justified by demonstrated need rather than speculation.

### D-002: Single targeted fork patch — happy remote approval reviewer transport
- Contributing lenses: [codex, copilot]
- Why this might work: Approval prompts are the most frequent moments where a remote viewer in happy could materially help — approve/deny tool calls from mobile during long-running Codex turns. The patch is contained: extend `AskForApproval` enum (`protocol/src/protocol.rs:939`) and `app-server/src/codex_message_processor.rs` with a "remote reviewer" transport variant; happy-cli adds the matching client glue. Smallest defensible fork patch with a clear user story.
- Risks / friction: If approvals rarely happen in target happy workflows, the value is theoretical. Mobile approval may be *slower* than just typing 'y' in the terminal — the user must believe remote approval is faster, safer, or unlocks mobility. Distribution split: only `@gim-home/codex` users get the feature. Could happy treat this as "premium fork-only superpower" without fragmenting the install story?
- Cheapest validation: Patch only the approval transport plus one new event variant for `OnApprovalDenied`. Test one narrow flow where happy on mobile approves/denies real tool calls during an active Codex session. ~1 week. Measure: how often during a typical session does approval actually fire, and does mobile approve win on speed or just on mobility?
- Disconfirming observation: Real-session telemetry shows users almost never hit approval prompts in a typical happy workflow, OR mobile approval is consistently slower than terminal approval in side-by-side dogfooding.

### D-003: Platform-shaped fork bundle — lifecycle events + rollout fan-out for cross-device continuity
- Contributing lenses: [codex, copilot]
- Why this might work: The biggest *new* capability the fork could deliver is true cross-device continuity — start a Codex session on the laptop, hand off to mobile, resume on a different machine — with happy-server as canonical thread store. Requires multiple coordinated patches: new lifecycle hook events (`hooks/src/types.rs`, `hooks/src/registry.rs`), rollout fan-out (`rollout/src/recorder.rs`) so events stream to happy-server in real time, app-server protocol additions, plus a `/happy-resume` slash command. Closest to the original "fork as platform" framing.
- Risks / friction: XL effort touching Codex's highest-decay internals. Rebase pain compounds across five separate Rust files. Distribution fragmentation is unavoidable. Mental-model risk: cross-device handoff may simply not be a top-5 user pain — it's an attractive architecture idea more than a measured user request. happy can already infer significant state from existing `turn/started`, `turn/completed`, `thread/status/changed`, MCP/tool events, and stored `codexThreadId` — adding rollout fan-out may not unlock a materially new experience.
- Cheapest validation: Smallest end-to-end slice — mirror rollout data into happy-server and add one fork-only `/happy-resume` flow that reopens a live thread on another client. If users repeatedly resume on a different device after this lands, the bigger bundle is justified.
- Disconfirming observation: Most real happy usage is single-device, OR existing JSONL session artifacts plus stock resume cover 90%+ of "I want to come back to this" cases. If true, the bundle is over-engineered.

### D-004: Single meta-extension `Generic` hook variant (one patch, infinite future extensibility)
- Contributing lenses: [devils-advocate]
- Why this might work: If a fork patch must happen at all, the only defensible shape is a single meta-patch: add one `Generic { name: String, payload: Value }` hook variant to `hooks/src/registry.rs:33` plus a single emission point that fires it from configurable lifecycle locations. Converts the closed-enum problem into an open-string problem. Future happy needs (`BeforeRollout`, `OnApprovalDenied`, `OnContextCompact`, `OnNetworkRequest`, `OnTurnInterrupted`) require zero additional fork patches — only stock-config changes. One file touched, one source of rebase decay, infinite extensibility — and probably the easiest upstream PR to attempt before forking permanently.
- Risks / friction: Almost certainly not accepted upstream (it dilutes a typed event system into a stringly-typed escape hatch); means permanent fork maintenance even if minimal. Each `Generic` event needs a config-defined emission point, which itself touches more files. The "infinite extensibility" promise depends on emission points being reachable from config, which may not be true in practice.
- Cheapest validation: Audit upstream churn on `hooks/src/registry.rs` first. If churn is low, write the patch in an afternoon, propose upstream, fork-maintain only if rejected.
- Disconfirming observation: Adding a `Generic` event still requires per-event emission-point patches, defeating the "one patch" promise. Or upstream rejects it and the maintenance cost matches a five-patch bundle anyway.

## Recommendation

**D-001** is the recommended direction. All three lenses converge with high force: the existing happy stack already has most of the integration glue (`codexAppServerClient.ts`, `happyMcpStdioBridge.ts`, `CodexPermissionHandler`), stock Codex's extension surface is far broader than the fuzzy idea assumed, and the previous brainstorm's un-shipped TUI-socket idea is direct evidence that adding fork patches without first exhausting the stock surface is a backlog-creation pattern, not a delivery pattern.

D-002 and D-003 are not killed by this — they should be re-evaluated *only after* D-001's bridge prototype identifies a specific stock-impossible capability with a real user story. Until then, the rebase tax has no measured value behind it.

D-004 is a sensible compromise *if* the bridge prototype reveals a genuine need but the user wants to minimize Rust surface — it's the cheapest defensible fork patch shape if a patch must happen.

Mandatory pre-work for any fork-patch direction (D-002, D-003, D-004): `git log --oneline -- <file>` for each proposed patch surface in upstream `openai/codex` over the last 6 months. Without those numbers, the rebase-tax argument is unfalsifiable.
