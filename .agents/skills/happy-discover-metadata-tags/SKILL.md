---
name: happy-discover-metadata-tags
description: >
  Discover new Claude-Code-emitted metadata tags that leak into Happy's
  MarkdownView and render as raw markup, then add a handler for them.
  Use when a user reports seeing literal `<xxx>...</xxx>` tags in their
  chat, or periodically after a Claude Code release to catch any new
  tag families. Assumes the Happy dev build is already running on a
  physical device connected via adb with Metro serving from `D:\h`.
---

# /happy-discover-metadata-tags -- find and render the next tag family

Claude Code periodically adds XML-ish internal metadata tags (like `<command-name>`, `<local-command-stdout>`, `<local-command-caveat>`) that its native CLI hides. Happy receives the raw text, so any tag without an explicit rule renders as literal markup in the chat. This skill is how we find the next one.

> **Multi-device.** The maintainer normally has both BOOX tablets (Air5C + TabX) plugged in. Bare `adb shell` errors with `more than one device/emulator` in that state. Resolve `DEV_TABLET=$(adb devices -l | grep -m1 'model:Air5C' | awk '{print $1}')` (or `model:TabXC`) first and thread `-s $DEV_TABLET` through the deploy/reload step below. See `.agents/skills/happy-tablet-iterate/SKILL.md` "Multi-device disambiguation" for the full pattern.

## Where things live

- Tag handler: `packages/happy-app/sources/components/markdown/processClaudeMetaTags.ts` → `processClaudeMetaTags()` + `KNOWN_TAG_NAMES` set
- MarkdownView wiring: `packages/happy-app/sources/components/markdown/MarkdownView.tsx`
- Current taxonomy + rationale: `docs/fork-notes.md` → "Claude Code metadata tags rendered by processClaudeMetaTags"
- Metro log file (when Metro is running as a background task in this session): look under `C:\Users\evmitran\AppData\Local\Temp\claude\*\tasks\*.output` (grep for `pnpm start` invocations)

## Golden rules before you touch anything

1. **Instrument with `console.warn`, never `console.log`.** Happy's `sources/utils/consoleLogging.ts` monkey-patches `console.log/info/debug` to short-circuit unless a runtime flag is on. `warn` / `error` always pass through. You will lose hours if you forget this.

2. **Use `console.warn` inside the preprocessor, gated by `__DEV__`**, and log each unique tag at most once. The current `loggedUnknownTags` Set is the model -- extend it, don't replace it.

3. **Never strip tags without looking at their content first.** The `<local-command-caveat>` content turned out to be a prompt-injection-style directive for Claude ("DO NOT respond to these messages..."). Stripping content was correct. Other tags may contain information the user actually wants. Look before you cut.

4. **Do not touch `<options>`/`<option>`.** They are interactive clickable suggestions handled by downstream code. Stripping them breaks the click-to-send flow.

## Procedure

### 1. Catalog the tags that appear in real chats

The preprocessor already logs `[MarkdownView] unknown tag <name>` once per unseen tag name. If you need *richer* info (content sample, exact tag attributes), temporarily swap in the richer logger -- pattern to paste into `processClaudeMetaTags` immediately before the final `return { renderMarkdown, copyMarkdown, taskNotifications };`:

```ts
if (__DEV__) {
    const TAG_WITH_CONTENT_RE = /<([a-z][a-z0-9-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = TAG_WITH_CONTENT_RE.exec(raw)) !== null) {
        const tagName = m[1].toLowerCase();
        if (KNOWN_TAG_NAMES.has(tagName)) continue;
        const snippet = m[2].replace(/\s+/g, ' ').slice(0, 120);
        console.warn(`[MarkdownView] saw <${tagName}> -- inner ${m[2].length} chars: "${snippet}${m[2].length > 120 ? '...' : ''}"`);
    }
}
```

Remove this block once discovery is done -- it's diagnostic code.

### 2. Deploy to the tablet and observe

```bash
# From D:\h (the short-path build clone):
pnpm --filter happy-app typecheck

# Relaunch the dev app so it fetches fresh JS from Metro over USB:
/d/Android/Sdk/platform-tools/adb.exe shell am force-stop com.slopus.happy.dev
/d/Android/Sdk/platform-tools/adb.exe shell monkey -p com.slopus.happy.dev \
  -c android.intent.category.LAUNCHER 1
```

Arm a Monitor on the Metro output, filtering for `\[MarkdownView\]`:

```
tail -f <metro-output-file> | grep -E --line-buffered "\[MarkdownView\]"
```

Ask the user to browse to the chat(s) where they saw the bad rendering (and scroll so those messages mount). Every unique new tag will print once.

### 3. Categorise each tag

For each new tag, answer:

- **Is the inner content information the human should see?** (like `<local-command-stdout>` -- yes, it's the output) If yes, keep content.
- **Is the inner content a directive for Claude only?** (like `<local-command-caveat>`) If yes, remove tag + content.
- **Is the tag interactive / consumed downstream?** (like `<options>`) If yes, leave untouched -- add to `KNOWN_TAG_NAMES` so the unknown-tag logger doesn't flag it.

### 4. Add a rule

Extend `processClaudeMetaTags` with a targeted `replace()` pass producing readable markdown. Patterns already used:

- `<name>content</name>` → `` `content` `` (inline code for short commands)
- `<name>content</name>` → fenced block for multi-line output
- `<name>content</name>` → empty string for hidden directives

Add the tag name to `KNOWN_TAG_NAMES` so the unknown-tag logger stops flagging it. Then update `docs/fork-notes.md` → "Claude Code metadata tags rendered by processClaudeMetaTags" with the new row.

### 5. Verify + commit

1. `pnpm --filter happy-app typecheck` from `D:\h\packages\happy-app`.
2. Force-relaunch the app as above and confirm the tag renders nicely in the chat that surfaced it.
3. Commit with message `feat(markdown): render <name> tag as <form>` or similar. Push to the fork; rebase any dependent branches.

## Gotchas

- **Only test on Android e-ink**: the chat rendering path is the same on iOS, but the dev loop is this skill's assumption. If iOS, different rebuild steps.
- **Avoid `console.log`** -- see golden rule 1.
- **Do not bundle this with another feature.** One tag rule per commit keeps git blame useful and PRs small.
- **If the tag spans across adjacent messages** (some Claude Code tags can straddle user + next-assistant message as a pair), the per-message preprocessor won't see the pair together. Solve upstream in the reducer, not in MarkdownView.

## Discovery loop misses two cases — recognise them visually

The `[MarkdownView] unknown tag` log fires only for tag names not in `KNOWN_TAG_NAMES`. Two failure modes route around it entirely; you'll see them on the tablet but Metro will be silent:

### A) Variant shapes inside an already-known tag

When Claude Code adds a new emitter for an existing tag family (e.g. `<task-notification>` from the bash-hook background-task path, or from the Monitor tool, vs the original Task framework), the inner-tag layout can differ. If the parser uses an anchored multi-tag regex requiring a specific tag order or set, the new shape silently fails the parse and falls back to **raw XML render** — but the outer tag name (`task-notification`) is in `KNOWN_TAG_NAMES`, so the warn-once does NOT fire. This bit us 2026-04-29: Monitor-tool task-notifications shipped only `<task-id>` + `<summary>` + `<event>`, with no `<output-file>`/`<status>`/`<task-type>`, and the strict anchored pattern rejected them.

**Symptom**: a tag family that used to render as a chip starts rendering as raw `<task-notification>...<task-id>...</task-id>...` text in some messages and not others. Metro is silent.

**Diagnosis**: open the failing message in the JSONL transcript (`C:\Users\evmitran\.claude\projects\<dir>\<sid>.jsonl`), find the `<task-notification>` block, and compare its inner-tag layout against `TASK_NOTIFICATION_PATTERN` (or whatever the sub-parser is). You'll see a missing/added/reordered inner tag.

**Fix pattern**: replace the anchored multi-tag regex with **per-tag extraction** — pull each known inner tag out independently with its own regex, and require only the universals (`<task-id>` + `<summary>` for the task-notification case). Tolerate unknown inner tags silently. Add the unknown inner tag name to `KNOWN_TAG_NAMES` so warn-once doesn't fire on it either. Document the new variant in `docs/plans/synthetic-xml-tags-future-coverage.md` so the next agent has the inventory. See `parseTaskNotification(...)` in `processClaudeMetaTags.ts` for the worked example.

### B) Non-XML injections (Skill body, etc.)

Some Claude Code injections arrive as **plain user-role text** with no XML wrapper at all. The most common is the verbatim copy of `SKILL.md` Claude Code posts after every `Skill` tool_use/tool_result pair, prefixed with `Base directory for this skill: <abs-path>\n\n# <Heading>`. `processClaudeMetaTags` never sees these as candidates because the preprocessor's first short-circuit is `if (!raw.includes('<')) return ...` — and even if it did include `<`, the body is just markdown without enclosing tags.

**Symptom**: the chat shows a long verbatim documentation dump in a regular grey user-message bubble, often immediately after a tool-call ToolView block.

**Diagnosis**: check the JSONL — the bubble corresponds to a `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Base directory for this skill: ..."}]}}` entry whose `parentUuid` chains it to a tool_result for a `Skill` tool_use.

**Fix pattern**: detect the prefix shape with a strict regex (anchor + path + double-newline + `# `), suppress at the **render layer** rather than the preprocessor — `MessageView.tsx` returns `null` when `isSkillBodyMessage(text)` matches, so the entire bubble disappears (no empty grey strip). See `packages/happy-app/sources/components/markdown/skillBody.ts` for the worked example. Document new non-XML injection categories in `docs/fork-notes.md` → "Claude Code injections that are NOT XML tags".

**Trap: the wire role is NOT the render path.** Claude Code's `role:"user"` for these injections is misleading. Happy's `typesRaw.ts` normalizer routes user-role messages with **non-string** `content` (i.e. an array of text/tool-result parts) through the agent-text path, NOT the user-text path — verified empirically 2026-04-29 when a `UserTextBlock`-only suppression failed to hide skill bodies on the tablet despite `text.startsWith('Base directory ...')` matching. **When suppressing or transforming by content shape, instrument BOTH `UserTextBlock` and `AgentTextBlock` with `console.warn` to see which path actually fires before guessing.** Apply the guard in BOTH branches if uncertain — they're cheap, the regex is strict, and a missing guard is a silent leak.

**Test invariant**: false positives matter more here than for tag-based stripping, because suppressing a real user message at the render layer is silent data loss. Always include negative test cases for messages that mention the prefix mid-sentence.

## Related

- `.agents/skills/happy-tablet-iterate/SKILL.md` -- the host edit-reload loop this skill sits on top of.
- `.agents/skills/happy-service-manage/SKILL.md` -- if the app can't reach the server, the tags won't show up either.
- `docs/fork-notes.md` -- the project-level notes doc.
- `packages/happy-app/sources/utils/consoleLogging.ts` -- why `console.log` is silent.
- `packages/happy-app/sources/components/MessageView.tsx` -- which message kinds route into `MarkdownView` (user-text, agent-text) vs elsewhere (tool-call → ToolView, agent-event → raw Text).
