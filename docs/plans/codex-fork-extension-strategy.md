# Codex fork-extension strategy & roadmap

*Strategic reference doc. Not a plan. Captures direction, sequencing, and patterns for evolving happy's Codex integration over time. Update as work lands or as new evidence comes in.*

> **Status:** living doc. First captured 2026-04-26 from a brainstorm + plan-with-ralph session. Brainstorm artifacts under `.ralph/brainstorms/codex-fork-extension-strategy/`.

> **Companion doc:** `docs/plans/codex-app-server-migration.md` (current Codex integration architecture).

---

## Why this doc exists

happy's Codex integration is in flux. We have:
- A working `happy codex` wrapper (`packages/happy-cli/src/codex/`) that consumes `codex app-server` via JSON-RPC.
- A user-maintained Codex fork at `D:/harness-efforts/codex` (`gim-home/codex`) that ships Copilot routing patches with an established Windows tarball + GitHub Packages release pipeline.
- Several open ideas — bridge as a stock plugin, joint local+remote control, structured rewind, cross-device handoff — that have circulated and not yet shipped.

This doc records the strategic shape of where we want Codex-in-happy to go, what each candidate effort actually buys, and the ordering that maximizes user value while preserving fork-leverage as a future option. It exists so the next person picking this up doesn't relitigate the same questions.

---

## Today: what works, what doesn't

### What works in `happy codex` already
- `codexAppServerClient.ts` speaks JSON-RPC to `codex app-server` (>= 0.100). Lifecycle, threads, turns, interrupts.
- `runCodex.ts:521` starts a session-scoped Happy MCP HTTP server and injects it into Codex via the `mcpServers` config passed to `client.startThread()`.
- `CodexPermissionHandler` routes exec/patch/MCP approvals to mobile via `session.updateAgentState()` + `rpcHandlerManager.permission` RPC. Mobile shows them in `PermissionFooter.tsx`.
- `sessionProtocolMapper.ts` converts Codex `EventMsg` to `SessionEnvelope` for mobile rendering. Tool-call envelopes carry typed `CodexBash` / `CodexPatch` payloads.
- `resumeExistingThread.ts` + `Metadata.codexThreadId` provide thread resume across happy sessions.
- Windows-specific MCP launcher fixes in `bin/happy-mcp.mjs` + `runCodex.ts`.

### What doesn't work / known gaps
| Gap | Where it lives | Notes |
|---|---|---|
| Token-level streaming | `sessionProtocolMapper.ts:241-262` drops `agent_message_delta` / `agent_reasoning_delta` | Single biggest "feels like local CLI" miss; pure happy-side TS fix |
| Rewind / Esc-Esc backtracking | `thread/rollback` and `thread/fork` exist in protocol; not wired in `codexAppServerClient.ts` | Protocol-supported; just not consumed |
| Slash command forwarding | Slash command enum is closed (`codex-rs/tui/src/slash_command.rs:12`) | TUI-only; closed-enum upstream |
| Mid-turn steering | Codex protocol does not cleanly expose `turn/steer` | Architectural; not just a wiring miss |
| Visibility into stock-Codex sessions | happy only sees sessions launched via `happy codex`, not stock `codex` / VS Code extension / CI / SSH | Coverage gap |
| Plugin/skills ecosystem participation | happy doesn't run as a Codex plugin | Composition gap |
| Type drift exposure | `codexAppServerTypes.ts` pinned to Codex 0.107.0 | Wrapper-style coupling |

---

## The three lenses

Different efforts buy different classes of value. Mixing them up has been a recurring failure mode in past brainstorms — the solution to one isn't the solution to another.

### Lens 1 — TUI parity ("render what Codex actually does, with no degradation")
The user-visible loop happy already provides for `happy codex` users. The gaps are concrete: streaming, rewind, slash-command effects. **Pure happy-side TS work.** Doesn't need a fork patch. Doesn't need a bridge. The most direct path to "feels like the local CLI on mobile."

### Lens 2 — Coverage + composition ("see Codex sessions wherever they run")
happy currently only sees `happy codex` sessions. A stock-Codex *plugin* — happy installed at `~/.codex/plugins/happy-bridge/` — opens new entry points: stock `codex`, VS Code Codex extension, Codex on SSH/devcontainers/CI, sessions composed with other Codex skills/plugins/MCP servers. **This is what the bridge is for.** It does not deliver parity wins; it delivers *reach*.

### Lens 3 — Fork-leverage ("use the fork to add capabilities stock can't")
Targeted fork patches that expand Codex's extension surface (new hook events, new approval transports, TUI socket exposure, `Generic { name, payload }` hook variant). The fork is the only place these can land. Each carries a rebase-tax cost compounded with every patched surface.

The three lenses are **largely independent**. Doing one doesn't accidentally deliver the others.

---

## What the bridge actually buys (Lens 2, isolated)

For an existing `happy codex` user who never uses any other Codex entry point: **the bridge buys very little user-visible value**. This honest framing matters — the Devil's Advocate lens flagged "fork extension framing" as a red-flag premise during brainstorming, and it stands.

What the bridge does buy, when it matters:

| Benefit | Who feels it |
|---|---|
| Stock `codex` invocations bootstrap a happy session via SessionStart hook | Users who run `codex` directly out of habit or muscle memory |
| VS Code Codex extension sessions visible on mobile | VS Code Codex users |
| Codex in remote dev container / Codespace / SSH host visible | Cloud / remote-dev users |
| Codex spawned by CI / scripts / IDE plugins observable | Ops / pipeline use cases |
| Composes with user-installed Codex skills/plugins/MCP servers | Power users with custom Codex setups |
| Audit / compliance hooks (PreToolUse, PostToolUse) for org policy | Regulated-context teams |
| Decoupled Codex CLI upgrades from happy-cli (stable plugin manifest interface) | Anyone tracking newer Codex versions than happy pins |
| Lower-friction adoption for non-happy Codex users ("install this plugin") | Codex users who'd never install a wrapper |
| Future-proofs against new Codex extension surfaces (more hook events, plugin manifest fields) | Long-term maintenance cost |
| **Gap log** — empirical decision support for any future fork patches | Anyone deciding whether to spend rebase budget |

What the bridge does **not** buy:
- TUI parity (streaming, rewind, slash effects) — orthogonal.
- Joint mid-turn co-typing with a human-driven TUI session — needs the deferred TUI socket patch.
- Slash-command parity — closed enum upstream.

---

## The fork-extension pattern

Future fork patches sort cleanly into two categories. The bridge is excellent infrastructure for one and irrelevant for the other.

### Extension-surface expansions (compose well with the bridge)
Patches that add a *new extension point* to stock Codex — a new hook event, a new approval enum variant, a new app-server RPC method, a new plugin manifest field, a new MCP transport mode. The bridge picks each one up via a few lines of new config + a small handler.

**The platonic case is `D-004: Generic { name, payload }` hook variant** — one fork patch that lets every future happy lifecycle need land as stock config rather than another fork patch. Bridge + Generic-hook is plausibly the strongest long-term shape: minimal Rust surface, infinite future extensibility, no rebase decay beyond one event registry file.

### Internal behavior changes (don't compose with anything outside the fork)
Patches that mutate how Codex does something inside its process without surfacing the change at any extension point — e.g., a different rollout backend that doesn't notify subscribers, internal context-compaction tweaks, silent rate-limiting. The bridge has no view into them; neither does any wrapper. Limiting factor is observability, not architecture.

**Heuristic for any proposed fork patch**: does it expand the extension surface, or change internal behavior? If the latter, ask whether you can re-shape it as the former (e.g. a rollout-fan-out-with-events instead of a rollout-backend-swap). Patches that resist the re-shape are the most expensive to maintain.

---

## Composability of candidate fork patches with the bridge

Cross-referenced from the brainstorm at `.ralph/brainstorms/codex-fork-extension-strategy/`. None of these are committed work — they're a menu, gated on the gap log.

| Candidate fork patch | Bridge composition | Rebase risk | Notes |
|---|---|---|---|
| **D-002: New `AskForApproval` variant** (remote approval) | Trivial — bridge detects fork, opts the variant in via plugin config; falls back to existing `permission` RPC on stock | Medium — touches `protocol/protocol.rs` | Same approval handler triggered by richer event |
| **D-003: New hook event types** (`OnApprovalDenied`, `BeforeRollout`, `OnContextCompact`, `OnTurnInterrupted`) | Trivial — hook config snippet grows | Medium — touches `hooks/registry.rs`, `hooks/types.rs`; one file per event | This is what the bridge architecture is *for* |
| **D-004: Single `Generic { name, payload }` hook variant** | Trivial — one fork patch, infinite future hook events via stock config | Low — one file (`hooks/registry.rs`) | Strongest long-term shape; probably not upstreamable |
| **TUI socket exposure** (the deferred original idea) | Easy — TUI writes a discovery file, bridge attaches as a second app-server JSON-RPC client | High — touches `tui/src/app/app_server_adapter.rs` and a Windows-safe transport layer | Bridge already speaks app-server; new connection is small |
| **New `WireApi` providers** (Anthropic-native, gRPC) | Trivial — provider routing is config-only; bridge is provider-agnostic | Medium — touches `model-provider-info/src/lib.rs` | Bridge sees provider events via the existing event stream |
| **Custom slash commands** | Partial — bridge sees *effects* of slash commands as events; can't extend the *enum* itself | Medium — touches `tui/src/slash_command.rs` | Slash dispatch is TUI-internal; bridge can't reach it |
| **Rollout backend swap to happy-server** | Depends on shape — fan-out (recorder + notifier) composes; opaque internal swap doesn't | High — touches `rollout/src/recorder.rs` (concrete, not a trait) | Re-shape as fan-out before considering |
| **In-process behavior changes that don't emit events** | Doesn't compose — limit is observability, not architecture | Varies | Avoid this shape; re-cast as extension-surface expansion if possible |

---

## Recommended sequence

If the long-term goal is **TUI parity + future fork-leverage**, the highest-leverage ordering is:

```
1. Streaming deltas + rewind wiring        (Lens 1: parity)        days–2 weeks
2. Bridge as stock-Codex plugin            (Lens 2: coverage)      ~2 weeks
3. First fork patch: D-004 Generic hook    (Lens 3: fork-leverage) afternoon, then PR upstream first
4. Subsequent fork patches as gap log      (Lens 3: targeted)      one at a time, gated on data
   surfaces real needs
```

### Why this order
- **(1) ships visible parity wins fast.** Every existing `happy codex` user feels the streaming/rewind fix immediately. No fork patch, no architecture change.
- **(2) establishes the consumer architecture and produces the gap log.** Once the bridge exists, any future fork patch composes through it. Gap log entries are populated *only* when workflows fail — empirical, not speculative.
- **(3) is the fork-leverage primitive.** A single Generic-hook patch expands the extension surface infinitely; bridge consumes via stock config thereafter. Lowest possible rebase tax for the highest possible future extensibility.
- **(4) is opportunistic** — patches land when a gap log entry crosses a value threshold, not on speculation. The bridge architecture means each one is contained, not an architectural rewrite.

### Sequencing the brainstorm's other unsold ideas
- **Joint local+remote control via TUI socket exposure** (the original brainstorm at `.ralph/brainstorms/codex-joint-local-remote-control/`): permanently deferred unless a real workflow demonstrates joint mid-turn control is needed and observation-only via rollout-JSONL tail (or the bridge) doesn't satisfy. Devil's Advocate lens flagged "joint control" as solving for architectural symmetry, not user need; that critique stands until evidence appears.
- **Cross-device session continuity (D-003 platform bundle)**: stays parked. Most resume needs are already covered by `codexThreadId`. Re-evaluate after the bridge is live and we have data on actual cross-device handoff frequency.
- **Slash command parity**: requires either a fork patch or mobile-side equivalents. Lower priority than streaming/rewind. Worth revisiting after the bridge if the gap log shows specific slash commands missed.

---

## What would change this sequence

Some triggers that should cause a re-think rather than mechanical execution:

- **A real user workflow surfaces that observation-only or post-bridge can't satisfy.** Specifically: a request to inject input into a stock-Codex TUI session *during* a turn (not between turns, not via plugin tools). That's the only thing that justifies re-prioritizing the TUI socket idea.
- **Codex upstream adds the equivalent of `Generic` hook variant** (or any extension-point multiplier). Skip step 3; bridge consumes the new stock surface directly.
- **Codex upstream changes the plugin manifest schema in a breaking way.** Bridge maintenance cost spikes; reconsider whether keeping pace is worth it vs. continuing to wrap.
- **Distribution fragmentation becomes a real cost** — i.e., happy users on `@openai/codex` start asking for fork-only features. Means we either auto-detect and gate, ship a unified install path, or rethink the fork-only-feature model entirely.
- **OpenAI ships a Codex SDK or Managed Agents path that routes through the same plugin layer.** Bridge could observe those too — but only if the routing is verified. Open question.

---

## Pre-work that gates any future fork patch (D-002 / D-003 / D-004 / TUI socket / etc.)

Before committing to any new fork patch, capture upstream churn data for the candidate patch surface(s) in `openai/codex` over the last 6 months:

```bash
git log --oneline --since="6 months ago" -- \
  hooks/src/registry.rs \
  protocol/src/protocol.rs \
  rollout/src/recorder.rs \
  tui/src/slash_command.rs \
  model-provider-info/src/lib.rs
```

Capture commit count + recent commit hashes per file in this doc. Heuristic: any file averaging > 2 commits/month should drop off the patch list — the rebase tax outweighs the extension value. The remaining list is the actual workable patch surface.

This data is the empirical input to D-001's gap log: "we know this fork patch is feasible because the file changes rarely and we know it's needed because workflow X failed without it."

---

## Open questions

1. **Is there demand for stock-Codex entry-point coverage?** The bridge's strongest argument depends on whether anyone actually uses `codex` outside `happy codex`. Worth surveying.
2. **Will OpenAI accept a `Generic` hook variant upstream?** If yes, the fork can stay at "Copilot routing only" indefinitely. If no, the Generic hook becomes a permanent fork patch — still cheap, but a tax.
3. **Codex plugin manifest stability**: how often does it change? Affects bridge rebase cost. Tracked under "Pre-work" above.
4. **Does Managed Agents / `@openai/codex-sdk` route through the plugin layer?** If yes, the bridge transparently covers them too — major coverage win.
5. **Distribution shape for the bridge**: ship inside `happy-cli` as plugin assets, or as a separate `happy-bridge` npm package? Default: bundle inside `happy-cli` for simplicity; consider extracting only if external Codex users want the plugin without happy-cli.
6. **Streaming / rewind sequencing**: do them together or separately? Streaming is a smaller change; rewind needs UI work. Probably separate stories so streaming ships immediately.

---

## Cross-references

- Brainstorm: `.ralph/brainstorms/codex-fork-extension-strategy/` — three-lens synthesis, candidate directions, recommendation.
- Prior brainstorm (parked): `.ralph/brainstorms/codex-joint-local-remote-control/` — the TUI socket idea. Devil's Advocate flagged red-flag; still parked unless a real workflow surfaces.
- Current Codex integration: `docs/plans/codex-app-server-migration.md`.
- Fork notes: `docs/fork-notes.md`, `docs/fork-roadmap.md`.
- Reference files (happy side):
  - `packages/happy-cli/src/codex/codexAppServerClient.ts`
  - `packages/happy-cli/src/codex/runCodex.ts`
  - `packages/happy-cli/src/codex/utils/permissionHandler.ts`
  - `packages/happy-cli/src/codex/utils/sessionProtocolMapper.ts`
  - `packages/happy-cli/scripts/session_hook_forwarder.cjs` (precedent for hook shell-out pattern)
- Reference files (Codex source):
  - `core-plugins/src/manifest.rs:13` (plugin manifest)
  - `hooks/src/registry.rs:33` (6 stock hook events)
  - `protocol/src/protocol.rs:939` (`AskForApproval` enum)
  - `config/src/mcp_types.rs:53` (MCP server config)
  - `login/src/auth/external_bearer.rs:30` (command-backed auth)
  - `tui/src/app/app_server_adapter.rs` (TUI's embedded app-server — relevant for the deferred socket idea)

---

## Gap log

*Populated only when a real workflow attempt fails. Empty entries here mean "haven't tried yet" — speculative additions are not recorded.*

| Capability | Workflow that surfaced it | Stock surface(s) tried | Specific blocker (closed enum / unexposed event) | Fork-patch shape (if any) |
|---|---|---|---|---|
| _(none yet — populate during dogfooding of Lens 1 / Lens 2 work)_ | | | | |

---

## Decision rules for future fork patches

When considering a new fork patch, walk the checklist:

1. **Does the gap log have a real entry?** If not, stop. The bridge probably covers it; the wrapper definitely does. Add an entry only after a workflow attempt fails.
2. **Is the gap an extension-surface expansion or an internal behavior change?** If internal, try to re-shape as extension-surface first. If unsuccessful, fork patch is a permanent observability cost — proceed only if the value is exceptional.
3. **What's the upstream churn rate on the patch surface?** From the pre-work table. > 2 commits/month → scratch from the list.
4. **Could the patch be upstreamed?** PR upstream first; the fork shouldn't carry patches that upstream would accept anyway.
5. **What's the distribution story?** Does this fragment `@openai/codex` vs `@gim-home/codex` users? Mitigation plan?
6. **Is the patch composable with the bridge?** From the composability table above. If "doesn't compose," the value bar is much higher — the work doesn't compound.

If all six pass, it's a viable patch. If any fails, the candidate goes back on the brainstorm shelf with the reason recorded.
