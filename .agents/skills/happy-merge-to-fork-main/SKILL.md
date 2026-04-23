---
name: happy-merge-to-fork-main
description: >
  Land a code-complete feature branch on the fork's consolidated `main`,
  using the fork's `--no-ff` convention, and update the three discovery
  docs (`fork-notes.md`, `fork-roadmap.md`, `packages/happy-app/CHANGELOG.md`
  + regenerated `changelog.json`) in lockstep so divergence stays
  navigable. Use after typecheck + tests are green on a feature branch
  (often stacked on a base fix branch like `feat/X` on `fix/Y`). Do NOT
  use for draft/WIP merges or for PRs heading upstream to
  `slopus/happy` — that is a different workflow.
---

# /happy-merge-to-fork-main — land a feature on the fork's `main`

The fork deliberately keeps `main` as the "consolidated personal work"
branch, diverged from upstream `slopus/happy`. Every feature branch that
passes review lands here with `--no-ff` so per-story commits stay intact
and the merge boundary is recoverable. Then three docs get updated in
one commit or discoverability decays.

## Fork conventions that matter

- **Target is literally `main`.** Not a separate personal branch. Earlier
  `docs/fork-notes.md` wording implied `main` tracks upstream clean —
  that's stale. Verify divergence against the current state, not the doc
  (`git log --oneline origin/main..HEAD | wc -l`).
- **Always `--no-ff`.** Per-story / per-fix commits on feature branches
  are finely scoped; a fast-forward flattens them and loses the merge
  boundary. Future triage relies on the merge commit existing.
- **Stacked feature branches drag their base in.** If `feat/X` is stacked
  on `fix/Y`, merging `feat/X` into `main` also lands `fix/Y`. Record
  both branch names in the merge-commit body so the history stays
  greppable.

## Where things live

- Branch state of record: `docs/fork-notes.md` → branch table + the
  per-merge `## What's on main after YYYY-MM-DD <feature> merge` section.
- Shipped/planned roadmap: `docs/fork-roadmap.md` → `## Shipped` section
  (newest-first) + `## Near-term` / `## Further out` to prune.
- User-facing changelog: `packages/happy-app/CHANGELOG.md` (versioned
  `## Version N - YYYY-MM-DD` entries).
- In-app changelog JSON (generated): `packages/happy-app/sources/changelog/changelog.json`.
- Regenerator: `packages/happy-app/sources/scripts/parseChangelog.ts`.
- Changelog style rules: `packages/happy-app/CLAUDE.md` → "Changelog Management".
- Skill files the fork carries: `.agents/skills/happy-*/SKILL.md`.

## Procedure

### 1. Preconditions

- Feature branch is code-complete, reviewed, typechecks clean, tests
  green.
- Working tree on the feature branch: untracked files OK, uncommitted
  edits NOT OK.
- If Ralph drove implementation and `agent-browser` was *not* exposed to
  the iteration engine, UI-story acceptance evidence will be `SKIPPED`.
  Those stories need on-device verification before the push — not
  before the merge, but before the push. Plan for a tablet rebuild via
  `D:\h` (see `.agents/skills/happy-tablet-iterate/SKILL.md`).

### 2. Checkout `main`, merge `--no-ff`

```bash
git checkout main
git merge --no-ff <feature-branch> -m "$(cat <<'EOF'
merge: <feature-branch> (+ <base-fix-branch> if stacked) — <one-line summary>

<feature-branch>: <what it does in one line>
<base-fix-branch>: <what it does in one line>   # omit if not stacked

Review: N code findings fixed, docs round, security round clean.
Pending manual verification: <list UI stories whose Ralph evidence was SKIPPED, or "none">.
EOF
)"
```

The merge commit message matters — future triage of fork divergence
uses it. Include: both branch names, one-line summary of each, review
outcome, and the pending manual-verification list.

### 3. Typecheck every changed package

Watch for the `happy-cli` trap:

- `happy-app`: `pnpm --filter happy-app typecheck` — works.
- **`happy-cli`: the pnpm filter does NOT match.** The package name in
  `packages/happy-cli/package.json` is literally `happy`, not
  `happy-cli`. `pnpm --filter happy-cli typecheck` silently returns
  exit 0 without typechecking anything. Instead:
  ```bash
  cd packages/happy-cli && npx tsc --noEmit
  ```

### 4. Update three docs + regenerate changelog.json (one commit)

All three docs move together or the fork decays.

**`docs/fork-notes.md`**
- Update the branch-table row for `main`: new commit count against
  `origin/main`, refreshed "What's in it" cell.
- Add rows for any newly-merged branches (mirror existing row style).
- Add a new section `## What's on main after YYYY-MM-DD <feature>
  merge`. Link to authoritative artifacts (Ralph job `plan.md`,
  `dsat-report.md`, review notes) — don't duplicate their content.

**`docs/fork-roadmap.md`**
- Add `### YYYY-MM-DD — <feature>` at the top of `## Shipped` (newest
  first). Use prior entries as the template: numbered list, one item
  per logical scope, commit SHAs.
- Scan `## Near-term` and `## Further out` for items now shipped or
  obsoleted by this merge. Strike through with
  `~~...~~ **— shipped YYYY-MM-DD**` when superseded, don't delete
  (deletions lose the planning history).

**`packages/happy-app/CHANGELOG.md`**
- Increment version: check latest `## Version N - ...`, add +1.
- Use the format from `packages/happy-app/CLAUDE.md` "Changelog
  Management": ISO date, user-facing perspective, verb-first bullets,
  brief summary paragraph before the bullets, header
  `## Version N - YYYY-MM-DD`.

**Regenerate the in-app JSON** (the changelog screen reads this file,
not the markdown):

```bash
cd packages/happy-app && npx tsx sources/scripts/parseChangelog.ts
```

Stage `changelog.json` alongside the markdown edits. Commit the three
docs + regenerated JSON as a single docs commit.

### 5. Skill-file drift check

Before closing out, make sure no skills got stranded on personal
branches. Example from 2026-04-22: `happy-probe-claude-sdk` and
`happy-triage-upstream-prs` were authored on
`feature/tablet-sidebar-toggle`, a port commit (`0213dbfb`) missed
them, and they only hit `main` after an extra port round.

```bash
git diff --name-status main <personal-branch> -- .agents/skills/
```

Any `SKILL.md` present on the personal branch but not `main` should be
ported as a separate commit:

```bash
git checkout <personal-branch> -- .agents/skills/<orphan-skill>/
git commit -m "docs: port <orphan-skill> skill from <personal-branch>"
```

### 6. Hand back, do NOT push

The fork's push gate is on-device verification for anything Ralph
couldn't exercise in the browser. Report to the user:

- merged-commits summary (SHAs, branches),
- typecheck outcomes per package,
- pending manual-verification list (what to rebuild and exercise on
  tablet),
- push-readiness assessment.

Only push once the user confirms or after the tablet round is done.

## Golden rules

1. **`--no-ff`, always.** Every merge to `main` carries a merge commit.
   If you catch yourself running `git merge <branch>` without the flag,
   stop and redo.
2. **Update all three docs in one commit.** `fork-notes.md`,
   `fork-roadmap.md`, `CHANGELOG.md` (+ regenerated
   `changelog.json`). Splitting them across commits makes bisect and
   cherry-pick worse, and one of them always gets forgotten.
3. **Regenerate `changelog.json` every CHANGELOG edit.** The in-app
   feature reads the JSON, not the markdown. If you forget, users see
   a stale list.
4. **Typecheck `happy-cli` with `tsc`, not with the pnpm filter.** The
   filter is silently a no-op. This has bitten us.
5. **Don't push before the manual-verification list is empty.** If Ralph
   emitted `SKIPPED` UI evidence, the merge is provisional until the
   tablet says otherwise.

## Gotchas

- **`LF will be replaced by CRLF` warnings** on every commit on Windows
  are pre-existing repo noise (mixed line-ending history) — not
  introduced by the merge. Ignore.
- **`docs/fork-notes.md` "tracks upstream clean" wording** is
  historically stale; don't trust the prose. Trust
  `git log --oneline origin/main..HEAD | wc -l`.
- **`pnpm --filter happy-cli ...` is silently a no-op.** The
  `packages/happy-cli/package.json` `"name"` is `happy`. If you don't
  remember this, a passing typecheck means nothing.
- **Merge-commit message text is load-bearing.** Future fork-divergence
  triage greps it. Include both branch names when stacked, review
  outcome counts, and pending verification gaps.
- **Skill drift is real.** Skills authored mid-feature on a personal
  branch routinely get forgotten on merge-to-main. Always run the
  drift check.

## Related

- `docs/fork-notes.md` — canonical branch state and the
  "what's on main after..." sections you just updated.
- `docs/fork-roadmap.md` — shipped / near-term / further-out log.
- `packages/happy-app/CLAUDE.md` → "Changelog Management" — the format
  rules and the `parseChangelog.ts` step.
- `.agents/skills/happy-triage-upstream-prs/SKILL.md` — sibling, inverse
  direction (pulling FROM `slopus/happy` upstream into this fork).
- `.agents/skills/happy-probe-claude-sdk/SKILL.md` — sibling; often
  referenced from the post-merge `fork-notes.md` section when a merge
  changes the happy-cli ↔ Claude Code SDK boundary.
- `.agents/skills/happy-tablet-iterate/SKILL.md` — the on-device loop
  used to discharge the pending-manual-verification list before pushing.
