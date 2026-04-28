# Autocompact Validation Spike

## Finding

Claude Code's exported SDK types expose a distinguishing compaction signal through hooks:

- `PreCompactHookInput` has `hook_event_name: 'PreCompact'` and `trigger: 'manual' | 'auto'`.
- `PostCompactHookInput` has `hook_event_name: 'PostCompact'`, `trigger: 'manual' | 'auto'`, and `compact_summary`.
- `SessionStartHookInput.source` only reports `startup | resume | clear | compact`, so it cannot distinguish manual `/compact` from automatic compaction.
- `system.init` provides tools, slash commands, skills, agents, plugins, output style, MCP server status, model, permission mode, and session id; it does not identify compaction trigger.
- The JSONL/SDK message stream includes generic status/compact-boundary surfaces, but the typed hook payload is the stable source for manual-vs-auto classification.

## Decision

Use `PostCompact trigger=auto` to emit `kind: 'autocompact'` through `ApiSessionClient.sendContextBoundary()` with `triggeredBy: 'system'`.

Manual `/compact` remains owned by the explicit slash-command path and will emit `kind: 'compact'` in US-009.
