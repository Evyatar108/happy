---
name: happy-triage-upstream-prs
description: >
  Rank open PRs in `slopus/happy` (upstream) for fork-merge candidacy.
  Use when the user asks "what's worth pulling from upstream?", "is there
  a PR for this bug?", or when a new upstream PR is referenced. Produces
  a MERGE / WATCH / WAIT-FOR-UPSTREAM / SKIP verdict per PR, respecting
  the fork's e-ink / tablet priorities and its known conflict surface.
  Not a generic PR reviewer — it bakes in knowledge of which upstream
  areas this fork has already diverged from.
---

# /happy-triage-upstream-prs — decide what to pull from `slopus/happy`

Upstream `slopus/happy` ships 5–15 open PRs in any given week. Most are
not a fit for this fork — either they conflict with work we already
carry, or they don't help the e-ink tablet use-case. This skill is the
filter.

## Fork priorities (strict → loose)

1. **Android e-ink tablet UX** — reduces redraws, animations, smooth-
   scroll ghosting, composer jank. Weak CPU/GPU, no real compositor.
2. **Performance for large chats / tablets** — virtualization,
   memoisation, reducer hotpaths.
3. **Correctness in the message pipeline** — user/agent text silently
   dropped, tool-use mis-rendered, metadata fields dropped in transit.
4. **Small QoL bug fixes** — clean diff, obviously correct, no
   architectural churn.
5. **Desktop / tablet-relevant features** — three-column layout, sidebar
   ergonomics, file-diff sidebars.
6. **Tools/agents config QoL** — hooks, permissions — only if small.

**Deprioritise / skip by default:** large architecture refactors,
new AI-provider additions (Kimi, OpenCode, Gemini, Copilot ACP) unless
blocking/trivial, web-only work, i18n/translation-only PRs, doc-only
PRs unless they fix something broken.

## Fork conflict surface (things we've already diverged on)

Reject PRs that touch these unless you're deliberately redoing the
fork's own change:

- **`ChatList` virtualization** / `MessageView` memoisation — upstream
  PR #1154 is ours; rival PRs (#1108 "lazy-load chat messages") will
  conflict.
- **Sidebar rendering** — we carry a three-state tablet sidebar on
  `feature/tablet-sidebar-toggle`. PR #316 and successors conflict.
- **`MarkdownView` metadata-tag parsing** — `processClaudeMetaTags` in
  `packages/happy-app/sources/components/markdown/MarkdownView.tsx` is
  fork-specific. PRs touching MarkdownView (#823, #990, others) need
  hand-cherry-picking of only the non-MarkdownView parts.
- **`chatFontScale`** — `sources/hooks/useChatFontScale.ts` + every
  per-tool-view `StyleSheet`. Rival typography-scaling PRs conflict.
- **Claude Code `--settings` tmpfile generation** — we carry
  `fix/preserve-user-settings-for-plugin-skills` (issue #779). Any PR
  touching `packages/happy-cli/src/claude/utils/generateHookSettings.ts`
  will conflict; merge ours first, rebase theirs.

## Procedure

### 1. Pull the full open list

```bash
gh pr list --repo slopus/happy --state open --limit 300 \
  --json number,title,author,additions,deletions,createdAt,updatedAt,isDraft,url \
  > /tmp/prs.json
```

Skim the JSON (or `jq`) for obvious skips: PRs &gt; ~800 LOC added that
aren't clearly bugfix-scoped, draft PRs, provider-addition PRs, Tauri
desktop megas, Docker-only PRs.

### 2. For each remaining candidate, pull the body

```bash
gh pr view <N> --repo slopus/happy \
  --json title,body,files,comments,reviewDecision,mergeable,additions,deletions
```

Read the body, look at `files` for the touched paths. If any path is in
the conflict-surface list above, mark SKIP unless the PR is explicitly
resolving the same concern we are.

### 3. Classify against priority buckets

| Verdict | When |
| --- | --- |
| **MERGE** | Zero-risk, small diff, fits priority 3/4, no conflict. Cherry-pick onto `feature/tablet-sidebar-toggle` (or its successor). |
| **WATCH** | Right direction but fresh (&lt; 2 days old) / has unresolved review comments / needs rebase — re-check weekly. |
| **WAIT-FOR-UPSTREAM** | Large / touches fork-conflict areas / has maintainer review activity. Let upstream land and merge it when rebasing against `main`. |
| **SKIP** | Wrong priority, duplicates our work, or incompatible approach. Record *why* in the notes so re-triage doesn't re-evaluate it from scratch. |

### 4. Cross-check with issues

Some PRs claim to fix an issue that turns out to be a symptom of a
different one. When a PR references `fixes #N`, read issue #N's latest
comments before trusting the framing. Maintainer (`ex3ndr`) comments on
issues are usually the ground truth on whether a PR is the intended
direction.

### 5. Write the shortlist

Output format (lifted from prior runs — don't reinvent):

```
### Rank N — PR #X: <title> (<+adds/-dels>, <author>)
https://github.com/slopus/happy/pull/X
- **What:** one line on what it changes.
- **Why for this fork:** priority bucket + specific fit.
- **Risk / cost:** diff size, test coverage, mergeability,
  conflict surface (name the file(s)).
- **Verdict:** MERGE / WATCH / WAIT-FOR-UPSTREAM / SKIP
```

Group by verdict at the end ("Zero-risk batch to merge now", etc.) so
the user has a clear next action.

## Golden rules

1. **Never auto-merge.** Every PR gets cherry-picked by hand so we can
   inspect the diff against our branches first. The fork has enough
   local divergence that "it merged cleanly" doesn't mean "it still
   does what the author intended".
2. **Prefer small correctness batches over feature bundles.** Three
   small fixes from three authors are easier to bisect than one
   1500-line feature PR — even when the feature is tempting.
3. **If a PR conflicts with fork work, don't rebase ours onto it.**
   Rebase theirs onto ours (via a manual cherry-pick) so our commit
   history stays linear. Upstream rebases break blame.
4. **Re-run the triage after each upstream `main` sync.** Stale verdicts
   rot fast — a WATCH PR can land upstream and flip to NOT-NEEDED, or
   get superseded.

## Reference: recent use of this skill

The first full triage pass on 2026-04-22 produced the ranking
consolidated into an executable plan at
`docs/plans/upstream-merge-batch-2026-04-22.md` (cross-referenced from
`docs/fork-roadmap.md` → "Near-term → Upcoming — Upstream merge batch").
Key outputs from that pass, kept here so the next run has a starting
benchmark:

- Zero-risk MERGE batch: #1145, #1061, #633, #1101, #1049, #1157
- CLI correctness batch: #699, #692, #690, #1116
- Opportunistic: #1094, #862
- Known SKIP-due-to-conflict: #316, #1108, #823, #990
- Known WATCH-too-large: #1151, #1081, #1152, #1078

Re-check these next pass — some will have moved.

## Related

- `docs/fork-roadmap.md` — deferred fork work, upstream-PR candidates.
- `docs/fork-notes.md` — the canonical "why we diverged here" doc.
- `.agents/skills/happy-probe-claude-sdk/SKILL.md` — sibling skill,
  often run before triage to verify whether a "it's broken" PR is
  actually fixing the right layer.
