# codexu-plugin

Personal codex plugin for the codexu stack. Houses private skills,
hooks, and (later) `scope = "host"` workflow helpers + AskUserQuestion-
using skills.

## Layout

```
packages/codexu-plugin/
  .codex-plugin/
    plugin.json      # codex plugin manifest (JSON, not TOML)
  skills/            # SKILL.md files; ./skills mapped via manifest
  README.md          # this file
```

## Install (per-machine)

This plugin is intended to be installed on the developer's machine via
codex's marketplace mechanism. There is no `codex plugin install
<path>` command (verified 2026-05-02 against `codex plugin --help`);
the install path is marketplace-add.

For a single personal plugin:

```sh
codex plugin marketplace add C:/harness-efforts/codexu/packages/codexu-plugin
```

A tiny `marketplace.json` stub may be required at the marketplace root
listing the plugin — see the roadmap's Phase 1c step 6 for details.

Alternatively, drop the plugin directly under
`~/.codex/plugins/codexu-plugin/.codex-plugin/plugin.json` for direct
discovery.

## Smoke test

After install, run `codex` and check that:

1. `/skills` picker lists `hello-world`.
2. `~/.codex/log/` does NOT contain `tracing::warn!` lines mentioning
   the plugin (silent-skip behaviors documented in roadmap Phase 1c).

## Discovering Claude Code skills (`.claude/skills/`) — Phase 2b recipe

Codex's plugin manifest `skills` field accepts only one path inside the
plugin root (verified against `core-plugins/src/loader.rs:678` —
`plugin_skill_roots()` returns `default_skill_roots(plugin_root)` plus
the optional manifest-specified subpath; arbitrary absolute paths are
NOT supported). To make Claude Code skills (`~/.claude/skills/<name>/SKILL.md`
and per-cwd `<repo>/.claude/skills/<name>/SKILL.md`) visible to codex,
use Windows junctions to mirror them under codex's user-skill discovery
root `~/.agents/skills/`.

### User-wide

Junction `~/.claude/skills` → `~/.agents/skills`. Any skill dropped at
either path becomes visible to codex via `~/.agents/skills/` discovery.

```powershell
mklink /J "$env:USERPROFILE\.claude\skills" "$env:USERPROFILE\.agents\skills"
```

### Per-repo skills (`<repo>/.claude/skills/<name>/`)

For each per-repo skill you want exposed to codex, junction the
individual skill dir under `~/.agents/skills/` with a namespaced name:

```powershell
mklink /J "$env:USERPROFILE\.agents\skills\codexu-agent-browser" "C:\harness-efforts\codexu\.claude\skills\agent-browser"
```

Smoke-tested on codexu repo's `.claude/skills/agent-browser` skill —
codex picks it up by frontmatter `name:`, not directory name. Claude-
specific frontmatter fields (`allowed-tools`, etc.) are silently
tolerated; no warnings in `~/.codex/log/codex-tui.log`.

Verify via:

```sh
codex debug prompt-input "test" | grep -A1 'Available skills'
```

The skill should appear in the rendered `<skills_instructions>` block
with its real file path (junction transparent).

## See also

- `plans/codexu-roadmap.md` — Phase 1c spec and silent-skip caveats;
  Phase 2b junction recipe captured above.
- `~/.codex/AGENTS.md` — per-user defaults; lives outside this plugin
  per manifest discovery rules.
