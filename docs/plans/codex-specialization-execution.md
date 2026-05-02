# Codex Specialization — Execution Roadmap

> **Purpose**: turn the strategic direction in [`codex-specialization.md`](./codex-specialization.md) into concrete, sequenced actions using the Ralph orchestration skills (`brainstorm-with-ralph`, `plan-with-ralph`, `implement-with-ralph`).
>
> **Audience**: the maintainer (or an agent picking up the work) standing at the start of execution and asking "what do I actually run, in what order, on which file?"

---

## What's already done

Don't redo these — they're in the bank:

- ✅ **Brainstorming**: extensive multi-round Codex + Copilot reviewer / brainstorm sessions converged on the codex-specialization decision. Documented in [`codex-specialization.md`](./codex-specialization.md).
- ✅ **Strategic direction recorded**: see [`codex-specialization.md`](./codex-specialization.md). Decision is captured but **not yet acted on in code**.
- ✅ **Operational plan drafted**: see [`codex-seamless-multi-device.md`](./codex-seamless-multi-device.md). Phase 0 verified empirically (codex-cli 0.125.0-copilot-api.8 on 2026-05-02). Phase 1 sub-tasked with size estimates. Reviewed and revised against Codex+Copilot feedback.
- ✅ **Codex code audit**: empirical verification that multi-client primitives, CRUD-style thread RPCs, and ~50 protocol methods exist as documented. See "Phase 0 verification result" in the multi-device plan.

So the question is **not** "do we brainstorm or plan?" — it's "is the existing plan good enough to implement, or does it need a refinement pass first?"

---

## Step 0 — Sleep on the strategic decision (no skill call)

**Why**: codex specialization is a strategic narrowing made at the end of a long marathon session. Decisions made under fatigue have the highest risk of "wait, what was I thinking" regret next morning. Per the option-(d) advice already recorded in [`codex-specialization.md`](./codex-specialization.md).

**Action**: re-read `codex-specialization.md` with fresh eyes (e.g., morning coffee). Check gut.

**Decision gate**:

- **Still committed?** → proceed to Step 1.
- **Shifted?** → edit or shelve `codex-specialization.md` with clear notes about why. Do NOT proceed to Step 1.

**Time**: ~10 min reading.

---

## Step 1 — Refine the multi-device plan with `/plan-with-ralph --improve`

**Why**: the multi-device plan was authored and revised under fatigue. `plan-with-ralph --improve` runs a fresh research + review pass with agents that haven't seen our session, catching things we missed under the same cognitive load that produced them.

**Skill invocation**:

```
/plan-with-ralph --improve docs/plans/codex-seamless-multi-device.md
```

**Expected outcomes** (one of):

- **Plan holds**: the improve pass confirms the work is implementation-ready. Minor refinements at most. Proceed to Step 2 with high confidence.
- **Plan needs adjustment**: fresh eyes catch something genuinely missed (e.g., a Phase 1 sub-task is mis-scoped, a verification step is brittle). Apply the suggested changes via the `--improve` flow. Re-read the revised plan once before Step 2.
- **Plan needs major revision**: rare, but if the refinement pass reveals a foundational issue (e.g., a Phase 0 verification that turned out to be wrong), pause and reconsider rather than push through.

**Time**: 30-60 min.

**Decision gate**:

- **Plan holds or has minor changes**: proceed to Step 2.
- **Plan needs major revision**: stop here, re-read the revised plan, possibly schedule another sleep cycle before continuing. Don't rush past a re-discovered foundational issue.

---

## Step 2 — Implement Phase B (multi-device feature) with `/implement-with-ralph --from-plan`

**Why**: the multi-device plan is structured for `implement-with-ralph`'s consumption (phases, sub-tasks, file references, testing approach, failure modes). This runs the Ralph agent loop, generates a PRD, executes per story, reviews changes, iterates until convergence.

**Skill invocation** (pick one):

```
# autonomous — runs end-to-end without confirmation prompts; best if you want
# it to ship while you do other work
/implement-with-ralph --from-plan docs/plans/codex-seamless-multi-device.md --autonomous

# interactive — pauses at story boundaries; best if you want to babysit and
# adjust mid-execution
/implement-with-ralph --from-plan docs/plans/codex-seamless-multi-device.md
```

**Expected outcomes**:

- Phase 1 sub-tasks 1-5 ship over ~5-7 days of work (per plan estimate)
- Real-Codex integration verification at the end (manual, per plan's Testing approach section)
- Walkthrough section's 7 steps work end-to-end

**During implementation, watch for**:

- Phase 0 Step 5 (deterministic approval fan-out) — this is where the plan assumed multi-client primitives behave a certain way; if real codex behaves differently, sub-task 4 (conflict resolution) may need scope expansion
- Disconfirming observations from the Phase 0 verification — they were spot-checked but not exhaustively tested; if any prove wrong during implementation, pause and reconsider before patching around them
- The "lifecycle ownership" question in Phase 1 sub-task 2 (how exactly daemon ownership works) — this is the open question most likely to surface during implementation. Default to the simpler model and only complicate if forced.

**Time**: 5-7 days of work, possibly more calendar time if dogfooding intermittently.

**Decision gate after Phase B ships**:

- **Phase B works as designed**: validates the codex-specialization bet. Proceed to Step 3.
- **Phase B reveals architectural surprises**: pause and reconsider whether the strategic direction needs adjustment. Update `codex-specialization.md` with what was learned.

---

## Step 3 — Dogfood Phase B before planning Phase C+

**Why**: `codex-specialization.md` Phases C (protocol migration), D (storage migration), E (fork extension PRs), and F (legacy cleanup) are deliberately NOT planned in detail yet. Real usage of Phase B reveals which Phase C/D/E shapes are right.

**Action**:

- Use Phase B daily for at least a week
- Notice what's annoying, what works better than expected, what's different from the plan's assumptions
- Add observations to `notes/codex-specialization-dogfood.md` (create if doesn't exist) — anything that should affect future planning

**Time**: 1-2 weeks of calendar time, ~zero focused engineering effort.

**Decision gate after dogfood week**:

- **Phase B is genuinely good and the architecture feels right**: proceed to Step 4 (plan Phase C).
- **Phase B has rough edges that suggest the architecture is wrong**: amend `codex-specialization.md` Risks section with what was learned. May or may not change downstream phases.
- **Phase B is fine but you've got higher-priority work elsewhere**: pause Phase C planning until you have time. Phase B is independently shippable; the strategic direction doesn't decay if Phase C is delayed.

---

## Step 4 — Plan Phase C (protocol migration) with `/plan-with-ralph`

**Why**: end-to-end codex JSON-RPC (phone speaks the protocol natively, Happy CLI becomes a transparent relay) is the next architectural shift after multi-device works. It's substantial enough to deserve its own plan with its own research + review cycle.

**Skill invocation**:

```
# fresh planning, NOT --improve, since this is a new plan doc
/plan-with-ralph "Migrate phone app to speak codex JSON-RPC end-to-end. Happy CLI becomes a transparent byte-relay for codex sessions; phone imports OSS TypeScript bindings from codex-rs/app-server-protocol/schema/typescript/. Replaces sessionProtocolMapper.ts and most of codexAppServerClient.ts's translation logic. See docs/plans/codex-specialization.md Phase C for the strategic context. Multi-agent (Claude/Gemini) sessions stay on translation layer."
```

**Expected outcomes**:

- New plan doc at `docs/plans/codex-protocol-end-to-end.md`
- Sub-tasks: phone TypeScript binding integration, Happy CLI relay refactor, gradual migration of session types
- Testing approach for end-to-end protocol behavior
- Estimate: ~1-2 weeks of work per the strategic doc, but this number is a guess — the planning pass will refine it

**Time**: ~1-2 hours for plan-with-ralph to run.

**Decision gate**:

- **Plan looks executable**: proceed to Step 5 (implement Phase C).
- **Plan reveals scope was bigger or differently-shaped than estimated**: reconsider whether this is the right next bet. Multi-agent inconsistency may be tolerable for longer; this phase can be deferred without breaking Phase B.

---

## Step 5 — Implement Phase C with `/implement-with-ralph --from-plan`

```
/implement-with-ralph --from-plan docs/plans/codex-protocol-end-to-end.md --autonomous
```

Same pattern as Step 2: Ralph loop, PRD generation, per-story execution, review, convergence.

**Time**: per the Phase C plan's own estimate.

---

## Step 6 — Plan + implement Phase D (storage migration)

**Skill invocations**:

```
/plan-with-ralph "Migrate codex sessions' conversation history to be backed by codex's app-server storage as the source of truth, with Happy server as an encrypted cache and phone-side local cache for offline reads. Replaces Happy server's per-message storage layer for codex sessions. See docs/plans/codex-specialization.md Phase D for the strategic context. Multi-agent (Claude/Gemini) sessions keep using Happy server storage."
```

Then:

```
/implement-with-ralph --from-plan docs/plans/codex-storage-canonical.md --autonomous
```

**Time**: 2-3 weeks per strategic doc estimate. Refine via plan-with-ralph.

**Decision gate**:

- **Phase D works**: codex specialization is now real and stable. Proceed to Phase E (fork extensions) or pause and dogfood again.
- **Phase D reveals storage-correctness issues**: real-time multi-client coordination is harder than estimated; may need to revisit Phase C's design or commit to Path C from the architectural discussion (Happy server as cache, not pure pass-through).

---

## Step 7 — Phase E (codex fork extension PRs) — incremental, opportunistic

Each fork extension is its own small project. Don't bundle them.

**Per-extension flow**:

```
/plan-with-ralph "Add <X> to the codex fork at D:/harness-efforts/codex/external/repos/codex-patched/codex-rs/. Specifically: <verified file:line modification points from docs/plans/codex-seamless-multi-device.md>. Goal: <what user-visible behavior this enables>. Constraint: minimally invasive — additive patterns, new files where possible, minimal touches to upstream-shared files."
```

Then:

```
/implement-with-ralph --from-plan docs/plans/codex-fork-<X>.md --autonomous
```

The 4 candidate extensions (after dropping idle-shutdown):

1. Cancel-loser semantics on approvals — `codex-rs/app-server/src/bespoke_event_handling.rs` plus a new helper file
2. Standard ws transport reconnect — port from `codex-rs/app-server/src/transport/remote_control/websocket.rs` to `codex-rs/app-server/src/transport/websocket.rs`
3. Background terminal `list/kill/output` protocol methods — additive in `codex-rs/app-server-protocol/src/protocol/common.rs` + `codex-rs/protocol/src/protocol.rs` + dispatch in `codex-rs/core/src/session/handlers.rs`
4. Client presence events — emit notifications from existing internal hooks at `codex-rs/app-server/src/codex_message_processor.rs`

Each is roughly 50-150 LOC. They can ship as 4 separate PRs against the patched fork, or 1 bundled PR if you prefer.

**Time**: ~1-2 days per extension. Total ~4-7 days for all 4. Spread out as needed.

**Note**: Phase E may also be the right time to consider upstream contributions for items 1-3 (universal-purpose protocol clarifications). Item 4 (presence events) could go either way. Cancel-loser is the most upstream-able since it's a clear correctness improvement.

---

## Step 8 — Phase F (legacy cleanup) — late, optional, telemetry-driven

**Why this is last and conditional**:

- Phase F is "remove or formally deprecate Claude/Gemini/OpenClaw support"
- Best done when usage telemetry shows codex dominates (or honest assessment confirms it)
- Doing it earlier risks alienating users who haven't moved
- Doing it never is also fine — multi-agent in maintenance mode is sustainable indefinitely

**No skill invocation here**. This is a calendar/strategy decision, not an engineering plan.

**When you're ready**:

```
/plan-with-ralph "Determine which multi-agent legacy code to remove vs. retain in maintenance mode. Audit Happy CLI for Claude/Gemini/OpenClaw runners and identify what can be safely deleted vs. what's still in active user paths. Factor in: <usage telemetry if available>, communication strategy from codex-specialization.md, and minimum-viable maintenance burden."
```

But be honest about whether this needs to happen at all. "Quietly maintains old code" is a perfectly fine end state.

---

## What NOT to do

These are guardrails to avoid burning skill invocations on lower-value work:

- ❌ **Don't run `brainstorm-with-ralph` on any of this.** We've already brainstormed extensively in conversation; doing it again would either confirm what we concluded (waste) or contradict it (introducing inconsistency we'd then have to reconcile). The brainstorm phase is done.
- ❌ **Don't run `plan-with-ralph` (without `--improve`) on the existing multi-device plan.** Use `--improve` instead. Fresh `plan-with-ralph` would discard the work we already did.
- ❌ **Don't run any skill on `codex-specialization.md`.** It's a decision record, not an implementation target. It links to other docs that ARE implementation targets; operate on those.
- ❌ **Don't try to plan Phase C + D + E up front, before Phase B ships.** Premature planning = wasted plan docs because the right shape emerges after Phase B reveals what's actually painful.
- ❌ **Don't skip Step 0 (sleep on the decision).** Strategic narrowing decisions made at the end of marathon sessions have the highest regret rate. The 8-hour pause has high option value.

---

## Quick-reference: file → skill mapping

| File | Use with skill |
|---|---|
| `docs/plans/codex-specialization.md` | **None** — decision record; read for context. |
| `docs/plans/codex-seamless-multi-device.md` | `plan-with-ralph --improve` (Step 1), then `implement-with-ralph --from-plan` (Step 2) |
| `docs/plans/codex-protocol-end-to-end.md` (will exist after Step 4) | `implement-with-ralph --from-plan` (Step 5) |
| `docs/plans/codex-storage-canonical.md` (will exist after Step 6) | `implement-with-ralph --from-plan` (Step 6 latter half) |
| `docs/plans/codex-fork-<X>.md` (one per fork extension; Step 7) | `implement-with-ralph --from-plan` per file |
| This file (`codex-specialization-execution.md`) | **Reference** — checklist for the maintainer; not an input to skills. |

---

## Total timeline estimate

If actively pursued without major distractions:

- Step 0: 0.5 day calendar (overnight pause)
- Step 1: 1 hour
- Step 2: 5-7 days work
- Step 3: 1-2 weeks calendar
- Step 4: 1-2 hours
- Step 5: 1-2 weeks work
- Step 6: 2-3 weeks work (plan + implement)
- Step 7: 4-7 days work spread over weeks
- Step 8: deferred indefinitely; no rush

**Total active engineering**: ~6-10 weeks (matches the estimate in `codex-specialization.md`).

**Total calendar**: 3-6 months realistically, depending on how much else competes for attention.

---

## Status checkboxes

Track execution progress here. Tick as completed.

- [ ] Step 0 — Sleep on the strategic decision; re-confirm or revise
- [ ] Step 1 — `/plan-with-ralph --improve` on the multi-device plan
- [ ] Step 2 — `/implement-with-ralph --from-plan` for Phase B (multi-device)
- [ ] Step 3 — Dogfood Phase B for ≥1 week; capture observations
- [ ] Step 4 — `/plan-with-ralph` to draft `codex-protocol-end-to-end.md`
- [ ] Step 5 — `/implement-with-ralph --from-plan` for Phase C (protocol migration)
- [ ] Step 6 — Plan + implement Phase D (storage migration)
- [ ] Step 7a — Fork extension: cancel-loser semantics
- [ ] Step 7b — Fork extension: ws transport reconnect
- [ ] Step 7c — Fork extension: background terminal CRUD
- [ ] Step 7d — Fork extension: client presence events
- [ ] Step 8 — Phase F (legacy cleanup) — telemetry-driven, may be deferred indefinitely

When all of Steps 0-7 are checked, the codex specialization is real and stable. Step 8 is optional.

---

## References

- [`docs/plans/codex-specialization.md`](./codex-specialization.md) — strategic direction record (decision context for everything in this file)
- [`docs/plans/codex-seamless-multi-device.md`](./codex-seamless-multi-device.md) — operational plan for Phase B
- [`docs/plans/codex-app-server-migration.md`](./codex-app-server-migration.md) — historical context for the existing codex integration
- `packages/happy-cli/CLAUDE.md` — fork-wide architecture overview; will be updated to reflect codex specialization at Step 5+ time
