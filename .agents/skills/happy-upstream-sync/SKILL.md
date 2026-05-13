---
name: happy-upstream-sync
description: >
  Periodic procedure (every 2-4 weeks) for reviewing new commits in
  upstream `slopus/happy` since our last sync, deciding per-commit
  whether to cherry-pick, manually apply, defer, or skip given how
  far this fork has diverged. Anchored on the upstream LATEST RELEASE
  (not raw HEAD) so the sync targets a stable cut. Use when the user
  asks "what's new in upstream?", "let's sync from slopus", or when
  a notable upstream release lands. Companion to
  `happy-triage-upstream-prs` (open PRs) and `happy-merge-to-fork-main`
  (consolidating fork branches).
---

# /happy-upstream-sync — review upstream commits since last sync

Upstream `slopus/happy` ships ~50-100 commits per month. This fork
diverged heavily (5 Sprints of Dev Tunnels migration + the e-ink
tablet UX work + per-machine architecture) — the upstream main branch
is no longer a drop-in fast-forward target. This skill walks the
diff one commit at a time and produces a triage record.

## When to run

- Every 2-4 weeks of calendar time
- After a notable upstream release (read the release notes first)
- When the operator wants to audit cherry-pick candidates

Last full sync: **2026-05-03 (commit `25fe2cf3`)** — absorbed 79
upstream commits / 1971 files / 25 conflicts, per
`plans/codexu-roadmap.md` "Upstream merge 2026-05-03". The next sync
should resume from that commit's upstream-side parent.

## Procedure

### 1. Identify the upstream target

The sync is anchored on the **latest upstream release**, not raw
`origin/main` HEAD. Releases are stable cuts; HEAD may be mid-PR-stack.

```bash
# What's the latest release of slopus/happy?
gh api repos/slopus/happy/releases/latest --jq '{tag: .tag_name, sha: .target_commitish, published: .published_at, name: .name}'

# Resolve tag → commit SHA if target_commitish is a branch name
gh api repos/slopus/happy/git/refs/tags/<tag> --jq .object.sha
```

Note both values for the sync log: the release tag, the resolved
SHA, and the publish date.

### 2. Identify our last-synced upstream commit

```bash
# Read the previous sync record:
grep -E "^Last sync:|^## Sync" docs/fork-notes.md | head
# Or look at the roadmap for "Upstream merge YYYY-MM-DD":
grep "Upstream merge" plans/codexu-roadmap.md
```

The previous sync's upstream SHA is the LEFT side of this sync's
diff range.

### 3. List the commits to triage

```bash
git fetch origin   # 'origin' is slopus/happy per fork-notes.md
git log <last-synced-upstream-sha>..<latest-release-sha> --oneline --no-merges > /tmp/codexu-upstream-commits.log
wc -l /tmp/codexu-upstream-commits.log
```

Eyeball the count — `< 30` is a single-session triage; `30-100` is
a half-day; `> 100` schedule a full day or split into batches.

### 4. Per-commit triage

For each commit, classify into one bucket:

| Verdict | When | Action |
|---|---|---|
| **Cherry-pick** | Touches files we DON'T diverge on; clean improvement; no dependencies on upstream code we've replaced | `git cherry-pick <sha>` — fast path |
| **Manual** | Touches files we DO diverge on; the spirit applies but the diff won't | Read the upstream change, write the equivalent against our code, single commit referencing the upstream sha |
| **Defer** | Useful but blocked on other work (e.g., needs a feature we'd revert later) | Note in sync log; revisit next sync |
| **Skip** | Not relevant — touches code we deleted (e.g., upstream auth flow, libsodium encryption, multi-tenant server) | Note in sync log with reason |

**Heuristics for fast classification** (before reading the diff):

- Files under `packages/happy-app/sources/sync/` → likely Manual (we
  rewrote significant parts in Sprint D + apiSocket refactor 2026-05-13)
- Files under `packages/happy-server/sources/` → likely Skip or Manual
  (single-user embedded daemon; multi-tenant code paths are dead-weight
  pending userid-cleanup task)
- Files under `packages/happy-cli/src/api/` → likely Skip (we deleted
  encryption, replaced auth flow, etc.)
- Files under `packages/happy-app/sources/components/` → likely
  Cherry-pick if a pure UI improvement
- Files under `docs/` or comments-only → Cherry-pick unless they
  contradict our fork's direction
- "feat: add libsodium" or "feat: account-based auth" → Skip
  (philosophical divergence)
- "fix: ..." bug fixes in code we still have → Cherry-pick
- "refactor: ..." in code we've replaced → Skip

Track decisions in real time as you go:

```
# Sync log line per commit:
# <sha> <verdict> <one-line-rationale>
abc12345 cherry-pick fix(MarkdownView): preserve trailing whitespace in code blocks
def67890 skip refactor(auth): unify account session API — we deleted account auth
123abcde manual feat(sessions): add archive icon — we have different session-actions menu; port the icon to ours
```

### 5. Apply the decisions

```bash
# Cherry-picks: do them sequentially, fix conflicts inline
git cherry-pick <sha1>
git cherry-pick <sha2>
# ...

# Manual applies: one commit per upstream commit being honored
# Include "manual port of upstream <sha>" in the commit body so
# the link back is preserved.
```

For batches with conflicts: prefer `git cherry-pick -n <sha>` (no-
commit) for several adjacent commits, then resolve + a single
combined commit `chore(upstream-sync): port slopus/happy <sha>..<sha>`.

### 6. Verify

```bash
# Cross-package typecheck
pnpm --filter "{packages/happy-server}" --filter "{packages/happy-cli}" \
     --filter "{packages/happy-app}" --filter "{packages/happy-agent}" \
     --filter "{packages/happy-wire}" exec tsc --noEmit 2>&1 \
     | tee /tmp/codexu-upstream-sync-tc.log

# happy-app tests (the most likely to surface a regression)
pnpm --filter "{packages/happy-app}" exec vitest run 2>&1 \
     | tee /tmp/codexu-upstream-sync-tests.log
```

Both must be green before the next step.

### 7. Update the tracking docs

Update **the four canonical sync-trail docs** in one commit:

1. `docs/fork-notes.md` — the upstream-history table
2. `plans/codexu-roadmap.md` — the "Upstream merge YYYY-MM-DD" bullet
   (under the Status section)
3. `packages/happy-app/CHANGELOG.md` — if any user-visible UI changed
4. `packages/happy-app/sources/changelog/changelog.json` — regenerate:
   `npx tsx packages/happy-app/scripts/parseChangelog.ts`

The roadmap bullet template:

```markdown
**Upstream merge YYYY-MM-DD (commit `<our-merge-sha>`):**
absorbed N upstream commits (range `<old-sha>..<new-sha>` covering
slopus/happy release `<tag>` from <date>); cherry-picked C, manually
applied M, skipped S, deferred D. Headline upstream additions: ...
Fork divergences kept: ...
```

### 8. Final commit

```
chore(upstream-sync): absorb slopus/happy through <tag> (<count> commits triaged)

C cherry-picked · M manually applied · S skipped · D deferred. See
docs/fork-notes.md and plans/codexu-roadmap.md for the per-commit
trail.

Skipped categories: <list>
Deferred to next sync: <list>
```

Push to `Evyatar108/codexu` main once typecheck + tests are green.

## Pitfalls (from the 2026-05-03 sync)

- **`react-native-reanimated` bumps in upstream** pull Flow `import
  typeof` syntax through the import chain, which bypasses the vitest
  RN stub. If you cherry-pick such a bump, expect a test-setup
  follow-up.
- **`MarkdownView.tsx` table-layout absorbed upstream's row-based
  layout but kept `AnimatedMarkdownText`** for font scaling. Future
  upstream changes to `MarkdownView` are likely Manual, not Cherry-pick.
- **`modeHacks.test.ts` / `modelModeOptions.test.ts` / `settings.spec.ts`
  / `useSessionQuickActions.test.tsx`** are the four tests that broke
  on the 2026-05-03 sync; they're the canary set — verify those before
  finishing.
- **The `ToolDiffView` dual-path** (PR review-conflict resolution
  2026-05-03 commit `1c978964`) collapsed into one PierreDiff path.
  Future upstream changes to `ToolDiffView` need careful manual port.
- **`docs/fork-notes.md` line 24** explains the `D:/harness-efforts/happy`
  vs `D:/h` worktree convention — out of date; we now use
  `C:/harness-efforts/codexu/`. Don't re-introduce stale paths from
  upstream docs.

## Companion skill (codex side)

The codex submodule (`gim-home/codex`) has its OWN upstream-sync
procedure at `codex/.claude/commands/rebase-upstream.md` +
`codex/.claude/commands/sync-upstream.md`. That handles the subtree
mirror of `openai/codex` inside the codex submodule. **Run it
separately and on a different cadence** — codex moves faster than
happy upstream, and the rebase model is different (subtree merge
vs cherry-pick).

The codexu-side tracking task `codex-upstream-rebase` in
`plans/parallel-assignments.md` is a reminder to run that submodule
procedure; the actual steps live in the codex submodule's doc.

## Cadence (when to schedule the next run)

- Default: every 4 weeks
- Sooner: if upstream ships a notable release (>30 commits since
  last sync) or a security fix
- Later: if our diff load is high and we'd just defer most of it
