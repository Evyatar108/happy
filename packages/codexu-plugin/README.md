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

## See also

- `plans/codexu-roadmap.md` — Phase 1c spec and silent-skip caveats.
- `~/.codex/AGENTS.md` — per-user defaults; lives outside this plugin
  per manifest discovery rules.
