# Codex parity with Claude Code's native subagent palette

*Research + decision doc. No code. Generated 2026-05-13 via `/plan-with-ralph`.*

**Workspace:** `D:/harness-efforts/codexu/` (root, not a worktree subdir).
**Companion read-only source:** `D:/harness-efforts/claude-code/worktrees/main/` (reconstructed-from-source-maps dump of `@anthropic-ai/claude-code`; see §4 for license caveat).

---

## TL;DR (operator decision surface)

1. **Yes, port three** of Claude Code's six built-in subagents — they are universally valuable and not Claude-Code-specific:
   - **`explorer`** (already a built-in slot in codex, but the embedded `explorer.toml` is an empty stub — fill it in with a paraphrased Explore prompt). Reference: `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/explorer.toml`.
   - **`plan`** — new built-in role; read-only architect that returns implementation plans.
   - **`verification`** — new built-in role; adversarial "try to break it" reviewer with PASS/FAIL/PARTIAL verdict.

2. **Skip two** as Claude-Code-specific:
   - **`statusline-setup`** — writes to `~/.claude/settings.json`; codex has no equivalent setting surface.
   - **`claude-code-guide`** — its entire value is fetching Claude Code / SDK / API docs. A codex analog (`codex-guide` pointing at codex docs) is possible but is a *new* agent inspired by the pattern, not a port. Defer until codex docs URLs are stable.

3. **One redundant** with codex's existing built-ins:
   - **`general-purpose`** ≈ codex's existing `worker` built-in role. Compare prompts and merge any missing guidance from Claude's `general-purpose` into `worker.toml` if there's a gap; don't add a duplicate role.

4. **Packaging recommendation:** **overlay/fork built-ins first**, plugin distribution second.
   - Phase 1: fill `explorer.toml` + add `plan.toml` + `verification.toml` as new fork built-ins via `include_str!()` in `role.rs` (or via overlay if a seam can be moved out per AGENTS.override.md tenant 1). Ships with the codex binary; deterministic; matches the existing `explorer.toml`/`awaiter.toml` precedent. No upstream-codex changes needed beyond editing the patched fork.
   - Phase 2 (later, depends on upstream): once codex's plugin manifest learns to register `[agents.<role>]` entries (currently a known Phase 3b gap — `plans/codexu-roadmap.md:2031–2033`), republish the same role TOMLs from `packages/codexu-plugin/` so non-fork codex users can opt in. Roles defined in `~/.codex/config.toml` override built-ins, so the two distribution paths coexist cleanly.
   - **Reject (c) `codex agent install --preset` CLI** for now: no precedent in the codebase, requires new subcommand wiring, and once installed users carry stale prompts forever with no update mechanism.

5. **License posture: paraphrase, do NOT copy verbatim.** The Claude Code worktree is reconstructed from source-maps, the README says "research and learning purposes only / do not use it for commercial purposes," and there is no LICENSE file despite the `package.json` claiming one. Anthropic retains copyright on the prompt text. Keep the *behavior contract* (read-only enforcement, adversarial probes, verdict-line format — these are not copyrightable patterns) and rewrite the prose for codex.

**Top 3 to port first (in this order):**

| # | Role | Why first | Risk |
|---|------|-----------|------|
| 1 | `explorer` (fill stub) | Slot already exists; no new infrastructure; biggest day-one user-felt win for fast codebase Q&A | None — purely additive to an empty file |
| 2 | `plan` | Composes with existing `/plan-with-ralph`; replaces ad-hoc "ask the LLM to plan first" with a proper read-only architect agent | Small — needs a new built-in entry + permission profile choice |
| 3 | `verification` | Highest leverage for code-quality regressions; usable from any flow, not just ralph | Medium — needs `workspace-write` (runs builds/tests), and the prompt is long; needs careful adaptation to codex tools |

---

## 1. Claude Code's built-in subagent registry — enumerated

**Source registry:** `D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/builtInAgents.ts`
**Individual definitions:** `D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/{claudeCodeGuideAgent,exploreAgent,generalPurposeAgent,planAgent,statuslineSetup,verificationAgent}.ts`

Six subagents shipped by Claude Code today:

| ID | Default? | Tools | Model | Read/Write | One-shot? | Notes |
|---|---|---|---|---|---|---|
| `general-purpose` | always on | `['*']` | inherit | read/write | no | Catch-all; the fallback agent |
| `Explore` | feature-gated (`tengu_amber_stoat`) | all except `Agent`, `ExitPlanMode`, `FileEdit`, `FileWrite`, `NotebookEdit` | inherit (ant) / haiku (ext) | **read-only** | yes | Fast codebase search; `omitClaudeMd: true` |
| `Plan` | same gate as Explore | same blocklist as Explore | inherit | **read-only** | yes | Architect that returns implementation plans + critical-files list |
| `statusline-setup` | always on | `['Read', 'Edit']` (allowlist) | sonnet | read/write (narrow) | no | Configures `~/.claude/settings.json` statusLine |
| `claude-code-guide` | non-SDK entrypoints only | ant: `Bash + FileRead + WebFetch + WebSearch`; ext: `Glob + Grep + FileRead + WebFetch + WebSearch` | haiku | read-only | no | `permissionMode: 'dontAsk'`; dynamic system prompt with user's installed skills/agents/MCP servers injected |
| `verification` | feature-gated (`VERIFICATION_AGENT` + `tengu_hive_evidence`) | same blocklist as Explore/Plan | inherit | read-only in project; tmp allowed | no | Red-team "try to break it" reviewer; ends with `VERDICT: PASS|FAIL|PARTIAL` |

**System-prompt highlights** (full text in the research agent's report; not reproduced verbatim here per §4 license posture):

- **`general-purpose`** — Short prompt. Strengths: cross-codebase search, multi-step research. Hard rules: "NEVER create files unless absolutely necessary," "NEVER proactively create documentation files."
- **`Explore`** — Heavy "CRITICAL: READ-ONLY MODE" preamble blocking Write/Edit/touch/rm/redirect/heredoc. Notes that file-editing tools are not actually available — the prompt is belt-and-suspenders. Emphasizes parallel tool calls for speed.
- **`Plan`** — Same read-only preamble as Explore. Process: understand requirements → explore → design → detail. Required output ends with a 3–5-file "Critical Files for Implementation" list.
- **`statusline-setup`** — Long prompt; teaches PS1-conversion regex, statusLine JSON schema, and how to write the command into `~/.claude/settings.json`. Includes the entire context-window/rate-limits/worktree/vim JSON shape the statusLine command receives.
- **`claude-code-guide`** — Names three documentation hosts (`code.claude.com/docs/...`, `platform.claude.com/llms.txt`). Approach is "fetch docs map → pick URL → fetch → answer." Dynamically appends the user's installed skills/agents/MCP servers/settings to the prompt.
- **`verification`** — The longest prompt by a wide margin. Calls out two known failure patterns ("verification avoidance" and "seduced by the first 80%"), gives type-specific strategies (frontend/backend/CLI/infra/library/bug-fix/mobile/data/migration/refactor), an "adversarial probes" checklist (concurrency, boundary, idempotency, orphan), and a strict output-block format (`Command run` / `Output observed` / `Result`). Ends with the parsed verdict line.

---

## 2. Per-agent port assessment

### 2.1 `Explore` → codex `explorer` (**PORT — fill existing stub**)

**Verdict: highest-value port; lowest-risk delta.** Codex already has an `explorer` built-in role, but its `explorer.toml` is empty (per the research, the file exists at `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/explorer.toml` and is referenced from `role.rs:420–428` via `include_str!()`). The slot is there; the contents are missing.

**Adaptations needed for codex:**
- Drop references to Claude Code branding ("Claude Code, Anthropic's official CLI for Claude" → "the codex agent").
- Drop the `Glob`/`Grep`/`Read`/`Bash` tool-name list, or replace with codex tool names. Codex's tool surface does not match Claude Code 1:1 — verify against `core/src/tools/handlers/` before substituting names. Easier: refer to *capabilities* ("file pattern matching," "regex search," "file reads") rather than tool IDs.
- Map `omitClaudeMd: true` semantics: codex's `project_doc_fallback_filenames` includes `CLAUDE.md` (per the `codex-copilot-launcher` shim, `D:/harness-efforts/codexu/codex/codex-rs-overlay/codex-copilot-launcher/`). Decide whether `explorer` should skip project-doc loading too — likely yes, for speed.
- Replace `omitClaudeMd` mechanism with whatever codex offers. If codex has no analog today, this is a gap to flag (and may itself need an overlay-side feature).

**Reference files:**
- *Write to:* `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/explorer.toml` (currently empty stub)
- *Inspiration source:* `D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/exploreAgent.ts`
- *Role plumbing:* `codex/external/repos/codex-patched/codex-rs/core/src/agent/role.rs:352–428` (built-in role table + `include_str!()` registration)
- *TOML schema:* `codex/external/repos/codex-patched/codex-rs/config/src/config_toml.rs:668–681` (`AgentRoleToml`)
- *Validation:* `codex/external/repos/codex-patched/codex-rs/core/src/config/agent_roles.rs:360–380` (`developer_instructions` must be non-blank)

### 2.2 `Plan` → codex `plan` (**PORT — new built-in role**)

**Verdict: high-value port.** Codex has no architect-style read-only planning role. Composes well with the existing `/plan-with-ralph` skill (the skill could delegate research/architecture to the new `plan` role instead of inlining the prompt).

**Adaptations:**
- Same read-only enforcement language (paraphrased) — codex supports `permission_profile = "read-only"` per `agent_roles.rs`.
- Keep the "Critical Files for Implementation" output contract — it's a clean, parseable footer.
- Drop the Claude-specific "Glob/Grep/File Read" tool name list; describe by capability.
- Decide model: Claude's `Plan` inherits parent; codex equivalent should also inherit (i.e., omit `model` in `plan.toml`) so the user's session model is used.

**Reference files:**
- *Write to:* new `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/plan.toml`
- *Register in:* `core/src/agent/role.rs:352–428` (add a new entry to the built-in roles table + a new `include_str!()` branch in `config_file_contents()`)
- *Inspiration source:* `D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/planAgent.ts`

### 2.3 `verification` → codex `verification` (**PORT — new built-in role**)

**Verdict: high-value port; broadest impact across non-ralph workflows.** Universal pattern (build → test → adversarial probe → verdict) that benefits every codex user, not just users of this fork's ralph plugin.

**Adaptations:**
- `permission_profile = "workspace-write"` — the agent must run builds, tests, curl commands, and write *ephemeral* scripts to `$TMPDIR`. Verify codex's `workspace-write` profile actually permits temp-file writes outside the project tree; if not, this is a constraint to flag.
- The Claude prompt references `mcp__claude-in-chrome__*` / `mcp__playwright__*` browser MCPs. Replace with codex's actual browser-automation surface (if any) — investigate `mcp__` namespace in this codex fork before deciding. If codex has no browser MCP today, drop the frontend strategy section's browser-tool references and note that frontend verification is best-effort.
- Keep the `VERDICT: PASS|FAIL|PARTIAL` final line — it's a great parser-friendly contract.
- Keep the `### Check: ... / Command run: ... / Output observed: ... / Result:` block format. This is structural, not copyrightable.
- Keep the "recognize your own rationalizations" framing — it's prompt-engineering technique applicable to any model, but rewrite the exact phrasing.

**Reference files:**
- *Write to:* new `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/verification.toml`
- *Register in:* `core/src/agent/role.rs:352–428`
- *Inspiration source:* `D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/verificationAgent.ts`
- *Permission profile reference:* `codex/external/repos/codex-patched/codex-rs/core/src/config/permission_profile.rs` (verify name and capabilities — TODO during implementation)

### 2.4 `general-purpose` → codex `worker` (**SKIP — no merge; structural mismatch**)

**Original framing:** "Compare the two prompts; if Claude's `general-purpose` has guidance `worker` lacks, fold those rules into `worker.toml`."

**Audit result (2026-05-13 follow-up to §6 Q6, closes task `audit-general-purpose-vs-worker` from §recommended-follow-up):** **no-op merge.** On inspection the original framing was wrong about the seam — codex's `worker` role has **no `developer_instructions` layer at all**. The role is declared at `role.rs:382–394` with `config_file: None`, so there is no `worker.toml` on disk and no per-role prompt to merge rules into. The `description` field on `AgentRoleConfig` is plumbed to the *parent* agent's `spawn_agent` tool description (`role.rs::spawn_tool_spec::format_role` at lines 308–349), not to the spawned worker. Claude Code's `general-purpose` ships a per-agent system prompt; codex's `worker` ships only a selection guide to the spawner. The two are not parallel files.

**The two candidate rules are real gaps**, just not at the `worker` layer:

| Rule (Claude `general-purpose`, `generalPurposeAgent.ts:15–16`) | Codex base prompt (`core/gpt_5_2_prompt.md`) |
|---|---|
| "NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one." | Weaker abstract analogue at line 156 ("surgical precision … don't overstep") and line 158 ("don't gold-plate"). No explicit "prefer edit over create" or "NEVER create files unless necessary." |
| "NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested." | **Absent.** No equivalent guidance anywhere in the base prompt. |

**Why no merge here:**

1. **`worker` is not the right seam.** A `developer_instructions` block on `worker` would only affect agents spawned with `agent_type="worker"`. File-creation discipline should apply to the top-level codex session and to every role, not just worker. Adding rules to worker leaves the main-agent flow untouched — which is the more common path.
2. **The right seam is the base prompt, which is upstream-canonical.** `core/gpt_5_2_prompt.md` (and the `gpt_5_1` / `gpt-5.2-codex` / `gpt-5.1-codex-max` variants) is upstream-owned. Patching them directly violates `AGENTS.override.md` core tenet 1 (minimize upstream-canonical conflict surface). Acceptable overlay paths are: (a) launcher-injected `additional_instructions` via `~/.codex-copilot/config.toml`, or (b) a clean-room paraphrase added to a future intentional `worker.toml` *after* deciding worker should have a developer_instructions layer. Either is larger than this 30-minute audit task was scoped to.
3. **The behavioral gap is real but not load-bearing today.** No reported regressions trace to codex worker over-creating files or generating unsolicited READMEs. Codex's "surgical precision / don't overstep / don't gold-plate" framing covers the same intent with weaker enforcement.

**Follow-up tracking (not part of Phase 3b parity port):**
- Decide whether codex should sharpen base file-creation discipline via launcher-injected `additional_instructions`. Opens a separate question about which other Claude-Code rules (emoji guidance, absolute-path guidance — appended by `enhanceSystemPromptWithEnvDetails` on the Claude side) merit similar treatment.
- If a future PR introduces `worker.toml` for unrelated reasons (e.g., model pinning, reasoning-effort lock), these rules can ride along as paraphrased text. Creating `worker.toml` solely for them is unjustified ceremony.

**Closure:** no `worker.toml` created, no `role.rs` change, no codex submodule bump. Edit confined to this markdown amendment in codexu.

### 2.5 `statusline-setup` (**SKIP — Claude-specific**)

**Verdict: skip.** The agent's entire purpose is writing the `statusLine` field of `~/.claude/settings.json` with knowledge of Claude Code's specific JSON-stdin schema (model, context_window, rate_limits, vim, worktree, etc.). Codex has no `~/.codex/statusLine` setting. If codex later adds a status-line analog, *that* feature should ship with its own setup agent — not a port of this one.

### 2.6 `claude-code-guide` (**SKIP for now — Claude-specific content**)

**Verdict: skip the port; consider a codex-native analog later.** The agent's value is hard-coded to three documentation URLs (`code.claude.com/docs/en/claude_code_docs_map.md`, `platform.claude.com/llms.txt` ×2) and a list of Claude-Code-specific features (hooks, skills, MCP servers, IDE integrations).

A `codex-guide` would be valuable in principle, but it is a *new* agent inspired by the pattern, not a port:
- Needs stable codex docs URLs (do they exist? where? — needs investigation).
- Needs a feature inventory specific to codex (sandbox modes, permission profiles, plugin marketplace, etc.).
- Would still need `Web Fetch` / `Web Search` analogs in codex's tool surface.

Defer until codex documentation hosting is consolidated. Tracking item, not a Phase 3b deliverable.

---

## 3. Packaging — three options, ranked

### 3a. (Recommended Phase 1) **Overlay / fork built-ins via `include_str!()`**

Add `explorer.toml` content + new `plan.toml` + `verification.toml` to `core/src/agent/builtins/` and wire them in `role.rs:420–428`'s `config_file_contents()` switch.

**Pros:**
- Matches existing precedent (`explorer.toml`, `awaiter.toml` already work this way).
- Deterministic — every codex binary built from the fork has the roles.
- No install step for end users.
- Updates ship with the codex binary rebuild — same cadence as the rest of the fork.

**Cons:**
- Lives in `core/src/agent/role.rs`, which is **upstream-canonical code**. Per `AGENTS.override.md` core tenant 1, fork-exclusive code should live in overlay crates to minimize rebase conflict surface. Strictly applied, this means we should look for a seam to move out (e.g., a registry function that overlays can extend) rather than editing `role.rs` directly. If no such seam exists, this becomes a per-rebase merge conflict.
- Only benefits users of this fork's codex binary. Users running upstream codex don't get the roles.

**Mitigation:** Use the new role TOMLs in `builtins/` (those are content files, low conflict risk) and limit `role.rs` edits to a single match arm per role (low conflict surface). If conflicts mount during rebase, propose an upstream patch that exposes a registration seam.

### 3b. (Recommended Phase 2 / parallel) **Plugin in `packages/codexu-plugin/`**

Ship the same role TOMLs as plugin assets that materialize into `~/.codex/config.toml` and `~/.codex/agents/` on install.

**Pros:**
- Updateable via the plugin marketplace cadence (faster than waiting for codex binary rebuilds).
- Benefits upstream-codex users too, not just fork users.
- User can edit installed copies under `~/.codex/agents/` to customize.

**Cons:**
- **Codex plugin manifest does NOT register `[agents.<role>]` today** — this is the same gap Phase 3b-i flags for ralph's 12 internal subagents (`plans/codexu-roadmap.md:2031–2033`). Requires either upstream contribution to codex's plugin loader, OR an in-plugin installer script that writes to `~/.codex/`.
- An installer script that mutates `~/.codex/config.toml` is risky (collides with user edits, merge logic non-trivial, no clean uninstall).

**Recommendation:** Pursue 3a now; pursue 3b as a follow-up once the upstream `[agents.<role>]` registration gap is closed. Both ports use the same TOML content — the *only* difference is the distribution channel. Roles in `~/.codex/config.toml` override built-ins (per `apply_role_to_config()` at `role.rs:40–56`), so a plugin-installed role automatically supersedes the same-name built-in.

### 3c. (Reject) **`codex agent install --preset claude-code-equivalents` CLI**

A one-shot CLI command that materializes the role TOMLs to `~/.codex/agents/` on first invocation.

**Cons that kill this option:**
- No `codex agent` subcommand exists today (grep across `cli/src/*.rs` returned no handlers — confirmed by research).
- Adds a new CLI surface area that needs design, tests, and docs.
- "One-shot install" with no update mechanism is a footgun: users carry stale prompts forever once installed, and re-running the command is destructive to any local edits.
- The only advantage over 3b is "explicit opt-in" — which 3b can offer too via a per-skill prompt or plugin-install confirmation.

**Verdict:** No. Don't build new CLI for distribution when overlay-built-in works.

---

## 4. License posture — paraphrase, do not copy verbatim

**Source state (verified during research):**
- `D:/harness-efforts/claude-code/worktrees/main/` has **no LICENSE / LICENSE.md / LICENSE.txt / COPYING / NOTICE file** at root or in `src/`.
- `package.json` declares `"license": "SEE LICENSE IN LICENSE.md"` — but that referenced file does **not exist**.
- `README.md` states "The source code copyright belongs to Anthropic … This repository is an **unofficial** version, reconstructed from the source map of the public npm release package. It is **for research and learning purposes only** and does not represent the internal development repository structure of Anthropic … **do not use it for commercial purposes**."
- Package version is `999.0.0-restored` — a reconstruction marker.
- No `Copyright Anthropic` headers in the individual agent `.ts` files.

**Legal posture:**
- Reconstruction from source maps does **not** grant the reconstructor any IP rights; Anthropic retains copyright on the underlying prompt text.
- The reconstruction's `README` explicit non-commercial framing is its own self-restriction layered on top of Anthropic's reserved rights — neither permits us to ship the verbatim prompts inside codex.
- The behavior *contracts* themselves (read-only enforcement, three-verdict output line, "command run / output observed / result" check format, "adversarial probes" categories) are functional patterns, not copyrightable expression. Those are safe to keep.

**Recommendation:**
- **Paraphrase the prose** — rewrite each prompt in our own words, preserving structure, intent, output contracts, and process steps.
- **Do not copy whole paragraphs**, even with minor edits. The Verification prompt's "two documented failure patterns" framing, the Plan prompt's "Critical Files for Implementation" footer label, and the Explore prompt's "READ-ONLY MODE" preamble each need to be reworded.
- **Replace product-name references**: no "Claude Code, Anthropic's official CLI for Claude"; say "the codex agent" or describe the role functionally.
- **Cite inspiration in a comment header** in each new `.toml` (e.g., `# Inspired by the design of Claude Code's built-in Explore subagent`) — transparency is good practice and reinforces that we considered provenance.
- **Before merging:** have someone (ideally the operator + any internal reviewer) re-read the rewritten prompts side-by-side against the originals to confirm no large verbatim spans remain. A simple `diff`-of-tokens check is sufficient.

**What to actually check on Anthropic's site** (not done in this research — flagged for follow-up): `https://www.anthropic.com/legal/commercial-terms` and any Claude Code-specific terms for derivative-work clauses. If Anthropic's commercial terms forbid even paraphrased derivatives of Claude Code prompts, we'd need to fall back to clean-room rewrites with no reference to the originals. The conservative recommendation here (paraphrase + cite inspiration) should be safe in most interpretations of normal copyright law, but is **not** a legal opinion.

---

## 5. Cross-reference with Phase 3b-i (ralph's 12 internal subagents)

**Phase 3b-i** (`plans/codexu-roadmap.md:1988–2037`) is the analogous port for ralph's internal subagents — `code-fixer`, `code-reviewer`, `criteria-validator`, `docs-reviewer`, `docs-updater`, `dsat-analyst`, `plan-reviewer`, `progress-analyst`, `refactoring-agent`, `security-fixer`, `security-reviewer`, `story-doctor` (12 total). That port is **operator-private** — only ralph users see these roles.

**This work (native palette port) is operator-public** — every codex user (ralph or not) sees `explorer`, `plan`, `verification`.

**Shared mechanics:**
- Both use `[agents.<role>]` + role config files via `agent_roles.rs`.
- Both need the codex plugin manifest's `[agents.<role>]` registration gap closed (currently flagged at `codexu-roadmap.md:2031–2033`) if we want plugin-distribution rather than fork-built-in distribution.
- Both share the `spawn_agent` invocation contract (Phase 3a-tail-ii: `agent_type` + `message` + `task_name`, `deny_unknown_fields`).
- Both share the result-collection contract gap (Phase 3a-tail-iii: `spawn_agent` returns `{ task_name, nickname }` + events, not inline output like Claude's `Agent(...)`).

**Recommended sequencing:**
1. **Phase 3b-i first** (smaller blast radius — internal ralph users only; 12 roles already specified in the roadmap).
2. **Then this work** (broader exposure — every codex user — so the toolchain has settled before public roles ship).
3. **Then plugin distribution** (3b above) for both, once upstream codex's plugin manifest learns `[agents.<role>]` registration.

**Toolchain to share between the two ports:**
- A small Rust test that validates every built-in role TOML parses, has non-blank `developer_instructions`, and has a valid `permission_profile`.
- A markdown lint that flags large verbatim spans against any reference source (cheap safeguard for the license posture in §4).

---

## 6. Open questions to surface before opening implementation tasks

These are **gating** questions — they should be answered before the first follow-up implementation task is opened, not deferred into "we'll figure it out during implementation."

1. **`role.rs` edit policy.** Per `AGENTS.override.md` core tenant 1, fork-exclusive code lives in overlay crates. The "Recommended Phase 1" plan above edits `core/src/agent/role.rs` directly (3 new match arms + 3 `include_str!()`s + extending the built-ins table). Is that acceptable, or do we need to first design an extension seam (e.g., a builtin-roles registry function that overlays can append to) and propose it upstream? The conservative read of tenant 1 says move-seam-first; the pragmatic read says three small match-arm edits is a low-conflict surface worth tolerating.

2. **`omitClaudeMd` analog.** Claude's `Explore` and `Plan` set `omitClaudeMd: true` so they don't pay the cost of loading the project doc on every spawn. Does codex have an analog? If not, do we want one? Affects whether the `explorer` and `plan` roles can be as fast as their Claude counterparts.

3. **Browser MCP availability.** The `verification` prompt assumes `mcp__claude-in-chrome__*` / `mcp__playwright__*` MCPs may be present. Does this codex fork ship either? If neither, the frontend-verification strategy section needs to drop those references; if one of them is available, the prompt should name it correctly.

4. **`workspace-write` permission profile semantics for `verification`.** Does codex's `workspace-write` profile allow writes to `$TMPDIR` outside the project tree? The Claude prompt explicitly relies on temp-script writing for multi-step harnesses. If `workspace-write` is project-scoped only, we either need a new permission profile or we drop the temp-script affordance from the codex version.

5. **Test/regression baseline.** What's the smoke-test plan for "a built-in role parses, dispatches, and produces sensible output"? Should we add to `codex-invariant-tests` (the overlay test crate, `codex/codex-rs-overlay/codex-invariant-tests/`), or piggyback on existing `agent_roles.rs` tests in upstream core?

6. **`general-purpose` vs `worker` prompt diff.** ~~Before merging anything, line up Claude's `general-purpose` prompt against codex's current `worker` system prompt.~~ **Resolved 2026-05-13 — see §2.4 audit result.** Outcome: no-op merge. `worker.toml` does not exist (worker has `config_file: None` at `role.rs:382–394`); the two candidate rules are gaps in codex's *base* prompt, not at the worker layer, and the right seam for sharpening them is overlay-injected `additional_instructions` — out of scope for the parity port.

---

## 7. Common mistakes / confusion points (for future agents)

These are the gotchas an implementer should expect when actually opening follow-up tasks. Saved here so future-me doesn't re-discover them.

- **The Claude Code source path is `D:/`, not `C:/`.** The user's original prompt said `C:/harness-efforts/claude-code/worktrees/main/`. That path does not exist. The real path on this machine is `D:/harness-efforts/claude-code/worktrees/main/`.
- **Codex's vendored source is two layers deep, not one.** Don't grep `D:/harness-efforts/codexu/codex/` — that's the wrapper. The actual codex source is at `D:/harness-efforts/codexu/codex/external/repos/codex-patched/codex-rs/`. Search there for `role.rs`, `agent_roles.rs`, `config_toml.rs`, etc.
- **`[agents.<role>]` config-file fields don't include a `system_prompt` key.** The field is `developer_instructions` (per `AgentRoleToml` → flattened `ConfigToml`). Searching for `system_prompt` in role TOMLs will find nothing.
- **Built-in role TOMLs are embedded via `include_str!()`, not read from disk.** Editing the TOML file alone is insufficient — the file must already be referenced in `role.rs`'s `config_file_contents()` switch. New built-ins need both the file and the match-arm.
- **Roles in `~/.codex/config.toml` win over built-ins** (per `apply_role_to_config()`). This is *by design* — it means a plugin-installed override always supersedes a fork-built-in. Don't be surprised if your edits to `explorer.toml` "don't take effect" — check whether the user has `[agents.explorer]` defined in their personal config.toml.
- **Plugin marketplace install copies plugin into `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`.** Editing the source in `packages/codexu-plugin/` does NOT update an installed plugin. To test plugin changes, edit the cache copy in place OR delete the cache version and reinstall.
- **The Claude Code worktree is a reverse-engineered dump, not the canonical source.** Treat it as documentation of behavior, not as a license-clean reference. See §4.

---

## Files to change (when implementation tasks open)

Edit (new content / new entries):
- `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/explorer.toml` (fill empty stub)
- `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/plan.toml` (new file)
- `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/verification.toml` (new file)
- `codex/external/repos/codex-patched/codex-rs/core/src/agent/role.rs` (extend built-ins table + `config_file_contents()` switch with two new arms)
- `plans/codexu-roadmap.md` (link this doc as a Phase 3b sibling near lines 1988–2037)

Reference (read-only, for inspiration / contract semantics):
- `D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/exploreAgent.ts`
- `D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/planAgent.ts`
- `D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/built-in/verificationAgent.ts`
- `D:/harness-efforts/claude-code/worktrees/main/src/tools/AgentTool/builtInAgents.ts`
- `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/explorer.toml` (current empty stub — note for delta sizing)
- `codex/external/repos/codex-patched/codex-rs/core/src/agent/builtins/awaiter.toml` (existing built-in for TOML-shape reference)
- `codex/external/repos/codex-patched/codex-rs/core/src/config/agent_roles.rs` (validation rules)
- `codex/external/repos/codex-patched/codex-rs/config/src/config_toml.rs:668–681` (`AgentRoleToml` schema)
- `AGENTS.override.md` (core engineering tenants — read tenant 1 before deciding §6 question 1)
- `plans/codexu-roadmap.md:1988–2061` (Phase 3b-i + 3b-ii — the ralph-internal sibling port)

Possibly to add (depending on §6 answers):
- `codex/codex-rs-overlay/codex-invariant-tests/` — new test that parses each built-in role TOML and validates the `developer_instructions` non-blank rule + permission profile validity.

---

## Recommended follow-up task surface

Three implementation tasks, opened in this order:

1. **`port-explorer-prompt`** — Fill `explorer.toml` with a paraphrased Explore prompt. Smallest delta, fastest validation. No `role.rs` change needed (file already wired).
2. **`port-plan-and-verification-roles`** — Add `plan.toml` + `verification.toml` + their `role.rs` match arms. One PR; both new built-ins share the same plumbing change. Resolve §6 questions 1, 4, and 5 before opening.
3. ~~**`audit-general-purpose-vs-worker`** — 30-minute task: diff Claude's `general-purpose` prompt against codex's current `worker.toml` content; merge any missing rules.~~ **Done 2026-05-13.** Outcome: no-op merge — see §2.4 audit result. The original framing assumed `worker.toml` existed; it doesn't. Real gaps live at the base-prompt layer and need a different seam.

Tasks #4+ (plugin distribution per 3b, `codex-guide` analog per 2.6, upstream registration-seam patch per §6 Q1) are deferred until #1–3 land.
