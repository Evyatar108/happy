# Upstream merge batch — 2026-04-22

Plan for cherry-picking a curated set of open `slopus/happy` PRs into this fork's `main`.

Triage source: `.agents/skills/happy-triage-upstream-prs/SKILL.md` — initial pass run 2026-04-22 during the native-and-installed-skills planning session. Verdicts reproduced below; re-verify each PR is still `open` at execution time.

Not for upstream contribution. Execution landing spot is the fork's consolidated `main` branch (which now diverges from upstream by ~42 commits).

## Goal

Land the zero-risk / low-risk upstream correctness fixes this fork has been deferring. Biggest single win: **PR #1061** (filter isMeta messages) pairs with our #779 fix — plugin skills will both *load* and *render cleanly* after this batch.

## Scope

### In scope — zero-risk correctness (6 PRs)

| PR | Title | Touches | Why |
|---|---|---|---|
| **#1145** | `fix(reducer): preserve agent text when msg has both text + internal tool-call` | `sources/sync/reducer/{messageToEvent.ts,reducer.ts}` | Silent text loss bug; small diff with rationale in PR body. |
| **#1061** | `fix: filter out isMeta messages to prevent Skill content polluting chat` | `happy-cli/src/claude/utils/sessionProtocolMapper.ts` | Pairs with our #779 fix — with plugins now loading, this prevents skill bodies from flooding the chat. |
| **#633** | `fix(sync): accept non-text content types in tool_result schema` | `sources/sync/typesRaw.ts` | Fixes an undismissable error dialog on startup when SDK emits non-text `tool_result` blocks. One-line. |
| **#1101** | `fix: avoid stack overflow in encodeBase64 for large buffers` | Web base64 path | Stack overflow on large pastes/images (web only). Has test. |
| **#1049** | `fix: persist change_title to Claude Code local JSONL` | `happy-cli/.../startHappyServer.ts` | Titles now appear in `/resume` picker and status bar. |
| **#1157** | `fix(cli): map happy permission modes to Claude SDK form in handleModeChange` | `happy-cli/src/.../handleModeChange` | Yolo-from-mobile was a no-op before this; maps happy mode → Claude SDK form. |

### In scope — CLI correctness (review individually) (4 PRs)

| PR | Title | Touches | Notes |
|---|---|---|---|
| **#699** | `prevent head-of-line blocking in OutgoingMessageQueue` | `happy-cli/src/claude/utils/` | Has tests. Semantic risk (ordering) — read test diff first. |
| **#692** | `sessionKill idempotent when process already exited` | `ops.ts` | 12+/6−, has test. Clean. |
| **#690** | `pass positional prompt args correctly to Claude CLI` | 3 files in `happy-cli/src/` | **Fork-conflict risk: edits the `--settings` flag path that our #779 fix owns.** Cherry-pick last; expect to hand-resolve. |
| **#1116** | `update session scanner path when Claude enters worktree` | 4 files in `happy-cli/src/claude/` | Relevant to our worktree-heavy workflow. |

### Opportunistic (optional) (2 PRs)

| PR | Title | Notes |
|---|---|---|
| **#1094** | `fix(codex,gemini): exact match for auto-approve tool names` | 2 files, tiny correctness. Codex/Gemini — secondary providers for us, but zero-cost. |
| **#862** | `Cmd+Enter / Ctrl+Enter to send messages` | 3 files. Tablet-keyboard QoL. Verify render cost on e-ink before merging. |

**Total intended:** 10 PRs (6 zero-risk + 4 CLI correctness). Opportunistic 2 are go/no-go at the end based on time + render verification.

### Out of scope / explicit skip

- **#316** — rival sidebar. Conflicts with our `feature/tablet-sidebar-toggle` work.
- **#1108** — lazy-load chat messages. Rewrites `ChatList`, conflicts with fork perf fix.
- **#823, #990** — touch `MarkdownView.tsx`, collides with our metadata-tag preprocessor.
- **#1078** (bookmark/pin sessions) — likely touches `session/[id]/info.tsx` which we just edited to add 3 new quick-action rows. Newly-risky post-skills-merge.
- All provider additions (#1135 Kimi, #1034 Copilot-ACP, #459/#460 OpenCode, etc.).
- **#1152** — Tauri desktop mega-PR (3000+ lines).
- **#1081** — file-diff sidebar mega-PR.

## Preconditions

Before starting:

1. **Current `main` is clean** — no uncommitted edits; untracked `.ralph/` and `logs/` are OK.
2. **Skills merge has been manually verified on the tablet** — this batch assumes the skills work actually renders correctly. If tablet verification of US-004/006/007/008/009 is still pending, do that first. Don't stack more changes on unverified ones.
3. **Upstream is fetched:** `git fetch origin`.
4. **Every listed PR is still open** on slopus/happy — PR numbers can close overnight. Run a quick sanity loop:
   ```bash
   for N in 1145 1061 633 1101 1049 1157 699 692 690 1116 1094 862; do
     echo -n "#$N: "
     gh pr view $N --repo slopus/happy --json state -q .state
   done
   ```
   Skip any that moved to CLOSED or MERGED.
5. **No new conflict-surface changes** on `main` since this plan was written. Re-run the happy-triage-upstream-prs skill if more than a week has passed.

## Strategy

### Branch layout

- Create a scratch integration branch: `upstream-batch-2026-04-22` from `main`.
- Cherry-pick PRs one-at-a-time into the batch branch, each as a clean commit with `-x` trailer so origin is preserved.
- Run targeted verification (typecheck + affected tests) after each cherry-pick.
- When the batch is complete and green, merge back to `main` with `--no-ff` (per `happy-merge-to-fork-main` skill).
- Docs update cycle per that skill (fork-notes + fork-roadmap + CHANGELOG + parseChangelog.ts).

Rationale for a batch branch (rather than picking straight onto main): easier to abandon the batch if a PR turns out to be landmine-y without polluting `main`'s history with reverts.

### Cherry-pick command pattern

For single-commit PRs:
```bash
gh pr view <N> --repo slopus/happy --json headRefOid -q .headRefOid
# → <SHA>
git fetch origin pull/<N>/head:pr-<N>
git cherry-pick -x pr-<N>  # -x preserves "cherry-picked from <SHA>" trailer
```

For multi-commit PRs:
```bash
git fetch origin pull/<N>/head:pr-<N>
git log --oneline main..pr-<N>  # inspect commits
git cherry-pick -x main..pr-<N>   # range pick, preserves SHAs via -x
```

If conflicts: hand-resolve, commit with a short "fork-resolution:" note in the commit trailer explaining what was hand-reconciled.

### Execution order

Ordered smallest-and-cleanest first to build confidence, CLI-before-app to keep conflict scope predictable, with **#690 saved for last** because it's the only PR touching our `--settings` fix's surface:

1. **#633** (1-line schema fix — smoke test)
2. **#1157** (CLI mode mapping — recent, freshest)
3. **#1049** (CLI change_title persist — small)
4. **#1061** (CLI isMeta filter — pair with #779)
5. **#1101** (web base64 stack overflow)
6. **#1145** (reducer text-loss — app side)
7. **#692** (sessionKill idempotent)
8. **#1116** (worktree session scanner)
9. **#699** (OutgoingMessageQueue — larger, test-dense)
10. **#1094** (Codex/Gemini exact match — optional, bundle if #9 went cleanly)
11. **#862** (Ctrl+Enter — optional, run on tablet before keeping)
12. **#690** ***last*** — probable `--settings` conflict with our #779 fix; hand-resolve with #779 as the base truth

### Per-cherry-pick verification gate

After each:

```bash
# happy-cli (remember: pnpm --filter does NOT match — package is named "happy")
cd packages/happy-cli && npx tsc --noEmit && cd -

# happy-app
pnpm --filter happy-app typecheck

# focused tests — pick tests whose files are in the diff
pnpm --filter happy-app test -- <file-paths-from-diff>
cd packages/happy-cli && npx vitest run <paths> && cd -
```

If a verification fails: DO NOT advance to the next PR. Options:
- (a) Hand-fix the regression in a follow-up commit on the batch branch.
- (b) Revert the offending cherry-pick (`git reset --hard HEAD~1`) and leave that PR for manual follow-up.

Don't accumulate known-broken commits on the batch branch — makes the final merge history misleading.

### Abort criteria

Abandon the whole batch (delete the branch, revisit next session) if:

- Any PR in the first 4 introduces a conflict that takes >30 min to resolve (signals surface divergence we underestimated).
- Two or more PRs break tests in ways that require real code changes (signals the fork's new surface is incompatible with the upstream direction, not a trivial rebase).
- `#690` conflict with #779 can't be resolved without effectively rewriting our fix.

Abort looks like:
```bash
git checkout main
git branch -D upstream-batch-2026-04-22
# re-triage via happy-triage-upstream-prs skill
```

## Per-PR detail

### PR #633 — tool_result non-text schema

- **Diff:** 1 line change in `typesRaw.ts` `rawToolResultContentSchema`.
- **Conflict surface:** none (we haven't touched typesRaw).
- **Test gate:** existing typesRaw specs.
- **Risk:** nil. Good first cherry-pick to warm up the flow.

### PR #1157 — permission mode mapping

- **Diff:** 4+/1−, single file `handleModeChange`.
- **Conflict surface:** none. We didn't touch permission handling in this batch.
- **Test gate:** any existing tests for `handleModeChange`.
- **Risk:** nil. Fresh (landed today upstream) — double-check no reviewer asked for changes since we triaged.

### PR #1049 — change_title persistence

- **Diff:** 39+/0−, one file `startHappyServer.ts`.
- **Conflict surface:** none.
- **Risk:** low. Pair nicely with #1145 later.

### PR #1061 — isMeta filter

- **Diff:** 9 lines in `sessionProtocolMapper.ts`.
- **Conflict surface:** low — we didn't touch `sessionProtocolMapper.ts` in the skills merge (we touched `claudeRemote.ts` at the init level, which is upstream of the protocol mapper). Verify at cherry-pick time.
- **Test gate:** `sessionProtocolMapper.test.ts` exists (11 tests mentioned in PR body).
- **Rationale:** with #779's plugins loading again, Skill tool bodies start flowing through the mapper as `isMeta: true` user messages → visible text. Before this fix, that meant ~thousands-of-char skill descriptions would dump inline into chats.

### PR #1101 — encodeBase64 stack overflow

- **Diff:** 46+/1−, 2 files including a test.
- **Conflict surface:** none. Web path.
- **Risk:** low. Note the native path is unaffected (uses `react-native-quick-base64`) so our Android tablet use case is mostly untouched, but it's still a correctness win.

### PR #1145 — reducer text preservation

- **Diff:** 22+/2−, two files: `sources/sync/reducer/messageToEvent.ts` and `reducer.ts`.
- **Conflict surface:** low. We didn't touch the reducer in the skills merge. The fork's prior divergent reducer work (if any) is in separate commits — `git log --oneline main -- sources/sync/reducer/` to inspect.
- **Test gate:** existing reducer specs. PR body notes "no new tests" — borderline; inspect the diff and decide if we want to add a regression test ourselves before merging onto main.

### PR #692 — sessionKill idempotent

- **Diff:** 12+/6−, two files `ops.ts` + test.
- **Conflict surface:** none.
- **Risk:** low.

### PR #1116 — worktree session scanner

- **Diff:** 61+/3−, 4 files in `happy-cli/src/claude/`.
- **Conflict surface:** low — we touched `claudeRemote.ts` at the init path, but `SessionStart` hook cwd handling is a different code path. Verify.
- **Rationale:** directly useful to the fork's worktree-heavy workflow (Ralph worktrees, `D:\h`, etc.).

### PR #699 — OutgoingMessageQueue HOL blocking

- **Diff:** 142+/12−, 1 file plus tests.
- **Conflict surface:** low — we didn't touch the queue.
- **Test gate:** PR includes tests — run them before/after cherry-pick to confirm they're actually asserting the right behavior on our branch too.
- **Semantic risk:** ordering change. Read the test file to understand what guarantees exist before/after. If the test covers the exact regression scenario ("immediately-ready background message blocked behind 250ms delay"), we're fine.

### PR #1094 — auto-approve exact match

- **Diff:** 7+/7−, 2 files (codex + gemini paths).
- **Conflict surface:** none.
- **Note:** we're Claude-first; secondary provider fix. Zero-cost pickup.

### PR #862 — Ctrl+Enter send

- **Diff:** 18+/2−, 3 files: `AgentInput.tsx`, `MultiTextInput{.tsx,.web.tsx}`.
- **Conflict surface:** `AgentInput.tsx` / composer area — did we touch it? Quick check: our skills merge's US-005 edited `SessionView.tsx` + `new/index.tsx`, not `AgentInput.tsx`. Likely clean.
- **Risk:** e-ink render cost — keydown listener should be memoized. Inspect before cherry-pick.
- **Verification:** needs tablet rebuild to confirm no jank on the composer (hardware keyboard case).

### PR #690 — positional prompt args

- **Diff:** 33+/10−, 3 files in `happy-cli/src/`.
- **Conflict surface:** **high risk.** This PR fixes a bug where positional prompts after `--settings` get eaten by the arg parser. Our #779 fix is all about what we pass via `--settings`. The arg-parser fix is probably orthogonal (we don't pass positional prompts through `generateHookSettings.ts`), but the same flag name is touched in multiple places.
- **Strategy:** save for last. When cherry-picking, read the full diff first. If the conflict is trivial (both edit different functions): resolve. If the conflict is in the same function as our #779 logic: STOP, file a follow-up issue, don't force it.
- **Fallback:** if we can't merge cleanly, the PR's fix is valuable enough to re-implement on top of our #779 fix as a fork-specific commit — but only if we're sure we're not dropping behavior from the upstream PR.

## Verification after the full batch

Before merging `upstream-batch-2026-04-22` back to `main`:

1. **Full typechecks clean:**
   ```bash
   pnpm --filter happy-app typecheck
   cd packages/happy-cli && npx tsc --noEmit && cd -
   ```
2. **All touched test files green:**
   ```bash
   pnpm --filter happy-app test
   cd packages/happy-cli && npx vitest run && cd -
   ```
3. **Manual smoke on tablet** (if any app-side PRs landed — at least #1145 and #1101):
   - Open a chat, verify no regressions in message rendering.
   - Paste a large image (tests #1101 on web; spot-check on native).
   - Skill-invocation chat (tests #1061 in context).

Only after all three pass: merge batch → `main` via `happy-merge-to-fork-main` skill.

## Post-batch docs update

Follow the `happy-merge-to-fork-main` skill playbook:

- `docs/fork-notes.md` — new branch row for the batch branch (or just a note on main's row mentioning the 10 picked PRs); new "What's on main after YYYY-MM-DD upstream batch" section with the PR list + links.
- `docs/fork-roadmap.md` — new `### YYYY-MM-DD — Upstream batch N` under Shipped; list each PR with its upstream link.
- `packages/happy-app/CHANGELOG.md` — version bump with user-facing bullets. Possible framing: "Fixes backported from upstream — better skill handling, title persistence, crash fix on large pastes, ..." + `parseChangelog.ts` regeneration.

## Risks & decision points

| Risk | Probability | Mitigation |
|---|---|---|
| #690 conflict with #779 requires rewrite | Medium | Save for last; abort if it can't be reconciled in <30 min. |
| One of the first 4 PRs introduces a test regression | Low | Revert and report rather than accumulating broken commits. |
| PR closed/merged upstream between triage and execution | Low | Pre-flight `gh pr view` loop filters out anything no longer open. |
| Semantic regression that typecheck doesn't catch | Medium | Tablet smoke test after batch. |
| `#862` causes composer render jank on e-ink | Medium | Explicit render check on tablet before keeping; drop from batch if it fights scroll. |
| Upstream maintainer rebases a PR on us | Low | Re-fetch and compare before cherry-pick. |

## Rollback

If the batch lands on `main` and a regression surfaces later:

- **Full revert** (nuclear): `git revert -m 1 <merge-sha>` — undoes the whole batch as one commit.
- **Surgical revert**: `git revert <individual-cherry-pick-sha>` — undoes a single PR's effect without touching the rest.

Because each PR is its own commit (thanks to `-x`), surgical reverts are clean. This is the main reason for the batch-branch-then-merge approach rather than squashing.

## Next action

Run the preconditions checklist. If all green, create `upstream-batch-2026-04-22` from `main` and begin with PR #633.

Realistic estimate: **1.5–3 hours** of interactive execution, assuming 2–3 cherry-picks need light conflict resolution. Can be partially delegated to a general-purpose agent per-PR (cherry-pick + typecheck + report), with the orchestrator (you or the main session agent) holding the sequence and deciding when to abort.
