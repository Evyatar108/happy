# AGENTS.md (fork-level)

> Fork-specific guidance for AI agents working in this repo. Per-package guidance lives in `packages/happy-app/CLAUDE.md`, `packages/happy-server/CLAUDE.md`, etc. (mostly upstream). This file covers what's different about the fork.
>
> Filed as `AGENTS.md` rather than `CLAUDE.md` because the upstream repo's `.gitignore` excludes root-level `CLAUDE.md` (treated as per-developer personal context). Modern agent tooling (Claude Code, Cursor, Aider) auto-loads `AGENTS.md` in addition to `CLAUDE.md` files.

## Fork context

- **Fork:** [Evyatar108/happy](https://github.com/Evyatar108/happy). Remote name: `fork`. Upstream (slopus/happy) is `origin`.
- **Primary target device:** Android e-ink tablet. Every UX / perf decision is evaluated against that constraint first (weak CPU/GPU, no real compositor, hates smooth-scroll / continuous repaints). Opt-in features get a toggle that defaults `false` so non-e-ink users aren't affected.
- **Active branches:** `main` (mirrors `fork/main`, ahead of upstream by N), `feature/tablet-sidebar-toggle` (historical sidebar work, not for upstream), `fix/chat-list-perf-inverted-flatlist` (shipped upstream as PR #1154).
- **Server:** own happy-server runs locally on `localhost:3005`, exposed as `https://happy.evyatar.dev` via a named Cloudflare Tunnel.

Full fork context, branches, build workflow, and "things that bit us" catalogue are in **`docs/fork-notes.md`** — read that before touching any fork-local setup.

## Entry points

| Topic | File |
|---|---|
| Backlog + follow-ups + shipped log | `docs/fork-roadmap.md` |
| Setup, branches, build workflow, known debt, decision log | `docs/fork-notes.md` |
| Windows Services setup for happy-server + cloudflared | `scripts/fork-setup/setup-services.ps1` |
| Day-to-day service ops (restart, logs, failure modes) | `.agents/skills/happy-service-manage/SKILL.md` |
| JS-only edit-reload loop on the tablet | `.agents/skills/happy-tablet-iterate/SKILL.md` |
| Claude Code metadata-tag discovery for `MarkdownView` | `.agents/skills/happy-discover-metadata-tags/SKILL.md` |

## Working preferences (learned from real sessions)

**Prefer automated scripts over manual checklists.** When a setup task has 5+ steps or needs elevation, create an idempotent script (e.g. `scripts/fork-setup/setup-services.ps1`) rather than pasting commands one-by-one into a chat. The user will ask for a script if you don't offer one first.

**Just do ops work.** Installing a missing CLI tool (winget), killing a stuck process (taskkill), probing a port (curl), rebasing a feature branch — these are low-risk, reversible, and the user expects you to drive them. No need to ask permission for each step. Ask before:

- Pushing to remotes (`git push`).
- Anything visible to others (GitHub issues/PRs, messages).
- Destructive operations (force-push to main, delete branches, `rm -rf` outside worktree).

**Match the task's risk profile.** Local experiments, typechecks, editing worktree files → just do it. Irreversible or externally-visible actions → confirm.

**Keep documentation close to the code, not in user-global memory.** This fork's setup (stable tunnel URL, services, build tricks) lives in `docs/fork-notes.md` and `.agents/skills/` — versioned, portable across machines, discoverable to any agent without needing prior session context.

## Windows-specific cautions

The dev box runs Windows 11 + Git Bash + PowerShell 5.1 (default admin Terminal). A few consistent landmines (expanded details in `docs/fork-notes.md` → "Things that bit us that aren't obvious"):

- **MAX_PATH (260 chars)** blows up Android Gradle builds if the repo lives at a deep path. Primary clone lives at `D:\harness-efforts\happy`; short-path build clone at `D:\h` is used for anything that invokes Gradle. pnpm resolves symlinks, so `subst` / junctions don't help.
- **PowerShell 5.1 file encoding.** Default admin Terminal reads `.ps1` files as CP-1252 (ANSI) without a BOM. Keep scripts ASCII-only (em-dashes, curly quotes break the tokenizer), or save with a UTF-8 BOM.
- **`sc.exe config binPath=`** with embedded quotes is mangled by PS 5.1's native-command argument passing. Use nssm (recommended) or `Set-Service -BinaryPathName` on PS 7+.
- **LocalSystem profile.** Windows services don't read from `~/.cloudflared/` — they read from `C:\Windows\System32\config\systemprofile\.cloudflared\`. Config updates need an explicit copy step (scripted in `scripts/fork-setup/setup-services.ps1`).
- **MSYS path conversion.** Git Bash converts forward-slash paths to Windows paths when invoking native commands, which can mangle git refs containing `/` (e.g. `feature/tablet-sidebar-toggle:file`). Set `MSYS_NO_PATHCONV=1` when this matters.

## Ralph-orchestration workflows

The 2026-04-22 PR-A..PR-D batch was built end-to-end via `/plan-with-ralph` + `/implement-with-ralph --autonomous`. Artifacts under `.ralph/jobs/chat-text-ux-eink/` (plan, stories outline, research briefs, review findings, commit log).

Prereq for these workflows: `jq` installed (`winget install jqlang.jq`). Without it, `ralph.sh` and `review-loop.sh` fail at startup.

If you're planning another feature and the decomposition is non-trivial, `/plan-with-ralph` is available. If you're just fixing a bug or doing a small refactor, skip the ceremony.

## Upstream cherry-picking discipline

Everything on `main` targets upstream eventually. Keep PRs self-contained (don't bundle unrelated work). Flag i18n additions explicitly in commit messages if they're English-only so the upstream reviewer can assign translation work. `feature/tablet-sidebar-toggle` is the holding area for work that's explicitly NOT for upstream (fork-only UX conveniences with i18n debt).

## Typed context boundaries

Lifecycle boundaries (`/clear`, `/compact`, autocompact, plan-mode enter/exit, and `/resume` forks) are represented by the shared `@slopus/happy-wire` `context-boundary` session event. CLI producers must use `ApiSessionClient.sendContextBoundary()`, which dual-emits the typed envelope first and a legacy compatibility event second with `meta.contextBoundaryFallback: true`, while also updating encrypted `metadata.latestBoundary` for cold starts.

App consumers treat the typed event as authoritative, suppress any legacy fallback carrying `meta.contextBoundaryFallback === true`, render loaded boundary rows through `BoundaryDivider`, and use the metadata side channel only for out-of-window pagination and cross-device advisory state. Keep all boundary UI static for the e-ink tablet target.
