---
name: options-mode
description: Control choice-prompt mode for the codexu Options Mode plugin.
---

# Options Mode

Use `/options-mode on`, `/options-mode off`, `/options-mode strict`, `/options-mode auto`, or `/options-mode status` to control options mode in Codex. Use `/options-mode default on|off|strict|auto|clear|status` to manage the global default stored in the plugin data directory; per-session flags still override it.

Modes:

- `on` - enforce AskUserQuestion choice prompts; allow plain prose only when the assistant appends `<options-mode>no-question</options-mode>`.
- `strict` - same enforcement, but the `no-question` tag is not a valid bypass; the only accepted post-turn states are an AskUserQuestion call or one of the two background tags `<options-mode>background-task</options-mode>` / `<options-mode>background-agent</options-mode>`.
- `auto` - builds on `strict`; the `no-question` tag is not valid. Every turn must end with an AskUserQuestion call, `<options-mode>task-complete</options-mode>`, or a background tag. Codex auto-intercept of AskUserQuestion is deferred; the Stop hook still enforces the final turn state.
- `off` - disable enforcement.

Do not map `strict` to `on` or `auto`. Do not map `auto` to `on` or `strict`. They are distinct modes with different post-turn contracts.

This skill is documentation-only. To toggle the plugin, type the bare `/options-mode <args>` slash text directly; the UserPromptSubmit hook intercepts that prompt and updates the per-session or default mode.
