---
name: happy-probe-claude-sdk
description: >
  Introspect what Claude Code's SDK actually emits to happy-cli — the
  `system/init` message (slash_commands, tools, skills, agents, plugins)
  and the canonical command registry bundled inside `cli.js`. Use when a
  user reports "happy doesn't see X" (slash command, skill, plugin, tool)
  and you need ground truth before blaming happy's filters, or as a
  periodic sanity check after a Claude Code version bump to catch new
  emitted fields. The Claude Code SDK and happy's understanding of it
  drift every release; this skill is how we close that gap without
  guessing.
---

# /happy-probe-claude-sdk — ground truth for the happy ↔ Claude Code boundary

Happy receives whatever the Claude Code SDK decides to emit — no more, no
less. When something is missing in the mobile UI, the first question is
always: "did the SDK even send it?" This skill answers that in two
minutes instead of bisecting happy's pipeline by hand.

## Version drift

**Updated 2026-04-22** — CLI forwarding widened + picker blocklist flipped. See fork-notes.md "What's on main after the 2026-04-22 native & installed skills merge."

## Where things live

- Happy-cli forwarding point:
  `packages/happy-cli/src/claude/claudeRemote.ts` → the `systemInit`
  handler around line 180–200. As of the 2026-04-22 native-skills merge,
  forwards the full set: `tools`, `slash_commands`, `skills`, `agents`,
  `plugins`, `outputStyle`, `mcpServers`. If a field missing from the
  app's `Session.metadata` is listed here, the drop happened downstream
  (schema `safeParse`, not the CLI).
- Metadata schema (what happy-app stores):
  `packages/happy-app/sources/sync/storageTypes.ts` → `MetadataSchema`
  has optional zod fields matching the full forwarded set. Anything
  extra the CLI sends is silently dropped by `safeParse` at
  `sources/sync/encryption/sessionEncryption.ts`.
- Slash-command filter (happy-app):
  `packages/happy-app/sources/sync/suggestionCommands.ts` → as of the
  2026-04-22 merge, this is a **classification-based allowlist**, not
  the old `IGNORED_COMMANDS` blocklist. Every candidate is tagged via
  `CommandItem.source: 'native-prompt' | 'native-local' | 'skill' | 'plugin' | 'app-synthetic'`.
  Classification order:
  1. Name contains `:` and the prefix matches a `metadata.plugins[].name` → `plugin`
  2. Name is in `metadata.skills` → `skill`
  3. Name is in the hardcoded `NATIVE_PROMPT_COMMANDS` set (`init`, `review`, `security-review`, `insights`, `team-onboarding`, `commit`, `commit-push-pr`) → `native-prompt`
  4. Otherwise → `native-local`
  5. The seven synthetic TUI entries (`/plugin`, `/skills`, `/agents`, `/memory`, `/model`, `/mcp`, `/help`) are hardcoded and tagged `app-synthetic`.
  The picker shows every source; Fuse ranking + a `limit: 15` cap is
  the only filter.
- Pre-send intercept (happy-app): `sources/sync/slashCommandIntercept.ts` + `sources/hooks/usePreSendCommand.ts`. Invoked from both composer paths before `sync.sendMessage()` / `machineSpawnNewSession()`. Routes `/plugin`, `/skills`, `/agents` to `app/(app)/session/[id]/{plugins,skills,agents}.tsx`; alerts for the other four.
- Local Claude Code install on this Windows machine:
  `C:/Users/evmitran/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js`

## Technique 1 — live `system/init` capture

Captures exactly what the currently-installed Claude Code would send to
happy-cli at session start. Runs in ~15 s, no Anthropic API credits
consumed past the first assistant token.

```bash
# Scratch dir so no project config bleeds in
mkdir -p /tmp/claude-probe-$$ && cd /tmp/claude-probe-$$

# First line of stream-json output is ALWAYS the system/init message
timeout 20 claude --print --output-format stream-json --verbose \
  'respond with just the word done' 2>/dev/null | head -1 > /tmp/init.json

# Use node (not python — not installed on this box); paths are Windows-y,
# so pass the file as an argv rather than require()ing it:
node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const k of Object.keys(m)) {
    const v = m[k];
    console.log(k, ":", Array.isArray(v) ? `[${v.length}]` : typeof v);
  }
  for (const k of ["slash_commands", "skills", "agents", "tools", "plugins"]) {
    if (m[k]) {
      console.log("\\n=== " + k + " ===");
      for (const x of m[k]) console.log(" ", typeof x === "string" ? x : x.name || JSON.stringify(x));
    }
  }
' /tmp/init.json
```

Fields you'll see in the init on 2.1.111 (may grow):

- `tools` — every tool Claude can call (Bash, Read, Skill, Task, ...)
- `slash_commands` — built-in prompts + user skills + plugin-namespaced
  skills (e.g. `ralph-orchestration:plan-with-ralph`). Happy-cli now
  forwards this **and** the sibling metadata arrays.
- `skills` — user-invocable skills. Forwarded as of 2026-04-22; feeds the source classifier and the session-scoped Skills catalog screen.
- `agents` — subagents (`Explore`, `Plan`, plugin agents, ...). Forwarded; feeds the Agents catalog screen.
- `plugins` — `{name, path, source}` for each loaded plugin. Forwarded; feeds the Plugins catalog screen and the `source: 'plugin'` classification.
- `mcp_servers`, `output_style` — forwarded as `mcpServers` / `outputStyle`.
- `permissionMode`, `memory_paths`, `fast_mode_state` — still dropped today (no consumer in the app yet).

**If a skill/plugin is missing from `slash_commands`**, the problem is
almost always that `enabledPlugins` in `~/.claude/settings.json` didn't
survive the `--settings` tmpfile (see issue slopus/happy#779 and the
fork's `fix(cli): preserve enabledPlugins` commit `317fce8a`). That
commit is on `main` now; upstream PR still TBD. Run the probe once
through `happy` (which wraps claude) and once directly to compare.

## Technique 2 — canonical command registry from `cli.js`

The SDK only emits a **subset** of built-in commands (`type:"prompt"`
and some `type:"local"`). The TUI-only commands (`type:"local-jsx"`)
never appear in `slash_commands` and can't flow through happy over the
wire — but as of the 2026-04-22 merge, happy-app synthesizes seven of
them client-side (`plugin`, `skills`, `agents`, `memory`, `model`,
`mcp`, `help`) so they at least appear in the picker and land somewhere
useful. Extract the full registry from the bundled cli.js to spot
additions after a version bump:

```bash
CLI_JS="/c/Users/evmitran/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js"
grep -oE 'type:"(local|local-jsx|prompt)",name:"[a-zA-Z][a-zA-Z0-9_-]*"' "$CLI_JS" \
  | sort -u
```

Categorisation rule of thumb:

| Type | Remote-safe over SDK? | Examples |
| --- | --- | --- |
| `prompt` | Yes — it's just an injected prompt. | `init, review, security-review, commit, insights, team-onboarding, commit-push-pr` |
| `local` (data/state) | Yes — pure client-side state ops. | `compact, context, cost, heapdump, recap` |
| `local` (process) | No — touches CLI process. | `exit, update, version, tui, reload-plugins` |
| `local-jsx` | No — opens React/Ink TUI. | `plugin, skills, mcp, agents, memory, model, help` |

The `prompt` row is the source of the `NATIVE_PROMPT_COMMANDS` set in
`suggestionCommands.ts`. The `local-jsx` row is the source of the
seven synthetic entries that happy-app fabricates client-side. When a
new `prompt` command appears here on a version bump, add it to
`NATIVE_PROMPT_COMMANDS`.

## Golden rules

1. **Always probe on the exact Claude Code version the user is hitting.**
   `claude --version` first; mismatches between versions regularly add
   or remove fields.
2. **Run the probe from an empty dir.** Project-level
   `.claude/settings.json` can inject commands/MCP servers that make the
   emitted list look richer than a generic user's would.
3. **Don't assume the first stream-json line is init forever.** Claude
   Code has, in the past, emitted diagnostic lines first. If `head -1`
   isn't JSON with `"subtype":"init"`, scan the first 5–10 lines.
4. **Version the findings.** When you catalogue a new field, record the
   Claude Code version next to it in `docs/fork-notes.md` so future
   agents know whether it's current. The SDK changes fast.

## Common answers this skill produces

- *"My `/plugin` command doesn't show up."* → Pre-2026-04-22: it was
  `type:"local-jsx"` and the SDK never emitted it. Post-merge: it's now
  a synthesized `app-synthetic` entry, tappable in the picker, routing
  to the session-scoped Plugins catalog screen. If it's *still* missing
  from the picker, it's a bug — check `suggestionCommands.ts` for the
  `SYNTHETIC_COMMANDS` constant.
- *"My Superpowers plugin skills disappeared after a happy upgrade."*
  → Compare the probe's `slash_commands` count inside `happy` vs.
  outside. If empty-inside / populated-outside, you are looking at the
  `enabledPlugins` clobber (#779). The fix is commit `317fce8a`, on
  `main` as of the 2026-04-22 merge.
- *"Happy shows only `/clear` and `/compact`."* → This was the
  pre-merge symptom caused by the `IGNORED_COMMANDS` blocklist. If it
  recurs post-merge, either (a) the init message was never forwarded
  (resumed session without fresh init) or (b) the classification is
  mis-tagging entries. Check `metadata.slashCommands` + the `source`
  tag in the app's storage snapshot before concluding.

## Related

- `docs/fork-notes.md` — canonical fork notes (Claude Code version
  drift, metadata tag taxonomy, etc.).
- `docs/competition/claude/message-protocol.md` — upstream doc on the
  ACP/stream-json shape.
- `.agents/skills/happy-discover-metadata-tags/SKILL.md` — sibling
  skill for the MarkdownView tag layer.
- `.ralph/jobs/native-and-installed-skills-support/` — job archive
  with plan, DSAT, and per-story artifacts for the 2026-04-22 merge
  that widened the forwarding and flipped the picker classifier.
- Upstream issue #779 (`enabledPlugins` wiped by `--settings`) — the
  motivating bug; fixed on the fork in `317fce8a`.
