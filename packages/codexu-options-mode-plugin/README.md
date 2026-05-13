# codexu options-mode plugin

Codex port of the upstream options-mode plugin. It enforces a deterministic post-turn protocol through Codex hooks: active turns must end with an AskUserQuestion function call or an accepted `<options-mode>...</options-mode>` tag.

## Install

From the codexu repo root:

```bash
pnpm install
pnpm --filter '{packages/codexu-options-mode-plugin}' typecheck
pnpm --filter '{packages/codexu-options-mode-plugin}' test
node packages/codexu-options-mode-plugin/scripts/smoke.mjs
codex plugin marketplace add ./packages/codexu-options-mode-plugin
codex debug prompt-input "list skills" | jq -r '.. | strings? // empty' | grep 'codexu-options-mode-plugin:options-mode'
```

Use the `./packages/...` form for local marketplace registration. In this Codex build, `packages/...` without the leading `./` is parsed as a GitHub slug.

If `codex debug prompt-input` does not enumerate local marketplace plugin skills in a noninteractive shell, use the static fallback while debugging installation:

```bash
test -f packages/codexu-options-mode-plugin/skills/options-mode/SKILL.md
grep -n '^name: options-mode' packages/codexu-options-mode-plugin/skills/options-mode/SKILL.md
```

Human-driven end-to-end check:

```text
codex plugin marketplace add ./packages/codexu-options-mode-plugin
codex
/options-mode on
Ask the agent to end a turn with plain prose and no options-mode tag.
Observe the continuation prompt with the Stop-hook block reason.
/options-mode off
Ask the agent to retry plain prose.
Observe pass-through with no continuation prompt.
```

## Modes

| Mode | Plain prose with no tag | `<options-mode>no-question</options-mode>` | Background tags | `<options-mode>task-complete</options-mode>` | AskUserQuestion call |
|---|---|---|---|---|---|
| `off` | pass | pass | pass | pass | pass |
| `on` | block | pass | pass | block | pass |
| `strict` | block | block | pass | block | pass |
| `auto` | block | block | pass | pass | pass |

Toggle forms:

```text
/options-mode on
/options-mode off
/options-mode strict
/options-mode auto
/options-mode status
/options-mode default on|off|strict|auto|clear|status
```

The discoverability skill at `/codexu-options-mode-plugin:options-mode` documents the same commands, but the toggle itself is the bare `/options-mode <args>` text. Codex's TUI falls through unknown slash text to UserPromptSubmit, and this plugin handles it there.

## Known Gaps

- Statusline shell scripts are copied under `apps/statusline/` for forward compatibility only. They are not wired to the manifest because Codex does not currently expose a plugin statusline slot.
- PreToolUse AskUserQuestion auto-intercept is deferred. Codex's current `request_user_input` handler has no `pre_tool_use_payload()` override, so the plugin does not register a PreToolUse hook.
- Auto mode still enforces the final state in Stop: bare prose blocks, trailing `request_user_input` or `ask_user_question` function calls pass, and `<options-mode>task-complete</options-mode>` signals clean completion.

## Developer Workflow

Codex can cache installed marketplace plugins under `~/.codex/plugins/cache/codexu-options-mode/codexu-options-mode-plugin/<version>/`. Edits to `packages/codexu-options-mode-plugin/` do not update an existing cached copy. Delete that cached version directory and re-add the marketplace to pick up source edits:

```bash
rm -rf ~/.codex/plugins/cache/codexu-options-mode/codexu-options-mode-plugin/0.1.0
codex plugin marketplace add ./packages/codexu-options-mode-plugin
```

Local marketplace registration in the current dev build uses `source_type = "local"` and may read the source directory directly instead of creating a cache entry. The delete-and-re-add step is still the safe workflow when debugging a stale install.

## Troubleshooting

- `PLUGIN_DATA is required for options-mode config`: hooks must be run by Codex plugin discovery, or tests must set `PLUGIN_DATA` explicitly. The plugin fails loud when this env var is missing.
- Hook files not found: verify `packages/codexu-options-mode-plugin/hooks/hooks.json` still uses `node ${CLAUDE_PLUGIN_ROOT}/hooks/<hook>.js` and `.codex-plugin/plugin.json` points at `./hooks/hooks.json`.
- `/options-mode` appears as normal text: confirm the plugin is registered with `codex plugin marketplace add ./packages/codexu-options-mode-plugin` and inspect `codex debug prompt-input` for `/codexu-options-mode-plugin:options-mode`.
- Stop hook never blocks: run `node packages/codexu-options-mode-plugin/scripts/smoke.mjs`; if it passes, the hook logic is working and the issue is plugin discovery or hook registration.
