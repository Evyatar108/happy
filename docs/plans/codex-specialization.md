# Strategic Direction: Codex Specialization

> **Status**: Decision recorded 2026-05-02. Not yet committed to (no code refactor started). This document captures the architectural commitment and its implications so the next time we touch this fork — days, weeks, or months from now — we can either confirm or revise the direction with full context.

## Decision

Codexu specializes as the **mobile-and-multi-device experience for Codex**. Multi-agent support (Claude, Gemini, OpenClaw, etc.) moves to maintenance mode — it keeps working for existing users but new architectural investments go to codex only.

The end-state architecture:
- Phone app speaks codex JSON-RPC natively (no Codexu translation schema in the wire path)
- Codex's `app-server` is canonical for conversation state and tool execution
- Codexu server becomes auth + encrypted relay (and optionally an encrypted cache for cross-machine convenience)
- Codex fork extensions are first-class investments because they directly improve the phone experience
- Phone maintains a local cache for offline reads (standard chat-app pattern)

## Why now — what evidence drove this

The decision wasn't arbitrary. It emerged from a multi-day architectural investigation that started as "fix deferred-switch in-flight question handling for Claude" and converged here. Concretely:

### Claude's architecture fights us at every turn

Documented during the investigation (see `packages/codexu-cli/CLAUDE.md` "v1 limitation — pendingSwitch" note and `docs/plans/codex-seamless-multi-device.md` Background section):

- Claude binary owns its own TUI; Codexu can't intercept input prompts (permission, AskUserQuestion, plan-mode confirms) without fragile PTY/screen-scraping
- Stdin is inherited (`claudeLocal.ts:295`) — no programmatic input channel
- Tool state lives in JSONL; SDK's `--resume` doesn't replay orphaned `tool_use` reliably
- Local→remote switch is process-kill-and-restart, killing background bashes
- Hook protocol can't deliver structured user answers back to a paused local Claude
- Anthropic doesn't ship a Claude-equivalent of `codex app-server` (no documented RPC control plane)

Every fix attempt either added fragile machinery (stdin proxy, screen-scraping) or shipped a workaround that didn't actually solve the user's actual goal (revert-to-Stop-hook-only, document the limitation).

### Codex's architecture has every primitive we want, by design

Verified empirically (see `docs/plans/codex-seamless-multi-device.md` Phase 0 verification):

- `codex app-server` runs as a long-lived JSON-RPC subprocess, multi-client by default
- ALL approvals/permissions/elicitations route through one uniform RPC path
- `codex --remote ws://...` lets the native TUI attach as an additional client
- Multi-connection infrastructure is already implemented (`ThreadScopedOutgoingMessageSender`, `replay_requests_to_connection_for_thread`, etc.)
- Background tasks survive client disconnect (`thread/backgroundTerminals/*`)
- Persistent storage with CRUD-style RPCs (`thread/list`, `thread/read`, `thread/turns/list`, `thread/inject_items`, `thread/rollback`)
- TypeScript bindings for the entire protocol shipped OSS at `app-server-protocol/schema/typescript/*.ts` (committed to upstream codex)

The deferred-switch UX we wanted to build for Claude is essentially trivial in Codex's architecture — there's no local-vs-remote distinction to defer between. The user is "always remote" by design.

### The two architectural questions converged

During the design discussion, two separate questions both pointed at the same answer:

1. *"Should Codexu speak codex's protocol end-to-end instead of translating?"* — yes, if Codexu specializes on Codex.
2. *"Should we lean on codex's storage as canonical instead of duplicating in Codexu?"* — yes, if Codexu specializes on Codex.

Both are independent technical decisions, but both are gated on the strategic-narrowing question. When two unrelated architectural questions both resolve to the same condition, that's signal the condition is the real decision.

## Architectural implications

### Wire protocol

Today: phone ↔ Codexu server (Codexu schema, encrypted) ↔ Codexu CLI (translation layer) ↔ codex app-server (codex JSON-RPC)

End-state: phone ↔ Codexu server (codex JSON-RPC, encrypted) ↔ Codexu CLI (transparent relay) ↔ codex app-server (codex JSON-RPC)

Practical changes:
- Phone imports the OSS TypeScript bindings from `codex-rs/app-server-protocol/schema/typescript/`. Schema drift becomes impossible.
- `packages/codexu-cli/src/codex/codexAppServerClient.ts` and `packages/codexu-cli/src/codex/utils/sessionProtocolMapper.ts` shrink dramatically — most of their job (translating codex events into Codexu session envelopes) goes away.
- Codexu server's role narrows to authenticating clients, encrypting transport, and routing messages between phone and the appropriate Codexu CLI.

### Data persistence

Today: codex stores `~/.codex/sessions/*.jsonl`; Codexu stores encrypted copies on Codexu server; both are sources of truth and can drift.

End-state: codex's storage is canonical. Codexu server may keep an encrypted cache for cross-machine convenience (TBD per migration phase). Phone maintains a local cache for offline reads.

Practical changes:
- Drift between Codexu's view and codex's view becomes impossible (or, with cache, eventually-consistent rather than indefinitely-divergent).
- Direct `codex` invocations outside Codexu (the user runs `codex resume` in a terminal) reflect in the phone view automatically on next sync.
- The set of Codexu-server-stored "conversation message envelopes" shrinks; eventually deprecates entirely for codex sessions.

### Codex fork extensions

Become first-class investments. Specifically:
- Cancel-loser semantics on approvals (so multi-client coordination is clean)
- Reconnect logic on `transport/websocket.rs` (so phone-app reconnect is upstream, not Codexu-side reinvented)
- Background terminal `list/kill/output` protocol methods (so phone can manage them)
- Client presence events (so the phone can show "laptop is online" or "laptop just disconnected")

The previous discussion landed on doing the cancel-loser, reconnect, and presence work on the **Codexu side** to avoid fork rebase friction. Under codex specialization, that calculus shifts: doing them in codex itself is preferable because:
- The phone speaks codex protocol directly, so codex-side fixes benefit the phone for free
- Native `codex --remote` TUI clients (a real option once we're codex-specialized) get the same fixes
- Codexu CLI stays thin

The trade-off becomes the rebase tax against upstream codex, which we mitigate via additive patterns (new files for new logic, minimal touches to upstream-shared files, `#[experimental]` gating). **Anyone planning a specific fork extension under this commitment MUST follow the codexu roadmap's "Phase 2 prerequisite — minimize upstream-canonical conflict surface" rules** (`C:/harness-efforts/codexu/plans/codexu-roadmap.md`): default new code to `codex-rs-overlay/` (fork-exclusive crates, never conflict surface), explicitly evaluate overlay-first / minimized-seam / upstream-PR alternatives before any subtree edit, and register every patch site in `codex/docs/implementation/patch-surface.md` §14+§15 and the audit scripts. `docs/plans/codex-fork-extension-strategy.md` localizes those rules into the three-gate pre-work checklist for brainstorm + plan rounds.

## Product implications

### Positioning

Today: "Codexu is your phone interface for any AI coding agent."

End-state: "Codexu is the best mobile experience for Codex." Multi-agent support exists but isn't the headline.

This is a real positioning shift. It affects:
- README, marketing pages, blog posts
- App Store description (if the app is on stores)
- Onboarding flow (which agent does the user pick by default)
- Documentation tone

### Existing Claude / Gemini / OpenClaw users

They keep working. The Codexu CLI's Claude/Gemini/OpenClaw runners stay functional. They just don't get new features. Specifically:

- Bug fixes: yes, when affecting basic functionality
- New protocol features (deferred switch, etc.): no, unless trivial
- UI parity with codex sessions: no, deliberate divergence

The honest version of this requires telling existing users. Either:
- A release note: "Going forward, Codexu will focus on Codex. Existing Claude support continues to work but won't gain new features."
- A migration guide for users who'd benefit from switching to Codex
- Or both

The dishonest version is silently letting Claude features go stale. That's worse for trust.

### New users

Onboarding defaults to Codex. The "first-time launch" experience assumes you're using Codex. Other agents are accessible via flags but not the default path.

## What changes (concrete code scope)

### Removed or shrunk

- Most of `packages/codexu-cli/src/codex/codexAppServerClient.ts`'s translation logic
- `packages/codexu-cli/src/codex/utils/sessionProtocolMapper.ts` (most of it)
- Codexu server's conversation-message storage layer (eventually; possibly kept as encrypted cache)
- The Codexu session-envelope schema for codex events specifically
- `packages/codexu-app/sources/sync/`'s codex-specific normalization (replaced by direct codex bindings)

### Added

- TypeScript bindings consumed from `codex-rs/app-server-protocol/schema/typescript/` (or workspace-package import)
- A direct codex-JSON-RPC WebSocket client in the phone app
- Phone-side cache for offline reads (storage strategy: probably MMKV for the metadata, encrypted-blob for thread content)
- Codex fork extension PRs (cancel-loser, reconnect, background-terminal CRUD, presence events)
- Migration scripts/tools to convert existing Codexu-stored Claude conversations if we want to preserve them when narrowing UI focus

### Untouched

- Authentication (libsodium, QR pairing, machine identity) — orthogonal to this
- Push notifications infrastructure — orthogonal
- App-side rendering of message content (markdown, syntax highlighting, tool views) — same code paths, just consume codex events instead of normalized envelopes

## What stays — multi-agent in maintenance mode

The decision isn't "delete Claude support." It's "don't invest in evolving it." Concretely:

- Claude/Gemini/OpenClaw runners in `packages/codexu-cli/src/` stay functional
- The current Codexu schema for non-codex agents stays as the wire format for those sessions
- Bug-fix parity with codex isn't required (e.g., new codex features don't need a Claude equivalent)
- Eventually some of the legacy code gets quietly removed if it's clearly unused (telemetry would inform this)

Risk: this creates internal inconsistency in the Codexu CLI codebase — codex sessions on the new architecture, Claude sessions on the old one. Acceptable as a transition state. Not acceptable indefinitely.

## Migration sequence (proposed, refine on contact with reality)

### Phase A — Decide and document (now)

- This document
- Updates to `packages/codexu-cli/CLAUDE.md` documenting the strategic direction
- A note in the README signaling the focus shift (later, when we've actually moved)

### Phase B — Multi-device codex (the existing plan)

- Execute `docs/plans/codex-seamless-multi-device.md` Phase 1
- Some of this gets done Codexu-side, some upstream — TBD when we hit it
- Validates that the Codex direction actually delivers the user-visible win

### Phase C — End-to-end protocol migration

- Make Codexu CLI a transparent relay for codex sessions (stop translating)
- Phone app imports codex TS bindings, switches over to native codex envelope rendering for codex sessions
- Translate existing Codexu schema for codex events into a deprecation-friendly form
- Multi-agent paths still go through translation in this phase

### Phase D — Storage migration

- Codex sessions' conversation history moves to "codex canonical, Codexu server cache" (Path C from the architectural discussion)
- Phone's local cache implementation
- Cross-machine sync via codex's RPCs

### Phase E — Codex fork extension PRs (incremental, not blocking)

- Cancel-loser, reconnect, background-terminal RPCs, presence events
- Sequenced as separate PRs against the patched codex fork
- Some may be upstream-able directly to OpenAI's codex; others stay fork-only

### Phase F — Multi-agent legacy cleanup (latest)

- Once codex specialization is real and stable, decide what to do with Claude/Gemini code
- Options: keep maintenance mode, freeze entirely, formally deprecate
- Driven by usage telemetry if available, or honest assessment if not

### Timeline estimate

If actively pursued: Phase B is 5-7 days (covered by existing plan). Phase C is 1-2 weeks. Phase D is 2-3 weeks (the cache implementation). Phase E is incremental, ~1-2 days per PR. Phase F is a calendar decision more than an effort estimate.

Total active engineering: ~6-10 weeks of focused work to reach a stable codex-specialized architecture. Plus calendar time for dogfooding and revision.

## Risks and hedges

### Risk: Codex-as-product becomes irrelevant

OpenAI could deprecate Codex CLI in favor of ChatGPT-native or some next-gen tool. Our investment depends on Codex remaining a viable product.

Hedge: keep enough abstraction in the phone app's rendering layer that switching to a different agent's protocol later is possible, even if currently optimized for codex. The phone code SHOULD render codex events directly, but the rendering components themselves shouldn't be unrecoverably codex-coupled.

Practical: the phone's UI components (markdown view, tool call card, permission card, etc.) take generic shapes as props, and codex envelopes get mapped to those props at the render boundary. If we ever needed to render a different protocol's events, only the mapper changes.

### Risk: Existing Claude users feel abandoned

If we silently let Claude support rot, users notice and trust erodes.

Hedge: communicate the direction openly. Release notes, blog post, in-app banner if needed. Honest framing: "Codex offers a much better mobile experience than Claude can structurally support. We're focusing there. Claude continues to work; we're not actively breaking it; we're not investing in it either."

### Risk: We commit to codex specialization and then OpenAI sherlocks the differentiator

E.g., OpenAI ships a first-party "Codex Mobile" app that does everything Codexu does, better.

Hedge: the differentiator becomes things OpenAI doesn't prioritize — power-user features (declarative approval rules), niche workflows (BOOX e-ink optimization, multi-machine session routing), or polish (terminal UX features OpenAI's app skips). Lean into Happy's existing maintainer-as-power-user identity.

This is a real risk and not fully hedgeable. It's the same risk every Codex-derivative project carries.

### Risk: Migration takes longer than estimated

Architectural refactors usually do. The "6-10 weeks" estimate assumes focused work; in reality there will be calendar drift, distractions, dogfooding-driven changes.

Hedge: the Phases above are independently shippable. Phase B (multi-device) ships value without committing to the rest. Phase C (protocol migration) ships value without Phase D done. Each phase is a stopping point; we don't have to do them all to get value.

## Open questions

1. **Claude communication strategy**: blog post? release note? in-app banner? Decide before Phase E (when removal becomes visible).
2. **Telemetry**: do we have any signal about which agents Codexu users actually use? If most Codexu usage is already Codex, this decision validates retroactively. If it's split or Claude-heavy, the migration is more disruptive.
3. **Phone app cache strategy**: MMKV-only, encrypted-blob storage, or something more sophisticated? Affects Phase D scope.
4. **Cross-machine sync model**: do we replicate via Codexu server cache (Path C from the architectural discussion) or pure phone-cache + on-demand-fetch (Path B')? Affects how the phone behaves when laptop is asleep. Decide during Phase D.
5. **Fork-vs-upstream for codex changes**: cancel-loser feels upstream-able; declarative rules might not be. Decide per-extension during Phase E.
6. **Codex-as-product hedge**: how much do we soften the strategic commitment in case Codex itself becomes shaky? 0% (full bet) or 20% (keep escape hatches) or 50% (parallel architectures)? Default toward 20% — minimal hedge, mostly via the rendering-layer abstraction noted in the Risks section.

## References

### Plans this connects to

- `docs/plans/codex-seamless-multi-device.md` — the multi-device feature this strategic direction makes coherent
- `docs/plans/codex-app-server-migration.md` — historical context for the existing codex integration

### Code touchpoints (for future migration work)

- `packages/codexu-cli/src/codex/codexAppServerClient.ts` — translation layer, shrinks during Phase C
- `packages/codexu-cli/src/codex/utils/sessionProtocolMapper.ts` — translation layer, mostly removed during Phase C
- `packages/codexu-cli/src/codex/runCodex.ts` — entrypoint, simplifies as schemas align
- `packages/codexu-app/sources/sync/typesRaw.ts` — schema definitions; codex envelopes stop going through this for codex sessions
- `packages/codexu-app/sources/sync/sync.ts` — message-send path; eventually direct-codex for codex sessions
- `D:/harness-efforts/codex/external/repos/codex-patched/codex-rs/app-server-protocol/schema/typescript/` — TS bindings to import in the phone app

### Conversation history that informed this

This decision emerged over a multi-day session that included:
- Failed attempts to fix Claude's deferred-switch for in-flight questions (multiple paths investigated, all hitting structural limits)
- Empirical verification of Codex's multi-client primitives (verified working with 2 simultaneous WebSocket clients)
- Discovery that Codex's protocol RPC surface (~50 methods) covers most multi-device use cases natively
- Brainstorm exchanges with Codex-reviewer and Copilot-reviewer agents that consistently pointed at "Codex is structurally what you want; Claude is structurally fighting you"
- Recognition that two independent architectural questions (end-to-end protocol vs. translation; codex storage vs. Codexu storage) both gate on the same strategic direction

The convergence is the signal. The decision lands here.

## Status tracking

- [x] Decision recorded (this document)
- [ ] Reviewed by maintainer after sleep / distance
- [ ] Communicated to existing users (post Phase B, before Phase C)
- [ ] `packages/codexu-cli/CLAUDE.md` updated to reflect strategic direction
- [ ] README updated to reflect positioning shift (post Phase C or D)
- [ ] Phase B (multi-device) executed
- [ ] Phase C (protocol migration) executed
- [ ] Phase D (storage migration) executed
- [ ] Phase E (codex fork extension PRs) — multiple checkboxes, fill in as PRs land
- [ ] Phase F (legacy cleanup) — re-evaluate after Phase D
